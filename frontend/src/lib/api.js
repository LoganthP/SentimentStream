export const API = (import.meta.env.VITE_API_URL || "http://localhost:8000").replace(/\/$/, "");

async function req(path, opts = {}) {
  let r;
  try {
    r = await fetch(API + path, opts);
  } catch {
    throw new Error(`Can't reach the API at ${API}. Start the backend with: uvicorn app.main:app --port 8000`);
  }
  if (!r.ok) {
    let msg = `${r.status} ${r.statusText}`;
    try {
      const j = await r.json();
      msg = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail);
    } catch { /* not JSON */ }
    throw new Error(msg);
  }
  return r.json();
}

const post = (path, body) =>
  req(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

const patch = (path, body) =>
  req(path, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export const api = {
  health: () => req("/api/health"),
  datasets: () => req("/api/datasets"),
  
  // Smart Upload: chunked for files > 8MB, simple for smaller
  upload: async (file, name, onProgress, abortSignal) => {
    const CHUNK_SIZE = 8 * 1024 * 1024; // 8MB
    if (file.size <= CHUNK_SIZE) {
      const fd = new FormData();
      fd.append("file", file);
      if (name) fd.append("name", name);
      return req("/api/datasets/upload", { method: "POST", body: fd, signal: abortSignal });
    }

    // Initialize chunked upload
    const init = await post("/api/uploads", { filename: file.name, size_bytes: file.size });
    const { upload_id, chunk_size = CHUNK_SIZE } = init;
    const totalChunks = Math.ceil(file.size / chunk_size);
    let uploadedBytes = 0;
    const startTime = Date.now();

    for (let i = 0; i < totalChunks; i++) {
      if (abortSignal?.aborted) {
        await req(`/api/uploads/${upload_id}`, { method: "DELETE" }).catch(() => {});
        throw new Error("Upload cancelled");
      }

      const start = i * chunk_size;
      const end = Math.min(file.size, start + chunk_size);
      const chunk = file.slice(start, end);

      // Retry up to 3 times per chunk
      let attempts = 0;
      let success = false;
      while (attempts < 3 && !success) {
        try {
          await req(`/api/uploads/${upload_id}/chunks/${i}`, {
            method: "PUT",
            headers: { "Content-Type": "application/octet-stream" },
            body: chunk,
            signal: abortSignal,
          });
          success = true;
        } catch (err) {
          attempts++;
          if (attempts >= 3 || abortSignal?.aborted) throw err;
          await new Promise((res) => setTimeout(res, 1000));
        }
      }

      uploadedBytes += chunk.size;
      const elapsedSec = (Date.now() - startTime) / 1000;
      const speedMBs = elapsedSec > 0 ? (uploadedBytes / 1024 / 1024) / elapsedSec : 0;
      const remainingBytes = file.size - uploadedBytes;
      const etaSec = speedMBs > 0 ? (remainingBytes / 1024 / 1024) / speedMBs : 0;

      if (onProgress) {
        onProgress({
          percent: Math.min(99, Math.round((uploadedBytes / file.size) * 100)),
          speedMBs: speedMBs.toFixed(1),
          etaSec: Math.round(etaSec),
          uploadedBytes,
          totalBytes: file.size,
        });
      }
    }

    // Complete upload & assemble
    return post(`/api/uploads/${upload_id}/complete`, { name });
  },

  importDataset: (params) => post("/api/datasets/import", params),
  preview: (id) => req(`/api/datasets/${id}/preview`),
  updateMapping: (id, mapping) => patch(`/api/datasets/${id}/mapping`, { mapping }),
  renameDataset: (id, name) => patch(`/api/datasets/${id}`, { name }),

  sample: (rows) => post("/api/datasets/sample", { rows }),
  deleteDataset: (id) => req(`/api/datasets/${id}`, { method: "DELETE" }),
  jobs: (kind) => req(`/api/jobs${kind ? `?kind=${kind}` : ""}`),
  job: (id) => req(`/api/jobs/${id}`),
  renameJob: (id, name) => patch(`/api/jobs/${id}`, { name }),
  startAnalysis: (dataset_id, model_mode = "auto", mapping = null, train_on_data = false) =>
    post("/api/jobs", { dataset_id, model_mode, mapping, train_on_data }),
  cancelJob: (id) => post(`/api/jobs/${id}/cancel`, {}),
  retryJob: (id) => post(`/api/jobs/${id}/retry`, {}),
  results: (id) => req(`/api/jobs/${id}/results`),
  query: (id, filters) => post(`/api/jobs/${id}/query`, filters),
  posts: (id, params) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== "" && v != null));
    return req(`/api/jobs/${id}/posts?${qs}`);
  },
  startBenchmark: (body) => post("/api/benchmarks", body),
  latestBenchmark: () => req("/api/benchmarks/latest"),
  model: () => req("/api/model"),
  trainModel: () => post("/api/model/train", {}),
  predict: (texts, job_id) => post("/api/predict", { texts, job_id }),
  reportUrl: (id, fmt) => `${API}/api/jobs/${id}/report?format=${fmt}`,
};
