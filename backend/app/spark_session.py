"""One shared SparkSession for the whole API process."""
import os
import sys
import threading

from pyspark.sql import SparkSession

from .config import (SPARK_DRIVER_MEMORY, SPARK_MASTER, SPARK_SHUFFLE_PARTITIONS,
                     STORAGE_URI)

_spark = None
_lock = threading.Lock()
_warming_up = False
_warm_error = None


def get_spark() -> SparkSession:
    global _spark
    with _lock:
        if _spark is None:
            # Make sure Spark workers use the same Python as the API.
            os.environ["PYSPARK_PYTHON"] = sys.executable
            os.environ["PYSPARK_DRIVER_PYTHON"] = sys.executable
            builder = (
                SparkSession.builder.appName("SentimentStream")
                .master(SPARK_MASTER)
                .config("spark.driver.memory", SPARK_DRIVER_MEMORY)
                .config("spark.sql.shuffle.partitions", SPARK_SHUFFLE_PARTITIONS)
                .config("spark.sql.session.timeZone", "UTC")
                # Unparseable dates become NULL instead of raising errors.
                .config("spark.sql.legacy.timeParserPolicy", "CORRECTED")
                .config("spark.sql.adaptive.enabled", "true")
                .config("spark.sql.adaptive.coalescePartitions.enabled", "true")
                .config("spark.ui.showConsoleProgress", "false")
                .config("spark.pyspark.python", sys.executable)
                .config("spark.pyspark.driver.python", sys.executable)
                .config("spark.scheduler.mode", "FAIR")
            )
            if STORAGE_URI.startswith("hdfs://"):
                namenode = "/".join(STORAGE_URI.split("/")[:3])  # hdfs://host:port
                builder = builder.config("spark.hadoop.fs.defaultFS", namenode)
                # Needed when the DataNode runs inside Docker
                builder = builder.config("spark.hadoop.dfs.client.use.datanode.hostname", "true")
            _spark = builder.getOrCreate()
            _spark.sparkContext.setLogLevel("WARN")
        return _spark


def warm_up_spark():
    """Warm up Spark session and default model in the background."""
    global _warming_up, _warm_error
    if _spark is not None:
        return
    _warming_up = True
    try:
        spark = get_spark()
        # Warm up JVM and Catalyst optimizer with a trivial query
        spark.range(1).count()
        # Ensure default model is loaded or trained
        from .jobs import ensure_default_model
        ensure_default_model()
    except Exception as e:
        _warm_error = str(e)
    finally:
        _warming_up = False


def start_warmup_thread():
    t = threading.Thread(target=warm_up_spark, daemon=True, name="spark-warmup")
    t.start()
    return t


def cancel_job_group(group: str) -> None:
    """Cancel all active Spark jobs belonging to a job group."""
    try:
        s = get_spark()
        s.sparkContext.cancelJobGroup(group)
    except Exception:
        pass


def is_warming_up() -> bool:
    return _warming_up


def spark_info() -> dict:
    if _spark is None and not _warming_up:
        return {
            "status": "idle",
            "driver_memory": SPARK_DRIVER_MEMORY,
            "shuffle_partitions": SPARK_SHUFFLE_PARTITIONS,
        }
    if _warming_up:
        return {
            "status": "warming_up",
            "driver_memory": SPARK_DRIVER_MEMORY,
            "shuffle_partitions": SPARK_SHUFFLE_PARTITIONS,
        }
    s = get_spark()
    sc = s.sparkContext
    return {
        "status": "ready",
        "version": s.version,
        "master": sc.master,
        "app_id": sc.applicationId,
        "default_parallelism": sc.defaultParallelism,
        "driver_memory": SPARK_DRIVER_MEMORY,
        "shuffle_partitions": SPARK_SHUFFLE_PARTITIONS,
        "ui_url": sc.uiWebUrl,
    }


def job_stats(group: str) -> dict:
    """Count Spark jobs / stages / tasks run under a job group."""
    try:
        tracker = get_spark().sparkContext.statusTracker()
        job_ids = tracker.getJobIdsForGroup(group)
        stages, tasks = 0, 0
        for jid in job_ids:
            info = tracker.getJobInfo(jid)
            if not info:
                continue
            for sid in info.stageIds:
                stages += 1
                st = tracker.getStageInfo(sid)
                if st:
                    tasks += st.numTasks
        return {"spark_jobs": len(job_ids), "stages": stages, "tasks": tasks}
    except Exception:
        return {"spark_jobs": 0, "stages": 0, "tasks": 0}
