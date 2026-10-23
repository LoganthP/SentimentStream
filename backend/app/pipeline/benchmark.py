"""Module 6 — Performance analytics.

Runs the SAME ETL + aggregation workload two ways on 10K / 100K / 1M rows:

  python      plain single-threaded Python (csv + re + collections)
  spark_etl   Spark DataFrames: clean, dedupe, tokenize, aggregate
  spark_full  spark_etl + MLlib sentiment inference + trend aggregations

so the report shows where distributed processing starts to pay off (and
honestly shows Spark's start-up overhead on small inputs).
"""
import csv
import re
import time
from collections import Counter

from pyspark.sql import functions as F

from ..config import BENCH_DIR
from ..monitor import MemoryMonitor
from ..spark_session import get_spark, job_stats
from . import ingest, preprocess, sentiment, synth, trends

_URL = re.compile(r"https?://\S+|www\.\S+")
_MENTION = re.compile(r"@\w+")
_HTML = re.compile(r"<[^>]+>")
_NT = re.compile(r"n't\b")
_NONALNUM = re.compile(r"[^a-z0-9\s]")
_WS = re.compile(r"\s+")
_TAG = re.compile(r"#([a-z0-9_]+)")
STOP = set(preprocess.STOPWORDS)


def bench_file(rows: int):
    p = BENCH_DIR / f"synthetic_{rows}.csv"
    if not p.exists():
        synth.generate(p, rows=rows, seed=rows)
    return p


def python_baseline(path) -> dict:
    seen, day_counts, words, tags = set(), Counter(), Counter(), Counter()
    raw = kept = 0
    with open(path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            raw += 1
            text = (row.get("text") or "").strip()
            if len(text) <= 2:
                continue
            low = text.lower()
            c = _URL.sub(" ", low)
            c = _MENTION.sub(" ", c)
            c = _HTML.sub(" ", c)
            c = _NT.sub(" not", c)
            c = c.replace("#", " ")
            c = _NONALNUM.sub(" ", c)
            c = _WS.sub(" ", c).strip()
            if len(c) <= 2 or c in seen:
                continue
            seen.add(c)
            kept += 1
            toks = [t for t in c.split(" ") if len(t) >= 2 and t not in STOP]
            words.update(t for t in toks if len(t) > 2 and not t.isdigit())
            tags.update(set(_TAG.findall(low)))
            try:
                r = float(row.get("rating") or "nan")
                label = "negative" if r <= 2 else "neutral" if r < 4 else "positive"
            except ValueError:
                label = None
            day_counts[(row.get("timestamp", "")[:10], label)] += 1
    return {"raw_rows": raw, "clean_rows": kept, "top_word": words.most_common(1),
            "days": len({d for d, _ in day_counts})}


def spark_etl(path) -> dict:
    spark = get_spark()
    raw = ingest.read_raw(spark, path.as_uri(), "csv")
    std, _ = ingest.standardize(raw)
    df, stats = preprocess.preprocess(std)
    df, _ = preprocess.add_labels(df)
    df = df.cache()
    df.groupBy("date", "label").count().collect()
    top = (df.select(F.explode("tokens").alias("w")).filter(F.length("w") > 2)
             .groupBy("w").count().orderBy(F.desc("count")).limit(40).collect())
    df.select(F.explode("hashtags").alias("t")).groupBy("t").count().orderBy(F.desc("count")).limit(20).collect()
    parts = df.rdd.getNumPartitions()
    df.unpersist()
    return {"raw_rows": stats["raw_rows"], "clean_rows": stats["after_dedup"],
            "top_word": top[0]["w"] if top else None, "partitions": parts}


def spark_full(path, model) -> dict:
    spark = get_spark()
    raw = ingest.read_raw(spark, path.as_uri(), "csv")
    std, _ = ingest.standardize(raw)
    df, stats = preprocess.preprocess(std)
    pred = trends.add_aspects(sentiment.predict(model, df)).cache()
    trends.distribution(pred)
    trends.timeline(pred)
    trends.keywords(pred, top=40)
    trends.aspects(pred)
    pred.unpersist()
    return {"raw_rows": stats["raw_rows"], "clean_rows": stats["after_dedup"]}


def _measure(fn, *args, group=None):
    sc = get_spark().sparkContext
    if group:
        sc.setJobGroup(group, group)
    with MemoryMonitor() as mon:
        t0 = time.perf_counter()
        out = fn(*args)
        secs = time.perf_counter() - t0
    res = {"seconds": round(secs, 3), "peak_memory_mb": round(mon.peak, 1),
           "memory_delta_mb": round(mon.peak - mon.start_mb, 1), **out}
    if group:
        res.update(job_stats(group))
    return res


def run(sizes: list[int], include_python: bool, include_full: bool, model, job_id: str, progress) -> dict:
    results = []
    steps = len(sizes) * (1 + include_python + include_full) + 1
    step = 0

    def tick(msg):
        nonlocal step
        step += 1
        progress(step / steps, msg)

    # Warm-up so JVM start-up isn't charged to the first measurement
    tick("Warming up Spark")
    get_spark().range(1000).count()

    for n in sizes:
        progress(step / steps, f"Preparing {n:,}-row dataset")
        path = bench_file(n)
        entry = {"rows": n, "file_mb": round(path.stat().st_size / 1e6, 2)}
        if include_python:
            entry["python"] = _measure(python_baseline, path)
            tick(f"Python baseline on {n:,} rows: {entry['python']['seconds']}s")
        entry["spark_etl"] = _measure(spark_etl, path, group=f"{job_id}_etl_{n}")
        tick(f"Spark ETL on {n:,} rows: {entry['spark_etl']['seconds']}s")
        if include_full and model is not None:
            entry["spark_full"] = _measure(spark_full, path, model, group=f"{job_id}_full_{n}")
            tick(f"Spark full pipeline on {n:,} rows: {entry['spark_full']['seconds']}s")
        for k in ("python", "spark_etl", "spark_full"):
            if k in entry and entry[k]["seconds"] > 0:
                entry[k]["rows_per_second"] = round(n / entry[k]["seconds"])
        if "python" in entry:
            entry["speedup_vs_python"] = round(entry["python"]["seconds"] / entry["spark_etl"]["seconds"], 2)
        results.append(entry)
    return {"sizes": sizes, "results": results}
