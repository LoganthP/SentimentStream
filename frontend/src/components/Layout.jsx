import { useState } from "react";
import { Brain, Database, FileDown, Gauge, LayoutGrid, MessageSquareText, TrendingUp } from "lucide-react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { useAppState } from "../lib/AppState";
import { timeAgo } from "../lib/format";
import Aurora from "./Aurora";
import Logo from "./Logo";
import ThemeToggle from "./ThemeToggle";

const NAV = [
  { to: "/app", label: "Overview", icon: LayoutGrid, end: true },
  { to: "/app/data", label: "Data & jobs", icon: Database },
  { to: "/app/trends", label: "Trends", icon: TrendingUp },
  { to: "/app/posts", label: "Posts", icon: MessageSquareText },
  { to: "/app/model", label: "Classifier", icon: Brain },
  { to: "/app/performance", label: "Performance", icon: Gauge },
  { to: "/app/reports", label: "Reports", icon: FileDown },
];

function JobPicker() {
  const { completed, selectedId, setSelectedId } = useAppState();
  if (!completed.length) return <p className="text-xs text-ink-mute">No finished analysis yet.</p>;
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-ink-soft">Showing analysis</span>
      <select value={selectedId || ""} onChange={(e) => setSelectedId(e.target.value)}
              className="neu-in w-full truncate px-3 py-2 text-sm font-medium text-ink outline-none">
        {completed.map((j) => (
          <option key={j.id} value={j.id}>
            {j.name || j.dataset_name || j.id} ({timeAgo(j.finished_at)})
          </option>
        ))}
      </select>
    </label>
  );
}

function HealthModal({ health, onClose }) {
  if (!health) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="clay clay-white dark:bg-zinc-900 w-full max-w-md rounded-3xl p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between pb-3 border-b border-black/5 dark:border-white/10">
          <h3 className="font-display text-lg font-bold">System & Cluster Health</h3>
          <button onClick={onClose} className="rounded-xl px-2 py-1 text-sm font-semibold text-ink-mute hover:bg-black/5 dark:hover:bg-white/10">✕</button>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-2xl bg-white/50 dark:bg-white/5 p-3">
            <dt className="text-xs text-ink-mute">Spark Status</dt>
            <dd className="font-semibold text-ink mt-0.5 capitalize">{health.spark_warming_up ? "Warming up..." : health.spark?.status || "Ready"}</dd>
          </div>
          <div className="rounded-2xl bg-white/50 dark:bg-white/5 p-3">
            <dt className="text-xs text-ink-mute">CPU Cores</dt>
            <dd className="font-semibold text-ink mt-0.5">{health.cores} cores</dd>
          </div>
          <div className="rounded-2xl bg-white/50 dark:bg-white/5 p-3">
            <dt className="text-xs text-ink-mute">Driver Memory</dt>
            <dd className="font-semibold text-ink mt-0.5">{health.driver_memory || "4g"}</dd>
          </div>
          <div className="rounded-2xl bg-white/50 dark:bg-white/5 p-3">
            <dt className="text-xs text-ink-mute">Free Disk Space</dt>
            <dd className="font-semibold text-ink mt-0.5">{health.free_disk_gb} GB</dd>
          </div>
          <div className="rounded-2xl bg-white/50 dark:bg-white/5 p-3">
            <dt className="text-xs text-ink-mute">Storage Backend</dt>
            <dd className="font-semibold text-ink mt-0.5 capitalize">{health.storage_backend === "hdfs" ? "HDFS" : "Local Data Lake"}</dd>
          </div>
          <div className="rounded-2xl bg-white/50 dark:bg-white/5 p-3">
            <dt className="text-xs text-ink-mute">Default Model</dt>
            <dd className="font-semibold text-ink mt-0.5">{health.default_model_ready ? "Loaded & Ready" : "Warming up"}</dd>
          </div>
        </dl>
        <div className="mt-5 flex justify-end">
          <button onClick={onClose} className="neu-out px-4 py-2 text-xs font-semibold text-ink rounded-xl">Close</button>
        </div>
      </div>
    </div>
  );
}

function SparkStatus() {
  const { health, apiError, jobs } = useAppState();
  const [showHealth, setShowHealth] = useState(false);
  const running = jobs.find((j) => j.status === "running");
  const isWarming = health?.spark_warming_up;

  const color = apiError
    ? "var(--color-neg)"
    : isWarming || running
    ? "var(--color-sun)"
    : "var(--color-pos)";

  const text = apiError
    ? "API offline"
    : isWarming
    ? "Spark warming up..."
    : running
    ? `Spark busy, ${Math.round(running.progress * 100)}%`
    : "Spark ready";

  return (
    <>
      <button
        onClick={() => setShowHealth(true)}
        className="flex w-full items-center gap-2 text-left text-xs font-semibold text-ink-soft transition-colors hover:text-ink cursor-pointer"
        title="Click to view system health"
      >
        <span className="relative flex h-2.5 w-2.5">
          {(running || isWarming) && (
            <span
              className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
              style={{ background: color }}
            />
          )}
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ background: color }} />
        </span>
        <span className="truncate">{text}</span>
        {health && !apiError && (
          <span className="ml-auto hidden font-medium text-ink-mute sm:inline">
            {health.storage_backend === "hdfs" ? "HDFS" : "Lake"}
          </span>
        )}
      </button>
      {showHealth && <HealthModal health={health} onClose={() => setShowHealth(false)} />}
    </>
  );
}

export default function Layout() {
  return (
    <div className="min-h-screen">
      <Aurora />
      <div className="mx-auto flex max-w-[1500px] gap-6 p-3 sm:p-5 lg:p-6">
        <aside className="glass-strong sticky top-6 hidden h-[calc(100vh-3rem)] w-64 shrink-0 flex-col rounded-5xl p-5 lg:flex">
          <Link to="/" className="mb-8 flex items-center gap-3 px-1 hover:opacity-90 transition-opacity" title="Back to home">
            <Logo />
            <div>
              <p className="font-display text-lg font-bold leading-none">SentimentStream</p>
              <p className="mt-1 text-xs text-ink-mute">Spark sentiment analytics</p>
            </div>
          </Link>
          <nav className="flex flex-col gap-1" aria-label="Main">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={Boolean(end || to === "/app")}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm font-semibold transition-colors
                   ${isActive ? "clay clay-ink" : "text-ink-soft hover:bg-white/40 dark:hover:bg-white/10"}`}>
                <Icon className="h-[18px] w-[18px]" /> {label}
              </NavLink>
            ))}
          </nav>
          <div className="mt-auto space-y-4">
            <ThemeToggle className="w-full" />
            <JobPicker />
            <SparkStatus />
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          {/* Mobile header */}
          <div className="glass-strong mb-4 rounded-4xl p-3 lg:hidden">
            <div className="mb-3 flex items-center justify-between gap-2 px-1">
              <div className="flex items-center gap-2">
                <Logo className="h-8 w-8" />
                <span className="font-display text-lg font-bold">SentimentStream</span>
              </div>
              <SparkStatus />
            </div>
            <nav className="scroll-thin -mx-1 flex gap-1 overflow-x-auto px-1 pb-1" aria-label="Main">
              {NAV.map(({ to, label, icon: Icon, end }) => (
                <NavLink key={to} to={to} end={Boolean(end || to === "/app")}
                  className={({ isActive }) => `flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold
                     ${isActive ? "clay clay-ink" : "text-ink-soft hover:bg-white/40 dark:hover:bg-white/10"}`}>
                  <Icon className="h-4 w-4" /> {label}
                </NavLink>
              ))}
            </nav>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex-1"><JobPicker /></div>
              <ThemeToggle className="w-full sm:w-auto" />
            </div>
          </div>
          <main id="main"><Outlet /></main>
        </div>
      </div>
    </div>
  );
}
