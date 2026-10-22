"""Builds data/dict/ecdict-subset.json.gz from the full ECDICT CSV (https://github.com/skywind3000/ECDICT, MIT).

Keeps common single words (BNC or COCA rank within 40,000, or marked in Collins/Oxford) plus every word
form listed for them, with phonetics, Chinese meanings, part of speech and word forms. That covers the
English sentences and most words added later, while keeping the file small enough for the repository.

Usage: python -I scripts/make-ecdict-subset.py path/to/ecdict.csv [extra-words.txt]
extra-words.txt: optional list of words (one per line) that must be included, e.g. every word in the sentences.
"""
import csv
import gzip
import json
import re
import sys
from pathlib import Path

RANK_LIMIT = 40000
src = Path(sys.argv[1])
out = Path(__file__).resolve().parent.parent / "data" / "dict" / "ecdict-subset.json.gz"

csv.field_size_limit(10_000_000)
rows = {}
with src.open(encoding="utf-8", newline="") as fh:
    for r in csv.DictReader(fh):
        w = r["word"].strip()
        if not w or not re.fullmatch(r"[A-Za-z][A-Za-z'\-]*", w):
            continue
        rows[w.lower()] = r if w.lower() not in rows or w.islower() else rows[w.lower()]


def rank(r):
    ranks = [int(x) for x in (r["bnc"], r["frq"]) if x and x.isdigit() and int(x) > 0]
    return min(ranks) if ranks else 0


def keep(r):
    k = rank(r)
    return (0 < k <= RANK_LIMIT) or bool(r["collins"]) or bool(r["oxford"])


def forms(r):
    # exchange looks like "p:went/d:gone/i:going/3:goes/0:go"
    return [part.split(":", 1)[1] for part in r["exchange"].split("/") if ":" in part]


extra = set()
if len(sys.argv) > 2:
    extra = {ln.strip().lower() for ln in Path(sys.argv[2]).read_text(encoding="utf-8").splitlines() if ln.strip()}
chosen = {w for w, r in rows.items() if keep(r) or w in extra}
for w in list(chosen):
    for f in forms(rows[w]):
        if f.lower() in rows:
            chosen.add(f.lower())


def clean_translation(t):
    lines = [ln.strip() for ln in t.replace("\\n", "\n").split("\n") if ln.strip()]
    useful = [ln for ln in lines if not ln.startswith("[网络]")] or lines
    return useful[:6]


entries = {}
for w in sorted(chosen):
    r = rows[w]
    tr = clean_translation(r["translation"])
    if not tr:
        continue
    entries[w] = {
        "ipa": r["phonetic"].strip(),
        "zh": tr,
        "x": r["exchange"].strip(),
        "rank": rank(r),
    }

with gzip.open(out, "wt", encoding="utf-8") as fh:
    json.dump(entries, fh, ensure_ascii=False, separators=(",", ":"))
print(f"{len(entries)} entries -> {out} ({out.stat().st_size // 1024} KB)")
