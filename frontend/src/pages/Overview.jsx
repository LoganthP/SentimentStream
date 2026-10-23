import { motion } from "framer-motion";
import { AlertTriangle, ArrowUpRight, Flame } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { KeywordBubbles, MixBars, MoodRing, TimelineChart } from "../components/charts";
import QuickStart from "../components/QuickStart";
import { Card, CardTitle, Spinner } from "../components/ui";
import { useAppState } from "../lib/AppState";
import { full, num, ORDER, pct, secs, SENT, shortDate } from "../lib/format";

const grid = { hidden: {}, show: { transition: { staggerChildren: 0.07 } } };
const item = {
  hidden: { opacity: 0, y: 24, scale: 0.97 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 140, damping: 18 } },
};

function Tile({ className, children }) {
  return <motion.div variants={item} className={className}>{children}</motion.div>;
}

export default function Overview() {
  const { results: r, resultsLoading } = useAppState();
  const nav = useNavigate();
  if (resultsLoading) return <Spinner label="Loading analysis" />;
  if (!r) return <QuickStart />;

  const d = r.distribution || { total: 0, percent: {}, counts: {} };
  const metrics = r.model?.metrics || {};
  const ev = metrics.evaluation_on_this_dataset || metrics;
  const topEmerging = r.emerging?.[0];
  const worstAspect = [...(r.aspects || [])].filter((a) => a.total > 30).sort((a, b) => a.net - b.net)[0];
  const stages = Object.entries(r.performance?.stage_seconds || {});
  const maxStage = Math.max(...stages.map(([, v]) => v), 0.001);
  const range = r.timeline?.start ? `${shortDate(r.timeline.start)} to ${shortDate(r.timeline.end)}` : "No timestamps";

  return (
    <div className="space-y-4">
      {r.is_preview && (
        <div className="flex items-center justify-between rounded-3xl bg-sun-soft/80 border border-sun/30 px-5 py-3 text-sm text-ink font-medium">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sun opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-sun" />
            </span>
            <span>
              <b>Quick Preview Mode</b>: Showing insights from a sample of {full(r.preview_sample_size || 20000)} posts. Full analysis is running in the background.
            </span>
          </div>
        </div>
      )}

      <motion.div variants={grid} initial="hidden" animate="show"
                  className="grid grid-cols-1 gap-4 md:grid-cols-6 lg:grid-cols-12 lg:gap-5">
        {/* Hero: the mood ring */}
        <Tile className="md:col-span-6 lg:col-span-5 lg:row-span-2">
          <Card hero className="flex h-full flex-col">
            <p className="text-sm font-semibold text-ink-soft">{r.dataset?.name}</p>
            <h1 className="font-display text-3xl font-bold leading-tight sm:text-4xl">How people feel right now</h1>
            <p className="mt-1 text-sm text-ink-mute">{full(d.total)} posts, {range}</p>
            <div className="my-6 flex flex-1 items-center justify-center">
              {d.total > 0 ? (
                <MoodRing distribution={d} />
              ) : (
                <div className="h-48 flex items-center justify-center text-xs text-ink-mute animate-pulse">Calculating sentiment...</div>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {ORDER.map((s) => (
                <button key={s} onClick={() => nav(`/app/posts?sentiment=${s}`)}
                        className="neu-out flex flex-col items-start px-3 py-3 text-left">
                  <span className="font-display text-2xl font-bold" style={{ color: SENT[s].color }}>{pct(d.percent?.[s], 0)}</span>
                  <span className="text-xs font-semibold text-ink-soft">{SENT[s].label}</span>
                  <span className="text-xs text-ink-mute">{num(d.counts?.[s])} posts</span>
                </button>
              ))}
            </div>
          </Card>
        </Tile>

      <Tile className="md:col-span-3 lg:col-span-4">
        <Card className="h-full">
          <p className="text-sm font-semibold text-ink-soft">Records processed</p>
          <p className="font-display text-5xl font-extrabold tracking-tight">{num(r.cleaning.raw_rows)}</p>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <dt className="text-ink-mute">Duplicates removed</dt><dd className="text-right font-semibold">{full(r.cleaning.duplicates_removed)}</dd>
            <dt className="text-ink-mute">Empty posts removed</dt><dd className="text-right font-semibold">{full(r.cleaning.missing_removed)}</dd>
            <dt className="text-ink-mute">Spark time</dt><dd className="text-right font-semibold">{secs(r.performance.total_seconds)}</dd>
          </dl>
        </Card>
      </Tile>

      <Tile className="md:col-span-3 lg:col-span-3">
        <Card className="h-full">
          <p className="text-sm font-semibold text-ink-soft">Classifier quality</p>
          <p className="font-display text-5xl font-extrabold tracking-tight">{ev.macro_f1 != null ? ev.macro_f1.toFixed(2) : "–"}</p>
          <p className="text-sm text-ink-mute">macro-F1{ev.accuracy != null && <>, accuracy {pct(ev.accuracy * 100)}</>}</p>
          <Link to="/app/model" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-neu hover:underline">
            {r.model.used} <ArrowUpRight className="h-4 w-4" />
          </Link>
        </Card>
      </Tile>

      {/* Alerts */}
      <Tile className="md:col-span-6 lg:col-span-7">
        <Card className="h-full bg-gradient-to-br from-sun-soft/70 to-white/40 dark:to-white/5">
          <CardTitle note="Days where complaints rose well above normal, and what is driving them">
            <span className="inline-flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-sun" /> What needs attention</span>
          </CardTitle>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-3xl bg-white/60 dark:bg-white/5 p-4">
              <p className="text-xs font-semibold text-ink-mute">Negative spikes</p>
              {r.anomalies.length ? r.anomalies.slice(0, 2).map((a) => (
                <p key={a.bucket} className="mt-1 text-sm">
                  <b className="font-display text-xl">{pct(a.negative_share, 0)}</b> negative on {shortDate(a.bucket)}
                  <span className="block text-xs text-ink-mute">usually {pct(a.baseline, 0)}</span>
                </p>
              )) : <p className="mt-1 text-sm text-ink-soft">No unusual spikes found.</p>}
            </div>
            <div className="rounded-3xl bg-white/60 dark:bg-white/5 p-4">
              <p className="text-xs font-semibold text-ink-mute">Weakest aspect</p>
              {worstAspect ? (
                <p className="mt-1 text-sm"><b className="font-display text-xl capitalize">{worstAspect.aspect}</b>
                  <span className="block text-xs text-ink-mute">net {worstAspect.net} across {num(worstAspect.total)} mentions</span></p>
              ) : <p className="mt-1 text-sm text-ink-soft">Not enough aspect mentions.</p>}
            </div>
            <div className="rounded-3xl bg-white/60 dark:bg-white/5 p-4">
              <p className="text-xs font-semibold text-ink-mute">Fastest-rising term</p>
              {topEmerging ? (
                <p className="mt-1 text-sm"><b className="font-display text-xl">{topEmerging.word}</b>
                  <span className="block text-xs text-ink-mute">{topEmerging.growth}× more often lately</span></p>
              ) : <p className="mt-1 text-sm text-ink-soft">No rising terms.</p>}
            </div>
          </div>
        </Card>
      </Tile>

      <Tile className="md:col-span-6 lg:col-span-8">
        <Card className="h-full">
          <CardTitle note={r.anomalies.length ? "Amber lines mark negative spikes" : `Posts per ${r.timeline.granularity || "period"}`}>
            Sentiment over time
          </CardTitle>
          <TimelineChart timeline={r.timeline} anomalies={r.anomalies} height={340} />
        </Card>
      </Tile>

      <Tile className="md:col-span-6 lg:col-span-4">
        <Card className="h-full">
          <CardTitle note="Tap one to read those posts">Feature-level sentiment</CardTitle>
          <MixBars rows={r.aspects} labelKey="aspect" limit={7} onPick={(a) => nav(`/app/posts?aspect=${encodeURIComponent(a)}`)} />
        </Card>
      </Tile>

      <Tile className="md:col-span-6 lg:col-span-5">
        <Card className="h-full">
          <CardTitle note="Size shows how often a word appears">Most discussed words</CardTitle>
          <KeywordBubbles words={r.keywords.top} height={300} onPick={(w) => nav(`/app/posts?q=${encodeURIComponent(w)}`)} />
        </Card>
      </Tile>

      <Tile className="md:col-span-3 lg:col-span-4">
        <Card className="h-full">
          <CardTitle note="Latest quarter of the period vs. before">
            <span className="inline-flex items-center gap-2"><Flame className="h-5 w-5 text-neg" /> Rising terms</span>
          </CardTitle>
          {r.emerging.length ? (
            <ol className="space-y-2">
              {r.emerging.slice(0, 7).map((e) => (
                <li key={e.word} className="flex items-center justify-between gap-2 rounded-2xl bg-white/50 dark:bg-white/5 px-3 py-2">
                  <span className="font-semibold">{e.word}</span>
                  <span className="text-xs text-ink-mute">{e.prior_rate} → <b className="text-ink">{e.recent_rate}</b> per 1K</span>
                </li>
              ))}
            </ol>
          ) : <p className="text-sm text-ink-mute">Needs timestamps spanning several periods.</p>}
        </Card>
      </Tile>

      <Tile className="md:col-span-3 lg:col-span-3">
        <Card className="h-full">
          <CardTitle>Top hashtags</CardTitle>
          <div className="flex flex-wrap gap-2">
            {r.hashtags.slice(0, 12).map((h) => (
              <Link key={h.tag} to={`/app/posts?q=${encodeURIComponent("#" + h.tag)}`}
                    className="rounded-full px-3 py-1.5 text-sm font-semibold transition-transform hover:-translate-y-0.5"
                    style={{ background: h.net >= 15 ? SENT.positive.soft : h.net <= -15 ? SENT.negative.soft : SENT.neutral.soft }}>
                #{h.tag} <span className="font-normal text-ink-mute">{num(h.total)}</span>
              </Link>
            ))}
            {!r.hashtags.length && <p className="text-sm text-ink-mute">No hashtags found.</p>}
          </div>
        </Card>
      </Tile>

      <Tile className="md:col-span-6 lg:col-span-6">
        <Card className="h-full">
          <CardTitle note="By the dataset's product or topic column">Products and topics</CardTitle>
          {r.topics.length ? <MixBars rows={r.topics} labelKey="topic" limit={6} />
            : <p className="text-sm text-ink-mute">This dataset has no product or topic column.</p>}
        </Card>
      </Tile>

      <Tile className="md:col-span-6 lg:col-span-6">
        <Card className="h-full">
          <CardTitle note={`${r.performance.spark_jobs} Spark jobs, ${r.performance.stages} stages, ${full(r.performance.tasks)} tasks`}
                     right={<Link to="/app/performance" className="text-sm font-semibold text-neu hover:underline">Details</Link>}>
            Where the time went
          </CardTitle>
          <ul className="space-y-2.5">
            {stages.map(([k, v]) => (
              <li key={k} className="grid grid-cols-[90px_1fr_60px] items-center gap-3 text-sm">
                <span className="font-semibold capitalize">{k}</span>
                <span className="neu-in h-3 overflow-hidden rounded-full p-0.5">
                  <span className="block h-full rounded-full bg-gradient-to-r from-neu to-pos" style={{ width: `${Math.max(3, (v / maxStage) * 100)}%` }} />
                </span>
                <span className="text-right text-ink-mute">{secs(v)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </Tile>
      </motion.div>
    </div>
  );
}
