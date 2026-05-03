import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSwapBucketsByStats,
  collectSwapAlternatesBetweenNeighborScores,
} from "../js/gamemaker/swap-buckets.js";

/** Seven toolbar slots (high score → low); pool entries must match /^[a-z]+$/ through `buildSwapBucketsByStats`. */
const listDesc = [
  { word: "slotzro", wordTotal: 900, min_tiles: 6, reuse: 0 },
  { word: "slotone", wordTotal: 800, min_tiles: 5, reuse: 0 },
  { word: "slotabv", wordTotal: 300, min_tiles: 5, reuse: 0 },
  { word: "slotrep", wordTotal: 250, min_tiles: 5, reuse: 0 },
  { word: "slotbel", wordTotal: 200, min_tiles: 4, reuse: 0 },
  { word: "slotfiv", wordTotal: 100, min_tiles: 6, reuse: 0 },
  { word: "slotsix", wordTotal: 50, min_tiles: 3, reuse: 0 },
];

const poolExtras = [
  { word: "oktwoce", wordTotal: 280, min_tiles: 7, reuse: 0 },
  { word: "oktwoba", wordTotal: 220, min_tiles: 5, reuse: 1 },
  { word: "oktwoaa", wordTotal: 200, min_tiles: 8, reuse: 0 },
  { word: "okthree", wordTotal: 300, min_tiles: 9, reuse: 0 },
  { word: "badhigh", wordTotal: 310, min_tiles: 3, reuse: 0 },
  { word: "badlowz", wordTotal: 140, min_tiles: 3, reuse: 0 },
];

test("swap score window includes any pool Σ between neighbor scores inclusive", () => {
  const buckets = buildSwapBucketsByStats([{ words: poolExtras }]);

  /** @param {number} idx */
  const words = (idx) =>
    collectSwapAlternatesBetweenNeighborScores(buckets, listDesc, idx).map(
      (e) => e.word
    );

  const atRep = words(3);
  assert.deepEqual(
    new Set(atRep.sort()),
    new Set(["oktwoaa", "oktwoba", "oktwoce", "okthree"])
  );
});

test("top slot: no upper bound — picks pool words at least downward neighbor Σ", () => {
  const pool = [
    ...poolExtras,
    { word: "ultraxx", wordTotal: 1200, min_tiles: 4, reuse: 0 },
  ];
  const buckets = buildSwapBucketsByStats([{ words: pool }]);
  const alts = collectSwapAlternatesBetweenNeighborScores(buckets, listDesc, 0);
  assert.ok(alts.some((e) => e.word === "ultraxx"));
  assert.ok(!alts.some((e) => e.word === "badlowz"));
});

test("bottom slot: no lower bound — picks pool words at most upward neighbor Σ", () => {
  const pool = [
    ...poolExtras,
    { word: "coldzzz", wordTotal: 40, min_tiles: 3, reuse: 0 },
  ];
  const buckets = buildSwapBucketsByStats([{ words: pool }]);
  const alts = collectSwapAlternatesBetweenNeighborScores(buckets, listDesc, 6);
  assert.ok(alts.some((e) => e.word === "coldzzz"));
  assert.ok(!alts.some((e) => e.word === "ultraxx"));
});
