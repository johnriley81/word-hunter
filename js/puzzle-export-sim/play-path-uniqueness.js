/**
 * Shipped-grid FIFO-equivalence play path uniqueness (player-visible labeled board + shifts).
 */

import { GRID_SIZE } from "../config.js";
import { wordToTileLabelSequence } from "../board-logic.js";
import { pathSpellsWordOnBoard } from "./shift-starter.js";
import { resolveOneWordPathOnShippedGrid } from "./resolve-shipped-paths.js";
import { countGamemakerWordPathsOnBoard } from "./path-search.js";
import {
  fifoFirstVisitSpellingSignature,
  isPathGamemakerLegal,
} from "./path-placement.js";
import { boardForHuntUniquenessCheck } from "./player-visible-board.js";
import {
  defaultUniqCountExploreBudget,
  resolvePathsAscForShippedUniqueness,
} from "./resolve-shipped-paths.js";

/**
 * @param {{
 *   uniqCountExploreBudget?: number;
 *   pathSearchExploreBudget?: number;
 *   maxAttemptsPerWord?: number;
 * }} [opts]
 * @returns {{ remaining: number } | null}
 */
export function exploreBudgetForUniqCheck(opts = {}) {
  const explicit =
    typeof opts.uniqCountExploreBudget === "number" &&
    Number.isFinite(opts.uniqCountExploreBudget) &&
    opts.uniqCountExploreBudget > 0
      ? Math.floor(opts.uniqCountExploreBudget)
      : undefined;
  const derived =
    explicit ??
    defaultUniqCountExploreBudget(
      opts.pathSearchExploreBudget,
      opts.maxAttemptsPerWord ?? 10000
    );
  return { remaining: derived };
}

export {
  buildPlayerVisibleBoardBeforeHunt,
  boardForHuntUniquenessCheck,
} from "./player-visible-board.js";

/**
 * @param {string[][]} board Full labeled grid (no overlay stamp).
 * @param {string} word
 * @param {number[]} pathFlat Authored / export path for this hunt word.
 * @param {{
 *   gridSize?: number;
 *   uniqCountExploreBudget?: number;
 *   pathSearchExploreBudget?: number;
 *   maxAttemptsPerWord?: number;
 *   exploreBudget?: { remaining: number };
 * }} [opts]
 */
export function assertUniqueFifoPlayPathOnBoard(board, word, pathFlat, opts = {}) {
  const gridSize = opts.gridSize ?? GRID_SIZE;
  const w = String(word || "").toLowerCase();
  const glyphs = wordToTileLabelSequence(w);

  const leg = isPathGamemakerLegal(w, pathFlat, { gridSize });
  if (!leg.ok) {
    return {
      ok: false,
      reason: "path_illegal: " + (leg.reason ?? ""),
      fifoCount: null,
      signature: null,
    };
  }

  if (!pathSpellsWordOnBoard(board, w, pathFlat, gridSize)) {
    return {
      ok: false,
      reason: "path_does_not_spell_on_board",
      fifoCount: null,
      signature: null,
    };
  }

  const exploreBudget =
    opts.exploreBudget != null &&
    typeof opts.exploreBudget === "object" &&
    typeof opts.exploreBudget.remaining === "number"
      ? opts.exploreBudget
      : exploreBudgetForUniqCheck(opts);

  const fifoCount = countGamemakerWordPathsOnBoard(w, board, {
    gridSize,
    uniqueSpellingMode: "fifo_equivalence",
    stopAfter: 2,
    exploreBudget,
  });

  const signature = fifoFirstVisitSpellingSignature(pathFlat, glyphs);

  if (fifoCount === 0) {
    return {
      ok: false,
      reason: "fifo_play_path_no_visible_spelling",
      fifoCount: 0,
      signature,
    };
  }

  if (fifoCount !== 1) {
    return {
      ok: false,
      reason: "fifo_play_path_ambiguous count=" + fifoCount,
      fifoCount,
      signature,
    };
  }

  return { ok: true, reason: "ok", fifoCount: 1, signature };
}

/**
 * @param {{
 *   starting_grid: string[][];
 *   perfect_hunt: string[];
 *   pathsAsc: number[][];
 *   replayPathsAsc?: number[][];
 *   perfect_hunt_shifts_before?: unknown[] | null;
 *   next_letters?: unknown;
 *   fillEmptyPathCells?: boolean;
 * }} payload
 * @param {{
 *   gridSize?: number;
 *   uniqCountExploreBudget?: number;
 *   pathSearchExploreBudget?: number;
 *   maxAttemptsPerWord?: number;
 * }} [opts]
 */
export function assertUniqueFifoPlayPathsOnShippedGrid(payload, opts = {}) {
  const starting_grid = payload.starting_grid;
  const perfect_hunt = payload.perfect_hunt;
  const pathsAsc = payload.pathsAsc;
  const nw = Array.isArray(perfect_hunt) ? perfect_hunt.length : 0;

  if (!Array.isArray(pathsAsc) || pathsAsc.length !== nw) {
    return {
      ok: false,
      reason: "pathsAsc length mismatch",
      huntIndex: -1,
      word: null,
    };
  }

  const shiftsBefore =
    payload.perfect_hunt_shifts_before ??
    Array.from({ length: nw }, () => /** @type {never[]} */ ([]));

  const hasShifts = shiftsBefore.some((row) => Array.isArray(row) && row.length > 0);
  const huntEnd =
    hasShifts && opts.shiftFifoUniqAllHunts !== true ? Math.min(1, nw) : nw;

  const replayPathsAsc = payload.replayPathsAsc ?? pathsAsc;
  const replayCtx =
    payload.next_letters != null
      ? {
          nextLetters: payload.next_letters,
          wordsAsc: perfect_hunt,
          pathsAsc: replayPathsAsc,
          fillEmptyPathCells: payload.fillEmptyPathCells !== false,
        }
      : null;

  for (let wi = 0; wi < huntEnd; wi++) {
    const board = boardForHuntUniquenessCheck(
      starting_grid,
      shiftsBefore,
      wi,
      opts.gridSize,
      replayCtx
    );
    const pathFlat = pathsAsc[wi] || [];
    const r = assertUniqueFifoPlayPathOnBoard(board, perfect_hunt[wi], pathFlat, opts);
    if (!r.ok) {
      return {
        ok: false,
        reason: r.reason + " word_index=" + wi,
        huntIndex: wi,
        word: perfect_hunt[wi],
        fifoCount: r.fifoCount,
        signature: r.signature,
      };
    }
  }

  return { ok: true, reason: "ok", huntIndex: -1, word: null };
}

/**
 * @param {string[][]} grid0
 * @param {string[]} wordsAsc
 * @param {number[][]} pathFlatByWordAsc
 * @param {unknown[] | null | undefined} shiftsBeforeByWordAsc
 * @param {{
 *   gridSize?: number;
 *   uniqCountExploreBudget?: number;
 *   pathSearchExploreBudget?: number;
 *   maxAttemptsPerWord?: number;
 * }} [opts]
 */
/**
 * @param {string[][]} grid0
 * @param {string[]} wordsAsc
 * @param {number[][]} pathFlatByWordAsc
 * @param {unknown[] | null | undefined} shiftsBeforeByWordAsc
 * @param {{
 *   gridSize?: number;
 *   uniqCountExploreBudget?: number;
 *   pathSearchExploreBudget?: number;
 *   maxAttemptsPerWord?: number;
 *   pathCatalog?: import("./path-catalog/path-variant-catalog.js").PathSignatureCatalog | null;
 *   seed?: number;
 *   resolvePathsOnShippedGrid?: boolean;
 *   nextIn?: unknown;
 * }} [opts]
 */
export function verifyShippedPlayPathUniqueness(
  grid0,
  wordsAsc,
  pathFlatByWordAsc,
  shiftsBeforeByWordAsc,
  opts = {}
) {
  const nw = Array.isArray(wordsAsc) ? wordsAsc.length : 0;
  if (!pathFlatByWordAsc || pathFlatByWordAsc.length !== nw) {
    return {
      ok: false,
      reason: "wordsAsc and pathFlatByWordAsc length mismatch",
      huntIndex: -1,
      word: null,
    };
  }
  const shifts =
    shiftsBeforeByWordAsc ??
    Array.from({ length: nw }, () => /** @type {never[]} */ ([]));

  const useShiftReplay =
    Array.isArray(shiftsBeforeByWordAsc) &&
    shiftsBeforeByWordAsc.length === nw &&
    shiftsBeforeByWordAsc.some((row) => Array.isArray(row) && row.length > 0);

  if (useShiftReplay && opts.shiftFifoUniqAllHunts !== true) {
    const board0 = boardForHuntUniquenessCheck(grid0, shifts, 0, opts.gridSize, null);
    let path0 = pathFlatByWordAsc[0] || [];
    if (
      !pathSpellsWordOnBoard(board0, wordsAsc[0], path0, opts.gridSize ?? GRID_SIZE)
    ) {
      const picked = resolveOneWordPathOnShippedGrid(board0, wordsAsc[0], 0, opts);
      if (!picked) {
        return {
          ok: false,
          reason: "resolve_shipped_path_failed word_index=0",
          huntIndex: 0,
          word: wordsAsc[0] ?? null,
        };
      }
      path0 = picked;
    }
    return assertUniqueFifoPlayPathOnBoard(board0, wordsAsc[0], path0, opts);
  }

  let pathsAsc = pathFlatByWordAsc;
  const resolveOnShipped =
    opts.resolvePathsOnShippedGrid === true ||
    (opts.resolvePathsOnShippedGrid !== false && useShiftReplay);

  if (resolveOnShipped) {
    const resolved = resolvePathsAscForShippedUniqueness(grid0, wordsAsc, shifts, {
      ...opts,
      nextLetters: opts.nextIn,
      replayPathsAsc: pathFlatByWordAsc,
      fillEmptyPathCells: opts.fillEmptyPathCells === true,
    });
    if (!resolved.ok) {
      return {
        ok: false,
        reason: resolved.reason,
        huntIndex: resolved.huntIndex,
        word: wordsAsc[resolved.huntIndex] ?? null,
      };
    }
    pathsAsc = resolved.pathsAsc;
  }

  return assertUniqueFifoPlayPathsOnShippedGrid(
    {
      starting_grid: grid0,
      perfect_hunt: wordsAsc,
      pathsAsc,
      replayPathsAsc: pathFlatByWordAsc,
      perfect_hunt_shifts_before: shifts,
      next_letters: opts.nextIn,
      fillEmptyPathCells: opts.fillEmptyPathCells === true,
    },
    opts
  );
}
