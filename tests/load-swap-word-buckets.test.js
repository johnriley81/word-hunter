import test from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSwapWordBucketsFromWordlist } from "../scripts/lib/load-swap-word-buckets.mjs";
import { collectSwapAlternatesMatchingStats } from "../js/puzzle-build/swap-buckets.js";
import { wordEntryFromWord } from "../scripts/lib/word-pool-entry.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const wordlist = resolve(repoRoot, "text/gamemaker/puzzle-wordlist.txt");

test("puzzle-wordlist loads swap buckets with same-length alternates", () => {
  const buckets = loadSwapWordBucketsFromWordlist(wordlist);
  assert.ok(buckets.size > 100);
  const entry = wordEntryFromWord("thousand");
  const list = [entry];
  const alts = collectSwapAlternatesMatchingStats(buckets, list, 0);
  assert.ok(
    alts.length === 0 || alts.every((a) => a.word.length === entry.word.length)
  );
});
