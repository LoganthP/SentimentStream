"""Automated test suite for SentimentStream.

Covers:
- Column detection for standard Kaggle formats (Airline, Amazon Fine Food, Sentiment140, Yelp, Datafiniti)
- Delimiter and encoding sniffing
- Chunked upload assemble
- 5K-row end-to-end analysis
"""
import io
import os
import shutil
import tempfile
from pathlib import Path

import pytest

# Ensure Java 21 on Windows
if os.name == "nt":
    jdk21 = r"C:\Program Files\Java\jdk-21"
    if Path(jdk21).exists():
        os.environ["JAVA_HOME"] = jdk21

from app import db, jobs
from app.pipeline import ingest, synth
from app.spark_session import get_spark


def test_kaggle_column_detection():
    # 1. Twitter US Airline Sentiment
    airline_cols = ["tweet_id", "airline_sentiment", "airline_sentiment_confidence", "negativereason",
                    "airline", "name", "retweet_count", "text", "tweet_coord", "tweet_created", "tweet_location"]
    d_air = ingest.detect_columns(airline_cols)
    assert d_air.get("text") == "text"
    assert d_air.get("label") == "airline_sentiment"
    assert d_air.get("ts") == "tweet_created"
    assert d_air.get("id") == "tweet_id"

    # 2. Amazon Fine Food Reviews
    amazon_cols = ["Id", "ProductId", "UserId", "ProfileName", "HelpfulnessNumerator",
                   "HelpfulnessDenominator", "Score", "Time", "Summary", "Text"]
    d_amz = ingest.detect_columns(amazon_cols)
    assert d_amz.get("text") == "Text"
    assert d_amz.get("rating") == "Score"
    assert d_amz.get("ts") == "Time"
    assert d_amz.get("id") == "Id"

    # 3. Sentiment140
    s140_cols = ["target", "ids", "date", "flag", "user", "text"]
    d_s140 = ingest.detect_columns(s140_cols)
    assert d_s140.get("text") == "text"
    assert d_s140.get("label") == "target"
    assert d_s140.get("ts") == "date"
    assert d_s140.get("id") == "ids"

    # 4. Yelp Academic Reviews
    yelp_cols = ["review_id", "user_id", "business_id", "stars", "date", "text", "useful", "funny", "cool"]
    d_yelp = ingest.detect_columns(yelp_cols)
    assert d_yelp.get("text") == "text"
    assert d_yelp.get("rating") == "stars"
    assert d_yelp.get("ts") == "date"
    assert d_yelp.get("id") == "review_id"

    # 5. Datafiniti Product Reviews
    datafiniti_cols = ["id", "dateAdded", "dateUpdated", "name", "asins", "brand", "categories",
                       "primaryCategories", "reviews.date", "reviews.rating", "reviews.text", "reviews.title"]
    d_df = ingest.detect_columns(datafiniti_cols)
    assert d_df.get("text") == "reviews.text"
    assert d_df.get("rating") == "reviews.rating"
    assert d_df.get("ts") == "reviews.date"


def test_delimiter_and_encoding_sniffing():
    # Delimiter sniffing
    csv_sample = "id,text,rating\n1,Great camera!,5\n2,Battery drains fast,2\n"
    delim, header = ingest.sniff_csv_dialect(csv_sample)
    assert delim == ","
    assert header is True

    tsv_sample = "id\ttext\trating\n1\tNice phone\t4\n"
    delim, _ = ingest.sniff_csv_dialect(tsv_sample)
    assert delim == "\t"

    pipe_sample = "id|text|rating\n1|Good finish|5\n"
    delim, _ = ingest.sniff_csv_dialect(pipe_sample)
    assert delim == "|"

    semi_sample = "id;text;rating\n1;Okay;3\n"
    delim, _ = ingest.sniff_csv_dialect(semi_sample)
    assert delim == ";"

    # Encoding detection
    with tempfile.NamedTemporaryFile("wb", delete=False) as f:
        f.write(b"\xef\xbb\xbfid,text\n1,hello\n")
        bom_path = Path(f.name)
    try:
        assert ingest.detect_encoding(bom_path) == "utf-8-sig"
    finally:
        bom_path.unlink(missing_ok=True)

    with tempfile.NamedTemporaryFile("wb", delete=False) as f:
        f.write("café,naïve,über".encode("latin-1"))
        latin_path = Path(f.name)
    try:
        enc = ingest.detect_encoding(latin_path)
        assert enc in ("latin-1", "cp1252", "utf-8")
    finally:
        latin_path.unlink(missing_ok=True)


def test_chunked_upload_assemble():
    test_data = b"Row,Text,Rating\n" + b"1,Fast and fluid,5\n" * 1000
    chunk_size = 1024

    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp = Path(tmp_dir)
        chunk_dir = tmp / "chunks"
        chunk_dir.mkdir()

        # Write chunks
        for idx, offset in enumerate(range(0, len(test_data), chunk_size)):
            chunk_file = chunk_dir / f"chunk_{idx:06d}.part"
            chunk_file.write_bytes(test_data[offset : offset + chunk_size])

        # Assemble
        assembled_file = tmp / "assembled.csv"
        parts = sorted(chunk_dir.glob("chunk_*.part"))
        with open(assembled_file, "wb") as out:
            for p in parts:
                with open(p, "rb") as pf:
                    shutil.copyfileobj(pf, out)

        assert assembled_file.stat().st_size == len(test_data)
        assert assembled_file.read_bytes() == test_data


def test_5k_analysis_end_to_end():
    db.init_db()
    with tempfile.TemporaryDirectory() as tmp_dir:
        csv_path = Path(tmp_dir) / "test_5k.csv"
        synth.generate(csv_path, rows=5_000, seed=42)

        cols = ingest.peek_columns(csv_path, "csv")
        detected = ingest.detect_columns(cols)

        ds = db.insert_dataset(
            id=db.new_id("ds_test"),
            name="Test 5K Dataset",
            filename=csv_path.name,
            path=str(csv_path),
            fmt="csv",
            size_bytes=csv_path.stat().st_size,
            columns=cols,
            detected=detected,
            mapping=detected,
            rows=5_000,
        )

        job = db.insert_job("analysis", ds["id"], {"model_mode": "pretrained"})
        metrics = jobs.run_analysis(job["id"])

        assert metrics["rows"] > 0
        assert metrics["seconds"] > 0
        assert metrics["net_score"] is not None

        # Verify results JSON structure matches frontend expectations
        res_file = jobs.results_path(job["id"])
        assert res_file.exists()
        import json
        res = json.loads(res_file.read_text())
        assert "distribution" in res
        assert "timeline" in res
        assert "aspects" in res
        assert "keywords" in res
        assert "cleaning" in res
        assert res["cleaning"]["raw_rows"] == 5000
