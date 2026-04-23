"""Bounded DFS search for ideal (1000, empty board, empty queue) endings."""

from __future__ import annotations

import heapq
import time
from typing import Any, Callable, Dict, List, Optional, Tuple

from .replay import TARGET_SCORE
from .state import GameState, apply_shift_state, path_word_and_tiles, try_apply_word
from .solver_words import enumerate_word_paths
from .trie import load_word_set, load_word_trie

Move = Dict[str, Any]


def iter_shift_moves():
    for axis in ("row", "col"):
        for mag in (1, 2, 3):
            yield axis, mag
            yield axis, -mag


def search_ideal(
    initial: GameState,
    *,
    wordlist_path: str,
    max_depth: int = 40,
    max_nodes: int = 200_000,
    time_limit_s: float = 30.0,
    max_path_len: int = 32,
    progress: Optional[Callable[[int, GameState], None]] = None,
    search_stats: Optional[Dict[str, Any]] = None,
    track_best_chains: int = 0,
) -> Optional[List[Move]]:
    """
    Depth-first search for a move list that reaches TARGET_SCORE with empty board and queue.
    Returns None if not found within limits.
    """
    trie = load_word_trie(wordlist_path)
    word_set = load_word_set(wordlist_path)

    best: Dict[Tuple[Tuple[Tuple[str, ...], ...], Tuple[str, ...]], int] = {}
    nodes = 0
    start = time.monotonic()
    found: Optional[List[Move]] = None
    aborted_time = False
    aborted_nodes = False
    max_score_seen = 0
    # Min-heap of (score, tie_seq, moves_snapshot); keep K highest scores.
    chain_heap: List[Tuple[int, int, List[Move]]] = []
    chain_seq = 0

    def record_chain(score: int, chain: List[Move]) -> None:
        nonlocal chain_seq, chain_heap
        if track_best_chains <= 0:
            return
        chain_seq += 1
        snap = [dict(s) for s in chain]
        if len(chain_heap) < track_best_chains:
            heapq.heappush(chain_heap, (score, chain_seq, snap))
        elif score > chain_heap[0][0]:
            heapq.heapreplace(chain_heap, (score, chain_seq, snap))

    def dfs(state: GameState, moves: List[Move], depth: int) -> bool:
        nonlocal nodes, found, aborted_time, aborted_nodes, max_score_seen
        if time.monotonic() - start > time_limit_s:
            aborted_time = True
            return False
        # Enforce budget before increment so sibling re-entries do not inflate the counter.
        if nodes >= max_nodes:
            aborted_nodes = True
            return False
        nodes += 1
        max_score_seen = max(max_score_seen, state.score)
        if progress and nodes % 5000 == 0:
            progress(nodes, state)

        if state.goal(target_score=TARGET_SCORE):
            found = moves[:]
            return True

        if depth >= max_depth or state.score > TARGET_SCORE:
            return False

        sk = (state.board_rows, state.queue)
        prev = best.get(sk)
        if prev is not None and state.score <= prev:
            return False
        best[sk] = state.score

        for axis, signed in iter_shift_moves():
            ns = apply_shift_state(state, axis, signed)
            step = {"type": "shift", "axis": axis, "signed_steps": signed}
            if dfs(ns, moves + [step], depth + 1):
                return True

        for path in enumerate_word_paths(state.board_rows, trie, max_path_len):
            nxt, err = try_apply_word(state, path, word_set=word_set)
            if err or nxt is None:
                continue
            wstr, _ = path_word_and_tiles(state.board_rows, path)
            step = {
                "type": "word",
                "path": [[r, c] for r, c in path],
                "word": wstr.lower(),
            }
            cand = moves + [step]
            record_chain(nxt.score, cand)
            if dfs(nxt, cand, depth + 1):
                return True

        return False

    dfs(initial, [], 0)

    if found is not None:
        stop_reason = "found"
    elif aborted_time:
        stop_reason = "timeout"
    elif aborted_nodes:
        stop_reason = "node_limit"
    else:
        stop_reason = "ended_without_goal"

    elapsed = time.monotonic() - start
    stats_out = {
        "stop_reason": stop_reason,
        "nodes": nodes,
        "max_score_seen": max_score_seen,
        "elapsed_s": round(elapsed, 3),
        "aborted_time": aborted_time,
        "aborted_nodes": aborted_nodes,
        "unique_states_pruning": len(best),
    }
    best_chains_payload: List[Dict[str, Any]] = []
    if track_best_chains > 0 and chain_heap:
        ranked = sorted(chain_heap, key=lambda t: (-t[0], t[1]))
        for sc, _tie, snap in ranked:
            words = [s["word"] for s in snap if s.get("type") == "word"]
            best_chains_payload.append(
                {
                    "score": sc,
                    "step_count": len(snap),
                    "num_words": len(words),
                    "words": words,
                    "moves": snap,
                }
            )

    if search_stats is not None:
        search_stats.clear()
        search_stats.update(stats_out)
        if best_chains_payload:
            search_stats["best_chains"] = best_chains_payload

    return found
