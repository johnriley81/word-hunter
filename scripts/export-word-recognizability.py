"""wordlist ∩ pickle keys → JSON word→rec (Node filters glyph length afterward).

**RECO_EXPORT_MODE** controls how **`rec`** is assigned (legacy pickle wrongly tied tier 10 to
10-letter spellings):

• **length_deciles** (DEFAULT) — per spelled-length bucket, Zipf rank → tiers 10…1.

• **zipf** — absolute **`rec_zipf_tiers.zipf_to_rec`** breakpoints.

• **legacy** / **pickle** — pickled third tuple only.

Requires **pip install wordfreq** unless **legacy** mode.
"""

from __future__ import annotations

import json
import math
import os
import pickle
import re
import sys
from collections import defaultdict
from pathlib import Path

from rec_zipf_tiers import zipf_to_rec

root = Path(sys.argv[1]).resolve()
out_path = Path(sys.argv[2]).resolve()

WORDLIST_NAME_RE = re.compile(r"^[a-z]+$")


def iter_wordlist_matches_metrics(wordlist_path: Path, metrics: dict) -> list[str]:
    """Lowercase **`word ∩ metrics`** spellings."""
    words: list[str] = []
    with wordlist_path.open(encoding="utf8") as wf:
        for line in wf:
            w = line.strip().lower()
            if not w or not WORDLIST_NAME_RE.match(w):
                continue
            if w not in metrics:
                continue
            words.append(w)
    return words


def try_wordfreq():  # noqa: ANN204
    try:
        from wordfreq import zipf_frequency as zf

        return zf
    except ImportError:
        sys.exit(
            "wordfreq is required. Install: pip install wordfreq\n"
            "(Or use RECO_EXPORT_MODE=legacy for pickled tiers.)"
        )


def tiers_from_sorted_indices(n: int) -> list[int]:
    """Index 0 → tier 10 (strongest inside bucket)."""
    if n <= 0:
        return []
    tiers: list[int] = []
    denom = max(n - 1, 1)
    for idx in range(n):
        q = idx / denom
        tier = math.ceil((1 - q) * 10)
        tiers.append(max(1, min(10, tier)))
    return tiers


def main() -> None:
    export_mode_raw = (
        os.environ.get("RECO_EXPORT_MODE", "length_deciles").strip().lower()
    )
    legacy = export_mode_raw in {"legacy", "pickle"}
    zf = None if legacy else try_wordfreq()

    pkl_env = os.environ.get("WORD_METRICS_PKL", "").strip()
    candidates: list[Path] = []
    if pkl_env:
        candidates.append(Path(pkl_env))
    candidates.append(root / "text" / "word_metrics_extended.pkl")
    candidates.append(root / "text" / "word_metrics_7_10.pkl")
    pkl_path = next((p for p in candidates if p.is_file()), None)
    if pkl_path is None:
        sys.exit(
            "No word metrics pickle found. Tried:\n"
            + "\n".join(f"  - {p.resolve()}" for p in candidates)
        )

    wordlist_path = root / "text" / "wordlist.txt"
    print(f"Using metrics: {pkl_path}", flush=True)
    print(f"RECO_EXPORT_MODE={export_mode_raw}", flush=True)

    with pkl_path.open("rb") as f:
        metrics = pickle.load(f)

    words_out: dict[str, int] = {}

    if legacy:
        for w in iter_wordlist_matches_metrics(wordlist_path, metrics):
            _t0, _score, rec, _x = metrics[w]
            words_out[w] = int(rec)
        stage = "metrics_rec_legacy_pickled_third_tuple"
        version = 2
        print("(legacy pickled rec — skewed tier vs spelled length)", flush=True)

    elif export_mode_raw in {"zipf", "absolute", "absolute_zipf"}:
        assert zf is not None
        stage = "metrics_rec_absolute_zipf"
        version = 2
        for w in iter_wordlist_matches_metrics(wordlist_path, metrics):
            zz = float(zf(w, "en", wordlist="large"))
            words_out[w] = zipf_to_rec(zz)

    elif export_mode_raw in {
        "",
        "length_deciles",
        "length-deciles",
        "deciles",
    }:
        assert zf is not None
        stage = "metrics_rec_zipf_rank_within_spelled_length"
        version = 2
        by_len: dict[int, list[tuple[str, float]]] = defaultdict(list)
        for w in iter_wordlist_matches_metrics(wordlist_path, metrics):
            lz = len(w)
            zz = float(zf(w, "en", wordlist="large"))
            by_len[lz].append((w, zz))

        for _, bucket in sorted(by_len.items()):
            lst = sorted(bucket, key=lambda t: (-t[1], t[0]))
            tiers = tiers_from_sorted_indices(len(lst))
            for (w0, _), rec in zip(lst, tiers):
                words_out[w0] = int(rec)

    else:
        sys.exit(
            f"Unknown RECO_EXPORT_MODE={export_mode_raw} "
            "(use length_deciles | zipf | legacy)"
        )

    out_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {"version": version, "stage": stage, "words": words_out}
    with out_path.open("w", encoding="utf8") as fh:
        json.dump(payload, fh, separators=(",", ":"))
        fh.write("\n")
    print(f"Wrote {len(words_out)} word→rec entries to {out_path}", flush=True)


if __name__ == "__main__":
    main()
