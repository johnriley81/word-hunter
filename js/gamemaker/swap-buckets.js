import { wordToTileLabelSequence } from "../board-logic.js";

/** Lowercase a–z pool tokens only. */
const POOL_SWAP_WORD_RE = /^[a-z]+$/;

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
      const key = `${Number(e.min_tiles)}|${Number(e.reuse)}|${Number(e.wordTotal)}`;
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
 * Alternate pool words at `placementIndex`: not used on other toolbar slots;
 * Σ in [neighborBelow, neighborAbove] for list sorted by `comparePoolWordEntriesDesc`.
 */
export function collectSwapAlternatesBetweenNeighborScores(
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
  /** @type {Set<string>} */
  const blocked = new Set();
  for (let i = 0; i < list.length; i++) {
    const lc = String(
      /** @type {{ word?: unknown }} */ (list[i]).word || ""
    ).toLowerCase();
    if (lc && i !== idx) blocked.add(lc);
  }

  /** @param {number} i */
  const totAt = (i) => {
    const x = Number(/** @type {{ wordTotal?: unknown }} */ (list[i])?.wordTotal);
    return Number.isFinite(x) ? x : null;
  };

  let lowInclusive = idx < list.length - 1 ? totAt(idx + 1) : null;
  let highInclusive = idx > 0 ? totAt(idx - 1) : null;

  if (lowInclusive != null && highInclusive != null && lowInclusive > highInclusive) {
    const tmp = lowInclusive;
    lowInclusive = highInclusive;
    highInclusive = tmp;
  }

  /** @type {Map<string, SwapBucketEntry>} */
  const uniq = new Map();
  for (const arr of buckets.values()) {
    for (const x of arr) {
      const w = String(x.word || "").toLowerCase();
      if (!POOL_SWAP_WORD_RE.test(w)) continue;
      if (w === curLc || blocked.has(w)) continue;
      const s = Number(x.wordTotal);
      if (!Number.isFinite(s)) continue;
      if (Number(x.min_tiles) !== minTilesAt) continue;
      if (Number(x.reuse) !== reuseAt) continue;
      if (wordToTileLabelSequence(w).length !== glyphsAtLen) continue;
      if (lowInclusive != null && s < lowInclusive) continue;
      if (highInclusive != null && s > highInclusive) continue;
      if (!uniq.has(w)) uniq.set(w, x);
    }
  }
  return [...uniq.values()].sort((a, b) => a.word.localeCompare(b.word));
}
