"""wordlist ∩ pickle → JSON word→rec (tile-length filter runs in Node)."""

import json
import os
import pickle
import re
import sys
from pathlib import Path

root = Path(sys.argv[1]).resolve()
out_path = Path(sys.argv[2]).resolve()

# Prefer extended metrics when present (or WORD_METRICS_PKL); else original 7–10 model file.
pkl_env = os.environ.get("WORD_METRICS_PKL", "").strip()
candidates = []
if pkl_env:
    candidates.append(Path(pkl_env))
candidates.append(root / "text" / "word_metrics_extended.pkl")
candidates.append(root / "text" / "word_metrics_7_10.pkl")

pkl_path = next((p for p in candidates if p.is_file()), None)
if pkl_path is None:
    sys.exit(
        "No word metrics pickle found. Tried:\n"
        + "\n".join(f"  - {p.resolve()}" for p in candidates)
        + "\nBuild extended file: pip install wordfreq\n"
        "  python3 scripts/build-extended-word-metrics.py --out text/word_metrics_extended.pkl"
        "\n(or set WORD_METRICS_PKL to an existing pickle path)"
    )

wordlist_path = root / "text" / "wordlist.txt"

print(f"Using metrics: {pkl_path}", flush=True)

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
        _t0, _score, rec, _x = metrics[w]
        words_out[w] = int(rec)

out_path.parent.mkdir(parents=True, exist_ok=True)
payload = {"version": 1, "stage": "metrics_rec_only", "words": words_out}
with out_path.open("w", encoding="utf8") as f:
    json.dump(payload, f, separators=(",", ":"))
    f.write("\n")

print(f"Wrote {len(words_out)} word→rec entries to {out_path}")
