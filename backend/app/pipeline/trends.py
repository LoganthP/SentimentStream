"""Module 4 — Trend & keyword analytics (Spark SQL aggregations).

Every function takes the predicted DataFrame and returns small, JSON-ready
Python structures for the dashboard.
"""
import math
from operator import add

from pyspark.sql import DataFrame
from pyspark.sql import functions as F

from .preprocess import KEEP_WORDS, LABELS

NOT_KEYWORDS = sorted(KEEP_WORDS)

ASPECTS = {
    "camera": ["camera", "photo", "photos", "picture", "pictures", "lens", "zoom", "portrait", "selfie", "video"],
    "battery": ["battery", "charge", "charging", "charger", "drain", "drains", "standby", "mah"],
    "price": ["price", "cost", "expensive", "cheap", "value", "money", "worth", "overpriced", "pricing", "rupee"],
    "performance": ["performance", "fast", "slow", "lag", "lags", "laggy", "speed", "processor", "smooth",
                    "freezing", "stutter", "gaming", "apps"],
    "display": ["screen", "display", "brightness", "resolution", "120hz", "dim", "touch"],
    "design": ["design", "build", "finish", "sleek", "heavy", "light", "premium", "plasticky", "bump", "looks"],
    "delivery & service": ["delivery", "shipping", "packaging", "support", "refund", "service", "delayed", "box"],
    "audio": ["sound", "speaker", "speakers", "audio", "volume", "call"],
    "heating": ["heat", "heating", "overheats", "overheat", "overheating", "hot", "cool", "temperature"],
}


def add_aspects(df: DataFrame) -> DataFrame:
    hits = [F.when(F.arrays_overlap("tokens", F.array(*[F.lit(w) for w in words])), F.lit(name))
            for name, words in ASPECTS.items()]
    return df.withColumn("aspects", F.array_compact(F.array(*hits)))


def _mix(rows, key):
    """rows of (key, sentiment, count) -> [{key, positive, neutral, negative, total, net}]"""
    out = {}
    for r in rows:
        k = r[key]
        d = out.setdefault(k, {key: k, "positive": 0, "neutral": 0, "negative": 0})
        d[r["sentiment"]] = r["count"]
    res = []
    for d in out.values():
        d["total"] = d["positive"] + d["neutral"] + d["negative"]
        d["net"] = round((d["positive"] - d["negative"]) / d["total"] * 100, 1) if d["total"] else 0
        res.append(d)
    return res


def distribution(df: DataFrame) -> dict:
    rows = df.groupBy("sentiment").agg(F.count("*").alias("count"), F.avg("confidence").alias("conf")).collect()
    counts = {s: 0 for s in LABELS}
    conf = {}
    for r in rows:
        counts[r["sentiment"]] = r["count"]
        conf[r["sentiment"]] = round(r["conf"] or 0, 3)
    total = sum(counts.values()) or 1
    return {
        "counts": counts,
        "percent": {k: round(v / total * 100, 1) for k, v in counts.items()},
        "avg_confidence": conf,
        "net_score": round((counts["positive"] - counts["negative"]) / total * 100, 1),
        "total": sum(counts.values()),
    }


def timeline(df: DataFrame) -> dict:
    span = df.agg(F.min("ts").alias("lo"), F.max("ts").alias("hi")).first()
    if span["lo"] is None:
        return {"granularity": None, "points": [], "start": None, "end": None}
    days = (span["hi"] - span["lo"]).days
    gran = "day" if days <= 120 else "week" if days <= 3 * 365 else "month"
    bucket = F.date_format(F.date_trunc(gran, "ts"), "yyyy-MM-dd")
    rows = (df.filter(F.col("ts").isNotNull()).withColumn("bucket", bucket)
              .groupBy("bucket", "sentiment").count().collect())
    pts = sorted(_mix(rows, "bucket"), key=lambda d: d["bucket"])
    for p in pts:
        p["negative_share"] = round(p["negative"] / p["total"] * 100, 1) if p["total"] else 0
    return {"granularity": gran, "points": pts, "start": str(span["lo"].date()), "end": str(span["hi"].date())}


def keywords(df: DataFrame, top: int = 40) -> dict:
    words = df.select("sentiment", F.explode(F.array_except("tokens", "hashtags")).alias("word")).filter(
        (F.length("word") > 2) & ~F.col("word").rlike(r"\d") & ~F.col("word").isin(NOT_KEYWORDS))
    # Single pass: group by word and sentiment
    piv = words.groupBy("word").pivot("sentiment", LABELS).count().fillna(0)
    piv = piv.withColumn("total", sum(F.col(s) for s in LABELS))
    top_piv = piv.orderBy(F.desc("total")).limit(top).collect()

    mix_list = []
    by_sent = {s: [] for s in LABELS}
    for r in top_piv:
        w = r["word"]
        entry = {
            "word": w,
            "positive": r["positive"],
            "neutral": r["neutral"],
            "negative": r["negative"],
            "total": r["total"],
            "net": round((r["positive"] - r["negative"]) / r["total"] * 100, 1) if r["total"] else 0,
        }
        mix_list.append(entry)

    for s in LABELS:
        sorted_by_s = sorted(mix_list, key=lambda x: -x[s])
        by_sent[s] = [{"word": x["word"], "count": x[s]} for x in sorted_by_s[:15] if x[s] > 0]

    return {"top": mix_list, "by_sentiment": by_sent}


def hashtags(df: DataFrame, top: int = 20) -> list:
    tags = df.select("sentiment", F.explode("hashtags").alias("tag"))
    rows = tags.groupBy("tag", "sentiment").count().collect()
    if not rows:
        return []
    mixed = _mix(rows, "tag")
    return sorted(mixed, key=lambda d: -d["total"])[:top]


def aspects(df: DataFrame) -> list:
    rows = (df.select("sentiment", F.explode("aspects").alias("aspect"))
              .groupBy("aspect", "sentiment").count().collect())
    return sorted(_mix(rows, "aspect"), key=lambda d: -d["total"])


def aspect_timeline(df: DataFrame, gran: str | None) -> list:
    if not gran:
        return []
    bucket = F.date_format(F.date_trunc(gran, "ts"), "yyyy-MM-dd")
    rows = (df.filter(F.col("ts").isNotNull()).select(bucket.alias("bucket"), F.explode("aspects").alias("aspect"),
                                                       "sentiment")
              .groupBy("bucket", "aspect").agg(
                  F.count("*").alias("mentions"),
                  F.round(F.avg(F.when(F.col("sentiment") == "negative", 100.0).otherwise(0.0)), 1).alias("negative_share"))
              .orderBy("bucket").collect())
    return [r.asDict() for r in rows]


def topics(df: DataFrame, top: int = 15) -> list:
    t = df.filter(F.col("topic").isNotNull())
    rows = t.groupBy("topic", "sentiment").count().collect()
    if not rows:
        return []
    mixed = _mix(rows, "topic")
    return sorted(mixed, key=lambda d: -d["total"])[:top]


def emerging_terms(df: DataFrame, top: int = 15, min_recent: int = 10) -> list:
    """Terms whose share of posts grew most in the latest quarter of the time window."""
    span = df.agg(F.min("ts").alias("lo"), F.max("ts").alias("hi")).first()
    if span["lo"] is None or span["lo"] == span["hi"]:
        return []
    cut = span["hi"] - (span["hi"] - span["lo"]) / 4
    period = F.when(F.col("ts") >= F.lit(cut), "recent").otherwise("prior")
    d = df.filter(F.col("ts").isNotNull()).withColumn("period", period)
    sizes = {r["period"]: r["count"] for r in d.groupBy("period").count().collect()}
    if len(sizes) < 2:
        return []
    words = (d.select("period", F.explode(F.array_distinct(F.array_except("tokens", "hashtags"))).alias("word"))
               .filter((F.length("word") > 2) & ~F.col("word").rlike(r"\d") & ~F.col("word").isin(NOT_KEYWORDS)))
    piv = words.groupBy("word").pivot("period", ["prior", "recent"]).count().fillna(0)
    piv = piv.filter(F.col("recent") >= min_recent)
    rp, rr = sizes["prior"], sizes["recent"]
    piv = (piv.withColumn("prior_rate", F.col("prior") / rp * 1000)
              .withColumn("recent_rate", F.col("recent") / rr * 1000)
              .withColumn("growth", (F.col("recent_rate") + 0.5) / (F.col("prior_rate") + 0.5)))
    rows = piv.orderBy(F.desc("growth")).limit(top).collect()
    return [{"word": r["word"], "recent": r["recent"], "prior": r["prior"],
             "recent_rate": round(r["recent_rate"], 2), "prior_rate": round(r["prior_rate"], 2),
             "growth": round(r["growth"], 2)} for r in rows if r["growth"] > 1.15]


def anomalies(points: list, z_threshold: float = 2.0, min_posts: int = 20) -> list:
    """Flag periods whose negative share is unusually high (z-score)."""
    pts = [p for p in points if p["total"] >= min_posts]
    if len(pts) < 4:
        return []
    shares = [p["negative_share"] for p in pts]
    mean = sum(shares) / len(shares)
    std = math.sqrt(sum((s - mean) ** 2 for s in shares) / len(shares)) or 1e-9
    out = []
    for p in pts:
        z = (p["negative_share"] - mean) / std
        if z >= z_threshold or (z >= 1.5 and p["negative_share"] - mean >= 8):
            out.append({"bucket": p["bucket"], "negative_share": p["negative_share"],
                        "baseline": round(mean, 1), "z_score": round(z, 2), "posts": p["total"]})
    return out


def mapreduce_wordcount(df: DataFrame, top: int = 20) -> list:
    """High-performance word count via DataFrame explode + groupBy + count.
    
    Replaces slow Python RDD serialization while preserving exact output format.
    """
    words = df.select(F.explode("tokens").alias("word")).filter(
        (F.length("word") > 2) & ~F.col("word").rlike(r"\d") & ~F.col("word").isin(NOT_KEYWORDS)
    )
    rows = words.groupBy("word").count().orderBy(F.desc("count")).limit(top).collect()
    return [{"word": r["word"], "count": r["count"]} for r in rows]


def rdd_wordcount_demo(df: DataFrame, top: int = 20, max_sample: int = 20_000) -> list:
    """Classic MapReduce word count on the RDD API (syllabus Module 4 demo, run on a sample).

    map:    each post -> (word, 1) pairs
    reduce: sum the 1s per word (reduceByKey = combiner + reducer)
    """
    sample_df = df.limit(max_sample) if max_sample else df
    rdd = sample_df.select("tokens").rdd
    counts = (rdd.flatMap(lambda row: row["tokens"] or [])
                 .filter(lambda w: len(w) > 2 and w not in NOT_KEYWORDS)
                 .map(lambda w: (w, 1))
                 .reduceByKey(add))
    return [{"word": w, "count": c} for w, c in counts.takeOrdered(top, key=lambda x: -x[1])]


def full_report(df: DataFrame) -> dict:
    tl = timeline(df)
    return {
        "distribution": distribution(df),
        "timeline": tl,
        "keywords": keywords(df),
        "hashtags": hashtags(df),
        "aspects": aspects(df),
        "aspect_timeline": aspect_timeline(df, tl["granularity"]),
        "topics": topics(df),
        "emerging": emerging_terms(df),
        "anomalies": anomalies(tl["points"]),
    }
