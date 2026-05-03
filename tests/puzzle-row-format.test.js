import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  normalizePuzzleRow,
  parsePuzzlesFileText,
  dictExportToCanonicalRow,
  serializePuzzleRow,
} from "../js/puzzle-row-format.js";
import { canonicalNextLettersFromJsonArray } from "../js/puzzle-export-sim.js";
import { PERFECT_HUNT_WORD_COUNT, NEXT_LETTERS_LEN } from "../js/config.js";

const HUNT_PLACEHOLDERS = Array.from({ length: PERFECT_HUNT_WORD_COUNT }, (_, i) =>
  String.fromCharCode("a".charCodeAt(0) + i)
);

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("normalizePuzzleRow accepts starting_grids[0] alias", () => {
  const row = normalizePuzzleRow({
    starting_grids: [
      [
        ["a", "b", "c", "d"],
        ["e", "f", "g", "h"],
        ["i", "j", "k", "l"],
        ["m", "n", "o", "p"],
      ],
    ],
    next_letters: Array(NEXT_LETTERS_LEN).fill("a"),
    perfect_hunt: HUNT_PLACEHOLDERS.slice(),
  });
  assert.equal(row.starting_grid?.[0]?.[0], "a");
});

test("parsePuzzlesFileText reads repo text/puzzles.txt", () => {
  const text = readFileSync(join(root, "text/puzzles.txt"), "utf8");
  const puzzles = parsePuzzlesFileText(text);
  const jsonLineCount = text
    .split("\n")
    .filter((line) => line.trim().length > 0).length;
  assert.equal(puzzles.length, jsonLineCount);
  assert.ok(puzzles.length >= 1);
  for (const p of puzzles) {
    assert.equal(p.starting_grid.length, 4);
    assert.equal(p.next_letters.length, NEXT_LETTERS_LEN);
    assert.equal(p.perfect_hunt.length, PERFECT_HUNT_WORD_COUNT);
  }
});

test("dictExport round-trip one JSON line", () => {
  const tor28 = Array.from({ length: 28 }, (_, i) => (i % 5 === 0 ? "0" : "z"));
  const d = {
    starting_grids: [
      [
        ["h", "r", "e", "i"],
        ["t", "r", "i", "n"],
        ["s", "u", "a", "t"],
        ["c", "i", "s", "r"],
      ],
    ],
    next_letters: Array(NEXT_LETTERS_LEN).fill("x"),
    perfect_hunt: HUNT_PLACEHOLDERS.slice(),
    perfect_hunt_starter_flats: [0, 1, 2, 3, 4, 5, 6],
    perfect_hunt_starter_tor_neighbors: tor28.slice(),
  };
  const line = serializePuzzleRow(dictExportToCanonicalRow(d));
  assert.ok(!line.includes("\n"), "single-line JSON");
  const again = parsePuzzlesFileText(line);
  assert.equal(again.length, 1);
  assert.deepEqual(again[0].perfect_hunt, d.perfect_hunt);
  assert.deepEqual(again[0].perfect_hunt_starter_flats, d.perfect_hunt_starter_flats);
  assert.equal(again[0].perfect_hunt_starter_tor_neighbors?.length, 28);
});

test("serializePuzzleRow round-trip preserves perfect_hunt_starter_tor_neighbors", () => {
  const tor28 = Array.from({ length: 28 }, (_, i) => (i % 5 === 0 ? "0" : "z"));
  const d = {
    starting_grids: [
      [
        ["h", "r", "e", "i"],
        ["t", "r", "i", "n"],
        ["s", "u", "a", "t"],
        ["c", "i", "s", "r"],
      ],
    ],
    next_letters: Array(NEXT_LETTERS_LEN).fill("z"),
    perfect_hunt: HUNT_PLACEHOLDERS.slice(),
    perfect_hunt_starter_tor_neighbors: tor28.slice(),
  };
  const line = serializePuzzleRow(dictExportToCanonicalRow(d));
  const again = parsePuzzlesFileText(line);
  assert.equal(again[0].perfect_hunt_starter_tor_neighbors?.length, 28);
  assert.deepStrictEqual(
    again[0].perfect_hunt_starter_tor_neighbors?.slice(0, 4),
    tor28.slice(0, 4)
  );
});

test("serializePuzzleRow round-trip preserves internal sack empty peel slots", () => {
  const sg = [
    ["a", "a", "a", "a"],
    ["b", "b", "b", "b"],
    ["c", "c", "c", "c"],
    ["d", "d", "d", "d"],
  ];
  const nk = canonicalNextLettersFromJsonArray(
    ["m", ""].concat(Array.from({ length: NEXT_LETTERS_LEN - 3 }, () => "q"))
  );
  assert.equal(nk[1], "");
  assert.equal(nk.length, NEXT_LETTERS_LEN);
  const line = serializePuzzleRow({
    starting_grid: sg,
    next_letters: nk,
    perfect_hunt: HUNT_PLACEHOLDERS.slice(),
  });
  const again = parsePuzzlesFileText(line);
  assert.equal(again.length, 1);
  assert.equal(again[0].next_letters[1], "");
});

test("parsePuzzlesFileText accepts legacy single-line JSON object", () => {
  const one =
    '{"starting_grid":[["a","a","a","a"],["a","a","a","a"],["a","a","a","a"],["a","a","a","a"]],"next_letters":' +
    JSON.stringify(Array(NEXT_LETTERS_LEN).fill("z")) +
    ',"perfect_hunt":' +
    JSON.stringify(HUNT_PLACEHOLDERS) +
    "}";
  const puzzles = parsePuzzlesFileText(one);
  assert.equal(puzzles.length, 1);
  assert.equal(puzzles[0].starting_grid[0][0], "a");
});

test("parsePuzzlesFileText parses multiple JSON lines", () => {
  const a =
    '{"starting_grid":[["a","a","a","a"],["a","a","a","a"],["a","a","a","a"],["a","a","a","a"]],"next_letters":' +
    JSON.stringify(Array(NEXT_LETTERS_LEN).fill("1")) +
    ',"perfect_hunt":' +
    JSON.stringify(HUNT_PLACEHOLDERS) +
    "}";
  const b =
    '{"starting_grid":[["b","b","b","b"],["b","b","b","b"],["b","b","b","b"],["b","b","b","b"]],"next_letters":' +
    JSON.stringify(Array(NEXT_LETTERS_LEN).fill("2")) +
    ',"perfect_hunt":' +
    JSON.stringify(HUNT_PLACEHOLDERS) +
    "}";
  const puzzles = parsePuzzlesFileText(" \n" + a + "\n\n" + b + "\n");
  assert.equal(puzzles.length, 2);
  assert.equal(puzzles[0].next_letters[0], "1");
  assert.equal(puzzles[1].next_letters[0], "2");
});
