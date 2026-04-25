# Reverse puzzle authoring (debug)

Static assets and generated samples for `?debug_mode=1` reverse playtesting.

## Layout

| Path | Purpose |
|------|---------|
| `data/` | JSON/JSONL/txt consumed by the app (`fetch`). Keep paths stable once shipped. |
| `artifacts/` | Optional: drop browser-downloaded `reverse-debug-puzzle-*.txt` files here for version control or sharing. |
| `notes/` | Session notes and regeneration commands. |

## Regenerate sample JSONL

From repo root (requires `wordfreq` unless `--no-zipf-filter`):

```bash
python3 tools/generate_sample_wordlists.py \
  --tier-fraction 0.08 \
  --seed 20260425 \
  --out debug/reverse-authoring/data/sample_wordlists_100.jsonl
```

Lower `--tier-fraction` biases draws toward higher per-slot hunt scores (and higher list totals); if draws fail, raise the fraction or relax Zipf.

## Finished puzzle file

When the last word is reversed in debug mode, the client downloads a `.txt` containing metadata, `final_grid_json`, and `nextletters_cover_order_json`. Save copies under `artifacts/` if you want them in the repo.
