import { ArrowRight, BarChart3, CheckCircle2, Database, Eye, Gauge, Layers, Sparkles, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";

export default function DashboardPreview() {
  return (
    <section className="py-16 sm:py-24 relative overflow-hidden">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-12 sm:mb-16">
          <div className="inline-flex items-center gap-2 rounded-full glass px-3.5 py-1 text-xs font-semibold text-ink-soft mb-3 border border-white/20">
            <Eye className="h-3.5 w-3.5 text-neu" />
            <span>Product Interface</span>
          </div>
          <h2 className="font-display text-3xl sm:text-5xl font-bold tracking-tight text-ink">
            A command center for big data social analytics
          </h2>
          <p className="mt-3 text-sm sm:text-base text-ink-soft">
            Explore sentiment distributions, temporal trends, aspect-level breakdowns, and raw classified
            posts in a unified glassmorphic interface.
          </p>
        </div>

        {/* Tilted Perspective Container with Ambient Glow */}
        <div className="relative mx-auto max-w-5xl [perspective:1400px]">
          {/* Ambient Glow */}
          <div className="absolute inset-0 -top-8 bg-gradient-to-r from-pos/20 via-neu/20 to-neg/15 blur-3xl opacity-60 rounded-full pointer-events-none" />

          {/* Tilted Glass Frame */}
          <div className="relative glass-strong rounded-5xl p-4 sm:p-6 shadow-2xl border border-white/30 dark:border-white/10 transition-transform duration-500 hover:[transform:rotateX(0deg)_rotateY(0deg)_scale(1.01)] [transform:rotateX(6deg)_scale(0.98)]">
            {/* Mock Header Bar */}
            <div className="flex items-center justify-between pb-4 border-b border-black/5 dark:border-white/10 text-xs font-semibold">
              <div className="flex items-center gap-2">
                <div className="flex gap-1.5">
                  <span className="h-3 w-3 rounded-full bg-neg/80 inline-block" />
                  <span className="h-3 w-3 rounded-full bg-sun/80 inline-block" />
                  <span className="h-3 w-3 rounded-full bg-pos/80 inline-block" />
                </div>
                <span className="ml-3 font-mono text-ink-mute">
                  sentimentstream · Analysis · Nova X5 Launch (100,000 posts)
                </span>
              </div>
              <span className="text-pos flex items-center gap-1 font-semibold">
                <CheckCircle2 className="h-3.5 w-3.5" /> Spark Ready
              </span>
            </div>

            {/* Dashboard Content Mockup */}
            <div className="mt-5 space-y-5">
              {/* Top Row: Metric Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                <div className="glass rounded-3xl p-3.5 sm:p-4">
                  <div className="text-xs text-ink-mute font-semibold">Total Posts</div>
                  <div className="font-display text-xl sm:text-2xl font-bold text-ink mt-0.5">
                    100,000
                  </div>
                  <div className="text-[11px] text-pos font-semibold mt-1">98.2% clean</div>
                </div>
                <div className="glass rounded-3xl p-3.5 sm:p-4">
                  <div className="text-xs text-ink-mute font-semibold">Net Sentiment</div>
                  <div className="font-display text-xl sm:text-2xl font-bold text-pos mt-0.5">
                    +48.2
                  </div>
                  <div className="text-[11px] text-ink-mute font-semibold mt-1">62% Pos vs 14% Neg</div>
                </div>
                <div className="glass rounded-3xl p-3.5 sm:p-4">
                  <div className="text-xs text-ink-mute font-semibold">Spark Execution</div>
                  <div className="font-display text-xl sm:text-2xl font-bold text-neu mt-0.5">
                    11.8 s
                  </div>
                  <div className="text-[11px] text-ink-mute font-semibold mt-1">8 CPU cores</div>
                </div>
                <div className="glass rounded-3xl p-3.5 sm:p-4">
                  <div className="text-xs text-ink-mute font-semibold">Model Accuracy</div>
                  <div className="font-display text-xl sm:text-2xl font-bold text-ink mt-0.5">
                    91.4%
                  </div>
                  <div className="text-[11px] text-pos font-semibold mt-1">Macro-F1 0.89</div>
                </div>
              </div>

              {/* Middle Row: Visual Timeline & Aspects */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
                {/* Timeline Chart Mock */}
                <div className="sm:col-span-8 glass rounded-4xl p-5">
                  <div className="flex justify-between items-center mb-3">
                    <span className="font-display font-semibold text-sm text-ink">
                      Sentiment Over Time (7-Day Launch Window)
                    </span>
                    <span className="text-xs text-ink-mute font-semibold">Hourly Buckets</span>
                  </div>
                  <div className="h-32 sm:h-40 w-full flex items-end gap-2 pt-4">
                    {[45, 52, 48, 62, 74, 68, 80, 85, 78, 65, 55, 60, 72, 84, 90, 88].map(
                      (val, i) => (
                        <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                          <div
                            className="w-full rounded-t-lg bg-gradient-to-t from-pos/50 to-pos"
                            style={{ height: `${val}%` }}
                          />
                        </div>
                      )
                    )}
                  </div>
                </div>

                {/* Aspect Breakdown Mock */}
                <div className="sm:col-span-4 glass rounded-4xl p-5 flex flex-col justify-between">
                  <div>
                    <span className="font-display font-semibold text-sm text-ink mb-3 block">
                      Aspect Mentions
                    </span>
                    <div className="space-y-2.5 text-xs font-semibold">
                      <div className="flex justify-between">
                        <span className="text-ink">#camera</span>
                        <span className="text-pos font-mono">88% Pos</span>
                      </div>
                      <div className="h-1.5 w-full bg-black/5 dark:bg-white/10 rounded-full overflow-hidden">
                        <div className="h-full bg-pos rounded-full" style={{ width: "88%" }} />
                      </div>

                      <div className="flex justify-between">
                        <span className="text-ink">#screen</span>
                        <span className="text-pos font-mono">82% Pos</span>
                      </div>
                      <div className="h-1.5 w-full bg-black/5 dark:bg-white/10 rounded-full overflow-hidden">
                        <div className="h-full bg-pos rounded-full" style={{ width: "82%" }} />
                      </div>

                      <div className="flex justify-between">
                        <span className="text-ink">#battery</span>
                        <span className="text-neg font-mono">42% Neg</span>
                      </div>
                      <div className="h-1.5 w-full bg-black/5 dark:bg-white/10 rounded-full overflow-hidden">
                        <div className="h-full bg-neg rounded-full" style={{ width: "42%" }} />
                      </div>
                    </div>
                  </div>

                  <Link
                    to="/app"
                    className="clay clay-pos text-xs font-bold py-2 mt-4 text-center rounded-xl flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    <span>Open in dashboard</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
