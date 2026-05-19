/**
 * Canonical path-reuse signatures from tile-label sequences (no grid search).
 *
 * A signature captures which glyph steps may share a physical tile under the game's
 * reuse rule (`canReuseLabelPair` + maximal disjoint pairing from `board-logic.js`).
 * Many words share the same signature; geometric paths are stored separately per signature.
 */

import {
  wordToTileLabelSequence,
  analyzeTileReusePairing,
  canReuseLabelPair,
  wordReuseStats,
} from "../../board-logic.js";

/**
 * First-occurrence rank pattern for normalized tile labels (`binging` → `[1,2,3,4,2,3,4]`).
 *
 * @param {string[]} labelsNormalized
 * @returns {number[]}
 */
export function labelRankPattern(labelsNormalized) {
  const labels = labelsNormalized;
  /** @type {number[]} */
  const ranks = [];
  /** @type {Map<string, number>} */
  const first = new Map();
  let next = 1;
  for (let i = 0; i < labels.length; i++) {
    const L = labels[i];
    if (!first.has(L)) first.set(L, next++);
    ranks.push(/** @type {number} */ (first.get(L)));
  }
  return ranks;
}

/**
 * Sorted reuse endpoint pairs from canonical maximal pairing.
 *
 * @param {string[] | string} wordOrLabels
 * @returns {Array<[number, number]>}
 */
export function reuseSlotsFromLabels(wordOrLabels) {
  const { pairs } = analyzeTileReusePairing(wordOrLabels);
  /** @type {Array<[number, number]>} */
  const out = [];
  for (const [a, b] of pairs) {
    out.push(a < b ? [a, b] : [b, a]);
  }
  out.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  return out;
}

/**
 * Stable catalog key: `labelRank|i-j;…` (no `|` suffix when there are no reuse pairs).
 *
 * @param {number[]} labelRank
 * @param {Array<[number, number]>} reuseSlots
 */
export function signatureKeyFromParts(labelRank, reuseSlots) {
  const rankStr = labelRank.join(",");
  if (!reuseSlots.length) return rankStr;
  const pairStr = reuseSlots.map(([i, j]) => `${i}-${j}`).join(";");
  return `${rankStr}|${pairStr}`;
}

/**
 * Human-readable tile-slot line: paired indices share `1..k`, singletons are `.`.
 *
 * @param {number} length glyph step count
 * @param {Array<[number, number]>} reuseSlots
 */
export function tileSlotDisplay(length, reuseSlots) {
  /** @type {string[]} */
  const slot = Array.from({ length }, () => ".");
  let gid = 1;
  for (const [i, j] of reuseSlots) {
    slot[i] = String(gid);
    slot[j] = String(gid);
    gid++;
  }
  return slot.join("");
}

/**
 * @typedef {{
 *   word: string;
 *   labelsNormalized: string[];
 *   labelRank: number[];
 *   reuseSlots: Array<[number, number]>;
 *   sigKey: string;
 *   tileSlotDisplay: string;
 *   stats: { length: number; minTiles: number; reuse: number };
 * }} PathSignatureRecord
 */

/**
 * Full signature record for one lowercase word.
 *
 * @param {string} word
 * @returns {PathSignatureRecord}
 */
export function pathSignatureFromWord(word) {
  const lc = String(word || "").toLowerCase();
  const pairing = analyzeTileReusePairing(lc);
  const labelRank = labelRankPattern(pairing.labelsNormalized);
  const reuseSlots = reuseSlotsFromLabels(pairing.labelsNormalized);
  for (const [i, j] of reuseSlots) {
    if (!canReuseLabelPair(pairing.labelsNormalized, i, j)) {
      throw new Error(`reuse pair (${i},${j}) fails canReuseLabelPair for "${lc}"`);
    }
  }
  const stats = wordReuseStats(pairing.labelsNormalized);
  if (stats.minTiles !== pairing.minTiles || stats.reuse !== pairing.reuseCount) {
    throw new Error(`stats mismatch for "${lc}"`);
  }
  if (stats.minTiles !== stats.length - reuseSlots.length) {
    throw new Error(`minTiles vs reuseSlots length mismatch for "${lc}"`);
  }
  const sigKey = signatureKeyFromParts(labelRank, reuseSlots);
  return {
    word: lc,
    labelsNormalized: pairing.labelsNormalized,
    labelRank,
    reuseSlots,
    sigKey,
    tileSlotDisplay: tileSlotDisplay(pairing.labelsNormalized.length, reuseSlots),
    stats: {
      length: stats.length,
      minTiles: stats.minTiles,
      reuse: stats.reuse,
    },
  };
}

/**
 * @param {string} word
 * @returns {string}
 */
export function signatureKeyForWord(word) {
  return pathSignatureFromWord(word).sigKey;
}
