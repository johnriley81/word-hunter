import test from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseProblematicWordsText,
  filterWordsExcludingProblematic,
  filterProblematicFromPoolLists,
} from "../js/puzzle-build/problematic-words.js";
import {
  loadProblematicWordsSet,
  resetProblematicWordsCacheForTests,
} from "../scripts/lib/problematic-words.mjs";
import { loadSwapWordBucketsFromWordlist } from "../scripts/lib/load-swap-word-buckets.mjs";
import { collectSwapAlternatesMatchingStats } from "../js/puzzle-build/swap-buckets.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("parseProblematicWordsText skips comments and blanks", () => {
  const set = parseProblematicWordsText(`
# comment
thousand
  subjectivity  # inline
`);
  assert.deepEqual([...set].sort(), ["subjectivity", "thousand"]);
});

test("loadProblematicWordsSet includes thousand", () => {
  resetProblematicWordsCacheForTests();
  const blocked = loadProblematicWordsSet();
  assert.ok(blocked.has("thousand"));
  assert.ok(blocked.has("subjectivity"));
});

test("swap buckets omit problematic words from puzzle-wordlist", () => {
  const buckets = loadSwapWordBucketsFromWordlist(
    resolve(repoRoot, "text/gamemaker/puzzle-wordlist.txt")
  );
  let foundThousand = false;
  for (const arr of buckets.values()) {
    for (const e of arr) {
      if (e.word === "thousand") foundThousand = true;
    }
  }
  assert.equal(foundThousand, false);
});

test("collectSwapAlternates excludes problematic alternates when blocked set passed", () => {
  const blocked = new Set(["altbad"]);
  const buckets = new Map([
    [
      "5|0|250",
      [
        { word: "slotrep", wordTotal: 250, min_tiles: 5, reuse: 0 },
        { word: "altrepa", wordTotal: 250, min_tiles: 5, reuse: 0 },
        { word: "altbad", wordTotal: 250, min_tiles: 5, reuse: 0 },
      ],
    ],
  ]);
  const list = [
    { word: "slotzro", wordTotal: 900, min_tiles: 6, reuse: 0 },
    { word: "slotone", wordTotal: 800, min_tiles: 5, reuse: 0 },
    { word: "slotabv", wordTotal: 300, min_tiles: 5, reuse: 0 },
    { word: "slotrep", wordTotal: 250, min_tiles: 5, reuse: 0 },
    { word: "slotbel", wordTotal: 200, min_tiles: 4, reuse: 0 },
    { word: "slotfiv", wordTotal: 100, min_tiles: 6, reuse: 0 },
    { word: "slotsix", wordTotal: 50, min_tiles: 3, reuse: 0 },
  ];
  const alts = collectSwapAlternatesMatchingStats(buckets, list, 3, blocked).map(
    (e) => e.word
  );
  assert.ok(alts.includes("altrepa"));
  assert.ok(!alts.includes("altbad"));
});

test("filterProblematicFromPoolLists strips words from pool rows", () => {
  const blocked = new Set(["thousand"]);
  const lists = filterProblematicFromPoolLists(
    [{ words: [{ word: "thousand" }, { word: "fortnight" }] }],
    blocked
  );
  assert.deepEqual(
    lists[0].words.map((e) => e.word),
    ["fortnight"]
  );
});

test("filterWordsExcludingProblematic", () => {
  const blocked = new Set(["a"]);
  assert.deepEqual(filterWordsExcludingProblematic(["a", "bb", "c"], blocked), [
    "bb",
    "c",
  ]);
});
