import { Filter, RotateCcw } from "lucide-react";
import { useState } from "react";
import { AspectTrend, MixBars, SimpleBars, TimelineChart } from "../components/charts";
import QuickStart from "../components/QuickStart";
import { Card, CardTitle, ClayButton, ErrorNote, Field, inputCls, PageHeader, Segmented, Spinner } from "../components/ui";
import { api } from "../lib/api";
import { useAppState } from "../lib/AppState";
import { num, ORDER, pct, secs, SENT } from "../lib/format";

const EMPTY = { start: "", end: "", keyword: "", sentiment: "", topic: "" };

export default function Trends() {
  const { results: r, selectedId, resultsLoading } = useAppState();
  const [f, setF] = useState(EMPTY);
  const [filtered, setFiltered] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [mode, setMode] = useState("count");

  if (resultsLoading) return <Spinner label="Loading analysis" />;
  if (!r) return <QuickStart />;
  if (filtered && filtered.job !== selectedId) setFiltered(null);

  const v = filtered?.data ?? r;
  const active = Object.values(f).some(Boolean);

  async function apply() {
    setBusy(true);
    setErr(null);
    try {
      const body = Object.fromEntries(Object.entries(f).filter(([, x]) => x));
      setFiltered({ job: selectedId, data: await api.query(selectedId, body) });
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  function reset() { setF(EMPTY); setFiltered(null); }
  const set = (k) => (e) => setF({ ...f, [k]: e?.target ? e.target.value : e });

  return (
    <div>
      <PageHeader title="Trends">
        Filter by date, word, sentiment or product. Filters re-run the aggregations with Spark SQL over the stored Parquet data.
      </PageHeader>

      <Card className="mb-5">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1.4fr_1fr]">
          <Field label="From"><input type="date" className={inputCls} value={f.start} onChange={set("start")}
                                     min={r.timeline.start || undefined} max={r.timeline.end || undefined} /></Field>
          <Field label="To"><input type="date" className={inputCls} value={f.end} onChange={set("end")}
                                   min={r.timeline.start || undefined} max={r.timeline.end || undefined} /></Field>
          <Field label="Posts containing">
            <input className={inputCls} value={f.keyword} onChange={set("keyword")} placeholder="battery, camera, #NovaX5…"
                   onKeyDown={(e) => e.key === "Enter" && apply()} />
          </Field>
          <Field label="Product or topic">
            <select className={inputCls} value={f.topic} onChange={set("topic")} disabled={!r.topics.length}>
              <option value="">All</option>
              {r.topics.map((t) => <option key={t.topic} value={t.topic}>{t.topic}</option>)}
            </select>
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Segmented label="Sentiment" value={f.sentiment} onChange={set("sentiment")}
                     options={ORDER.map((s) => ({ value: s, label: SENT[s].label, dot: SENT[s].color, clearable: true }))} />
          <div className="ml-auto flex gap-2">
            {(active || filtered) && <ClayButton tone="white" icon={RotateCcw} onClick={reset}>Clear</ClayButton>}
            <ClayButton icon={Filter} onClick={apply} busy={busy} disabled={!active}>Apply filters</ClayButton>
          </div>
        </div>
        {filtered && (
          <p className="mt-3 text-sm text-ink-soft">
            Showing {num(v.distribution.total)} matching posts (Spark query took {secs(filtered.data.query_seconds)}).
          </p>
        )}
        <div className="mt-3"><ErrorNote>{err}</ErrorNote></div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-12">
        <Card className="lg:col-span-8">
          <CardTitle right={<Segmented size="sm" label="Timeline scale" value={mode} onChange={setMode}
                                       options={[{ value: "count", label: "Posts" }, { value: "share", label: "Share" }]} />}
                     note={`${pct(v.distribution.percent.positive, 0)} positive, ${pct(v.distribution.percent.negative, 0)} negative, net ${v.distribution.net_score}`}>
            Sentiment over time
          </CardTitle>
          <TimelineChart timeline={v.timeline} anomalies={filtered ? [] : r.anomalies} mode={mode} height={300} />
        </Card>
        <Card className="lg:col-span-4">
          <CardTitle note="Which features drive praise and complaints">Aspects</CardTitle>
          {v.aspects.length ? <MixBars rows={v.aspects} labelKey="aspect" limit={9} />
            : <p className="text-sm text-ink-mute">No aspect words found.</p>}
        </Card>

        <Card className="lg:col-span-7">
          <CardTitle note="Share of mentions that are negative, top five aspects (whole dataset)">Complaint rate by aspect</CardTitle>
          <AspectTrend rows={r.aspect_timeline} />
        </Card>
        <Card className="lg:col-span-5">
          <CardTitle note="Rate per 1,000 posts, earlier vs. latest quarter of the period">Rising terms</CardTitle>
          {r.emerging.length ? (
            <SimpleBars data={r.emerging.slice(0, 8)} xKey="word" layout="vertical" height={280}
                        valueFmt={(x) => Number(x).toFixed(1)}
                        bars={[{ key: "prior_rate", name: "Before", color: "var(--color-ink-mute)" }, { key: "recent_rate", name: "Recently", color: "var(--color-neg)" }]} />
          ) : <p className="text-sm text-ink-mute">Needs timestamps spanning several periods.</p>}
        </Card>

        {ORDER.map((s) => (
          <Card key={s} className="lg:col-span-4">
            <CardTitle note="Most frequent words in these posts">
              <span style={{ color: SENT[s].color }}>{SENT[s].label}</span> vocabulary
            </CardTitle>
            <ol className="space-y-1.5">
              {(v.keywords.by_sentiment[s] || []).slice(0, 10).map((k, i, arr) => (
                <li key={k.word} className="relative overflow-hidden rounded-xl px-3 py-1.5 text-sm">
                  <span className="absolute inset-y-0 left-0 rounded-xl" style={{ width: `${(k.count / arr[0].count) * 100}%`, background: SENT[s].soft }} />
                  <span className="relative flex justify-between"><b>{k.word}</b><span className="text-ink-mute">{num(k.count)}</span></span>
                </li>
              ))}
            </ol>
          </Card>
        ))}

        <Card className="lg:col-span-6">
          <CardTitle note="Positive, neutral and negative uses">Hashtags</CardTitle>
          {v.hashtags.length ? (
            <SimpleBars data={v.hashtags.slice(0, 10).map((h) => ({ ...h, tag: `#${h.tag}` }))} xKey="tag" layout="vertical" height={320}
                        bars={ORDER.map((s) => ({ key: s, name: SENT[s].label, color: SENT[s].color, stack: "a" }))} />
          ) : <p className="text-sm text-ink-mute">No hashtags in these posts.</p>}
        </Card>
        <Card className="lg:col-span-6">
          <CardTitle note="Grouped by the product or topic column">Products and topics</CardTitle>
          {v.topics.length ? <MixBars rows={v.topics} labelKey="topic" limit={10} />
            : <p className="text-sm text-ink-mute">No product or topic column in this dataset.</p>}
        </Card>
      </div>
    </div>
  );
}
