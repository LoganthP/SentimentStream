"""Background job runner.

Jobs run one at a time on a single worker thread that shares the Spark
session; the API polls job status from SQLite.
"""
import json
import time
import traceback
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from pyspark.sql import functions as F

from . import db
from .config import (BENCH_DIR, CPU_CORES, DEFAULT_MODEL_NAME, EXPLORER_SAMPLE_LIMIT,
                     MIN_LABELED_ROWS_FOR_TRAINING, RESULTS_DIR, lake_path, storage_backend)
from .monitor import MemoryMonitor
from .pipeline import benchmark, ingest, preprocess, sentiment, synth, trends
from .spark_session import cancel_job_group, get_spark, job_stats, spark_info

executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="spark-job")
_CACHED_JOB_DF = {}


def submit(job: dict):
    fn = {"analysis": run_analysis, "benchmark": run_benchmark, "train_default": run_train_default}[job["kind"]]
    executor.submit(_wrap, fn, job["id"])
    return job


def retry(job_id: str):
    job = db.retry_job(job_id)
    if job:
        submit(job)
    return job


def cancel(job_id: str):
    cancel_job_group(job_id)
    return db.cancel_job(job_id)


def _format_error(e: Exception) -> str:
    err_str = str(e)
    if "JAVA_HOME" in err_str or "Java gateway process exited" in err_str or "No Java" in err_str:
        return "Java not found or invalid: set JAVA_HOME to Java 11, 17, or 21."
    if "getSubject is not supported" in err_str:
        return "Incompatible Java version: Spark requires Java 11, 17, or 21 (Java 23+ not supported)."
    if "HADOOP_HOME" in err_str or "winutils.exe" in err_str or "winutils" in err_str:
        return "Hadoop winutils.exe missing on Windows: install winutils and set HADOOP_HOME."
    if "OutOfMemoryError" in err_str or "java.lang.OutOfMemoryError" in err_str:
        return "Spark driver out of memory: try increasing SPARK_DRIVER_MEMORY."
    if "database is locked" in err_str:
        return "Database busy: another operation is writing to SQLite. Please retry."
    if "Python in worker has different version" in err_str or "Python worker failed to connect back" in err_str:
        return "Python worker mismatch: ensure PYSPARK_PYTHON points to the active virtualenv python executable."
    if "Could not find a text column" in err_str or "No text column found" in err_str:
        return "This file has no column that looks like text. Choose one in the dataset settings."
    if "Cancelled" in err_str or "cancelJobGroup" in err_str:
        return "Analysis was cancelled by user."
    if isinstance(e, ValueError):
        return str(e).strip().splitlines()[0]

    lines = [
        line.strip()
        for line in err_str.splitlines()
        if line.strip()
        and not line.strip().startswith("at ")
        and not line.strip().startswith("...")
        and not line.strip().startswith("Py4JJavaError:")
    ]
    if lines:
        first = lines[0]
        if first.startswith(":") and len(lines) > 1:
            first = lines[1]
        first = first.lstrip(": ")
        if len(first) > 120:
            first = first[:117] + "..."
        return f"{type(e).__name__}: {first}"
    return f"{type(e).__name__}: {str(e)[:100]}"


def _wrap(fn, job_id):
    db.update_job(job_id, status="running", started_at=db.now(), stage="Starting Spark", progress=0.01)
    try:
        get_spark().sparkContext.setJobGroup(job_id, f"SentimentStream {job_id}")
        metrics = fn(job_id)
        current = db.get_job(job_id)
        if current and current["status"] == "cancelled":
            return
        db.update_job(job_id, status="completed", progress=1.0, stage="Done",
                      finished_at=db.now(), metrics=metrics)
    except Exception as e:
        current = db.get_job(job_id)
        if current and current["status"] == "cancelled":
            return
        traceback.print_exc()
        db.update_job(job_id, status="failed", error=_format_error(e), finished_at=db.now())


def _progress(job_id):
    start_time = time.perf_counter()

    def p(frac, stage):
        current = db.get_job(job_id)
        if current and current["status"] == "cancelled":
            raise RuntimeError("Job cancelled by user")
        elapsed = round(time.perf_counter() - start_time, 1)
        # Calculate honest ETA based on progress fraction and elapsed time
        eta_sec = round((elapsed / frac) - elapsed, 1) if frac > 0.05 and frac < 0.98 else None
        eta_str = f" (~{int(eta_sec)}s left)" if eta_sec and eta_sec > 2 else ""
        stage_desc = f"{stage}{eta_str} [{int(elapsed)}s elapsed]"
        db.update_job(job_id, progress=round(min(max(frac, 0), 0.99), 3), stage=stage_desc)
    return p


def results_path(job_id: str) -> Path:
    return RESULTS_DIR / f"{job_id}.json"


# ---------------------------------------------------------------- default model
def ensure_default_model(progress=None):
    model = sentiment.load_model(DEFAULT_MODEL_NAME)
    if model is not None:
        return model, sentiment.load_metrics(DEFAULT_MODEL_NAME)
    if progress:
        progress(0.3, "Training the default classifier on 40K labeled posts")
    return train_default_model()


def train_default_model():
    spark = get_spark()
    path = synth.generate(BENCH_DIR / "training_40000.csv", rows=40_000, seed=7)
    raw = ingest.read_raw(spark, path.as_uri(), "csv")
    std, _ = ingest.standardize(raw)
    df, _ = preprocess.preprocess(std)
    df, source = preprocess.add_labels(df)
    return sentiment.train(df, DEFAULT_MODEL_NAME, f"{source} (synthetic launch dataset)")


def run_train_default(job_id):
    p = _progress(job_id)
    p(0.2, "Generating labeled training data and fitting TF-IDF + Logistic Regression")
    _, metrics = train_default_model()
    return {"model": metrics}


# ---------------------------------------------------------------- analysis
def run_analysis(job_id):
    job = db.get_job(job_id)
    params = job["params"] or {}
    ds = db.get_dataset(job["dataset_id"])
    if not ds:
        raise ValueError("Dataset no longer exists")
    p = _progress(job_id)
    spark = get_spark()
    timings = {}
    t_all = time.perf_counter()

    with MemoryMonitor() as mon:
        # 1. Ingest -> data lake (Parquet on local disk or HDFS)
        t = time.perf_counter()
        p(0.05, f"Reading {ds['filename']} with Spark")
        mapping = params.get("mapping") or ds.get("mapping")
        raw = ingest.read_raw(spark, Path(ds["path"]).as_uri(), ds["fmt"], mapping=mapping)
        std, effective_mapping = ingest.standardize(raw, mapping)
        
        # Optimize partitioning: ensure file is split across cores if read with 1 partition
        num_parts = std.rdd.getNumPartitions()
        if num_parts < CPU_CORES:
            std = std.repartition(CPU_CORES)

        raw_lake = lake_path("raw", ds["id"])
        p(0.12, f"Writing raw Parquet to the {storage_backend()} data lake")
        std.write.mode("overwrite").parquet(raw_lake)
        std = spark.read.parquet(raw_lake)
        timings["ingest"] = time.perf_counter() - t

        # 2. Preprocess
        t = time.perf_counter()
        p(0.2, "Cleaning text, removing duplicates and tokenizing")
        df, clean_stats = preprocess.preprocess(std)
        df, label_source = preprocess.add_labels(df)
        timings["preprocess"] = time.perf_counter() - t

        # Write Step 1 Progressive Results (Cleaning & Dataset Stats)
        partial_res = {
            "job_id": job_id,
            "status": "running",
            "is_partial": True,
            "is_preview": False,
            "dataset": {"id": ds["id"], "name": ds["name"], "filename": ds["filename"]},
            "column_mapping": effective_mapping,
            "cleaning": clean_stats,
            "labels": {"source": label_source, "labeled_rows": 0},
            "performance": {"total_seconds": round(time.perf_counter() - t_all, 1), "stage_seconds": timings},
            "distribution": {"counts": {"positive": 0, "neutral": 0, "negative": 0}, "percent": {"positive": 0, "neutral": 0, "negative": 0}, "avg_confidence": {}, "net_score": 0, "total": clean_stats["after_dedup"]},
            "timeline": {"granularity": None, "points": [], "start": None, "end": None},
            "aspects": [],
            "keywords": {"top": [], "by_sentiment": {}},
            "hashtags": [],
            "topics": [],
            "emerging": [],
            "anomalies": [],
        }
        results_path(job_id).write_text(json.dumps(partial_res, default=str))

        # Check for Quick Preview mode if dataset is large (> 30K rows)
        if clean_stats["after_dedup"] > 30_000:
            p(0.28, "Generating quick preview on sample")
            try:
                preview_sample_size = min(20_000, max(5_000, int(clean_stats["after_dedup"] * 0.05)))
                sample_frac = preview_sample_size / clean_stats["after_dedup"]
                sample_df = df.sample(False, sample_frac, seed=42).limit(preview_sample_size)
                default_model, _ = ensure_default_model()
                sample_pred = trends.add_aspects(sentiment.predict(default_model, sample_df)).cache()
                sample_report = trends.full_report(sample_pred)
                sample_pred.unpersist()

                partial_res.update({
                    "is_preview": True,
                    "preview_sample_size": preview_sample_size,
                    **sample_report,
                })
                results_path(job_id).write_text(json.dumps(partial_res, default=str))
            except Exception as e:
                print(f"Quick preview skipped: {e}")

        # 3. Sentiment model
        t = time.perf_counter()
        mode = params.get("model_mode", "auto")
        
        # Check labeled rows
        labeled_sample = df.filter(F.col("label").isNotNull()).take(1)
        has_labels = len(labeled_sample) > 0
        labeled_count = 0
        if has_labels:
            labeled_count = df.filter(F.col("label").isNotNull()).count()

        # In "auto" mode, default to pretrained model unless user explicitly requested "train"
        # or enabled "train_on_data" flag
        train_requested = mode == "train" or (mode == "auto" and params.get("train_on_data", False))
        can_train = has_labels and labeled_count >= MIN_LABELED_ROWS_FOR_TRAINING

        if mode == "train" and not can_train:
            raise ValueError(f"Training needs at least {MIN_LABELED_ROWS_FOR_TRAINING} labeled rows "
                             f"(found {labeled_count}). Use the pretrained model instead.")

        if can_train and train_requested:
            p(0.40, f"Training classifier on {labeled_count:,} labeled posts ({label_source})")
            model, model_metrics = sentiment.train(df, f"model_{job_id}", label_source)
            model_used = "trained on this dataset"
        else:
            p(0.40, "Using pretrained classifier")
            model, model_metrics = ensure_default_model(p)
            model_used = "pretrained default"
            if labeled_count > 0:
                ev = sentiment.evaluate(sentiment.predict(model, df.filter(F.col("label").isNotNull()).limit(5000)))
                model_metrics = {**(model_metrics or {}), "evaluation_on_this_dataset": ev}
        timings["model"] = time.perf_counter() - t

        # 4. Predict + store processed data
        t = time.perf_counter()
        p(0.55, "Classifying posts and storing processed lake data")
        pred = trends.add_aspects(sentiment.predict(model, df))
        processed = lake_path("processed", job_id)
        
        # Partition by date so date range queries prune files
        (pred.select("post_id", "text", "clean_text", "tokens", "hashtags", "aspects", "ts", "date",
                     "topic", "platform", "rating", "label", "sentiment", "confidence")
             .write.mode("overwrite").partitionBy("date").parquet(processed))
        
        pred = spark.read.parquet(processed).cache()
        _CACHED_JOB_DF[job_id] = pred
        timings["predict"] = time.perf_counter() - t

        # Progressive Result 2: Distribution & Timeline
        p(0.70, "Aggregating sentiment distribution and timeline")
        dist = trends.distribution(pred)
        tl = trends.timeline(pred)
        partial_res.update({
            "is_preview": False,
            "distribution": dist,
            "timeline": tl,
            "model": {"used": model_used, "metrics": model_metrics},
        })
        results_path(job_id).write_text(json.dumps(partial_res, default=str))

        # 5. Trend analytics
        t = time.perf_counter()
        p(0.80, "Extracting keywords, aspects and topics")
        kws = trends.keywords(pred)
        asps = trends.aspects(pred)
        asp_tl = trends.aspect_timeline(pred, tl.get("granularity"))
        tps = trends.topics(pred)
        emrg = trends.emerging_terms(pred)
        anom = trends.anomalies(tl.get("points", []))

        # Progressive Result 3: Aspects, Keywords & Topics
        partial_res.update({
            "keywords": kws,
            "aspects": asps,
            "aspect_timeline": asp_tl,
            "topics": tps,
            "emerging": emrg,
            "anomalies": anom,
        })
        results_path(job_id).write_text(json.dumps(partial_res, default=str))

        p(0.90, "Running word count analytics")
        wc = trends.mapreduce_wordcount(pred)
        timings["analytics"] = time.perf_counter() - t

        # 6. Explorer sample -> SQLite
        p(0.95, "Indexing posts for instant search")
        rows = (pred.select("post_id", F.substring("text", 1, 500).alias("text"),
                            F.date_format("ts", "yyyy-MM-dd'T'HH:mm:ss").alias("ts"), "topic",
                            "sentiment", "confidence", "rating", "hashtags", "aspects")
                    .limit(min(EXPLORER_SAMPLE_LIMIT, 10_000)).collect())
        db.insert_posts(job_id, [(r["post_id"], r["text"], r["ts"], r["topic"], r["sentiment"],
                                  float(r["confidence"]), r["rating"], json.dumps(r["hashtags"] or []),
                                  json.dumps(r["aspects"] or [])) for r in rows])
        df.unpersist()

    total = time.perf_counter() - t_all
    rows_out = dist["total"]
    performance = {
        "total_seconds": round(total, 2),
        "stage_seconds": {k: round(v, 2) for k, v in timings.items()},
        "rows_per_second": round(clean_stats["raw_rows"] / total) if total else None,
        "peak_memory_mb": round(mon.peak, 1),
        "storage_backend": storage_backend(),
        "processed_path": processed,
        **job_stats(job_id),
        "spark": spark_info(),
    }
    result = {
        "job_id": job_id,
        "status": "completed",
        "is_partial": False,
        "is_preview": False,
        "dataset": {"id": ds["id"], "name": ds["name"], "filename": ds["filename"]},
        "column_mapping": effective_mapping,
        "cleaning": clean_stats,
        "labels": {"source": label_source, "labeled_rows": labeled_count},
        "model": {"used": model_used, "metrics": model_metrics},
        "performance": performance,
        "explorer_rows": len(rows),
        "distribution": dist,
        "timeline": tl,
        "keywords": kws,
        "hashtags": trends.hashtags(pred),
        "aspects": asps,
        "aspect_timeline": asp_tl,
        "topics": tps,
        "emerging": emrg,
        "anomalies": anom,
        "mapreduce_wordcount": wc,
    }
    results_path(job_id).write_text(json.dumps(result, default=str))
    db.update_dataset(ds["id"], rows=clean_stats["raw_rows"])
    return {"rows": rows_out, "seconds": performance["total_seconds"],
            "net_score": dist["net_score"], "model_used": model_used}


# ---------------------------------------------------------------- filtered query
def filtered_analysis(job_id: str, start=None, end=None, keyword=None, sentiment_filter=None, topic=None):
    """Re-run aggregations on the processed Parquet with filters (Spark SQL)."""
    spark = get_spark()
    if job_id in _CACHED_JOB_DF:
        df = _CACHED_JOB_DF[job_id]
    else:
        df = spark.read.parquet(lake_path("processed", job_id))

    if start:
        df = df.filter(F.col("date") >= F.lit(start).cast("date"))
    if end:
        df = df.filter(F.col("date") <= F.lit(end).cast("date"))
    if keyword:
        df = df.filter(F.lower("text").contains(keyword.lower()))
    if sentiment_filter:
        df = df.filter(F.col("sentiment") == sentiment_filter)
    if topic:
        df = df.filter(F.col("topic") == topic)

    t0 = time.perf_counter()
    tl = trends.timeline(df)
    out = {
        "distribution": trends.distribution(df),
        "timeline": tl,
        "keywords": trends.keywords(df, top=30),
        "hashtags": trends.hashtags(df, top=15),
        "aspects": trends.aspects(df),
        "topics": trends.topics(df),
        "query_seconds": round(time.perf_counter() - t0, 2),
    }
    return out


# ---------------------------------------------------------------- benchmark
def run_benchmark(job_id):
    job = db.get_job(job_id)
    params = job["params"] or {}
    p = _progress(job_id)
    sizes = sorted(int(s) for s in params.get("sizes", [10_000, 100_000, 1_000_000]))
    model = None
    if params.get("include_full", True):
        model, _ = ensure_default_model(p)
    res = benchmark.run(sizes, params.get("include_python", True), params.get("include_full", True),
                        model, job_id, p)
    res["spark"] = spark_info()
    res["created_at"] = db.now()
    results_path(job_id).write_text(json.dumps(res, default=str))
    return {"sizes": sizes}
