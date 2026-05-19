/**
 * Gamemaker-parity `covered[]` for export / `next_letters` (see `grid-placement.js` `applyCommitToBoard`).
 * Snapshot is the board **before** the word is stamped; one entry per first-visit cell in path order.
 */

import { GRID_SIZE } from "../config.js";
import { normalizeTileText } from "../board-logic.js";
import { replacementTilesFirstVisitFlatOrder } from "./refill-fifo.js";

function tileAt(board, flat, gridSize) {
  const n = gridSize;
  const r = Math.floor(flat / n);
  const c = flat % n;
  const raw = board[r] != null ? String(board[r][c] ?? "") : "";
  if (raw.trim() === "") return "";
  return normalizeTileText(raw);
}

/**
 * @param {string[][]} snapshotBoard4 board before commit (gamemaker `boardSnapshotPreDrag`)
 * @param {number[]} pathFlat
 * @param {number} [gridSize]
 * @returns {string[]}
 */
export function deriveCoveredGamemakerPreCommit(
  snapshotBoard4,
  pathFlat,
  gridSize = GRID_SIZE
) {
  if (!snapshotBoard4 || !Array.isArray(pathFlat) || pathFlat.length === 0) {
    return [];
  }
  const order = replacementTilesFirstVisitFlatOrder(pathFlat);
  return order.map((f) => tileAt(snapshotBoard4, f, gridSize));
}
