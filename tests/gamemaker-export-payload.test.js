import test from "node:test";
import assert from "node:assert/strict";
import { buildGamemakerDictExportPayload } from "../js/gamemaker/build-export-payload.js";

test("buildGamemakerDictExportPayload returns null when play count mismatches wordCount", () => {
  assert.equal(
    buildGamemakerDictExportPayload({
      gameBoard: [
        ["a", "b", "c", "d"],
        ["e", "f", "g", "h"],
        ["i", "j", "k", "l"],
        ["m", "n", "o", "p"],
      ],
      buildPlaysChron: [],
      currentWords: [{ word: "only", wordTotal: 1 }],
      wordCount: 7,
    }),
    null
  );
});

test("buildGamemakerDictExportPayload orders perfect_hunt ascending by wordTotal then word", () => {
  /** Minimal chron: one tile per word so paths stay on-board for replay checks when glyphs length 1 fails — need valid lengths */

  const board = [
    ["a", "b", "c", "d"],
    ["e", "f", "g", "h"],
    ["i", "j", "k", "l"],
    ["m", "n", "o", "p"],
  ];

  const sevenWords = [
    { word: "memo", wordTotal: 400 },
    { word: "able", wordTotal: 100 },
    { word: "cube", wordTotal: 300 },
    { word: "apex", wordTotal: 200 },
    { word: "exit", wordTotal: 250 },
    { word: "quad", wordTotal: 150 },
    { word: "gulp", wordTotal: 175 },
  ];

  const pathFlatByWord = [
    [0, 1, 2, 3],
    [4, 5, 6, 7],
    [8, 9, 10, 11],
    [12, 13, 14, 15],
    [0, 4, 8, 12],
    [1, 5, 9, 13],
    [2, 6, 10, 14],
  ];

  const playsChron = sevenWords.map((row, idx) => ({
    word: row.word,
    pathFlat: pathFlatByWord[idx],
    min_tiles: 4,
    covered: ["", "", "", ""],
  }));

  const payload = buildGamemakerDictExportPayload({
    gameBoard: board,
    buildPlaysChron: playsChron,
    currentWords: sevenWords.slice(),
    wordCount: 7,
  });

  assert.ok(payload);
  assert.deepStrictEqual(payload.starting_grids[0], board);
  assert.equal(payload.perfect_hunt_starter_tor_neighbors?.length, 28);
  assert.deepEqual(payload.perfect_hunt, [
    "able",
    "quad",
    "gulp",
    "apex",
    "exit",
    "cube",
    "memo",
  ]);
});
