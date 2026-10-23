"""Tests for dataset and job rename feature.

Covers:
- Rename success for datasets and jobs
- Trimming leading/trailing whitespace
- Empty or whitespace-only rejection (400)
- Exceeding 80 characters rejection (400)
- Boundary condition: 80 characters accepted
- Unknown ID returns 404
- Duplicate names allowed
- Internal IDs and storage paths are immutable and unchanged
- Sensible defaults & backfilling for existing records without names
- Report title uses display name while preserving job ID in metadata
"""
import unittest
from fastapi import HTTPException

from app import db, reports
from app.main import (
    RenameRequest,
    _sanitize_filename,
    _validate_rename,
    rename_dataset,
    rename_job,
)


class TestRenameFeature(unittest.TestCase):
    def setUp(self):
        db.init_db()

    def test_validation_rules(self):
        # Trimming
        self.assertEqual(_validate_rename("  Clean Name  "), "Clean Name")
        self.assertEqual(_validate_rename("Nova X5 Launch"), "Nova X5 Launch")

        # Empty and whitespace rejection
        with self.assertRaises(HTTPException) as ctx:
            _validate_rename("")
        self.assertEqual(ctx.exception.status_code, 400)

        with self.assertRaises(HTTPException) as ctx:
            _validate_rename("   \t\n  ")
        self.assertEqual(ctx.exception.status_code, 400)

        # Boundary: 80 chars ok, 81 chars rejected
        name_80 = "A" * 80
        self.assertEqual(_validate_rename(name_80), name_80)

        name_81 = "A" * 81
        with self.assertRaises(HTTPException) as ctx:
            _validate_rename(name_81)
        self.assertEqual(ctx.exception.status_code, 400)

    def test_dataset_rename_flow(self):
        # 1. Create a dataset
        ds = db.insert_dataset(
            id=db.new_id("ds"),
            name="Original Dataset Name",
            filename="reviews_sample.csv",
            path="/data/lake/ds_test.csv",
            fmt="csv",
            size_bytes=1024,
        )
        original_id = ds["id"]
        original_path = ds["path"]
        self.assertEqual(ds["name"], "Original Dataset Name")

        # 2. Rename dataset
        updated = rename_dataset(original_id, RenameRequest(name="  Renamed Dataset  "))
        self.assertEqual(updated["name"], "Renamed Dataset")
        self.assertEqual(updated["id"], original_id)  # Immutable ID
        self.assertEqual(updated["path"], original_path)  # Immutable path

        # 3. Verify read from DB
        fetched = db.get_dataset(original_id)
        self.assertEqual(fetched["name"], "Renamed Dataset")
        self.assertEqual(fetched["id"], original_id)
        self.assertEqual(fetched["path"], original_path)

        # 4. Unknown dataset 404
        with self.assertRaises(HTTPException) as ctx:
            rename_dataset("ds_nonexistent_id", RenameRequest(name="New Name"))
        self.assertEqual(ctx.exception.status_code, 404)

        # 5. Empty name 400
        with self.assertRaises(HTTPException) as ctx:
            rename_dataset(original_id, RenameRequest(name="   "))
        self.assertEqual(ctx.exception.status_code, 400)

        # 6. Duplicate names allowed
        ds2 = db.insert_dataset(
            id=db.new_id("ds"),
            name="Another Dataset",
            filename="another.csv",
            path="/data/lake/another.csv",
            fmt="csv",
        )
        updated2 = rename_dataset(ds2["id"], RenameRequest(name="Renamed Dataset"))
        self.assertEqual(updated2["name"], "Renamed Dataset")
        self.assertEqual(updated2["id"], ds2["id"])

    def test_job_rename_flow(self):
        # 1. Create dataset and job
        ds = db.insert_dataset(
            id=db.new_id("ds"),
            name="Nova X5",
            filename="nova_x5.csv",
            path="/data/lake/nova_x5.csv",
            fmt="csv",
        )
        job = db.insert_job("analysis", ds["id"], {"model_mode": "auto"})
        original_job_id = job["id"]
        self.assertTrue(original_job_id.startswith("job_"))
        # Verify default name format: "<Job type> · <dataset name> · <short date-time>"
        self.assertIn("Analysis", job["name"])
        self.assertIn("Nova X5", job["name"])

        # 2. Rename job
        updated = rename_job(original_job_id, RenameRequest(name="  Quarterly Analysis Q3  "))
        self.assertEqual(updated["name"], "Quarterly Analysis Q3")
        self.assertEqual(updated["id"], original_job_id)  # Immutable ID
        self.assertEqual(updated["dataset_id"], ds["id"])

        # 3. Verify read from DB
        fetched = db.get_job(original_job_id)
        self.assertEqual(fetched["name"], "Quarterly Analysis Q3")
        self.assertEqual(fetched["id"], original_job_id)

        # 4. Unknown job 404
        with self.assertRaises(HTTPException) as ctx:
            rename_job("job_nonexistent_id", RenameRequest(name="New Job Name"))
        self.assertEqual(ctx.exception.status_code, 404)

        # 5. Empty name 400
        with self.assertRaises(HTTPException) as ctx:
            rename_job(original_job_id, RenameRequest(name=""))
        self.assertEqual(ctx.exception.status_code, 400)

    def test_default_names_and_backfill(self):
        # If job created without dataset
        job_no_ds = db.insert_job("benchmark", None, {"sizes": [1000]})
        self.assertTrue(job_no_ds["name"].startswith("Benchmark · "))
        self.assertTrue(job_no_ds["id"].startswith("job_"))

        # If dataset has no name given, default is filename stem
        ds_no_name = db.insert_dataset(
            id=db.new_id("ds"),
            name="",
            filename="raw_social_posts.json",
            path="/data/lake/raw_social_posts.json",
            fmt="json",
        )
        self.assertEqual(ds_no_name["name"], "raw_social_posts")

    def test_report_formatting(self):
        # Sanitization for download filename
        self.assertEqual(_sanitize_filename("Analysis · Nova X5 launch · 23 Oct, 14:05"), "Analysis_Nova_X5_launch_23_Oct_1405")
        self.assertEqual(_sanitize_filename("Report @#$ 2026!!"), "Report_2026")
        self.assertEqual(_sanitize_filename("   "), "report")

        # Markdown report contains display name in title, and job_id in metadata
        dummy_results = {
            "job_id": "job_1234567890",
            "dataset": {"name": "Old Dataset Name"},
            "cleaning": {"raw_rows": 1000, "missing_removed": 10, "duplicates_removed": 5, "after_dedup": 985},
            "performance": {"total_seconds": 12.3, "spark": {"version": "3.5.3", "master": "local[*]"}, "storage_backend": "lake", "stage_seconds": {}, "spark_jobs": 2, "stages": 3, "tasks": 4, "peak_memory_mb": 512},
            "model": {"used": "pretrained", "metrics": {}},
            "distribution": {"counts": {"positive": 500, "neutral": 300, "negative": 185}, "percent": {"positive": 50.8, "neutral": 30.5, "negative": 18.8}, "net_score": 32.0},
            "aspects": [],
            "emerging": [],
            "anomalies": [],
        }
        md = reports.to_markdown(dummy_results, display_name="Custom Sentiment Analysis")
        self.assertIn("# SentimentStream report: Custom Sentiment Analysis", md)
        self.assertIn("Job `job_1234567890`", md)


if __name__ == "__main__":
    unittest.main()
