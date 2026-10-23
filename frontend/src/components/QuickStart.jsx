import { Sparkles, Upload } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAppState } from "../lib/AppState";
import { Card, ClayButton, ClayLink, ErrorNote, Progress } from "./ui";

/** Shown when there is no finished analysis to display. */
export default function QuickStart({ compact = false }) {
  const { jobs, refreshJobs, apiError } = useAppState();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const nav = useNavigate();
  const running = jobs.find((j) => j.kind === "analysis" && (j.status === "running" || j.status === "queued"));

  async function demo() {
    setBusy(true);
    setErr(null);
    try {
      const ds = await api.sample(50000);
      await api.startAnalysis(ds.id, "auto");
      await refreshJobs();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (running) {
    return (
      <Card hero className="max-w-3xl">
        <h2 className="font-display text-2xl font-bold">Spark is analysing {running.dataset_name || "your dataset"}</h2>
        <p className="mt-1 text-ink-soft">{running.stage}</p>
        <div className="mt-5"><Progress value={running.progress} /></div>
        <p className="mt-3 text-sm text-ink-mute">
          The first run also trains the default classifier, so it takes a little longer. This page fills in by itself when the job finishes.
        </p>
      </Card>
    );
  }

  return (
    <Card hero className={compact ? "" : "max-w-3xl"}>
      <h2 className="font-display text-3xl font-bold leading-tight">Turn thousands of posts into a clear read on public mood</h2>
      <p className="mt-3 max-w-prose text-ink-soft">
        Upload a CSV or JSON of posts or reviews, or start with a generated launch-week dataset for the fictional
        Nova X5 phone. Spark cleans the text, classifies every post, and finds the topics people are talking about.
      </p>
      <ErrorNote>{err || apiError}</ErrorNote>
      <div className="mt-6 flex flex-wrap gap-3">
        <ClayButton tone="pos" icon={Sparkles} onClick={demo} busy={busy}>Analyse 50K demo posts</ClayButton>
        <ClayLink to="/app/data" tone="white" icon={Upload}>Upload my own data</ClayLink>
        {busy && <button className="text-sm text-ink-mute underline" onClick={() => nav("/app/data")}>Watch progress</button>}
      </div>
    </Card>
  );
}
