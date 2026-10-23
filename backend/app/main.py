"""SentimentStream REST API (FastAPI).

Run:  uvicorn app.main:app --reload --port 8000     (from the backend/ folder)
Docs: http://localhost:8000/docs
"""
import json
import os
import re
import shutil
import urllib.request
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse, Response
from pydantic import BaseModel, Field

from . import db, jobs, reports
from .config import (CHUNK_UPLOAD_DIR, CPU_CORES, DATA_DIR, DEFAULT_MODEL_NAME,
                     MAX_UPLOAD_SIZE, SPARK_DRIVER_MEMORY, STORAGE_URI, UPLOAD_DIR,
                     storage_backend)
from .pipeline import ingest, sentiment, synth
from .spark_session import is_warming_up, spark_info, start_warmup_thread


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
    start_warmup_thread()
    yield


app = FastAPI(
    title="SentimentStream API",
    version="1.0.0",
    description="Distributed social media sentiment & trend analytics on Apache Spark",
    lifespan=lifespan,
)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


# ------------------------------------------------------------------ system
@app.get("/api/health")
def health():
    free_bytes = shutil.disk_usage(DATA_DIR).free
    return {
        "status": "ok",
        "spark": spark_info(),
        "spark_warming_up": is_warming_up(),
        "cores": CPU_CORES,
        "driver_memory": SPARK_DRIVER_MEMORY,
        "free_disk_bytes": free_bytes,
        "free_disk_gb": round(free_bytes / (1024 ** 3), 2),
        "storage_backend": storage_backend(),
        "storage_uri": STORAGE_URI or "local data/lake",
        "default_model_ready": sentiment.model_path(DEFAULT_MODEL_NAME).exists(),
    }


# ---------------------------------------------------------------- uploads (chunked)
class InitUploadRequest(BaseModel):
    filename: str
    size_bytes: int = Field(..., ge=1)


@app.post("/api/uploads")
def init_chunked_upload(req: InitUploadRequest):
    if req.size_bytes > MAX_UPLOAD_SIZE:
        max_gb = MAX_UPLOAD_SIZE // (1024 ** 3)
        raise HTTPException(400, f"File exceeds maximum upload size of {max_gb} GB.")
    
    free_bytes = shutil.disk_usage(UPLOAD_DIR).free
    if req.size_bytes * 2 > free_bytes:
        raise HTTPException(400, "Insufficient disk space on server for this upload.")

    upload_id = db.new_id("upl")
    upload_path = CHUNK_UPLOAD_DIR / upload_id
    upload_path.mkdir(parents=True, exist_ok=True)
    meta = {
        "filename": req.filename,
        "size_bytes": req.size_bytes,
        "chunk_size": 8 * 1024 * 1024,
        "created_at": db.now(),
    }
    (upload_path / "metadata.json").write_text(json.dumps(meta))
    return {
        "upload_id": upload_id,
        "chunk_size": meta["chunk_size"],
        "max_size": MAX_UPLOAD_SIZE,
    }


@app.put("/api/uploads/{upload_id}/chunks/{index}")
async def upload_chunk(upload_id: str, index: int, request: Request):
    upload_path = CHUNK_UPLOAD_DIR / upload_id
    if not upload_path.exists():
        raise HTTPException(404, "Upload session not found or expired.")

    chunk_file = upload_path / f"chunk_{index:06d}.part"
    body = await request.body()
    with open(chunk_file, "wb") as f:
        f.write(body)
    return {"index": index, "bytes_written": len(body)}


class CompleteUploadRequest(BaseModel):
    name: str | None = None


@app.post("/api/uploads/{upload_id}/complete")
def complete_chunked_upload(upload_id: str, req: CompleteUploadRequest):
    upload_path = CHUNK_UPLOAD_DIR / upload_id
    meta_path = upload_path / "metadata.json"
    if not upload_path.exists() or not meta_path.exists():
        raise HTTPException(404, "Upload session not found.")

    meta = json.loads(meta_path.read_text())
    orig_filename = meta["filename"]
    ext = Path(orig_filename).suffix.lower()

    chunk_files = sorted(upload_path.glob("chunk_*.part"))
    if not chunk_files:
        raise HTTPException(400, "No chunks uploaded.")

    ds_id = db.new_id("ds")
    assembled_path = UPLOAD_DIR / f"{ds_id}{ext}"
    with open(assembled_path, "wb") as out:
        for chunk in chunk_files:
            with open(chunk, "rb") as cf:
                shutil.copyfileobj(cf, out)

    shutil.rmtree(upload_path, ignore_errors=True)
    return _process_dataset_file(ds_id, assembled_path, orig_filename, req.name)


@app.delete("/api/uploads/{upload_id}")
def abort_chunked_upload(upload_id: str):
    upload_path = CHUNK_UPLOAD_DIR / upload_id
    if upload_path.exists():
        shutil.rmtree(upload_path, ignore_errors=True)
    return {"cancelled": upload_id}


# ---------------------------------------------------------------- datasets
def _determine_format(path: Path) -> str:
    ext = path.suffix.lower()
    name = path.name.lower()
    if name.endswith(".tar.gz") or name.endswith(".tgz"):
        return "tar.gz"
    if ext == ".zip":
        return "zip"
    if ext in (".csv", ".tsv", ".txt"):
        return "csv"
    if ext in (".json", ".jsonl", ".ndjson"):
        return "json"
    if ext == ".parquet":
        return "parquet"
    if ext == ".xlsx":
        return "xlsx"
    if ext in (".gz", ".bz2"):
        sub = Path(path.stem).suffix.lower()
        if sub in (".csv", ".tsv", ".txt"):
            return "csv"
        if sub in (".json", ".jsonl", ".ndjson"):
            return "json"
    return "csv"


def _process_dataset_file(ds_id: str, file_path: Path, filename: str, display_name: str | None = None) -> dict:
    raw_fmt = _determine_format(file_path)

    # 1. Archives: extract and pick primary file
    if raw_fmt in ("zip", "tar.gz"):
        extract_dir = UPLOAD_DIR / f"{ds_id}_extracted"
        candidates = ingest.extract_archive(file_path, extract_dir)
        if not candidates:
            file_path.unlink(missing_ok=True)
            shutil.rmtree(extract_dir, ignore_errors=True)
            raise HTTPException(400, "Archive contains no recognized data files (.csv, .json, .parquet, .xlsx).")
        primary = candidates[0]
        ext = primary.suffix.lower()
        target_path = UPLOAD_DIR / f"{ds_id}{ext}"
        shutil.move(str(primary), str(target_path))
        file_path.unlink(missing_ok=True)
        shutil.rmtree(extract_dir, ignore_errors=True)
        file_path = target_path
        filename = primary.name
        raw_fmt = _determine_format(file_path)

    # 2. Excel spreadsheets: convert to CSV
    if raw_fmt == "xlsx":
        csv_path = UPLOAD_DIR / f"{ds_id}.csv"
        try:
            ingest.xlsx_to_csv(file_path, csv_path)
            file_path.unlink(missing_ok=True)
            file_path = csv_path
            raw_fmt = "csv"
        except Exception as e:
            file_path.unlink(missing_ok=True)
            raise HTTPException(400, f"Could not parse Excel spreadsheet: {e}")

    cols, _, detected, warnings = ingest.peek_dataset(file_path, raw_fmt, limit=5)
    return db.insert_dataset(
        id=ds_id,
        name=display_name or Path(filename).stem,
        filename=filename,
        path=str(file_path),
        fmt=raw_fmt,
        size_bytes=file_path.stat().st_size,
        columns=cols,
        detected=detected,
        mapping=detected,
    )


@app.get("/api/datasets")
def list_datasets():
    return db.list_datasets()


@app.post("/api/datasets/upload")
async def upload_dataset(file: UploadFile = File(...), name: str = Form(None)):
    free_bytes = shutil.disk_usage(UPLOAD_DIR).free
    if free_bytes < 500 * 1024 * 1024:
        raise HTTPException(400, "Insufficient disk space on server.")

    ds_id = db.new_id("ds")
    ext = Path(file.filename).suffix.lower()
    dest = UPLOAD_DIR / f"{ds_id}{ext}"
    with open(dest, "wb") as out:
        shutil.copyfileobj(file.file, out, length=4 * 1024 * 1024)

    return _process_dataset_file(ds_id, dest, file.filename, name)


class ImportRequest(BaseModel):
    url: str | None = None
    server_path: str | None = None
    name: str | None = None


@app.post("/api/datasets/import")
def import_dataset(req: ImportRequest):
    if not req.url and not req.server_path:
        raise HTTPException(400, "Provide either a url or server_path.")

    ds_id = db.new_id("ds")

    if req.url:
        parsed = urllib.parse.urlparse(req.url)
        filename = Path(parsed.path).name or "imported_dataset.csv"
        ext = Path(filename).suffix.lower() or ".csv"
        dest = UPLOAD_DIR / f"{ds_id}{ext}"

        try:
            with urllib.request.urlopen(req.url, timeout=30) as response, open(dest, "wb") as out:
                shutil.copyfileobj(response, out)
        except Exception as e:
            dest.unlink(missing_ok=True)
            raise HTTPException(400, f"Failed to download from URL: {e}")
        return _process_dataset_file(ds_id, dest, filename, req.name)

    # Server / HDFS path
    src_path = Path(req.server_path.strip().strip('"').strip("'"))
    if not src_path.exists() and not req.server_path.startswith("hdfs://"):
        raise HTTPException(400, f"Path does not exist on server: {req.server_path}")

    filename = src_path.name
    fmt = _determine_format(src_path)
    cols, _, detected, _ = ingest.peek_dataset(src_path, fmt, limit=5)
    size_b = src_path.stat().st_size if src_path.exists() else 0

    return db.insert_dataset(
        id=ds_id,
        name=req.name or src_path.stem,
        filename=filename,
        path=str(src_path),
        fmt=fmt,
        size_bytes=size_b,
        columns=cols,
        detected=detected,
        mapping=detected,
    )


@app.get("/api/datasets/{ds_id}/preview")
def dataset_preview(ds_id: str):
    ds = db.get_dataset(ds_id)
    if not ds:
        raise HTTPException(404, "Dataset not found")
    
    p = Path(ds["path"])
    if not p.exists():
        raise HTTPException(404, f"Dataset file missing from server: {ds['path']}")

    cols, preview_rows, detected, warnings = ingest.peek_dataset(p, ds["fmt"], limit=20)
    current_mapping = ds.get("mapping") or detected
    return {
        "columns": cols,
        "preview_rows": preview_rows,
        "detected": detected,
        "mapping": current_mapping,
        "warnings": warnings,
    }


class MappingRequest(BaseModel):
    mapping: dict


@app.patch("/api/datasets/{ds_id}/mapping")
def update_mapping(ds_id: str, req: MappingRequest):
    ds = db.get_dataset(ds_id)
    if not ds:
        raise HTTPException(404, "Dataset not found")
    db.update_dataset(ds_id, mapping=req.mapping)
    return db.get_dataset(ds_id)


class SampleRequest(BaseModel):
    rows: int = Field(50_000, ge=1_000, le=2_000_000)
    name: str | None = None


@app.post("/api/datasets/sample")
def create_sample(req: SampleRequest):
    ds_id = db.new_id("ds")
    dest = UPLOAD_DIR / f"{ds_id}.csv"
    synth.generate(dest, rows=req.rows, seed=req.rows)
    cols = ingest.peek_columns(dest, "csv")
    detected = ingest.detect_columns(cols)
    return db.insert_dataset(
        id=ds_id,
        name=req.name or f"Nova X5 launch ({req.rows:,} posts)",
        filename=dest.name,
        path=str(dest),
        fmt="csv",
        size_bytes=dest.stat().st_size,
        columns=cols,
        detected=detected,
        mapping=detected,
        rows=req.rows,
        source="synthetic",
    )


class RenameRequest(BaseModel):
    name: str


def _validate_rename(name: str) -> str:
    if not isinstance(name, str):
        raise HTTPException(400, "Name must be a string.")
    cleaned = name.strip()
    if not cleaned:
        raise HTTPException(400, "Name cannot be empty or whitespace only.")
    if len(cleaned) > 80:
        raise HTTPException(400, "Name cannot exceed 80 characters.")
    return cleaned


def _sanitize_filename(name: str) -> str:
    cleaned = re.sub(r'[^\w\s-]', '', name).strip()
    cleaned = re.sub(r'[-\s]+', '_', cleaned)
    return cleaned or "report"


@app.patch("/api/datasets/{ds_id}")
@app.patch("/datasets/{ds_id}")
def rename_dataset(ds_id: str, req: RenameRequest):
    ds = db.get_dataset(ds_id)
    if not ds:
        raise HTTPException(404, "Dataset not found")
    new_name = _validate_rename(req.name)
    return db.update_dataset(ds_id, name=new_name)


@app.delete("/api/datasets/{ds_id}")
def delete_dataset(ds_id: str):
    ds = db.get_dataset(ds_id)
    if not ds:
        raise HTTPException(404, "Dataset not found")
    Path(ds["path"]).unlink(missing_ok=True)
    db.delete_dataset(ds_id)
    return {"deleted": ds_id}


# -------------------------------------------------------------------- jobs
class AnalysisRequest(BaseModel):
    dataset_id: str
    model_mode: Literal["auto", "train", "pretrained"] = "auto"
    mapping: dict | None = None
    train_on_data: bool = False
    name: str | None = None


@app.post("/api/jobs")
def start_analysis(req: AnalysisRequest):
    ds = db.get_dataset(req.dataset_id)
    if not ds:
        raise HTTPException(404, "Dataset not found")
    params = req.model_dump(exclude={"dataset_id", "name"})
    if not params.get("mapping") and ds.get("mapping"):
        params["mapping"] = ds["mapping"]
    job = db.insert_job("analysis", req.dataset_id, params, name=req.name)
    return jobs.submit(job)


@app.post("/api/jobs/{job_id}/cancel")
def cancel_job(job_id: str):
    job = db.get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return jobs.cancel(job_id)


@app.post("/api/jobs/{job_id}/retry")
def retry_job(job_id: str):
    job = db.get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return jobs.retry(job_id)


@app.get("/api/jobs")
def list_jobs(kind: str | None = None):
    return db.list_jobs(kind)


@app.get("/api/jobs/{job_id}")
def get_job(job_id: str):
    job = db.get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return job


@app.patch("/api/jobs/{job_id}")
@app.patch("/jobs/{job_id}")
def rename_job(job_id: str, req: RenameRequest):
    job = db.get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    new_name = _validate_rename(req.name)
    return db.update_job(job_id, name=new_name)


def _results(job_id: str) -> dict:
    p = jobs.results_path(job_id)
    if not p.exists():
        job = db.get_job(job_id)
        if job and job["status"] == "failed":
            raise HTTPException(400, f"Analysis failed: {job.get('error') or 'Unknown error'}")
        raise HTTPException(404, "Results not ready. Check the job status first.")
    data = json.loads(p.read_text())
    job = db.get_job(job_id)
    if job:
        data["name"] = job.get("name")
        data["job_name"] = job.get("name")
        if job.get("dataset_id"):
            ds = db.get_dataset(job["dataset_id"])
            if ds and "dataset" in data and isinstance(data["dataset"], dict):
                data["dataset"]["name"] = ds.get("name", data["dataset"].get("name"))
    return data


@app.get("/api/jobs/{job_id}/results")
def job_results(job_id: str):
    return _results(job_id)


class FilterRequest(BaseModel):
    start: str | None = None
    end: str | None = None
    keyword: str | None = None
    sentiment: Literal["positive", "neutral", "negative"] | None = None
    topic: str | None = None


@app.post("/api/jobs/{job_id}/query")
def filtered(job_id: str, f: FilterRequest):
    _results(job_id)  # 404 if job has no results
    return jobs.filtered_analysis(job_id, f.start, f.end, f.keyword, f.sentiment, f.topic)


@app.get("/api/jobs/{job_id}/posts")
def posts(
    job_id: str,
    q: str | None = None,
    sentiment: str | None = None,
    topic: str | None = None,
    aspect: str | None = None,
    start: str | None = None,
    end: str | None = None,
    sort: str = "recent",
    page: int = Query(1, ge=1),
    size: int = Query(25, ge=1, le=200),
):
    total, items = db.search_posts(job_id, q, sentiment, topic, start, end, aspect, page, size, sort)
    return {"total": total, "page": page, "size": size, "items": items}


@app.get("/api/jobs/{job_id}/report")
def report(job_id: str, format: Literal["json", "csv", "md"] = "json"):
    r = _results(job_id)
    job = db.get_job(job_id)
    display_name = (job.get("name") if job else None) or r.get("dataset", {}).get("name") or job_id
    safe_filename = _sanitize_filename(display_name)
    if format == "csv":
        return Response(
            reports.to_csv(r),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{safe_filename}.csv"'},
        )
    if format == "md":
        return PlainTextResponse(
            reports.to_markdown(r, display_name=display_name),
            headers={"Content-Disposition": f'attachment; filename="{safe_filename}.md"'},
        )
    return Response(
        json.dumps(r, indent=2, default=str),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{safe_filename}.json"'},
    )


# --------------------------------------------------------------- benchmark
class BenchmarkRequest(BaseModel):
    sizes: list[int] = [10_000, 100_000, 1_000_000]
    include_python: bool = True
    include_full: bool = True


@app.post("/api/benchmarks")
def start_benchmark(req: BenchmarkRequest):
    if not req.sizes or any(s < 1_000 or s > 5_000_000 for s in req.sizes):
        raise HTTPException(400, "Each size must be between 1,000 and 5,000,000 rows")
    return jobs.submit(db.insert_job("benchmark", None, req.model_dump()))


@app.get("/api/benchmarks/latest")
def latest_benchmark():
    for j in db.list_jobs("benchmark"):
        if j["status"] == "completed" and jobs.results_path(j["id"]).exists():
            return {"job": j, "results": _results(j["id"])}
    return {"job": None, "results": None}


# ------------------------------------------------------------------- model
@app.get("/api/model")
def model_info():
    return {
        "ready": sentiment.model_path(DEFAULT_MODEL_NAME).exists(),
        "metrics": sentiment.load_metrics(DEFAULT_MODEL_NAME),
    }


@app.post("/api/model/train")
def train_default():
    return jobs.submit(db.insert_job("train_default", None, {}))


class PredictRequest(BaseModel):
    texts: list[str] = Field(..., min_length=1, max_length=50)
    job_id: str | None = None


@app.post("/api/predict")
def predict(req: PredictRequest):
    from pyspark.sql import Row

    from .pipeline import preprocess, trends
    from .spark_session import get_spark

    model = sentiment.load_model(f"model_{req.job_id}") if req.job_id else None
    model = model or sentiment.load_model(DEFAULT_MODEL_NAME)
    if model is None:
        raise HTTPException(409, "No model yet. Run an analysis or train the default model first.")
    spark = get_spark()
    df = spark.createDataFrame(
        [
            Row(
                post_id=str(i),
                text=t,
                ts=None,
                rating=None,
                label_raw=None,
                topic=None,
                hashtags_raw=None,
                platform=None,
            )
            for i, t in enumerate(req.texts)
        ],
        schema="post_id string, text string, ts timestamp, rating double, label_raw string, "
        "topic string, hashtags_raw string, platform string",
    )
    from pyspark.ml.feature import RegexTokenizer, StopWordsRemover
    from pyspark.sql import functions as F

    df = df.withColumn("clean_text", preprocess.clean_text_col(F.col("text")))
    df = RegexTokenizer(inputCol="clean_text", outputCol="raw_tokens", pattern=r"\s+", minTokenLength=2).transform(df)
    df = StopWordsRemover(inputCol="raw_tokens", outputCol="tokens", stopWords=preprocess.STOPWORDS).transform(df)
    out = trends.add_aspects(sentiment.predict(model, df)).select(
        "text", "sentiment", "confidence", "aspects", "tokens"
    )
    return [r.asDict() for r in out.collect()]
