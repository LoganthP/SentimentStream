"""Module 6 — Exportable analytics summaries."""
import csv
import io


def to_csv(r: dict) -> str:
    buf = io.StringIO()
    w = csv.writer(buf)

    def section(title, header, rows):
        w.writerow([f"# {title}"])
        w.writerow(header)
        w.writerows(rows)
        w.writerow([])

    d = r["distribution"]
    section("Sentiment distribution", ["sentiment", "count", "percent", "avg_confidence"],
            [[s, d["counts"][s], d["percent"][s], d["avg_confidence"].get(s, "")] for s in d["counts"]])
    section("Timeline", ["period", "positive", "neutral", "negative", "total", "negative_share", "net"],
            [[p["bucket"], p["positive"], p["neutral"], p["negative"], p["total"], p["negative_share"], p["net"]]
             for p in r["timeline"]["points"]])
    section("Aspect sentiment", ["aspect", "positive", "neutral", "negative", "total", "net"],
            [[a["aspect"], a["positive"], a["neutral"], a["negative"], a["total"], a["net"]] for a in r["aspects"]])
    section("Top keywords", ["word", "total", "positive", "neutral", "negative"],
            [[k["word"], k["total"], k["positive"], k["neutral"], k["negative"]] for k in r["keywords"]["top"]])
    section("Hashtags", ["tag", "total", "net"], [[h["tag"], h["total"], h["net"]] for h in r["hashtags"]])
    section("Emerging terms", ["word", "prior_per_1000", "recent_per_1000", "growth"],
            [[e["word"], e["prior_rate"], e["recent_rate"], e["growth"]] for e in r["emerging"]])
    section("Topics", ["topic", "total", "net"], [[t["topic"], t["total"], t["net"]] for t in r["topics"]])
    section("Anomalies", ["period", "negative_share", "baseline", "z_score"],
            [[a["bucket"], a["negative_share"], a["baseline"], a["z_score"]] for a in r["anomalies"]])
    return buf.getvalue()


def to_markdown(r: dict, display_name: str | None = None) -> str:
    d, perf, cl = r["distribution"], r["performance"], r["cleaning"]
    m = r["model"]["metrics"] or {}
    ev = m.get("evaluation_on_this_dataset") or m
    title = display_name or r.get("job_name") or r.get("name") or r.get("dataset", {}).get("name") or r["job_id"]
    lines = [
        f"# SentimentStream report: {title}",
        "",
        f"Job `{r['job_id']}` processed **{cl['raw_rows']:,}** records in **{perf['total_seconds']} s** "
        f"on Spark {perf['spark']['version']} ({perf['spark']['master']}), storage: {perf['storage_backend']}.",
        "",
        "## Data cleaning",
        f"- Empty/missing posts removed: {cl['missing_removed']:,}",
        f"- Duplicate posts removed: {cl['duplicates_removed']:,}",
        f"- Posts analysed: {cl['after_dedup']:,}",
        "",
        "## Overall sentiment",
        "| Sentiment | Posts | Share |", "|---|---:|---:|",
        *[f"| {s} | {d['counts'][s]:,} | {d['percent'][s]}% |" for s in ("positive", "neutral", "negative")],
        "", f"Net sentiment score: **{d['net_score']}** (positive % minus negative %).", "",
        "## Classifier",
        f"- Model: {r['model']['used']} — {m.get('algorithm', '')}",
        f"- Accuracy: {ev.get('accuracy', 'n/a')}, macro-F1: {ev.get('macro_f1', 'n/a')}",
        "",
        "## Aspects (what people talk about)",
        "| Aspect | Mentions | Positive | Negative | Net |", "|---|---:|---:|---:|---:|",
        *[f"| {a['aspect']} | {a['total']:,} | {a['positive']:,} | {a['negative']:,} | {a['net']} |"
          for a in r["aspects"]],
        "",
        "## Emerging terms (latest quarter of the time window)",
        *([f"- **{e['word']}**: {e['prior_rate']} → {e['recent_rate']} per 1,000 posts (×{e['growth']})"
           for e in r["emerging"][:10]] or ["- None detected"]),
        "",
        "## Negative-sentiment alerts",
        *([f"- {a['bucket']}: {a['negative_share']}% negative vs {a['baseline']}% baseline (z = {a['z_score']})"
           for a in r["anomalies"]] or ["- No unusual spikes"]),
        "",
        "## Performance",
        "| Stage | Seconds |", "|---|---:|",
        *[f"| {k} | {v} |" for k, v in perf["stage_seconds"].items()],
        f"\nSpark jobs: {perf['spark_jobs']}, stages: {perf['stages']}, tasks: {perf['tasks']}, "
        f"peak memory: {perf['peak_memory_mb']} MB.",
    ]
    return "\n".join(lines)
