# Word Hunter

A browser word game: trace adjacent letters on a grid, shift rows/columns, and chase the daily puzzle. This repo is a static site (HTML/CSS/ES modules) with no build step.

## Run locally

Serve the project root over HTTP so `fetch()` can load `text/*.txt` (opening `index.html` as a `file://` URL may block those requests in some browsers).

```bash
# Example: Python 3
python3 -m http.server 8080
# Then open http://localhost:8080
```

The entry script is `js/app.js` (loaded from `index.html` as `type="module"`).

## Tests

Pure logic is covered by Node tests:

```bash
npm test
```

## Architecture (high level)

- **`js/app.js`** — Bootstraps CSS vars, creates the game context, calls `initGame` on `DOMContentLoaded`.
- **`js/game.js`** — Main game shell: DOM refs, lifecycle (`startGame`, `endGame`, `resetRoundToPregame`, grid generation), wiring to feature modules.
- **`js/game-context.js`** — `createGameContext()`: shared **`ctx.refs`**, **`ctx.state`** (board, shift, word path, word-line UI), and **`ctx.fn`** hooks (e.g. `updateCurrentWord`) to avoid circular imports.

Feature modules (each takes `ctx` and/or small host/runtime objects):

| Module                     | Role                                                               |
| -------------------------- | ------------------------------------------------------------------ |
| `board-logic.js`           | Scoring, shifts, tile normalization (tested)                       |
| `grid-tiles.js`            | Tile DOM helpers, `syncDomFromBoard`                               |
| `shift-gestures.js`        | Shift gesture state factory                                        |
| `shift-dom.js`             | Shift preview, commit, pointers, grid lock hooks                   |
| `word-play.js`             | Adjacency + selection visit depth on the grid                      |
| `word-drag.js`             | Word selection, connector SVG, success/invalid choreography        |
| `word-path.js`             | Path gradient helpers (tested)                                     |
| `ui-word-line.js`          | Current-word line, messages, intro crossfade                       |
| `leaderboard-lifecycle.js` | Demo leaderboard merge helpers (pure)                              |
| `leaderboard-ui.js`        | Table, overlay, API refresh, postgame copy-score flow              |
| `rules-dock.js`            | Rules overlay + mute wiring                                        |
| `game-lifecycle.js`        | `loadWordhunterTextAssets`, `puzzleListIndex`, `calculateDiffDays` |
| `audio.js`                 | Sound pools and playback                                           |
| `config.js`                | Constants and timings                                              |

## Content and assets

- **`text/`** — `wordlist.txt` and `puzzles.txt` (JSON Lines per puzzle: `starting_grid`, compact `next_letters` (typically 50 tokens, pads to `NEXT_LETTERS_LEN` = 66), `perfect_hunt` ×7; Σ min-tiles per row = **66**). Daily row: `puzzleListIndex` in `puzzle-calendar.js` (`PUZZLE_ROTATION_EPOCH`). Leaderboard / share `#` still use legacy `calculateDiffDays`.
- **`sounds/`** — Game SFX referenced from `audio.js`.
- **`style.css`** — Layout and theme.

## Optional local tooling

Puzzle-generation / cert Python helpers can live in `tools/` on your machine; that tree is **gitignored** and is not part of the shipped static site. CI only runs `npm test`.

### Puzzle pool (gamemaker)

1. **Word metrics pickle** — Recognizability tiers come from `text/word_metrics_7_10.pkl` (**lengths 7–10 only**, external model) or, when present, **`text/word_metrics_extended.pkl`** which adds **8-letter-and-up** coverage and **11–16 letter** words via English Zipf proxies (`pip install wordfreq`, then `npm run gen:extend-metrics`). Prefer the original where it exists; extended omits 7-letter rows. Override path with **`WORD_METRICS_PKL`**. See `scripts/build-extended-word-metrics.py`.
2. **`npm run gen:word-rec`** — requires **Python 3**. Python writes all wordlist ∩ pickle → recognizability tiers to a raw file; **Node** filters by **`wordToTileLabelSequence` length** (same as gameplay), default **8–16** tile labels (`TILE_LABEL_MIN` / `TILE_LABEL_MAX` env). Outputs `text/gamemaker/pregen/word-recognizability.json`. Re-run when wordlist or metrics change.
3. **`npm run gen:puzzle-pool`** — Node only. Reads that JSON and builds `text/gamemaker/pregen/puzzle-pool.json` (seven-word lists, Σ `min_tiles` = **66**; default recognizability **≥ 7**; oversized tile-label vocab **8–16** by env). Oversamples then ranks by **highest Σ reuse** first (= Σ tile-label length − Σ `min_tiles`; repeat steps on spell paths; default `POOL_REUSE_RANK=max`), then **letter union** (alphabet spread), then **Σ wordTotal**. Use `POOL_REUSE_RANK=near` with `POOL_REUSE_SUM_TARGET` to prefer Σ reuse near a target instead. The lowest-`wordTotal` word must have exactly **`openingLabelLen` tile labels** (often **8**; **9** when high `RECOG_MIN` leaves only longer glyphs). Env knobs: `RECOG_MIN`, `TILE_LABEL_MIN` / `TILE_LABEL_MAX`, `POOL_REUSE_RANK` (`max` | `near` | `ignore`), `POOL_REUSE_SUM_TARGET` (for `near`), `POOL_OVERSAMPLE`, `POOL_RANK_BY_LETTER_UNION=0` to disable ranking, `POOL_WORD_TOTAL_RANK=max` (default) or `target` with `POOL_WORD_TOTAL_TARGET`, `POOL_SIZE`, `SEED`.
