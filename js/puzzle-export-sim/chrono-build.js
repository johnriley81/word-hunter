import { NEXT_LETTERS_LEN, GRID_SIZE, GRID_CELL_COUNT } from "../config.js";
import {
  wordToTileLabelSequence,
  minUniqueTilesForReuseRule,
  torNeighborQuadExportTokensFromBoard,
} from "../board-logic.js";
import { replacementTilesFirstVisitFlatOrder } from "./forward-verify.js";

/**
 * Build `next_letters` from per-play `covered`: for each play prepend that play's `covered`
 * in first-visit order onto the front of `flat` (`part.concat(flat)`). So the **last**
 * `play` in the array ends up supplying the **first** consumed sack slots (front of FIFO).
 * Forward play runs hunt words **ascending** by score, so the **first** refills must come
 * from the **lowest-score** word's `covered` — pass plays in **descending** score order so
 * that word is iterated last (or use placement order only when it matches that).
 */
export function buildNextLettersFromCoveredInBuildOrder(playsChron, options) {
  const len =
    options && typeof options.chainLen === "number"
      ? options.chainLen
      : NEXT_LETTERS_LEN;
  const fillEmpty =
    options && typeof options.fillEmpty === "string" ? options.fillEmpty : "";
  let flat = /** @type {string[]} */ ([]);
  for (const p of playsChron || []) {
    const part = (p.covered || []).map((ch) =>
      ch === "" || ch == null ? fillEmpty : ch
    );
    flat = part.concat(flat);
  }
  while (flat.length < len) flat.push(fillEmpty);
  return flat.slice(0, len);
}

/**
 * Reconstruct the board immediately before the last chronological play (lowest word in
 * forward play) from the end state and that play's covered[] (snapshot under first-visit
 * order). Fails (null) if covered length does not match first-visit count (e.g. revisits with
 * inconsistent coverage) — in that case you must use a full snapshot.
 *
 * @param {string[][]} finalGrid
 * @param {{ pathFlat: number[], covered: string[] }} lastPlay
 * @returns {string[][] | null}
 */
export function reconstructForwardStartFromFinalAndLastPlay(finalGrid, lastPlay) {
  if (!lastPlay) return null;
  const path = lastPlay.pathFlat || [];
  const cov = lastPlay.covered || [];
  const uniques = replacementTilesFirstVisitFlatOrder(path);
  if (uniques.length !== cov.length) return null;
  const g0 = finalGrid.map((r) => r.map((c) => c));
  const n = GRID_SIZE;
  for (let i = 0; i < uniques.length; i++) {
    const f = uniques[i];
    const r = Math.floor(f / n);
    const c = f % n;
    g0[r][c] =
      cov[i] === "" || cov[i] == null ? g0[r][c] : String(cov[i]).toLowerCase();
  }
  return g0;
}

/**
 * Apply plays in chronological build order: each play writes its word glyphs to path
 * (later plays overwrite on revisits). Used to get end board from a known editor start.
 *
 * @param {string[][]} initial4
 * @param {Array<{ word: string, pathFlat: number[] }>} playsChron
 * @returns {string[][]}
 */
export function simulateChronoToEndBoard(initial4, playsChron) {
  const b = initial4.map((r) => r.map((c) => String(c || "").toLowerCase()));
  const n = GRID_SIZE;
  for (const p of playsChron || []) {
    const w = (p.word || "").toLowerCase();
    const glyphs = wordToTileLabelSequence(w);
    const path = p.pathFlat || [];
    for (let i = 0; i < path.length; i++) {
      const f = path[i];
      if (f < 0 || f >= GRID_CELL_COUNT) continue;
      const r = Math.floor(f / n);
      const c = f % n;
      if (i < glyphs.length) b[r][c] = glyphs[i];
    }
  }
  return b;
}

/**
 * @param {string[][]} board
 * @param {number[]} pathFlat
 * @returns {string[]}
 */
function coveredFirstVisitsFromBoard(board, pathFlat) {
  const seen = new Set();
  const out = /** @type {string[]} */ ([]);
  for (const f of pathFlat) {
    if (seen.has(f)) continue;
    seen.add(f);
    const r = Math.floor(f / GRID_SIZE);
    const c = f % GRID_SIZE;
    out.push((board[r] && board[r][c]) || "");
  }
  return out;
}

/**
 * Recompute covered[] for each play as the board *before* that play on first-visit
 * cells, given an editor start grid. Matches gamemaker's applyCommit "snap" for valid
 * exports when paths are known.
 *
 * @param {string[][]} editorStart4
 * @param {Array<{ word: string, pathFlat: number[], min_tiles?: number }>} playsChron
 * @returns {Array<{ word: string; pathFlat: number[]; covered: string[]; min_tiles: number; starter_tor_neighbor_quad: string[] }>}
 */
export function recomputeCoveredChronFromHarness(editorStart4, playsChron) {
  const b = editorStart4.map((r) => r.map((c) => String(c || "").toLowerCase()));
  const out = [];
  for (const p of playsChron || []) {
    const w = (p.word || "").toLowerCase();
    const path = p.pathFlat || [];
    const covered = coveredFirstVisitsFromBoard(b, path);
    const glyphs = wordToTileLabelSequence(w);
    for (let i = 0; i < path.length; i++) {
      const f = path[i];
      if (f < 0 || f >= GRID_CELL_COUNT) continue;
      const r = Math.floor(f / GRID_SIZE);
      const c = f % GRID_SIZE;
      if (i < glyphs.length) b[r][c] = glyphs[i];
    }
    const pf0 =
      path.length > 0 && path[0] >= 0 && path[0] < GRID_CELL_COUNT ? path[0] : null;
    const starter_tor_neighbor_quad =
      pf0 != null
        ? torNeighborQuadExportTokensFromBoard(b, pf0, GRID_SIZE)
        : ["0", "0", "0", "0"];
    out.push({
      word: p.word,
      pathFlat: path,
      covered,
      min_tiles:
        typeof p.min_tiles === "number"
          ? p.min_tiles
          : minUniqueTilesForReuseRule(glyphs),
      starter_tor_neighbor_quad,
    });
  }
  return out;
}
