import { CheckCircle2, Database, FileCode, Layers, ShieldCheck, Zap } from "lucide-react";

const V_CONCEPTS = [
  {
    title: "Volume",
    badge: "Scale & Storage",
    concept: "Massive scale social media datasets exceeding single-node RAM.",
    solution: "Snappy-compressed Apache Parquet columnar storage with parallel Spark partitions to distribute billions of tokens across memory without OOM crashes.",
    icon: Database,
    stats: "Up to 10 GB per archive / Millions of rows",
    color: "var(--color-pos)",
  },
  {
    title: "Velocity",
    badge: "Fast Insight Loop",
    concept: "Rapidly arriving post streams require sub-minute response times.",
    solution: "Non-blocking background worker thread pools, dual-pass progressive preview in <15s, and vectorised MLlib scoring running at thousands of posts per second.",
    icon: Zap,
    stats: "< 15s preview / 48k posts/sec scoring",
    color: "var(--color-sun)",
  },
  {
    title: "Variety",
    badge: "Multi-Format Ingestion",
    concept: "Heterogeneous formats: CSV, TSV, JSON, Parquet, Excel, and nested archives.",
    solution: "Universal ingestion engine with automatic delimiter sniffing, character encoding fallback (utf-8/latin1), and heuristic column mapping.",
    icon: FileCode,
    stats: "9 formats / Automatic schema sniffer",
    color: "var(--color-neu)",
  },
  {
    title: "Veracity",
    badge: "Data Trust & Quality",
    concept: "Social posts contain noisy duplicates, missing fields, and corrupt HTML.",
    solution: "Deterministic Regex cleaning, HTML entity unescaping, duplicate hash removal, and full cleaning statistics reported in every analysis.",
    icon: ShieldCheck,
    stats: "Exact deduplication & data quality report",
    color: "var(--color-neg)",
  },
];

export default function BigDataSection() {
  return (
    <section id="bigdata" className="py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-12 sm:mb-16">
          <div className="inline-flex items-center gap-2 rounded-full glass px-3.5 py-1 text-xs font-semibold text-ink-soft mb-3 border border-white/20">
            <Layers className="h-3.5 w-3.5 text-pos" />
            <span>Course Project Syllabus (BCSBD713)</span>
          </div>
          <h2 className="font-display text-3xl sm:text-5xl font-bold tracking-tight text-ink">
            The 4 V's of Big Data in SentimentStream
          </h2>
          <p className="mt-3 text-sm sm:text-base text-ink-soft">
            How each foundational Big Data challenge is specifically resolved using Apache Spark,
            distributed storage, and machine learning.
          </p>
        </div>

        {/* 4 V's Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {V_CONCEPTS.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className="glass lift rounded-5xl p-6 sm:p-8 flex flex-col justify-between border border-white/20 dark:border-white/10"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="font-display text-2xl sm:text-3xl font-extrabold text-ink tracking-tight">
                      {item.title}
                    </span>
                    <span
                      className="rounded-full px-3 py-1 text-xs font-bold"
                      style={{
                        backgroundColor: `${item.color}20`,
                        color: item.color,
                      }}
                    >
                      {item.badge}
                    </span>
                  </div>

                  <p className="text-sm font-semibold text-ink-mute mb-4 italic">
                    “{item.concept}”
                  </p>

                  <div className="pt-4 border-t border-black/5 dark:border-white/10">
                    <div className="text-xs font-bold text-ink mb-1.5 flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4 text-pos" />
                      <span>SentimentStream Architecture:</span>
                    </div>
                    <p className="text-sm text-ink-soft font-normal leading-relaxed">
                      {item.solution}
                    </p>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-black/5 dark:border-white/10 flex items-center justify-between text-xs font-semibold text-ink-mute">
                  <span>Verified metric:</span>
                  <span className="font-mono text-ink font-bold">{item.stats}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
