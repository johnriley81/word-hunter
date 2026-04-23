"""Tests for tools/wordhunter_cert (parity with script.js)."""

from __future__ import annotations

from pathlib import Path

from tools.wordhunter_cert.io_util import assert_paired_lengths, load_json_lines
from tools.wordhunter_cert.replay import verify_ideal_trace
from tools.wordhunter_cert.rules import (
    letter_weight,
    normalize_tile,
    score_word_as_tiles,
    tiles_replace_order,
    word_breakdown,
    word_to_tile_strings,
)
from tools.wordhunter_cert.word_plan import (
    backtrack_reuse_pairs,
    compute_word_plan_metrics,
    load_word_metrics_csv,
    min_distinct_tiles_for_word,
    plan_words,
    puzzle_char_budget,
)
from tools.wordhunter_cert.state import (
    GameState,
    apply_column_shift,
    apply_row_shift,
    try_apply_word,
)
from tools.wordhunter_cert.trie import load_word_set

ROOT = Path(__file__).resolve().parents[1]
WORDLIST = ROOT / "text" / "wordlist.txt"


def test_qu_normalization_and_weight():
    assert normalize_tile("Q") == "qu"
    assert letter_weight("q") == 11
    assert letter_weight("qu") == 11


def test_revisit_path_scoring_and_sack_order():
    """A→B→A: three steps in word score, two sack replacements in first-visit order."""
    letter_sum, length, total = word_breakdown(["a", "b", "a"])
    assert letter_sum == 1 + 3 + 1
    assert length == 3
    assert total == letter_sum * length
    order = tiles_replace_order([(0, 0), (0, 1), (0, 0)])
    assert order == [(0, 0), (0, 1)]


def test_column_shift_matches_js_semantics():
    b = [
        ["a", "b", "c", "d"],
        ["e", "f", "g", "h"],
        ["i", "j", "k", "l"],
        ["m", "n", "o", "p"],
    ]
    apply_column_shift(b, signed_steps=1)
    assert b[0] == ["d", "a", "b", "c"]


def test_row_shift_positive_down():
    b = [
        ["a", "b", "c", "d"],
        ["e", "f", "g", "h"],
        ["i", "j", "k", "l"],
        ["m", "n", "o", "p"],
    ]
    apply_row_shift(b, signed_steps=1)
    assert [row[0] for row in b] == ["m", "a", "e", "i"]


def test_try_apply_word_requires_dictionary():
    ws = load_word_set(str(WORDLIST))
    board = [
        ["t", "h", "e", ""],
        ["", "", "", ""],
        ["", "", "", ""],
        ["", "", "", ""],
    ]
    st = GameState.from_lists(board, ["x", "y", "z"], score=0)
    path = [(0, 0), (0, 1), (0, 2)]
    nxt, err = try_apply_word(st, path, word_set=ws)
    assert err == ""
    assert nxt is not None
    assert nxt.board_rows[0][0] == "x"
    assert nxt.board_rows[0][1] == "y"
    assert nxt.board_rows[0][2] == "z"
    assert nxt.score > 0


def test_grids_nextletters_paired_after_fix():
    grids = load_json_lines(ROOT / "text" / "grids.txt")
    sacks = load_json_lines(ROOT / "text" / "nextletters.txt")
    assert_paired_lengths(grids, sacks)


def test_verify_rejects_bad_trace():
    empty_row = ["", "", "", ""]
    trace = {
        "initial": {"board": [empty_row[:] for _ in range(4)], "queue": []},
        "steps": [],
    }
    ok, msg, fin = verify_ideal_trace(trace, wordlist_path=str(WORDLIST))
    assert not ok
    assert fin is not None
    assert fin.score == 0


def test_word_to_tile_strings_queen_matches_explicit_tiles():
    parts = word_to_tile_strings("queen")
    assert parts == ["qu", "e", "e", "n"]
    a = word_breakdown(parts)
    b = score_word_as_tiles("queen")
    assert a == b


def test_score_word_as_tiles_lone_q_is_qu_tile():
    _, L, _ = score_word_as_tiles("qat")
    assert L == 2 + 1 + 1  # qu + a + t


def test_puzzle_char_budget_sample():
    grids = load_json_lines(ROOT / "text" / "grids.txt")
    sacks = load_json_lines(ROOT / "text" / "nextletters.txt")
    assert_paired_lengths(grids, sacks)
    B = puzzle_char_budget(grids[0], sacks[0])
    assert B == 66


def test_backtrack_reuse_pairs_pompoms_and_plain():
    assert backtrack_reuse_pairs("pompoms") == 3
    assert backtrack_reuse_pairs("abcdefg") == 0
    assert backtrack_reuse_pairs("swingings") >= 4


def test_min_distinct_tiles_for_word_small():
    assert min_distinct_tiles_for_word("aba") == 2
    assert min_distinct_tiles_for_word("aaa") == 2
    assert min_distinct_tiles_for_word("aa") == 2
    assert min_distinct_tiles_for_word("a") == 1
    assert min_distinct_tiles_for_word("abcdefg") == 7


def test_plan_words_small_pool_deterministic():
    pool = ["abcdefg", "hijklmn", "opqrstu", "vwxyzab", "cdeghij", "klmnopq"]
    r = plan_words(
        pool,
        B=40,
        target_score=500,
        iterations=80,
        seed=42,
        max_words=8,
        budget_metric="chars",
    )
    assert r["words"]
    assert r["budget_B"] == 40
    assert r["budget_metric"] == "chars"
    assert r["sum_planned_lengths"] <= 40 + 4  # default length_slack
    assert r["objective"] < 1e9


def test_load_word_metrics_csv_matches_compute(tmp_path):
    pool = ["aba", "abcdefg", "pompoms"]
    lines = ["word,tile_units,score,min_distinct,reuse_pairs"]
    for w in pool:
        L, sc, mt, rp = compute_word_plan_metrics(w)
        lines.append(f"{w},{L},{sc},{mt},{rp}")
    p = tmp_path / "m.csv"
    p.write_text("\n".join(lines) + "\n", encoding="utf-8")
    loaded = load_word_metrics_csv(p)
    for w in pool:
        assert loaded[w] == compute_word_plan_metrics(w)


def test_plan_words_word_metrics_csv_same_as_live_compute(tmp_path):
    pool = ["abcdefg", "hijklmn", "opqrstu"]
    lines = ["word,tile_units,score,min_distinct,reuse_pairs"]
    for w in pool:
        L, sc, mt, rp = compute_word_plan_metrics(w)
        lines.append(f"{w},{L},{sc},{mt},{rp}")
    p = tmp_path / "m.csv"
    p.write_text("\n".join(lines) + "\n", encoding="utf-8")
    loaded = load_word_metrics_csv(p)
    r1 = plan_words(
        pool,
        B=30,
        target_score=400,
        iterations=50,
        seed=7,
        max_words=8,
        budget_metric="min_tiles",
        word_metrics=loaded,
    )
    r2 = plan_words(
        pool,
        B=30,
        target_score=400,
        iterations=50,
        seed=7,
        max_words=8,
        budget_metric="min_tiles",
        word_metrics=None,
    )
    assert r1["words"] == r2["words"]
    assert r1["objective"] == r2["objective"]


def test_plan_words_min_tiles_budget_units():
    pool = ["abcdefg", "hijklmn", "opqrstu"]
    r = plan_words(
        pool,
        B=20,
        target_score=200,
        iterations=40,
        seed=0,
        max_words=6,
        budget_metric="min_tiles",
    )
    assert r["budget_metric"] == "min_tiles"
    assert r["sum_budget_units"] == r["sum_min_distinct_tiles"]
    for row in r["per_word"]:
        assert row["min_distinct_tiles"] == min_distinct_tiles_for_word(row["word"])


def test_verify_rejects_non_ideal_word_trace():
    board = [
        ["t", "h", "e", "s"],
        ["i", "n", "g", "r"],
        ["e", "s", "a", "d"],
        ["t", "o", "n", "u"],
    ]
    queue = ["c"] * 50
    path = [(0, 0), (0, 1), (0, 2)]
    trace = {
        "initial": {"board": board, "queue": queue, "score": 0},
        "steps": [{"type": "word", "path": [list(p) for p in path]}],
    }
    ok, msg, fin = verify_ideal_trace(trace, wordlist_path=str(WORDLIST))
    assert not ok
    assert fin is not None
    assert "1000" in msg or "board not all empty" in msg or "score" in msg
