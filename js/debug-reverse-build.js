/**
 * Reverse-unplay helpers for local puzzle authoring (debug mode).
 * Mirrors forward word commit: each path tile is replaced by queue.shift()
 * (see word-drag.js). Inverse restores word tiles and prepends consumed letters.
 */

import { GRID_SIZE } from "./config.js";
import { normalizeTileText, getLiveWordScoreBreakdownFromLabels } from "./board-logic.js";

/** @typedef {{ r: number; c: number }} Cell */

/**
 * Split a dictionary word into tile strings (qu = one tile; lone q → qu).
 * @param {string} word
 * @returns {string[]}
 */
/**
 * Count reuse opportunities under the go-back rule: same tile string may
 * reappear only with at least two other tile positions between uses.
 * @param {string} word
 * @returns {number}
 */
export function countGoBackOverlapOpportunities(word) {
  const currentTiles = wordToTileStrings(word);
  const lastReusableIndexByTile = new Map();
  let n = 0;
  for (let i = 0; i < currentTiles.length; i++) {
    const t = currentTiles[i];
    const last = lastReusableIndexByTile.get(t);
    if (last != null && i - last >= 3) {
      n += 1;
    }
    lastReusableIndexByTile.set(t, i);
  }
  return n;
}

export function wordToTileStrings(word) {
  const w = String(word || "")
    .trim()
    .toLowerCase();
  const parts = [];
  let i = 0;
  while (i < w.length) {
    if (w[i] === "q" && i + 1 < w.length && w[i + 1] === "u") {
      parts.push("qu");
      i += 2;
    } else if (w[i] === "q") {
      parts.push("qu");
      i += 1;
    } else {
      parts.push(w[i]);
      i += 1;
    }
  }
  return parts;
}

/** @param {string[][]} board */
export function cloneBoard(board) {
  return board.map((row) => row.slice());
}

/** @param {string[]} queue */
export function cloneQueue(queue) {
  return queue.slice();
}

/**
 * @param {Cell[]} path
 * @returns {boolean}
 */
export function isPathAdjacentAndUnique(path) {
  if (!path || path.length === 0) return false;
  const seen = new Set();
  for (let i = 0; i < path.length; i++) {
    const { r, c } = path[i];
    if (r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE) return false;
    const key = `${r},${c}`;
    if (seen.has(key)) return false;
    seen.add(key);
    if (i > 0) {
      const dr = Math.abs(path[i].r - path[i - 1].r);
      const dc = Math.abs(path[i].c - path[i - 1].c);
      if (dr > 1 || dc > 1 || (dr === 0 && dc === 0)) return false;
    }
  }
  return true;
}

/**
 * Reverse authoring path: orthogonal adjacency, no zero-length steps, and the
 * same grid cell may appear twice only when word tiles match and index gap ≥ 3
 * (go-back / letter-reuse rule for overlap debugging).
 *
 * @param {Cell[]} pathCells
 * @param {string} word
 * @returns {boolean}
 */
export function validateReverseAuthoringDragPath(pathCells, word) {
  const tiles = wordToTileStrings(word);
  const n = pathCells.length;
  if (n === 0 || n > tiles.length) return false;
  for (let i = 0; i < n; i++) {
    const { r, c } = pathCells[i];
    if (r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE) return false;
  }
  for (let i = 1; i < n; i++) {
    const dr = Math.abs(pathCells[i].r - pathCells[i - 1].r);
    const dc = Math.abs(pathCells[i].c - pathCells[i - 1].c);
    if (dr > 1 || dc > 1) return false;
    if (dr === 0 && dc === 0) return false;
  }
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (pathCells[i].r !== pathCells[j].r || pathCells[i].c !== pathCells[j].c) {
        continue;
      }
      if (tiles[i] !== tiles[j]) return false;
      if (j - i < 3) return false;
    }
  }
  return true;
}

/**
 * Go-back reuse: word index i uses the same grid cell as index j (j < i, i-j >= 3, same tile).
 * @param {string} word
 * @returns {Map<number, number>} i -> j
 */
export function reverseAuthoringReuseByWordIndex(word) {
  const tiles = wordToTileStrings(word);
  const last = new Map();
  /** @type {Map<number, number>} */
  const reuse = new Map();
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i];
    const prev = last.get(t);
    if (prev != null && i - prev >= 3) {
      reuse.set(i, prev);
    }
    last.set(t, i);
  }
  return reuse;
}

/**
 * Word indices where the player picks a (new) grid cell — length = tile count − reuse count.
 * @param {string} word
 * @returns {number[]}
 */
export function reverseAuthoringNewPickWordIndices(word) {
  const reuse = reverseAuthoringReuseByWordIndex(word);
  const tiles = wordToTileStrings(word);
  const out = [];
  for (let i = 0; i < tiles.length; i++) {
    if (!reuse.has(i)) out.push(i);
  }
  return out;
}

function cellFromGridButton(btn, gridEl, gridSize) {
  const ix = Array.prototype.indexOf.call(gridEl.children, btn);
  if (ix < 0) return null;
  return { r: Math.floor(ix / gridSize), c: ix % gridSize };
}

/**
 * Full drag path: one entry per word tile, same cell may repeat (valid reuse).
 * @param {Element[]} buttons
 * @param {Element} gridEl
 * @param {number} gridSize
 * @returns {{ r: number; c: number }[] | null}
 */
export function pathCellsFromGridButtons(buttons, gridEl, gridSize) {
  if (!Array.isArray(buttons) || buttons.length === 0) return null;
  const out = [];
  for (let i = 0; i < buttons.length; i++) {
    const c = cellFromGridButton(buttons[i], gridEl, gridSize);
    if (!c) return null;
    out.push(c);
  }
  return out;
}

/**
 * Expand M unique pick cells into full L-step path (duplicate coords for reuse indices).
 * @param {Element[]} pickButtons length M
 * @param {Element} gridEl
 * @param {string} word
 * @param {number} gridSize
 * @returns {Cell[] | null}
 */
export function expandReverseAuthoringPickButtonsToPath(
  pickButtons,
  gridEl,
  word,
  gridSize,
) {
  const newIdx = reverseAuthoringNewPickWordIndices(word);
  if (pickButtons.length !== newIdx.length) return null;
  const reuse = reverseAuthoringReuseByWordIndex(word);
  const tiles = wordToTileStrings(word);
  const L = tiles.length;
  const pickCoords = pickButtons.map((btn) => cellFromGridButton(btn, gridEl, gridSize));
  if (pickCoords.some((c) => !c)) return null;
  let pi = 0;
  /** @type {Cell[]} */
  const path = [];
  for (let k = 0; k < L; k++) {
    if (reuse.has(k)) {
      const j = reuse.get(k);
      if (j == null || j >= path.length || !path[j]) return null;
      path.push({ r: path[j].r, c: path[j].c });
    } else {
      const cell = pickCoords[pi++];
      if (!cell) return null;
      path.push({ r: cell.r, c: cell.c });
    }
  }
  if (pi !== pickCoords.length) return null;
  return path;
}

/**
 * Validate partial compressed pick list: unique buttons, full prefix chain adjacency on expanded path.
 * @param {Element[]} picks
 * @param {Element} gridEl
 * @param {string} word
 * @param {number} gridSize
 */
export function validateReverseAuthoringCompressedPicks(picks, gridEl, word, gridSize) {
  if (!Array.isArray(picks) || picks.length === 0) return true;
  const seen = new Set(picks);
  if (seen.size !== picks.length) return false;
  const newIdx = reverseAuthoringNewPickWordIndices(word);
  if (picks.length > newIdx.length) return false;
  const reuse = reverseAuthoringReuseByWordIndex(word);
  const coords = picks.map((btn) => cellFromGridButton(btn, gridEl, gridSize));
  if (coords.some((c) => !c)) return false;
  const endK = newIdx[picks.length - 1];
  let pi = 0;
  /** @type {Cell[]} */
  const path = [];
  for (let k = 0; k <= endK; k++) {
    if (reuse.has(k)) {
      const j = reuse.get(k);
      if (j == null || j >= path.length || !path[j]) return false;
      path.push({ r: path[j].r, c: path[j].c });
    } else {
      path.push({ r: coords[pi].r, c: coords[pi].c });
      pi++;
    }
  }
  if (pi !== picks.length) return false;
  for (let i = 1; i < path.length; i++) {
    const dr = Math.abs(path[i].r - path[i - 1].r);
    const dc = Math.abs(path[i].c - path[i - 1].c);
    if (dr > 1 || dc > 1 || (dr === 0 && dc === 0)) return false;
  }
  return true;
}

/**
 * Tile label on board for scoring (matches button label semantics).
 * @param {string} t
 */
export function tileLabelForBoard(t) {
  return normalizeTileText(t);
}

/**
 * Forward play one word: path cells must currently show the word's tiles.
 * Each cell is replaced by queue.shift() in path order.
 *
 * @param {string[][]} board
 * @param {string[]} queue
 * @param {string} word
 * @param {Cell[]} path
 * @returns {{ coverForward: string[] }}
 */
export function forwardPlayOneWord(board, queue, word, path) {
  const tiles = wordToTileStrings(word);
  if (tiles.length !== path.length) {
    throw new Error(`path length ${path.length} != word tiles ${tiles.length}`);
  }
  const coverForward = [];
  for (let i = 0; i < path.length; i++) {
    const { r, c } = path[i];
    const onBoard = tileLabelForBoard(board[r][c]);
    if (onBoard !== tiles[i]) {
      throw new Error(
        `path mismatch at ${i}: board "${onBoard}" != word tile "${tiles[i]}"`,
      );
    }
    const next = queue.shift();
    if (next === undefined) {
      throw new Error("queue exhausted during forward play");
    }
    coverForward.push(String(next));
    board[r][c] = String(next);
  }
  return { coverForward };
}

/**
 * Reverse one forward word play: prepend consumed letters back onto queue,
 * restore word tiles along path.
 *
 * @param {string[][]} board
 * @param {string[]} queue
 * @param {string} word
 * @param {Cell[]} path
 * @returns {{
 *   board: string[][];
 *   queue: string[];
 *   coverLettersThisStep: string[];
 *   logEntry: object;
 * }}
 */
export function reverseUnplayOneWord(board, queue, word, path) {
  const b = cloneBoard(board);
  const q = cloneQueue(queue);
  const tiles = wordToTileStrings(word);
  if (tiles.length !== path.length) {
    throw new Error(`path length ${path.length} != word tiles ${tiles.length}`);
  }
  if (!validateReverseAuthoringDragPath(path, word)) {
    throw new Error("invalid path (bounds, adjacency, or illegal cell reuse)");
  }

  const coverLettersThisStep = [];
  for (let i = 0; i < path.length; i++) {
    const { r, c } = path[i];
    coverLettersThisStep.push(tileLabelForBoard(b[r][c]));
  }

  for (let k = path.length - 1; k >= 0; k--) {
    const { r, c } = path[k];
    q.unshift(tileLabelForBoard(b[r][c]));
  }
  for (let k = 0; k < path.length; k++) {
    const { r, c } = path[k];
    b[r][c] = tiles[k];
  }

  const labels = path.map(({ r, c }, i) => tiles[i]);
  const bd = getLiveWordScoreBreakdownFromLabels(labels);

  return {
    board: b,
    queue: q,
    coverLettersThisStep,
    logEntry: {
      type: "reverse_unplay",
      word: String(word).toLowerCase(),
      path,
      coverLettersThisStep,
      letterSum: bd.letterSum,
      tileUnits: bd.length,
      huntScore: bd.wordTotal,
    },
  };
}

/**
 * Prepend this step's cover letters to the running export list so that
 * after all reverse steps (high score → low), the array matches forward
 * consumption order (first word first tile first).
 *
 * @param {string[]} coverOrderTotal
 * @param {string[]} coverLettersThisStep
 */
export function prependCoverOrder(coverOrderTotal, coverLettersThisStep) {
  coverOrderTotal.splice(0, 0, ...coverLettersThisStep);
}

/**
 * Per-slot "tile repeats" = path length minus min distinct letters (progressive ladder).
 * Reads `slots`, `progressive_counts.slots`, or `grid_payload.slots`.
 * @param {unknown} doc
 * @returns {number[] | null} repeat count per slot_index 0..n-1
 */
export function extractSlotRepeatSpecsFromDoc(doc) {
  const raw =
    doc?.slots ??
    doc?.progressive_counts?.slots ??
    doc?.unrestricted_counts?.slots ??
    doc?.grid_payload?.slots;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  /** @type {Map<number, number>} */
  const byIndex = new Map();
  for (const s of raw) {
    const i = Number(s?.slot_index);
    const len = Number(s?.length);
    const md = Number(s?.min_distinct);
    if (Number.isFinite(i) && Number.isFinite(len) && Number.isFinite(md)) {
      byIndex.set(i, len - md);
    }
  }
  if (byIndex.size === 0) return null;
  const max = Math.max(...byIndex.keys());
  const out = [];
  for (let j = 0; j <= max; j++) {
    if (!byIndex.has(j)) return null;
    out[j] = byIndex.get(j);
  }
  return out;
}

/**
 * @param {unknown} doc Parsed formula_hunt_progressive_* materialized JSON
 * @param {number} combinationIndex
 * @returns {{ word: string; score: number; slotIndex: number; repeatTiles: number | null }[]}
 */
export function pickWordsFromMaterialized(doc, combinationIndex = 0) {
  const rows = doc?.combinations_with_words;
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("combinations_with_words missing or empty");
  }
  const row = rows[combinationIndex];
  if (!row?.words_per_slot || !Array.isArray(row.scores)) {
    throw new Error("invalid combination row");
  }
  const wps = row.words_per_slot;
  const scores = row.scores;
  if (wps.length !== scores.length) {
    throw new Error("words_per_slot length != scores length");
  }
  const repeatSpecs = extractSlotRepeatSpecsFromDoc(doc);
  const out = [];
  for (let i = 0; i < wps.length; i++) {
    const slot = wps[i];
    if (!Array.isArray(slot) || slot.length === 0) {
      throw new Error(`empty slot ${i}`);
    }
    out.push({
      word: String(slot[0]).toLowerCase(),
      score: Number(scores[i]),
      slotIndex: i,
      repeatTiles:
        repeatSpecs != null && repeatSpecs[i] !== undefined ? repeatSpecs[i] : null,
    });
  }
  return out;
}

/**
 * Reverse-unplay UI order: highest hunt score first (last forward word).
 * @param {{ word: string; score: number; slotIndex: number; repeatTiles?: number | null }[]} entries
 */
export function sortEntriesForReverseUnplay(entries) {
  return entries.slice().sort((a, b) => b.score - a.score);
}
