"""Module 1 — Data collection, sniffing & ingestion.

Reads CSV / TSV / TXT / JSON / JSON-lines / Parquet / Excel (.xlsx) / Compressed (.gz, .bz2) / Archives (.zip, .tar.gz)
and maps whatever column names the dataset uses onto one standard schema:

    post_id | text | ts | rating | label_raw | topic | hashtags_raw | platform
"""
import csv
import gzip
import io
import json
import os
import re
import shutil
import tarfile
import zipfile
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import url2pathname

from pyspark.sql import DataFrame, SparkSession
from pyspark.sql import functions as F

CANDIDATES = {
    "text": [
        "text", "review", "review_text", "reviewtext", "reviews.text", "reviews_text", "review_body", "comment", "content",
        "body", "tweet", "post", "message", "sentence", "selftext", "summary", "description",
        "clean_text", "full_text"
    ],
    "ts": [
        "timestamp", "created_at", "date", "datetime", "time", "unixreviewtime",
        "posted_at", "review_date", "reviews.date", "reviews_date", "created_utc", "tweet_created", "tweet_created_at"
    ],
    "rating": ["rating", "overall", "stars", "star_rating", "score", "review_score", "reviews.rating", "reviews_rating"],
    "label": ["sentiment", "label", "polarity", "target", "class", "airline_sentiment"],
    "topic": [
        "topic", "product", "product_name", "product_id", "asin", "parent_asin",
        "category", "brand", "subreddit", "title", "airline"
    ],
    "hashtags": ["hashtags", "tags", "hashtag"],
    "id": ["post_id", "id", "ids", "review_id", "tweet_id", "comment_id", "item_id"],
    "platform": ["platform", "source", "channel"],
}

SUPPORTED_DATA_EXTS = {
    ".csv", ".tsv", ".txt", ".json", ".jsonl", ".ndjson", ".parquet", ".xlsx", ".gz", ".bz2"
}
SUPPORTED_ARCHIVE_EXTS = {".zip", ".tar.gz", ".tgz", ".tar.bz2", ".tar"}


# --- Encoding & Delimiter Sniffing -------------------------------------------

def detect_encoding(path: Path) -> str:
    """Detect text encoding trying utf-8, utf-8-sig, cp1252, latin-1."""
    raw = path.read_bytes()[:100_000] if path.stat().st_size > 0 else b""
    if raw.startswith(b"\xef\xbb\xbf"):
        return "utf-8-sig"
    for enc in ("utf-8", "cp1252", "latin-1"):
        try:
            raw.decode(enc)
            return enc
        except UnicodeDecodeError:
            continue
    return "latin-1"


def sniff_csv_dialect(sample: str) -> tuple[str, bool]:
    """Sniff delimiter and header presence from sample text."""
    delimiters = [",", "\t", ";", "|"]
    first_line = sample.splitlines()[0] if sample else ""
    best_delim = ","
    max_count = 0
    for d in delimiters:
        c = first_line.count(d)
        if c > max_count:
            max_count = c
            best_delim = d

    try:
        sniffer = csv.Sniffer()
        dialect = sniffer.sniff(sample, delimiters=delimiters)
        best_delim = dialect.delimiter
        has_header = sniffer.has_header(sample)
    except Exception:
        has_header = True

    return best_delim, has_header


def has_quoted_newlines(path: Path, sample_bytes: int = 2_000_000) -> bool:
    """Check if a delimited file contains newlines inside quoted fields.
    If not, Spark can read with multiLine=False which is splittable across cores.
    """
    try:
        with open(path, "rb") as f:
            chunk = f.read(sample_bytes)
    except OSError:
        return False

    in_quotes = False
    escape = False
    for b in chunk:
        if b == 34:  # double quote "
            if not escape:
                in_quotes = not in_quotes
            escape = False
        elif b == 92:  # backslash \
            escape = not escape
        else:
            escape = False
            if in_quotes and (b == 10 or b == 13):  # \n or \r inside quotes
                return True
    return False


# --- Format Converters & Extractors -----------------------------------------

def xlsx_to_csv(xlsx_path: Path, csv_path: Path) -> Path:
    """Convert an Excel spreadsheet to CSV in read-only streaming mode."""
    import openpyxl
    wb = openpyxl.load_workbook(filename=str(xlsx_path), read_only=True, data_only=True)
    ws = wb.active
    with open(csv_path, "w", newline="", encoding="utf-8") as out:
        writer = csv.writer(out)
        for row in ws.iter_rows(values_only=True):
            if any(cell is not None for cell in row):
                writer.writerow([str(c) if c is not None else "" for c in row])
    wb.close()
    return csv_path


def extract_archive(archive_path: Path, dest_dir: Path) -> list[Path]:
    """Extract .zip or .tar.gz archive and return candidate data files."""
    dest_dir.mkdir(parents=True, exist_ok=True)
    candidates = []
    
    if zipfile.is_zipfile(archive_path):
        with zipfile.ZipFile(archive_path, "r") as z:
            for member in z.infolist():
                if member.is_dir():
                    continue
                # Skip hidden files and macOS metadata
                filename = Path(member.filename).name
                if filename.startswith(".") or filename.startswith("__MACOSX"):
                    continue
                extracted_path = dest_dir / filename
                with z.open(member) as src, open(extracted_path, "wb") as dst:
                    shutil.copyfileobj(src, dst)
                ext = extracted_path.suffix.lower()
                if ext in SUPPORTED_DATA_EXTS:
                    candidates.append(extracted_path)
    elif str(archive_path).endswith((".tar.gz", ".tgz", ".tar.bz2", ".tar")):
        mode = "r:gz" if str(archive_path).endswith((".tar.gz", ".tgz")) else "r:bz2" if str(archive_path).endswith(".tar.bz2") else "r:*"
        with tarfile.open(archive_path, mode) as t:
            for member in t.getmembers():
                if not member.isfile():
                    continue
                filename = Path(member.name).name
                if filename.startswith(".") or filename.startswith("__MACOSX"):
                    continue
                extracted_path = dest_dir / filename
                f = t.extractfile(member)
                if f:
                    with open(extracted_path, "wb") as dst:
                        shutil.copyfileobj(f, dst)
                    ext = extracted_path.suffix.lower()
                    if ext in SUPPORTED_DATA_EXTS:
                        candidates.append(extracted_path)

    # Sort largest data file first
    candidates.sort(key=lambda p: p.stat().st_size if p.exists() else 0, reverse=True)
    return candidates


# --- Peek & Column Detection ------------------------------------------------

def peek_columns(path: Path, fmt: str) -> list[str]:
    """Fast, Spark-free look at a file's column names."""
    cols, _, _, _ = peek_dataset(path, fmt, limit=1)
    return cols


def peek_dataset(path: Path, fmt: str, limit: int = 20) -> tuple[list[str], list[dict], dict, list[str]]:
    """Inspect dataset, extract columns, preview rows, detect roles, and compile warnings."""
    cols = []
    rows = []
    warnings = []

    try:
        if fmt == "parquet":
            import pyarrow.parquet as pq
            table = pq.read_table(str(path))
            cols = table.schema.names
            num_rows = min(limit, table.num_rows)
            sliced = table.slice(0, num_rows).to_pylist()
            rows = sliced
        elif fmt in ("csv", "tsv", "txt"):
            enc = detect_encoding(path)
            with open(path, "r", encoding=enc, errors="replace") as f:
                head = f.read(250_000)
            delim, has_header = sniff_csv_dialect(head)
            reader = csv.reader(io.StringIO(head), delimiter=delim)
            raw_rows = list(reader)
            if raw_rows:
                if has_header:
                    cols = [c.strip() for c in raw_rows[0]]
                    data_rows = raw_rows[1:]
                else:
                    cols = [f"_c{i}" for i in range(len(raw_rows[0]))]
                    data_rows = raw_rows

                # Filter out blank rows
                for r in data_rows[:limit]:
                    if any(cell.strip() for cell in r):
                        row_dict = {}
                        for i, c in enumerate(cols):
                            row_dict[c] = r[i] if i < len(r) else ""
                        rows.append(row_dict)
        elif fmt in ("json", "jsonl", "ndjson"):
            enc = detect_encoding(path)
            with open(path, "r", encoding=enc, errors="replace") as f:
                head = f.read(500_000).lstrip()
            if head.startswith("["):
                # JSON array
                try:
                    # Parse up to first 25 objects
                    parsed = json.loads(head)
                    if isinstance(parsed, list):
                        for item in parsed[:limit]:
                            if isinstance(item, dict):
                                rows.append({k: (json.dumps(v) if isinstance(v, (dict, list)) else str(v)) for k, v in item.items()})
                except Exception:
                    # Incomplete JSON array from snippet: extract objects by regex
                    obj_matches = re.findall(r"\{[^{}]*\}", head)
                    for m in obj_matches[:limit]:
                        try:
                            d = json.loads(m)
                            rows.append({k: (json.dumps(v) if isinstance(v, (dict, list)) else str(v)) for k, v in d.items()})
                        except Exception:
                            pass
            else:
                # JSON-lines / NDJSON
                for line in head.splitlines()[:limit]:
                    line = line.strip()
                    if line:
                        try:
                            d = json.loads(line)
                            if isinstance(d, dict):
                                rows.append({k: (json.dumps(v) if isinstance(v, (dict, list)) else str(v)) for k, v in d.items()})
                        except Exception:
                            continue
            if rows:
                cols = list(rows[0].keys())
        elif fmt == "xlsx":
            import openpyxl
            wb = openpyxl.load_workbook(filename=str(path), read_only=True, data_only=True)
            ws = wb.active
            for idx, r in enumerate(ws.iter_rows(values_only=True)):
                if idx == 0:
                    cols = [str(c).strip() if c is not None else f"_c{i}" for i, c in enumerate(r)]
                elif idx <= limit:
                    if any(c is not None for c in r):
                        row_dict = {cols[i]: (str(r[i]) if i < len(r) and r[i] is not None else "") for i in range(len(cols))}
                        rows.append(row_dict)
                else:
                    break
            wb.close()
    except Exception as e:
        warnings.append(f"Preview warning: {type(e).__name__} ({str(e)[:80]})")

    detected = detect_columns(cols)

    # Validation & plain-language warnings
    if "text" not in detected:
        warnings.append("This file has no column that looks like text. Choose one below.")
    if "ts" not in detected:
        warnings.append("No date column detected — timeline and trend charts will be disabled.")
    if "rating" not in detected and "label" not in detected:
        warnings.append("No rating or sentiment label column detected — the default pretrained model will be used.")

    return cols, rows, detected, warnings


def detect_columns(columns: list[str]) -> dict:
    """Map standard roles -> actual column names (case-insensitive)."""
    lower = {str(c).lower().strip(): c for c in columns}
    found = {}
    for role, names in CANDIDATES.items():
        for n in names:
            if n in lower and lower[n] not in found.values():
                found[role] = lower[n]
                break
    return found


# --- Spark Data Ingestion ----------------------------------------------------

def read_raw(spark: SparkSession, path: str, fmt: str, mapping: dict | None = None) -> DataFrame:
    """Read dataset into Spark DataFrame with optimized partitioning and delimiter detection."""
    from urllib.parse import urlparse
    from urllib.request import url2pathname
    
    local_path = None
    if path.startswith("file://"):
        local_path = Path(url2pathname(urlparse(path).path))
    elif not path.startswith("hdfs://"):
        local_path = Path(path)

    if fmt == "parquet":
        return spark.read.parquet(path)

    if fmt in ("csv", "tsv", "txt"):
        delim = ","
        has_header = True
        needs_multiline = False
        enc = "UTF-8"

        if local_path and local_path.exists():
            enc = detect_encoding(local_path)
            try:
                with open(local_path, "r", encoding=enc, errors="replace") as f:
                    sample = f.read(250_000)
                delim, has_header = sniff_csv_dialect(sample)
            except Exception:
                pass
            needs_multiline = has_quoted_newlines(local_path)

        reader = (
            spark.read.option("header", has_header)
            .option("delimiter", delim)
            .option("multiLine", needs_multiline)
            .option("escape", '"')
            .option("encoding", enc)
            .option("mode", "PERMISSIVE")
        )
        df = reader.csv(path)
        return df

    # JSON formats
    multiline = False
    if local_path and local_path.exists():
        try:
            with open(local_path, "r", encoding="utf-8", errors="replace") as f:
                multiline = f.read(1024).lstrip().startswith("[")
        except OSError:
            pass

    return spark.read.option("multiLine", multiline).json(path)


def _parse_ts(col):
    c = F.trim(col.cast("string"))
    unix_s = F.when(c.rlike(r"^\d{9,10}(\.\d+)?$"), F.to_timestamp(F.from_unixtime(c.cast("double").cast("long"))))
    unix_ms = F.when(c.rlike(r"^\d{12,13}$"), F.to_timestamp(F.from_unixtime((c.cast("long") / 1000).cast("long"))))
    formats = [
        "yyyy-MM-dd HH:mm:ss", "yyyy-MM-dd'T'HH:mm:ss", "yyyy-MM-dd'T'HH:mm:ssX",
        "yyyy-MM-dd'T'HH:mm:ss.SSSX", "yyyy-MM-dd'T'HH:mm:ss.SSSSSSX", "yyyy-MM-dd",
        "MM/dd/yyyy HH:mm", "MM/dd/yyyy", "dd-MM-yyyy", "dd/MM/yyyy", "M d, yyyy",
        "yyyy/MM/dd", "yyyy.MM.dd"
    ]
    parsed = [F.to_timestamp(c, f) for f in formats]
    # Twitter style "Wed Oct 10 20:19:24 +0000 2018" (day name stripped first)
    parsed.append(F.to_timestamp(F.regexp_replace(c, r"^[A-Za-z]{3} ", ""), "MMM dd HH:mm:ss Z yyyy"))
    return F.coalesce(unix_s, unix_ms, *parsed, F.to_timestamp(c))


def standardize(df: DataFrame, mapping: dict | None = None) -> tuple[DataFrame, dict]:
    """Return a DataFrame with the standard schema plus the mapping used.
    Supports combining two text columns (e.g. text + text2).
    """
    m = detect_columns(df.columns)
    if mapping:
        m.update({k: v for k, v in mapping.items() if v})
    if "text" not in m:
        raise ValueError(
            f"Could not find a text column. Columns found: {df.columns}. "
            "Please select a text column in the dataset settings."
        )

    def col_or_null(role, dtype="string"):
        return F.col(f"`{m[role]}`").cast(dtype) if role in m and m[role] in df.columns else F.lit(None).cast(dtype)

    # Support combining two text columns (e.g. Summary + Text)
    if mapping and mapping.get("text2") and mapping["text2"] in df.columns:
        t1 = col_or_null("text")
        t2 = F.col(f"`{mapping['text2']}`").cast("string")
        text_expr = F.concat_ws(" - ", F.coalesce(t1, F.lit("")), F.coalesce(t2, F.lit("")))
    else:
        text_expr = col_or_null("text")

    hashtags = F.col(f"`{m['hashtags']}`") if "hashtags" in m and m["hashtags"] in df.columns else F.lit(None)
    if "hashtags" in m and m["hashtags"] in df.columns and dict(df.dtypes).get(m["hashtags"], "").startswith("array"):
        hashtags = F.concat_ws(" ", hashtags)

    out = df.select(
        (col_or_null("id") if "id" in m and m["id"] in df.columns else F.monotonically_increasing_id().cast("string")).alias("post_id"),
        text_expr.alias("text"),
        (_parse_ts(F.col(f"`{m['ts']}`")) if "ts" in m and m["ts"] in df.columns else F.lit(None).cast("timestamp")).alias("ts"),
        col_or_null("rating", "double").alias("rating"),
        col_or_null("label").alias("label_raw"),
        col_or_null("topic").alias("topic"),
        hashtags.cast("string").alias("hashtags_raw"),
        col_or_null("platform").alias("platform"),
    )
    return out, m
