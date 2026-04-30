/** Forward simulation / export verification for published puzzles. */

import { NEXT_LETTERS_LEN } from "./config.js";
import {
  wordToTileLabelSequence,
  normalizeTileText,
  minUniqueTilesForReuseRule,
  normalizedOrthoNeighborsAtFlat,
} from "./board-logic.js";

/** Strip trailing sack padding before JSON round-trip / display. */
export function stripTrailingEmptyNextLetters(tokens) {
  const out = Array.isArray(tokens) ? tokens.slice() : [];
  while (out.length > 0 && out[out.length - 1] === "") out.pop();
  return out;
}

/** Drops every `""` — sack counting must use canonical/padded arrays instead. */
export function omitEmptyNextLetterSlots(tokens) {
  return (Array.isArray(tokens) ? tokens : []).filter((t) => t !== "");
}

/** Canonical runtime sack length after importing compact JSON. */
export function padNextLettersToLen(tokens, len = NEXT_LETTERS_LEN) {
  const src = Array.isArray(tokens) ? tokens : [];
  const out = src.slice(0, len);
  while (out.length < len) out.push("");
  return out;
}

/** Compact JSON sack → lowercase, trim trailing blanks, pad to NEXT_LETTERS_LEN. */
export function canonicalNextLettersFromJsonArray(raw) {
  if (!Array.isArray(raw)) throw new Error("next_letters must be an array");
  const mapped = /** @type {string[]} */ (
    raw.map((c) => String(c ?? "").toLowerCase())
  );
  const trimmed = stripTrailingEmptyNextLetters(mapped);
  if (trimmed.length === 0)
    throw new Error("next_letters must have at least one entry");
  if (trimmed.length > NEXT_LETTERS_LEN) {
    throw new Error("next_letters at most " + NEXT_LETTERS_LEN + " entries");
  }
  return padNextLettersToLen(trimmed);
}

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
  gridSize = 4
) {
  const n = Math.max(1, Math.floor(Number(gridSize)) || 4);
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
  const n = 4;
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
      if (f < 0 || f >= 16) {
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

/** Same replay as verifyForwardPuzzle — starter flats + orthogonal neighbor presets for exports. Null if invalid. */
export function computePerfectHuntStarterHints(
  grid0,
  nextIn,
  wordsAsc,
  pathFlatByWordAsc
) {
  const n = 4;
  const b = grid0.map((row) => row.slice());
  let q;
  try {
    q = canonicalNextLettersFromJsonArray(Array.isArray(nextIn) ? nextIn : []);
  } catch {
    return null;
  }
  const nw = Array.isArray(wordsAsc) ? wordsAsc.length : 0;
  if (nw === 0 || !pathFlatByWordAsc || pathFlatByWordAsc.length !== nw) {
    return null;
  }
  /** @type {number[]} */
  const flats = [];
  /** @type {Array<{ n: string | null; s: string | null; w: string | null; e: string | null }>} */
  const sigs = [];

  for (let wi = 0; wi < nw; wi++) {
    const w = (wordsAsc[wi] || "").toLowerCase();
    const path = pathFlatByWordAsc[wi];
    if (!w || !path || !path.length) return null;
    const glyphs = wordToTileLabelSequence(w);
    if (glyphs.length !== path.length) return null;
    for (let i = 0; i < path.length; i++) {
      const f = path[i];
      if (f < 0 || f >= n * n) return null;
      const r = Math.floor(f / n);
      const c = f % n;
      const g = normalizeTileText(b[r][c]);
      const need = typeof glyphs[i] === "string" ? normalizeTileText(glyphs[i]) : "";
      if (g !== need) return null;
    }

    flats.push(path[0]);
    const ortho = normalizedOrthoNeighborsAtFlat(b, path[0], n);
    sigs.push({ n: ortho.n, s: ortho.s, w: ortho.w, e: ortho.e });

    if (!tryApplyFifoLetterRefillsAfterWordSubmission(b, q, path, n)) return null;
  }
  if (q.length !== 0) return null;
  return {
    perfect_hunt_starter_flats: flats,
    perfect_hunt_starter_neighbor_sigs: sigs,
  };
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

/**
 * Build `next_letters` from per-play `covered`: for each play prepend that play’s `covered`
 * in first-visit order onto the front of `flat` (`part.concat(flat)`). So the **last**
 * `play` in the array ends up supplying the **first** consumed sack slots (front of FIFO).
 * Forward play runs hunt words **ascending** by score, so the **first** refills must come
 * from the **lowest-score** word’s `covered` — pass plays in **descending** score order so
 * that word is iterated last (or use placement order only when it matches that).
 */
export function buildNextLettersFromCoveredInBuildOrder(playsChron, options) {
  const len =
    options && typeof options.chainLen === "number"
      ? options.chainLen
      : NEXT_LETTERS_LEN;
  const fillEmpty =
    options && typeof options.fillEmpty === "string" ? options.fillEmpty : "";
  let flat = /** @type {string[]} */ ([]);
  for (const p of playsChron || []) {
    const part = (p.covered || []).map((ch) =>
      ch === "" || ch == null ? fillEmpty : ch
    );
    flat = part.concat(flat);
  }
  while (flat.length < len) flat.push(fillEmpty);
  return flat.slice(0, len);
}

/**
 * Reconstruct the board immediately before the last chronological play (lowest word in
 * forward play) from the end state and that play’s covered[] (snapshot under first-visit
 * order). Fails (null) if covered length does not match first-visit count (e.g. revisits with
 * inconsistent coverage) — in that case you must use a full snapshot.
 *
 * @param {string[][]} finalGrid
 * @param {{ pathFlat: number[], covered: string[] }} lastPlay
 * @returns {string[][] | null}
 */
export function reconstructForwardStartFromFinalAndLastPlay(finalGrid, lastPlay) {
  if (!lastPlay) return null;
  const path = lastPlay.pathFlat || [];
  const cov = lastPlay.covered || [];
  const uniques = replacementTilesFirstVisitFlatOrder(path);
  if (uniques.length !== cov.length) return null;
  const g0 = finalGrid.map((r) => r.map((c) => c));
  const n = 4;
  for (let i = 0; i < uniques.length; i++) {
    const f = uniques[i];
    const r = Math.floor(f / n);
    const c = f % n;
    g0[r][c] =
      cov[i] === "" || cov[i] == null ? g0[r][c] : String(cov[i]).toLowerCase();
  }
  return g0;
}

/**
 * Apply plays in chronological build order: each play writes its word glyphs to path
 * (later plays overwrite on revisits). Used to get end board from a known editor start.
 *
 * @param {string[][]} initial4
 * @param {Array<{ word: string, pathFlat: number[] }>} playsChron
 * @returns {string[][]}
 */
export function simulateChronoToEndBoard(initial4, playsChron) {
  const b = initial4.map((r) => r.map((c) => String(c || "").toLowerCase()));
  const n = 4;
  for (const p of playsChron || []) {
    const w = (p.word || "").toLowerCase();
    const glyphs = wordToTileLabelSequence(w);
    const path = p.pathFlat || [];
    for (let i = 0; i < path.length; i++) {
      const f = path[i];
      if (f < 0 || f >= 16) continue;
      const r = Math.floor(f / n);
      const c = f % n;
      if (i < glyphs.length) b[r][c] = glyphs[i];
    }
  }
  return b;
}

const N4 = 4;

/**
 * @param {string[][]} board
 * @param {number[]} pathFlat
 * @returns {string[]}
 */
function coveredFirstVisitsFromBoard(board, pathFlat) {
  const seen = new Set();
  const out = /** @type {string[]} */ ([]);
  for (const f of pathFlat) {
    if (seen.has(f)) continue;
    seen.add(f);
    const r = Math.floor(f / N4);
    const c = f % N4;
    out.push((board[r] && board[r][c]) || "");
  }
  return out;
}

/**
 * Recompute covered[] for each play as the board *before* that play on first-visit
 * cells, given an editor start grid. Matches gamemaker’s applyCommit “snap” for valid
 * exports when paths are known.
 *
 * @param {string[][]} editorStart4
 * @param {Array<{ word: string, pathFlat: number[], min_tiles?: number }>} playsChron
 * @returns {Array<{ word: string, pathFlat: number[], covered: string[], min_tiles: number }>}
 */
export function recomputeCoveredChronFromHarness(editorStart4, playsChron) {
  const b = editorStart4.map((r) => r.map((c) => String(c || "").toLowerCase()));
  const out = [];
  for (const p of playsChron || []) {
    const w = (p.word || "").toLowerCase();
    const path = p.pathFlat || [];
    const covered = coveredFirstVisitsFromBoard(b, path);
    const glyphs = wordToTileLabelSequence(w);
    out.push({
      word: p.word,
      pathFlat: path,
      covered,
      min_tiles:
        typeof p.min_tiles === "number"
          ? p.min_tiles
          : minUniqueTilesForReuseRule(glyphs),
    });
    for (let i = 0; i < path.length; i++) {
      const f = path[i];
      if (f < 0 || f >= 16) continue;
      const r = Math.floor(f / N4);
      const c = f % N4;
      if (i < glyphs.length) b[r][c] = glyphs[i];
    }
  }
  return out;
}
