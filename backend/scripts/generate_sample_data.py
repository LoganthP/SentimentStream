"""Generate a synthetic social-media dataset (Nova X5 launch storyline).

    python -m scripts.generate_sample_data --rows 100000 --out data/samples/nova_100k.csv
"""
import argparse
import time
from pathlib import Path

from app.pipeline.synth import generate

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--rows", type=int, default=100_000)
    ap.add_argument("--out", default=None)
    ap.add_argument("--seed", type=int, default=42)
    a = ap.parse_args()
    out = Path(a.out or f"data/samples/nova_{a.rows}.csv")
    t = time.perf_counter()
    generate(out, rows=a.rows, seed=a.seed)
    print(f"Wrote {a.rows:,} rows to {out} in {time.perf_counter() - t:.1f}s "
          f"({out.stat().st_size / 1e6:.1f} MB)")
