import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { SENT } from "../lib/format";

const spring = { type: "spring", stiffness: 420, damping: 18 };

export function Card({ className = "", children, hero = false, as: As = "section", ...rest }) {
  return (
    <As className={`glass lift ${hero ? "rounded-5xl p-7" : "rounded-4xl p-5 sm:p-6"} ${className}`} {...rest}>
      {children}
    </As>
  );
}

export function CardTitle({ children, note, right }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h2 className="font-display text-lg font-semibold leading-tight">{children}</h2>
        {note && <p className="mt-0.5 text-sm text-ink-mute">{note}</p>}
      </div>
      {right}
    </div>
  );
}

export function ClayButton({ tone = "ink", className = "", busy = false, children, icon: Icon, ...rest }) {
  return (
    <motion.button
      whileHover={{ y: -2, scale: 1.03 }}
      whileTap={{ scale: 0.93, y: 1 }}
      transition={spring}
      disabled={busy || rest.disabled}
      className={`clay clay-${tone} inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold
                  disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
      {...rest}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : Icon ? <Icon className="h-4 w-4" /> : null}
      {children}
    </motion.button>
  );
}

export function ClayLink({ to, tone = "ink", children, icon: Icon, className = "" }) {
  return (
    <motion.div whileHover={{ y: -2, scale: 1.03 }} whileTap={{ scale: 0.93 }} transition={spring} className="inline-block">
      <Link to={to} className={`clay clay-${tone} inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold ${className}`}>
        {Icon && <Icon className="h-4 w-4" />}
        {children}
      </Link>
    </motion.div>
  );
}

/** Neumorphic segmented control: the active option sinks into the surface. */
export function Segmented({ options, value, onChange, size = "md", label }) {
  return (
    <div role="group" aria-label={label} className="inline-flex flex-wrap gap-2">
      {options.map((o) => {
        const v = typeof o === "string" ? o : o.value;
        const l = typeof o === "string" ? o : o.label;
        const active = v === value;
        return (
          <button
            key={v}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(active && o.clearable ? "" : v)}
            className={`neu-out ${size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm"} font-semibold
                        ${active ? "text-ink" : "text-ink-mute"}`}
          >
            {o.dot && <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: o.dot }} />}
            {l}
          </button>
        );
      })}
    </div>
  );
}

export function Field({ label, children, className = "" }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-xs font-semibold text-ink-soft">{label}</span>
      {children}
    </label>
  );
}

export const inputCls = "neu-in w-full px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-mute/70 outline-none";

export function SentimentChip({ s, children }) {
  const m = SENT[s];
  if (!m) return null;
  const textColor =
    s === "neutral"
      ? "var(--color-neu-text)"
      : s === "negative"
      ? "var(--color-neg-text)"
      : "var(--color-pos-text)";
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
      style={{ background: m.soft, color: textColor }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: m.color }} />
      {children ?? m.label}
    </span>
  );
}

export function Progress({ value, tone = "var(--color-neu)" }) {
  return (
    <div className="neu-in h-3 w-full overflow-hidden rounded-full p-0.5" role="progressbar"
         aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <motion.div className="h-full rounded-full" style={{ background: `linear-gradient(90deg, ${tone}, var(--color-sun))` }}
                  initial={false} animate={{ width: `${Math.max(4, value * 100)}%` }} transition={{ type: "spring", stiffness: 80, damping: 20 }} />
    </div>
  );
}

export function Empty({ title, children, action }) {
  return (
    <div className="flex flex-col items-start gap-3 py-6">
      <h3 className="font-display text-xl font-semibold">{title}</h3>
      <p className="max-w-prose text-sm text-ink-soft">{children}</p>
      {action}
    </div>
  );
}

export function Spinner({ label = "Loading" }) {
  return (
    <div className="flex items-center gap-2 text-sm text-ink-mute">
      <Loader2 className="h-4 w-4 animate-spin" /> {label}
    </div>
  );
}

export function ErrorNote({ children }) {
  if (!children) return null;
  return <p role="alert" className="rounded-2xl bg-neg-soft/80 px-4 py-3 text-sm font-medium text-neg-text">{children}</p>;
}

export function PageHeader({ title, children, right }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
        {children && <p className="mt-2 text-ink-soft">{children}</p>}
      </div>
      {right}
    </header>
  );
}
