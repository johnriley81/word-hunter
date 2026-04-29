/** puzzles.txt: JSON Lines — one compact `{...}` object per non-empty line.
 *  Rows saved before positional-`""` sacks (everything stripped via `omitEmptyNextLetterSlots`
 *  on load) cannot recover internal blanks — re-export or regenerate those puzzles/pool lines.
 */

import { PERFECT_HUNT_WORD_COUNT, NEXT_LETTERS_LEN } from "./config.js";
import {
  stripTrailingEmptyNextLetters,
  canonicalNextLettersFromJsonArray,
} from "./puzzle-export-sim.js";

const GRID = 4;
const NEXT_LEN = NEXT_LETTERS_LEN;
const HUNT_LEN = PERFECT_HUNT_WORD_COUNT;

/**
 * @param {unknown[]} raw tokens from JSON (trailing `""` may be omitted; internal `""` preserved)
 * @returns {string[]} padded to `NEXT_LETTERS_LEN` for runtime
 */
function coerceNextLettersForRow(raw) {
  return canonicalNextLettersFromJsonArray(raw);
}

/**
 * @param {unknown} raw
 * @returns {{ starting_grid: unknown; next_letters: unknown; perfect_hunt: unknown }}
 */
export function normalizePuzzleRow(raw) {
  if (!raw || typeof raw !== "object") throw new Error("puzzle row must be an object");
  const o = /** @type {Record<string, unknown>} */ (raw);
  let starting_grid = o.starting_grid;
  if (
    starting_grid == null &&
    Array.isArray(o.starting_grids) &&
    o.starting_grids.length >= 1
  ) {
    starting_grid = o.starting_grids[0];
  }
  return {
    starting_grid,
    next_letters: o.next_letters,
    perfect_hunt: o.perfect_hunt,
  };
}

/**
 * @param {{ starting_grid: unknown; next_letters: unknown; perfect_hunt: unknown }} row
 */
export function validatePuzzleRow(row) {
  const { starting_grid, next_letters, perfect_hunt } = row;
  if (!Array.isArray(starting_grid) || starting_grid.length !== GRID) {
    throw new Error("starting_grid must be a 4×4 array");
  }
  for (let i = 0; i < GRID; i++) {
    const r = starting_grid[i];
    if (!Array.isArray(r) || r.length !== GRID) {
      throw new Error("starting_grid row " + i + " must have 4 cells");
    }
  }
  coerceNextLettersForRow(next_letters);
  if (!Array.isArray(perfect_hunt) || perfect_hunt.length !== HUNT_LEN) {
    throw new Error("perfect_hunt must have length " + HUNT_LEN);
  }
}

export function serializePuzzleRow(row) {
  validatePuzzleRow(row);
  return JSON.stringify({
    starting_grid: row.starting_grid,
    /** Trailing-padding only — internal `""` peel slots retained for round-trip fidelity. */
    next_letters: stripTrailingEmptyNextLetters(
      /** @type {string[]} */ (
        Array.isArray(row.next_letters) ? row.next_letters.slice() : []
      )
    ),
    perfect_hunt: row.perfect_hunt,
  });
}

/**
 * @param {string} text
 * @param {{ fileLabel?: string }} [opts]
 * @returns {Array<{ starting_grid: string[][]; next_letters: string[]; perfect_hunt: string[] }>}
 */
export function parsePuzzlesFileText(text, opts = {}) {
  const fileLabel = opts.fileLabel ?? "puzzles";
  const lines = text.split(/\r?\n/);
  const puzzles = [];
  let lineNo = 0;
  for (const raw of lines) {
    lineNo++;
    const t = raw.trim();
    if (!t) continue;
    let j;
    try {
      j = JSON.parse(t);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(fileLabel + " line " + lineNo + ": " + msg);
    }
    const norm = normalizePuzzleRow(j);
    validatePuzzleRow(norm);
    puzzles.push({
      starting_grid: norm.starting_grid.map((r) =>
        /** @type {unknown[]} */ (r).map((c) => String(c || "").toLowerCase())
      ),
      next_letters: coerceNextLettersForRow(norm.next_letters),
      perfect_hunt: /** @type {unknown[]} */ (norm.perfect_hunt).map((w) =>
        String(w || "").toLowerCase()
      ),
    });
  }
  return puzzles;
}

export function dictExportToCanonicalRow(d) {
  const g0 = d.starting_grids?.[0];
  if (!g0) throw new Error("starting_grids[0] missing");
  const row = normalizePuzzleRow({
    starting_grid: g0,
    next_letters: d.next_letters,
    perfect_hunt: d.perfect_hunt,
  });
  validatePuzzleRow(row);
  return {
    starting_grid: row.starting_grid.map((r) =>
      /** @type {unknown[]} */ (r).map((c) => String(c || "").toLowerCase())
    ),
    next_letters: coerceNextLettersForRow(row.next_letters),
    perfect_hunt: /** @type {unknown[]} */ (row.perfect_hunt).map((w) =>
      String(w || "").toLowerCase()
    ),
  };
}
