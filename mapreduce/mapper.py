#!/usr/bin/env python3
"""Hadoop Streaming mapper: emits (word, 1) for every word in the 'text' column of a CSV.

Run locally (simulates map -> shuffle/sort -> reduce):
    python mapper.py < ../backend/data/samples/nova_100000.csv | sort | python reducer.py | sort -k2,2nr | head -20
Run on Hadoop: see README.md in this folder.
"""
import csv
import re
import sys

STOP = set("the a an and or but to of in on for with is it this that was are be i my so very not at as".split())
reader = csv.reader(sys.stdin)
header = next(reader, [])
idx = header.index("text") if "text" in header else 0
for row in reader:
    if len(row) <= idx:
        continue
    text = re.sub(r"https?://\S+|@\w+", " ", row[idx].lower())
    for word in re.findall(r"[a-z][a-z0-9]{2,}", text):
        if word not in STOP:
            print(f"{word}\t1")
