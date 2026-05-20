import { readFileSync } from "node:fs";
import { buildSwapBucketsByStats } from "../../js/puzzle-build/swap-buckets.js";
import { filterWordsExcludingProblematic } from "../../js/puzzle-build/problematic-words.js";
import { loadProblematicWordsSet } from "./problematic-words.mjs";
import { wordEntryFromWord } from "./word-pool-entry.mjs";

/** @param {string} wordlistPath */
export function loadSwapWordBucketsFromWordlist(wordlistPath) {
  const raw = readFileSync(wordlistPath, "utf8");
  const blocked = loadProblematicWordsSet();
  /** @type {string[]} */
  const lines = [];
  for (const line of raw.split(/\n/)) {
    const w = line.trim().toLowerCase();
    if (/^[a-z]+$/.test(w)) lines.push(w);
  }
  const words = filterWordsExcludingProblematic(lines, blocked).map((w) =>
    wordEntryFromWord(w)
  );
  return buildSwapBucketsByStats([{ words }]);
}
