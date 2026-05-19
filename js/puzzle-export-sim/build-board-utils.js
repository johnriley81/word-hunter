import { GRID_SIZE } from "../config.js";
import { wordToTileLabelSequence, normalizeTileText } from "../board-logic.js";
import { deriveCoveredGamemakerPreCommit } from "./gamemaker-covered.js";

/** @typedef {{ word: string; min_tiles?: number; reuse?: number; wordTotal?: number }} PoolWordLike */

export function cloneBoard(/** @type {string[][]} */ b) {
  return b.map((r) => r.slice());
}

export function emptyBoard(/** @type {number} */ n) {
  /** @type {string[][]} */
  const out = [];
  for (let r = 0; r < n; r++) {
    out[r] = [];
    for (let c = 0; c < n; c++) out[r][c] = "";
  }
  return out;
}

export function tileNormAt(
  /** @type {string[][]} */ board,
  /** @type {number} */ flat,
  /** @type {number} */ n
) {
  const r = Math.floor(flat / n);
  const c = flat % n;
  const raw = board[r] != null ? String(board[r][c] ?? "") : "";
  if (raw.trim() === "") return "";
  return normalizeTileText(raw);
}

/**
 * @param {string[][]} snapshotBoard
 * @param {number[]} pathFlat
 * @param {number} n
 */
export function deriveCoveredFromSnapshot(snapshotBoard, pathFlat, n) {
  return deriveCoveredGamemakerPreCommit(snapshotBoard, pathFlat, n);
}

/**
 * Shipped `starting_grid` shows every hunt word at once — each path must read its glyphs on `board`.
 */
export function allPlacedHuntPathsVisibleOnBoard(
  board,
  currentWords,
  buildPlays,
  placementSeqToolbar,
  throughStep,
  trialSlot,
  trialPathFlat
) {
  const n = GRID_SIZE;
  for (let si = 0; si <= throughStep; si++) {
    const slot = placementSeqToolbar[si];
    const w = String(currentWords[slot]?.word || "").toLowerCase();
    const pathFlat =
      slot === trialSlot && trialPathFlat ? trialPathFlat : buildPlays[slot]?.pathFlat;
    if (!pathFlat || !Array.isArray(pathFlat)) return false;
    const glyphs = wordToTileLabelSequence(w);
    if (glyphs.length !== pathFlat.length) return false;
    for (let i = 0; i < pathFlat.length; i++) {
      const f = pathFlat[i];
      const r = Math.floor(f / n);
      const c = f % n;
      if (normalizeTileText(board[r][c]) !== normalizeTileText(glyphs[i])) return false;
    }
  }
  return true;
}

/**
 * @param {() => number} rng
 * @param {number} maxSteps inclusive 0..max
 * @returns {Array<{ t: "row" | "col"; s: number }>}
 */
export function randomBetweenShiftSeq(rng, maxSteps) {
  const cap = Math.max(0, Math.floor(Number(maxSteps)) || 0);
  if (cap === 0) return [];
  const mabs = Math.floor(rng() * (cap + 1));
  if (mabs === 0) return [];
  const useRow = rng() < 0.5;
  const sign = rng() < 0.5 ? -1 : 1;
  return [{ t: useRow ? "row" : "col", s: sign * mabs }];
}

export function buildBetweenShiftCandidates(maxSteps) {
  const cap = Math.max(1, Math.floor(Number(maxSteps)) || 1);
  /** @type {Array<Array<{ t: "row" | "col"; s: number }>>} */
  const out = [];
  for (let s = 1; s <= cap; s++) {
    out.push(
      [{ t: "row", s }],
      [{ t: "row", s: -s }],
      [{ t: "col", s }],
      [{ t: "col", s: -s }]
    );
  }
  return out;
}

export function shuffledCopyWithRng(items, rng) {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}
