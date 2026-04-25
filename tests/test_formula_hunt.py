"""Tests for formula_hunt (length-mix formula + dictionary backtrack)."""

from __future__ import annotations

import pytest

from tools.wordhunter_cert.formula_hunt import (
    ProgressiveSlotSpec,
    RungSlotSpec,
    allowed_scores_one_rung_from_median,
    build_length7_mt7_score_target_grid,
    build_progressive_1267_fixed_payload,
    build_rung_hunt_score_plans,
    count_words_per_progressive_slot,
    count_words_per_unrestricted_slot,
    validate_progressive_slots,
    validate_unrestricted_repeat_exact,
    DEFAULT_UNRESTRICTED_HUNT_SLOTS,
    unrestricted_repeat_sum,
    materialize_rung_grid_word_lists,
    sample_materialized_rung_bags,
    run_rung_grid_sampling_analysis,
    expand_slots,
    ideal_mix_min_distinct_weighted_sum,
    ideal_perfect_hunt_weighted_sum,
    mix_weighted_min_distinct_estimates_table,
    mix_weighted_score_estimates_table,
    min_reuse_slack,
    parse_mix_counts,
    run_formula_bag,
    stats_by_length,
    sum_tile_units,
    upper_third_mean_score,
)
from tools.wordhunter_cert.word_plan import compute_word_plan_metrics


def test_parse_mix_and_expand():
    m = parse_mix_counts("4,3,2,1")
    assert m == {7: 4, 8: 3, 9: 2, 10: 1}
    slots = expand_slots(m)
    assert len(slots) == 10
    assert sum_tile_units(slots) == 80
    assert min_reuse_slack(80, 66) == 14


def test_unrestricted_default_repeat_exact():
    rep = unrestricted_repeat_sum(DEFAULT_UNRESTRICTED_HUNT_SLOTS)
    assert rep == 16
    assert validate_unrestricted_repeat_exact(DEFAULT_UNRESTRICTED_HUNT_SLOTS) == 16


def test_count_words_per_unrestricted_slot_synthetic():
    pool = [f"w{i}" for i in range(9)]
    wm = {
        "w0": (8, 88, 8, 0, 11),
        "w1": (8, 96, 7, 0, 12),
        "w2": (8, 104, 6, 0, 13),
        "w3": (8, 112, 5, 0, 14),
        "w4": (9, 126, 8, 0, 14),
        "w5": (9, 135, 7, 0, 15),
        "w6": (9, 144, 6, 0, 16),
        "w7": (10, 170, 8, 0, 17),
        "w8": (10, 180, 7, 0, 18),
    }
    out = count_words_per_unrestricted_slot(pool, wm)
    assert out["slot_count"] == 9
    assert out["sum_tile_units"] == 79
    assert out["sum_repeat_tiles"] == 16
    assert out["repeat_sum_exact"] == 16
    assert all(int(r["n_words"]) == 1 for r in out["slots"])


def test_allowed_scores_one_rung_from_median():
    scores = [70, 77, 84, 91]
    assert allowed_scores_one_rung_from_median(scores, rung=7) == [77, 84, 91]


def test_build_rung_hunt_score_plans_real_pool():
    from pathlib import Path

    pkl = Path("text/word_metrics_7_10.pkl")
    if not pkl.is_file():
        pytest.skip("text/word_metrics_7_10.pkl not present")
    from tools.wordhunter_cert.word_plan import filter_word_pool, load_word_metrics

    root = Path(__file__).resolve().parents[1]
    pool = filter_word_pool(str(root / "text" / "wordlist.txt"), 7, 10, puzzle_letters=None)
    wm = load_word_metrics(root / "text" / "word_metrics_7_10.pkl")
    out = build_rung_hunt_score_plans(pool=pool, word_metrics=wm, target_total=1000, rung=7)
    assert out["n_combinations"] > 0
    assert not out["combinations_truncated"]
    assert out["feasibility"]["target_in_min_max_band"] is True
    assert out["feasibility"]["exact_sum_reachable"] is True
    row = out["combinations_slot_scores"][0]
    assert len(row) == 10
    assert sum(row) == 1000
    assert out["slots"][-1]["length"] == 10
    assert out["slots"][-1]["band_mode"] == "anchor"


def test_sample_materialized_rung_bags_scores_and_mt():
    wm = {
        "aaaaaaa": (7, 100, 7, 0),
        "bbbbbbb": (7, 100, 7, 0),
        "ccccccc": (8, 200, 8, 0),
    }
    enriched = {
        "target_total_score": 400,
        "combinations_with_words": [
            {
                "combination_index": 0,
                "scores": [100, 100, 200],
                "words_per_slot": [["aaaaaaa", "bbbbbbb"], ["aaaaaaa"], ["ccccccc"]],
            }
        ],
    }
    out = sample_materialized_rung_bags(enriched, wm, n_runs=15, seed=2)
    assert out["summary"]["sum_scores"]["all_match_target"]
    assert out["summary"]["sum_min_distinct"]["min"] == 22
    assert out["summary"]["sum_min_distinct"]["max"] == 22
    assert out["summary"]["reuse_slack"]["mean"] == 0.0


def test_materialize_rung_grid_word_lists():
    wm = {
        "aaaaaaa": (7, 100, 7, 0),
        "bbbbbbb": (7, 100, 7, 0),
        "ccccccc": (8, 400, 8, 0),
    }
    pool = list(wm.keys())
    payload = {
        "slots": [
            {"length": 7, "min_distinct": 7},
            {"length": 7, "min_distinct": 7},
            {"length": 8, "min_distinct": 8},
        ],
        "combinations_slot_scores": [[100, 100, 400]],
    }
    out = materialize_rung_grid_word_lists(payload, pool, wm)
    row = out["combinations_with_words"][0]
    assert row["n_words_matched_per_slot"] == [2, 2, 1]
    assert row["n_full_bags_cartesian"] == 4
    assert row["log10_full_bags_cartesian"] == pytest.approx(0.6021, rel=0.05)
    assert set(row["words_per_slot"][0]) == {"aaaaaaa", "bbbbbbb"}


def test_progressive_slot_letter_sum_invalid():
    with pytest.raises(ValueError):
        _ = ProgressiveSlotSpec(7, 7, 78).letter_sum


def test_validate_progressive_default_slots():
    validate_progressive_slots(
        (
            ProgressiveSlotSpec(7, 7, 77),
            ProgressiveSlotSpec(10, 7, 200),
        )
    )


def test_count_words_per_progressive_slot_synthetic():
    """One word per default slot triple; union size = 10."""
    pool = [f"w{i}" for i in range(10)]
    wm = {
        "w0": (7, 77, 7, 0, 11),
        "w1": (7, 84, 6, 0, 12),
        "w2": (7, 91, 5, 0, 13),
        "w3": (7, 98, 5, 0, 14),
        "w4": (8, 120, 8, 0, 15),
        "w5": (8, 128, 7, 0, 16),
        "w6": (8, 136, 6, 0, 17),
        "w7": (9, 162, 8, 0, 18),
        "w8": (9, 171, 7, 0, 19),
        "w9": (10, 200, 7, 0, 20),
    }
    out = count_words_per_progressive_slot(pool, wm)
    assert out["target_total_score"] == 1267
    assert len(out["slots"]) == 10
    assert all(r["n_words"] == 1 for r in out["slots"])
    assert out["sum_slot_word_counts"] == 10
    grid = build_progressive_1267_fixed_payload(pool=pool, word_metrics=wm)
    assert grid["n_combinations"] == 1
    assert grid["combinations_slot_scores"] == [
        [77, 84, 91, 98, 120, 128, 136, 162, 171, 200]
    ]
    assert grid["feasibility"]["all_slots_nonempty"] is True


def test_build_progressive_1267_payload_empty_when_slot_missing():
    pool = ["x"]
    wm = {"x": (7, 1, 7, 0, 1)}
    grid = build_progressive_1267_fixed_payload(pool=pool, word_metrics=wm)
    assert grid["n_combinations"] == 0
    assert grid["combinations_slot_scores"] == []
    assert grid["feasibility"]["all_slots_nonempty"] is False


def test_build_rung_hunt_custom_specs_small():
    wm = {
        "a": (7, 100, 7, 0),
        "b": (7, 100, 7, 0),
        "c": (8, 400, 8, 0),
        "d": (8, 400, 8, 0),
    }
    pool = list(wm.keys())
    specs = (RungSlotSpec(7, 7), RungSlotSpec(7, 7), RungSlotSpec(8, 8), RungSlotSpec(8, 8))
    out = build_rung_hunt_score_plans(
        pool=pool,
        word_metrics=wm,
        slot_specs=specs,
        target_total=1000,
        rung=0,
    )
    assert out["n_combinations"] == 1
    assert out["combinations_slot_scores"][0] == [100, 100, 400, 400]
    assert out["feasibility"]["target_in_min_max_band"] is True
    assert out["feasibility"]["exact_sum_reachable"] is True


def test_build_rung_hunt_feasibility_min_max_outside():
    """Target below sum of per-slot mins → no tuples (fast reject)."""
    wm = {
        "a": (7, 100, 7, 0),
        "b": (8, 100, 8, 0),
    }
    pool = list(wm.keys())
    specs = (RungSlotSpec(7, 7, score_anchor=100), RungSlotSpec(8, 8, score_anchor=100))
    out = build_rung_hunt_score_plans(
        pool=pool,
        word_metrics=wm,
        slot_specs=specs,
        target_total=250,
        rung=0,
    )
    assert out["feasibility"]["sum_of_slot_score_mins"] == 200
    assert out["feasibility"]["sum_of_slot_score_maxes"] == 200
    assert out["feasibility"]["target_in_min_max_band"] is False
    assert out["feasibility"]["exact_sum_reachable"] is False
    assert out["n_combinations"] == 0
    assert out["combinations_slot_scores"] == []


def test_build_rung_hunt_feasibility_min_max_ok_exact_gap():
    """
    Sum of mins/maxes brackets target, but no choice of one score per slot hits it
    (integer hole) → exact_sum_reachable False.
    """
    wm = {
        "w040": (7, 40, 7, 0),
        "w042": (7, 42, 7, 0),
        "w051": (8, 51, 8, 0),
    }
    pool = list(wm.keys())
    specs = (RungSlotSpec(7, 7, score_anchor=41), RungSlotSpec(8, 8, score_anchor=51))
    out = build_rung_hunt_score_plans(
        pool=pool,
        word_metrics=wm,
        slot_specs=specs,
        target_total=92,
        rung=2,
    )
    assert out["feasibility"]["sum_of_slot_score_mins"] == 91
    assert out["feasibility"]["sum_of_slot_score_maxes"] == 93
    assert out["feasibility"]["target_in_min_max_band"] is True
    assert out["feasibility"]["exact_sum_reachable"] is False
    assert out["n_combinations"] == 0
    assert out["combinations_slot_scores"] == []


def test_upper_third_mean_monotonic():
    s = list(range(1, 13))
    u = upper_third_mean_score(s)
    assert u >= sum(s) / len(s)


def test_ideal_perfect_hunt_is_weighted_sum_of_length_averages():
    pool = ["abcdefg", "hijklmn"]
    wm = {w: compute_word_plan_metrics(w) for w in pool}
    stats = stats_by_length(pool, wm)
    mix = parse_mix_counts("2,0,0,0")
    raw, rounded, terms = ideal_perfect_hunt_weighted_sum(mix, stats, stat_mode="mean")
    m7 = stats[7].mean_score
    assert raw == pytest.approx(2.0 * m7)
    assert rounded == int(round(raw))
    assert terms == {"7": round(2.0 * m7, 4)}

    mt_raw, mt_rounded, mt_terms = ideal_mix_min_distinct_weighted_sum(mix, stats, stat_mode="mean")
    avg_mt = stats[7].mean_min_distinct
    assert mt_raw == pytest.approx(2.0 * avg_mt)
    assert mt_rounded == int(round(mt_raw))
    assert mt_terms == {"7": round(2.0 * avg_mt, 4)}


def test_mix_weighted_min_distinct_estimates_table():
    wm = {"a": (7, 10, 6, 0), "b": (7, 20, 7, 0), "c": (7, 20, 7, 0)}
    stats = stats_by_length(list(wm.keys()), wm)
    est = mix_weighted_min_distinct_estimates_table({7: 1}, stats)
    assert est["using_median_min_distinct"]["rounded"] == 7
    assert est["using_mode_primary_min_distinct"]["rounded"] == 7
    assert est["using_mean_min_distinct"]["rounded"] == int(round(20.0 / 3.0))
    bl = est["by_length"]["7"]
    assert bl["mix_weighted_contribution"]["mean"] == est["using_mean_min_distinct"]["terms"]["7"]


def test_mix_weighted_score_estimates_table_mean_median_mode():
    wm = {"a": (7, 10, 7, 0), "b": (7, 20, 7, 0), "c": (7, 20, 7, 0)}
    stats = stats_by_length(list(wm.keys()), wm)
    est = mix_weighted_score_estimates_table({7: 1}, stats)
    assert est["using_median_score"]["rounded"] == 20
    assert est["using_mode_primary_score"]["rounded"] == 20
    assert est["using_mean_score"]["rounded"] == int(round(50.0 / 3.0))
    bl = est["by_length"]["7"]
    assert bl["count_in_mix"] == 1
    assert bl["mix_weighted_contribution"]["mean"] == est["using_mean_score"]["terms"]["7"]
    assert bl["mix_weighted_contribution"]["median"] == est["using_median_score"]["terms"]["7"]


def test_run_formula_bag_finds_bag_small_pool():
    pool = ["abcdefg", "hijklmn"]
    wm = {w: compute_word_plan_metrics(w) for w in pool}
    stats = stats_by_length(pool, wm)
    target = wm["abcdefg"][1] + wm["hijklmn"][1]
    mix = parse_mix_counts("2,0,0,0")
    out = run_formula_bag(
        pool=pool,
        word_metrics=wm,
        mix=mix,
        budget_B=20,
        target_score=target,
        stat_mode="mean",
        score_band=500,
        max_branch=10,
        node_limit=50_000,
    )
    assert out["words"] is not None
    assert set(out["words"]) == set(pool)
    assert out["score_ok"]
    assert out["dual_mt_ok"]
    assert out["ideal_perfect_hunt_rounded"] == int(round(2.0 * stats[7].mean_score))
    assert out["ideal_sum_min_distinct_rounded"] == int(round(2.0 * stats[7].mean_min_distinct))
    assert out["target_score_explicit"] is True
    mwe = out["mix_weighted_score_estimates"]
    assert mwe["using_mean_score"]["rounded"] == out["ideal_perfect_hunt_rounded"]
    assert mwe["by_length"]["7"]["count_in_mix"] == 2
    assert "median_score" in out["length_stats"]["7"]
    assert "mode_primary_score" in out["length_stats"]["7"]
    mtm = out["mix_weighted_min_distinct_estimates"]
    assert mtm["using_mean_min_distinct"]["rounded"] == out["ideal_sum_min_distinct_rounded"]
    assert "median_min_distinct" in out["length_stats"]["7"]
    assert "mode_primary_min_distinct" in out["length_stats"]["7"]


def test_build_length7_mt7_score_target_grid():
    wm = {f"w{i}": (7, 85, 7, 0) for i in range(4)}
    pool = list(wm.keys())
    out = build_length7_mt7_score_target_grid(
        pool=pool,
        word_metrics=wm,
        n_slots=4,
        score_radius=2,
        sum_target=346,
        sum_tolerance=1,
    )
    assert out["pool_subset"]["mean_score"] == 85.0
    assert out["pool_subset"]["median_score"] == 85.0
    assert out["pool_subset"]["mode_primary_score"] == 85
    assert out["pool_subset"]["mode_scores_tied"] == [85]
    assert out["allowed_slot_scores"] == [83, 84, 85, 86, 87]
    assert out["n_combinations"] > 0
    for row in out["combinations_slot_scores"]:
        assert len(row) == 4
        assert 345 <= sum(row) <= 347
        for x in row:
            assert x in out["allowed_slot_scores"]


def test_run_formula_bag_stats_only_skips_backtrack():
    pool = ["abcdefg", "hijklmn"]
    wm = {w: compute_word_plan_metrics(w) for w in pool}
    mix = parse_mix_counts("2,0,0,0")
    out = run_formula_bag(
        pool=pool,
        word_metrics=wm,
        mix=mix,
        budget_B=20,
        target_score=999999,
        stat_mode="mean",
        score_band=1,
        max_branch=1,
        node_limit=1,
        stats_only=True,
    )
    assert out["stats_only"] is True
    assert out["words"] is None
    assert "by_length" in out["mix_weighted_score_estimates"]
    assert "by_length" in out["mix_weighted_min_distinct_estimates"]


def test_run_formula_bag_auto_target_matches_ideal_rounded():
    pool = ["abcdefg", "hijklmn"]
    wm = {w: compute_word_plan_metrics(w) for w in pool}
    mix = parse_mix_counts("2,0,0,0")
    out = run_formula_bag(
        pool=pool,
        word_metrics=wm,
        mix=mix,
        budget_B=20,
        target_score=None,
        stat_mode="mean",
        score_band=500,
        max_branch=10,
        node_limit=50_000,
    )
    assert out["target_score"] == out["ideal_perfect_hunt_rounded"]
    assert out["target_score_explicit"] is False
    assert out["words"] is not None
    assert out["score_ok"]
