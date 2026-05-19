import test from "node:test";
import assert from "node:assert/strict";
import {
  boardLetterKey,
  enumerateTorusTranslationBoards,
  torusTranslationReplayMatches,
  applyTorusTranslation,
  pickBestPlacementAcrossTorusTranslations,
} from "../js/puzzle-export-sim/torus-translations.js";
import { applyShiftSeqToBoard } from "../js/puzzle-export-sim/shift-starter.js";
import { GRID_SIZE } from "../js/config.js";

test("enumerateTorusTranslationBoards returns one entry for empty board", () => {
  const empty = Array.from({ length: GRID_SIZE }, () =>
    Array.from({ length: GRID_SIZE }, () => "")
  );
  const list = enumerateTorusTranslationBoards(empty);
  assert.equal(list.length, 1);
  assert.equal(list[0].rowK, 0);
  assert.equal(list[0].colK, 0);
  assert.equal(list[0].seq.length, 0);
});

test("enumerateTorusTranslationBoards yields 16 distinct keys for asymmetric pattern", () => {
  const board = [
    ["a", "b", "c", "d"],
    ["e", "f", "g", "h"],
    ["i", "j", "k", "l"],
    ["m", "n", "o", "p"],
  ];
  const list = enumerateTorusTranslationBoards(board);
  assert.equal(list.length, 16);
  const keys = new Set(list.map((x) => x.key));
  assert.equal(keys.size, 16);
});

test("pickBestPlacementAcrossTorusTranslations requireNonIdentityRotation skips zero delta", () => {
  const board = [
    ["a", "b", "c", "d"],
    ["e", "f", "g", "h"],
    ["i", "j", "k", "l"],
    ["m", "n", "o", "p"],
  ];
  const r0 = pickBestPlacementAcrossTorusTranslations(board, "abcdefghijklmnop", {
    catalog: null,
    requireNonIdentityRotation: true,
    homeRowK: 0,
    homeColK: 0,
    findPlacementOpts: {
      seed: 1,
      maxAttempts: 1,
      preferStraight: true,
      requireUniqueSpelling: false,
    },
  });
  if (r0) {
    assert.ok(r0.shiftSeq.length > 0, "expected a non-empty shift from home");
  }
  const r1 = pickBestPlacementAcrossTorusTranslations(
    applyTorusTranslation(board, 2, 1),
    "abcdefghijklmnop",
    {
      catalog: null,
      requireNonIdentityRotation: true,
      homeRowK: 2,
      homeColK: 1,
      findPlacementOpts: {
        seed: 1,
        maxAttempts: 1,
        preferStraight: true,
        requireUniqueSpelling: false,
      },
    }
  );
  if (r1) {
    assert.ok(
      r1.shiftSeq.length > 0,
      "expected a non-empty delta even when already at home orientation"
    );
  }
});

test("torusTranslationReplayMatches applyShiftSeqToBoard", () => {
  const board = [
    ["a", "b", "c", "d"],
    ["e", "f", "g", "h"],
    ["i", "j", "k", "l"],
    ["m", "n", "o", "p"],
  ];
  for (const entry of enumerateTorusTranslationBoards(board)) {
    assert.ok(
      torusTranslationReplayMatches(board, entry),
      `replay failed rowK=${entry.rowK} colK=${entry.colK}`
    );
    const manual = applyTorusTranslation(board, entry.rowK, entry.colK);
    assert.equal(boardLetterKey(manual), entry.key);
    const viaSeq = applyShiftSeqToBoard(board, entry.seq);
    assert.equal(boardLetterKey(viaSeq), entry.key);
  }
});
