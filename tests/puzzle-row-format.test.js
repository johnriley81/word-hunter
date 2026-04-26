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
  extractJsonObjectSlices,
} from "../js/puzzle-row-format.js";

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
    next_letters: Array(50).fill("a"),
    perfect_hunt: ["a", "b", "c", "d", "e", "f", "g", "h", "i"],
  });
  assert.equal(row.starting_grid?.[0]?.[0], "a");
});

test("parsePuzzlesFileText reads repo text/puzzles.txt", () => {
  const text = readFileSync(join(root, "text/puzzles.txt"), "utf8");
  const puzzles = parsePuzzlesFileText(text);
  assert.equal(puzzles.length, 1);
  assert.equal(puzzles[0].starting_grid[0][0], "n");
  assert.equal(puzzles[0].next_letters.length, 50);
  assert.equal(puzzles[0].perfect_hunt[0], "thorns");
  assert.equal(puzzles[0].perfect_hunt[8], "splendidnesses");
});

test("dictExport round-trip multiline block", () => {
  const d = {
    starting_grids: [
      [
        ["h", "r", "e", "i"],
        ["t", "r", "i", "n"],
        ["s", "u", "a", "t"],
        ["c", "i", "s", "r"],
      ],
    ],
    next_letters: Array(50).fill("x"),
    perfect_hunt: ["a", "b", "c", "d", "e", "f", "g", "h", "i"],
  };
  const blob = serializePuzzleRow(dictExportToCanonicalRow(d));
  assert.match(blob, /^\{\n/);
  assert.match(blob, /\n\}$/);
  const again = parsePuzzlesFileText(blob);
  assert.equal(again.length, 1);
  assert.deepEqual(again[0].perfect_hunt, d.perfect_hunt);
});

test("parsePuzzlesFileText accepts legacy single-line JSON object", () => {
  const one =
    '{"starting_grid":[["a","a","a","a"],["a","a","a","a"],["a","a","a","a"],["a","a","a","a"]],"next_letters":' +
    JSON.stringify(Array(50).fill("z")) +
    ',"perfect_hunt":["a","b","c","d","e","f","g","h","i"]}';
  const puzzles = parsePuzzlesFileText(one);
  assert.equal(puzzles.length, 1);
  assert.equal(puzzles[0].starting_grid[0][0], "a");
});

test("extractJsonObjectSlices finds two concatenated blocks", () => {
  const a =
    '{"starting_grid":[["a","a","a","a"],["a","a","a","a"],["a","a","a","a"],["a","a","a","a"]],"next_letters":' +
    JSON.stringify(Array(50).fill("1")) +
    ',"perfect_hunt":["a","b","c","d","e","f","g","h","i"]}';
  const b =
    '{"starting_grid":[["b","b","b","b"],["b","b","b","b"],["b","b","b","b"],["b","b","b","b"]],"next_letters":' +
    JSON.stringify(Array(50).fill("2")) +
    ',"perfect_hunt":["a","b","c","d","e","f","g","h","i"]}';
  const slices = extractJsonObjectSlices(" \n" + a + "\n\n" + b + "\n");
  assert.equal(slices.length, 2);
});
