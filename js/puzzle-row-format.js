/** JSON Lines puzzles. Internal `""` sack slots matter; stripping them loses round-trip data. */

import { PERFECT_HUNT_WORD_COUNT } from "./config.js";
import {
  stripTrailingEmptyNextLetters,
  canonicalNextLettersFromJsonArray,
} from "./puzzle-export-sim.js";
import {
  PERFECT_HUNT_TOR_NEIGHBOR_LEN,
  normalizedExportedTorNeighborToken,
} from "./board-logic.js";

const GRID = 4;
const HUNT_LEN = PERFECT_HUNT_WORD_COUNT;

function coerceNextLettersForRow(raw) {
  return canonicalNextLettersFromJsonArray(raw);
}

function coerceStarterFlatValues(raw) {
  return raw.map((x) => (typeof x === "number" && Number.isFinite(x) ? x : Number(x)));
}

export function coerceStarterTorNeighborsForRow(
  raw,
  label = "perfect_hunt_starter_tor_neighbors"
) {
  if (!Array.isArray(raw)) throw new Error(label + " must be an array");
  if (raw.length !== PERFECT_HUNT_TOR_NEIGHBOR_LEN) {
    throw new Error(label + " must have length " + PERFECT_HUNT_TOR_NEIGHBOR_LEN);
  }
  /** @type {string[]} */
  const out = [];
  for (let i = 0; i < raw.length; i++) {
    const s = normalizedExportedTorNeighborToken(raw[i]);
    out.push(s === "" ? "0" : s);
  }
  return out;
}

function validateStarterFlatsArray(flatsRaw, label) {
  if (!Array.isArray(flatsRaw) || flatsRaw.length !== HUNT_LEN) {
    throw new Error(label + " must be length " + HUNT_LEN);
  }
  for (let i = 0; i < HUNT_LEN; i++) {
    const x = flatsRaw[i];
    const fi = typeof x === "number" ? x : Number(x);
    if (!Number.isFinite(fi) || fi !== Math.floor(fi) || fi < 0 || fi >= GRID * GRID) {
      throw new Error(label + " index " + i + " invalid flat " + fi);
    }
  }
}

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
    perfect_hunt_starter_flats: o.perfect_hunt_starter_flats,
    perfect_hunt_starter_tor_neighbors: o.perfect_hunt_starter_tor_neighbors,
  };
}

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
    throw new Error("perfect_hunt must be length " + HUNT_LEN);
  }
  const hasFlats = row.perfect_hunt_starter_flats != null;
  const hasTorNeighbors = row.perfect_hunt_starter_tor_neighbors != null;
  if (hasFlats)
    validateStarterFlatsArray(
      row.perfect_hunt_starter_flats,
      "perfect_hunt_starter_flats"
    );
  if (hasTorNeighbors) {
    coerceStarterTorNeighborsForRow(row.perfect_hunt_starter_tor_neighbors);
  }
}

export function serializePuzzleRow(row) {
  validatePuzzleRow(row);
  /** @type {Record<string, unknown>} */
  const packed = {
    starting_grid: row.starting_grid,
    next_letters: stripTrailingEmptyNextLetters(
      Array.isArray(row.next_letters) ? row.next_letters.slice() : []
    ),
    perfect_hunt: row.perfect_hunt,
  };
  const ext = /** @type {Record<string, unknown>} */ (row);
  if (Array.isArray(ext.perfect_hunt_starter_flats)) {
    packed.perfect_hunt_starter_flats = ext.perfect_hunt_starter_flats.slice();
  }
  if (Array.isArray(ext.perfect_hunt_starter_tor_neighbors)) {
    packed.perfect_hunt_starter_tor_neighbors = coerceStarterTorNeighborsForRow(
      ext.perfect_hunt_starter_tor_neighbors,
      "serialize perfect_hunt_starter_tor_neighbors"
    );
  }
  return JSON.stringify(packed);
}

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
    /** @type {Record<string, unknown>} */
    const entry = {
      starting_grid: norm.starting_grid.map((r) =>
        /** @type {unknown[]} */ (r).map((c) => String(c || "").toLowerCase())
      ),
      next_letters: coerceNextLettersForRow(norm.next_letters),
      perfect_hunt: /** @type {unknown[]} */ (norm.perfect_hunt).map((w) =>
        String(w || "").toLowerCase()
      ),
    };
    if (norm.perfect_hunt_starter_flats != null) {
      entry.perfect_hunt_starter_flats = coerceStarterFlatValues(
        /** @type {unknown[]} */ (norm.perfect_hunt_starter_flats)
      );
    }
    if (norm.perfect_hunt_starter_tor_neighbors != null) {
      entry.perfect_hunt_starter_tor_neighbors = coerceStarterTorNeighborsForRow(
        /** @type {unknown[]} */ (norm.perfect_hunt_starter_tor_neighbors),
        fileLabel + " line " + lineNo + ": perfect_hunt_starter_tor_neighbors"
      );
    }
    puzzles.push(entry);
  }
  return puzzles;
}

export function dictExportToCanonicalRow(d) {
  const g0 = d.starting_grids?.[0];
  if (!g0) throw new Error("starting_grids[0] missing");
  const dr = /** @type {Record<string, unknown>} */ (d);
  const row = normalizePuzzleRow({
    starting_grid: g0,
    next_letters: d.next_letters,
    perfect_hunt: d.perfect_hunt,
    perfect_hunt_starter_flats: dr.perfect_hunt_starter_flats,
    perfect_hunt_starter_tor_neighbors: dr.perfect_hunt_starter_tor_neighbors,
  });
  validatePuzzleRow(row);
  /** @type {Record<string, unknown>} */
  const out = {
    starting_grid: row.starting_grid.map((r) =>
      /** @type {unknown[]} */ (r).map((c) => String(c || "").toLowerCase())
    ),
    next_letters: coerceNextLettersForRow(row.next_letters),
    perfect_hunt: /** @type {unknown[]} */ (row.perfect_hunt).map((w) =>
      String(w || "").toLowerCase()
    ),
  };
  const rf = /** @type {Record<string, unknown>} */ (row);
  if (Array.isArray(rf.perfect_hunt_starter_flats)) {
    out.perfect_hunt_starter_flats = coerceStarterFlatValues(
      /** @type {unknown[]} */ (rf.perfect_hunt_starter_flats)
    );
  }
  if (Array.isArray(rf.perfect_hunt_starter_tor_neighbors)) {
    out.perfect_hunt_starter_tor_neighbors = coerceStarterTorNeighborsForRow(
      rf.perfect_hunt_starter_tor_neighbors,
      "dict_export perfect_hunt_starter_tor_neighbors"
    );
  }
  return out;
}
