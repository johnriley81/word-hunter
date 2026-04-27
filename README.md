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

- **`text/`** — `wordlist.txt` and `puzzles.txt` (JSON Lines per puzzle: `starting_grid`, `next_letters` ×50, `perfect_hunt` ×6, Σ min-tiles = 50). Daily row: `puzzleListIndex` in `puzzle-calendar.js` (`PUZZLE_ROTATION_EPOCH`). Leaderboard / share `#` still use legacy `calculateDiffDays`.
- **`sounds/`** — Game SFX referenced from `audio.js`.
- **`style.css`** — Layout and theme.

## Optional local tooling

Puzzle-generation / cert Python helpers can live in `tools/` on your machine; that tree is **gitignored** and is not part of the shipped static site. CI only runs `npm test`.

### Puzzle pool (gamemaker)

1. **`npm run gen:word-rec`** — requires **Python 3**. Reads `text/word_metrics_7_10.pkl` and `text/wordlist.txt`, writes `text/gamemaker/pregen/word-recognizability.json` (spelling words with 8–14 tile count in the metrics file → recognizability tier). Re-run when either source changes.
2. **`npm run gen:puzzle-pool`** — Node only. Reads that JSON and builds `text/gamemaker/pregen/puzzle-pool.json` (six-word lists; default recognizability **≥ 8**; oversamples then ranks by **letter union** size, then by **higher Σ wordTotal** per list). Env knobs: `RECOG_MIN`, `POOL_OVERSAMPLE`, `POOL_RANK_BY_LETTER_UNION=0` to disable ranking, `POOL_WORD_TOTAL_RANK=max` (default) or `target` with `POOL_WORD_TOTAL_TARGET` (e.g. cluster near 1100), `POOL_SIZE`, `SEED`.
