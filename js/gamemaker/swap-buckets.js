/** @param {unknown[]} lists */
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
      if (!/^[a-z]+$/.test(w)) continue;
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
