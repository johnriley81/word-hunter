/**
 * Load precomputed path-signature catalog and pick geometric variants at build time.
 *
 * Placement is overlay-only: snapshot letters never gate legality. All catalog variants are
 * scored (blank-first on snapshot + optional hub rank) across four rotations; best wins.
 */

import { readFileSync } from "node:fs";
import { GRID_SIZE } from "../../config.js";
import {
  normalizeTileText,
  wordToTileLabelSequence,
  minUniqueTilesForReuseRule,
} from "../../board-logic.js";
import { rotatePathFlatQuarterTurnsCW } from "../grid-symmetry.js";
import {
  PLACEMENT_HUB_RANK_WEIGHT,
  isPathGamemakerLegal,
  pickBestPathFlatByCoverRotations,
} from "../word-path-search.js";

/** @typedef {{ pathFlat: number[]; symmetry?: { quartersCW?: number }; witness?: Record<string, unknown> }} PathCatalogVariant */

/**
 * @typedef {{
 *   version: number;
 *   gridSize: number;
 *   signatures: Record<string, {
 *     labelRank: number[];
 *     reuseSlots: Array<[number, number]>;
 *     stats: { length: number; minTiles: number; reuse: number };
 *     tileSlotDisplay?: string;
 *     variants: PathCatalogVariant[];
 *     representativeWord?: string;
 *   }>;
 *   wordToSigKey: Record<string, string>;
 * }} PathSignatureCatalogJson
 */

/**
 * @param {number[]} pathFlat
 * @param {number} [gridSize]
 * @returns {string}
 */
export function canonicalPathFlatKey(pathFlat, gridSize = GRID_SIZE) {
  /** @type {string[]} */
  const keys = [];
  for (let q = 0; q < 4; q++) {
    keys.push(
      rotatePathFlatQuarterTurnsCW(pathFlat, /** @type {0|1|2|3} */ (q), gridSize).join(
        ","
      )
    );
  }
  keys.sort();
  return keys[0];
}

/**
 * @param {string} filePath
 * @returns {PathSignatureCatalogJson}
 */
export function loadPathSignatureCatalog(filePath) {
  const raw = readFileSync(filePath, "utf8");
  const j = JSON.parse(raw);
  if (!j || typeof j !== "object" || !j.signatures || !j.wordToSigKey) {
    throw new Error("invalid path signature catalog: " + filePath);
  }
  return /** @type {PathSignatureCatalogJson} */ (j);
}

/**
 * Strict snapshot letter match (tools/tests only — not used for overlay catalog pick).
 *
 * @param {string[][]} snapshotBoard4
 * @param {number[]} pathFlat
 * @param {string[]} glyphs normalized tile labels
 * @param {number} gridSize
 */
export function pathFitsSnapshotBoard(
  snapshotBoard4,
  pathFlat,
  glyphs,
  gridSize = GRID_SIZE
) {
  const n = gridSize;
  const board = snapshotBoard4;
  if (!board || board.length !== n) return false;
  for (let i = 0; i < pathFlat.length; i++) {
    const f = pathFlat[i];
    if (f < 0 || f >= n * n) return false;
    const r = Math.floor(f / n);
    const c = f % n;
    const raw = board[r] != null ? String(board[r][c] ?? "").trim() : "";
    if (raw === "") continue;
    const have = normalizeTileText(raw);
    const need = normalizeTileText(glyphs[i]);
    if (have !== need) return false;
  }
  return true;
}

/**
 * @param {string} word lowercase
 * @param {number[]} pathFlat
 * @param {{ gridSize?: number }} [opts]
 */
export function catalogVariantAcceptable(word, pathFlat, opts = {}) {
  const gridSize = opts.gridSize ?? GRID_SIZE;
  const lc = String(word || "").toLowerCase();
  const legal = isPathGamemakerLegal(lc, pathFlat, { gridSize });
  if (!legal.ok) return { ok: false, reason: legal.reason };
  return { ok: true, reason: "ok" };
}

/**
 * @param {PathSignatureCatalogJson} catalog
 * @param {string} word lowercase
 * @returns {PathCatalogVariant[]}
 */
export function variantsForWord(catalog, word) {
  const lc = String(word || "").toLowerCase();
  const sigKey = catalog.wordToSigKey[lc];
  if (!sigKey) return [];
  const entry = catalog.signatures[sigKey];
  if (!entry || !Array.isArray(entry.variants)) return [];
  return entry.variants.slice();
}

/**
 * Score every catalog variant × four rotations; pick highest placement rank (overlay — snapshot is score-only).
 *
 * @param {PathSignatureCatalogJson} catalog
 * @param {string} word
 * @param {string[][] | null | undefined} snapshotBoard4
 * @param {{ gridSize?: number; hubRankWeight?: number }} [opts]
 * @returns {{ pathFlat: number[]; source: "catalog"; quartersCW: number; score: number } | null}
 */
export function pickCatalogPathFlat(catalog, word, snapshotBoard4, opts = {}) {
  const gridSize = opts.gridSize ?? GRID_SIZE;
  const hubRankWeight =
    typeof opts.hubRankWeight === "number" && Number.isFinite(opts.hubRankWeight)
      ? opts.hubRankWeight
      : PLACEMENT_HUB_RANK_WEIGHT;
  const lc = String(word || "").toLowerCase();
  const vars = variantsForWord(catalog, lc);
  if (vars.length === 0) return null;

  /** @type {{ pathFlat: number[]; quartersCW: number; score: number; variantIx: number } | null} */
  let bestOverall = null;
  for (let variantIx = 0; variantIx < vars.length; variantIx++) {
    const base = vars[variantIx]?.pathFlat;
    if (!Array.isArray(base) || base.length === 0) continue;
    const best = pickBestPathFlatByCoverRotations(lc, base, snapshotBoard4, {
      gridSize,
      hubRankWeight,
    });
    if (!best) continue;
    if (
      bestOverall === null ||
      best.score > bestOverall.score ||
      (best.score === bestOverall.score && best.quartersCW < bestOverall.quartersCW) ||
      (best.score === bestOverall.score &&
        best.quartersCW === bestOverall.quartersCW &&
        variantIx < bestOverall.variantIx)
    ) {
      bestOverall = { ...best, variantIx };
    }
  }
  if (!bestOverall) return null;
  return {
    pathFlat: bestOverall.pathFlat,
    source: "catalog",
    quartersCW: bestOverall.quartersCW,
    score: bestOverall.score,
    variantIx: bestOverall.variantIx,
  };
}

/**
 * Best catalog placement on one board (variants × four rotations).
 *
 * @param {PathSignatureCatalogJson} catalog
 * @param {string} word
 * @param {string[][] | null | undefined} snapshotBoard4
 * @param {{ gridSize?: number; hubRankWeight?: number }} [opts]
 * @returns {{ pathFlat: number[]; minTiles: number; reuse: number; score: number; quartersCW: number; variantIx: number; source: "catalog" } | null}
 */
export function scoreBestCatalogPlacement(catalog, word, snapshotBoard4, opts = {}) {
  const picked = pickCatalogPathFlat(catalog, word, snapshotBoard4, opts);
  if (!picked) return null;
  const lc = String(word || "").toLowerCase();
  const glyphs = wordToTileLabelSequence(lc);
  const minTiles = minUniqueTilesForReuseRule(glyphs);
  const variantIx = picked.variantIx;
  return {
    pathFlat: picked.pathFlat,
    minTiles,
    reuse: glyphs.length - minTiles,
    score: picked.score,
    quartersCW: picked.quartersCW,
    variantIx,
    source: "catalog",
  };
}
