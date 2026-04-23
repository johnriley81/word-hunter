import test from "node:test";
import assert from "node:assert/strict";
import { calculateDiffDays } from "../js/puzzle-calendar.js";

test("calculateDiffDays returns positive integer", () => {
  const d = calculateDiffDays();
  assert.equal(Number.isInteger(d), true);
  assert.ok(d > 0);
});
