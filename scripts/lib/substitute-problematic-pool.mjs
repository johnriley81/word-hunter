import { collectSwapAlternatesMatchingStats } from "../../js/puzzle-build/swap-buckets.js";

/**
 * @param {Array<{ word: string; min_tiles: number; reuse: number; wordTotal: number }>} poolSeven
 * @param {Set<string>} blocked
 * @param {Map<string, Array<{ word: string; min_tiles: number; reuse: number; wordTotal: number }>>} buckets
 * @param {number} rowSeed
 */
export function substituteProblematicInPool(poolSeven, blocked, buckets, rowSeed) {
  if (!(blocked instanceof Set) || blocked.size === 0) {
    return { ok: true, pool: poolSeven.slice(), substitutions: [] };
  }
  if (!(buckets instanceof Map) || buckets.size === 0) {
    return { ok: false, slot: -1, word: "", reason: "no_swap_buckets" };
  }

  const pool = poolSeven.map((e) => ({ ...e }));
  /** @type {Array<{ slot: number; from: string; to: string }>} */
  const substitutions = [];

  for (let slot = 0; slot < pool.length; slot++) {
    const cur = pool[slot];
    if (!blocked.has(cur.word)) continue;
    const alts = collectSwapAlternatesMatchingStats(buckets, pool, slot, blocked);
    if (alts.length === 0) continue;
    const ix = ((rowSeed + slot * 31) >>> 0) % alts.length;
    const pick = alts[ix];
    substitutions.push({ slot, from: cur.word, to: pick.word });
    pool[slot] = {
      word: pick.word,
      min_tiles: pick.min_tiles,
      reuse: pick.reuse,
      wordTotal: pick.wordTotal,
    };
  }

  return { ok: true, pool, substitutions };
}
