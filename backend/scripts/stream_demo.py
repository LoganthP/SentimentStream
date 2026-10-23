"""Phase 3 (optional): near-real-time sentiment with Spark Structured Streaming.

Watches a folder for new CSV files, classifies each post with the trained
model and prints a 5-minute windowed sentiment count to the console.

Terminal 1:  python -m scripts.stream_demo --feed data/stream_in
             (drops a small CSV of new posts every 5 seconds)
Terminal 2:  python -m scripts.stream_demo --watch data/stream_in
"""
import argparse
import time
from pathlib import Path

from pyspark.ml.feature import RegexTokenizer, StopWordsRemover
from pyspark.sql import functions as F

from app.config import DEFAULT_MODEL_NAME
from app.pipeline import ingest, preprocess, sentiment, synth
from app.spark_session import get_spark

SCHEMA = ("post_id string, timestamp string, platform string, product string, text string, "
          "rating string, hashtags string, user string")


def watch(folder: Path):
    spark = get_spark()
    model = sentiment.load_model(DEFAULT_MODEL_NAME)
    if model is None:
        raise SystemExit("Train the default model first: python -m scripts.train_model")
    folder.mkdir(parents=True, exist_ok=True)
    stream = spark.readStream.option("header", True).schema(SCHEMA).csv(folder.resolve().as_uri())
    std, _ = ingest.standardize(stream)
    df = std.filter(F.col("text").isNotNull() & (F.length("text") > 2))
    df = df.withColumn("clean_text", preprocess.clean_text_col(F.col("text")))
    df = RegexTokenizer(inputCol="clean_text", outputCol="raw_tokens", pattern=r"\s+").transform(df)
    df = StopWordsRemover(inputCol="raw_tokens", outputCol="tokens", stopWords=preprocess.STOPWORDS).transform(df)
    pred = sentiment.predict(model, df)
    counts = (pred.groupBy(F.window("ts", "1 day"), "sentiment").count().orderBy("window", "sentiment"))
    q = (counts.writeStream.outputMode("complete").format("console")
               .option("truncate", False).trigger(processingTime="5 seconds").start())
    q.awaitTermination()


def feed(folder: Path):
    folder.mkdir(parents=True, exist_ok=True)
    i = 0
    while True:
        i += 1
        tmp = folder.parent / f".batch_{i}.csv"
        synth.generate(tmp, rows=200, seed=i)
        tmp.rename(folder / f"batch_{i}.csv")  # atomic move: Spark never sees half a file
        print(f"Dropped batch_{i}.csv")
        time.sleep(5)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--watch")
    g.add_argument("--feed")
    a = ap.parse_args()
    watch(Path(a.watch)) if a.watch else feed(Path(a.feed))
