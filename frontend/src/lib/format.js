export const SENT = {
  positive: { label: "Positive", color: "var(--color-pos)", soft: "var(--color-pos-soft)", text: "text-pos" },
  neutral: { label: "Neutral", color: "var(--color-neu)", soft: "var(--color-neu-soft)", text: "text-neu" },
  negative: { label: "Negative", color: "var(--color-neg)", soft: "var(--color-neg-soft)", text: "text-neg" },
};
export const ORDER = ["positive", "neutral", "negative"];

export function num(n) {
  if (n == null || Number.isNaN(n)) return "–";
  const a = Math.abs(n);
  const trim = (s) => s.replace(/\.0$/, "");
  if (a >= 1e6) return trim((n / 1e6).toFixed(a >= 1e7 ? 0 : 1)) + "M";
  if (a >= 1e4) return trim((n / 1e3).toFixed(a >= 1e5 ? 0 : 1)) + "K";
  return Math.round(n).toLocaleString();
}
export const mem = (mb) => (mb == null ? "–" : mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`);
export const full = (n) => (n == null ? "–" : Number(n).toLocaleString());
export const pct = (n, d = 1) => (n == null ? "–" : `${Number(n).toFixed(d)}%`);
export const secs = (s) => (s == null ? "–" : s < 1 ? `${Math.round(s * 1000)} ms` : s < 90 ? `${s.toFixed(1)} s` : `${(s / 60).toFixed(1)} min`);
export const bytes = (b) => (b == null ? "–" : b > 1e9 ? `${(b / 1e9).toFixed(2)} GB` : b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);

export function netColor(net) {
  // -100..100 -> rose .. periwinkle .. mint
  if (net >= 15) return "var(--color-pos)";
  if (net <= -15) return "var(--color-neg)";
  return "var(--color-neu)";
}

export function shortDate(s) {
  if (!s) return "";
  const d = new Date(s + (s.length === 10 ? "T00:00:00Z" : ""));
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

export function timeAgo(iso) {
  if (!iso) return "";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
}

export function moodWord(net) {
  if (net == null) return "No data yet";
  if (net >= 40) return "Glowing";
  if (net >= 15) return "Warm";
  if (net > -15) return "Mixed";
  if (net > -40) return "Frustrated";
  return "Angry";
}
