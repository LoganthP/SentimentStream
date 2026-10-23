import * as d3 from "d3";
import { motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { useAppState } from "../lib/AppState";
import { moodWord, num, ORDER, pct, SENT, shortDate } from "../lib/format";

const axis = { fontSize: 12, fill: "var(--chart-axis)", fontFamily: "Figtree" };

export function GlassTooltip({ active, payload, label, labelFmt = (l) => l, valueFmt = (v) => num(v) }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-strong rounded-2xl px-3.5 py-2.5 text-xs shadow-xl">
      <p className="mb-1 font-display text-sm font-semibold text-ink">{labelFmt(label)}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="flex items-center gap-2 text-ink-soft">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color || p.fill }} />
          {p.name}: <span className="font-semibold text-ink">{valueFmt(p.value)}</span>
        </p>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ Mood ring */
export function MoodRing({ distribution, size = 260 }) {
  const data = ORDER.map((s) => ({ name: SENT[s].label, key: s, value: distribution.counts[s] }));
  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <ResponsiveContainer>
        <PieChart>
          <Pie data={data} dataKey="value" innerRadius="70%" outerRadius="100%" paddingAngle={3}
               cornerRadius={14} stroke="none" startAngle={90} endAngle={-270} isAnimationActive>
            {data.map((d) => <Cell key={d.key} fill={SENT[d.key].color} />)}
          </Pie>
          <Tooltip content={<GlassTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="font-display text-5xl font-extrabold leading-none tracking-tight"
              style={{ color: distribution.net_score >= 0 ? "var(--color-pos)" : "var(--color-neg)" }}>
          {distribution.net_score > 0 ? "+" : ""}{distribution.net_score}
        </span>
        <span className="mt-2 font-display text-lg font-semibold">{moodWord(distribution.net_score)}</span>
        <span className="text-xs text-ink-mute">net sentiment</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Timeline */
export function TimelineChart({ timeline, anomalies = [], height = 280, mode = "count" }) {
  const data = useMemo(() => timeline.points.map((p) => {
    if (mode === "share") {
      return { ...p, positive: (p.positive / p.total) * 100, neutral: (p.neutral / p.total) * 100, negative: (p.negative / p.total) * 100 };
    }
    return p;
  }), [timeline, mode]);
  if (!data.length) return <p className="text-sm text-ink-mute">This dataset has no timestamps, so there is no timeline.</p>;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <defs>
          {ORDER.map((s) => (
            <linearGradient key={s} id={`g-${s}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SENT[s].color} stopOpacity={0.85} />
              <stop offset="100%" stopColor={SENT[s].color} stopOpacity={0.35} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
        <XAxis dataKey="bucket" tickFormatter={shortDate} tick={axis} axisLine={false} tickLine={false} minTickGap={18} />
        <YAxis tick={axis} axisLine={false} tickLine={false} tickFormatter={(v) => (mode === "share" ? `${Math.round(v)}%` : num(v))}
               domain={mode === "share" ? [0, 100] : ["auto", "auto"]} />
        <Tooltip content={<GlassTooltip labelFmt={shortDate} valueFmt={(v) => (mode === "share" ? pct(v) : num(v))} />} />
        {anomalies.map((a) => (
          <ReferenceLine key={a.bucket} x={a.bucket} stroke="var(--color-sun)" strokeWidth={10} strokeOpacity={0.6} />
        ))}
        {["negative", "neutral", "positive"].map((s) => (
          <Area key={s} type="monotone" dataKey={s} name={SENT[s].label} stackId="1" stroke={SENT[s].color}
                strokeWidth={2} fill={`url(#g-${s})`} />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* ------------------------------------------------------------- Stacked bars */
export function MixBars({ rows, labelKey, limit = 9, onPick, active }) {
  const max = Math.max(...rows.map((r) => r.total), 1);
  return (
    <ul className="space-y-3">
      {rows.slice(0, limit).map((r, i) => (
        <li key={r[labelKey]}>
          <button type="button" onClick={() => onPick?.(r[labelKey])} disabled={!onPick}
                  className={`w-full text-left ${onPick ? "cursor-pointer" : "cursor-default"} ${active && active !== r[labelKey] ? "opacity-50" : ""}`}>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
              <span className="truncate font-semibold capitalize">{r[labelKey]}</span>
              <span className="shrink-0 text-xs text-ink-mute">
                {num(r.total)} posts, net <b style={{ color: r.net >= 0 ? "var(--color-pos)" : "var(--color-neg)" }}>{r.net > 0 ? "+" : ""}{r.net}</b>
              </span>
            </div>
            <div className="flex h-3 overflow-hidden rounded-full bg-white/50 dark:bg-white/10" style={{ width: `${Math.max(18, (r.total / max) * 100)}%` }}>
              {ORDER.map((s) => (
                <motion.div key={s} initial={{ width: 0 }} animate={{ width: `${(r[s] / r.total) * 100}%` }}
                            transition={{ delay: 0.05 * i, type: "spring", stiffness: 70, damping: 16 }}
                            style={{ background: SENT[s].color }} title={`${SENT[s].label}: ${r[s]}`} />
              ))}
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------ Keyword bubbles (D3) */
export function KeywordBubbles({ words, height = 300, onPick }) {
  const { isDark } = useAppState();
  const ref = useRef(null);
  const [w, setW] = useState(400);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  const nodes = useMemo(() => {
    const root = d3.hierarchy({ children: words.slice(0, 18) }).sum((d) => d.total || 0);
    return d3.pack().size([w, height]).padding(4)(root).leaves();
  }, [words, w, height]);

  const color = useMemo(() => {
    return isDark
      ? d3.scaleLinear().domain([-60, 0, 60]).range(["#FF6B93", "#8897FF", "#2EE5A9"]).clamp(true)
      : d3.scaleLinear().domain([-60, 0, 60]).range(["#FF4D7E", "#6B7CFF", "#14C38E"]).clamp(true);
  }, [isDark]);

  const strokeColor = isDark ? "rgba(18, 15, 38, 0.85)" : "rgba(255, 255, 255, 0.9)";

  return (
    <div ref={ref} className="w-full">
      <svg width={w} height={height} role="img" aria-label="Most discussed keywords, sized by frequency and colored by sentiment">
        {nodes.map((n, i) => {
          const fs = Math.max(10, Math.min(n.r / 2.4, 22));
          const maxChars = Math.max(3, Math.floor((n.r * 2.1) / (fs * 0.6)));
          return (
            <g key={n.data.word} transform={`translate(${n.x},${n.y})`} onClick={() => onPick?.(n.data.word)}
               style={{ cursor: onPick ? "pointer" : "default" }}>
              <motion.circle initial={{ r: 0 }} animate={{ r: n.r }} transition={{ delay: i * 0.02, type: "spring", stiffness: 120, damping: 12 }}
                             fill={color(n.data.net)} fillOpacity={0.88} stroke={strokeColor} strokeWidth={1.5} />
              {n.r > 13 && (
                <text textAnchor="middle" dy="0.35em" fontSize={fs} fill="#ffffff" fontWeight={700}
                      style={{ fontFamily: "Bricolage Grotesque", pointerEvents: "none" }}>
                  {n.data.word.length > maxChars ? n.data.word.slice(0, maxChars - 1) + "…" : n.data.word}
                </text>
              )}
              <title>{`${n.data.word}: ${n.data.total} mentions, net ${n.data.net}`}</title>
            </g>
          );
        })}
      </svg>
      <div className="mt-2 flex items-center gap-2 text-xs text-ink-mute">
        <span>Mostly negative</span>
        <span
          className="h-2 w-28 rounded-full"
          style={{
            background: isDark
              ? "linear-gradient(90deg, #FF6B93, #8897FF, #2EE5A9)"
              : "linear-gradient(90deg, #FF4D7E, #6B7CFF, #14C38E)",
          }}
        />
        <span>Mostly positive</span>
      </div>
    </div>
  );
}

/* --------------------------------------------------- Aspect negative trends */
export function AspectTrend({ rows, height = 280 }) {
  const { data, aspects } = useMemo(() => {
    const byBucket = {};
    const totals = {};
    rows.forEach((r) => {
      byBucket[r.bucket] = byBucket[r.bucket] || { bucket: r.bucket };
      byBucket[r.bucket][r.aspect] = r.negative_share;
      totals[r.aspect] = (totals[r.aspect] || 0) + r.mentions;
    });
    const aspects = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([a]) => a);
    return { data: Object.values(byBucket).sort((a, b) => a.bucket.localeCompare(b.bucket)), aspects };
  }, [rows]);
  const palette = ["var(--color-neg)", "var(--color-neu)", "var(--color-pos)", "var(--color-sun)", "#a78bfa"];
  if (!data.length) return <p className="text-sm text-ink-mute">No timestamps in this dataset.</p>;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
        <XAxis dataKey="bucket" tickFormatter={shortDate} tick={axis} axisLine={false} tickLine={false} minTickGap={18} />
        <YAxis tick={axis} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
        <Tooltip content={<GlassTooltip labelFmt={shortDate} valueFmt={(v) => pct(v)} />} />
        <Legend wrapperStyle={{ fontSize: 12, textTransform: "capitalize", color: "var(--color-ink-soft)" }} iconType="circle" />
        {aspects.map((a, i) => (
          <Line key={a} dataKey={a} name={a} stroke={palette[i]} strokeWidth={2.5} dot={false} type="monotone" />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

/* --------------------------------------------------------------- Simple bars */
export function SimpleBars({ data, xKey, bars, height = 260, layout = "horizontal", valueFmt = num }) {
  const vertical = layout === "vertical";
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout={vertical ? "vertical" : "horizontal"} margin={{ top: 8, right: 12, left: vertical ? 8 : -12, bottom: 0 }}>
        <CartesianGrid stroke="var(--chart-grid)" vertical={vertical} horizontal={!vertical} />
        {vertical ? (
          <>
            <XAxis type="number" tick={axis} axisLine={false} tickLine={false} tickFormatter={valueFmt} />
            <YAxis type="category" dataKey={xKey} tick={axis} axisLine={false} tickLine={false} width={90} />
          </>
        ) : (
          <>
            <XAxis dataKey={xKey} tick={axis} axisLine={false} tickLine={false} />
            <YAxis tick={axis} axisLine={false} tickLine={false} tickFormatter={valueFmt} />
          </>
        )}
        <Tooltip content={<GlassTooltip valueFmt={valueFmt} />} cursor={{ fill: "var(--chart-grid)" }} />
        {bars.length > 1 && <Legend wrapperStyle={{ fontSize: 12, color: "var(--color-ink-soft)" }} iconType="circle" />}
        {bars.map((b) => (
          <Bar key={b.key} dataKey={b.key} name={b.name} fill={b.color} radius={vertical ? [0, 10, 10, 0] : [10, 10, 0, 0]}
               stackId={b.stack} maxBarSize={38} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
