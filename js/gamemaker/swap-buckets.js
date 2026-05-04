import { wordToTileLabelSequence } from "../board-logic.js";

/** Lowercase a–z pool tokens only. */
const POOL_SWAP_WORD_RE = /^[a-z]+$/;

/**
 * Dedup key across the pool builder: `min_tiles|reuse|wordTotal` (numeric fields).
 *
 * @param {number} minTiles
 * @param {number} reuse
 * @param {number} wordTotal
 */
function bucketKeyForWordStats(minTiles, reuse, wordTotal) {
  return `${Number(minTiles)}|${Number(reuse)}|${Number(wordTotal)}`;
}

/** @typedef {{ word: string; min_tiles: number; reuse: number; wordTotal: number }} SwapBucketEntry */
export function buildSwapBucketsByStats(lists) {
  /** @type {Map<string, Map<string, { word: string, min_tiles: number, reuse: number, wordTotal: number }>>} */
  const outer = new Map();
  for (const row of lists) {
    const words = /** @type {{ words?: unknown[] }} */ (row).words;
    if (!Array.isArray(words)) continue;
    for (const raw of words) {
      const e =
        /** @type {{ word?: string, min_tiles?: number, reuse?: number, wordTotal?: number }} */ (
          raw
        );
      const w = String(e.word || "").toLowerCase();
      if (!POOL_SWAP_WORD_RE.test(w)) continue;
      const key = bucketKeyForWordStats(
        Number(e.min_tiles),
        Number(e.reuse),
        Number(e.wordTotal)
      );
      if (!outer.has(key)) outer.set(key, new Map());
      const inner = outer.get(key);
      if (!inner.has(w)) {
        inner.set(w, {
          word: w,
          min_tiles: Number(e.min_tiles),
          reuse: Number(e.reuse),
          wordTotal: Number(e.wordTotal),
        });
      }
    }
  }
  /** @type {Map<string, Array<{ word: string, min_tiles: number, reuse: number, wordTotal: number }>>} */
  const out = new Map();
  for (const [k, inner] of outer) {
    out.set(k, [...inner.values()]);
  }
  return out;
}

/**
 * Alternate pool words for the toolbar slot at `placementIndex`: same statistical
 * row as `currentWordsDesc[idx]` (`min_tiles`, `reuse`, `wordTotal` exactly),
 * lowercase a–z, not the current spelling nor any other spelling on this list.
 */
export function collectSwapAlternatesMatchingStats(
  buckets,
  currentWordsDesc,
  placementIndex
) {
  if (!(buckets instanceof Map) || buckets.size === 0) return [];
  const list = Array.isArray(currentWordsDesc) ? currentWordsDesc : [];
  const idx = placementIndex;
  const at = /** @type {SwapBucketEntry | undefined} */ (list[idx]);
  if (!at || idx < 0 || idx >= list.length) return [];

  const curLc = String(at.word || "").toLowerCase();
  const glyphsAtLen = wordToTileLabelSequence(curLc).length;
  const minTilesAt = Number(at.min_tiles);
  const reuseAt = Number(at.reuse);
  const totalAt = Number(at.wordTotal);
  if (
    !Number.isFinite(minTilesAt) ||
    !Number.isFinite(reuseAt) ||
    !Number.isFinite(totalAt)
  )
    return [];

  const key = bucketKeyForWordStats(minTilesAt, reuseAt, totalAt);
  const arr = buckets.get(key);
  if (!Array.isArray(arr) || arr.length === 0) return [];

  /** @type {Set<string>} */
  const blocked = new Set();
  for (let i = 0; i < list.length; i++) {
    const lc = String(
      /** @type {{ word?: unknown }} */ (list[i]).word || ""
    ).toLowerCase();
    if (lc && i !== idx) blocked.add(lc);
  }

  /** @type {SwapBucketEntry[]} */
  const alternates = [];
  for (const x of arr) {
    const w = String(x.word || "").toLowerCase();
    if (!POOL_SWAP_WORD_RE.test(w)) continue;
    if (w === curLc || blocked.has(w)) continue;
    if (wordToTileLabelSequence(w).length !== glyphsAtLen) continue;
    alternates.push(x);
  }
  return alternates.sort((a, b) => a.word.localeCompare(b.word));
}
