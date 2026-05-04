import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSwapBucketsByStats,
  collectSwapAlternatesMatchingStats,
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

test("alternates match exact min_tiles|reuse|wordTotal bucket; exclude current slot + other toolbar words", () => {
  const pool = [
    { word: "altrepa", wordTotal: 250, min_tiles: 5, reuse: 0 },
    { word: "altrepb", wordTotal: 250, min_tiles: 5, reuse: 0 },
    { word: "wrongsc", wordTotal: 200, min_tiles: 5, reuse: 0 },
    { word: "wrongmt", wordTotal: 250, min_tiles: 9, reuse: 0 },
  ];
  const buckets = buildSwapBucketsByStats([{ words: pool }]);
  const alts = collectSwapAlternatesMatchingStats(buckets, listDesc, 3).map(
    (e) => e.word
  );

  assert.deepEqual(new Set(alts.sort()), new Set(["altrepa", "altrepb"]));
});

test("top slot lists only alternates sharing slot’s exact Σ / min_tiles / reuse", () => {
  const pool = [
    { word: "near900", wordTotal: 850, min_tiles: 6, reuse: 0 },
    { word: "ultaaax", wordTotal: 900, min_tiles: 6, reuse: 0 },
    { word: "wrongto", wordTotal: 901, min_tiles: 6, reuse: 0 },
  ];
  const buckets = buildSwapBucketsByStats([{ words: pool }]);
  const alts = collectSwapAlternatesMatchingStats(buckets, listDesc, 0);
  assert.ok(alts.some((e) => e.word === "ultaaax"));
  assert.ok(!alts.some((e) => e.word === "near900"));
  assert.ok(!alts.some((e) => e.word === "wrongto"));
});

test("bottom slot: same triple only; rejects different Σ bucket", () => {
  const pool = [
    { word: "toocold", wordTotal: 40, min_tiles: 3, reuse: 0 },
    { word: "coldfit", wordTotal: 50, min_tiles: 3, reuse: 0 },
  ];
  const buckets = buildSwapBucketsByStats([{ words: pool }]);
  const alts = collectSwapAlternatesMatchingStats(buckets, listDesc, 6).map(
    (e) => e.word
  );
  assert.deepEqual(new Set(alts.sort()), new Set(["coldfit"]));
});
