"""Measure optimized performance on 100K and 500K rows after all fixes.

Records:
- total time
- per-stage time
- number of Spark jobs, stages and tasks
- partition count after reading

Usage:
    python -m scripts.measure_optimized
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

from app import db
from app.config import CPU_CORES, RESULTS_DIR, UPLOAD_DIR
from app.pipeline import ingest, preprocess, sentiment, synth, trends
from app.spark_session import get_spark, job_stats


def measure_analysis(csv_path: Path, label: str):
    spark = get_spark()
    job_group = f"optimized_{label}"
    spark.sparkContext.setJobGroup(job_group, f"Optimized measurement: {label}")
    timings = {}
    t_all = time.perf_counter()

    # 1. Ingest
    t = time.perf_counter()
    raw = ingest.read_raw(spark, csv_path.resolve().as_uri(), "csv")
    std, mapping = ingest.standardize(raw)
    partition_count_after_read = std.rdd.getNumPartitions()
    if partition_count_after_read < CPU_CORES:
        std = std.repartition(CPU_CORES)
    std = std.cache()
    std.count()  # force materialization
    timings["ingest"] = time.perf_counter() - t

    # 2. Preprocess
    t = time.perf_counter()
    from pyspark.sql import functions as F
    df, clean_stats = preprocess.preprocess(std)
    df, label_source = preprocess.add_labels(df)
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
    print("OPTIMIZED MEASUREMENTS")
    print("=" * 60)

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
    out = Path("data/samples/optimized_measurements.json")
    out.write_text(json.dumps(results, indent=2, default=str))
    print(f"\nResults saved to {out}")

    # Comparison summary with baseline
    base_file = Path("data/samples/baseline_measurements.json")
    if base_file.exists():
        base_results = json.loads(base_file.read_text())
        print("\n" + "=" * 80)
        print("BEFORE (BASELINE) vs AFTER (OPTIMIZED) COMPARISON")
        print("=" * 80)
        for i, label in enumerate(["100K", "500K"]):
            b = base_results[i]
            o = results[i]
            speedup = round(b["total_seconds"] / o["total_seconds"], 2)
            print(f"\n--- {label} DATASET ({b['file_mb']} MB) ---")
            print(f"{'Metric':<30} {'Baseline':>15} {'Optimized':>15} {'Improvement':>15}")
            print("-" * 75)
            print(f"{'Total Time (s)':<30} {b['total_seconds']:>14}s {o['total_seconds']:>14}s {speedup:>14}x")
            print(f"{'Throughput (rows/s)':<30} {b['rows_per_second']:>15} {o['rows_per_second']:>15} {round(o['rows_per_second']/b['rows_per_second'], 2):>14}x")
            print(f"{'Spark Partitions':<30} {b['partition_count_after_read']:>15} {o['partition_count_after_read']:>15} {'Multi-core' if o['partition_count_after_read'] > 1 else 'Single'}")
            print(f"{'Spark Jobs':<30} {b['spark_jobs']:>15} {o['spark_jobs']:>15} {round(b['spark_jobs'] - o['spark_jobs']):>10} fewer")
            print(f"{'Spark Stages':<30} {b['stages']:>15} {o['stages']:>15} {round(b['stages'] - o['stages']):>10} fewer")
            print(f"{'Spark Tasks':<30} {b['tasks']:>15} {o['tasks']:>15}")
            print("\n  Per-Stage Breakdown:")
            for st in b["stage_seconds"]:
                b_sec = b["stage_seconds"].get(st, 0)
                o_sec = o["stage_seconds"].get(st, 0)
                st_speedup = round(b_sec / o_sec, 2) if o_sec > 0 else "N/A"
                print(f"    {st:<22} {b_sec:>12.2f}s {o_sec:>12.2f}s {str(st_speedup) + 'x':>12}")


if __name__ == "__main__":
    main()
