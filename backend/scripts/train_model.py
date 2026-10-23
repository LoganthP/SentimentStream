"""Train and evaluate the sentiment classifier from the command line.

Default model on synthetic data:
    python -m scripts.train_model
Your own labeled dataset (needs a text column + sentiment/label or rating column):
    python -m scripts.train_model --file path/to/reviews.csv --name default_lr
Training on a real dataset (e.g. Amazon Reviews 2023) gives a much more
general model than the synthetic one. Saving with --name default_lr makes it
the model used for unlabeled uploads.
"""
import argparse
import json
from pathlib import Path

from app.jobs import train_default_model
from app.pipeline import ingest, preprocess, sentiment
from app.spark_session import get_spark

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--file")
    ap.add_argument("--name", default="default_lr")
    a = ap.parse_args()
    if not a.file:
        _, metrics = train_default_model()
    else:
        p = Path(a.file).resolve()
        fmt = "csv" if p.suffix.lower() == ".csv" else "json"
        raw = ingest.read_raw(get_spark(), p.as_uri(), fmt)
        std, mapping = ingest.standardize(raw)
        print("Column mapping:", mapping)
        df, _ = preprocess.preprocess(std)
        df, source = preprocess.add_labels(df)
        if source == "none":
            raise SystemExit("No sentiment/label or rating column found: cannot train.")
        _, metrics = sentiment.train(df, a.name, source)
    print(json.dumps({k: v for k, v in metrics.items() if k != "confusion_matrix"}, indent=2))
    print("Confusion matrix (rows = actual neg/neu/pos):", metrics["confusion_matrix"])
