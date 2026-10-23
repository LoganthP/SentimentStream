const TECH_STACK = [
  { name: "Apache Spark", desc: "Cluster Engine", badge: "Distributed Core" },
  { name: "PySpark", desc: "Python Driver", badge: "v3.5.3" },
  { name: "Spark SQL", desc: "Catalyst Optimizer", badge: "ANSI SQL" },
  { name: "MLlib", desc: "Machine Learning", badge: "Pipelines" },
  { name: "Apache Arrow", desc: "Vectorised Memory", badge: "Zero-Copy" },
  { name: "Apache Parquet", desc: "Columnar Storage", badge: "Snappy" },
  { name: "FastAPI", desc: "Asynchronous REST", badge: "Python 3.11" },
  { name: "React", desc: "Interactive Frontend", badge: "Vite + Tailwind" },
];

export default function TechStackSection() {
  return (
    <section className="py-12 border-y border-black/5 dark:border-white/10 relative overflow-hidden">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-6">
          <span className="text-xs font-mono font-bold tracking-wider text-ink-mute uppercase">
            Built with modern Big Data & Machine Learning technologies
          </span>
        </div>

        {/* Tech Badges Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          {TECH_STACK.map((tech) => (
            <div
              key={tech.name}
              className="glass lift rounded-2xl p-3 text-center border border-white/20 dark:border-white/10 flex flex-col justify-between"
            >
              <div className="font-display text-sm font-bold text-ink truncate">{tech.name}</div>
              <div className="text-[10px] text-ink-mute font-medium truncate mt-0.5">
                {tech.desc}
              </div>
              <div className="mt-2 inline-block rounded-md bg-black/5 dark:bg-white/5 px-1.5 py-0.5 text-[9px] font-mono font-semibold text-neu truncate">
                {tech.badge}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
