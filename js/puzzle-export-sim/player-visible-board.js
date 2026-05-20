/**
 * Player-visible board state before each hunt word (shift + prior FIFO refills).
 */

import { GRID_SIZE } from "../config.js";
import { wordToTileLabelSequence, normalizeTileText } from "../board-logic.js";
import { applyShiftSeqToBoard, normalizeShiftsBeforeOps } from "./shift-starter.js";
import { canonicalNextLettersFromJsonArray } from "./next-letters.js";
import { tryApplyFifoLetterRefillsAfterWordSubmission } from "./refill-fifo.js";
import { simulateChronoToEndBoard } from "./chrono-build.js";

/**
 * @param {string[][]} startingGrid
 * @param {unknown} nextIn
 * @param {string[]} wordsAsc
 * @param {number[][]} pathsAsc
 * @param {unknown[] | null | undefined} shiftsBefore
 * @param {number} huntIndex
 * @param {number} [gridSize]
 * @param {{ fillEmptyPathCells?: boolean }} [opts]
 * @returns {{ ok: true; board: string[][] } | { ok: false; reason: string }}
 */
export function buildPlayerVisibleBoardBeforeHunt(
  startingGrid,
  nextIn,
  wordsAsc,
  pathsAsc,
  shiftsBefore,
  huntIndex,
  gridSize = GRID_SIZE,
  opts = {}
) {
  const fillEmptyPathCells = opts.fillEmptyPathCells !== false;
  const n = gridSize;
  /** @type {string[]} */
  let q;
  try {
    q = canonicalNextLettersFromJsonArray(Array.isArray(nextIn) ? nextIn : []);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, reason: msg };
  }
  let b = startingGrid.map((row) => row.slice());
  for (let wi = 0; wi < huntIndex; wi++) {
    const ops =
      Array.isArray(shiftsBefore) && Array.isArray(shiftsBefore[wi])
        ? normalizeShiftsBeforeOps(shiftsBefore[wi])
        : [];
    b = applyShiftSeqToBoard(b, ops, n);
    const w = String(wordsAsc[wi] || "").toLowerCase();
    const path = pathsAsc[wi] || [];
    const glyphs = wordToTileLabelSequence(w);
    if (fillEmptyPathCells) {
      b = simulateChronoToEndBoard(b, [{ word: w, pathFlat: path }]);
    } else {
      for (let i = 0; i < path.length; i++) {
        const f = path[i];
        const r = Math.floor(f / n);
        const c = f % n;
        const g = normalizeTileText(b[r][c]);
        const need = normalizeTileText(glyphs[i]);
        if (g !== need) {
          return {
            ok: false,
            reason: "prior_hunt_glyph_mismatch word " + wi + " step " + i,
          };
        }
      }
    }
    if (!tryApplyFifoLetterRefillsAfterWordSubmission(b, q, path, n)) {
      return { ok: false, reason: "prior_hunt_refill_failed word " + wi };
    }
  }
  const opsNow =
    Array.isArray(shiftsBefore) && Array.isArray(shiftsBefore[huntIndex])
      ? normalizeShiftsBeforeOps(shiftsBefore[huntIndex])
      : [];
  b = applyShiftSeqToBoard(b, opsNow, n);
  return { ok: true, board: b };
}

/**
 * @param {string[][]} startingGrid
 * @param {unknown[] | null | undefined} shiftsBefore
 * @param {number} huntIndex
 * @param {number} [gridSize]
 * @param {{
 *   nextLetters?: unknown;
 *   wordsAsc?: string[];
 *   pathsAsc?: number[][];
 * } | null | undefined} [replayCtx]
 */
export function boardForHuntUniquenessCheck(
  startingGrid,
  shiftsBefore,
  huntIndex,
  gridSize = GRID_SIZE,
  replayCtx = null
) {
  const useReplay =
    replayCtx &&
    replayCtx.nextLetters != null &&
    Array.isArray(replayCtx.wordsAsc) &&
    Array.isArray(replayCtx.pathsAsc) &&
    huntIndex > 0 &&
    replayCtx.pathsAsc.length > huntIndex;
  if (useReplay) {
    const built = buildPlayerVisibleBoardBeforeHunt(
      startingGrid,
      replayCtx.nextLetters,
      replayCtx.wordsAsc,
      replayCtx.pathsAsc,
      shiftsBefore,
      huntIndex,
      gridSize,
      { fillEmptyPathCells: replayCtx.fillEmptyPathCells !== false }
    );
    if (built.ok) return built.board;
  }
  const ops =
    Array.isArray(shiftsBefore) && Array.isArray(shiftsBefore[huntIndex])
      ? shiftsBefore[huntIndex]
      : [];
  return applyShiftSeqToBoard(
    startingGrid.map((row) => row.slice()),
    ops,
    gridSize
  );
}
