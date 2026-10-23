import { Download, FileJson, FileSpreadsheet, FileText } from "lucide-react";
import { useEffect, useState } from "react";
import QuickStart from "../components/QuickStart";
import { Card, CardTitle, PageHeader, Spinner } from "../components/ui";
import { api } from "../lib/api";
import { useAppState } from "../lib/AppState";

const FORMATS = [
  { fmt: "md", label: "Summary report", ext: "Markdown", icon: FileText, tone: "clay-pos",
    text: "Plain-language findings, cleaning stats, classifier scores and Spark timings. Paste it straight into your project report." },
  { fmt: "csv", label: "Analytics tables", ext: "CSV", icon: FileSpreadsheet, tone: "clay-sun",
    text: "Sentiment by period, aspects, keywords, hashtags, rising terms, topics and alerts, one section each. Opens in Excel." },
  { fmt: "json", label: "Full results", ext: "JSON", icon: FileJson, tone: "clay-ink",
    text: "Everything the dashboard shows, including the confusion matrix and column mapping, for further processing." },
];

/** Tiny Markdown renderer for the report preview (headings, lists, tables, bold). */
function MiniMarkdown({ text }) {
  const bold = (s) => s.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((p, i) =>
    p.startsWith("**") ? <b key={i}>{p.slice(2, -2)}</b> : p.startsWith("`") ? <code key={i} className="rounded bg-white/70 dark:bg-white/10 px-1">{p.slice(1, -1)}</code> : p);
  const out = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.startsWith("# ")) out.push(<h2 key={i} className="mb-3 font-display text-2xl font-bold">{l.slice(2)}</h2>);
    else if (l.startsWith("## ")) out.push(<h3 key={i} className="mb-2 mt-5 font-display text-lg font-semibold">{l.slice(3)}</h3>);
    else if (l.startsWith("- ")) out.push(<p key={i} className="ml-4 list-item list-disc text-sm">{bold(l.slice(2))}</p>);
    else if (l.startsWith("|")) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith("|")) { rows.push(lines[i]); i++; }
      i--;
      const cells = rows.filter((r) => !/^\|[-:| ]+\|$/.test(r)).map((r) => r.split("|").slice(1, -1).map((c) => c.trim()));
      out.push(
        <div key={i} className="overflow-x-auto"><table className="my-2 w-full text-sm">
          <thead><tr>{cells[0].map((c, j) => <th key={j} className="py-1 text-left text-xs text-ink-mute">{c}</th>)}</tr></thead>
          <tbody>{cells.slice(1).map((r, k) => <tr key={k} className="border-t border-white/70 dark:border-white/10">{r.map((c, j) => <td key={j} className="py-1 capitalize">{c}</td>)}</tr>)}</tbody>
        </table></div>);
    } else if (l.trim()) out.push(<p key={i} className="my-1 text-sm leading-relaxed">{bold(l)}</p>);
  }
  return <div>{out}</div>;
}

export default function Reports() {
  const { results: r, selectedId, resultsLoading } = useAppState();
  const [md, setMd] = useState(null);

  useEffect(() => {
    if (!selectedId || !r) return;
    setMd(null);
    fetch(api.reportUrl(selectedId, "md")).then((x) => x.text()).then(setMd).catch(() => setMd(""));
  }, [selectedId, r?.name, r?.job_name, r?.dataset?.name]);

  if (resultsLoading) return <Spinner label="Loading analysis" />;
  if (!r) return <QuickStart />;

  const displayName = r.name || r.job_name || r.dataset?.name || "your dataset";

  return (
    <div>
      <PageHeader title="Reports">Download the results of “{displayName}” for your write-up or for further analysis.</PageHeader>
      <div className="grid gap-5 lg:grid-cols-3">
        {FORMATS.map(({ fmt, label, ext, icon: Icon, tone, text }) => (
          <Card key={fmt} className="flex flex-col">
            <div className={`clay ${tone} mb-4 flex h-12 w-12 items-center justify-center`}><Icon className="h-6 w-6" /></div>
            <h2 className="font-display text-xl font-semibold">{label}</h2>
            <p className="mb-4 mt-1 flex-1 text-sm text-ink-soft">{text}</p>
            <a href={api.reportUrl(selectedId, fmt)} download
               className="neu-out inline-flex w-fit items-center gap-2 px-4 py-2 text-sm font-semibold">
              <Download className="h-4 w-4" /> Download {ext}
            </a>
          </Card>
        ))}
        <Card className="lg:col-span-2">
          <CardTitle note="Exactly what the Markdown download contains">Report preview</CardTitle>
          {md == null ? <Spinner label="Building report" /> : <MiniMarkdown text={md} />}
        </Card>
        <Card>
          <CardTitle note="For the Hadoop and Hive parts of the syllabus">Query it with Hive</CardTitle>
          <p className="text-sm text-ink-soft">The classified posts are stored as Parquet at:</p>
          <p className="neu-in mt-2 break-all px-3 py-2 text-xs">{r.performance.processed_path}</p>
          <p className="mt-3 text-sm text-ink-soft">
            Point the external table in <b>hive/sentimentstream.hql</b> at that folder, then run it with <b>hive -f</b> or <b>spark-sql -f</b>.
            The <b>mapreduce/</b> folder has the same word count as a Hadoop Streaming job.
          </p>
          <p className="mt-3 text-sm text-ink-soft">Job id for the query: <b>{selectedId}</b></p>
        </Card>
      </div>
    </div>
  );
}
