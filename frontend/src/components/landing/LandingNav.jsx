import { useEffect, useState } from "react";
import { ArrowRight, Menu, X } from "lucide-react";
import { Link } from "react-router-dom";
import Logo from "../Logo";
import ThemeToggle from "../ThemeToggle";

const NAV_LINKS = [
  { href: "#demo", label: "Demo" },
  { href: "#pipeline", label: "Pipeline" },
  { href: "#features", label: "Features" },
  { href: "#bigdata", label: "Big Data" },
  { href: "#benchmarks", label: "Benchmarks" },
];

export default function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 25);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? "py-2.5 sm:py-3.5" : "py-4 sm:py-6"
      }`}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <nav
          className={`flex items-center justify-between rounded-5xl px-4 sm:px-6 py-2.5 sm:py-3 transition-all duration-300 ${
            scrolled ? "glass-strong shadow-lg" : "glass"
          }`}
          aria-label="Main Navigation"
        >
          {/* Logo & Brand */}
          <Link to="/" className="flex items-center gap-3 group">
            <Logo className="h-8 w-8 sm:h-9 sm:w-9 transition-transform group-hover:scale-105" />
            <div className="flex flex-col">
              <span className="font-display text-lg sm:text-xl font-bold leading-none tracking-tight text-ink">
                SentimentStream
              </span>
              <span className="text-[10px] sm:text-xs font-semibold text-ink-mute">
                Spark Analytics · BCSBD713
              </span>
            </div>
          </Link>

          {/* Desktop Nav Links */}
          <div className="hidden md:flex items-center gap-6 lg:gap-8">
            {NAV_LINKS.map(({ href, label }) => (
              <a
                key={href}
                href={href}
                className="text-sm font-semibold text-ink-soft hover:text-ink transition-colors"
              >
                {label}
              </a>
            ))}
          </div>

          {/* Right Actions: Theme Toggle & Launch App */}
          <div className="hidden sm:flex items-center gap-3">
            <ThemeToggle className="scale-95" />
            <Link
              to="/app"
              className="clay clay-pos inline-flex items-center gap-2 px-4 py-2 text-sm font-bold shadow-md hover:scale-[1.02] active:scale-95 transition-transform"
            >
              <span>Launch app</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {/* Mobile menu button */}
          <div className="flex sm:hidden items-center gap-2">
            <ThemeToggle className="scale-90" />
            <button
              type="button"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label="Toggle mobile menu"
              className="rounded-xl p-2 text-ink-soft hover:text-ink hover:bg-black/5 dark:hover:bg-white/10"
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5 text-ink" />}
            </button>
          </div>
        </nav>

        {/* Mobile Dropdown */}
        {mobileOpen && (
          <div className="mt-2 sm:hidden rounded-3xl glass-strong p-4 shadow-xl border border-white/20 dark:border-white/10">
            <div className="flex flex-col gap-3">
              {NAV_LINKS.map(({ href, label }) => (
                <a
                  key={href}
                  href={href}
                  onClick={() => setMobileOpen(false)}
                  className="rounded-xl px-3 py-2 text-sm font-semibold text-ink-soft hover:text-ink hover:bg-white/40 dark:hover:bg-white/5 transition-colors"
                >
                  {label}
                </a>
              ))}
              <div className="pt-2 border-t border-black/5 dark:border-white/10 flex flex-col gap-2">
                <Link
                  to="/app"
                  onClick={() => setMobileOpen(false)}
                  className="clay clay-pos flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-center"
                >
                  <span>Launch app</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
