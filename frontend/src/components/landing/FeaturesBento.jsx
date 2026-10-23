import { ArrowRight, BarChart3, CheckCircle, Cpu, Database, Download, Edit3, FileArchive, FileSpreadsheet, HardDrive, Layers, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";

const FORMATS = ["CSV", "TSV", "JSON", "PARQUET", "EXCEL (.xlsx)", ".GZ", ".BZ2", ".ZIP", ".TAR.GZ"];

export default function FeaturesBento() {
  return (
    <section id="features" className="py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-12 sm:mb-16">
          <div className="inline-flex items-center gap-2 rounded-full glass px-3.5 py-1 text-xs font-semibold text-ink-soft mb-3 border border-white/20">
            <Layers className="h-3.5 w-3.5 text-neu" />
            <span>Core Capabilities</span>
          </div>
          <h2 className="font-display text-3xl sm:text-5xl font-bold tracking-tight text-ink">
            Engineered for production big data workflows
          </h2>
          <p className="mt-3 text-sm sm:text-base text-ink-soft">
            Explore the features built into SentimentStream that bridge distributed cloud computing
            with rich client-side analytics.
          </p>
        </div>

        {/* Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-5">
          {/* Card 1: Universal Ingestion (Span 8) */}
          <div className="lg:col-span-8 glass lift rounded-5xl p-6 sm:p-8 flex flex-col justify-between border border-white/20 dark:border-white/10">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold text-pos mb-3">
                <FileArchive className="h-4 w-4" />
                <span>UNIVERSAL INGESTION</span>
              </div>
              <h3 className="font-display text-2xl sm:text-3xl font-bold text-ink mb-2">
                Chunked Resumable Uploads up to 10 GB
              </h3>
              <p className="text-sm sm:text-base text-ink-soft max-w-2xl font-normal leading-relaxed">
                Stream giant corpora straight into memory chunks with automatic 3x retries on failure.
                Supports plain spreadsheets, nested JSON lines, and compressed multi-part archives.
              </p>
            </div>

            {/* Scrolling Format Badges */}
            <div className="mt-8 pt-4 border-t border-black/5 dark:border-white/10 overflow-hidden">
              <div className="text-xs font-semibold text-ink-mute mb-2">Supported Input Formats:</div>
              <div className="flex flex-wrap gap-2">
                {FORMATS.map((fmt) => (
                  <span
                    key={fmt}
                    className="rounded-xl px-3 py-1.5 text-xs font-mono font-bold bg-white/60 dark:bg-white/5 border border-white/40 dark:border-white/10 text-ink-soft"
                  >
                    {fmt}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Card 2: Column Mapping (Span 4) */}
          <div className="lg:col-span-4 glass lift rounded-5xl p-6 sm:p-8 flex flex-col justify-between border border-white/20 dark:border-white/10">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold text-neu mb-3">
                <Database className="h-4 w-4" />
                <span>SCHEMA RECOGNITION</span>
              </div>
              <h3 className="font-display text-xl sm:text-2xl font-bold text-ink mb-2">
                Automatic Column Mapping
              </h3>
              <p className="text-sm text-ink-soft leading-relaxed font-normal">
                Heuristic column sniffer identifies text, date, sentiment label, rating, and category
                columns without manual configuration.
              </p>
            </div>

            <div className="mt-6 space-y-2 bg-black/5 dark:bg-white/5 rounded-2xl p-3.5 text-xs font-semibold">
              <div className="flex justify-between text-ink-soft">
                <span>Text content:</span>
                <b className="text-ink font-mono">Summary / Text</b>
              </div>
              <div className="flex justify-between text-ink-soft">
                <span>Timestamp:</span>
                <b className="text-ink font-mono">Date / Time (epoch)</b>
              </div>
              <div className="flex justify-between text-ink-soft">
                <span>Rating:</span>
                <b className="text-ink font-mono">Score (1–5 scale)</b>
              </div>
            </div>
          </div>

          {/* Card 3: Dual Classifier Engine (Span 4) */}
          <div className="lg:col-span-4 glass lift rounded-5xl p-6 sm:p-8 flex flex-col justify-between border border-white/20 dark:border-white/10">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold text-pos mb-3">
                <Cpu className="h-4 w-4" />
                <span>SPARK MLLIB</span>
              </div>
              <h3 className="font-display text-xl sm:text-2xl font-bold text-ink mb-2">
                Pretrained or Trained on Data
              </h3>
              <p className="text-sm text-ink-soft leading-relaxed font-normal">
                Switch seamlessly between an instant pretrained classifier or train a custom
                LogisticRegression / NaiveBayes model directly on your uploaded labels.
              </p>
            </div>

            <div className="mt-6 flex items-center justify-between p-3 rounded-2xl bg-pos/10 border border-pos/20 text-xs font-semibold text-pos">
              <span>Model Accuracy</span>
              <span className="font-mono text-sm font-bold">91.4% (F1: 0.89)</span>
            </div>
          </div>

          {/* Card 4: Aspect Sentiment & Trends (Span 4) */}
          <div className="lg:col-span-4 glass lift rounded-5xl p-6 sm:p-8 flex flex-col justify-between border border-white/20 dark:border-white/10">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold text-neu mb-3">
                <BarChart3 className="h-4 w-4" />
                <span>ASPECT ANALYTICS</span>
              </div>
              <h3 className="font-display text-xl sm:text-2xl font-bold text-ink mb-2">
                What People Talk About
              </h3>
              <p className="text-sm text-ink-soft leading-relaxed font-normal">
                Extracts key topics (battery, camera, performance, shipping) and breaks down positive
                vs negative mentions per aspect.
              </p>
            </div>

            <div className="mt-6 space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="text-ink">#camera</span>
                <span className="text-pos font-mono">+78 Net</span>
              </div>
              <div className="h-2 w-full bg-black/5 dark:bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-pos rounded-full" style={{ width: "88%" }} />
              </div>

              <div className="flex items-center justify-between text-xs font-semibold mt-2">
                <span className="text-ink">#battery</span>
                <span className="text-neg font-mono">-42 Net</span>
              </div>
              <div className="h-2 w-full bg-black/5 dark:bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-neg rounded-full" style={{ width: "65%" }} />
              </div>
            </div>
          </div>

          {/* Card 5: Real-Time Cluster Telemetry (Span 4) */}
          <div className="lg:col-span-4 glass lift rounded-5xl p-6 sm:p-8 flex flex-col justify-between border border-white/20 dark:border-white/10">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold text-sun mb-3">
                <HardDrive className="h-4 w-4" />
                <span>SPARK TELEMETRY</span>
              </div>
              <h3 className="font-display text-xl sm:text-2xl font-bold text-ink mb-2">
                Cluster Health & Metrics
              </h3>
              <p className="text-sm text-ink-soft leading-relaxed font-normal">
                Tracks CPU core count, driver memory, Spark tasks, stage breakdown timings, and storage
                backend (Local Lake vs HDFS).
              </p>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-2 text-center text-xs font-semibold">
              <div className="p-2.5 rounded-2xl bg-black/5 dark:bg-white/5">
                <div className="text-ink-mute text-[10px]">CORES</div>
                <div className="text-ink font-bold text-base mt-0.5">8 Threads</div>
              </div>
              <div className="p-2.5 rounded-2xl bg-black/5 dark:bg-white/5">
                <div className="text-ink-mute text-[10px]">MEMORY</div>
                <div className="text-ink font-bold text-base mt-0.5">4 GB Heap</div>
              </div>
            </div>
          </div>

          {/* Card 6: Renameable Datasets & Jobs (Span 6) */}
          <div className="lg:col-span-6 glass lift rounded-5xl p-6 sm:p-8 flex flex-col justify-between border border-white/20 dark:border-white/10">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold text-neu mb-3">
                <Edit3 className="h-4 w-4" />
                <span>METADATA & IMMUTABILITY</span>
              </div>
              <h3 className="font-display text-2xl font-bold text-ink mb-2">
                Editable Display Names & Immutable IDs
              </h3>
              <p className="text-sm sm:text-base text-ink-soft leading-relaxed font-normal">
                Inline rename anywhere with Enter/Esc shortcuts. Backed by immutable internal IDs
                so Parquet storage lake paths, caches, and Hive tables never break.
              </p>
            </div>

            <div className="mt-6 p-4 rounded-3xl bg-black/5 dark:bg-white/5 flex items-center justify-between">
              <div>
                <div className="font-semibold text-sm text-ink">Analysis · Nova X5 launch · 23 Oct</div>
                <div className="text-xs text-ink-mute font-mono">job_59fd0b0a18 · started 20 min ago</div>
              </div>
              <span className="rounded-xl px-2.5 py-1 text-xs font-bold text-pos bg-pos/15">
                Saved
              </span>
            </div>
          </div>

          {/* Card 7: Exportable Reports & Hive (Span 6) */}
          <div className="lg:col-span-6 glass lift rounded-5xl p-6 sm:p-8 flex flex-col justify-between border border-white/20 dark:border-white/10">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold text-pos mb-3">
                <Download className="h-4 w-4" />
                <span>REPORTS & HIVE</span>
              </div>
              <h3 className="font-display text-2xl font-bold text-ink mb-2">
                Project Reports & Hive SQL Querying
              </h3>
              <p className="text-sm sm:text-base text-ink-soft leading-relaxed font-normal">
                Download ready-to-paste Markdown summaries, analytical CSV tables, or query the
                classified Parquet directly using external Hive and Hadoop streaming jobs.
              </p>
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              <span className="rounded-2xl px-3 py-1.5 text-xs font-semibold bg-pos/15 text-pos border border-pos/20">
                Summary (.md)
              </span>
              <span className="rounded-2xl px-3 py-1.5 text-xs font-semibold bg-sun/15 text-sun border border-sun/20">
                Analytics (.csv)
              </span>
              <span className="rounded-2xl px-3 py-1.5 text-xs font-semibold bg-neu/15 text-neu border border-neu/20">
                Full Results (.json)
              </span>
              <span className="rounded-2xl px-3 py-1.5 text-xs font-semibold bg-black/5 dark:bg-white/10 text-ink-mute border border-black/10">
                Hive Table (sentimentstream.hql)
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
