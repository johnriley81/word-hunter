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
  assert.equal(puzzles.length, 3);
  for (const p of puzzles) {
    assert.equal(p.starting_grid.length, 4);
    assert.equal(p.next_letters.length, 50);
    assert.equal(p.perfect_hunt.length, 9);
  }
  assert.equal(puzzles[0].starting_grid[0][0], "r");
  assert.equal(puzzles[0].perfect_hunt[0], "supersaur");
  assert.equal(puzzles[1].perfect_hunt[0], "clearings");
  assert.equal(puzzles[2].perfect_hunt[0], "youngness");
});

test("dictExport round-trip one JSON line", () => {
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
  const line = serializePuzzleRow(dictExportToCanonicalRow(d));
  assert.ok(!line.includes("\n"), "single-line JSON");
  const again = parsePuzzlesFileText(line);
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

test("parsePuzzlesFileText parses multiple JSON lines", () => {
  const a =
    '{"starting_grid":[["a","a","a","a"],["a","a","a","a"],["a","a","a","a"],["a","a","a","a"]],"next_letters":' +
    JSON.stringify(Array(50).fill("1")) +
    ',"perfect_hunt":["a","b","c","d","e","f","g","h","i"]}';
  const b =
    '{"starting_grid":[["b","b","b","b"],["b","b","b","b"],["b","b","b","b"],["b","b","b","b"]],"next_letters":' +
    JSON.stringify(Array(50).fill("2")) +
    ',"perfect_hunt":["a","b","c","d","e","f","g","h","i"]}';
  const puzzles = parsePuzzlesFileText(" \n" + a + "\n\n" + b + "\n");
  assert.equal(puzzles.length, 2);
  assert.equal(puzzles[0].next_letters[0], "1");
  assert.equal(puzzles[1].next_letters[0], "2");
});
