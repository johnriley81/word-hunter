/**
 * Enumerate all torus translations of a 4×4 board via global row then column shifts.
 * Used for exhaustive inter-word swipe placement search (16 layouts).
 */

import { GRID_SIZE } from "../config.js";
import {
  applyColumnShiftInPlace,
  applyRowShiftInPlace,
  normalizeTileText,
  wordToTileLabelSequence,
  minUniqueTilesForReuseRule,
} from "../board-logic.js";
import { applyShiftSeqToBoard, normalizeShiftsBeforeOps } from "./shift-starter.js";
import { scoreBestCatalogPlacement } from "./path-variant-catalog.js";
import {
  findRandomLegalPathFlat,
  pickBestPathFlatByCoverRotations,
  PLACEMENT_HUB_RANK_WEIGHT,
  scorePlacementCoverExisting,
  scoreReuseHubCentrality,
} from "./word-path-search.js";
import { simulateChronoToEndBoard } from "./chrono-build.js";

/**
 * @param {string[][]} board
 * @param {number} [gridSize]
 */
export function boardLetterKey(board, gridSize = GRID_SIZE) {
  const n = Math.max(1, Math.floor(Number(gridSize)) || GRID_SIZE);
  const parts = [];
  for (let r = 0; r < n; r++) {
    const row = board[r];
    if (!Array.isArray(row)) continue;
    for (let c = 0; c < n; c++) {
      parts.push(normalizeTileText(String(row[c] ?? "")));
    }
  }
  return parts.join("|");
}

/**
 * @param {string[][]} board
 * @param {number} [gridSize]
 */
function isBoardAllBlank(board, gridSize = GRID_SIZE) {
  const n = Math.max(1, Math.floor(Number(gridSize)) || GRID_SIZE);
  for (let r = 0; r < n; r++) {
    const row = board[r];
    if (!Array.isArray(row)) return false;
    for (let c = 0; c < n; c++) {
      if (normalizeTileText(String(row[c] ?? "")) !== "") return false;
    }
  }
  return true;
}

/**
 * @param {string[][]} board
 * @param {number} rowK
 * @param {number} colK
 * @param {number} [gridSize]
 */
export function torusTranslationShiftSeq(rowK, colK, gridSize = GRID_SIZE) {
  const n = Math.max(1, Math.floor(Number(gridSize)) || GRID_SIZE);
  const rk = ((Math.trunc(rowK) % n) + n) % n;
  const ck = ((Math.trunc(colK) % n) + n) % n;
  /** @type {Array<{ t: "row" | "col"; s: number }>} */
  const ops = [];
  if (rk !== 0) ops.push({ t: "row", s: rk });
  if (ck !== 0) ops.push({ t: "col", s: ck });
  return normalizeShiftsBeforeOps(ops);
}

/**
 * Apply torus translation (rowK, colK) to a board copy.
 *
 * @param {string[][]} board
 * @param {number} rowK
 * @param {number} colK
 * @param {number} [gridSize]
 */
export function applyTorusTranslation(board, rowK, colK, gridSize = GRID_SIZE) {
  const n = Math.max(1, Math.floor(Number(gridSize)) || GRID_SIZE);
  const b = board.map((row) => row.map((c) => String(c ?? "").toLowerCase()));
  const rk = ((Math.trunc(rowK) % n) + n) % n;
  const ck = ((Math.trunc(colK) % n) + n) % n;
  if (rk !== 0) applyRowShiftInPlace(b, rk, n);
  if (ck !== 0) applyColumnShiftInPlace(b, ck, n);
  return b;
}

/**
 * All layouts reachable by global row/col torus shifts (at most n×n, deduped by letter key).
 *
 * @param {string[][]} board
 * @param {number} [gridSize]
 * @returns {Array<{ rowK: number; colK: number; board: string[][]; seq: Array<{ t: "row" | "col"; s: number }>; key: string }>}
 */
export function enumerateTorusTranslationBoards(board, gridSize = GRID_SIZE) {
  const n = Math.max(1, Math.floor(Number(gridSize)) || GRID_SIZE);
  const src = board.map((row) => row.map((c) => String(c ?? "").toLowerCase()));
  if (isBoardAllBlank(src, n)) {
    return [
      {
        rowK: 0,
        colK: 0,
        board: src.map((row) => row.slice()),
        seq: [],
        key: boardLetterKey(src, n),
      },
    ];
  }
  /** @type {Array<{ rowK: number; colK: number; board: string[][]; seq: Array<{ t: "row" | "col"; s: number }>; key: string }>} */
  const out = [];
  const seen = new Set();
  for (let rowK = 0; rowK < n; rowK++) {
    for (let colK = 0; colK < n; colK++) {
      const b = applyTorusTranslation(src, rowK, colK, n);
      const key = boardLetterKey(b, n);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        rowK,
        colK,
        board: b,
        seq: torusTranslationShiftSeq(rowK, colK, n),
        key,
      });
    }
  }
  return out;
}

/**
 * Replay check: `applyShiftSeqToBoard(source, seq)` equals enumerated board.
 *
 * @param {string[][]} source
 * @param {{ board: string[][]; seq: Array<{ t: "row" | "col"; s: number }> }} entry
 * @param {number} [gridSize]
 */
export function torusTranslationReplayMatches(source, entry, gridSize = GRID_SIZE) {
  const replayed = applyShiftSeqToBoard(source, entry.seq, gridSize);
  return boardLetterKey(replayed, gridSize) === boardLetterKey(entry.board, gridSize);
}

/**
 * @param {import("./path-variant-catalog.js").PathSignatureCatalogJson | null} catalog
 * @param {string} wordLc
 * @param {string[][]} snapshotBoard4
 * @param {Parameters<typeof findRandomLegalPathFlat>[1]} findOpts
 * @param {{ gridSize?: number; usePathCatalog?: boolean; allowPlacementDfsFallback?: boolean }} deps
 * @returns {{ pathFlat: number[]; minTiles: number; reuse: number; score: number; source: "catalog" | "dfs" } | null}
 */
function scorePlacementOnBoard(catalog, wordLc, snapshotBoard4, findOpts, deps) {
  const gridSize = deps.gridSize ?? GRID_SIZE;
  const useCatalog = deps.usePathCatalog !== false && catalog != null;
  if (useCatalog && catalog) {
    const picked = scoreBestCatalogPlacement(catalog, wordLc, snapshotBoard4, {
      gridSize,
      hubRankWeight: PLACEMENT_HUB_RANK_WEIGHT,
    });
    if (picked) {
      const glyphs = wordToTileLabelSequence(wordLc);
      const minTiles = minUniqueTilesForReuseRule(glyphs);
      return {
        pathFlat: picked.pathFlat,
        minTiles,
        reuse: glyphs.length - minTiles,
        score: picked.score,
        source: "catalog",
      };
    }
    if (!deps.allowPlacementDfsFallback) return null;
  }
  const dfs = findRandomLegalPathFlat(wordLc, findOpts);
  if (!dfs) return null;
  const best = pickBestPathFlatByCoverRotations(wordLc, dfs.pathFlat, snapshotBoard4, {
    gridSize,
    hubRankWeight: PLACEMENT_HUB_RANK_WEIGHT,
  });
  const pathFlat = best ? best.pathFlat : dfs.pathFlat;
  const pref = scorePlacementCoverExisting(snapshotBoard4, pathFlat, gridSize);
  const hubRank = scoreReuseHubCentrality(pathFlat, gridSize);
  const score = pref.score + hubRank * PLACEMENT_HUB_RANK_WEIGHT;
  return {
    pathFlat,
    minTiles: dfs.minTiles,
    reuse: dfs.reuse,
    score,
    source: "dfs",
  };
}

/**
 * Pick the best word placement across all torus-translated grids before this commit.
 *
 * @param {string[][]} board current board before inter-word shift
 * @param {string} wordLc
 * @param {{
 *   catalog: import("./path-variant-catalog.js").PathSignatureCatalogJson | null;
 *   gridSize?: number;
 *   usePathCatalog?: boolean;
 *   allowPlacementDfsFallback?: boolean;
 *   findPlacementOpts: Omit<Parameters<typeof findRandomLegalPathFlat>[1], "snapshotBoard4">;
 *   shiftUseLookaheadHeuristics?: boolean;
 *   nextWordLc?: string | null;
 *   lookaheadSnapBias?: boolean;
 *   lookaheadAttempts?: number;
 *   pathSearchExploreBudget?: number;
 *   uniqCountExploreBudget?: number;
 *   homeRowK?: number;
 *   homeColK?: number;
 *   requireNonIdentityRotation?: boolean;
 * }} deps
 */
export function pickBestPlacementAcrossTorusTranslations(board, wordLc, deps) {
  const gridSize = deps.gridSize ?? GRID_SIZE;
  const n = gridSize;
  const homeRowK = ((Math.trunc(deps.homeRowK ?? 0) % n) + n) % n;
  const homeColK = ((Math.trunc(deps.homeColK ?? 0) % n) + n) % n;
  const invRK = (n - homeRowK) % n;
  const invCK = (n - homeColK) % n;
  const boardAtHome = applyTorusTranslation(board, invRK, invCK, n);
  const translations = enumerateTorusTranslationBoards(boardAtHome, gridSize);
  const requireRot = deps.requireNonIdentityRotation === true;
  const boardHasLetters = !isBoardAllBlank(boardAtHome, n);
  /** @type {{
   *   rowK: number;
   *   colK: number;
   *   board: string[][];
   *   seq: Array<{ t: "row" | "col"; s: number }>;
   *   pathFlat: number[];
   *   minTiles: number;
   *   reuse: number;
   *   score: number;
   *   source: "catalog" | "dfs";
   * } | null} */
  let best = null;

  for (const t of translations) {
    const deltaRK = (t.rowK - homeRowK + n) % n;
    const deltaCK = (t.colK - homeColK + n) % n;
    if (requireRot && boardHasLetters && deltaRK === 0 && deltaCK === 0) continue;
    const findOpts = {
      ...deps.findPlacementOpts,
      snapshotBoard4: t.board,
    };
    const cand = scorePlacementOnBoard(deps.catalog, wordLc, t.board, findOpts, {
      gridSize,
      usePathCatalog: deps.usePathCatalog,
      allowPlacementDfsFallback: deps.allowPlacementDfsFallback,
    });
    if (!cand) continue;

    let score = cand.score;
    if (
      deps.shiftUseLookaheadHeuristics &&
      deps.nextWordLc &&
      String(deps.nextWordLc).length > 0
    ) {
      const boardAfter = simulateChronoToEndBoard(t.board, [
        { word: wordLc, pathFlat: cand.pathFlat },
      ]);
      const laSeed = 42;
      const probeNext = findRandomLegalPathFlat(deps.nextWordLc, {
        seed: laSeed,
        maxAttempts: deps.lookaheadAttempts ?? 220,
        snapshotBoard4: boardAfter,
        preferStraight: findOpts.preferStraight !== false,
        requireUniqueSpelling: false,
        preferSnapshotLetterMatch: deps.lookaheadSnapBias === true,
        pathRotationQuarterTurnsCW: 0,
        ...(deps.pathSearchExploreBudget !== undefined
          ? { maxExploreNodes: deps.pathSearchExploreBudget }
          : {}),
        ...(deps.uniqCountExploreBudget !== undefined
          ? { uniqCountExploreBudget: deps.uniqCountExploreBudget }
          : {}),
      });
      if (!probeNext) score -= 45000;
      else score += 12000;
    }

    if (
      best === null ||
      score > best.score ||
      (score === best.score && t.rowK < best.rowK) ||
      (score === best.score && t.rowK === best.rowK && t.colK < best.colK)
    ) {
      best = {
        rowK: t.rowK,
        colK: t.colK,
        board: applyTorusTranslation(board, deltaRK, deltaCK, n),
        seq: torusTranslationShiftSeq(deltaRK, deltaCK, n),
        pathFlat: cand.pathFlat,
        minTiles: cand.minTiles,
        reuse: cand.reuse,
        score,
        source: cand.source,
      };
    }
  }

  if (!best) return null;
  return {
    winningBoard: best.board,
    pathFlat: best.pathFlat,
    minTiles: best.minTiles,
    reuse: best.reuse,
    shiftSeq: best.seq,
    score: best.score,
    rowK: best.rowK,
    colK: best.colK,
    targetRowK: best.rowK,
    targetColK: best.colK,
    source: best.source,
    translationCount: translations.length,
  };
}
