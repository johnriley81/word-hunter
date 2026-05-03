import { NEXT_LETTERS_LEN, GRID_SIZE, GRID_CELL_COUNT } from "../config.js";
import { wordToTileLabelSequence, normalizeTileText } from "../board-logic.js";
import { canonicalNextLettersFromJsonArray } from "./next-letters.js";

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

/**
 * Replay ascending hunt paths on `grid0` with FIFO refills; board must solve with empty sack after.
 */
export function verifyForwardPuzzle(grid0, nextIn, wordsAsc, pathFlatByWordAsc) {
  const n = GRID_SIZE;
  const b = grid0.map((row) => row.slice());
  let q;
  try {
    q = canonicalNextLettersFromJsonArray(Array.isArray(nextIn) ? nextIn : []);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      reason: msg,
      queueLeft: [],
    };
  }
  const nw = Array.isArray(wordsAsc) ? wordsAsc.length : 0;
  if (nw === 0 || !pathFlatByWordAsc || pathFlatByWordAsc.length !== nw) {
    return {
      ok: false,
      reason: "wordsAsc and pathFlatByWordAsc length mismatch or empty",
      queueLeft: q,
    };
  }
  for (let wi = 0; wi < nw; wi++) {
    const w = (wordsAsc[wi] || "").toLowerCase();
    const path = pathFlatByWordAsc[wi];
    if (!w || !path || !path.length) {
      return { ok: false, reason: "missing word or path at index " + wi, queueLeft: q };
    }
    const glyphs = wordToTileLabelSequence(w);
    if (glyphs.length !== path.length) {
      return { ok: false, reason: "glyphs vs path at word " + wi, queueLeft: q };
    }
    for (let i = 0; i < path.length; i++) {
      const f = path[i];
      if (f < 0 || f >= GRID_CELL_COUNT) {
        return { ok: false, reason: "path index oob " + f, queueLeft: q };
      }
      const r = Math.floor(f / n);
      const c = f % n;
      const g = normalizeTileText(b[r][c]);
      const need = typeof glyphs[i] === "string" ? normalizeTileText(glyphs[i]) : "";
      if (g !== need) {
        return {
          ok: false,
          reason: "word " + wi + " at step " + i + " want " + need + " got " + g,
          queueLeft: q,
        };
      }
    }
    if (!tryApplyFifoLetterRefillsAfterWordSubmission(b, q, path, n)) {
      return {
        ok: false,
        reason: "not enough next letters for word " + wi,
        queueLeft: q,
      };
    }
  }
  if (q.length !== 0) {
    return {
      ok: false,
      reason: "next letters not fully consumed, left: " + q.length,
      queueLeft: q,
    };
  }
  return { ok: true, reason: "ok", queueLeft: q };
}

/**
 * Run forward verify only if sum of `covered` lengths matches `NEXT_LETTERS_LEN`.
 */
export function verifyForwardPuzzleIfCoveredChain(
  grid0,
  nextIn,
  wordsAsc,
  pathFlatByWordAsc,
  playsChron
) {
  const n = coveredFirstVisitCountTotal(playsChron);
  if (n !== NEXT_LETTERS_LEN) {
    return {
      ok: false,
      reason: "covered_chain_length: " + n + ", need " + NEXT_LETTERS_LEN,
      queueLeft: Array.isArray(nextIn) ? nextIn.slice() : [],
    };
  }
  return verifyForwardPuzzle(grid0, nextIn, wordsAsc, pathFlatByWordAsc);
}

/** Sum of `covered` lengths — must equal `NEXT_LETTERS_LEN` for a valid run. */
export function coveredFirstVisitCountTotal(playsChron) {
  let n = 0;
  for (const p of playsChron || []) {
    n += (p.covered || []).length;
  }
  return n;
}
