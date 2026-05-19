/**
 * Row/column shift helpers for the live board. `perfect_hunt_shifts_before` in puzzle JSON is
 * build/export metadata (automated shift-build replay); regular play keeps board orientation
 * unless the player shifts manually via the shift zone.
 */

import { GRID_SIZE } from "./config.js";
import {
  applyColumnShiftInPlace,
  applyRowShiftInPlace,
  remapPerfectHuntHintStickyFlatAfterCommittedShift,
} from "./board-logic.js";
import { normalizeShiftsBeforeOps } from "./puzzle-export-sim/shift-starter.js";

/**
 * @param {unknown} rows
 */
export function puzzleHasAuthoringShifts(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return false;
  return rows.some((row) => Array.isArray(row) && row.length > 0);
}

/**
 * @param {string[][]} grid
 * @param {number} [gridSize]
 */
export function cloneGameGrid(grid, gridSize = GRID_SIZE) {
  const n = gridSize;
  return grid.map((row) => row.map((c) => String(c ?? "").toLowerCase()));
}

/**
 * @param {string[][]} target
 * @param {string[][]} source
 * @param {number} [gridSize]
 */
export function copyGameGrid(target, source, gridSize = GRID_SIZE) {
  const n = gridSize;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      target[r][c] = String(source[r]?.[c] ?? "").toLowerCase();
    }
  }
}

/**
 * @param {string[][]} board mutated in place
 * @param {Array<{ t: "row" | "col"; s: number }>} seq
 * @param {{ perfectHuntHintStickyFlat?: number | null }} huntState
 * @param {number} [gridSize]
 */
export function applyAuthoringShiftSeqInPlace(
  board,
  seq,
  huntState,
  gridSize = GRID_SIZE
) {
  const ops = normalizeShiftsBeforeOps(seq);
  for (const op of ops) {
    const kind = op.t === "col" ? "col" : "row";
    const steps = Math.trunc(Number(op.s));
    if (!Number.isFinite(steps) || steps === 0) continue;
    if (kind === "col") applyColumnShiftInPlace(board, steps, gridSize);
    else applyRowShiftInPlace(board, steps, gridSize);
    remapPerfectHuntHintStickyFlatAfterCommittedShift(huntState, kind, steps, gridSize);
  }
}
