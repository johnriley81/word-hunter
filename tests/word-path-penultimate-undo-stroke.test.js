import test from "node:test";
import assert from "node:assert/strict";
import { pathFlatConflictsPenultimateUndoStroke } from "../js/puzzle-export-sim/word-path-search.js";

test("detects alternating flat revisit ⋯A,B,A⋯ pattern", () => {
  assert.equal(pathFlatConflictsPenultimateUndoStroke([0, 1, 0]), true);
  assert.equal(pathFlatConflictsPenultimateUndoStroke([9, 5, 13, 14, 13]), true);
});

test("non-adjacent same flat is unrelated to penultimate_undo rule alone", () => {
  assert.equal(pathFlatConflictsPenultimateUndoStroke([0, 1, 2, 0]), false);
});
