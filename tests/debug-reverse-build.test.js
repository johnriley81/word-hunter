import test from "node:test";
import assert from "node:assert/strict";
import {
  wordToTileStrings,
  cloneBoard,
  cloneQueue,
  isPathAdjacentAndUnique,
  validateReverseAuthoringDragPath,
  reverseAuthoringReuseByWordIndex,
  reverseAuthoringNewPickWordIndices,
  expandReverseAuthoringPickButtonsToPath,
  forwardPlayOneWord,
  reverseUnplayOneWord,
  prependCoverOrder,
  extractSlotRepeatSpecsFromDoc,
  pickWordsFromMaterialized,
  sortEntriesForReverseUnplay,
} from "../js/debug-reverse-build.js";
import { GRID_SIZE } from "../js/config.js";

test("wordToTileStrings handles qu and lone q", () => {
  assert.deepEqual(wordToTileStrings("quit"), ["qu", "i", "t"]);
  assert.deepEqual(wordToTileStrings("q"), ["qu"]);
});

test("isPathAdjacentAndUnique rejects duplicate cell", () => {
  assert.equal(
    isPathAdjacentAndUnique([
      { r: 0, c: 0 },
      { r: 0, c: 1 },
      { r: 0, c: 0 },
    ]),
    false,
  );
});

test("validateReverseAuthoringDragPath rejects reuse gap < 3", () => {
  const path = [
    { r: 0, c: 0 },
    { r: 0, c: 1 },
    { r: 0, c: 0 },
  ];
  assert.equal(validateReverseAuthoringDragPath(path, "aaa"), false);
});

test("validateReverseAuthoringDragPath allows same cell with gap >= 3 and matching tiles", () => {
  const path = [
    { r: 0, c: 0 },
    { r: 0, c: 1 },
    { r: 0, c: 2 },
    { r: 1, c: 2 },
    { r: 1, c: 1 },
    { r: 0, c: 0 },
  ];
  assert.equal(validateReverseAuthoringDragPath(path, "aaaaaa"), true);
});

test("validateReverseAuthoringDragPath rejects same cell when letters differ", () => {
  const path = [
    { r: 0, c: 0 },
    { r: 0, c: 1 },
    { r: 0, c: 2 },
    { r: 1, c: 2 },
    { r: 1, c: 1 },
    { r: 0, c: 0 },
  ];
  assert.equal(validateReverseAuthoringDragPath(path, "aaaaab"), false);
});

test("reverseAuthoring: one go-back reuse for completely → 9 new picks", () => {
  const w = "completely";
  assert.equal(wordToTileStrings(w).length, 10);
  const reuse = reverseAuthoringReuseByWordIndex(w);
  assert.equal(reuse.size, 1);
  assert.equal(reuse.get(8), 4);
  const newIdx = reverseAuthoringNewPickWordIndices(w);
  assert.equal(newIdx.length, 9);
  assert.equal(newIdx[8], 9);
});

test("expandReverseAuthoringPickButtonsToPath duplicates cell for reuse", () => {
  const word = "abca";
  assert.deepEqual(wordToTileStrings(word), ["a", "b", "c", "a"]);
  const newIdx = reverseAuthoringNewPickWordIndices(word);
  assert.deepEqual(newIdx, [0, 1, 2]);
  const children = Array.from({ length: 16 }, () => ({}));
  const pickButtons = [];
  const coords = [
    { r: 0, c: 0 },
    { r: 1, c: 0 },
    { r: 1, c: 1 },
  ];
  for (let i = 0; i < coords.length; i++) {
    const ix = coords[i].r * GRID_SIZE + coords[i].c;
    const btn = {};
    children[ix] = btn;
    pickButtons.push(btn);
  }
  const gridEl = { children };
  const path = expandReverseAuthoringPickButtonsToPath(
    pickButtons,
    gridEl,
    word,
    GRID_SIZE,
  );
  assert.ok(path);
  assert.equal(path.length, 4);
  assert.deepEqual(path[0], { r: 0, c: 0 });
  assert.deepEqual(path[3], { r: 0, c: 0 });
  assert.ok(validateReverseAuthoringDragPath(path, word));
});

test("forward then reverse restores board and queue prefix", () => {
  const n = GRID_SIZE;
  const board = Array.from({ length: n }, () => Array(n).fill(""));
  const path = [
    { r: 0, c: 0 },
    { r: 0, c: 1 },
    { r: 1, c: 1 },
  ];
  board[0][0] = "c";
  board[0][1] = "a";
  board[1][1] = "t";
  const queue = ["x", "y", "z", "tail"];
  const b0 = cloneBoard(board);
  const q0 = cloneQueue(queue);

  forwardPlayOneWord(board, queue, "cat", path);
  assert.deepEqual(
    path.map(({ r, c }) => board[r][c]),
    ["x", "y", "z"],
  );
  assert.deepEqual(queue, ["tail"]);

  const out = reverseUnplayOneWord(board, queue, "cat", path);
  assert.deepEqual(out.board, b0);
  assert.deepEqual(out.queue, q0);
  assert.deepEqual(out.coverLettersThisStep, ["x", "y", "z"]);
});

test("prependCoverOrder builds forward consumption order", () => {
  const acc = [];
  prependCoverOrder(acc, ["a", "b"]);
  prependCoverOrder(acc, ["c"]);
  assert.deepEqual(acc, ["c", "a", "b"]);
});

test("extractSlotRepeatSpecsFromDoc progressive 1267 ladder sums to 14", () => {
  const doc = {
    progressive_counts: {
      slots: [
        { slot_index: 0, length: 7, min_distinct: 7 },
        { slot_index: 1, length: 7, min_distinct: 6 },
        { slot_index: 2, length: 7, min_distinct: 5 },
        { slot_index: 3, length: 7, min_distinct: 5 },
        { slot_index: 4, length: 8, min_distinct: 8 },
        { slot_index: 5, length: 8, min_distinct: 7 },
        { slot_index: 6, length: 8, min_distinct: 6 },
        { slot_index: 7, length: 9, min_distinct: 8 },
        { slot_index: 8, length: 9, min_distinct: 7 },
        { slot_index: 9, length: 10, min_distinct: 7 },
      ],
    },
  };
  const specs = extractSlotRepeatSpecsFromDoc(doc);
  assert.ok(specs);
  const sum = specs.reduce((a, b) => a + b, 0);
  assert.equal(sum, 14);
  assert.deepEqual(specs, [0, 1, 2, 2, 0, 1, 2, 1, 2, 3]);
});

test("pickWordsFromMaterialized and sortEntriesForReverseUnplay", () => {
  const doc = {
    slots: [
      { slot_index: 0, length: 3, min_distinct: 2 },
      { slot_index: 1, length: 4, min_distinct: 4 },
    ],
    combinations_with_words: [
      {
        scores: [77, 200],
        words_per_slot: [["aa"], ["bb"]],
      },
    ],
  };
  const picked = pickWordsFromMaterialized(doc, 0);
  assert.equal(picked[0].repeatTiles, 1);
  assert.equal(picked[1].repeatTiles, 0);
  const sorted = sortEntriesForReverseUnplay(picked);
  assert.equal(sorted[0].word, "bb");
  assert.equal(sorted[0].score, 200);
  assert.equal(sorted[0].repeatTiles, 0);
  assert.equal(sorted[1].word, "aa");
  assert.equal(sorted[1].repeatTiles, 1);
});
