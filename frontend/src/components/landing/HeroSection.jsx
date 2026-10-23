import { useEffect, useState } from "react";
import { ArrowRight, ChevronDown, Cpu, Database, Sparkles, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import StreamCanvas from "./StreamCanvas";

function AnimatedStat({ target, suffix = "", prefix = "", label, icon: Icon }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let start = 0;
    const duration = 1200; // ms
    const startTime = performance.now();

    const update = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(eased * target));
      if (progress < 1) {
        requestAnimationFrame(update);
      }
    };
    requestAnimationFrame(update);
  }, [target]);

  return (
    <div className="glass rounded-3xl p-3.5 sm:p-4 flex items-center gap-3.5 shadow-sm border border-white/20 dark:border-white/10">
      <div className="rounded-2xl p-2.5 bg-lilac dark:bg-white/5 text-neu">
        <Icon className="h-5 w-5 text-neu" />
      </div>
      <div>
        <div className="font-display text-xl sm:text-2xl font-bold text-ink tracking-tight">
          {prefix}
          {count.toLocaleString()}
          {suffix}
        </div>
        <div className="text-xs font-semibold text-ink-mute">{label}</div>
      </div>
    </div>
  );
}

export default function HeroSection() {
  return (
    <section className="relative pt-28 sm:pt-36 pb-12 sm:pb-20 overflow-hidden">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Course Badge */}
        <div className="mb-4 inline-flex items-center gap-2 rounded-full glass px-3.5 py-1.5 text-xs font-semibold text-ink-soft border border-white/30 dark:border-white/10">
          <span className="flex h-2 w-2 rounded-full bg-pos animate-pulse" />
          <span>Big Data Analytics Course Project · BCSBD713</span>
        </div>

        {/* Headline & Subhead */}
        <div className="max-w-3xl">
          <h1 className="font-display text-4xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-ink leading-[1.08]">
            Millions of posts. <br />
            <span className="bg-gradient-to-r from-pos via-neu to-pos bg-clip-text text-transparent">
              One clear signal.
            </span>
          </h1>
          <p className="mt-4 sm:mt-6 text-base sm:text-xl text-ink-soft leading-relaxed max-w-2xl font-medium">
            Distributed social media sentiment and trend analytics powered by Apache Spark,
            Parquet partitioning, and MLlib vectorised scoring.
          </p>

          {/* CTA Buttons */}
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link
              to="/app"
              className="clay clay-pos inline-flex items-center gap-2.5 px-6 py-3.5 text-base font-bold shadow-lg hover:scale-[1.03] active:scale-95 transition-transform"
            >
              <span>Launch app</span>
              <ArrowRight className="h-5 w-5" />
            </Link>
            <a
              href="#pipeline"
              className="neu-out inline-flex items-center gap-2 px-6 py-3.5 text-base font-semibold text-ink-soft hover:text-ink transition-colors"
            >
              <span>See how it works</span>
              <ChevronDown className="h-4 w-4" />
            </a>
          </div>
        </div>

        {/* Stream Canvas (Watch the stream become insight) */}
        <div className="mt-12 sm:mt-16">
          <StreamCanvas />
        </div>

        {/* 3 Live Stat Chips */}
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <AnimatedStat
            target={10}
            suffix=" GB+"
            label="Resumable Ingestion Cap"
            icon={Database}
          />
          <AnimatedStat
            target={500}
            suffix="k+ posts"
            label="Analyzed in < 2 mins on Spark"
            icon={Cpu}
          />
          <AnimatedStat
            target={15}
            prefix="< "
            suffix=" s"
            label="Instant Interactive Preview"
            icon={Zap}
          />
        </div>
      </div>
    </section>
  );
}
