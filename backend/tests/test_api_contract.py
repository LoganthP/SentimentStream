"""API Contract tests verifying all FastAPI endpoints against shapes expected by the frontend."""
import io
import json
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app import db

client = TestClient(app)


@pytest.fixture(autouse=True)
def init_database():
    db.init_db()


def test_health_endpoint():
    res = client.get("/api/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert "spark" in data
    assert "spark_warming_up" in data
    assert "cores" in data
    assert "driver_memory" in data
    assert "free_disk_gb" in data
    assert "storage_backend" in data
    assert "default_model_ready" in data


def test_datasets_crud_and_sample():
    # 1. Create a sample dataset
    sample_res = client.post("/api/datasets/sample", json={"rows": 1000, "name": "Contract Test Dataset"})
    assert sample_res.status_code == 200
    ds = sample_res.json()
    assert ds["id"].startswith("ds_")
    assert ds["name"] == "Contract Test Dataset"
    assert ds["fmt"] == "csv"
    assert ds["rows"] == 1000
    assert "columns" in ds
    assert "mapping" in ds

    ds_id = ds["id"]

    # 2. List datasets
    list_res = client.get("/api/datasets")
    assert list_res.status_code == 200
    datasets = list_res.json()
    assert any(d["id"] == ds_id for d in datasets)

    # 3. Preview dataset
    preview_res = client.get(f"/api/datasets/{ds_id}/preview")
    assert preview_res.status_code == 200
    prev = preview_res.json()
    assert "columns" in prev
    assert "preview_rows" in prev
    assert len(prev["preview_rows"]) > 0
    assert "detected" in prev
    assert "mapping" in prev

    # 4. Update mapping
    mapping = prev["mapping"]
    mapping["topic"] = "brand"
    patch_res = client.patch(f"/api/datasets/{ds_id}/mapping", json={"mapping": mapping})
    assert patch_res.status_code == 200
    updated_ds = patch_res.json()
    assert updated_ds["mapping"]["topic"] == "brand"

    # 5. Rename dataset
    rename_res = client.patch(f"/api/datasets/{ds_id}", json={"name": "Renamed Contract Dataset"})
    assert rename_res.status_code == 200
    renamed = rename_res.json()
    assert renamed["name"] == "Renamed Contract Dataset"

    # 6. Delete dataset
    del_res = client.delete(f"/api/datasets/{ds_id}")
    assert del_res.status_code == 200
    assert del_res.json() == {"deleted": ds_id}

    # Verify 404 after deletion
    preview_404 = client.get(f"/api/datasets/{ds_id}/preview")
    assert preview_404.status_code == 404


def test_chunked_upload_lifecycle():
    # 1. Init upload
    init_res = client.post("/api/uploads", json={"filename": "test_stream.csv", "size_bytes": 1024})
    assert init_res.status_code == 200
    init_data = init_res.json()
    upload_id = init_data["upload_id"]
    assert upload_id.startswith("upl_")
    assert "chunk_size" in init_data

    # 2. Upload a chunk
    csv_chunk = b"id,text,rating\n1,Great experience!,5\n2,Terrible delay,1\n"
    put_res = client.put(f"/api/uploads/{upload_id}/chunks/0", content=csv_chunk)
    assert put_res.status_code == 200
    assert put_res.json()["index"] == 0

    # 3. Complete chunked upload
    complete_res = client.post(f"/api/uploads/{upload_id}/complete", json={"name": "Uploaded via chunks"})
    assert complete_res.status_code == 200
    ds = complete_res.json()
    assert ds["id"].startswith("ds_")
    assert ds["name"] == "Uploaded via chunks"

    # Clean up
    client.delete(f"/api/datasets/{ds['id']}")


def test_abort_chunked_upload():
    init_res = client.post("/api/uploads", json={"filename": "aborted.csv", "size_bytes": 2048})
    upload_id = init_res.json()["upload_id"]
    del_res = client.delete(f"/api/uploads/{upload_id}")
    assert del_res.status_code == 200
    assert del_res.json() == {"cancelled": upload_id}


def test_jobs_list_and_filter():
    jobs_res = client.get("/api/jobs")
    assert jobs_res.status_code == 200
    assert isinstance(jobs_res.json(), list)

    analyses_res = client.get("/api/jobs?kind=analysis")
    assert analyses_res.status_code == 200
    assert isinstance(analyses_res.json(), list)


def test_model_info():
    model_res = client.get("/api/model")
    assert model_res.status_code == 200
    data = model_res.json()
    assert "ready" in data


def test_predict_validation():
    # Empty texts list rejected
    bad_res = client.post("/api/predict", json={"texts": []})
    assert bad_res.status_code == 422  # validation error
