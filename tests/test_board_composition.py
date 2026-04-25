"""Tests for board composition MVP (exact word sequence + layout search)."""

from __future__ import annotations

from pathlib import Path

from tools.wordhunter_cert.board_composition import (
    build_initial_board_queue_tokens,
    collect_tile_tokens,
    find_closest_word_sequence_dp,
    find_exact_word_sequence_dp,
    find_path_for_word,
    try_forward_trace_words_only,
)
from tools.wordhunter_cert.rules import word_to_tile_strings
from tools.wordhunter_cert.state import GameState
from tools.wordhunter_cert.trie import load_word_set, load_word_trie
from tools.wordhunter_cert.word_plan import compute_word_plan_metrics

ROOT = Path(__file__).resolve().parents[1]
WORDLIST = str(ROOT / "text" / "wordlist.txt")


def test_collect_tile_tokens_concat():
    toks = collect_tile_tokens(["abc", "de"])
    assert toks == word_to_tile_strings("abc") + word_to_tile_strings("de")


def test_build_initial_board_queue_shape():
    rng = __import__("random").Random(0)
    board, queue = build_initial_board_queue_tokens(["abcdefg"], queue_len=50, rng=rng)
    assert len(board) == 4 and len(board[0]) == 4
    assert len(queue) == 50


def test_find_exact_word_sequence_dp_two_words():
    pool = ["abcdefg", "hijklmn", "opqrstu"]
    sc_a = compute_word_plan_metrics(pool[0])[1]
    sc_b = compute_word_plan_metrics(pool[1])[1]
    mt_a = compute_word_plan_metrics(pool[0])[2]
    mt_b = compute_word_plan_metrics(pool[1])[2]
    target = sc_a + sc_b
    B = mt_a + mt_b
    seq = find_exact_word_sequence_dp(
        pool,
        B,
        target,
        budget_metric="min_tiles",
        word_metrics=None,
        max_words=4,
        pool_cap=20,
    )
    assert seq is not None
    assert set(seq) == {pool[0], pool[1]}
    assert sum(compute_word_plan_metrics(w)[1] for w in seq) == target
    assert sum(compute_word_plan_metrics(w)[2] for w in seq) == B


def test_find_closest_word_sequence_dp_when_exact_impossible():
    pool = ["abcdefg", "hijklmn", "opqrstu"]
    sc_a = compute_word_plan_metrics(pool[0])[1]
    sc_b = compute_word_plan_metrics(pool[1])[1]
    mt_a = compute_word_plan_metrics(pool[0])[2]
    mt_b = compute_word_plan_metrics(pool[1])[2]
    exact_target = sc_a + sc_b
    B = mt_a + mt_b
    impossible = exact_target - 1
    assert (
        find_exact_word_sequence_dp(
            pool,
            B,
            impossible,
            budget_metric="min_tiles",
            max_words=4,
            pool_cap=20,
        )
        is None
    )
    got = find_closest_word_sequence_dp(
        pool,
        B,
        impossible,
        budget_metric="min_tiles",
        max_words=4,
        pool_cap=20,
    )
    assert got is not None
    seq, pts = got
    assert pts == exact_target
    assert set(seq) == {pool[0], pool[1]}
    assert abs(pts - impossible) == 1


def test_find_path_and_forward_one_word():
    ws = load_word_set(WORDLIST)
    trie = load_word_trie(WORDLIST)
    w = "testing"
    board = [
        ["t", "e", "s", "t"],
        ["x", "g", "n", "i"],
        ["y"] * 4,
        ["z"] * 4,
    ]
    queue = ["e"] * 50
    st = GameState.from_lists(board, queue, 0)
    path = find_path_for_word(st, w, trie, max_path_len=16)
    assert path is not None
    moves = try_forward_trace_words_only(st, [w], word_set=ws, trie=trie, max_path_len=16)
    assert moves is not None
    assert len(moves) == 1
    assert moves[0]["type"] == "word"
