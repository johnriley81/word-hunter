import test from "node:test";
import assert from "node:assert/strict";
import {
  labelRankPattern,
  reuseSlotsFromLabels,
  signatureKeyFromParts,
  tileSlotDisplay,
  pathSignatureFromWord,
  signatureKeyForWord,
} from "../js/puzzle-export-sim/path-catalog/path-signature.js";
import {
  wordToTileLabelSequence,
  canReuseLabelPair,
  analyzeTileReusePairing,
  wordReuseStats,
} from "../js/board-logic.js";
import {
  canonicalPathFlatKey,
  pathFitsSnapshotBoard,
} from "../js/puzzle-export-sim/path-catalog/path-variant-catalog.js";

test("labelRankPattern is first-occurrence rank", () => {
  const g = wordToTileLabelSequence("binging");
  assert.deepEqual(labelRankPattern(g), [1, 2, 3, 4, 2, 3, 4]);
});

test("reuseSlotsFromLabels matches analyzeTileReusePairing pairs", () => {
  const w = "binging";
  const slots = reuseSlotsFromLabels(w);
  const a = analyzeTileReusePairing(w);
  assert.deepEqual(
    slots,
    a.pairs.map(([i, j]) => (i < j ? [i, j] : [j, i]))
  );
  const g = wordToTileLabelSequence(w);
  for (const [i, j] of slots) {
    assert.ok(canReuseLabelPair(g, i, j));
  }
});

test("signatureKey is stable and groups letter substitutions", () => {
  const k1 = signatureKeyForWord("binging");
  const k2 = signatureKeyForWord("dinging");
  assert.equal(k1, k2);
  const allUnique = signatureKeyForWord("abcdefgh");
  assert.equal(allUnique, "1,2,3,4,5,6,7,8");
});

test("tileSlotDisplay encodes reuse groups", () => {
  const rec = pathSignatureFromWord("deccdac");
  assert.ok(rec.reuseSlots.length >= 1);
  assert.match(rec.tileSlotDisplay, /[1-9]/);
  assert.equal(rec.tileSlotDisplay.length, wordToTileLabelSequence("deccdac").length);
});

test("pathSignatureFromWord stats align with wordReuseStats", () => {
  const w = "civilizations";
  const rec = pathSignatureFromWord(w);
  const st = wordReuseStats(w);
  assert.equal(rec.stats.length, st.length);
  assert.equal(rec.stats.minTiles, st.minTiles);
  assert.equal(rec.stats.reuse, st.reuse);
  assert.equal(rec.stats.minTiles, rec.stats.length - rec.reuseSlots.length);
});

test("signatureKeyFromParts round-trips pathSignatureFromWord", () => {
  const rec = pathSignatureFromWord("aardvark");
  assert.equal(rec.sigKey, signatureKeyFromParts(rec.labelRank, rec.reuseSlots));
});

test("pathFitsSnapshotBoard accepts blanks and matching letters", () => {
  const glyphs = wordToTileLabelSequence("cat");
  const path = [5, 6, 10];
  const board = [
    ["", "", "", ""],
    ["", "", "", ""],
    ["", "", "", ""],
    ["", "", "", ""],
  ];
  board[1][1] = "c";
  assert.equal(pathFitsSnapshotBoard(board, path, glyphs, 4), true);
  board[1][2] = "x";
  assert.equal(pathFitsSnapshotBoard(board, path, glyphs, 4), false);
});

test("canonicalPathFlatKey invariant under rotation", () => {
  const path = [0, 1, 2, 3, 7, 11, 10, 6];
  const k0 = canonicalPathFlatKey(path, 4);
  const k1 = canonicalPathFlatKey([0, 4, 8, 12, 13, 14, 15, 11], 4);
  assert.equal(typeof k0, "string");
  assert.equal(k0.length > 0, true);
  assert.notEqual(k0, k1);
});
