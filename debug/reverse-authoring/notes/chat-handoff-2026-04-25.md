# Handoff — reverse debug cleanup (2026-04-25)

## What changed

- Debug-only hunt assets moved from `text/` into `debug/reverse-authoring/data/` (`formula_hunt_*`, `perfect_scores.txt`, generated `sample_wordlists_100.jsonl`).
- Post-game UI: removed copy button and export box; completion triggers a **download** of `reverse-debug-puzzle-<timestamp>.txt`.
- **Another one** replaces per-slot refresh: full navigation with a new random `debug_sample_id` (defaults JSONL path preserved or set to `data/sample_wordlists_100.jsonl`).
- `?debug_mode=1` alone now loads the default JSONL when `debug_word_list` / `debug_words` are not set.
- Sample generator: `top_fraction_words_with_scores` + `--tier-fraction` (default `0.12`); last regen used `--tier-fraction 0.08 --seed 20260425`.
- Removed one-off analysis JSON: `text/formula_bag_per_length_breakdown.json`, `text/formula_length7_score_grid.json`.

## Artifact naming

Browser download: `reverse-debug-puzzle-<ISO-ish-stamp>.txt`. To archive in-repo, rename or copy into `../artifacts/` with a descriptive slug if needed.
