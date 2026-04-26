import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  wordToTileLabelSequence,
  wordReuseStats,
  getLiveWordScoreBreakdownFromLabels,
} from "../js/board-logic.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pathPool = join(root, "text/gamemaker/pregen/puzzle-pool.json");

test("puzzle pool: 1000 entries, 9 words each, scores match board-logic", () => {
  const raw = readFileSync(pathPool, "utf8");
  const j = JSON.parse(raw);
  assert.equal(j.version, 1);
  assert.ok(Array.isArray(j.puzzles));
  assert.equal(j.puzzles.length, 1000);

  for (const p of j.puzzles) {
    assert.ok(p.id && typeof p.id === "string");
    assert.equal(p.words.length, 9);
    for (const w of p.words) {
      const word = String(w.word || "").toLowerCase();
      const labels = wordToTileLabelSequence(word);
      const st = wordReuseStats(labels);
      const { wordTotal } = getLiveWordScoreBreakdownFromLabels(labels);
      assert.equal(w.min_tiles, st.minTiles, word);
      assert.equal(w.reuse, st.reuse, word);
      assert.equal(w.wordTotal, wordTotal, word);
    }
  }
});
