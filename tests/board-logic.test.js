import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeTileText,
  getLetterWeight,
  getLiveWordScoreBreakdownFromLabels,
  applyColumnShiftInPlace,
  applyRowShiftInPlace,
  shiftCommitStepsFromAxisMag,
  computeShiftSnapPlan,
} from "../js/board-logic.js";
import { GRID_SIZE, SHIFT_STRIDE_FIRST_FRAC } from "../js/config.js";

test("normalizeTileText trims and maps q to qu", () => {
  assert.equal(normalizeTileText(" Q "), "qu");
  assert.equal(normalizeTileText("a"), "a");
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
