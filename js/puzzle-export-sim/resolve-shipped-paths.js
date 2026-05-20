/**
 * Resolve legal hunt paths on a fully labeled shipped `starting_grid` (export / audit parity).
 * Does not require unique spelling — spelling witness only.
 */

import { GRID_SIZE } from "../config.js";
import { wordToTileLabelSequence, normalizeTileText } from "../board-logic.js";
import {
  findRandomLegalPathFlat,
  PLACEMENT_HUB_RANK_WEIGHT,
} from "./word-path-search.js";
import { pickCatalogPathFlat } from "./path-catalog/path-variant-catalog.js";
import { applyShiftSeqToBoard, pathSpellsWordOnBoard } from "./shift-starter.js";
import { buildPlayerVisibleBoardBeforeHunt } from "./player-visible-board.js";

/**
 * @param {number | undefined} pathSearchExploreBudget
 * @param {number | undefined} maxAttemptsPerWord
 * @returns {number | undefined}
 */
export function defaultUniqCountExploreBudget(
  pathSearchExploreBudget,
  maxAttemptsPerWord = 10000
) {
  if (
    typeof pathSearchExploreBudget === "number" &&
    Number.isFinite(pathSearchExploreBudget) &&
    pathSearchExploreBudget > 0
  ) {
    return Math.min(320_000, Math.floor(Math.max(pathSearchExploreBudget * 6, 24_000)));
  }
  return Math.min(420_000, Math.floor(Math.max(maxAttemptsPerWord * 54, 55_000)));
}

/**
 * @param {string[][]} board
 * @param {string} word
 * @param {number} wi
 * @param {{
 *   gridSize?: number;
 *   seed?: number;
 *   maxAttemptsPerWord?: number;
 *   pathSearchExploreBudget?: number;
 *   pathCatalog?: import("./path-catalog/path-variant-catalog.js").PathSignatureCatalog | null;
 *   usePathCatalog?: boolean;
 * }} [opts]
 * @returns {number[] | null}
 */
export function resolveOneWordPathOnShippedGrid(board, word, wi = 0, opts = {}) {
  const n = opts.gridSize ?? GRID_SIZE;
  const w = String(word || "").toLowerCase();
  const seed0 = typeof opts.seed === "number" ? opts.seed >>> 0 : 1;
  const maxAttemptsPerWord =
    typeof opts.maxAttemptsPerWord === "number" && opts.maxAttemptsPerWord > 0
      ? Math.floor(opts.maxAttemptsPerWord)
      : 10000;
  const pathSearchExploreBudget =
    typeof opts.pathSearchExploreBudget === "number" &&
    Number.isFinite(opts.pathSearchExploreBudget) &&
    opts.pathSearchExploreBudget > 0
      ? Math.floor(opts.pathSearchExploreBudget)
      : undefined;
  const pathCatalog = opts.pathCatalog ?? null;
  const resolveUseCatalog = pathCatalog != null && opts.usePathCatalog !== false;

  let picked = null;
  if (resolveUseCatalog && pathCatalog) {
    const cat = pickCatalogPathFlat(pathCatalog, w, board, {
      gridSize: n,
      hubRankWeight: PLACEMENT_HUB_RANK_WEIGHT,
    });
    if (cat) {
      const glyphs = wordToTileLabelSequence(w);
      let spells = true;
      for (let pi = 0; pi < cat.pathFlat.length; pi++) {
        const f = cat.pathFlat[pi];
        const r = Math.floor(f / n);
        const c = f % n;
        if (normalizeTileText(board[r][c]) !== normalizeTileText(glyphs[pi])) {
          spells = false;
          break;
        }
      }
      if (spells) picked = cat.pathFlat.slice();
    }
  }
  if (!picked) {
    const dfs = findRandomLegalPathFlat(w, {
      seed: (seed0 + wi * 1597) >>> 0,
      maxAttempts: maxAttemptsPerWord,
      snapshotBoard4: board,
      gateNeighborsOnSnapshot: true,
      preferStraight: true,
      requireUniqueSpelling: false,
      preferSnapshotLetterMatch: true,
      reuseHubCentralityBias: true,
      pathRotationQuarterTurnsCW: 0,
      ...(pathSearchExploreBudget !== undefined
        ? { maxExploreNodes: pathSearchExploreBudget }
        : {}),
    });
    if (dfs) picked = dfs.pathFlat.slice();
  }
  if (!picked) return null;
  const glyphs = wordToTileLabelSequence(w);
  for (let pi = 0; pi < picked.length; pi++) {
    const f = picked[pi];
    const r = Math.floor(f / n);
    const c = f % n;
    if (normalizeTileText(board[r][c]) !== normalizeTileText(glyphs[pi])) return null;
  }
  return picked;
}

/**
 * @param {string[][]} board
 * @param {string[]} wordsAsc
 * @param {{
 *   gridSize?: number;
 *   seed?: number;
 *   maxAttemptsPerWord?: number;
 *   pathSearchExploreBudget?: number;
 *   pathCatalog?: import("./path-catalog/path-variant-catalog.js").PathSignatureCatalog | null;
 *   usePathCatalog?: boolean;
 * }} [opts]
 * @returns {number[][] | null}
 */
/**
 * Resolve one legal path per hunt on the player-visible board (shifted `starting_grid` per index).
 *
 * @param {string[][]} startingGrid
 * @param {string[]} wordsAsc
 * @param {unknown[] | null | undefined} shiftsBefore
 * @param {Parameters<typeof resolveOneWordPathOnShippedGrid>[3]} [opts]
 * @returns {{ ok: true; pathsAsc: number[][] } | { ok: false; reason: string; huntIndex: number }}
 */
export function resolvePathsAscForShippedUniqueness(
  startingGrid,
  wordsAsc,
  shiftsBefore,
  opts = {}
) {
  const nw = Array.isArray(wordsAsc) ? wordsAsc.length : 0;
  const n = opts.gridSize ?? GRID_SIZE;
  const replayPathsAsc = Array.isArray(opts.replayPathsAsc)
    ? opts.replayPathsAsc
    : null;
  /** @type {number[][]} */
  const pathsAsc = [];
  for (let wi = 0; wi < nw; wi++) {
    let board;
    if (opts.nextLetters != null && wi > 0) {
      const pathsForReplay =
        replayPathsAsc && replayPathsAsc.length >= wi ? replayPathsAsc : pathsAsc;
      const built = buildPlayerVisibleBoardBeforeHunt(
        startingGrid,
        opts.nextLetters,
        wordsAsc,
        pathsForReplay,
        shiftsBefore,
        wi,
        n,
        { fillEmptyPathCells: opts.fillEmptyPathCells === true }
      );
      if (!built.ok) {
        return {
          ok: false,
          reason: built.reason ?? "replay_board_failed",
          huntIndex: wi,
        };
      }
      board = built.board;
    } else {
      const ops =
        Array.isArray(shiftsBefore) && Array.isArray(shiftsBefore[wi])
          ? shiftsBefore[wi]
          : [];
      board = applyShiftSeqToBoard(
        startingGrid.map((row) => row.slice()),
        ops,
        n
      );
    }
    const placementPath =
      replayPathsAsc && Array.isArray(replayPathsAsc[wi]) && replayPathsAsc[wi].length
        ? replayPathsAsc[wi]
        : null;
    if (placementPath && pathSpellsWordOnBoard(board, wordsAsc[wi], placementPath, n)) {
      pathsAsc.push(placementPath.slice());
      continue;
    }
    const picked = resolveOneWordPathOnShippedGrid(board, wordsAsc[wi], wi, opts);
    if (!picked) {
      return {
        ok: false,
        reason: "resolve_shipped_path_failed word_index=" + wi,
        huntIndex: wi,
      };
    }
    pathsAsc.push(picked);
  }
  return { ok: true, pathsAsc };
}

export function resolveAscendingPathsOnShippedGrid(board, wordsAsc, opts = {}) {
  const nw = Array.isArray(wordsAsc) ? wordsAsc.length : 0;
  /** @type {number[][]} */
  const pathsAsc = [];
  for (let wi = 0; wi < nw; wi++) {
    const picked = resolveOneWordPathOnShippedGrid(board, wordsAsc[wi], wi, opts);
    if (!picked) return null;
    pathsAsc.push(picked);
  }
  return pathsAsc;
}
