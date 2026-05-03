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

const CARDINAL_KEYS = ["n", "s", "e", "w"];

/** @returns {{ n?: string | null; s?: string | null; w?: string | null; e?: string | null }}} */
export function coerceNeighborSigFromExport(raw, label) {
  if (!raw || typeof raw !== "object")
    throw new Error(label + ": neighbor sig must be an object");
  /** @type {Record<string, string | null>} */
  const out = {};
  let any = false;
  for (const dir of CARDINAL_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(raw, dir)) continue;
    any = true;
    const v = /** @type {Record<string, unknown>} */ (raw)[dir];
    if (v === null) out[dir] = null;
    else if (typeof v === "string") out[dir] = v.trim().toLowerCase();
    else throw new Error(label + ": neighbor " + dir + " must be null or string");
  }
  if (!any) throw new Error(label + ": neighbor sig has no cardinal keys");
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

function validateNeighborSigArray(sigsRaw, label) {
  if (!Array.isArray(sigsRaw) || sigsRaw.length !== HUNT_LEN) {
    throw new Error(label + " must be length " + HUNT_LEN);
  }
  for (let wi = 0; wi < HUNT_LEN; wi++) {
    coerceNeighborSigFromExport(sigsRaw[wi], label + "[" + wi + "]");
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
    perfect_hunt_starter_neighbor_sigs: o.perfect_hunt_starter_neighbor_sigs,
    perfect_hunt_starter_tor_neighbors: o.perfect_hunt_starter_tor_neighbors,
    perfect_hunt_starter_hints_diag: o.perfect_hunt_starter_hints_diag,
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
    throw new Error("perfect_hunt must have length " + HUNT_LEN);
  }
  const hasFlats = row.perfect_hunt_starter_flats != null;
  const hasSigs = row.perfect_hunt_starter_neighbor_sigs != null;
  const hasTorNeighbors = row.perfect_hunt_starter_tor_neighbors != null;
  if (hasFlats)
    validateStarterFlatsArray(
      row.perfect_hunt_starter_flats,
      "perfect_hunt_starter_flats"
    );
  if (hasSigs) {
    validateNeighborSigArray(
      row.perfect_hunt_starter_neighbor_sigs,
      "perfect_hunt_starter_neighbor_sigs"
    );
  }
  if (hasTorNeighbors) {
    coerceStarterTorNeighborsForRow(row.perfect_hunt_starter_tor_neighbors);
  }
  const diag = row.perfect_hunt_starter_hints_diag;
  if (diag != null && (typeof diag !== "object" || Array.isArray(diag))) {
    throw new Error(
      "perfect_hunt_starter_hints_diag must be a plain object when present"
    );
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
  if (Array.isArray(ext.perfect_hunt_starter_neighbor_sigs)) {
    packed.perfect_hunt_starter_neighbor_sigs =
      ext.perfect_hunt_starter_neighbor_sigs.map((sig) => ({
        .../** @type {object} */ (sig),
      }));
  }
  if (Array.isArray(ext.perfect_hunt_starter_tor_neighbors)) {
    packed.perfect_hunt_starter_tor_neighbors = coerceStarterTorNeighborsForRow(
      ext.perfect_hunt_starter_tor_neighbors,
      "serialize perfect_hunt_starter_tor_neighbors"
    );
  }
  if (
    ext.perfect_hunt_starter_hints_diag != null &&
    typeof ext.perfect_hunt_starter_hints_diag === "object" &&
    !Array.isArray(ext.perfect_hunt_starter_hints_diag)
  ) {
    packed.perfect_hunt_starter_hints_diag = JSON.parse(
      JSON.stringify(ext.perfect_hunt_starter_hints_diag)
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
    if (norm.perfect_hunt_starter_neighbor_sigs != null) {
      entry.perfect_hunt_starter_neighbor_sigs = /** @type {unknown[]} */ (
        norm.perfect_hunt_starter_neighbor_sigs
      ).map((raw, wi) =>
        coerceNeighborSigFromExport(raw, fileLabel + " line " + lineNo + "[" + wi + "]")
      );
    }
    if (norm.perfect_hunt_starter_tor_neighbors != null) {
      entry.perfect_hunt_starter_tor_neighbors = coerceStarterTorNeighborsForRow(
        /** @type {unknown[]} */ (norm.perfect_hunt_starter_tor_neighbors),
        fileLabel + " line " + lineNo + ": perfect_hunt_starter_tor_neighbors"
      );
    }
    if (
      norm.perfect_hunt_starter_hints_diag != null &&
      typeof norm.perfect_hunt_starter_hints_diag === "object" &&
      !Array.isArray(norm.perfect_hunt_starter_hints_diag)
    ) {
      entry.perfect_hunt_starter_hints_diag = /** @type {Record<string, unknown>} */ (
        JSON.parse(JSON.stringify(norm.perfect_hunt_starter_hints_diag))
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
    perfect_hunt_starter_neighbor_sigs: dr.perfect_hunt_starter_neighbor_sigs,
    perfect_hunt_starter_tor_neighbors: dr.perfect_hunt_starter_tor_neighbors,
    perfect_hunt_starter_hints_diag: dr.perfect_hunt_starter_hints_diag,
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
  if (Array.isArray(rf.perfect_hunt_starter_neighbor_sigs)) {
    out.perfect_hunt_starter_neighbor_sigs = /** @type {unknown[]} */ (
      rf.perfect_hunt_starter_neighbor_sigs
    ).map((raw, wi) => coerceNeighborSigFromExport(raw, "dict_export sig " + wi));
  }
  if (Array.isArray(rf.perfect_hunt_starter_tor_neighbors)) {
    out.perfect_hunt_starter_tor_neighbors = coerceStarterTorNeighborsForRow(
      rf.perfect_hunt_starter_tor_neighbors,
      "dict_export perfect_hunt_starter_tor_neighbors"
    );
  }
  if (
    rf.perfect_hunt_starter_hints_diag != null &&
    typeof rf.perfect_hunt_starter_hints_diag === "object" &&
    !Array.isArray(rf.perfect_hunt_starter_hints_diag)
  ) {
    out.perfect_hunt_starter_hints_diag = JSON.parse(
      JSON.stringify(rf.perfect_hunt_starter_hints_diag)
    );
  }
  return out;
}
