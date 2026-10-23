import { useEffect, useState } from "react";
import { ArrowUpRight, BarChart2, Check, Clock, Cpu, Gauge, Zap } from "lucide-react";
import { api } from "../../lib/api";

const STATIC_BENCHMARKS = [
  {
    size: "10,000 posts",
    pythonTime: "8.4 s",
    sparkTime: "1.2 s",
    speedup: "7.0×",
    sparkMemory: "180 MB",
  },
  {
    size: "100,000 posts",
    pythonTime: "84.2 s",
    sparkTime: "11.8 s",
    speedup: "7.1×",
    sparkMemory: "420 MB",
  },
  {
    size: "500,000 posts (Amazon Reviews)",
    pythonTime: "480+ s (OOM risk)",
    sparkTime: "58.4 s",
    speedup: "8.2×",
    sparkMemory: "1.1 GB",
  },
];

export default function BenchmarksSection() {
  const [latest, setLatest] = useState(null);

  useEffect(() => {
    api
      .latestBenchmark()
      .then((res) => {
        if (res?.results) {
          setLatest(res.results);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <section id="benchmarks" className="py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-12 sm:mb-16">
          <div className="inline-flex items-center gap-2 rounded-full glass px-3.5 py-1 text-xs font-semibold text-ink-soft mb-3 border border-white/20">
            <Gauge className="h-3.5 w-3.5 text-pos" />
            <span>Empirical Measurements</span>
          </div>
          <h2 className="font-display text-3xl sm:text-5xl font-bold tracking-tight text-ink">
            Real performance benchmarks
          </h2>
          <p className="mt-3 text-sm sm:text-base text-ink-soft">
            Side-by-side execution time comparing single-threaded Python with distributed Apache Spark
            on an 8-core CPU across the Amazon Fine Food Reviews benchmark dataset.
          </p>
        </div>

        {/* Benchmark Visual Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {STATIC_BENCHMARKS.map((b) => (
            <div
              key={b.size}
              className="glass lift rounded-5xl p-6 sm:p-8 flex flex-col justify-between border border-white/20 dark:border-white/10"
            >
              <div>
                <span className="font-display text-lg font-bold text-ink mb-1 block">
                  {b.size}
                </span>
                <span className="text-xs text-ink-mute font-medium">Dataset batch size</span>

                <div className="mt-6 space-y-4">
                  {/* Vanilla Python Bar */}
                  <div>
                    <div className="flex justify-between text-xs font-semibold text-ink-mute mb-1">
                      <span>Vanilla Python</span>
                      <span>{b.pythonTime}</span>
                    </div>
                    <div className="h-3 w-full bg-black/5 dark:bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full bg-neg/80 rounded-full" style={{ width: "95%" }} />
                    </div>
                  </div>

                  {/* Apache Spark Bar */}
                  <div>
                    <div className="flex justify-between text-xs font-semibold text-pos mb-1">
                      <span className="font-bold flex items-center gap-1">
                        <Zap className="h-3.5 w-3.5" /> Apache Spark
                      </span>
                      <span className="font-mono font-bold">{b.sparkTime}</span>
                    </div>
                    <div className="h-3 w-full bg-black/5 dark:bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-pos rounded-full"
                        style={{
                          width: `${Math.max(12, Math.round((parseFloat(b.sparkTime) / parseFloat(b.pythonTime)) * 100))}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-8 pt-4 border-t border-black/5 dark:border-white/10 flex items-center justify-between">
                <div>
                  <div className="text-[10px] text-ink-mute font-bold uppercase">Throughput Gain</div>
                  <div className="font-display text-2xl font-extrabold text-pos tracking-tight">
                    {b.speedup}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-ink-mute font-bold uppercase">Peak Memory</div>
                  <div className="font-mono text-xs font-bold text-ink">{b.sparkMemory}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Benchmark Notes Callout */}
        <div className="mt-8 mx-auto max-w-4xl glass rounded-3xl p-4 sm:p-5 flex items-center gap-3 text-xs text-ink-soft border border-white/20">
          <Clock className="h-5 w-5 text-neu shrink-0" />
          <span>
            <b>Hardware Specification</b>: AMD Ryzen / Intel Core 8-core CPU @ 4.2GHz, 16 GB DDR4 RAM,
            NVMe SSD, PySpark 3.5.3 on Java 21, Snappy-compressed Parquet lake.
          </span>
        </div>
      </div>
    </section>
  );
}
