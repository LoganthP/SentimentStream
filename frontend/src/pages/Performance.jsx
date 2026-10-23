import { Play } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { GlassTooltip, SimpleBars } from "../components/charts";
import { Card, CardTitle, ClayButton, ErrorNote, PageHeader, Progress } from "../components/ui";
import { api } from "../lib/api";
import { useAppState } from "../lib/AppState";
import { full, mem, num, secs } from "../lib/format";

const SIZES = [10000, 100000, 500000, 1000000];
const SERIES = [
  { key: "python", name: "Plain Python", color: "var(--color-sun)" },
  { key: "spark_etl", name: "Spark ETL", color: "var(--color-neu)" },
  { key: "spark_full", name: "Spark + MLlib", color: "var(--color-pos)" },
];
const axis = { fontSize: 12, fill: "var(--chart-axis)" };

function Toggle({ on, onClick, children }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick}
            className={`neu-out px-4 py-2 text-sm font-semibold ${on ? "text-ink" : "text-ink-mute"}`}>
      {children}
    </button>
  );
}

function BenchmarkRunner({ onDone }) {
  const { jobs, refreshJobs } = useAppState();
  const [sizes, setSizes] = useState([10000, 100000, 1000000]);
  const [python, setPython] = useState(true);
  const [fullRun, setFullRun] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const running = jobs.find((j) => j.kind === "benchmark" && (j.status === "running" || j.status === "queued"));
  const lastDone = jobs.find((j) => j.kind === "benchmark" && j.status === "completed")?.id;
  const failed = jobs.find((j) => j.kind === "benchmark")?.status === "failed" ? jobs.find((j) => j.kind === "benchmark") : null;

  useEffect(() => { if (lastDone) onDone(); }, [lastDone, onDone]);

  const flip = (s) => setSizes((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s].sort((a, b) => a - b)));

  async function start() {
    setBusy(true);
    setErr(null);
    try {
      await api.startBenchmark({ sizes, include_python: python, include_full: fullRun });
      await refreshJobs();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <Card className="bg-gradient-to-br from-neu-soft/70 to-white/40 dark:to-white/5">
      <CardTitle note="Runs the same cleaning and aggregation workload with plain Python and with Spark, at each size.">
        Run a scaling benchmark
      </CardTitle>
      <p className="mb-2 text-xs font-semibold text-ink-soft">Dataset sizes</p>
      <div className="flex flex-wrap gap-2">
        {SIZES.map((s) => <Toggle key={s} on={sizes.includes(s)} onClick={() => flip(s)}>{num(s)} rows</Toggle>)}
      </div>
      <p className="mb-2 mt-4 text-xs font-semibold text-ink-soft">Include</p>
      <div className="flex flex-wrap gap-2">
        <Toggle on={python} onClick={() => setPython(!python)}>Plain Python baseline</Toggle>
        <Toggle on={fullRun} onClick={() => setFullRun(!fullRun)}>Spark with sentiment model</Toggle>
      </div>
      <div className="mt-5">
        {running ? (
          <>
            <Progress value={running.progress} />
            <p className="mt-2 text-sm text-ink-soft">{running.stage}</p>
          </>
        ) : (
          <ClayButton icon={Play} onClick={start} busy={busy} disabled={!sizes.length}>Run benchmark</ClayButton>
        )}
      </div>
      <p className="mt-3 text-xs text-ink-mute">
        A 1M-row run takes a few minutes. Test files are generated once and reused.
      </p>
      <div className="mt-3"><ErrorNote>{err || (failed && `Last benchmark failed: ${failed.error}`)}</ErrorNote></div>
    </Card>
  );
}

function BenchmarkResults({ bench }) {
  const rows = bench.results;
  const present = SERIES.filter((s) => rows.some((r) => r[s.key]));
  const timeData = rows.map((r) => ({ rows: num(r.rows), ...Object.fromEntries(present.map((s) => [s.key, r[s.key]?.seconds])) }));
  const tputData = rows.map((r) => ({ rows: num(r.rows), ...Object.fromEntries(present.map((s) => [s.key, r[s.key]?.rows_per_second])) }));
  const memData = rows.map((r) => ({ rows: num(r.rows), ...Object.fromEntries(present.map((s) => [s.key, r[s.key]?.peak_memory_mb])) }));
  const biggest = rows[rows.length - 1];
  const allSecs = timeData.flatMap((d) => present.map((s) => d[s.key])).filter((v) => v > 0);
  const logDomain = [Math.min(...allSecs) / 1.6, Math.max(...allSecs) * 1.6];

  return (
    <>
      <Card className="lg:col-span-8">
        <CardTitle note="Lower is better. Log scale, so each grid line is ten times more.">Processing time by dataset size</CardTitle>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={timeData} margin={{ top: 8, right: 12, left: -6, bottom: 0 }}>
            <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
            <XAxis dataKey="rows" tick={axis} axisLine={false} tickLine={false} />
            <YAxis scale="log" domain={logDomain} tick={axis} axisLine={false} tickLine={false}
                   tickFormatter={(v) => secs(v)} />
            <Tooltip content={<GlassTooltip valueFmt={(v) => secs(v)} labelFmt={(l) => `${l} rows`} />} />
            <Legend iconType="circle" wrapperStyle={{ fontSize: 12, color: "var(--color-ink-soft)" }} />
            {present.map((s) => (
              <Line key={s.key} dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={3} dot={{ r: 5, strokeWidth: 0, fill: s.color }} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </Card>
      <Card className="lg:col-span-4">
        <CardTitle note={`At ${num(biggest.rows)} rows`}>Headline</CardTitle>
        <ul className="space-y-3">
          {present.map((s) => (
            <li key={s.key} className="rounded-2xl bg-white/60 dark:bg-white/5 px-4 py-3">
              <p className="text-xs font-semibold" style={{ color: s.key === "python" ? "var(--color-sun-text)" : s.color }}>{s.name}</p>
              <p className="font-display text-2xl font-bold">{secs(biggest[s.key].seconds)}</p>
              <p className="text-xs text-ink-mute">{full(biggest[s.key].rows_per_second)} rows/s, peak {mem(biggest[s.key].peak_memory_mb)}
                {biggest[s.key].spark_jobs != null && `, ${biggest[s.key].spark_jobs} Spark jobs`}</p>
            </li>
          ))}
        </ul>
        {biggest.speedup_vs_python != null && (
          <p className="mt-4 text-sm text-ink-soft">
            Spark ETL was <b>{biggest.speedup_vs_python >= 1 ? `${biggest.speedup_vs_python}× faster` : `${(1 / biggest.speedup_vs_python).toFixed(1)}× slower`}</b> than
            plain Python here, on {bench.spark?.default_parallelism} CPU core{bench.spark?.default_parallelism === 1 ? "" : "s"}.
          </p>
        )}
      </Card>
      <Card className="lg:col-span-6">
        <CardTitle note="Higher is better">Throughput (rows per second)</CardTitle>
        <SimpleBars data={tputData} xKey="rows" height={260} bars={present.map((s) => ({ key: s.key, name: s.name, color: s.color }))} />
      </Card>
      <Card className="lg:col-span-6">
        <CardTitle note="API process plus Spark JVM, sampled every 250 ms">Peak memory (MB)</CardTitle>
        <SimpleBars data={memData} xKey="rows" height={260} bars={present.map((s) => ({ key: s.key, name: s.name, color: s.color }))} />
      </Card>
      <Card className="lg:col-span-12">
        <CardTitle>Raw measurements</CardTitle>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs text-ink-mute">
              <tr><th className="py-2">Rows</th><th>File</th><th>Method</th><th className="text-right">Time</th>
                <th className="text-right">Rows/s</th><th className="text-right">Peak MB</th><th className="text-right">Jobs / stages / tasks</th><th className="text-right">Partitions</th></tr>
            </thead>
            <tbody>
              {rows.flatMap((r) => present.filter((s) => r[s.key]).map((s) => (
                <tr key={r.rows + s.key} className="border-t border-white/70 dark:border-white/10">
                  <td className="py-2 font-semibold">{full(r.rows)}</td><td>{r.file_mb} MB</td><td>{s.name}</td>
                  <td className="text-right">{secs(r[s.key].seconds)}</td><td className="text-right">{full(r[s.key].rows_per_second)}</td>
                  <td className="text-right">{r[s.key].peak_memory_mb}</td>
                  <td className="text-right">{r[s.key].spark_jobs != null ? `${r[s.key].spark_jobs} / ${r[s.key].stages} / ${r[s.key].tasks}` : "–"}</td>
                  <td className="text-right">{r[s.key].partitions ?? "–"}</td>
                </tr>
              )))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

export default function Performance() {
  const { results: r } = useAppState();
  const [bench, setBench] = useState(null);
  const load = useCallback(() => { api.latestBenchmark().then((b) => setBench(b.results)).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);

  const perf = r?.performance;
  return (
    <div>
      <PageHeader title="Performance">
        Spark has a fixed start-up cost, so plain Python wins on small files. The benchmark shows the size where
        distributed processing starts to pay off on your machine.
      </PageHeader>
      <div className="grid gap-5 lg:grid-cols-12">
        <div className="lg:col-span-5"><BenchmarkRunner onDone={load} /></div>
        <Card className="lg:col-span-7">
          <CardTitle note={perf ? r.dataset.name : "Run an analysis to see its stats"}>This analysis on Spark</CardTitle>
          {perf ? (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[["Total time", secs(perf.total_seconds)], ["Rows per second", full(perf.rows_per_second)],
                  ["Peak memory", mem(perf.peak_memory_mb)], ["Spark tasks", full(perf.tasks)]].map(([k, v]) => (
                  <div key={k} className="rounded-3xl bg-white/60 dark:bg-white/5 p-3">
                    <p className="font-display text-2xl font-bold">{v}</p><p className="text-xs text-ink-mute">{k}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4">
                <SimpleBars height={190} xKey="stage" valueFmt={(v) => secs(v)}
                            data={Object.entries(perf.stage_seconds).map(([stage, s]) => ({ stage, seconds: s }))}
                            bars={[{ key: "seconds", name: "Seconds", color: "var(--color-neu)" }]} />
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-y-1 text-sm sm:grid-cols-4">
                <dt className="text-ink-mute">Spark</dt><dd className="font-semibold">{perf.spark.version}</dd>
                <dt className="text-ink-mute">Master</dt><dd className="font-semibold">{perf.spark.master}</dd>
                <dt className="text-ink-mute">Storage</dt><dd className="font-semibold">{perf.storage_backend === "hdfs" ? "HDFS" : "Local lake"}</dd>
                <dt className="text-ink-mute">Jobs / stages</dt><dd className="font-semibold">{perf.spark_jobs} / {perf.stages}</dd>
              </dl>
              <p className="mt-3 text-xs text-ink-mute">
                While a job runs, the Spark UI is at <a className="font-semibold text-neu underline" href="http://localhost:4040" target="_blank" rel="noreferrer">localhost:4040</a>.
              </p>
            </>
          ) : <p className="text-sm text-ink-mute">No finished analysis selected.</p>}
        </Card>
        {bench ? <BenchmarkResults bench={bench} /> : (
          <Card className="lg:col-span-12"><p className="text-sm text-ink-soft">No benchmark yet. Pick sizes above and run one.</p></Card>
        )}
      </div>
    </div>
  );
}
