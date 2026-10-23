import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import QuickStart from "../components/QuickStart";
import { Card, ErrorNote, Field, inputCls, PageHeader, Segmented, SentimentChip, Spinner } from "../components/ui";
import { api } from "../lib/api";
import { useAppState } from "../lib/AppState";
import { full, ORDER, SENT } from "../lib/format";

const SIZE = 20;

function highlight(text, q) {
  if (!q) return text;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text;
  return <>{text.slice(0, i)}<mark className="rounded bg-sun-soft px-0.5">{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>;
}

export default function Posts() {
  const { results: r, selectedId, resultsLoading } = useAppState();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get("q") || "");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const filters = {
    q: params.get("q") || "",
    sentiment: params.get("sentiment") || "",
    aspect: params.get("aspect") || "",
    topic: params.get("topic") || "",
    sort: params.get("sort") || "recent",
    page: Number(params.get("page") || 1),
  };
  const key = JSON.stringify(filters);

  useEffect(() => {
    if (!selectedId || !r) return;
    setLoading(true);
    api.posts(selectedId, { ...filters, size: SIZE })
      .then((d) => { setData(d); setErr(null); })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, key, r]);

  if (resultsLoading) return <Spinner label="Loading analysis" />;
  if (!r) return <QuickStart />;

  const update = (patch) => {
    const next = { ...filters, page: 1, ...patch };
    setParams(Object.fromEntries(Object.entries(next).filter(([k, v]) => v && !(k === "page" && v === 1) && !(k === "sort" && v === "recent"))));
  };
  const pages = data ? Math.max(1, Math.ceil(data.total / SIZE)) : 1;

  return (
    <div>
      <PageHeader title="Posts">
        Read what people actually wrote. Search covers {full(r.explorer_rows)} classified posts from this analysis.
      </PageHeader>
      <Card className="mb-5">
        <form onSubmit={(e) => { e.preventDefault(); update({ q }); }} className="flex flex-wrap items-end gap-3">
          <Field label="Search text" className="min-w-[220px] flex-[2]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute" />
              <input className={`${inputCls} pl-9`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Try battery, overheats or #NovaX5" />
            </div>
          </Field>
          <Field label="Aspect" className="min-w-[150px] flex-1">
            <select className={inputCls} value={filters.aspect} onChange={(e) => update({ aspect: e.target.value })}>
              <option value="">Any</option>
              {r.aspects.map((a) => <option key={a.aspect} value={a.aspect}>{a.aspect}</option>)}
            </select>
          </Field>
          {r.topics.length > 0 && (
            <Field label="Product" className="min-w-[150px] flex-1">
              <select className={inputCls} value={filters.topic} onChange={(e) => update({ topic: e.target.value })}>
                <option value="">Any</option>
                {r.topics.map((t) => <option key={t.topic} value={t.topic}>{t.topic}</option>)}
              </select>
            </Field>
          )}
          <Field label="Order" className="min-w-[150px] flex-1">
            <select className={inputCls} value={filters.sort} onChange={(e) => update({ sort: e.target.value })}>
              <option value="recent">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="confidence">Most confident</option>
              <option value="uncertain">Least confident</option>
            </select>
          </Field>
          <button type="submit" className="sr-only">Search</button>
        </form>
        <div className="mt-4">
          <Segmented label="Sentiment" value={filters.sentiment} onChange={(v) => update({ sentiment: v })}
                     options={ORDER.map((s) => ({ value: s, label: SENT[s].label, dot: SENT[s].color, clearable: true }))} />
        </div>
      </Card>

      <ErrorNote>{err}</ErrorNote>
      <div className="mb-3 flex items-center justify-between text-sm text-ink-soft">
        <span>{data ? `${full(data.total)} posts match` : " "}</span>
        {loading && <Spinner label="Searching" />}
      </div>

      <ul className="grid gap-3 md:grid-cols-2">
        <AnimatePresence mode="popLayout">
          {data?.items.map((p) => (
            <motion.li key={p.post_id} layout initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
                       exit={{ opacity: 0 }} transition={{ type: "spring", stiffness: 260, damping: 24 }}
                       className="glass rounded-3xl p-4">
              <p className="leading-relaxed">{highlight(p.text, filters.q)}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-ink-mute">
                <SentimentChip s={p.sentiment}>{SENT[p.sentiment]?.label} {Math.round(p.confidence * 100)}%</SentimentChip>
                {(p.aspects || []).map((a) => <span key={a} className="rounded-full bg-white/70 dark:bg-white/10 dark:text-ink-soft px-2 py-0.5 capitalize">{a}</span>)}
                {p.topic && <span className="rounded-full bg-white/70 dark:bg-white/10 dark:text-ink-soft px-2 py-0.5">{p.topic}</span>}
                {p.rating != null && <span>{"★".repeat(Math.round(p.rating))}</span>}
                {p.ts && <span className="ml-auto">{new Date(p.ts + "Z").toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })}</span>}
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      {data && !data.items.length && !loading && (
        <Card className="mt-2"><p className="text-sm text-ink-soft">No posts match. Clear a filter or search for a shorter word.</p></Card>
      )}

      {pages > 1 && (
        <nav className="mt-5 flex items-center justify-center gap-3" aria-label="Pages">
          <button className="neu-out p-2.5 disabled:opacity-40" disabled={filters.page <= 1}
                  onClick={() => update({ page: filters.page - 1 })} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></button>
          <span className="text-sm font-semibold">Page {filters.page} of {full(pages)}</span>
          <button className="neu-out p-2.5 disabled:opacity-40" disabled={filters.page >= pages}
                  onClick={() => update({ page: filters.page + 1 })} aria-label="Next page"><ChevronRight className="h-4 w-4" /></button>
        </nav>
      )}
    </div>
  );
}
