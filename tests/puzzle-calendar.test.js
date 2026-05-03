import test from "node:test";
import assert from "node:assert/strict";
import {
  calculatePuzzleDayIndex,
  puzzleDayIndexAt,
  puzzleListIndex,
} from "../js/puzzle-calendar.js";

test("calculatePuzzleDayIndex returns non-negative integer", () => {
  const d = calculatePuzzleDayIndex();
  assert.equal(Number.isInteger(d), true);
  assert.ok(d >= 0);
});

test("puzzleDayIndexAt: epoch day and day after", () => {
  const epoch = new Date(2026, 3, 26);
  assert.equal(puzzleDayIndexAt(new Date(2026, 3, 26, 8, 0), epoch), 0);
  assert.equal(puzzleDayIndexAt(new Date(2026, 3, 26, 23, 59), epoch), 0);
  assert.equal(puzzleDayIndexAt(new Date(2026, 3, 27, 0, 0), epoch), 1);
});

test("puzzle list index math: negative day offset wraps", () => {
  const epoch = new Date(2026, 3, 26);
  assert.equal(puzzleDayIndexAt(new Date(2026, 3, 25), epoch), -1);
  const i = -1;
  const n = 4;
  assert.equal(((i % n) + n) % n, 3);
});

test("puzzleListIndex is in range for current date", () => {
  const ix = puzzleListIndex(4);
  assert.ok(ix >= 0 && ix < 4);
});
