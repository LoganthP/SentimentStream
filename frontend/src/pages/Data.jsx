import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Columns,
  Copy,
  Download,
  FileUp,
  FolderOpen,
  Link as LinkIcon,
  Pencil,
  Play,
  RotateCcw,
  Sparkles,
  StopCircle,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Card,
  CardTitle,
  ClayButton,
  ErrorNote,
  Field,
  inputCls,
  PageHeader,
  Progress,
  Segmented,
} from "../components/ui";
import { api } from "../lib/api";
import { useAppState } from "../lib/AppState";
import { bytes, full, secs, timeAgo } from "../lib/format";

const MODES = [
  { value: "auto", label: "Automatic" },
  { value: "train", label: "Train on this data" },
  { value: "pretrained", label: "Pretrained model" },
];

function MappingModal({ dataset, onClose, onUpdated }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [mapping, setMapping] = useState({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    setLoading(true);
    api.preview(dataset.id)
      .then((res) => {
        setData(res);
        setMapping(res.mapping || res.detected || {});
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [dataset.id]);

  const updateRole = (role, col) => {
    setMapping((prev) => ({ ...prev, [role]: col || null }));
  };

  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      await api.updateMapping(dataset.id, mapping);
      onUpdated();
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  const cols = data?.columns || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="clay clay-white dark:bg-zinc-900 w-full max-w-4xl max-h-[90vh] flex flex-col rounded-3xl p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between pb-3 border-b border-black/5 dark:border-white/10">
          <div>
            <h3 className="font-display text-xl font-bold">Configure Column Mapping: {dataset.name}</h3>
            <p className="text-xs text-ink-mute mt-0.5">{dataset.filename} ({dataset.fmt.toUpperCase()})</p>
          </div>
          <button onClick={onClose} className="rounded-xl p-2 text-ink-mute hover:bg-black/5 dark:hover:bg-white/10">
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading ? (
          <div className="py-16 text-center text-sm text-ink-mute">Loading preview...</div>
        ) : (
          <div className="overflow-y-auto scroll-thin py-4 space-y-5 flex-1 pr-1">
            {data?.warnings?.length > 0 && (
              <div className="space-y-1.5">
                {data.warnings.map((w, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-2xl bg-sun-soft/60 px-3.5 py-2 text-xs font-medium text-ink">
                    <AlertTriangle className="h-4 w-4 text-sun shrink-0" />
                    <span>{w}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Column Role Dropdowns */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 bg-white/40 dark:bg-white/5 p-4 rounded-3xl">
              <div>
                <label className="block text-xs font-semibold text-ink-soft mb-1">Text Column (Required)</label>
                <select
                  value={mapping.text || ""}
                  onChange={(e) => updateRole("text", e.target.value)}
                  className="neu-in w-full px-3 py-2 text-xs font-medium rounded-xl outline-none"
                >
                  <option value="">-- Select text column --</option>
                  {cols.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink-soft mb-1">Combine 2nd Text (Optional)</label>
                <select
                  value={mapping.text2 || ""}
                  onChange={(e) => updateRole("text2", e.target.value)}
                  className="neu-in w-full px-3 py-2 text-xs font-medium rounded-xl outline-none"
                >
                  <option value="">-- None (use 1 text column) --</option>
                  {cols.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink-soft mb-1">Date / Timestamp</label>
                <select
                  value={mapping.ts || ""}
                  onChange={(e) => updateRole("ts", e.target.value)}
                  className="neu-in w-full px-3 py-2 text-xs font-medium rounded-xl outline-none"
                >
                  <option value="">-- None (no timeline) --</option>
                  {cols.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink-soft mb-1">Rating Column</label>
                <select
                  value={mapping.rating || ""}
                  onChange={(e) => updateRole("rating", e.target.value)}
                  className="neu-in w-full px-3 py-2 text-xs font-medium rounded-xl outline-none"
                >
                  <option value="">-- None --</option>
                  {cols.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink-soft mb-1">Sentiment Label</label>
                <select
                  value={mapping.label || ""}
                  onChange={(e) => updateRole("label", e.target.value)}
                  className="neu-in w-full px-3 py-2 text-xs font-medium rounded-xl outline-none"
                >
                  <option value="">-- None --</option>
                  {cols.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink-soft mb-1">Product / Topic</label>
                <select
                  value={mapping.topic || ""}
                  onChange={(e) => updateRole("topic", e.target.value)}
                  className="neu-in w-full px-3 py-2 text-xs font-medium rounded-xl outline-none"
                >
                  <option value="">-- None --</option>
                  {cols.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            {/* First 20 Rows Preview Table */}
            <div>
              <p className="text-xs font-semibold text-ink-soft mb-2">First 20 Sample Rows</p>
              <div className="overflow-x-auto rounded-2xl border border-black/5 dark:border-white/10 max-h-64 scroll-thin">
                <table className="w-full text-left text-xs">
                  <thead className="bg-white/60 dark:bg-white/10 sticky top-0 text-ink-soft">
                    <tr>
                      {cols.map((c) => (
                        <th key={c} className="py-2 px-3 whitespace-nowrap font-semibold border-b border-black/5 dark:border-white/10">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data?.preview_rows?.map((row, idx) => (
                      <tr key={idx} className="border-b border-black/5 dark:border-white/5 hover:bg-black/2 dark:hover:bg-white/5">
                        {cols.map((c) => (
                          <td key={c} className="py-1.5 px-3 whitespace-nowrap max-w-xs truncate text-ink-soft">
                            {row[c] != null ? String(row[c]) : ""}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            {err && <ErrorNote>{err}</ErrorNote>}
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-black/5 dark:border-white/10">
          <button onClick={onClose} className="px-4 py-2 text-xs font-semibold text-ink-mute hover:text-ink">Cancel</button>
          <ClayButton tone="ink" onClick={save} busy={saving} disabled={loading || !mapping.text}>
            Save Mapping
          </ClayButton>
        </div>
      </div>
    </div>
  );
}

function Dropzone({ onUploaded }) {
  const [tab, setTab] = useState("file"); // "file" | "import"
  const [drag, setDrag] = useState(false);
  const [file, setFile] = useState(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [err, setErr] = useState(null);
  const abortCtrl = useRef(null);
  const input = useRef(null);

  // Import fields
  const [url, setUrl] = useState("");
  const [serverPath, setServerPath] = useState("");

  async function upload() {
    if (!file) return;
    setBusy(true);
    setErr(null);
    setUploadProgress({ percent: 0, speedMBs: "0.0", etaSec: 0 });
    abortCtrl.current = new AbortController();

    try {
      const ds = await api.upload(file, name || undefined, setUploadProgress, abortCtrl.current.signal);
      setFile(null);
      setName("");
      setUploadProgress(null);
      onUploaded(ds);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  function cancelUpload() {
    if (abortCtrl.current) {
      abortCtrl.current.abort();
    }
    setBusy(false);
    setUploadProgress(null);
  }

  async function importData() {
    if (!url && !serverPath) return;
    setBusy(true);
    setErr(null);
    try {
      const ds = await api.importDataset({
        url: url.trim() || undefined,
        server_path: serverPath.trim() || undefined,
        name: name.trim() || undefined,
      });
      setUrl("");
      setServerPath("");
      setName("");
      onUploaded(ds);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="flex items-center justify-between gap-2 mb-3">
        <CardTitle note="CSV, TSV, JSON, Parquet, Excel (.xlsx), .gz, .bz2, or .zip / .tar.gz archives.">
          Upload or Import Data
        </CardTitle>
        <div className="flex gap-1 bg-white/40 dark:bg-white/5 p-1 rounded-2xl text-xs font-semibold">
          <button
            onClick={() => setTab("file")}
            className={`px-3 py-1 rounded-xl transition-all ${tab === "file" ? "clay clay-ink text-white" : "text-ink-mute hover:text-ink"}`}
          >
            File Upload
          </button>
          <button
            onClick={() => setTab("import")}
            className={`px-3 py-1 rounded-xl transition-all ${tab === "import" ? "clay clay-ink text-white" : "text-ink-mute hover:text-ink"}`}
          >
            URL / Server Path
          </button>
        </div>
      </div>

      {tab === "file" ? (
        <>
          <div
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]); }}
            onClick={() => !busy && input.current?.click()}
            role="button" tabIndex={0}
            className={`neu-in flex cursor-pointer flex-col items-center justify-center gap-2 rounded-4xl px-6 py-10 text-center transition-all
                        ${drag ? "scale-[1.01] ring-4 ring-neu/40" : ""}`}
          >
            <motion.div animate={drag ? { y: -6, scale: 1.1 } : { y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 12 }}
                        className="clay clay-white flex h-14 w-14 items-center justify-center">
              <FileUp className="h-6 w-6 text-neu" />
            </motion.div>
            <p className="font-semibold">{file ? file.name : "Drop a file here or click to browse"}</p>
            <p className="text-xs text-ink-mute">{file ? bytes(file.size) : "Up to 10 GB. Automatic chunked & resumable upload."}</p>
            <input ref={input} type="file" accept=".csv,.tsv,.txt,.json,.jsonl,.ndjson,.parquet,.xlsx,.zip,.tar.gz,.gz,.bz2" className="hidden"
                   onChange={(e) => setFile(e.target.files[0])} />
          </div>

          {uploadProgress && (
            <div className="mt-4 rounded-3xl bg-white/60 dark:bg-white/5 p-4 space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span>Uploading in chunks... {uploadProgress.percent}%</span>
                <span className="text-ink-mute">{uploadProgress.speedMBs} MB/s • ~{uploadProgress.etaSec}s left</span>
              </div>
              <Progress value={uploadProgress.percent / 100} />
              <div className="flex justify-end pt-1">
                <button onClick={cancelUpload} className="text-xs font-semibold text-neg hover:underline">
                  Cancel Upload
                </button>
              </div>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-end gap-3">
            <Field label="Dataset name (optional)" className="min-w-[200px] flex-1">
              <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Phone reviews, March" />
            </Field>
            <ClayButton icon={FileUp} onClick={upload} busy={busy} disabled={!file}>
              Upload
            </ClayButton>
          </div>
        </>
      ) : (
        <div className="space-y-3">
          <Field label="Direct Download URL (HTTP / HTTPS)">
            <div className="relative">
              <input
                className={`${inputCls} pl-9`}
                value={url}
                onChange={(e) => { setUrl(e.target.value); setServerPath(""); }}
                placeholder="https://example.com/datasets/reviews.csv.gz"
              />
              <LinkIcon className="absolute left-3 top-2.5 h-4 w-4 text-ink-mute" />
            </div>
          </Field>
          <Field label="Or Server Path / HDFS URI">
            <div className="relative">
              <input
                className={`${inputCls} pl-9`}
                value={serverPath}
                onChange={(e) => { setServerPath(e.target.value); setUrl(""); }}
                placeholder="hdfs://namenode:9000/data/sample.csv or C:\data\reviews.parquet"
              />
              <FolderOpen className="absolute left-3 top-2.5 h-4 w-4 text-ink-mute" />
            </div>
          </Field>
          <div className="flex flex-wrap items-end gap-3 pt-2">
            <Field label="Dataset name (optional)" className="min-w-[200px] flex-1">
              <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Imported Benchmark" />
            </Field>
            <ClayButton icon={Download} onClick={importData} busy={busy} disabled={!url && !serverPath}>
              Import
            </ClayButton>
          </div>
        </div>
      )}

      <div className="mt-3"><ErrorNote>{err}</ErrorNote></div>
    </Card>
  );
}

function SampleMaker({ onCreated }) {
  const [rows, setRows] = useState("100000");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  async function make() {
    setBusy(true);
    setErr(null);
    try { onCreated(await api.sample(Number(rows))); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  return (
    <Card className="bg-gradient-to-br from-pos-soft/60 to-white/40 dark:to-white/5">
      <CardTitle note="A simulated launch week for the Nova X5 phone: a camera-loving start, then a software update that drains batteries.">
        Generate demo data
      </CardTitle>
      <Segmented label="Dataset size" value={rows} onChange={setRows}
                 options={[{ value: "10000", label: "10K" }, { value: "100000", label: "100K" }, { value: "1000000", label: "1M" }]} />
      <p className="mt-3 text-xs text-ink-mute">Includes about 2% reposts and some empty posts so you can see cleaning at work.</p>
      <div className="mt-4"><ClayButton tone="pos" icon={Sparkles} onClick={make} busy={busy}>Generate {Number(rows).toLocaleString()} posts</ClayButton></div>
      <div className="mt-3"><ErrorNote>{err}</ErrorNote></div>
    </Card>
  );
}

function InlineRename({ value, onSave, ariaLabel, className = "", inputClassName = "" }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  const [inlineError, setInlineError] = useState(null);
  const [toastError, setToastError] = useState(null);
  const inputRef = useRef(null);
  const isEscapingRef = useRef(false);

  useEffect(() => {
    setText(value);
  }, [value]);

  useEffect(() => {
    if (editing) {
      isEscapingRef.current = false;
      setInlineError(null);
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select();
      }
    }
  }, [editing]);

  const handleStart = (e) => {
    e.stopPropagation();
    setText(value);
    setInlineError(null);
    setEditing(true);
  };

  const handleCancel = () => {
    isEscapingRef.current = true;
    setText(value);
    setInlineError(null);
    setEditing(false);
  };

  const handleCommit = async () => {
    if (isEscapingRef.current) {
      isEscapingRef.current = false;
      return;
    }
    const trimmed = text.trim();
    if (!trimmed) {
      setInlineError("Name cannot be empty");
      return;
    }
    if (trimmed.length > 80) {
      setInlineError("Name cannot exceed 80 characters");
      return;
    }
    if (trimmed === value) {
      setEditing(false);
      setInlineError(null);
      return;
    }
    setEditing(false);
    setInlineError(null);
    try {
      await onSave(trimmed);
    } catch (err) {
      setToastError(err.message || "Failed to rename");
      setTimeout(() => setToastError(null), 4000);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleCommit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleCancel();
    }
  };

  return (
    <div className="relative min-w-0 max-w-full">
      {editing ? (
        <div className="flex flex-col gap-1 w-full" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-1.5">
            <input
              ref={inputRef}
              type="text"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                if (inlineError) setInlineError(null);
              }}
              onKeyDown={handleKeyDown}
              onBlur={handleCommit}
              maxLength={80}
              aria-label={ariaLabel}
              className={`neu-in rounded-xl px-2.5 py-1 text-sm font-semibold text-ink outline-none transition-all w-full ${inputClassName}`}
            />
          </div>
          {inlineError && (
            <p className="text-[11px] font-semibold text-neg px-1">{inlineError}</p>
          )}
        </div>
      ) : (
        <div className="group flex items-center gap-1.5 min-w-0 max-w-full">
          <span className={`truncate ${className}`}>{value}</span>
          <button
            type="button"
            onClick={handleStart}
            aria-label={ariaLabel}
            className="rounded-lg p-1 text-ink-mute hover:text-ink hover:bg-black/5 dark:hover:bg-white/10 transition-opacity opacity-70 hover:opacity-100 sm:opacity-50 sm:group-hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-1 focus:ring-neu/50 shrink-0"
            title={ariaLabel}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      {toastError && (
        <div className="absolute left-0 -top-8 z-20 flex items-center gap-1.5 rounded-lg bg-neg-soft px-2.5 py-1 text-xs font-semibold text-neg-text shadow-md border border-neg/20">
          <span>{toastError}</span>
        </div>
      )}
    </div>
  );
}

function DatasetRow({ ds, onRun, onDelete, onConfigure, onRename, isDeleting = false }) {
  const [mode, setMode] = useState("auto");
  const [trainOnData, setTrainOnData] = useState(false);
  const [busy, setBusy] = useState(false);
  const mapping = ds.mapping || ds.detected || {};
  const roles = Object.entries(mapping).filter(([k, v]) => k !== "id" && Boolean(v));

  return (
    <motion.li layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -20 }}
               className="rounded-3xl bg-white/55 dark:bg-white/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <InlineRename
            value={ds.name}
            onSave={(newName) => onRename(ds.id, newName)}
            ariaLabel="Rename dataset"
            className="font-display text-lg font-semibold"
          />
          <p className="text-xs text-ink-mute">
            {ds.fmt.toUpperCase()}, {bytes(ds.size_bytes)}{ds.rows ? `, ${full(ds.rows)} rows` : ""}, added {timeAgo(ds.created_at)}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5 items-center">
            {roles.map(([role, col]) => (
              <span key={role} className="rounded-full bg-lilac-deep px-2.5 py-0.5 text-xs">
                <span className="text-ink-mute">{role === "ts" ? "date" : role}:</span> <b>{col}</b>
              </span>
            ))}
            <button
              onClick={() => onConfigure(ds)}
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold text-neu hover:bg-neu-soft transition-colors"
            >
              <Columns className="h-3 w-3" /> Mapping
            </button>
          </div>
        </div>
        <button onClick={() => onDelete(ds)} disabled={isDeleting} className="rounded-xl p-2 text-ink-mute hover:bg-neg-soft hover:text-neg disabled:opacity-40" aria-label={`Delete ${ds.name}`}>
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Segmented size="sm" label="Classifier" value={mode} onChange={setMode} options={MODES} />
        {mode === "auto" && mapping.label && (
          <label className="flex items-center gap-1.5 text-xs font-semibold text-ink-soft cursor-pointer">
            <input
              type="checkbox"
              checked={trainOnData}
              onChange={(e) => setTrainOnData(e.target.checked)}
              className="rounded"
            />
            Train on this data
          </label>
        )}
        <ClayButton
          tone="ink"
          icon={Play}
          busy={busy}
          className="ml-auto"
          onClick={async () => {
            setBusy(true);
            try {
              await onRun(ds, mode, trainOnData);
            } finally {
              setBusy(false);
            }
          }}
        >
          Analyse
        </ClayButton>
      </div>
    </motion.li>
  );
}

function JobRow({ j, selected, onOpen, onCancel, onRetry, onRename }) {
  const [copied, setCopied] = useState(false);
  const icon = j.status === "completed" ? <CheckCircle2 className="h-5 w-5 text-pos" />
    : j.status === "failed" ? <XCircle className="h-5 w-5 text-neg" />
    : j.status === "interrupted" ? <RotateCcw className="h-5 w-5 text-sun" />
    : j.status === "cancelled" ? <StopCircle className="h-5 w-5 text-ink-mute" />
    : null;
  const kind = { analysis: "Analysis", benchmark: "Benchmark", train_default: "Model training" }[j.kind];
  const isRunning = j.status === "running" || j.status === "queued";
  const defaultJobLabel = j.name || `${kind}${j.dataset_name ? `: ${j.dataset_name}` : ""}`;

  return (
    <li className={`rounded-3xl bg-white/55 dark:bg-white/5 p-4 ${selected ? "ring-2 ring-neu/60" : ""}`}>
      <div className="flex items-center gap-3">
        {icon}
        <div className="min-w-0 flex-1">
          <InlineRename
            value={defaultJobLabel}
            onSave={(newName) => onRename(j.id, newName)}
            ariaLabel="Rename job"
            className="font-semibold text-ink"
          />
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-mute">
            <span className="font-mono text-[11px]">{j.id}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(j.id);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              aria-label="Copy job ID"
              className="rounded p-0.5 text-ink-mute hover:text-ink hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
              title={copied ? "Copied!" : "Copy job ID"}
            >
              {copied ? <Check className="h-3 w-3 text-pos" /> : <Copy className="h-3 w-3" />}
            </button>
            <span>·</span>
            <span>started {timeAgo(j.created_at)}</span>
          </div>
        </div>
        {j.kind === "analysis" && (
          <div className="flex items-center gap-1.5">
            {isRunning && (
              <button onClick={() => onCancel(j.id)} className="neu-out px-2.5 py-1 text-xs font-semibold text-neg hover:bg-neg-soft">
                Cancel
              </button>
            )}
            {(j.status === "interrupted" || j.status === "failed") && (
              <button onClick={() => onRetry(j.id)} className="neu-out px-2.5 py-1 text-xs font-semibold text-ink-soft hover:text-ink">
                Retry
              </button>
            )}
            <button onClick={() => onOpen(j.id)} className="neu-out px-3 py-1.5 text-xs font-semibold">
              {selected ? "Showing" : "Show"}
            </button>
          </div>
        )}
      </div>
      {isRunning && (
        <div className="mt-3">
          <Progress value={j.progress} />
          <p className="mt-1.5 text-xs text-ink-soft">{j.stage}</p>
        </div>
      )}
      {j.status === "completed" && j.metrics?.seconds != null && (
        <p className="mt-2 text-xs text-ink-soft">{full(j.metrics.rows)} posts in {secs(j.metrics.seconds)}, {j.metrics.model_used}</p>
      )}
      {(j.status === "failed" || j.status === "interrupted") && (
        <p className="mt-2 break-words text-xs text-neg-text">{j.error}</p>
      )}
    </li>
  );
}

export default function Data() {
  const { jobs, refreshJobs, selectedId, setSelectedId, renameJob, onDatasetRenamed } = useAppState();
  const [datasets, setDatasets] = useState([]);
  const [configureDs, setConfigureDs] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [err, setErr] = useState(null);

  const load = useCallback(() => api.datasets().then(setDatasets).catch((e) => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);

  async function handleRenameDataset(datasetId, newName) {
    let rollbackDatasets;
    setDatasets((prev) => {
      rollbackDatasets = prev;
      return prev.map((d) => (d.id === datasetId ? { ...d, name: newName } : d));
    });
    onDatasetRenamed(datasetId, newName);
    try {
      await api.renameDataset(datasetId, newName);
    } catch (e) {
      if (rollbackDatasets) setDatasets(rollbackDatasets);
      throw e;
    }
  }

  async function handleRenameJob(jobId, newName) {
    return renameJob(jobId, newName);
  }

  async function run(ds, mode, trainOnData) {
    setErr(null);
    try {
      await api.startAnalysis(ds.id, mode, ds.mapping, trainOnData);
      await refreshJobs();
    } catch (e) {
      setErr(e.message);
    }
  }

  async function handleCancel(jobId) {
    try {
      await api.cancelJob(jobId);
      await refreshJobs();
    } catch (e) {
      setErr(e.message);
    }
  }

  async function handleRetry(jobId) {
    try {
      await api.retryJob(jobId);
      await refreshJobs();
    } catch (e) {
      setErr(e.message);
    }
  }

  async function remove(ds) {
    if (deletingId) return;
    if (!confirm(`Delete "${ds.name}"? Finished analyses stay available.`)) return;
    setDeletingId(ds.id);
    try {
      await api.deleteDataset(ds.id);
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div>
      <PageHeader title="Data and jobs">
        Bring in posts, then run a Spark analysis. Automatic mode uses the fast pretrained classifier by default or trains when requested.
      </PageHeader>
      <div className="grid gap-5 lg:grid-cols-12">
        <div className="space-y-5 lg:col-span-7">
          <Dropzone onUploaded={load} />
          <Card>
            <CardTitle note={`${datasets.length} available`}>Your datasets</CardTitle>
            <ErrorNote>{err}</ErrorNote>
            {datasets.length ? (
              <ul className="space-y-3">
                <AnimatePresence>
                  {datasets.map((ds) => (
                    <DatasetRow
                      key={ds.id}
                      ds={ds}
                      onRun={run}
                      onDelete={remove}
                      isDeleting={deletingId === ds.id}
                      onConfigure={setConfigureDs}
                      onRename={handleRenameDataset}
                    />
                  ))}
                </AnimatePresence>
              </ul>
            ) : <p className="text-sm text-ink-mute">Upload a file or generate demo data to get started.</p>}
          </Card>
        </div>
        <div className="space-y-5 lg:col-span-5">
          <SampleMaker onCreated={load} />
          <Card>
            <CardTitle note="Jobs run on the shared Spark session">Jobs</CardTitle>
            {jobs.length ? (
              <ul className="scroll-thin max-h-[640px] space-y-3 overflow-y-auto pr-1">
                {jobs.map((j) => (
                  <JobRow
                    key={j.id}
                    j={j}
                    selected={j.id === selectedId}
                    onOpen={setSelectedId}
                    onCancel={handleCancel}
                    onRetry={handleRetry}
                    onRename={handleRenameJob}
                  />
                ))}
              </ul>
            ) : <p className="text-sm text-ink-mute">No jobs yet.</p>}
          </Card>
        </div>
      </div>

      {configureDs && (
        <MappingModal
          dataset={configureDs}
          onClose={() => setConfigureDs(null)}
          onUpdated={load}
        />
      )}
    </div>
  );
}
