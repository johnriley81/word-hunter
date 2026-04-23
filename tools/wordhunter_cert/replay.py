"""Load and verify JSON solution traces."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Tuple

from .state import GameState, try_apply_word
from .state import apply_shift_state
from .trie import load_word_set

TARGET_SCORE = 1000


def load_trace(path: str | Path) -> Dict[str, Any]:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def replay_trace(
    trace: Dict[str, Any],
    *,
    wordlist_path: str,
) -> Tuple[GameState, List[str]]:
    """
    Replay steps from trace. Returns (final_state, list of warnings/errors).
    If a step fails, stops and appends error to messages.
    """
    msgs: List[str] = []
    word_set = load_word_set(wordlist_path)

    init = trace.get("initial") or {}
    board = init.get("board")
    queue = init.get("queue")
    if board is None or queue is None:
        raise ValueError("trace must have initial.board and initial.queue")

    state = GameState.from_lists(board, queue, score=int(init.get("score", 0)))

    steps = trace.get("steps") or []
    for i, step in enumerate(steps):
        kind = step.get("type")
        if kind == "shift":
            axis = step.get("axis")
            signed = int(step.get("signed_steps", 0))
            state = apply_shift_state(state, axis, signed)
        elif kind == "word":
            path = [tuple(p) for p in step["path"]]
            new_state, err = try_apply_word(state, path, word_set=word_set)
            if err:
                msgs.append(f"step {i} word failed: {err}")
                return state, msgs
            assert new_state is not None
            state = new_state
        else:
            msgs.append(f"step {i}: unknown type {kind!r}")
            return state, msgs

    return state, msgs


def verify_ideal_trace(
    trace: Dict[str, Any],
    *,
    wordlist_path: str,
    target_score: int = TARGET_SCORE,
) -> Tuple[bool, str, GameState | None]:
    """
    Returns (ok, message, final_state or None if replay could not start).
    """
    try:
        final, msgs = replay_trace(trace, wordlist_path=wordlist_path)
    except Exception as e:
        return False, str(e), None

    if msgs:
        return False, "; ".join(msgs), final

    if final.goal(target_score=target_score):
        return True, "OK: 1000 points, empty board, empty queue", final

    parts = []
    if final.score != target_score:
        parts.append(f"score {final.score} != {target_score}")
    if not final.all_empty():
        parts.append("board not all empty")
    if final.queue:
        parts.append(f"queue not empty (len {len(final.queue)})")
    return False, "; ".join(parts) or "unknown failure", final
