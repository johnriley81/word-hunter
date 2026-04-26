import test from "node:test";
import assert from "node:assert/strict";
import {
  verifyForwardPuzzle,
  verifyForwardPuzzleIfCoveredChain50,
  buildNext50FromCoveredInBuildOrder,
  recomputeCoveredChronFromHarness,
  coveredFirstVisitCountTotal,
} from "../js/puzzle-export-sim.js";

test("verifyForwardPuzzle requires 50 next letters", () => {
  const g = [
    ["a", "a", "a", "a"],
    ["a", "a", "a", "a"],
    ["a", "a", "a", "a"],
    ["a", "a", "a", "a"],
  ];
  const r = verifyForwardPuzzle(
    g,
    ["a", "a"],
    ["ab", "ab", "ab", "ab", "ab", "ab", "ab", "ab", "ab"],
    [
      [0, 1],
      [0, 1],
      [0, 1],
      [0, 1],
      [0, 1],
      [0, 1],
      [0, 1],
      [0, 1],
      [0, 1],
    ]
  );
  assert.equal(r.ok, false);
  assert(r.reason.includes("50"));
});

test("buildNext50FromCoveredInBuildOrder prepends each play’s covered in chron build order", () => {
  const plays = [{ covered: ["a", "b"] }, { covered: ["c"] }];
  const n = buildNext50FromCoveredInBuildOrder(plays, { fillEmpty: "x" });
  assert.equal(n[0], "c");
  assert.equal(n[1], "a");
  assert(n.length === 50);
});

test("coveredFirstVisitCountTotal sums per-play covered lengths", () => {
  const plays = [{ covered: ["a", "b", "c"] }, { covered: ["d", "e", "f", "g"] }];
  assert.equal(coveredFirstVisitCountTotal(plays), 7);
});

test("verifyForwardPuzzleIfCoveredChain50 skips per-word sim when chain length != 50", () => {
  const g = [
    ["a", "a", "a", "a"],
    ["a", "a", "a", "a"],
    ["a", "a", "a", "a"],
    ["a", "a", "a", "a"],
  ];
  const next50 = Array(50).fill("a");
  const words9 = Array(9).fill("aa");
  const paths9 = Array(9)
    .fill(null)
    .map(() => [0, 1]);
  const plays66 = [
    { covered: new Array(7).fill("x") },
    { covered: new Array(7).fill("x") },
    { covered: new Array(7).fill("x") },
    { covered: new Array(8).fill("x") },
    { covered: new Array(8).fill("x") },
    { covered: new Array(8).fill("x") },
    { covered: new Array(7).fill("x") },
    { covered: new Array(7).fill("x") },
    { covered: new Array(7).fill("x") },
  ];
  assert.equal(coveredFirstVisitCountTotal(plays66), 66);
  const r = verifyForwardPuzzleIfCoveredChain50(g, next50, words9, paths9, plays66);
  assert.equal(r.ok, false);
  assert(r.reason.includes("covered_chain_length: 66"));
  assert(r.reason.includes("need 50"));
});

test("recomputeCoveredChronFromHarness matches per-play first-visit letters", () => {
  const ed = [
    ["x", "x", "x", "x"],
    ["x", "x", "x", "x"],
    ["x", "x", "x", "x"],
    ["x", "x", "x", "x"],
  ];
  const plays = [{ word: "at", pathFlat: [0, 1] }];
  const r = recomputeCoveredChronFromHarness(ed, plays);
  assert.equal(r[0].covered[0], "x");
  assert.equal(r[0].covered[1], "x");
  assert(r[0].min_tiles != null);
});
