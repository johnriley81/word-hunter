/**
 * Puzzle-pool entry ordering for gamemaker. Three comparators differ by **tie-break when `wordTotal`
 * is equal** — they are not simple negations of each other.
 *
 * | Comparator | Primary key | Tie-break |
 * |------------|-------------|-----------|
 * | `comparePoolWordEntriesDesc` | Higher `wordTotal` first | `word` ascending |
 * | `comparePoolWordEntriesAscForwardExport` | Lower `wordTotal` first | `word` ascending |
 * | `comparePoolWordEntriesDescSackRefillOrder` | Higher `wordTotal` first | `word` descending |
 *
 * The sack ordering Must match `buildNextLettersFromCoveredInBuildOrder` iteration direction so the
 * lowest-score hunt word’s refills sit at the FIFO head — see `puzzle-export-sim.js`.
 */

/** @typedef {{ word?: string; wordTotal?: number }} PoolWordEntry */

/**
 * Gamemaker list display / WORD swap tail: descending score, then word ascending.
 * @param {PoolWordEntry} a
 * @param {PoolWordEntry} b
 */
export function comparePoolWordEntriesDesc(a, b) {
  const da = Number(a.wordTotal) || 0;
  const db = Number(b.wordTotal) || 0;
  if (da !== db) return db - da;
  return String(a.word || "").localeCompare(String(b.word || ""));
}

/**
 * Forward perfect-hunt export word order (ascending score); ties broken by word ascending.
 * @param {PoolWordEntry} a
 * @param {PoolWordEntry} b
 */
export function comparePoolWordEntriesAscForwardExport(a, b) {
  const da = Number(a.wordTotal) || 0;
  const db = Number(b.wordTotal) || 0;
  if (da !== db) return da - db;
  return String(a.word || "").localeCompare(String(b.word || ""));
}

/**
 * Order plays when stacking `covered` into `next_letters`: descending score; ties **word descending**
 * (differs from list sort tie-break).
 * @param {PoolWordEntry} a
 * @param {PoolWordEntry} b
 */
export function comparePoolWordEntriesDescSackRefillOrder(a, b) {
  const da = Number(a.wordTotal) || 0;
  const db = Number(b.wordTotal) || 0;
  if (da !== db) return db - da;
  return String(b.word || "").localeCompare(String(a.word || ""));
}
