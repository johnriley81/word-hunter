import { resolve } from "node:path";
import { comparePoolWordEntriesAscForwardExport } from "../../js/puzzle-build/pool-order.js";
import { repoRoot } from "./puzzle-build-paths.mjs";
import { loadSwapWordBucketsFromWordlist } from "./load-swap-word-buckets.mjs";
import {
  appendProblematicWordsToFile,
  loadProblematicWordsSet,
  resetProblematicWordsCacheForTests,
} from "./problematic-words.mjs";
import { resetSwapBucketsCacheForTests } from "./puzzle-build-cli.mjs";
import { substituteProblematicInPool } from "./substitute-problematic-pool.mjs";

const PUZZLE_WORDLIST_PATH = resolve(repoRoot, "text/gamemaker/puzzle-wordlist.txt");

/**
 * @param {{
 *   lastPlacementFailure?: { word?: string } | null;
 *   lastPlayPathUniqFailure?: { word?: string } | null;
 * }} diag
 * @param {Set<string>} blocked
 */
export function discoverWordsFromBuild(diag, blocked) {
  /** @type {Set<string>} */
  const found = new Set();
  const add = (w) => {
    const lc = String(w || "")
      .trim()
      .toLowerCase();
    if (/^[a-z]+$/.test(lc) && !blocked.has(lc)) found.add(lc);
  };
  add(diag.lastPlacementFailure?.word);
  add(diag.lastPlayPathUniqFailure?.word);
  return [...found];
}

export function refreshProblematicLexicon() {
  resetProblematicWordsCacheForTests();
  resetSwapBucketsCacheForTests();
  return {
    blocked: loadProblematicWordsSet(),
    buckets: loadSwapWordBucketsFromWordlist(PUZZLE_WORDLIST_PATH),
  };
}

/**
 * @param {{ words: unknown[] }} entry
 * @param {boolean} shiftOn
 */
export function wordsFromPoolEntry(entry, shiftOn) {
  /** @type {Array<{ word: string; min_tiles: number; reuse: number; wordTotal: number }>} */
  const words = entry.words.map((raw) => {
    const e =
      /** @type {{ word?: string; min_tiles?: number; reuse?: number; wordTotal?: number }} */ (
        raw
      );
    return {
      word: String(e.word || "").toLowerCase(),
      min_tiles: Number(e.min_tiles),
      reuse: Number(e.reuse),
      wordTotal: Number(e.wordTotal),
    };
  });
  return shiftOn ? words.slice().sort(comparePoolWordEntriesAscForwardExport) : words;
}

/**
 * @param {Array<{ word: string; min_tiles: number; reuse: number; wordTotal: number }>} poolSeven
 * @param {Set<string>} blocked
 * @param {Map<string, unknown>} buckets
 * @param {number} seed
 * @param {{ enabled?: boolean; logPrefix?: string; verbose?: boolean }} [opts]
 */
export function substituteBlockedInPool(poolSeven, blocked, buckets, seed, opts = {}) {
  if (opts.enabled === false || !(buckets instanceof Map) || buckets.size === 0) {
    return poolSeven;
  }
  const sub = substituteProblematicInPool(poolSeven, blocked, buckets, seed);
  if (!sub.ok) return poolSeven;
  if (opts.verbose && sub.substitutions.length && opts.logPrefix) {
    for (const s of sub.substitutions) {
      console.error(`${opts.logPrefix}: ${s.from} → ${s.to} (hunt ${s.slot})`);
    }
  }
  return sub.pool;
}

/**
 * @param {Parameters<typeof discoverWordsFromBuild>[0]} diag
 * @param {Set<string>} blocked
 * @param {string} logPrefix
 */
export function discoverAndRefresh(diag, blocked, logPrefix) {
  const discovered = discoverWordsFromBuild(diag, blocked);
  if (!discovered.length) return null;
  const added = appendProblematicWordsToFile(discovered);
  if (!added.length) return null;
  console.error(`${logPrefix}: blocklist +${added.join(", ")}`);
  return refreshProblematicLexicon();
}
