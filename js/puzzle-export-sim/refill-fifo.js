import { GRID_SIZE } from "../config.js";
import { normalizeTileText } from "../board-logic.js";

/** Unique path flats in first-visit order (FIFO refill slots). */
export function replacementTilesFirstVisitFlatOrder(pathFlat) {
  const out = [];
  const seen = new Set();
  for (const f of pathFlat) {
    if (!seen.has(f)) {
      seen.add(f);
      out.push(f);
    }
  }
  return out;
}

/** Apply refills after a word (`shift()` per replacementTilesFirstVisitFlatOrder flat). Returns false if sack too short. */
export function tryApplyFifoLetterRefillsAfterWordSubmission(
  board,
  fifoQueue,
  pathFlat,
  gridSize = GRID_SIZE
) {
  const n = Math.max(1, Math.floor(Number(gridSize)) || GRID_SIZE);
  const order = replacementTilesFirstVisitFlatOrder(pathFlat);
  if (order.length > fifoQueue.length) return false;
  for (const f of order) {
    const rep = normalizeTileText(String(fifoQueue.shift() ?? "").toLowerCase());
    const r = Math.floor(f / n);
    const c = f % n;
    board[r][c] = rep;
  }
  return true;
}
