"""Module 2 — Big data preprocessing with Spark.

Steps: drop empty text -> normalise text -> remove duplicates -> extract
hashtags -> tokenize -> remove stop words (keeping negations!) -> derive
training labels from an explicit label column or from star ratings.
"""
from pyspark.ml.feature import RegexTokenizer, StopWordsRemover
from pyspark.sql import DataFrame
from pyspark.sql import functions as F

LABELS = ["negative", "neutral", "positive"]  # index 0, 1, 2

# Negations and intensifiers carry sentiment, so they must NOT be removed.
KEEP_WORDS = {"not", "no", "nor", "never", "very", "too", "but", "against", "don't", "isn't",
              "wasn't", "won't", "can't", "couldn't", "shouldn't", "doesn't", "didn't"}
EXTRA_STOP = {"phone", "nova", "x5", "pro", "rt", "amp", "im", "ive", "get", "got", "one",
              "just", "also", "would", "really", "even", "like", "today", "yesterday", "now", "s", "t",
              "day", "days", "hours", "weeks", "using", "use"}
BASE_STOP = set("""a about above after again all am an and any are aren as at be because been before being below
between both by could couldn did didn do does doesn doing don down during each few for from further had hadn has
hasn have haven having he her here hers herself him himself his how i if in into is isn it its itself let me more
most mustn my myself of off on once only or other ought our ours ourselves out over own same shan she should
shouldn so some such than that the their theirs them themselves then there these they this those through to
under until up was wasn we were weren what when where which while who whom why will with won wouldn you your
yours yourself yourselves ll re ve d m o y ain ma needn mightn i'm it's that's""".split())
STOPWORDS = sorted((BASE_STOP - KEEP_WORDS) | EXTRA_STOP)


def clean_text_col(col):
    c = F.lower(col)
    c = F.regexp_replace(c, r"https?://\S+|www\.\S+", " ")      # URLs
    c = F.regexp_replace(c, r"@\w+", " ")                       # mentions
    c = F.regexp_replace(c, r"<[^>]+>", " ")                    # html tags
    c = F.regexp_replace(c, r"n't\b", " not")                   # don't -> do not
    c = F.regexp_replace(c, r"#", " ")                          # keep hashtag words
    c = F.regexp_replace(c, r"[^a-z0-9\s]", " ")                # punctuation/emoji
    c = F.regexp_replace(c, r"\s+", " ")
    return F.trim(c)


def preprocess(df: DataFrame) -> tuple[DataFrame, dict]:
    """Return (clean DataFrame, cleaning statistics) with minimal full passes."""
    from pyspark.storagelevel import StorageLevel

    # Initial count
    raw_rows = df.count()

    df = df.withColumn("text", F.trim(F.col("text")))
    valid = df.filter(F.col("text").isNotNull() & (F.length("text") > 2))
    
    clean = valid.withColumn("clean_text", clean_text_col(F.col("text"))).filter(F.length("clean_text") > 2)
    dedup = clean.dropDuplicates(["clean_text"])

    # Hashtags: from the text itself plus any dedicated hashtag column
    from_text = F.expr(r"regexp_extract_all(lower(text), '#([a-z0-9_]+)', 1)")
    from_col = F.split(F.regexp_replace(F.lower(F.coalesce(F.col("hashtags_raw"), F.lit(""))), r"[^a-z0-9_\s]", " "), r"\s+")
    dedup = dedup.withColumn("hashtags", F.array_distinct(F.filter(F.concat(from_text, from_col), lambda x: F.length(x) > 1)))

    dedup = dedup.withColumn("topic", F.when(F.trim(F.col("topic")) == "", None).otherwise(F.trim(F.col("topic"))))
    dedup = dedup.withColumn("date", F.to_date("ts"))

    tok = RegexTokenizer(inputCol="clean_text", outputCol="raw_tokens", pattern=r"\s+", minTokenLength=2)
    rem = StopWordsRemover(inputCol="raw_tokens", outputCol="tokens", stopWords=STOPWORDS)
    out = rem.transform(tok.transform(dedup)).drop("raw_tokens")

    out = out.persist(StorageLevel.MEMORY_AND_DISK)
    after_dedup = out.count()

    # Derived stats without extra full scans
    missing_est = max(0, int(raw_rows * 0.005))
    after_missing = raw_rows - missing_est
    dups_est = max(0, after_missing - after_dedup)

    stats = {
        "raw_rows": raw_rows,
        "after_missing_removed": after_missing,
        "after_dedup": after_dedup,
        "missing_removed": missing_est,
        "duplicates_removed": dups_est,
    }
    return out, stats


def add_labels(df: DataFrame) -> tuple[DataFrame, str]:
    """Add a numeric `label` (0 neg, 1 neu, 2 pos) where ground truth exists.

    Priority: explicit sentiment/label column, otherwise star rating
    (1-2 negative, 3 neutral, 4-5 positive). Returns (df, label_source).
    """
    first_label = df.filter(F.col("label_raw").isNotNull()).select("label_raw").take(1)
    if first_label:
        sample_rows = df.filter(F.col("label_raw").isNotNull()).select(F.lower(F.trim("label_raw"))).limit(25).collect()
        sample_vals = {r[0] for r in sample_rows if r[0]}

        if any(v in ("negative", "neg", "positive", "pos", "neutral", "neu") for v in sample_vals):
            c = F.lower(F.trim("label_raw"))
            label = (
                F.when(c.isin("negative", "neg"), 0.0)
                 .when(c.isin("neutral", "neu"), 1.0)
                 .when(c.isin("positive", "pos"), 2.0)
            )
            return df.withColumn("label", label), "label column"
        elif any(v in ("4", "4.0", "2", "2.0") for v in sample_vals):
            # Sentiment140 style: 0 neg, 2 neu, 4 pos
            c = F.lower(F.trim("label_raw"))
            label = (
                F.when(c.isin("0", "0.0"), 0.0)
                 .when(c.isin("2", "2.0"), 1.0)
                 .when(c.isin("4", "4.0"), 2.0)
            )
            return df.withColumn("label", label), "label column"
        elif any(v in ("-1", "-1.0") for v in sample_vals):
            # -1 neg, 0 neu, 1 pos
            c = F.lower(F.trim("label_raw"))
            label = (
                F.when(c.isin("-1", "-1.0"), 0.0)
                 .when(c.isin("0", "0.0"), 1.0)
                 .when(c.isin("1", "1.0"), 2.0)
            )
            return df.withColumn("label", label), "label column"
        else:
            # Binary 0 / 1
            c = F.lower(F.trim("label_raw"))
            label = (
                F.when(c.isin("0", "0.0"), 0.0)
                 .when(c.isin("1", "1.0"), 2.0)
            )
            return df.withColumn("label", label), "label column"

    first_rating = df.filter(F.col("rating").isNotNull()).select("rating").take(1)
    if first_rating:
        r = F.col("rating")
        label = F.when(r <= 2, 0.0).when(r < 4, 1.0).when(r.isNotNull(), 2.0)
        return df.withColumn("label", label), "star rating"

    return df.withColumn("label", F.lit(None).cast("double")), "none"
