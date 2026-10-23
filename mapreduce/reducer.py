#!/usr/bin/env python3
"""Hadoop Streaming reducer: input arrives sorted by word, so sum consecutive counts."""
import sys

current, total = None, 0
for line in sys.stdin:
    word, _, count = line.rstrip("\n").partition("\t")
    if word != current:
        if current is not None:
            print(f"{current}\t{total}")
        current, total = word, 0
    total += int(count or 0)
if current is not None:
    print(f"{current}\t{total}")
