"""Emit word-recognizability.json: words from wordlist in metrics pickle with 8–14 tile count (pickle tuple[0]), values = recognizability tier (tuple[2])."""

import json
import pickle
import re
import sys
from pathlib import Path

root = Path(sys.argv[1]).resolve()
out_path = Path(sys.argv[2]).resolve()

pkl_path = root / "text" / "word_metrics_7_10.pkl"
wordlist_path = root / "text" / "wordlist.txt"

with pkl_path.open("rb") as f:
    metrics = pickle.load(f)

words_out = {}
with wordlist_path.open(encoding="utf8") as f:
    for line in f:
        w = line.strip().lower()
        if not w or not re.match(r"^[a-z]+$", w):
            continue
        if w not in metrics:
            continue
        t0, _score, rec, _x = metrics[w]
        if 8 <= int(t0) <= 14:
            words_out[w] = int(rec)

out_path.parent.mkdir(parents=True, exist_ok=True)
payload = {"version": 1, "words": words_out}
with out_path.open("w", encoding="utf8") as f:
    json.dump(payload, f, separators=(",", ":"))
    f.write("\n")

print(f"Wrote {len(words_out)} words to {out_path}")
