import { NEXT_LETTERS_LEN } from "../config.js";
import { canonicalNextLettersFromJsonArray } from "./next-letters.js";
import {
  replacementTilesFirstVisitFlatOrder,
  tryApplyFifoLetterRefillsAfterWordSubmission,
} from "./refill-fifo.js";
import { shiftAwareStarterHintsReplay } from "./shift-starter.js";
import { pathFlatConflictsPenultimateUndoStroke } from "./word-path-search.js";

export {
  replacementTilesFirstVisitFlatOrder,
  tryApplyFifoLetterRefillsAfterWordSubmission,
} from "./refill-fifo.js";

/** @param {unknown} q */
function emptyQueueSnapshot(q) {
  return Array.isArray(q) ? q.slice() : [];
}

/**
 * Forward replay with optional row/column shifts before each ascending hunt word
 * (`perfect_hunt_shifts_before`). Empty rows = legacy behavior.
 *
 * @param {string[][]} grid0
 * @param {unknown} nextIn
 * @param {string[]} wordsAsc
 * @param {number[][]} pathFlatByWordAsc
 * @param {unknown[] | null | undefined} shiftsBeforeByWordAsc aligned with ascending hunt index
 * @param {{ fillEmptyPathCells?: boolean }} [replayOpts] forwarded to {@link shiftAwareStarterHintsReplay}
 */
export function verifyForwardPuzzleWithShifts(
  grid0,
  nextIn,
  wordsAsc,
  pathFlatByWordAsc,
  shiftsBeforeByWordAsc,
  replayOpts = {}
) {
  /** @type {string[]} */
  let q = [];
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
    const path = pathFlatByWordAsc[wi] || [];
    if (pathFlatConflictsPenultimateUndoStroke(path)) {
      return {
        ok: false,
        reason:
          "path_penultimate_undo_collision word " +
          wi +
          " (⋯A,B,A⋯ selection order is undo on main-site drag)",
        queueLeft: q,
      };
    }
  }

  const r = shiftAwareStarterHintsReplay(
    grid0,
    nextIn,
    wordsAsc,
    pathFlatByWordAsc,
    shiftsBeforeByWordAsc,
    replayOpts
  );
  if (!r.ok)
    return {
      ok: false,
      reason: r.reason || "replay failed",
      queueLeft: emptyQueueSnapshot(q),
    };
  return { ok: true, reason: "ok", queueLeft: [] };
}

/**
 * Replay ascending hunt paths on `grid0` with FIFO refills; board must solve with empty sack after.
 * Equivalent to verifyForwardPuzzleWithShifts with no inter-word shifts.
 *
 * Placement ambiguity gates (**`geometry`** vs **`fifo_equivalence`**) belong to **`findRandomLegalPathFlat`** /
 * automated builds — forward verify assumes exported paths already satisfied whatever uniqueness policy the builder used.
 */
export function verifyForwardPuzzle(grid0, nextIn, wordsAsc, pathFlatByWordAsc) {
  const nw = Array.isArray(wordsAsc) ? wordsAsc.length : 0;
  const noop = Array.from({ length: nw }, () => []);
  return verifyForwardPuzzleWithShifts(
    grid0,
    nextIn,
    wordsAsc,
    pathFlatByWordAsc,
    noop,
    {}
  );
}

/**
 * Run forward verify only if sum of `covered` lengths matches `NEXT_LETTERS_LEN`.
 *
 * When **`shiftsBeforeByWordAsc`** includes any nonempty row, replay uses shift-aware FIFO on **`grid0`**
 * (the shipped **`starting_grid`**, i.e. end-of-generation board state).
 *
 * @param {{ fillEmptyPathCells?: boolean }} [replayOpts] merged after defaults when shift replay runs
 */
export function verifyForwardPuzzleIfCoveredChain(
  grid0,
  nextIn,
  wordsAsc,
  pathFlatByWordAsc,
  playsChron,
  shiftsBeforeByWordAsc,
  replayOpts
) {
  const n = coveredFirstVisitCountTotal(playsChron);
  if (n !== NEXT_LETTERS_LEN) {
    return {
      ok: false,
      reason: "covered_chain_length: " + n + ", need " + NEXT_LETTERS_LEN,
      queueLeft: Array.isArray(nextIn) ? nextIn.slice() : [],
    };
  }
  const nw = Array.isArray(wordsAsc) ? wordsAsc.length : 0;
  const useShiftReplay =
    Array.isArray(shiftsBeforeByWordAsc) &&
    shiftsBeforeByWordAsc.length === nw &&
    shiftsBeforeByWordAsc.some((row) => Array.isArray(row) && row.length > 0);

  if (!useShiftReplay) {
    return verifyForwardPuzzle(grid0, nextIn, wordsAsc, pathFlatByWordAsc);
  }
  const merged = typeof replayOpts === "object" && replayOpts != null ? replayOpts : {};
  return verifyForwardPuzzleWithShifts(
    grid0,
    nextIn,
    wordsAsc,
    pathFlatByWordAsc,
    shiftsBeforeByWordAsc,
    { fillEmptyPathCells: true, ...merged }
  );
}

/** Sum of `covered` lengths — must equal `NEXT_LETTERS_LEN` for a valid run. */
export function coveredFirstVisitCountTotal(playsChron) {
  let n = 0;
  for (const p of playsChron || []) {
    n += (p.covered || []).length;
  }
  return n;
}
