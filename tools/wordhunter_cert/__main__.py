"""CLI: verify traces, search puzzles, emit JSON."""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

from .io_util import assert_paired_lengths, load_json_lines
from .replay import TARGET_SCORE, verify_ideal_trace
from .solver import search_ideal
from .state import GameState
from .word_plan import (
    filter_word_pool,
    load_word_metrics_csv,
    multiset_letters_from_puzzle,
    plan_words,
    puzzle_char_budget,
    puzzle_physical_tile_count,
)


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _format_best_chains_text(chains: list, *, words_only: bool = False) -> str:
    """Human-readable report for partial play sequences (by cumulative score)."""
    lines: list = []
    for i, c in enumerate(chains, 1):
        words = c.get("words") or []
        moves = c.get("moves") or []
        lines.append(
            f"--- rank {i}  cumulative_score={c.get('score')}  "
            f"steps={c.get('step_count')}  words_played={c.get('num_words')} ---"
        )
        lines.append(f"  word order: {' → '.join(words) if words else '(none)'}")
        if not words_only:
            parts = []
            for s in moves:
                if s.get("type") == "shift":
                    parts.append(f"shift {s.get('axis')} {int(s.get('signed_steps', 0)):+d}")
                elif s.get("type") == "word":
                    w = (s.get("word") or "?").upper()
                    plen = len(s.get("path") or [])
                    parts.append(f"{w} (path_cells={plen})")
            lines.append("  move sequence: " + " | ".join(parts))
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def cmd_verify(args: argparse.Namespace) -> int:
    tp = Path(args.trace).expanduser()
    if not tp.is_file():
        print(
            f"Trace file not found: {tp}\n"
            "Use a real JSON path (e.g. solutions/mytrace.json), not a placeholder.",
            file=sys.stderr,
        )
        return 2
    trace = json.loads(tp.read_text(encoding="utf-8"))
    ok, msg, _ = verify_ideal_trace(trace, wordlist_path=args.wordlist)
    print(msg)
    return 0 if ok else 1


def cmd_search(args: argparse.Namespace) -> int:
    root = Path(args.root) if args.root else _repo_root()
    grids = load_json_lines(root / "text" / "grids.txt")
    sacks = load_json_lines(root / "text" / "nextletters.txt")
    assert_paired_lengths(grids, sacks)
    idx = args.index % len(grids)
    state = GameState.from_lists(grids[idx], sacks[idx], score=0)
    out = Path(args.output) if args.output else None

    def prog(n: int, s: GameState) -> None:
        print(f"  nodes={n} score={s.score} queue={len(s.queue)}", file=sys.stderr)

    stats: dict = {}
    sol = search_ideal(
        state,
        wordlist_path=args.wordlist,
        max_depth=args.max_depth,
        max_nodes=args.max_nodes,
        time_limit_s=args.timeout,
        max_path_len=args.max_path_len,
        progress=prog if args.verbose else None,
        search_stats=stats,
        track_best_chains=max(0, int(args.dump_best)),
    )
    chains = stats.get("best_chains") or []
    if chains and args.dump_best > 0:
        print("\n# Top partial chains by cumulative score (for analysis)\n", file=sys.stderr)
        print(
            _format_best_chains_text(chains, words_only=args.dump_best_words_only),
            end="",
            file=sys.stderr,
        )
        if args.dump_best_json:
            Path(args.dump_best_json).write_text(
                json.dumps(chains, indent=2), encoding="utf-8"
            )
            print(f"Wrote chain JSON to {args.dump_best_json}", file=sys.stderr)
    if not sol:
        hint = ""
        if stats.get("stop_reason") == "node_limit":
            hint = " Hit node budget; try --max-nodes 5000000 or higher."
        elif stats.get("stop_reason") == "timeout":
            hint = " Hit time limit; try --timeout 120 or higher."
        print(
            f"No solution found within limits.{hint}"
            f" (stop_reason={stats.get('stop_reason')}, max_score_seen={stats.get('max_score_seen')}, nodes={stats.get('nodes')})",
            file=sys.stderr,
        )
        return 2

    trace = {
        "initial": {
            "board": grids[idx],
            "queue": sacks[idx],
            "score": 0,
        },
        "steps": sol,
        "meta": {
            "puzzle_index": idx,
            "target_score": TARGET_SCORE,
        },
    }
    text = json.dumps(trace, indent=2)
    if out:
        out.write_text(text, encoding="utf-8")
        print(f"Wrote {out}")
    else:
        print(text)
    ok, msg, _ = verify_ideal_trace(trace, wordlist_path=args.wordlist)
    print(msg, file=sys.stderr)
    return 0 if ok else 1


def cmd_plan_words(args: argparse.Namespace) -> int:
    root = Path(args.root) if args.root else _repo_root()
    grids = load_json_lines(root / "text" / "grids.txt")
    sacks = load_json_lines(root / "text" / "nextletters.txt")
    assert_paired_lengths(grids, sacks)
    idx = args.index % len(grids)
    grid = grids[idx]
    sack = sacks[idx]
    B_chars = puzzle_char_budget(grid, sack)
    B_tiles = puzzle_physical_tile_count(grid, sack)
    use_min = args.budget_metric == "min_tiles"
    B_eff = B_tiles if use_min else B_chars
    letters = (
        multiset_letters_from_puzzle(grid, sack) if args.filter_letters else None
    )
    pool = filter_word_pool(
        args.wordlist,
        args.word_min,
        args.word_max,
        puzzle_letters=letters,
    )
    word_metrics = None
    if args.word_metrics_csv:
        mp = Path(args.word_metrics_csv).expanduser()
        if not mp.is_file():
            print(f"Word metrics file not found: {mp}", file=sys.stderr)
            return 2
        word_metrics = load_word_metrics_csv(mp)
    result = plan_words(
        pool,
        B_eff,
        target_score=args.target_score,
        iterations=args.iterations,
        seed=args.seed,
        max_words=args.max_words,
        length_slack=args.length_slack,
        length_weight=args.length_weight,
        swap_tries=args.swap_tries,
        reuse_bias=args.reuse_bias,
        budget_metric=args.budget_metric,
        word_metrics=word_metrics,
    )
    out_path = Path(args.output).expanduser() if args.output else None
    if out_path:
        out_path.write_text(json.dumps(result, indent=2), encoding="utf-8")
        print(f"Wrote {out_path}", file=sys.stderr)
    if args.json:
        print(json.dumps(result, indent=2))

    print(
        f"budget_metric={result.get('budget_metric')}  "
        f"budget_B={result['budget_B']}  "
        f"(chars_B={B_chars}  physical_tiles_B={B_tiles})",
        file=sys.stderr,
    )
    print(
        f"sum_planned_lengths={result['sum_planned_lengths']}  "
        f"sum_min_distinct_tiles={result.get('sum_min_distinct_tiles', 0)}  "
        f"sum_budget_units={result.get('sum_budget_units', 0)}  "
        f"sum_scores={result['sum_scores']}  "
        f"score_gap={result['score_gap']}  "
        f"budget_units_gap={result['length_gap_vs_B']}  "
        f"objective={result['objective']}  "
        f"reuse_bias={result.get('reuse_bias', 0)}",
        file=sys.stderr,
    )
    for row in result.get("per_word") or []:
        print(
            f"  {row['word']:12}  L={row['length']:2}  "
            f"min_cells={row.get('min_distinct_tiles', 0):2}  "
            f"word_score={row['score']:4}  running={row['running_score']:4}  "
            f"reuse={row.get('reuse_pairs', 0)}",
            file=sys.stderr,
        )
    print("words (order):", " → ".join(result["words"]), file=sys.stderr)
    return 0


def cmd_build_word_metrics(args: argparse.Namespace) -> int:
    """Precompute tile_units, score, min_distinct, reuse_pairs for a word-length slice (CSV)."""
    from .word_plan import compute_word_plan_metrics, compute_word_plan_metrics_row

    pool = filter_word_pool(
        args.wordlist,
        args.word_min,
        args.word_max,
        puzzle_letters=None,
    )
    out = Path(args.output).expanduser()
    out.parent.mkdir(parents=True, exist_ok=True)
    every = max(1, int(args.progress_every))
    n = len(pool)
    jobs = int(args.jobs)
    if jobs == 0:
        jobs = max(1, min(8, os.cpu_count() or 4))
    elif jobs < 1:
        jobs = 1

    print(
        f"build-word-metrics: {n} words — each runs a min-distinct grid search "
        f"(7–10 band is large; this can take many minutes). workers={jobs}",
        file=sys.stderr,
    )

    with out.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["word", "tile_units", "score", "min_distinct", "reuse_pairs"])
        if jobs <= 1:
            for i, word in enumerate(pool, 1):
                L, sc, mt, rp = compute_word_plan_metrics(word)
                writer.writerow([word, L, sc, mt, rp])
                if i % every == 0 or i == n:
                    print(f"  progress {i}/{n}", file=sys.stderr)
        else:
            chunksize = max(8, min(256, n // (jobs * 16) or 8))
            with ProcessPoolExecutor(max_workers=jobs) as ex:
                it = ex.map(compute_word_plan_metrics_row, pool, chunksize=chunksize)
                for i, row in enumerate(it, 1):
                    word, L, sc, mt, rp = row
                    writer.writerow([word, L, sc, mt, rp])
                    if i % every == 0 or i == n:
                        print(f"  progress {i}/{n}", file=sys.stderr)
    print(f"Wrote {n} rows to {out}", file=sys.stderr)
    return 0


def cmd_check_pairing(args: argparse.Namespace) -> int:
    root = Path(args.root) if args.root else _repo_root()
    grids = load_json_lines(root / "text" / "grids.txt")
    sacks = load_json_lines(root / "text" / "nextletters.txt")
    try:
        assert_paired_lengths(grids, sacks)
    except ValueError as e:
        print(e, file=sys.stderr)
        return 1
    print(f"OK: {len(grids)} paired puzzles")
    return 0


def _add_wordlist_arg(sp: argparse.ArgumentParser, default_wordlist: str) -> None:
    """Subcommands must repeat --wordlist: parent-parser flags only work *before* the subcommand."""
    sp.add_argument(
        "--wordlist",
        default=default_wordlist,
        help="Path to wordlist.txt",
    )


def main() -> None:
    root = _repo_root()
    default_wordlist = str(root / "text" / "wordlist.txt")

    p = argparse.ArgumentParser(description="Word Hunter ideal puzzle tooling")
    p.add_argument(
        "--wordlist",
        default=default_wordlist,
        help="Path to wordlist.txt (only if placed before the subcommand, e.g. "
        "`%(prog)s --wordlist PATH search`); otherwise pass --wordlist on the subcommand.",
    )
    sub = p.add_subparsers(dest="cmd", required=True)

    pv = sub.add_parser("verify", help="Verify a solution JSON trace")
    _add_wordlist_arg(pv, default_wordlist)
    pv.add_argument("trace", type=str)
    pv.set_defaults(func=cmd_verify)

    ps = sub.add_parser("search", help="Search one puzzle index for an ideal play")
    _add_wordlist_arg(ps, default_wordlist)
    ps.add_argument("--index", type=int, default=0)
    ps.add_argument("--root", type=str, default=None, help="Repo root (default: auto)")
    ps.add_argument("--max-depth", type=int, default=40)
    ps.add_argument("--max-nodes", type=int, default=200_000)
    ps.add_argument("--timeout", type=float, default=30.0)
    ps.add_argument("--max-path-len", type=int, default=32)
    ps.add_argument("-o", "--output", type=str, default=None)
    ps.add_argument("-v", "--verbose", action="store_true")
    ps.add_argument(
        "--dump-best",
        type=int,
        default=0,
        metavar="N",
        help="Keep top N partial chains by score (after each word) and print them to stderr",
    )
    ps.add_argument(
        "--dump-best-json",
        type=str,
        default=None,
        metavar="PATH",
        help="If set with --dump-best, write those chains as JSON to this path",
    )
    ps.add_argument(
        "--dump-best-words-only",
        action="store_true",
        help="With --dump-best, print only ranks and word order (omit move sequence)",
    )
    ps.set_defaults(func=cmd_search)

    pp = sub.add_parser(
        "plan-words",
        help="Word-first plan: pick 7–10 letter words toward score 1000 and length budget B",
    )
    _add_wordlist_arg(pp, default_wordlist)
    pp.add_argument("--index", type=int, default=0)
    pp.add_argument("--root", type=str, default=None)
    pp.add_argument("--target-score", type=int, default=TARGET_SCORE)
    pp.add_argument("--word-min", type=int, default=7)
    pp.add_argument("--word-max", type=int, default=10)
    pp.add_argument("--iterations", type=int, default=3000)
    pp.add_argument("--seed", type=int, default=None)
    pp.add_argument("--max-words", type=int, default=16)
    pp.add_argument("--length-slack", type=int, default=4)
    pp.add_argument("--length-weight", type=float, default=0.35)
    pp.add_argument("--swap-tries", type=int, default=30)
    pp.add_argument(
        "--reuse-bias",
        type=float,
        default=1.25,
        help="Weight for go-back-friendly words (repeat tile-units with index gap>=2); 0 disables",
    )
    pp.add_argument(
        "--budget-metric",
        choices=("min_tiles", "chars"),
        default="min_tiles",
        help="Match plan sum to physical tile count (16+sack) via min distinct cells per word, or char-length budget",
    )
    pp.add_argument(
        "--filter-letters",
        action="store_true",
        help="Only use words whose letters appear on this puzzle's grid+sack multiset",
    )
    pp.add_argument(
        "--word-metrics-csv",
        type=str,
        default=None,
        metavar="PATH",
        help="Optional CSV from build-word-metrics (skips recomputing min_distinct/scores for pool words)",
    )
    pp.add_argument(
        "--json",
        action="store_true",
        help="Print JSON plan to stdout (table still on stderr unless -o used)",
    )
    pp.add_argument("-o", "--output", type=str, default=None)
    pp.set_defaults(func=cmd_plan_words)

    pm = sub.add_parser(
        "build-word-metrics",
        help="Build CSV of tile_units, score, min_distinct, reuse_pairs for word-length range",
    )
    _add_wordlist_arg(pm, default_wordlist)
    pm.add_argument(
        "-o",
        "--output",
        type=str,
        required=True,
        help="Output CSV path",
    )
    pm.add_argument("--word-min", type=int, default=7)
    pm.add_argument("--word-max", type=int, default=10)
    pm.add_argument(
        "--progress-every",
        type=int,
        default=2000,
        metavar="N",
        help="Print progress to stderr every N words (default: 2000)",
    )
    pm.add_argument(
        "--jobs",
        type=int,
        default=0,
        metavar="N",
        help="Parallel processes (0 = auto, min(8, CPUs); 1 = single-process)",
    )
    pm.set_defaults(func=cmd_build_word_metrics)

    pc = sub.add_parser("check-pairing", help="Ensure grids.txt and nextletters.txt lengths match")
    pc.add_argument("--root", type=str, default=None)
    pc.set_defaults(func=cmd_check_pairing)

    args = p.parse_args()
    raise SystemExit(args.func(args))


if __name__ == "__main__":
    main()
