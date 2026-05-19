import { GRID_SIZE, GRID_CELL_COUNT } from "../config.js";
import {
  wordToTileLabelSequence,
  normalizeTileText,
  normalizedOrthoNeighborsAtFlat,
  applyColumnShiftInPlace,
  applyRowShiftInPlace,
} from "../board-logic.js";
import { canonicalNextLettersFromJsonArray } from "./next-letters.js";
import { simulateChronoToEndBoard } from "./chrono-build.js";
import { tryApplyFifoLetterRefillsAfterWordSubmission } from "./refill-fifo.js";

/**
 * Clone `board`, apply committed row/col steps (`row`/`col`, signed steps match game shift semantics).
 */
export function applyShiftSeqToBoard(board, seq, gridSize = GRID_SIZE) {
  const n = Math.max(1, Math.floor(Number(gridSize)) || GRID_SIZE);
  const b = board.map((row) => row.slice());
  for (const op of seq || []) {
    if (!op || typeof op !== "object") continue;
    const t = op.t === "col" || op.t === "row" ? op.t : null;
    const s = Number(op.s);
    if (!t || !Number.isFinite(s)) continue;
    const steps = Math.trunc(s);
    if (t === "col") applyColumnShiftInPlace(b, steps, n);
    else applyRowShiftInPlace(b, steps, n);
  }
  return b;
}

/** @param {unknown} raw */
export function normalizeShiftsBeforeOps(raw) {
  if (!Array.isArray(raw)) return [];
  /** @type {Array<{ t: "row" | "col"; s: number }>} */
  const out = [];
  for (const op of raw) {
    if (!op || typeof op !== "object") continue;
    const rec = /** @type {{ t?: unknown; s?: unknown }} */ (op);
    const tk = rec.t === "col" || rec.t === "row" ? rec.t : null;
    const s = Math.trunc(Number(rec.s));
    if (!tk || !Number.isFinite(s)) continue;
    out.push({ t: tk, s });
  }
  return out;
}

/**
 * @param {unknown[] | null | undefined} [shiftsBeforeByWordAsc] hunt-length rows of shift ops before each ascending word
 * @param {{ fillEmptyPathCells?: boolean }} [options]
 * @returns {(
 *   | { ok: true; perfect_hunt_starter_flats: number[]; perfect_hunt_starter_neighbor_sigs: Array<{ n: string | null; s: string | null; w: string | null; e: string | null }> }
 *   | {
 *       ok: false;
 *       reason: string;
 *       phase?: string;
 *       word_index?: number;
 *       step?: number;
 *       flat?: number;
 *       want?: string;
 *       got?: string;
 *       queue_left_len?: number;
 *     }
 * )}
 */
export function shiftAwareStarterHintsReplay(
  grid0,
  nextIn,
  wordsAsc,
  pathFlatByWordAsc,
  shiftsBeforeByWordAsc,
  options = {}
) {
  const n = GRID_SIZE;
  const fillEmptyPathCells = options.fillEmptyPathCells === true;
  let q;
  try {
    q = canonicalNextLettersFromJsonArray(Array.isArray(nextIn) ? nextIn : []);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, reason: msg, phase: "next_letters" };
  }
  const nw = Array.isArray(wordsAsc) ? wordsAsc.length : 0;
  if (nw === 0 || !pathFlatByWordAsc || pathFlatByWordAsc.length !== nw) {
    return {
      ok: false,
      reason: "wordsAsc and pathFlatByWordAsc length mismatch or empty",
      phase: "input",
    };
  }
  /** @type {Array<Array<{ t: "col" | "row"; s: number }>>} */
  const shiftRows = [];
  for (let wi = 0; wi < nw; wi++) {
    if (
      Array.isArray(shiftsBeforeByWordAsc) &&
      Array.isArray(shiftsBeforeByWordAsc[wi])
    ) {
      shiftRows.push(normalizeShiftsBeforeOps(shiftsBeforeByWordAsc[wi]));
    } else {
      shiftRows.push([]);
    }
  }

  /** @type {number[]} */
  const flats = [];
  /** @type {Array<{ n: string | null; s: string | null; w: string | null; e: string | null }>} */
  const sigs = [];

  /** @type {string[][]} */
  let b = grid0.map((row) => row.slice());

  for (let wi = 0; wi < nw; wi++) {
    b = applyShiftSeqToBoard(b, shiftRows[wi], n);

    const w = (wordsAsc[wi] || "").toLowerCase();
    const path = pathFlatByWordAsc[wi];
    if (!w || !path || !path.length) {
      return {
        ok: false,
        reason: "missing word or path at index " + wi,
        word_index: wi,
        phase: "word_path",
      };
    }
    const glyphs = wordToTileLabelSequence(w);
    if (glyphs.length !== path.length) {
      return {
        ok: false,
        reason: "glyphs vs path at word " + wi,
        word_index: wi,
        phase: "glyph_path",
      };
    }
    for (let i = 0; i < path.length; i++) {
      const f = path[i];
      if (f < 0 || f >= GRID_CELL_COUNT) {
        return {
          ok: false,
          reason: "path index oob " + f,
          word_index: wi,
          step: i,
          flat: f,
          phase: "path_index",
        };
      }
    }
    if (fillEmptyPathCells) {
      b = simulateChronoToEndBoard(b, [{ word: w, pathFlat: path }]);
    } else {
      for (let i = 0; i < path.length; i++) {
        const f = path[i];
        const r = Math.floor(f / n);
        const c = f % n;
        const g = normalizeTileText(b[r][c]);
        const need = typeof glyphs[i] === "string" ? normalizeTileText(glyphs[i]) : "";
        if (g !== need) {
          return {
            ok: false,
            reason: "word " + wi + " at step " + i + " want " + need + " got " + g,
            word_index: wi,
            step: i,
            flat: f,
            want: need,
            got: g,
            phase: "glyph_match",
          };
        }
      }
    }

    flats.push(path[0]);
    const ortho = normalizedOrthoNeighborsAtFlat(b, path[0], n);
    sigs.push({ n: ortho.n, s: ortho.s, w: ortho.w, e: ortho.e });

    if (!tryApplyFifoLetterRefillsAfterWordSubmission(b, q, path, n)) {
      return {
        ok: false,
        reason: "not enough next letters for word " + wi,
        word_index: wi,
        phase: "refill",
        queue_left_len: q.length,
      };
    }
  }
  if (q.length !== 0) {
    return {
      ok: false,
      reason: "next letters not fully consumed, left: " + q.length,
      phase: "sack_tail",
      queue_left_len: q.length,
    };
  }
  return {
    ok: true,
    perfect_hunt_starter_flats: flats,
    perfect_hunt_starter_neighbor_sigs: sigs,
  };
}

/**
 * Replay hunt like `computePerfectHuntStarterHints`, but applies `shiftsBeforeByWordAsc[wi]` immediately before spelling each ascending word (`{ t:'row'|'col', s: signedSteps }`).
 * Same return shape; null when replay/refill/sack invariant fails.
 */
export function computeShiftAwareStarterHints(
  grid0,
  nextIn,
  wordsAsc,
  pathFlatByWordAsc,
  shiftsBeforeByWordAsc,
  options = {}
) {
  const r = shiftAwareStarterHintsReplay(
    grid0,
    nextIn,
    wordsAsc,
    pathFlatByWordAsc,
    shiftsBeforeByWordAsc,
    options
  );
  if (!r.ok) return null;
  return {
    perfect_hunt_starter_flats: r.perfect_hunt_starter_flats,
    perfect_hunt_starter_neighbor_sigs: r.perfect_hunt_starter_neighbor_sigs,
  };
}

/** Same replay as verifyForwardPuzzle — starter presets with no row/col shifts between words. Null if invalid.
 * @param {{ fillEmptyPathCells?: boolean }} [options]
 */
export function computePerfectHuntStarterHints(
  grid0,
  nextIn,
  wordsAsc,
  pathFlatByWordAsc,
  options = {}
) {
  const nw = Array.isArray(wordsAsc) ? wordsAsc.length : 0;
  const noop = Array.from({ length: nw }, () => []);
  return computeShiftAwareStarterHints(
    grid0,
    nextIn,
    wordsAsc,
    pathFlatByWordAsc,
    noop,
    options
  );
}

/**
 * Build overlay `starting_grid`: replay ascending hunt on `grid0` with per-word shifts then stamps.
 * Paths stay in post-shift coordinates; rejects occupied non-matching cells before each stamp.
 *
 * @param {string[][]} grid0
 * @param {string[]} wordsAsc
 * @param {number[][]} pathsAsc
 * @param {unknown[] | null | undefined} shiftsBeforeByWordAsc
 * @param {number} [gridSize]
 */
export function canonicalOverlayGridFromShiftAscReplay(
  grid0,
  wordsAsc,
  pathsAsc,
  shiftsBeforeByWordAsc,
  gridSize = GRID_SIZE
) {
  const n = Math.max(1, Math.floor(Number(gridSize)) || GRID_SIZE);
  const nw = Array.isArray(wordsAsc) ? wordsAsc.length : 0;
  if (!Array.isArray(pathsAsc) || pathsAsc.length !== nw) {
    return { ok: false, reason: "pathsAsc length mismatch" };
  }
  let b = grid0.map((row) => row.map((c) => String(c ?? "").toLowerCase()));
  for (let wi = 0; wi < nw; wi++) {
    const ops =
      Array.isArray(shiftsBeforeByWordAsc) && Array.isArray(shiftsBeforeByWordAsc[wi])
        ? normalizeShiftsBeforeOps(shiftsBeforeByWordAsc[wi])
        : [];
    b = applyShiftSeqToBoard(b, ops, n);
    const w = String(wordsAsc[wi] || "").toLowerCase();
    const path = pathsAsc[wi];
    const glyphs = wordToTileLabelSequence(w);
    if (!path?.length || glyphs.length !== path.length) {
      return { ok: false, reason: "missing word or path at " + wi, word_index: wi };
    }
    b = simulateChronoToEndBoard(b, [{ word: w, pathFlat: path }]);
  }
  return { ok: true, board: b };
}

/**
 * @param {string[][]} board
 * @param {string} word
 * @param {number[]} pathFlat
 * @param {number} n
 */
export function pathSpellsWordOnBoard(board, word, pathFlat, n = GRID_SIZE) {
  const w = String(word || "").toLowerCase();
  const glyphs = wordToTileLabelSequence(w);
  if (glyphs.length !== pathFlat.length) return false;
  for (let i = 0; i < pathFlat.length; i++) {
    const f = pathFlat[i];
    if (f < 0 || f >= GRID_CELL_COUNT) return false;
    const r = Math.floor(f / n);
    const c = f % n;
    if (normalizeTileText(board[r][c]) !== normalizeTileText(glyphs[i])) return false;
  }
  return true;
}
