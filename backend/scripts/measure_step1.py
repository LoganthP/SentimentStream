"""Step 1 measurement script.

Measures:
1. Extract time (from archive)
2. Ingest / read time & reader options & partition count
3. Preprocessing & Deduplication time
4. Spark accumulator on sentiment scoring to check recomputation
5. Every Spark action run during analysis
6. Aggregations time & response serialization
"""
import io
import json
import os
import shutil
import sys
import time
import zipfile
from pathlib import Path

# Ensure Java 21 on Windows
if os.name == "nt":
    jdk21 = r"C:\Program Files\Java\jdk-21"
    if Path(jdk21).exists():
        os.environ["JAVA_HOME"] = jdk21

from pyspark.sql import functions as F
from pyspark.sql.types import DoubleType

from app.config import CPU_CORES, DEFAULT_MODEL_NAME, UPLOAD_DIR, lake_path
from app.pipeline import ingest, preprocess, sentiment, trends
from app.spark_session import get_spark, job_stats

def run_measurement(limit_rows: int = None):
    spark = get_spark()
    sc = spark.sparkContext
    print("Spark initialized. Parallelism:", sc.defaultParallelism, "Master:", sc.master)
    print("Driver memory:", spark.conf.get("spark.driver.memory"))
    print("Shuffle partitions:", spark.conf.get("spark.sql.shuffle.partitions"))

    archive_path = Path(r"c:\Users\logan\Downloads\archive (2).zip")
    if not archive_path.exists():
        print("Archive not found at", archive_path)
        return

    timings = {}
    actions = []

    # 1. Extract stage
    t0 = time.perf_counter()
    extract_dir = UPLOAD_DIR / "measure_extracted"
    extract_dir.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive_path, "r") as z:
        for m in z.infolist():
            z.extract(m, extract_dir)
    timings["extract"] = time.perf_counter() - t0
    print(f"[STAGE] Extract archive: {timings['extract']:.2f}s")
    for f in extract_dir.glob("*"):
        print(f"   - {f.name}: {f.stat().st_size / 1e6:.2f} MB")

    csv_path = extract_dir / "Reviews.csv"

    # 2. Ingest / Read stage
    t0 = time.perf_counter()
    enc = ingest.detect_encoding(csv_path)
    with open(csv_path, "r", encoding=enc, errors="replace") as f:
        sample = f.read(250_000)
    delim, has_header = ingest.sniff_csv_dialect(sample)
    needs_multiline = ingest.has_quoted_newlines(csv_path)
    print(f"   Encoding: {enc}, Delimiter: {repr(delim)}, Header: {has_header}, multiLine: {needs_multiline}")

    reader = (
        spark.read.option("header", has_header)
        .option("delimiter", delim)
        .option("multiLine", needs_multiline)
        .option("escape", '"')
        .option("encoding", enc)
        .option("mode", "PERMISSIVE")
    )
    raw = reader.csv(csv_path.as_uri())
    mapping = {"text": "Text", "rating": "Score", "ts": "Time", "topic": "ProductId", "id": "Id"}
    std, effective_mapping = ingest.standardize(raw, mapping)
    if limit_rows:
        std = std.limit(limit_rows)
    parts_after_read = std.rdd.getNumPartitions()
    print(f"   Partitions after read: {parts_after_read}")
    
    # Check partition repartitioning & raw lake write
    if parts_after_read < CPU_CORES:
        std = std.repartition(CPU_CORES)
    raw_lake = lake_path("raw", "measure_test")
    std.write.mode("overwrite").parquet(raw_lake)
    actions.append(("std.write.parquet(raw_lake)", "write"))
    std = spark.read.parquet(raw_lake)
    timings["read_and_lake_raw"] = time.perf_counter() - t0
    print(f"[STAGE] Read & raw Parquet lake write: {timings['read_and_lake_raw']:.2f}s")

    # 3. Clean and Dedupe stage
    t0 = time.perf_counter()
    raw_count = std.count()
    actions.append(("std.count()", "count"))
    print(f"   Raw row count: {raw_count:,}")

    df, clean_stats = preprocess.preprocess(std)
    actions.append(("preprocess: raw_rows = df.count()", "count"))
    actions.append(("preprocess: after_dedup = out.count()", "count"))
    df, label_source = preprocess.add_labels(df)
    actions.append(("add_labels: take(1)", "take"))
    timings["clean_and_dedupe"] = time.perf_counter() - t0
    print(f"[STAGE] Clean & dedupe: {timings['clean_and_dedupe']:.2f}s (clean rows: {clean_stats['after_dedup']:,}, duplicates: {clean_stats['duplicates_removed']:,})")

    # 4. Sentiment Scoring & Accumulator test
    scoring_accumulator = sc.accumulator(0)
    print("\nSetting up Spark Accumulator to count sentiment evaluations...")

    model = sentiment.load_model(DEFAULT_MODEL_NAME)
    if model is None:
        print("Training default model...")
        from app.jobs import train_default_model
        model, _ = train_default_model()

    # Wrap predict with accumulator
    def make_tracked_predict(model, input_df):
        out = model.transform(input_df)
        labels = F.array(*[F.lit(x) for x in preprocess.LABELS])
        
        def acc_vec_max(v):
            scoring_accumulator.add(1)
            return float(max(v)) if v is not None else 0.0

        vec_max = F.udf(acc_vec_max, DoubleType())
        out = (out.withColumn("sentiment", labels[F.col("prediction").cast("int")])
                  .withColumn("confidence", vec_max(F.col("probability"))))
        return out.drop("bigrams", "terms", "tf", "features", "rawPrediction", "probability")

    t0 = time.perf_counter()
    pred_unpersisted = trends.add_aspects(make_tracked_predict(model, df))

    # Test what happens if pred is NOT written to Parquet vs when it IS written
    print("Testing accumulator before writing to Parquet...")
    print(f"   Accumulator value before any action: {scoring_accumulator.value}")

    # Write processed lake
    processed_path = lake_path("processed", "measure_test")
    (pred_unpersisted.select("post_id", "text", "clean_text", "tokens", "hashtags", "aspects", "ts", "date",
                             "topic", "platform", "rating", "label", "sentiment", "confidence")
        .write.mode("overwrite").partitionBy("date").parquet(processed_path))
    actions.append(("pred.write.parquet(processed)", "write"))
    timings["score_and_write_lake"] = time.perf_counter() - t0
    acc_after_write = scoring_accumulator.value
    print(f"[STAGE] Score & Write processed Parquet: {timings['score_and_write_lake']:.2f}s")
    print(f"   Accumulator value after writing Parquet: {acc_after_write:,} (clean rows: {clean_stats['after_dedup']:,})")

    # Read back processed Parquet
    pred = spark.read.parquet(processed_path).cache()

    # 5. Each Aggregation
    agg_timings = {}
    acc_before_aggs = scoring_accumulator.value

    t0 = time.perf_counter()
    dist = trends.distribution(pred)
    actions.append(("trends.distribution(pred): groupBy.collect()", "collect"))
    agg_timings["distribution"] = time.perf_counter() - t0

    t0 = time.perf_counter()
    tl = trends.timeline(pred)
    actions.append(("trends.timeline(pred): first()", "first"))
    actions.append(("trends.timeline(pred): groupBy.collect()", "collect"))
    agg_timings["timeline"] = time.perf_counter() - t0

    t0 = time.perf_counter()
    kws = trends.keywords(pred)
    actions.append(("trends.keywords(pred): groupBy.pivot.collect()", "collect"))
    agg_timings["keywords"] = time.perf_counter() - t0

    t0 = time.perf_counter()
    asps = trends.aspects(pred)
    actions.append(("trends.aspects(pred): groupBy.collect()", "collect"))
    agg_timings["aspects"] = time.perf_counter() - t0

    t0 = time.perf_counter()
    asp_tl = trends.aspect_timeline(pred, tl.get("granularity"))
    actions.append(("trends.aspect_timeline(pred): groupBy.collect()", "collect"))
    agg_timings["aspect_timeline"] = time.perf_counter() - t0

    t0 = time.perf_counter()
    tps = trends.topics(pred)
    actions.append(("trends.topics(pred): groupBy.collect()", "collect"))
    agg_timings["topics"] = time.perf_counter() - t0

    t0 = time.perf_counter()
    emrg = trends.emerging_terms(pred)
    actions.append(("trends.emerging_terms(pred): first()", "first"))
    actions.append(("trends.emerging_terms(pred): groupBy.collect()", "collect"))
    actions.append(("trends.emerging_terms(pred): orderBy.collect()", "collect"))
    agg_timings["emerging_terms"] = time.perf_counter() - t0

    t0 = time.perf_counter()
    wc = trends.mapreduce_wordcount(pred)
    actions.append(("trends.mapreduce_wordcount(pred): groupBy.collect()", "collect"))
    agg_timings["mapreduce_wordcount"] = time.perf_counter() - t0

    t0 = time.perf_counter()
    hts = trends.hashtags(pred)
    actions.append(("trends.hashtags(pred): groupBy.collect()", "collect"))
    agg_timings["hashtags"] = time.perf_counter() - t0

    t0 = time.perf_counter()
    explorer_rows = pred.select("post_id", F.substring("text", 1, 500).alias("text"),
                                F.date_format("ts", "yyyy-MM-dd'T'HH:mm:ss").alias("ts"), "topic",
                                "sentiment", "confidence", "rating", "hashtags", "aspects").limit(10_000).collect()
    actions.append(("explorer sample: limit(10000).collect()", "collect"))
    agg_timings["explorer_sample_collect"] = time.perf_counter() - t0

    acc_after_aggs = scoring_accumulator.value
    print(f"   Accumulator after all aggregations: {acc_after_aggs:,}")
    print(f"   Did aggregations recompute scoring? {'YES' if acc_after_aggs > acc_after_write else 'NO (Parquet read severed lineage)'}")

    # 6. Serialization
    t0 = time.perf_counter()
    result = {
        "job_id": "measure_test",
        "cleaning": clean_stats,
        "distribution": dist,
        "timeline": tl,
        "keywords": kws,
        "aspects": asps,
        "topics": tps,
        "emerging": emrg,
        "mapreduce_wordcount": wc,
        "hashtags": hts,
    }
    payload = json.dumps(result, default=str)
    timings["serialize_response"] = time.perf_counter() - t0
    print(f"[STAGE] Serialize response: {timings['serialize_response']*1000:.2f}ms (Payload size: {len(payload)/1024:.1f} KB)")

    print("\n--- Summary Timings ---")
    for k, v in timings.items():
        print(f"  {k}: {v:.2f}s")
    print("--- Aggregation Timings ---")
    for k, v in agg_timings.items():
        print(f"  {k}: {v:.2f}s")

    print("\n--- Spark Actions List ---")
    for i, (name, kind) in enumerate(actions, 1):
        print(f"  {i}. [{kind.upper()}] {name}")

    # Cleanup temp extracted files
    shutil.rmtree(extract_dir, ignore_errors=True)

if __name__ == "__main__":
    lim = int(sys.argv[1]) if len(sys.argv) > 1 else None
    run_measurement(lim)
