import test from "node:test";
import assert from "node:assert/strict";
import {
  applyAuthoringShiftSeqInPlace,
  cloneGameGrid,
  puzzleHasAuthoringShifts,
} from "../js/perfect-hunt-shifts.js";
import { boardLetterKey } from "../js/puzzle-export-sim/torus-translations.js";
import { applyShiftSeqToBoard } from "../js/puzzle-export-sim/shift-starter.js";

test("puzzleHasAuthoringShifts", () => {
  assert.equal(puzzleHasAuthoringShifts(null), false);
  assert.equal(puzzleHasAuthoringShifts([[], []]), false);
  assert.equal(puzzleHasAuthoringShifts([[], [{ t: "col", s: 1 }]]), true);
});

test("applyAuthoringShiftSeqInPlace matches shift-starter replay", () => {
  const board = [
    ["a", "b", "c", "d"],
    ["e", "f", "g", "h"],
    ["i", "j", "k", "l"],
    ["m", "n", "o", "p"],
  ];
  const viaStarter = applyShiftSeqToBoard(board, [{ t: "col", s: 2 }], 4);
  const live = cloneGameGrid(board);
  applyAuthoringShiftSeqInPlace(live, [{ t: "col", s: 2 }], {}, 4);
  assert.equal(boardLetterKey(viaStarter), boardLetterKey(live));
});
