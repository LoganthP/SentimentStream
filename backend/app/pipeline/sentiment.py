"""Module 3 — Sentiment classification with Spark MLlib.

Pipeline: tokens + bigrams -> HashingTF -> IDF -> multinomial Logistic Regression.
Classes are re-weighted (inverse frequency) so the usually-rare neutral
class is not ignored, which improves macro-F1.
"""
import json
import shutil
import time
from pathlib import Path

from pyspark.ml import Pipeline, PipelineModel
from pyspark.ml.classification import LogisticRegression
from pyspark.ml.feature import IDF, HashingTF, NGram, SQLTransformer
from pyspark.sql import DataFrame
from pyspark.sql import functions as F
from pyspark.sql.types import DoubleType

from ..config import MODEL_DIR
from .preprocess import LABELS


def build_pipeline(num_features: int = 1 << 16, max_iter: int = 20) -> Pipeline:
    return Pipeline(stages=[
        NGram(n=2, inputCol="tokens", outputCol="bigrams"),
        SQLTransformer(statement="SELECT *, concat(tokens, bigrams) AS terms FROM __THIS__"),
        HashingTF(inputCol="terms", outputCol="tf", numFeatures=num_features),
        IDF(inputCol="tf", outputCol="features", minDocFreq=2),
        LogisticRegression(featuresCol="features", labelCol="label", weightCol="weight",
                           family="multinomial", maxIter=max_iter, regParam=0.02, elasticNetParam=0.0),
    ])


def _with_weights(df: DataFrame) -> DataFrame:
    counts = {r["label"]: r["count"] for r in df.groupBy("label").count().collect()}
    total = sum(counts.values())
    k = len(counts)
    w = {lab: total / (k * c) for lab, c in counts.items()}
    m = F.create_map(*[x for lab, v in w.items() for x in (F.lit(lab), F.lit(float(v)))])
    return df.withColumn("weight", m[F.col("label")])


def evaluate(pred: DataFrame) -> dict:
    rows = pred.groupBy("label", "prediction").count().collect()
    n = len(LABELS)
    cm = [[0] * n for _ in range(n)]
    for r in rows:
        cm[int(r["label"])][int(r["prediction"])] = r["count"]
    total = sum(map(sum, cm)) or 1
    per_class = {}
    for i, name in enumerate(LABELS):
        tp = cm[i][i]
        fp = sum(cm[j][i] for j in range(n)) - tp
        fn = sum(cm[i]) - tp
        p = tp / (tp + fp) if tp + fp else 0.0
        r = tp / (tp + fn) if tp + fn else 0.0
        f1 = 2 * p * r / (p + r) if p + r else 0.0
        per_class[name] = {"precision": round(p, 4), "recall": round(r, 4), "f1": round(f1, 4),
                           "support": sum(cm[i])}
    present = [c for c in per_class.values() if c["support"] > 0]
    return {
        "accuracy": round(sum(cm[i][i] for i in range(n)) / total, 4),
        "macro_f1": round(sum(c["f1"] for c in present) / max(len(present), 1), 4),
        "weighted_f1": round(sum(c["f1"] * c["support"] for c in present) / total, 4),
        "per_class": per_class,
        "confusion_matrix": cm,
        "labels": LABELS,
        "test_rows": total,
    }


def train(df: DataFrame, model_name: str, source: str) -> tuple[PipelineModel, dict]:
    labeled = df.filter(F.col("label").isNotNull()).select("tokens", "label").limit(200_000)
    labeled = _with_weights(labeled)
    train_df, test_df = labeled.randomSplit([0.8, 0.2], seed=42)
    train_df = train_df.cache()
    t0 = time.perf_counter()
    model = build_pipeline(num_features=1 << 16, max_iter=20).fit(train_df)
    train_seconds = time.perf_counter() - t0
    metrics = evaluate(model.transform(test_df))
    metrics.update({
        "model_name": model_name,
        "algorithm": "TF-IDF (unigrams + bigrams) + multinomial Logistic Regression",
        "label_source": source,
        "train_rows": train_df.count(),
        "train_seconds": round(train_seconds, 2),
        "trained_at": time.strftime("%Y-%m-%d %H:%M:%S"),
    })
    train_df.unpersist()
    save_model(model, model_name, metrics)
    return model, metrics


def model_path(name: str) -> Path:
    return MODEL_DIR / name


def save_model(model: PipelineModel, name: str, metrics: dict) -> None:
    p = model_path(name)
    if p.exists():
        shutil.rmtree(p, ignore_errors=True)
    model.write().overwrite().save(p.as_uri())
    (MODEL_DIR / f"{name}.json").write_text(json.dumps(metrics, indent=2))


def load_model(name: str) -> PipelineModel | None:
    p = model_path(name)
    return PipelineModel.load(p.as_uri()) if p.exists() else None


def load_metrics(name: str) -> dict | None:
    p = MODEL_DIR / f"{name}.json"
    return json.loads(p.read_text()) if p.exists() else None


def predict(model: PipelineModel, df: DataFrame) -> DataFrame:
    labels = F.array(*[F.lit(x) for x in LABELS])
    out = model.transform(df)
    vec_max = F.udf(lambda v: float(max(v)) if v is not None else 0.0, DoubleType())
    out = (out.withColumn("sentiment", labels[F.col("prediction").cast("int")])
              .withColumn("confidence", vec_max(F.col("probability"))))
    return out.drop("bigrams", "terms", "tf", "features", "rawPrediction", "probability")
