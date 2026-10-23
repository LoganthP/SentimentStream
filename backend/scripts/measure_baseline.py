"""Phase 0 — Measure current baseline performance.

Runs a full analysis on 100K and 500K rows and records:
- total time
- per-stage time
- number of Spark jobs, stages and tasks
- partition count after reading

Usage:
    python -m scripts.measure_baseline
"""
import json
import os
import sys
import time
from pathlib import Path

# Ensure we use Java 21 on Windows
if os.name == "nt":
    jdk21 = r"C:\Program Files\Java\jdk-21"
    if Path(jdk21).exists():
        os.environ["JAVA_HOME"] = jdk21

from app.config import UPLOAD_DIR, RESULTS_DIR
from app.pipeline import ingest, preprocess, sentiment, synth, trends
from app.pipeline.benchmark import bench_file
from app.spark_session import get_spark, job_stats
from app import db


def measure_analysis(csv_path: Path, label: str):
    """Run the same pipeline as run_analysis, but with detailed measurements."""
    spark = get_spark()
    job_group = f"baseline_{label}"
    spark.sparkContext.setJobGroup(job_group, f"Baseline measurement: {label}")
    timings = {}
    t_all = time.perf_counter()

    # 1. Ingest
    t = time.perf_counter()
    raw = ingest.read_raw(spark, csv_path.resolve().as_uri(), "csv")
    std, mapping = ingest.standardize(raw)
    partition_count_after_read = std.rdd.getNumPartitions()
    std = std.cache()
    std.count()  # force materialization
    timings["ingest"] = time.perf_counter() - t

    # 2. Preprocess
    t = time.perf_counter()
    from pyspark.sql import functions as F
    df, clean_stats = preprocess.preprocess(std)
    df, label_source = preprocess.add_labels(df)
    df = df.cache()
    labeled = df.filter(F.col("label").isNotNull()).count()
    timings["preprocess"] = time.perf_counter() - t

    # 3. Model (use pretrained)
    t = time.perf_counter()
    model = sentiment.load_model("default_lr")
    if model is None:
        print("  Training default model (first run)...")
        from app.jobs import train_default_model
        model, _ = train_default_model()
    model_metrics = sentiment.load_metrics("default_lr")
    timings["model"] = time.perf_counter() - t

    # 4. Predict
    t = time.perf_counter()
    pred = trends.add_aspects(sentiment.predict(model, df))
    pred = pred.cache()
    pred.count()  # force
    timings["predict"] = time.perf_counter() - t

    # 5. Analytics
    t = time.perf_counter()
    report = trends.full_report(pred)

    t2 = time.perf_counter()
    report["mapreduce_wordcount"] = trends.mapreduce_wordcount(pred)
    timings["analytics"] = time.perf_counter() - t
    timings["mapreduce_wordcount"] = time.perf_counter() - t2

    total = time.perf_counter() - t_all
    stats = job_stats(job_group)

    # Cleanup
    pred.unpersist()
    df.unpersist()
    std.unpersist()

    result = {
        "label": label,
        "rows": clean_stats["raw_rows"],
        "file_mb": round(csv_path.stat().st_size / 1e6, 2),
        "total_seconds": round(total, 2),
        "stage_seconds": {k: round(v, 2) for k, v in timings.items()},
        "rows_per_second": round(clean_stats["raw_rows"] / total),
        "partition_count_after_read": partition_count_after_read,
        "cleaning": clean_stats,
        **stats,
    }
    return result


def main():
    print("=" * 60)
    print("PHASE 0: BASELINE MEASUREMENTS")
    print("=" * 60)

    # Ensure samples exist
    samples = {
        "100K": Path("data/samples/nova_100k.csv"),
        "500K": Path("data/samples/nova_500k.csv"),
    }
    for label, path in samples.items():
        if not path.exists():
            rows = int(label.replace("K", "000"))
            print(f"Generating {label} sample...")
            synth.generate(path, rows=rows, seed=rows)
    
    spark = get_spark()
    print(f"Spark version: {spark.version}")
    print(f"Master: {spark.sparkContext.master}")
    print(f"Default parallelism: {spark.sparkContext.defaultParallelism}")
    print(f"Shuffle partitions: {spark.conf.get('spark.sql.shuffle.partitions')}")
    print(f"Driver memory: {spark.conf.get('spark.driver.memory')}")
    print()

    results = []
    for label, path in samples.items():
        print(f"\n--- Measuring {label} ({path}, {path.stat().st_size / 1e6:.1f} MB) ---")
        r = measure_analysis(path, label)
        results.append(r)
        print(f"  Total: {r['total_seconds']}s")
        print(f"  Stages: {json.dumps(r['stage_seconds'], indent=4)}")
        print(f"  Spark jobs: {r['spark_jobs']}, stages: {r['stages']}, tasks: {r['tasks']}")
        print(f"  Partitions after read: {r['partition_count_after_read']}")
        print(f"  Rows/s: {r['rows_per_second']}")

    # Save results
    out = Path("data/samples/baseline_measurements.json")
    out.write_text(json.dumps(results, indent=2, default=str))
    print(f"\nResults saved to {out}")

    # Print summary table
    print("\n" + "=" * 80)
    print("BASELINE SUMMARY")
    print("=" * 80)
    print(f"{'Metric':<30} {'100K':>15} {'500K':>15}")
    print("-" * 60)
    for key in ["total_seconds", "rows_per_second", "partition_count_after_read", "spark_jobs", "stages", "tasks"]:
        vals = [str(r.get(key, "?")) for r in results]
        print(f"{key:<30} {vals[0]:>15} {vals[1]:>15}")
    print()
    for stage in results[0]["stage_seconds"]:
        vals = [str(r["stage_seconds"].get(stage, "?")) for r in results]
        print(f"  stage: {stage:<21} {vals[0]:>15}s {vals[1]:>15}s")


if __name__ == "__main__":
    main()
