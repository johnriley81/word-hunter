#!/usr/bin/env python3
"""Extend base word_metrics.pkl with Zipf-based rows for long words (needs: pip install wordfreq)."""

from __future__ import annotations

import argparse
import pickle
import re
import sys
from pathlib import Path

from rec_zipf_tiers import zipf_to_rec


def zipf_to_score(z: float, letter_len: int) -> int:
    base = 40.0 + z * 52.0
    bump = (letter_len - 7) * 4.0
    s = int(round(base + bump))
    return max(49, min(480, s))


def aux_for_word(letter_len: int) -> int:
    return min(11, max(0, letter_len - 7))


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--base",
        type=Path,
        default=root / "text" / "word_metrics_7_10.pkl",
        help="Existing metrics pickle (default: text/word_metrics_7_10.pkl)",
    )
    ap.add_argument(
        "--out",
        type=Path,
        default=root / "text" / "word_metrics_extended.pkl",
        help="Output pickle path",
    )
    ap.add_argument(
        "--wordlist",
        type=Path,
        default=root / "text" / "wordlist.txt",
        help="Word list to scan for missing long words",
    )
    ap.add_argument(
        "--min-letters",
        type=int,
        default=8,
        help="Drop words with raw length below this from the merged output (default: 8 = no 7-letter rows)",
    )
    ap.add_argument(
        "--extend-min",
        type=int,
        default=11,
        help="Add proxy entries for raw lengths from this value",
    )
    ap.add_argument(
        "--extend-max",
        type=int,
        default=16,
        help="...through this value (inclusive)",
    )
    ap.add_argument(
        "--dry-run",
        action="store_true",
        help="Print counts only, do not write pickle",
    )
    args = ap.parse_args()

    if not args.base.is_file():
        print(f"Missing base pickle: {args.base}", file=sys.stderr)
        sys.exit(1)

    try:
        from wordfreq import zipf_frequency
    except ImportError:
        print(
            "This script needs wordfreq:  pip install wordfreq",
            file=sys.stderr,
        )
        sys.exit(1)

    with args.base.open("rb") as f:
        base: dict = pickle.load(f)

    merged: dict[str, tuple] = {}
    for w, row in base.items():
        if len(w) < args.min_letters:
            continue
        merged[w] = row

    before = len(merged)
    added = 0
    with args.wordlist.open(encoding="utf8") as f:
        for line in f:
            w = line.strip().lower()
            if not w or not re.match(r"^[a-z]+$", w):
                continue
            L = len(w)
            if L < args.extend_min or L > args.extend_max:
                continue
            if w in merged:
                continue
            z = float(zipf_frequency(w, "en", wordlist="large"))
            rec = zipf_to_rec(z)
            score = zipf_to_score(z, L)
            merged[w] = (L, score, rec, aux_for_word(L))
            added += 1

    print(
        f"Base (after min-letters>={args.min_letters}): {before} entries; "
        f"added {added} new ({args.extend_min}–{args.extend_max} letters, wordfreq); "
        f"total {len(merged)}"
    )

    if args.dry_run:
        return

    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open("wb") as f:
        pickle.dump(merged, f, protocol=pickle.HIGHEST_PROTOCOL)
    print(f"Wrote {args.out}")


if __name__ == "__main__":
    main()
