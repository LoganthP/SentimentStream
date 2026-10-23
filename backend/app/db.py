"""SQLite store for metadata: datasets, jobs and the explorer sample of posts.

Large data never goes here — it lives in the data lake (local folder or HDFS)
as Parquet. SQLite only keeps small, frequently queried records.
"""
import json
import sqlite3
import threading
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

from .config import DB_PATH

_lock = threading.Lock()

SCHEMA = """
CREATE TABLE IF NOT EXISTS datasets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    filename TEXT NOT NULL,
    path TEXT NOT NULL,
    fmt TEXT NOT NULL,
    size_bytes INTEGER,
    columns TEXT,
    detected TEXT,
    mapping TEXT,
    rows INTEGER,
    source TEXT DEFAULT 'upload',
    created_at TEXT
);
CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    dataset_id TEXT,
    name TEXT,
    params TEXT,
    status TEXT NOT NULL,
    progress REAL DEFAULT 0,
    stage TEXT,
    error TEXT,
    metrics TEXT,
    created_at TEXT,
    started_at TEXT,
    finished_at TEXT
);
CREATE TABLE IF NOT EXISTS posts (
    job_id TEXT NOT NULL,
    post_id TEXT,
    text TEXT,
    ts TEXT,
    topic TEXT,
    sentiment TEXT,
    confidence REAL,
    rating REAL,
    hashtags TEXT,
    aspects TEXT
);
CREATE INDEX IF NOT EXISTS idx_posts_job ON posts(job_id, sentiment);
CREATE INDEX IF NOT EXISTS idx_posts_ts ON posts(job_id, ts);
"""


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:10]}"


def format_datetime_short(dt_val: str | None = None) -> str:
    if not dt_val:
        dt = datetime.now()
    else:
        try:
            dt = datetime.fromisoformat(dt_val.replace("Z", "+00:00"))
        except Exception:
            dt = datetime.now()
    return f"{dt.day} {dt.strftime('%b')}, {dt.strftime('%H:%M')}"


def default_job_name(kind: str, dataset_name: str | None, created_at: str | None) -> str:
    kind_map = {
        "analysis": "Analysis",
        "benchmark": "Benchmark",
        "train_default": "Model Training",
    }
    k = kind_map.get(kind, kind.replace("_", " ").title())
    time_str = format_datetime_short(created_at)
    if dataset_name:
        return f"{k} · {dataset_name} · {time_str}"
    return f"{k} · {time_str}"


@contextmanager
def conn():
    c = sqlite3.connect(DB_PATH, timeout=30.0, check_same_thread=False)
    c.execute("PRAGMA busy_timeout=30000;")
    c.row_factory = sqlite3.Row
    try:
        yield c
        c.commit()
    finally:
        c.close()


def init_db() -> None:
    with _lock, conn() as c:
        c.execute("PRAGMA journal_mode=WAL;")
        c.execute("PRAGMA synchronous=NORMAL;")
        c.executescript(SCHEMA)

        # Migrate datasets table if mapping column is missing
        cols_ds = [r["name"] for r in c.execute("PRAGMA table_info(datasets)").fetchall()]
        if "mapping" not in cols_ds:
            try:
                c.execute("ALTER TABLE datasets ADD COLUMN mapping TEXT")
            except Exception:
                pass

        # Migrate jobs table if name column is missing
        cols_jobs = [r["name"] for r in c.execute("PRAGMA table_info(jobs)").fetchall()]
        if "name" not in cols_jobs:
            try:
                c.execute("ALTER TABLE jobs ADD COLUMN name TEXT")
            except Exception:
                pass

        # Backfill existing datasets missing name
        ds_rows = c.execute("SELECT id, filename FROM datasets WHERE name IS NULL OR name = ''").fetchall()
        for row in ds_rows:
            ds_name = Path(row["filename"]).stem if row["filename"] else "Dataset"
            c.execute("UPDATE datasets SET name=? WHERE id=?", (ds_name, row["id"]))

        # Backfill existing jobs missing name
        job_rows = c.execute(
            "SELECT j.id, j.kind, j.created_at, d.name AS dataset_name "
            "FROM jobs j LEFT JOIN datasets d ON d.id=j.dataset_id "
            "WHERE j.name IS NULL OR j.name = ''"
        ).fetchall()
        for row in job_rows:
            j_name = default_job_name(row["kind"], row["dataset_name"], row["created_at"])
            c.execute("UPDATE jobs SET name=? WHERE id=?", (j_name, row["id"]))

        # Jobs that were running when the server stopped can never finish.
        c.execute(
            "UPDATE jobs SET status='interrupted', error='Server restarted while the job was running' "
            "WHERE status IN ('queued','running')"
        )


def _row(r):
    if r is None:
        return None
    d = dict(r)
    for k in ("columns", "detected", "mapping", "params", "metrics", "hashtags", "aspects"):
        if k in d and isinstance(d[k], str):
            try:
                d[k] = json.loads(d[k])
            except json.JSONDecodeError:
                pass
    if "filename" in d and ("name" not in d or not d["name"]):
        d["name"] = Path(d["filename"]).stem if d.get("filename") else "Dataset"
    if "kind" in d and ("name" not in d or not d["name"]):
        d["name"] = default_job_name(d.get("kind", "job"), d.get("dataset_name"), d.get("created_at"))
    return d


# ---------------------------------------------------------------- datasets
def insert_dataset(**kw) -> dict:
    kw.setdefault("created_at", now())
    for k in ("columns", "detected", "mapping"):
        if k in kw and not isinstance(kw[k], str):
            kw[k] = json.dumps(kw[k])
    cols = ",".join(kw)
    qs = ",".join("?" for _ in kw)
    with _lock, conn() as c:
        c.execute(f"INSERT INTO datasets ({cols}) VALUES ({qs})", list(kw.values()))
    return get_dataset(kw["id"])


def get_dataset(ds_id: str):
    with conn() as c:
        return _row(c.execute("SELECT * FROM datasets WHERE id=?", (ds_id,)).fetchone())


def list_datasets():
    with conn() as c:
        return [_row(r) for r in c.execute("SELECT * FROM datasets ORDER BY created_at DESC")]


def update_dataset(ds_id: str, **kw):
    if not kw:
        return get_dataset(ds_id)
    for k in ("columns", "detected", "mapping"):
        if k in kw and not isinstance(kw[k], str):
            kw[k] = json.dumps(kw[k])
    sets = ",".join(f"{k}=?" for k in kw)
    with _lock, conn() as c:
        c.execute(f"UPDATE datasets SET {sets} WHERE id=?", [*kw.values(), ds_id])
    return get_dataset(ds_id)


def delete_dataset(ds_id: str):
    with _lock, conn() as c:
        c.execute("DELETE FROM datasets WHERE id=?", (ds_id,))


# -------------------------------------------------------------------- jobs
def insert_job(kind: str, dataset_id, params: dict, name: str | None = None) -> dict:
    job_id = new_id("job")
    created = now()
    if not name:
        ds_name = None
        if dataset_id:
            ds = get_dataset(dataset_id)
            if ds:
                ds_name = ds.get("name")
        name = default_job_name(kind, ds_name, created)
    with _lock, conn() as c:
        c.execute(
            "INSERT INTO jobs (id, kind, dataset_id, name, params, status, progress, stage, created_at) "
            "VALUES (?,?,?,?,?,?,?,?,?)",
            (job_id, kind, dataset_id, name, json.dumps(params), "queued", 0, "Waiting in queue", created),
        )
    return get_job(job_id)


def update_job(job_id: str, **kw):
    if not kw:
        return get_job(job_id)
    if "metrics" in kw and not isinstance(kw["metrics"], str):
        kw["metrics"] = json.dumps(kw["metrics"])
    if "params" in kw and not isinstance(kw["params"], str):
        kw["params"] = json.dumps(kw["params"])
    sets = ",".join(f"{k}=?" for k in kw)
    with _lock, conn() as c:
        c.execute(f"UPDATE jobs SET {sets} WHERE id=?", [*kw.values(), job_id])
    return get_job(job_id)


def get_job(job_id: str):
    with conn() as c:
        return _row(
            c.execute(
                "SELECT j.*, d.name AS dataset_name FROM jobs j LEFT JOIN datasets d ON d.id=j.dataset_id WHERE j.id=?",
                (job_id,),
            ).fetchone()
        )


def cancel_job(job_id: str):
    with _lock, conn() as c:
        c.execute(
            "UPDATE jobs SET status='cancelled', stage='Cancelled by user', finished_at=? "
            "WHERE id=? AND status IN ('queued', 'running')",
            (now(), job_id),
        )
    return get_job(job_id)


def retry_job(job_id: str):
    with _lock, conn() as c:
        c.execute(
            "UPDATE jobs SET status='queued', progress=0, stage='Waiting in queue', "
            "error=NULL, metrics=NULL, started_at=NULL, finished_at=NULL WHERE id=?",
            (job_id,),
        )
    return get_job(job_id)


def list_jobs(kind=None, limit=100):
    q = "SELECT j.*, d.name AS dataset_name FROM jobs j LEFT JOIN datasets d ON d.id=j.dataset_id"
    args = []
    if kind:
        q += " WHERE j.kind=?"
        args.append(kind)
    q += " ORDER BY j.created_at DESC LIMIT ?"
    args.append(limit)
    with conn() as c:
        return [_row(r) for r in c.execute(q, args)]


# ------------------------------------------------------------------- posts
def insert_posts(job_id: str, rows: list[tuple]):
    with _lock, conn() as c:
        c.execute("DELETE FROM posts WHERE job_id=?", (job_id,))
        c.executemany(
            "INSERT INTO posts (job_id, post_id, text, ts, topic, sentiment, confidence, rating, hashtags, aspects) "
            "VALUES (?,?,?,?,?,?,?,?,?,?)",
            [(job_id, *r) for r in rows],
        )


def search_posts(job_id, q=None, sentiment=None, topic=None, start=None, end=None,
                 aspect=None, page=1, size=25, sort="recent"):
    where = ["job_id=?"]
    args = [job_id]
    if q:
        where.append("text LIKE ?")
        args.append(f"%{q}%")
    if sentiment:
        where.append("sentiment=?")
        args.append(sentiment)
    if topic:
        where.append("topic=?")
        args.append(topic)
    if aspect:
        where.append("aspects LIKE ?")
        args.append(f'%"{aspect}"%')
    if start:
        where.append("ts >= ?")
        args.append(start)
    if end:
        where.append("ts <= ?")
        args.append(end + "T23:59:59" if len(end) == 10 else end)
    w = " AND ".join(where)
    order = {"recent": "ts DESC", "oldest": "ts ASC", "confidence": "confidence DESC",
             "uncertain": "confidence ASC"}.get(sort, "ts DESC")
    with conn() as c:
        total = c.execute(f"SELECT COUNT(*) FROM posts WHERE {w}", args).fetchone()[0]
        rows = c.execute(
            f"SELECT * FROM posts WHERE {w} ORDER BY {order} LIMIT ? OFFSET ?",
            [*args, size, (page - 1) * size],
        ).fetchall()
    return total, [_row(r) for r in rows]
