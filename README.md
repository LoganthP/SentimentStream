# SentimentStream

**A Distributed Big Data Analytics Framework for Social Media Sentiment Classification and Emerging Trend Detection Using Apache Spark**

Big Data Analytics course project (BCSBD713). Upload massive sets of social media posts or product reviews, run a distributed Spark job, and explore sentiment, feature-level complaints, trending words and hashtags, negative spikes and Spark performance in a web dashboard.

```
CSV / TSV / JSON / Parquet / Excel / Archives ──► Data lake (local folder or HDFS, Parquet)
                                                          │
                                                    Apache Spark (PySpark)
                         clean ─► dedupe ─► tokenize ─► TF-IDF (2^16) ─► MLlib Logistic Regression
                                                          │
                         Spark SQL aggregations: sentiment, timeline, aspects, keywords,
                         hashtags, topics, rising terms, anomalies, MapReduce word count
                                                          │
                         Partitioned Parquet  +  JSON results  +  SQLite (jobs, search index)
                                                          │
                                   FastAPI REST backend  ──►  React dashboard
```

## Features & Highlights

- **Universal Format Support**: Ingests CSV, TSV, TXT, JSON array, JSON-lines, NDJSON, Parquet, Excel `.xlsx`, compressed `.gz` / `.bz2`, and `.zip` / `.tar.gz` archives.
- **Smart Delimiter & Encoding Sniffing**: Automatically detects `,`, `;`, `\t`, `|` delimiters, headers, and encodings (`utf-8`, `utf-8-sig`, `cp1252`, `latin-1`).
- **Resumable Chunked Uploads**: Streams 8–16 MB chunks to disk without memory overhead; displays live speed (MB/s), ETA, percent progress, cancel, and automatic retry.
- **Import from URL or Server / HDFS Path**: Pull multi-GB files directly from web URLs or server/HDFS paths.
- **Preview & Column Mapping**: Inspect the first 20 rows, override text/date/rating/label/topic columns, combine two text fields (e.g., Summary + Text), and receive plain-language guidance.
- **Warm Start & Quick Preview Mode**: Spark initializes and warms up in the background on startup. Large datasets generate a 20K-row sample preview in ~15–20s while the full job runs.
- **Progressive Results**: Insights stream into the dashboard as each stage finishes (cleaning stats → sentiment distribution → timeline → aspects & keywords → full report).
- **High-Performance Spark Pipeline**: Automatic quoted-newline detection enables parallel multi-core CSV splits, adaptive execution (AQE) with partition coalescing, 2^16 hashing feature optimization, and DataFrame-native word counts.
- **Job Reliability**: Live job cancellation via `sparkContext.cancelJobGroup`, server restart survival with `interrupted` status, and one-click retries.

---

## Performance: Before vs. After Optimization

Evaluated on an 8-core CPU / 16 GB RAM environment:

| Dataset | Metric | Baseline (Before) | Optimized (After) | Improvement |
|---|---|---|---|---|
| **100K Rows** (14.7 MB) | **Total Time** | 79.11 s | **39.41 s** | **2.01× faster** |
| | **Throughput** | 1,264 rows/s | **2,537 rows/s** | **2.01× speedup** |
| | **Spark Partitions** | 1 partition (single core) | **4 partitions** | Multi-core parallel |
| | **Preprocessing** | 24.70 s | **5.28 s** | **4.68× faster** |
| | **MapReduce Word Count**| 14.88 s | **0.84 s** | **17.71× faster** |
| **500K Rows** (73.6 MB) | **Total Time** | 104.90 s | **39.32 s** | **2.67× faster** |
| | **Throughput** | 4,766 rows/s | **12,715 rows/s** | **2.67× speedup** |
| | **Spark Partitions** | 1 partition (single core) | **8 partitions** | Full multi-core split |
| | **Preprocessing** | 55.04 s | **8.13 s** | **6.77× faster** |
| | **Analytics Stage** | 28.01 s | **7.69 s** | **3.64× faster** |
| | **MapReduce Word Count**| 19.30 s | **0.85 s** | **22.71× faster** |
| | **Spark Jobs** | 81 jobs | **63 jobs** | 18 fewer passes |

---

## Supported Formats & Size Limits

| Format | Extensions | Handling Method | Notes |
|---|---|---|---|
| Delimited Text | `.csv`, `.tsv`, `.txt` | Delimiter sniffer (`,`, `;`, `\t`, `\|`) & quoted-newline detector | Reads splittable multi-core when no quoted newlines |
| JSON | `.json`, `.jsonl`, `.ndjson` | JSON lines or JSON array | Nested objects automatically handled |
| Parquet | `.parquet` | Native columnar Spark read | Preserves schema and pushdown filters |
| Excel | `.xlsx` | Read-only streaming conversion via `openpyxl` | Converted server-side to CSV |
| Compressed | `.gz`, `.bz2` | Native Spark decompression | `.bz2` is splittable; `.gz` uncompressed directly |
| Archives | `.zip`, `.tar.gz`, `.tgz` | Server-side extraction | Candidate data files automatically selected |

- **Default Max File Size**: 10 GB (`SS_MAX_UPLOAD_SIZE`).
- **Disk Safety**: Uploads verify available server storage before accepting chunks or streams.

---

## Requirements

| Tool | Version | Check with |
|---|---|---|
| Python | 3.11 pinned (PySpark 3.5.3 supports 3.8–3.11; Python 3.13+ is incompatible) | `python --version` |
| Java (JDK) | 11, 17, or 21 LTS (Java 23+ is unsupported due to removed `Subject.getSubject`) | `java -version` |
| Node.js | 18 or newer | `node --version` |

Spark requires Java. Ensure **Java 11, 17, or 21 is installed and `JAVA_HOME` is set**.

> **Windows users:** Native Windows execution requires `winutils.exe` and `hadoop.dll` (Hadoop 3.3.5) inside `C:\hadoop\bin` or `backend\hadoop\bin`. The backend automatically discovers installed JDKs and local Hadoop paths.

---

## Local Setup

### 1. Backend (FastAPI + Spark)

```bash
cd backend
python -m venv .venv
# Windows PowerShell:
.venv\Scripts\Activate.ps1
# Linux / macOS:
# source .venv/bin/activate

pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

- API: http://localhost:8000
- API Documentation: http://localhost:8000/docs
- Spark UI: http://localhost:4040

### 2. Frontend (React + Vite + Tailwind)

```bash
cd frontend
npm install
npm run dev
```

Dashboard is available at **http://localhost:5173**.

---

## Running the Automated Test Suite

Run the full pytest suite:

```bash
cd backend
pytest tests/test_pipeline.py -v
```

Tests verify:
1. Column detection for standard Kaggle formats (Airline, Amazon Fine Food, Sentiment140, Yelp, Datafiniti).
2. Delimiter and encoding sniffing (`utf-8`, `utf-8-sig`, `latin-1`).
3. Resumable chunked upload assembly.
4. End-to-end 5K-row analysis pipeline with result schema validation.

Verify frontend production build:

```bash
cd frontend
npm run build
```

---

## Preview vs. Full Analysis Behavior

- **Quick Preview Mode**: For datasets with over 30,000 posts, SentimentStream extracts an initial sample (~20,000 posts or 5%) and runs inference with the pretrained classifier. The Overview dashboard renders the sample results within **15–20 seconds**, clearly highlighted with an amber banner.
- **Progressive Stream**: As the full dataset is processed, results appear incrementally in order:
  1. Row counts and cleaning statistics (duplicates & empty records removed).
  2. Sentiment distribution and timeline trends.
  3. Feature-level aspects, keywords, and topics.
  4. Final analytics, anomalies, and MapReduce word count.
- **Live Cancellation**: Any running job can be aborted immediately using the **Cancel** button, triggering `sparkContext.cancelJobGroup(job_id)`.

---

## Performance Tuning Variables

Every variable can be customized via environment variables:

| Variable | Default | Purpose |
|---|---|---|
| `SPARK_DRIVER_MEMORY` | Auto (~50% machine RAM, up to `8g`) | JVM heap allocated to Spark driver |
| `SPARK_SHUFFLE_PARTITIONS` | Auto (`max(4, 2 × CPU cores)`) | Target partitions for shuffle operations |
| `SPARK_MASTER` | `local[*]` | Master URL (`local[*]`, or `spark://host:7077`) |
| `SS_MAX_UPLOAD_SIZE` | `10737418240` (10 GB) | Maximum upload file size in bytes |
| `SS_STORAGE_URI` | Empty (`backend/data/lake`) | Local data lake folder or `hdfs://namenode:9000/...` |
| `SS_EXPLORER_LIMIT` | `10000` | Sample rows indexed into SQLite for instant search |

---

## Troubleshooting Guide

- **`UnsupportedOperationException: getSubject is not supported`**: Spark 3.5.3 is incompatible with Java 23+. Use JDK 11, 17, or 21 LTS and set `JAVA_HOME`.
- **`OutOfMemoryError` on large files**: Increase heap memory via `SPARK_DRIVER_MEMORY=8g`.
- **`winutils.exe` or `HADOOP_HOME` missing on Windows**: Ensure `winutils.exe` and `hadoop.dll` are in `C:\hadoop\bin` or `backend\hadoop\bin`.
- **`This file has no column that looks like text`**: Use the interactive **Mapping** button on the Data page to assign your text column.
- **Server interrupted during a job**: Interrupted jobs display with an amber warning badge and a **Retry** button to resume analysis in one click.
- **Spark Warming Up**: The status indicator in the bottom-left shows "Spark warming up..." during initial startup and transitions to "Spark ready" once initialized.
