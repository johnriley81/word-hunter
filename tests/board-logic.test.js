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
