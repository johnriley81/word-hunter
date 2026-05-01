import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeTileText,
  getLetterWeight,
  getLiveWordScoreBreakdownFromLabels,
  wordToTileLabelSequence,
  minUniqueTilesForReuseRule,
  wordReuseStats,
  applyColumnShiftInPlace,
  applyRowShiftInPlace,
  shiftCommitStepsFromAxisMag,
  computeShiftSnapPlan,
  buildPerfectHuntMetadata,
  computePerfectHuntStarterFlat,
  puzzleRowPerfectHuntStarterHints,
  exportedOrthoNeighborSigMatches,
  normalizedOrthoNeighborsAtFlat,
} from "../js/board-logic.js";
import {
  GRID_SIZE,
  SHIFT_STRIDE_FIRST_FRAC,
  CHOIR_PLAYBACK_RATES_FOR_RANK,
  PERFECT_HUNT_WORD_COUNT,
  getWordSuccessShowMessageTotalMs,
} from "../js/config.js";

test("word success showMessage total duration is reasonable for tile counts", () => {
  assert.ok(getWordSuccessShowMessageTotalMs(4) > 500);
  assert.ok(getWordSuccessShowMessageTotalMs(7) > getWordSuccessShowMessageTotalMs(4));
});

test("normalizeTileText trims and maps q to qu", () => {
  assert.equal(normalizeTileText(" Q "), "qu");
  assert.equal(normalizeTileText("a"), "a");
});

test("wordToTileLabelSequence maps qu to one label", () => {
  assert.deepEqual(wordToTileLabelSequence("quip"), ["qu", "i", "p"]);
  assert.deepEqual(wordToTileLabelSequence("aardvark"), [
    "a",
    "a",
    "r",
    "d",
    "v",
    "a",
    "r",
    "k",
  ]);
});

test("minUniqueTilesForReuseRule: two distinct between same labels", () => {
  assert.equal(minUniqueTilesForReuseRule("happy"), 5);
  assert.equal(minUniqueTilesForReuseRule("dudes"), 5);
  assert.equal(wordReuseStats("binging").minTiles, 4);
  assert.equal(wordReuseStats("binging").reuse, 3);
  assert.equal(minUniqueTilesForReuseRule("aardvark"), 6);
});

test("getLiveWordScoreBreakdownFromLabels multiplies sum by string length", () => {
  const { letterSum, length, wordTotal } = getLiveWordScoreBreakdownFromLabels([
    "a",
    "b",
  ]);
  assert.equal(letterSum, getLetterWeight("a") + getLetterWeight("b"));
  assert.equal(length, 2);
  assert.equal(wordTotal, letterSum * length);
});

test("applyColumnShiftInPlace rotates columns", () => {
  const n = 2;
  const board = [
    ["a", "b"],
    ["c", "d"],
  ];
  applyColumnShiftInPlace(board, 1, n);
  assert.deepEqual(board, [
    ["b", "a"],
    ["d", "c"],
  ]);
});

test("applyRowShiftInPlace rotates rows", () => {
  const n = 2;
  const board = [
    ["a", "b"],
    ["c", "d"],
  ];
  applyRowShiftInPlace(board, 1, n);
  assert.deepEqual(board, [
    ["c", "d"],
    ["a", "b"],
  ]);
});

test("shiftCommitStepsFromAxisMag respects stride and first fraction", () => {
  const n = GRID_SIZE;
  const stride = 80;
  const first = stride * SHIFT_STRIDE_FIRST_FRAC;
  assert.equal(shiftCommitStepsFromAxisMag(0, stride, n), 0);
  assert.equal(shiftCommitStepsFromAxisMag(first - 1, stride, n), 0);
  assert.equal(shiftCommitStepsFromAxisMag(first + 0.001, stride, n), 1);
});

test("computeShiftSnapPlan returns target transform", () => {
  const mDrag = { tw: 40, th: 40, gap: 10 };
  const { targetTransform, skipSnapAnimate } = computeShiftSnapPlan(
    true,
    50,
    1,
    mDrag,
    "translate(0px, 0px)"
  );
  assert.match(targetTransform, /translate\(/);
  assert.equal(typeof skipSnapAnimate, "boolean");
});

test("buildPerfectHuntMetadata: targetSum matches board-logic wordTotals", () => {
  const hunt = ["aa", "zzz", "no"];
  const rates = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const meta = buildPerfectHuntMetadata(hunt, rates);
  assert.ok(meta);
  const rows = hunt.map((word) => {
    const w = word.toLowerCase();
    const { wordTotal } = getLiveWordScoreBreakdownFromLabels(
      wordToTileLabelSequence(w)
    );
    return { word: w, wordTotal };
  });
  rows.sort((a, b) => {
    if (a.wordTotal !== b.wordTotal) return a.wordTotal - b.wordTotal;
    return a.word.localeCompare(b.word);
  });
  const expectedSum = rows.reduce((s, r) => s + r.wordTotal, 0);
  assert.equal(meta.targetSum, expectedSum);
  for (let i = 0; i < rows.length; i++) {
    assert.equal(meta.choirRateByWord.get(rows[i].word), rates[i]);
  }
});

test("buildPerfectHuntMetadata: ties break by word string", () => {
  const hunt = ["ba", "ab"];
  const meta = buildPerfectHuntMetadata(hunt, [1.1, 1.2]);
  assert.ok(meta);
  assert.equal(meta.choirRateByWord.get("ab"), 1.1);
  assert.equal(meta.choirRateByWord.get("ba"), 1.2);
});

test("buildPerfectHuntMetadata: maps PERFECT_HUNT_WORD_COUNT words to choir rates", () => {
  assert.ok(CHOIR_PLAYBACK_RATES_FOR_RANK.length >= PERFECT_HUNT_WORD_COUNT);
  const hunt = Array.from({ length: PERFECT_HUNT_WORD_COUNT }, (_, i) =>
    "a".repeat(i + 3)
  );
  const meta = buildPerfectHuntMetadata(hunt, CHOIR_PLAYBACK_RATES_FOR_RANK);
  assert.ok(meta);
  assert.equal(meta.choirRateByWord.size, PERFECT_HUNT_WORD_COUNT);
});

test("exportedOrthoNeighborSigMatches: one vertical + one horizontal sufficient", () => {
  const actual = normalizedOrthoNeighborsAtFlat(
    [
      ["x", "y"],
      ["a", "b"],
    ].map((r) => r.map((c) => String(c))),
    /* flat */ 1,
    2
  );
  assert.equal(
    exportedOrthoNeighborSigMatches(actual, {
      n: "wrong",
      s: "b",
      w: "wrong",
      e: null,
    }),
    true
  );
  assert.equal(
    exportedOrthoNeighborSigMatches(actual, { n: null, s: "bogus", w: "y" }),
    false
  );
});

test("Perfect Hunt starter: row-major ambiguity resolved by exported flat then neighbor sig", () => {
  const board = [
    ["b", "x", "z", "z"],
    ["x", "a", "z", "z"],
    ["z", "z", "a", "z"],
    ["z", "z", "z", "z"],
  ].map((r) => r.map((c) => String(c)));
  const hunt = ["ab"];
  const base = computePerfectHuntStarterFlat(board, hunt, 0, true, 4, null);
  assert.equal(base, 5);
  const byFlat = computePerfectHuntStarterFlat(
    board,
    hunt,
    0,
    true,
    4,
    puzzleRowPerfectHuntStarterHints([10], null)
  );
  assert.equal(byFlat, 10);
  /* Full four-way sig would match both `a` tiles under relaxed ortho rules; one vertical + one horizontal pin the lower-right `a` only. */
  const sigOnly = puzzleRowPerfectHuntStarterHints(null, [{ n: "z", e: "z" }]);
  const byOrtho = computePerfectHuntStarterFlat(board, hunt, 0, true, 4, sigOnly);
  assert.equal(byOrtho, 10);
});

test("Perfect Hunt starter: invalid flat hint with no neighbor sig yields null (no legacy scan)", () => {
  const board = [
    ["b", "x", "z", "z"],
    ["x", "a", "z", "z"],
    ["z", "z", "x", "z"],
    ["z", "z", "z", "z"],
  ].map((r) => r.map((c) => String(c)));
  const hunt = ["ab"];
  const wrongFlat = puzzleRowPerfectHuntStarterHints([10], null);
  const got = computePerfectHuntStarterFlat(board, hunt, 0, true, 4, wrongFlat);
  assert.equal(got, null);
});
