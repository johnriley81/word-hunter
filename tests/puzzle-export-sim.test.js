import test from "node:test";
import assert from "node:assert/strict";
import {
  verifyForwardPuzzle,
  verifyForwardPuzzleIfCoveredChain,
  buildNextLettersFromCoveredInBuildOrder,
  recomputeCoveredChronFromHarness,
  coveredFirstVisitCountTotal,
  stripTrailingEmptyNextLetters,
  omitEmptyNextLetterSlots,
  canonicalNextLettersFromJsonArray,
  computePerfectHuntStarterHints,
  replacementTilesFirstVisitFlatOrder,
  tryApplyFifoLetterRefillsAfterWordSubmission,
} from "../js/puzzle-export-sim.js";
import { NEXT_LETTERS_LEN } from "../js/config.js";

test("omitEmptyNextLetterSlots drops all empty string entries", () => {
  assert.deepEqual(omitEmptyNextLetterSlots(["a", "", "b", ""]), ["a", "b"]);
});

test("canonicalNextLettersFromJsonArray preserves internal empty peel slots", () => {
  const raw = ["A", "", "b", "", "z"];
  const q = canonicalNextLettersFromJsonArray(raw);
  assert.equal(q[0], "a");
  assert.equal(q[1], "");
  assert.equal(q[2], "b");
  assert.equal(q[3], "");
  assert.equal(q[4], "z");
  assert.equal(q.length, NEXT_LETTERS_LEN);
});

test("canonicalNextLettersFromJsonArray strips trailing empties before pad", () => {
  const trailing = [...Array.from({ length: 5 }, () => ""), "", "", ""];
  const q = canonicalNextLettersFromJsonArray(["a", "", "b"].concat(trailing));
  assert.deepEqual(q.slice(0, 3), ["a", "", "b"]);
  assert.equal(q.length, NEXT_LETTERS_LEN);
});

test("verifyForwardPuzzle rejects too-long next_letters", () => {
  const g = [
    ["a", "a", "a", "a"],
    ["a", "a", "a", "a"],
    ["a", "a", "a", "a"],
    ["a", "a", "a", "a"],
  ];
  const r = verifyForwardPuzzle(
    g,
    Array(NEXT_LETTERS_LEN + 3).fill("a"),
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
  assert.ok(r.reason.includes("at most"));
});

test("verifyForwardPuzzle strips compact sack to full length internally", () => {
  const plays = [{ covered: ["z"] }];
  assert.equal(
    stripTrailingEmptyNextLetters(buildNextLettersFromCoveredInBuildOrder(plays))
      .length,
    1
  );
});

test("buildNextLettersFromCoveredInBuildOrder prepends each play’s covered in iteration order", () => {
  const plays = [{ covered: ["a", "b"] }, { covered: ["c"] }];
  const n = buildNextLettersFromCoveredInBuildOrder(plays, { fillEmpty: "x" });
  assert.equal(n[0], "c");
  assert.equal(n[1], "a");
  assert.equal(n.length, NEXT_LETTERS_LEN);
});

test("buildNextLettersFromCoveredInBuildOrder pads with empty string when fillEmpty omitted", () => {
  const plays = [{ covered: ["z"] }];
  const n = buildNextLettersFromCoveredInBuildOrder(plays);
  assert.equal(n[0], "z");
  assert.equal(n[NEXT_LETTERS_LEN - 1], "");
  assert.ok(n.slice(1).every((ch) => ch === ""));
});

test("coveredFirstVisitCountTotal sums per-play covered lengths", () => {
  const plays = [{ covered: ["a", "b", "c"] }, { covered: ["d", "e", "f", "g"] }];
  assert.equal(coveredFirstVisitCountTotal(plays), 7);
});

test("verifyForwardPuzzleIfCoveredChain skips per-word sim when chain length != NEXT_LETTERS_LEN", () => {
  const g = [
    ["a", "a", "a", "a"],
    ["a", "a", "a", "a"],
    ["a", "a", "a", "a"],
    ["a", "a", "a", "a"],
  ];
  const nextFull = Array(NEXT_LETTERS_LEN).fill("a");
  const words9 = Array(9).fill("aa");
  const paths9 = Array(9)
    .fill(null)
    .map(() => [0, 1]);
  const playsMismatch = [
    { covered: new Array(7).fill("x") },
    { covered: new Array(7).fill("x") },
    { covered: new Array(7).fill("x") },
    { covered: new Array(8).fill("x") },
    { covered: new Array(8).fill("x") },
    { covered: new Array(8).fill("x") },
    { covered: new Array(7).fill("x") },
    { covered: new Array(7).fill("x") },
    { covered: new Array(8).fill("x") },
  ];
  assert.equal(coveredFirstVisitCountTotal(playsMismatch), 67);
  const r = verifyForwardPuzzleIfCoveredChain(
    g,
    nextFull,
    words9,
    paths9,
    playsMismatch
  );
  assert.equal(r.ok, false);
  assert(r.reason.includes("covered_chain_length: 67"));
  assert(r.reason.includes("need " + NEXT_LETTERS_LEN));
});

test("replacementTilesFirstVisitFlatOrder preserves first-visit sequence across revisits", () => {
  assert.deepEqual(replacementTilesFirstVisitFlatOrder([14, 7, 14, 3]), [14, 7, 3]);
});

test("tryApplyFifoLetterRefillsAfterWordSubmission consumes sack FIFO matching refill-slot order", () => {
  const board = Array.from({ length: 4 }, () =>
    Array.from({ length: 4 }, () => "z")
  ).map((row) => row.slice());
  board[0][0] = "s";
  board[0][1] = "t";
  const fifo = ["a", "b"];
  assert.equal(
    tryApplyFifoLetterRefillsAfterWordSubmission(board, fifo, [0, 1], 4),
    true
  );
  assert.deepEqual(board[0].slice(0, 2), ["a", "b"]);
  assert.equal(fifo.length, 0);
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

test("computePerfectHuntStarterHints returns null when sack is not fully drained", () => {
  const grid0 = [
    ["a", "b", "c", "d"],
    ["e", "f", "g", "h"],
    ["i", "j", "k", "l"],
    ["m", "n", "o", "p"],
  ].map((r) => r.map((c) => c.toLowerCase()));
  assert.equal(
    computePerfectHuntStarterHints(grid0, ["z", "y"], ["ab"], [[0, 1]]),
    null
  );
});
