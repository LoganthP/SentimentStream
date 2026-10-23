import { useState } from "react";
import { ArrowRight, BarChart3, Binary, Cpu, Database, FileSpreadsheet, LayoutGrid, Zap } from "lucide-react";

const STEPS = [
  {
    num: "01",
    title: "Universal Ingestion",
    tech: "Chunked Stream & Delimiter Sniffing",
    icon: FileSpreadsheet,
    desc: "Ingests raw CSV, TSV, JSON, Parquet, or Excel files up to 10 GB. Automatically sniffs encodings, delimiters, and detects text, date, and rating columns.",
  },
  {
    num: "02",
    title: "Columnar Parquet Lake",
    tech: "Snappy-Compressed Lake Storage",
    icon: Database,
    desc: "Converts heterogeneous inputs into high-efficiency Apache Parquet files in the local data lake or HDFS, enabling fast column projection and skip-scanning.",
  },
  {
    num: "03",
    title: "Parallel Spark Partitioning",
    tech: "PySpark RDD & DataFrame Partitions",
    icon: Binary,
    desc: "Distributes records across parallel partition lanes matching your CPU cores, ensuring zero single-thread bottlenecks and optimal memory utilisation.",
  },
  {
    num: "04",
    title: "Vectorised MLlib Scoring",
    tech: "MLlib Pipeline + Tokenizer UDF",
    icon: Cpu,
    desc: "Executes RegexTokenizer, StopWordsRemover, and the trained sentiment classifier in a vectorized batch pass, classifying thousands of posts per second.",
  },
  {
    num: "05",
    title: "Spark SQL Aggregations",
    tech: "Catalyst Optimizer & Window Functions",
    icon: BarChart3,
    desc: "Computes sentiment time-series buckets, keyword frequencies, aspect sentiments, and anomaly z-scores in a single optimized pass via Spark SQL.",
  },
  {
    num: "06",
    title: "Interactive Dashboard",
    tech: "FastAPI REST + React Aurora UI",
    icon: LayoutGrid,
    desc: "Delivers zero-reload analytics, an interactive post explorer, external Hive query hooks, and downloadable Markdown/CSV project reports.",
  },
];

export default function PipelineSection() {
  const [activeStep, setActiveStep] = useState(0);

  return (
    <section id="pipeline" className="py-16 sm:py-24 relative">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-12 sm:mb-16">
          <div className="inline-flex items-center gap-2 rounded-full glass px-3.5 py-1 text-xs font-semibold text-ink-soft mb-3 border border-white/20">
            <Zap className="h-3.5 w-3.5 text-pos" />
            <span>End-to-End Architecture</span>
          </div>
          <h2 className="font-display text-3xl sm:text-5xl font-bold tracking-tight text-ink">
            How the Spark pipeline turns raw posts into insight
          </h2>
          <p className="mt-3 text-sm sm:text-base text-ink-soft">
            A distributed Big Data analytics workflow engineered for speed, fault-tolerance, and
            scalability across large social corpora.
          </p>
        </div>

        {/* Steps Grid / Scrollytelling Sequence */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {STEPS.map((step, idx) => {
            const Icon = step.icon;
            const isActive = activeStep === idx;
            return (
              <div
                key={step.num}
                onMouseEnter={() => setActiveStep(idx)}
                className={`glass lift rounded-4xl p-6 transition-all duration-300 cursor-pointer border ${
                  isActive
                    ? "border-neu/50 shadow-xl ring-1 ring-neu/30 -translate-y-1"
                    : "border-white/20 dark:border-white/10 opacity-90"
                }`}
              >
                <div className="flex items-center justify-between mb-4">
                  <span className="font-mono text-xs font-bold text-ink-mute tracking-wider">
                    STEP {step.num}
                  </span>
                  <div className={`p-2.5 rounded-2xl ${isActive ? "bg-neu/20 text-neu" : "bg-lilac dark:bg-white/5 text-ink-mute"}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                </div>

                <h3 className="font-display text-xl font-bold text-ink mb-1">
                  {step.title}
                </h3>
                <div className="text-xs font-semibold text-neu mb-3">
                  {step.tech}
                </div>
                <p className="text-sm text-ink-soft leading-relaxed font-normal">
                  {step.desc}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
