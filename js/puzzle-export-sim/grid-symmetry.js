import { GRID_SIZE } from "../config.js";

/**
 * Rotate flat index by k quarter-turns clockwise on an n×n row-major grid.
 * @param {number} flat
 * @param {0|1|2|3} quartersCW
 * @param {number} [n]
 */
export function rotateFlatQuarterTurnsCW(flat, quartersCW, n = GRID_SIZE) {
  const nn = Math.max(1, Math.floor(Number(n)) || GRID_SIZE);
  let f = flat;
  const k = ((quartersCW % 4) + 4) % 4;
  for (let i = 0; i < k; i++) {
    const r = Math.floor(f / nn);
    const c = f % nn;
    f = c * nn + (nn - 1 - r);
  }
  return f;
}

/**
 * @param {number[]} pathFlat
 * @param {0|1|2|3} quartersCW
 * @param {number} [n]
 */
export function rotatePathFlatQuarterTurnsCW(pathFlat, quartersCW, n = GRID_SIZE) {
  return pathFlat.map((f) => rotateFlatQuarterTurnsCW(f, quartersCW, n));
}
