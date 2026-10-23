import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import Logo from "../Logo";

export default function LandingFooter() {
  return (
    <footer className="pt-16 pb-12 relative overflow-hidden">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Final CTA Band */}
        <div className="glass-strong rounded-5xl p-8 sm:p-12 text-center max-w-4xl mx-auto mb-16 shadow-2xl border border-white/30 dark:border-white/10 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-pos/10 via-neu/10 to-transparent pointer-events-none" />
          <h2 className="font-display text-3xl sm:text-5xl font-bold tracking-tight text-ink mb-4 relative">
            Ready to explore your post streams?
          </h2>
          <p className="text-sm sm:text-base text-ink-soft max-w-xl mx-auto mb-8 relative font-medium">
            Bring your own CSV, Parquet, or Excel files, or generate high-fidelity synthetic demo
            datasets directly in the dashboard.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4 relative">
            <Link
              to="/app"
              className="clay clay-pos inline-flex items-center gap-2.5 px-7 py-3.5 text-base font-bold shadow-xl hover:scale-[1.03] active:scale-95 transition-transform"
            >
              <span>Launch SentimentStream</span>
              <ArrowRight className="h-5 w-5" />
            </Link>
          </div>
        </div>

        {/* Clean Minimal Footer */}
        <div className="pt-8 border-t border-black/5 dark:border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Logo className="h-6 w-6" />
            <span className="font-display text-base font-bold text-ink">SentimentStream</span>
            <span className="hidden sm:inline text-ink-mute text-xs">·</span>
            <span className="hidden sm:inline text-xs text-ink-soft">
              Real-time social media sentiment analytics on Apache Spark
            </span>
          </div>

          <div className="text-xs text-ink-mute">
            © {new Date().getFullYear()} SentimentStream. All rights reserved.
          </div>
        </div>
      </div>
    </footer>
  );
}
