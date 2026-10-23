import { motion } from "framer-motion";
import { RefreshCw, Wand2 } from "lucide-react";
import { useEffect, useState } from "react";
import { SimpleBars } from "../components/charts";
import { Card, CardTitle, ClayButton, ErrorNote, PageHeader, SentimentChip } from "../components/ui";
import { api } from "../lib/api";
import { useAppState } from "../lib/AppState";
import { full, ORDER, pct, secs, SENT } from "../lib/format";

const LABELS = ["negative", "neutral", "positive"];

function Confusion({ cm }) {
  const max = Math.max(...cm.flat(), 1);
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-1.5 text-sm">
        <thead>
          <tr>
            <th className="text-left text-xs font-semibold text-ink-mute">Actual ↓ Predicted →</th>
            {LABELS.map((l) => (
              <th key={l} className="text-xs font-semibold" style={{ color: SENT[l].color }}>
                {SENT[l].label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cm.map((row, i) => (
            <tr key={i}>
              <th className="text-left text-xs font-semibold" style={{ color: SENT[LABELS[i]].color }}>
                {SENT[LABELS[i]].label}
              </th>
              {row.map((v, j) => {
                const isDiagonal = i === j;
                const ratio = v / max;
                const alpha = isDiagonal
                  ? (0.15 + 0.65 * ratio).toFixed(2)
                  : Math.min(0.75, 0.06 + 1.8 * ratio).toFixed(2);
                return (
                  <td
                    key={j}
                    className="rounded-2xl px-3 py-4 text-center font-display text-lg font-bold transition-colors"
                    style={{
                      background: isDiagonal
                        ? `rgba(var(--cm-correct-rgb), ${alpha})`
                        : `rgba(var(--cm-incorrect-rgb), ${alpha})`,
                      color: isDiagonal && ratio > 0.5 ? "var(--cm-text-light)" : "var(--color-ink)",
                    }}
                  >
                    {full(v)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Playground({ jobId }) {
  const [text, setText] = useState("The battery dies so fast after the update\nCamera quality is amazing, totally worth it\nJust ordered the phone, arriving Friday");
  const [out, setOut] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  async function run() {
    const texts = text.split("\n").map((t) => t.trim()).filter(Boolean).slice(0, 50);
    if (!texts.length) return;
    setBusy(true);
    setErr(null);
    try { setOut(await api.predict(texts, jobId)); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  return (
    <Card>
      <CardTitle note="One post per line. Uses the same Spark pipeline as the batch job.">Try the classifier</CardTitle>
      <textarea className="neu-in min-h-[130px] w-full resize-y px-4 py-3 text-sm outline-none" value={text}
                onChange={(e) => setText(e.target.value)} aria-label="Posts to classify" />
      <div className="mt-3 flex items-center gap-3">
        <ClayButton tone="sun" icon={Wand2} onClick={run} busy={busy}>Classify</ClayButton>
        <span className="text-xs text-ink-mute">The first call warms up Spark and can take a few seconds.</span>
      </div>
      <div className="mt-3"><ErrorNote>{err}</ErrorNote></div>
      {out && (
        <ul className="mt-4 space-y-2">
          {out.map((o, i) => (
            <motion.li key={i + o.text} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}
                       transition={{ delay: i * 0.06, type: "spring", stiffness: 220, damping: 20 }}
                       className="flex flex-wrap items-center gap-3 rounded-2xl bg-white/60 dark:bg-white/5 px-4 py-3">
              <span className="min-w-0 flex-1 text-sm">{o.text}</span>
              {o.aspects.map((a) => <span key={a} className="rounded-full bg-lilac-deep px-2 py-0.5 text-xs capitalize">{a}</span>)}
              <SentimentChip s={o.sentiment}>{SENT[o.sentiment].label} {Math.round(o.confidence * 100)}%</SentimentChip>
            </motion.li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default function Model() {
  const { results: r, selectedId } = useAppState();
  const [def, setDef] = useState(null);
  const [training, setTraining] = useState(false);
  const { refreshJobs, jobs } = useAppState();
  const trainingJob = jobs.find((j) => j.kind === "train_default" && (j.status === "running" || j.status === "queued"));

  useEffect(() => { api.model().then(setDef).catch(() => {}); }, [trainingJob?.status]);

  const m = r?.model?.metrics || def?.metrics;
  const ev = m?.evaluation_on_this_dataset || m;
  const trainedHere = r?.model?.used === "trained on this dataset";

  return (
    <div>
      <PageHeader title="Classifier"
        right={<ClayButton tone="white" icon={RefreshCw} busy={training || !!trainingJob}
                           onClick={async () => { setTraining(true); try { await api.trainModel(); await refreshJobs(); } finally { setTraining(false); } }}>
          Retrain default model
        </ClayButton>}>
        TF-IDF features from words and word pairs, fed to a multinomial logistic regression in Spark MLlib.
        Classes are re-weighted so the smaller neutral class still counts.
      </PageHeader>

      {!m ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card><p className="text-sm text-ink-soft">No model has been trained yet. Run an analysis or retrain the default model.</p></Card>
          <Playground />
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-12">
          <Card hero className="lg:col-span-5">
            <p className="text-sm font-semibold text-ink-soft">
              {r ? (trainedHere ? "Trained on this dataset" : "Pretrained model, tested on this dataset's labels") : "Default model"}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-4">
              <div>
                <p className="font-display text-5xl font-extrabold">{ev.macro_f1?.toFixed(3)}</p>
                <p className="text-sm text-ink-mute">macro-F1</p>
              </div>
              <div>
                <p className="font-display text-5xl font-extrabold">{pct(ev.accuracy * 100)}</p>
                <p className="text-sm text-ink-mute">accuracy</p>
              </div>
            </div>
            <dl className="mt-6 grid grid-cols-2 gap-y-1.5 text-sm">
              <dt className="text-ink-mute">Labels from</dt><dd className="text-right font-semibold">{m.label_source}</dd>
              <dt className="text-ink-mute">Training posts</dt><dd className="text-right font-semibold">{full(m.train_rows)}</dd>
              <dt className="text-ink-mute">Test posts</dt><dd className="text-right font-semibold">{full(ev.test_rows)}</dd>
              <dt className="text-ink-mute">Training time</dt><dd className="text-right font-semibold">{secs(m.train_seconds)}</dd>
              <dt className="text-ink-mute">Weighted F1</dt><dd className="text-right font-semibold">{ev.weighted_f1?.toFixed(3)}</dd>
            </dl>
            {!r && null}
            {r && !trainedHere && r.labels.labeled_rows === 0 && (
              <p className="mt-4 rounded-2xl bg-sun-soft/70 px-3 py-2 text-xs text-ink-soft">
                This dataset has no labels or ratings, so these scores come from the model's own held-out test set.
              </p>
            )}
          </Card>
          <Card className="lg:col-span-7">
            <CardTitle note="Diagonal cells are correct predictions">Confusion matrix</CardTitle>
            <Confusion cm={ev.confusion_matrix} />
          </Card>
          <Card className="lg:col-span-6">
            <CardTitle note="Precision: how often a predicted label is right. Recall: how many of the real ones were found.">Per-class scores</CardTitle>
            <SimpleBars height={260} xKey="name" valueFmt={(v) => Number(v).toFixed(2)}
                        data={ORDER.map((s) => ({ name: SENT[s].label, ...ev.per_class[s] }))}
                        bars={[{ key: "precision", name: "Precision", color: "var(--color-neu)" }, { key: "recall", name: "Recall", color: "var(--color-pos)" },
                               { key: "f1", name: "F1", color: "var(--color-sun)" }]} />
          </Card>
          <div className="lg:col-span-6"><Playground jobId={trainedHere ? selectedId : undefined} /></div>
        </div>
      )}
    </div>
  );
}
