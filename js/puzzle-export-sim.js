/** Forward simulation / export verification for published puzzles. */

import { NEXT_LETTERS_LEN, GRID_SIZE, GRID_CELL_COUNT } from "./config.js";
import {
  wordToTileLabelSequence,
  normalizeTileText,
  minUniqueTilesForReuseRule,
  normalizedOrthoNeighborsAtFlat,
  applyColumnShiftInPlace,
  applyRowShiftInPlace,
  torNeighborQuadExportTokensFromBoard,
} from "./board-logic.js";

/** True when every cell is blank after `normalizeTileText` (e.g. gamemaker empty template). */
export function isGridAllNormalizedEmpty(grid, gridSize = GRID_SIZE) {
  const n = gridSize;
  if (!Array.isArray(grid) || grid.length !== n) return false;
  return grid.every(
    (row) =>
      Array.isArray(row) &&
      row.length === n &&
      row.every((cell) => normalizeTileText(String(cell ?? "")) === "")
  );
}

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
 * Shift-aware ascending replay: derive starter flats + orthogonal neighbor signatures after
 * applying optional per-word row/column shifts (`analyze-puzzle-json`, `computePerfectHuntStarterHints`).
 * @param {unknown[] | null | undefined} [shiftsBeforeByWordAsc] — length aligns with hunt; missing entries treated as []
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
      const r = Math.floor(f / n);
      const c = f % n;
      const g = normalizeTileText(b[r][c]);
      const need = typeof glyphs[i] === "string" ? normalizeTileText(glyphs[i]) : "";
      if (g !== need) {
        if (fillEmptyPathCells && g === "") {
          b[r][c] = glyphs[i];
        } else {
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
  const n = GRID_SIZE;
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
  const n = GRID_SIZE;
  for (const p of playsChron || []) {
    const w = (p.word || "").toLowerCase();
    const glyphs = wordToTileLabelSequence(w);
    const path = p.pathFlat || [];
    for (let i = 0; i < path.length; i++) {
      const f = path[i];
      if (f < 0 || f >= GRID_CELL_COUNT) continue;
      const r = Math.floor(f / n);
      const c = f % n;
      if (i < glyphs.length) b[r][c] = glyphs[i];
    }
  }
  return b;
}

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
    const r = Math.floor(f / GRID_SIZE);
    const c = f % GRID_SIZE;
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
 * @returns {Array<{ word: string; pathFlat: number[]; covered: string[]; min_tiles: number; starter_tor_neighbor_quad: string[] }>}
 */
export function recomputeCoveredChronFromHarness(editorStart4, playsChron) {
  const b = editorStart4.map((r) => r.map((c) => String(c || "").toLowerCase()));
  const out = [];
  for (const p of playsChron || []) {
    const w = (p.word || "").toLowerCase();
    const path = p.pathFlat || [];
    const covered = coveredFirstVisitsFromBoard(b, path);
    const glyphs = wordToTileLabelSequence(w);
    for (let i = 0; i < path.length; i++) {
      const f = path[i];
      if (f < 0 || f >= GRID_CELL_COUNT) continue;
      const r = Math.floor(f / GRID_SIZE);
      const c = f % GRID_SIZE;
      if (i < glyphs.length) b[r][c] = glyphs[i];
    }
    const pf0 =
      path.length > 0 && path[0] >= 0 && path[0] < GRID_CELL_COUNT ? path[0] : null;
    const starter_tor_neighbor_quad =
      pf0 != null
        ? torNeighborQuadExportTokensFromBoard(b, pf0, GRID_SIZE)
        : ["0", "0", "0", "0"];
    out.push({
      word: p.word,
      pathFlat: path,
      covered,
      min_tiles:
        typeof p.min_tiles === "number"
          ? p.min_tiles
          : minUniqueTilesForReuseRule(glyphs),
      starter_tor_neighbor_quad,
    });
  }
  return out;
}
