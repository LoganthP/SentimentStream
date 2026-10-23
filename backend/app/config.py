"""Central configuration. Every value can be overridden with an environment variable."""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.getenv("SS_DATA_DIR", BASE_DIR / "data")).resolve()

UPLOAD_DIR = DATA_DIR / "uploads"          # files as uploaded by users
RESULTS_DIR = DATA_DIR / "results"         # small JSON analytics per job
MODEL_DIR = DATA_DIR / "models"            # trained Spark MLlib pipelines
BENCH_DIR = DATA_DIR / "bench"             # synthetic benchmark datasets
REPORT_DIR = DATA_DIR / "reports"
DB_PATH = DATA_DIR / "sentimentstream.db"  # SQLite: datasets, jobs, explorer sample

for _d in (UPLOAD_DIR, RESULTS_DIR, MODEL_DIR, BENCH_DIR, REPORT_DIR):
    _d.mkdir(parents=True, exist_ok=True)

# --- Environment Setup (Windows Native & Python / Java Discovery) ---
if os.name == "nt":
    import sys
    os.environ.setdefault("PYSPARK_PYTHON", sys.executable)
    os.environ.setdefault("PYSPARK_DRIVER_PYTHON", sys.executable)

    if not os.getenv("JAVA_HOME"):
        for c in (
            Path(r"C:\Program Files\Java\jdk-21"),
            Path(r"C:\Program Files\Java\jdk-17"),
            Path(r"C:\Program Files\Java\jdk-11"),
        ):
            if (c / "bin" / "java.exe").exists():
                os.environ["JAVA_HOME"] = str(c)
                os.environ["PATH"] = f"{c / 'bin'};{os.environ.get('PATH', '')}"
                break

    if not os.getenv("HADOOP_HOME"):
        for c in (
            Path(r"C:\hadoop"),
            BASE_DIR / "hadoop",
        ):
            if (c / "bin" / "winutils.exe").exists():
                os.environ["HADOOP_HOME"] = str(c)
                os.environ["PATH"] = f"{c / 'bin'};{os.environ.get('PATH', '')}"
                break

# --- Hardware & Resource Detection ---------------------------------------
CPU_CORES = os.cpu_count() or 4
try:
    import psutil
    _TOTAL_RAM_GB = psutil.virtual_memory().total / (1024 ** 3)
    _DEFAULT_DRIVER_MEM = f"{min(8, max(2, int(_TOTAL_RAM_GB // 2)))}g"
except Exception:
    _TOTAL_RAM_GB = 8.0
    _DEFAULT_DRIVER_MEM = "4g"

# --- Spark -----------------------------------------------------------------
SPARK_MASTER = os.getenv("SPARK_MASTER", "local[*]")
SPARK_DRIVER_MEMORY = os.getenv("SPARK_DRIVER_MEMORY", _DEFAULT_DRIVER_MEM)
SPARK_SHUFFLE_PARTITIONS = int(os.getenv("SPARK_SHUFFLE_PARTITIONS", str(max(4, CPU_CORES * 2))))

# --- Upload Limits & Chunking ------------------------------------------------
MAX_UPLOAD_SIZE = int(os.getenv("SS_MAX_UPLOAD_SIZE", str(10 * 1024 * 1024 * 1024)))  # 10 GB
CHUNK_UPLOAD_DIR = UPLOAD_DIR / ".chunks"
CHUNK_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# --- Storage ("data lake") ---------------------------------------------------
# Empty  -> local folder  data/lake
# e.g.   -> hdfs://namenode:9000/sentimentstream   (Phase 2, HDFS)
STORAGE_URI = os.getenv("SS_STORAGE_URI", "").rstrip("/")


def lake_path(*parts: str) -> str:
    """Return a path in the data lake (local or HDFS) usable by Spark."""
    if STORAGE_URI:
        return STORAGE_URI + "/" + "/".join(parts)
    p = DATA_DIR / "lake" / Path(*parts)
    p.parent.mkdir(parents=True, exist_ok=True)
    return p.as_uri()  # file:///...


def storage_backend() -> str:
    return "hdfs" if STORAGE_URI.startswith("hdfs://") else "local"


# --- Analytics ---------------------------------------------------------------
EXPLORER_SAMPLE_LIMIT = int(os.getenv("SS_EXPLORER_LIMIT", "50000"))
MIN_LABELED_ROWS_FOR_TRAINING = 300
DEFAULT_MODEL_NAME = "default_lr"

CORS_ORIGINS = os.getenv(
    "SS_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8080"
).split(",")
