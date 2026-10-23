import { useAppState } from "../lib/AppState";

/** Background blobs whose size follows the selected dataset's sentiment mix. */
export default function Aurora() {
  const { results } = useAppState();
  const p = results?.distribution?.percent ?? { positive: 40, neutral: 30, negative: 30 };
  const size = (v) => `${28 + v * 0.55}vmax`;
  const blobs = [
    { color: "var(--color-pos)", w: size(p.positive), top: "-12%", left: "-8%", factor: 1.0 },
    { color: "var(--color-neg)", w: size(p.negative), top: "48%", left: "62%", factor: 0.95 },
    { color: "var(--color-neu)", w: size(p.neutral), top: "-18%", left: "55%", factor: 0.95 },
    { color: "var(--color-sun)", w: "26vmax", top: "62%", left: "6%", factor: 0.8 },
  ];
  return (
    <div className="aurora" aria-hidden="true">
      {blobs.map((b, i) => (
        <div
          key={i}
          className="blob"
          style={{
            background: b.color,
            width: b.w,
            height: b.w,
            top: b.top,
            left: b.left,
            opacity: `calc(var(--aurora-blob-opacity) * ${b.factor})`,
          }}
        />
      ))}
    </div>
  );
}
