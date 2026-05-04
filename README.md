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

## Development

CI runs **Prettier** (HTML/CSS/JS/JSON/YAML/Markdown), **Black**, **isort**, and generic hygiene hooks via [pre-commit](https://pre-commit.com/). Install hooks locally so formatting matches CI before you push:

```bash
pip install pre-commit
pre-commit install
```

Run every hook on the whole repo (same as CI):

```bash
pre-commit run --all-files
```

## Architecture (high level)

- **`js/app.js`** — Bootstraps CSS vars, creates the game context, calls `initGame` on `DOMContentLoaded`.
- **`js/game.js`** — Main game shell: DOM refs, lifecycle (`startGame`, `resetRoundToPregame`, grid generation), wiring to feature modules.
- **`js/game-endgame.js`** — Endgame choreography (GAME OVER flashes, grid batch fade, audio fallback) and handoff to leaderboard post-game UI.
- **`js/game-context.js`** — `createGameContext()`: shared **`ctx.refs`**, **`ctx.state`** (board, shift, word path, word-line UI), and **`ctx.fn`** hooks (e.g. `updateCurrentWord`) to avoid circular imports.

Feature modules (each takes `ctx` and/or small host/runtime objects):

| Module                     | Role                                                                                                             |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `board-logic.js`           | Scoring, shifts, tile normalization (tested)                                                                     |
| `grid-tiles.js`            | Tile DOM helpers, `syncDomFromBoard`                                                                             |
| `shift-gestures.js`        | Shift gesture state factory                                                                                      |
| `shift-dom.js`             | Shift preview, commit, pointers, grid lock hooks                                                                 |
| `word-play.js`             | Adjacency + selection visit depth on the grid                                                                    |
| `word-drag.js`             | Word selection, connector SVG, success/invalid choreography                                                      |
| `word-path.js`             | Path gradient helpers (tested)                                                                                   |
| `ui-word-line.js`          | Current-word line, messages, intro crossfade                                                                     |
| `leaderboard-lifecycle.js` | Demo leaderboard merge helpers (pure)                                                                            |
| `leaderboard-ui.js`        | Table, overlay, API refresh, post-game copy-score flow; **`rt.state`** holds mutable leaderboard/post-game flags |
| `rules-dock.js`            | Rules overlay + mute wiring                                                                                      |
| `game-lifecycle.js`        | `loadWordhunterTextAssets`, `loadWordlistWordSet` (gamemaker only), `puzzleListIndex`, `calculatePuzzleDayIndex` |
| `audio.js`                 | Sound pools and playback                                                                                         |
| `config.js`                | Constants and timings                                                                                            |

## Content and assets

- **`text/`** — `wordlist.txt` and `puzzles.txt` (JSON Lines per puzzle: `starting_grid`, compact `next_letters` (typically 50 tokens, pads to `NEXT_LETTERS_LEN` = 66), `perfect_hunt` ×7; Σ min-tiles per row = **66**). Daily row: `puzzleListIndex` in `puzzle-calendar.js` (`PUZZLE_ROTATION_EPOCH`). Leaderboard path and share `#` use `calculatePuzzleDayIndex()` (same epoch).
- **`sounds/`** — Game SFX referenced from `audio.js`.
- **`style.css`** — Layout and theme.

## Optional local tooling

Puzzle-generation / cert Python helpers can live in `tools/` on your machine; that tree is **gitignored** and is not part of the shipped static site. CI only runs `npm test`.

### Puzzle pool (gamemaker)

1. **Word metrics pickle** — Recognizability tiers come from `text/word_metrics_7_10.pkl` (**lengths 7–10 only**, external model) or, when present, **`text/word_metrics_extended.pkl`** which adds **8-letter-and-up** coverage and **11–16 letter** words via English Zipf proxies (`pip install wordfreq`, then `npm run gen:extend-metrics`). Prefer the original where it exists; extended omits 7-letter rows. Override path with **`WORD_METRICS_PKL`**. See `scripts/build-extended-word-metrics.py`.
2. **`npm run gen:word-rec`** — requires **Python 3** and **`pip install wordfreq`**. Pickle **`rec`** was wrongly tied to **letter count at the max tier** (bogus “only spellings with 10 letters reach tier **10**”). Default **`RECO_EXPORT_MODE=length_deciles`** ranks by **English Zipf within each spelled length** (**`scripts/rec_zipf_tiers.py`**) and assigns tiers **10→1**, so **`rec`** is comparable **across** lengths (**tier 10** ≈ strongest decile **per length**). Alternatives: **`RECO_EXPORT_MODE=zipf`** (absolute Zipf breakpoints; few long tier-10s), **`RECO_EXPORT_MODE=legacy`** (trust pickle third tuple). Python writes **`word-recognizability.raw.json`**; **Node** filters by **`wordToTileLabelSequence`**, default **8–16** tile labels (`TILE_LABEL_MIN` / `TILE_LABEL_MAX`). Outputs **`text/gamemaker/pregen/word-recognizability.json`**. Re-run when wordlist or metrics change.
3. **`npm run gen:puzzle-wordlist`** — Node only. Optional **tier trim**: writes **`puzzle-wordlist.txt`** from **`word-recognizability.json`** for words with **`rec` ≥ EXPORT_RECOG_MIN** (default **10**). Env **`OUT_PATH`** (`-` for stdout). **Default `gen:puzzle-pool` does not require this**: it reads **`text/wordlist.txt`** unless **`PUZZLE_WORDLIST=text/gamemaker/puzzle-wordlist.txt`**. If the trim file is **too sparse**, the pool generator may fail to build seven-word combos (Σ **`min_tiles`** = **66**) — widen **`EXPORT_RECOG_MIN`**, use **`wordlist.txt`**, or hand-edit **`puzzle-wordlist.txt`**.
4. **`npm run gen:puzzle-pool`** — Node only. **`PUZZLE_WORDLIST=text/wordlist.txt`** by default (**wordlist ∩ rec JSON ∩ 8–16 tile glyphs**); **`RECOG_MIN`** default **1** (raise to filter obscure tier). Outputs **`pregen/puzzle-pool.json`**: **`POOL_SIZE`** hunts (default **10 000**), compact JSON (**`POOL_JSON_PRETTY=1`** = indented). Ranking / oversampling knobs: **`POOL_REUSE_RANK`**, **`POOL_OVERSAMPLE`**, **`POOL_RANK_BY_LETTER_UNION`**, **`POOL_WORD_TOTAL_RANK`**, **`SEED`**, **`TILE_LABEL_*`**. Use **`PUZZLE_WORDLIST=text/gamemaker/puzzle-wordlist.txt`** only when you intentionally want tier-trimmed inputs.

5. **`npm run gen:gamemaker-pool`** — **`gen:word-rec`** then **`gen:puzzle-pool`** (full corpus for **`gamemaker.html`** reset/next). (**`text/puzzles.txt`** for the shipped game is pasted from gamemaker export, not inferred from **`puzzle-pool.json`**.)

**Gamemaker (`gamemaker.html`):** **WORD** swaps for another spelling in the pool with identical **`min_tiles`**, **`reuse`**, **`wordTotal`**. Words need **`gen:word-rec`** coverage (pickle ∪ metrics); **`text/wordlist.txt`** gates gameplay spellings available to the generator.
