import test from "node:test";
import assert from "node:assert/strict";
import { substituteProblematicInPool } from "../scripts/lib/substitute-problematic-pool.mjs";

test("substituteProblematicInPool replaces blocked word with same-stats alternate", () => {
  const pool = [
    { word: "thousand", min_tiles: 6, reuse: 0, wordTotal: 900 },
    { word: "fortnight", min_tiles: 5, reuse: 0, wordTotal: 800 },
  ];
  const blocked = new Set(["thousand"]);
  const buckets = new Map([
    [
      "6|0|900",
      [
        { word: "thousand", min_tiles: 6, reuse: 0, wordTotal: 900 },
        { word: "accounts", min_tiles: 6, reuse: 0, wordTotal: 900 },
      ],
    ],
    ["5|0|800", [{ word: "fortnight", min_tiles: 5, reuse: 0, wordTotal: 800 }]],
  ]);
  const sub = substituteProblematicInPool(pool, blocked, buckets, 42);
  assert.equal(sub.ok, true);
  if (!sub.ok) return;
  assert.equal(sub.pool[0].word, "accounts");
  assert.equal(sub.substitutions[0].from, "thousand");
});
