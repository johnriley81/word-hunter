"""Word-first authoring: pick dictionary words to approximate score 1000 and length budget B."""

from __future__ import annotations

import csv
import random
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Mapping, Optional, Sequence, Set, Tuple, Union

from .rules import GRID_SIZE, normalize_tile, score_word_as_tiles, word_to_tile_strings
from .solver_words import ADJ
from .trie import load_word_set


def backtrack_reuse_pairs(word: str) -> int:
    """
    Count pairs of identical tile-units at positions i,j with j >= i+2.
    Same letter (or qu) at least one tile apart can match the go-back revisit
    pattern (A-B-A) on a path, so high counts favor words that score with fewer
    unique cells than raw length suggests.
    """
    parts = word_to_tile_strings(word.strip().lower())
    n = len(parts)
    c = 0
    for i in range(n):
        for j in range(i + 2, n):
            if parts[i] == parts[j]:
                c += 1
    return c


def tile_char_len(tile: str) -> int:
    return len(normalize_tile(tile))


def puzzle_char_budget(grid: Sequence[Sequence[str]], sack: Sequence[str]) -> int:
    """B = sum of tile character lengths (qu counts as 2) for start grid + sack."""
    total = 0
    for row in grid:
        for t in row:
            total += tile_char_len(str(t))
    for t in sack:
        total += tile_char_len(str(t))
    return total


def puzzle_physical_tile_count(grid: Sequence[Sequence[str]], sack: Sequence[str]) -> int:
    """Count of physical tiles: 4×4 grid cells + sack queue length (each entry one tile)."""
    _ = grid  # grid must be 4×4; count is fixed for standard puzzle shape
    return GRID_SIZE * GRID_SIZE + len(sack)


def _spellable_with_at_most_k_distinct(parts: Tuple[str, ...], k: int) -> bool:
    """
    True iff some walk on the king-move grid spells `parts`, using at most k distinct cells,
    with game rules: each step moves to an adjacent cell; each cell has a fixed tile label;
    revisiting a cell reads the same label again.
    """
    n = len(parts)
    if n == 0:
        return True
    if k < 1:
        return False
    found = False
    letters: Dict[Tuple[int, int], str] = {}
    path: List[Tuple[int, int]] = [(0, 0)]
    letters[(0, 0)] = parts[0]

    def dfs(i: int, r: int, c: int) -> None:
        nonlocal found
        if found or len(set(path)) > k:
            return
        if i == n - 1:
            found = True
            return
        need = parts[i + 1]
        for dr, dc in ADJ:
            nr, nc = r + dr, c + dc
            added = False
            if (nr, nc) in letters:
                if letters[(nr, nc)] != need:
                    continue
            else:
                letters[(nr, nc)] = need
                added = True
            path.append((nr, nc))
            if len(set(path)) <= k:
                dfs(i + 1, nr, nc)
            path.pop()
            if added:
                del letters[(nr, nc)]

    dfs(0, 0, 0)
    return found


# (tile_units, score, min_distinct_cells, reuse_pairs) for planner / CSV cache.
WordPlanMetrics = Tuple[int, int, int, int]


def compute_word_plan_metrics(word: str) -> WordPlanMetrics:
    _, L, sc = score_word_as_tiles(word)
    mt = min_distinct_tiles_for_word(word)
    rp = backtrack_reuse_pairs(word)
    return L, sc, mt, rp


def compute_word_plan_metrics_row(word: str) -> Tuple[str, int, int, int, int]:
    """Return ``word`` plus metrics; top-level for ``ProcessPoolExecutor`` workers."""
    L, sc, mt, rp = compute_word_plan_metrics(word)
    return word, L, sc, mt, rp


def load_word_metrics_csv(path: Union[str, Path]) -> Dict[str, WordPlanMetrics]:
    """
    Load precomputed per-word metrics (see ``build-word-metrics`` CLI).
    Keys are normalized lowercase words; missing entries fall back to live computation in ``plan_words``.
    """
    p = Path(path)
    out: Dict[str, WordPlanMetrics] = {}
    with p.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        if reader.fieldnames is None:
            return out
        for row in reader:
            w = (row.get("word") or "").strip().lower()
            if not w:
                continue
            out[w] = (
                int(row["tile_units"]),
                int(row["score"]),
                int(row["min_distinct"]),
                int(row["reuse_pairs"]),
            )
    return out


def _metrics_for_word(
    word: str, cache: Optional[Mapping[str, WordPlanMetrics]]
) -> WordPlanMetrics:
    if cache is not None:
        row = cache.get(word)
        if row is not None:
            return row
    return compute_word_plan_metrics(word)


@lru_cache(maxsize=200_000)
def min_distinct_tiles_for_word(word: str) -> int:
    """
    Minimum number of distinct grid cells in any legal spelling walk for this word
    (8-neighbor moves, no staying put, qu as one tile unit).
    """
    parts = tuple(word_to_tile_strings(word.strip().lower()))
    if not parts:
        return 0
    for k in range(1, len(parts) + 1):
        if _spellable_with_at_most_k_distinct(parts, k):
            return k
    return len(parts)


def multiset_letters_from_puzzle(grid: Sequence[Sequence[str]], sack: Sequence[str]) -> Set[str]:
    """Single lowercase letters plus 'qu' as a token for multiset filtering."""
    letters: Set[str] = set()
    for row in grid:
        for t in row:
            n = normalize_tile(str(t))
            if n == "qu":
                letters.add("q")
                letters.add("u")
            else:
                for ch in n:
                    letters.add(ch)
    for t in sack:
        n = normalize_tile(str(t))
        if n == "qu":
            letters.add("q")
            letters.add("u")
        else:
            for ch in n:
                letters.add(ch)
    return letters


def word_fits_multiset(w: str, available: Set[str]) -> bool:
    """Rough filter: every character in w must appear in available (q/u for qu ok)."""
    low = w.strip().lower()
    i = 0
    while i < len(low):
        if low[i] == "q" and i + 1 < len(low) and low[i + 1] == "u":
            if "q" not in available or "u" not in available:
                return False
            i += 2
        else:
            if low[i] not in available:
                return False
            i += 1
    return True


def filter_word_pool(
    wordlist_path: str,
    word_min: int,
    word_max: int,
    *,
    puzzle_letters: Optional[Set[str]] = None,
) -> List[str]:
    ws = load_word_set(wordlist_path)
    pool = [
        w
        for w in ws
        if word_min <= len(w) <= word_max
    ]
    if puzzle_letters is not None:
        pool = [w for w in pool if word_fits_multiset(w, puzzle_letters)]
    return sorted(pool)


def _sequence_metrics(words: List[str]) -> Tuple[int, int, int, List[Tuple[str, int, int, int, int, int]]]:
    """Returns sum_L, sum_score, sum_mt, per-word rows (w, L, sc, run, rp, mt)."""
    rows: List[Tuple[str, int, int, int, int, int]] = []
    sum_L = 0
    sum_sc = 0
    sum_mt = 0
    run = 0
    for w in words:
        _, L, sc = score_word_as_tiles(w)
        rp = backtrack_reuse_pairs(w)
        mt = min_distinct_tiles_for_word(w)
        sum_L += L
        sum_sc += sc
        sum_mt += mt
        run += sc
        rows.append((w, L, sc, run, rp, mt))
    return sum_L, sum_sc, sum_mt, rows


def _objective(sum_bu: int, sum_sc: int, B: int, target: int, length_weight: float) -> float:
    return abs(sum_sc - target) + length_weight * abs(sum_bu - B)


def plan_words(
    pool: Sequence[str],
    B: int,
    target_score: int = 1000,
    *,
    iterations: int = 3000,
    seed: Optional[int] = None,
    max_words: int = 16,
    length_slack: int = 4,
    length_weight: float = 0.35,
    swap_tries: int = 30,
    reuse_bias: float = 1.25,
    budget_metric: str = "min_tiles",
    word_metrics: Optional[Mapping[str, WordPlanMetrics]] = None,
) -> Dict[str, Any]:
    """
    Randomized hill-climb: build sequences of words from pool, minimize score and length gap.
    budget_metric ``min_tiles`` uses sum of min_distinct_tiles_for_word vs B (e.g. 66 physical tiles);
    ``chars`` uses sum of tile-character lengths vs B (qu counts as 2).

    ``word_metrics``: optional precomputed rows (e.g. from ``load_word_metrics_csv``) to skip
    expensive ``min_distinct_tiles_for_word`` work for each pool word on every run.
    """
    use_min_tiles = budget_metric == "min_tiles"
    if not pool:
        return {
            "words": [],
            "budget_B": B,
            "budget_metric": budget_metric,
            "sum_planned_lengths": 0,
            "sum_min_distinct_tiles": 0,
            "sum_scores": 0,
            "score_gap": target_score,
            "length_gap_vs_B": B,
            "objective": float("inf"),
            "reuse_bias": reuse_bias,
            "per_word": [],
        }

    rng = random.Random(seed)
    pool_list = list(pool)
    scored: List[Tuple[str, int, int, int, int]] = []
    score_map: Dict[str, WordPlanMetrics] = {}
    for w in pool_list:
        L, sc, mt, rp = _metrics_for_word(w, word_metrics)
        scored.append((w, L, sc, mt, rp))
        score_map[w] = (L, sc, mt, rp)

    def budget_unit(w: str) -> int:
        L, _sc, mt, _rp = score_map[w]
        return mt if use_min_tiles else L

    def pick_priority(sc: int, rp: int) -> float:
        return (float(sc) + 1.0) * (1.0 + float(reuse_bias) * float(rp))

    def pick_fit(cur_bu: int) -> Optional[Tuple[str, int, int, int, int]]:
        best: Optional[Tuple[str, int, int, int, int]] = None
        best_pri = -1.0
        for _ in range(192):
            w, L, sc, mt, rp = rng.choice(scored)
            bu = mt if use_min_tiles else L
            if cur_bu + bu > B + length_slack:
                continue
            pri = pick_priority(sc, rp)
            if pri > best_pri:
                best_pri = pri
                best = (w, L, sc, mt, rp)
        return best

    best_words: List[str] = []
    best_obj = float("inf")
    best_sum_bu = 0
    best_sum_sc = 0

    for _ in range(iterations):
        words: List[str] = []
        sum_bu = 0
        sum_sc = 0
        guard = 0
        while sum_bu < B - length_slack and len(words) < max_words and guard < 400:
            guard += 1
            picked = pick_fit(sum_bu)
            if picked is None:
                break
            w, L, sc, mt, _rp = picked
            bu = mt if use_min_tiles else L
            words.append(w)
            sum_bu += bu
            sum_sc += sc

        for _s in range(swap_tries):
            if not words:
                break
            obj = _objective(sum_bu, sum_sc, B, target_score, length_weight)
            if obj < best_obj:
                best_obj = obj
                best_words = words[:]
                best_sum_bu = sum_bu
                best_sum_sc = sum_sc

            if sum_sc > target_score and len(words) > 1:
                idx = rng.randrange(len(words))
                removed = words.pop(idx)
                sum_bu -= budget_unit(removed)
                _, rsc, _, _ = score_map[removed]
                sum_sc -= rsc
                continue
            if sum_bu > B + length_slack and len(words) > 1:
                idx = rng.randrange(len(words))
                removed = words.pop(idx)
                sum_bu -= budget_unit(removed)
                _, rsc, _, _ = score_map[removed]
                sum_sc -= rsc
                continue

            idx = rng.randrange(len(words))
            old = words[idx]
            oL, osc, omt, _orp = score_map[old]
            obu = omt if use_min_tiles else oL
            new_w, nL, nsc, nmt = old, oL, osc, omt
            best_pri = -1.0
            max_step = 1 if use_min_tiles else 2
            for _try in range(72):
                cand, cL, csc, cmt, crp = rng.choice(scored)
                if cand == old:
                    continue
                cbu = cmt if use_min_tiles else cL
                if abs(cbu - obu) > max_step:
                    continue
                if sum_bu - obu + cbu > B + length_slack:
                    continue
                pri = pick_priority(csc, crp)
                if pri > best_pri:
                    best_pri = pri
                    new_w, nL, nsc, nmt = cand, cL, csc, cmt
            if new_w == old:
                continue
            nbu = nmt if use_min_tiles else nL
            if sum_bu - obu + nbu > B + length_slack:
                continue
            words[idx] = new_w
            sum_bu = sum_bu - obu + nbu
            sum_sc = sum_sc - osc + nsc

        obj = _objective(sum_bu, sum_sc, B, target_score, length_weight)
        if obj < best_obj:
            best_obj = obj
            best_words = words[:]
            best_sum_bu = sum_bu
            best_sum_sc = sum_sc

    sum_L, sum_sc, sum_mt, per_rows = _sequence_metrics(best_words)
    per_word = [
        {
            "word": w,
            "length": L,
            "min_distinct_tiles": mt,
            "score": sc,
            "running_score": r,
            "reuse_pairs": rp,
        }
        for w, L, sc, r, rp, mt in per_rows
    ]
    return {
        "words": best_words,
        "budget_B": B,
        "budget_metric": budget_metric,
        "sum_planned_lengths": sum_L,
        "sum_min_distinct_tiles": sum_mt,
        "sum_budget_units": best_sum_bu,
        "sum_scores": best_sum_sc,
        "score_gap": target_score - best_sum_sc,
        "length_gap_vs_B": B - best_sum_bu,
        "objective": round(best_obj, 4),
        "reuse_bias": reuse_bias,
        "per_word": per_word,
    }
