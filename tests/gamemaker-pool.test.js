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
import { PERFECT_HUNT_WORD_COUNT } from "../js/config.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pathPool = join(root, "text/gamemaker/pregen/puzzle-pool.json");

test("puzzle pool: 1000 entries, six words each, Σ min_tiles = 50, opener 8 tile labels", () => {
  const raw = readFileSync(pathPool, "utf8");
  const j = JSON.parse(raw);
  assert.equal(j.version, 1);
  assert.ok(Array.isArray(j.puzzles));
  assert.equal(j.puzzles.length, 1000);

  for (const p of j.puzzles) {
    assert.ok(p.id && typeof p.id === "string");
    assert.equal(p.words.length, PERFECT_HUNT_WORD_COUNT);
    const byScore = p.words
      .slice()
      .sort(
        (a, b) =>
          (a.wordTotal || 0) - (b.wordTotal || 0) ||
          String(a.word || "").localeCompare(String(b.word || ""))
      );
    let sumMin = 0;
    for (let i = 0; i < byScore.length; i++) {
      const w = byScore[i];
      sumMin += w.min_tiles;
      if (i > 0) {
        assert.ok(
          w.wordTotal > byScore[i - 1].wordTotal,
          "strict ascending wordTotal: " + w.word
        );
      }
    }
    assert.equal(sumMin, 50, "replacement cells sum: " + p.id);
    assert.equal(
      wordToTileLabelSequence(byScore[0].word).length,
      8,
      "lowest-score word has 8 tile labels: " + p.id
    );

    for (const w of p.words) {
      const word = String(w.word || "").toLowerCase();
      const labels = wordToTileLabelSequence(word);
      assert.ok(
        labels.length >= 8 && labels.length <= 14,
        "pool words use 8–14 tile labels: " + word
      );
      const st = wordReuseStats(labels);
      const { wordTotal } = getLiveWordScoreBreakdownFromLabels(labels);
      assert.equal(w.min_tiles, st.minTiles, word);
      assert.equal(w.reuse, st.reuse, word);
      assert.equal(w.wordTotal, wordTotal, word);
    }
  }
});
