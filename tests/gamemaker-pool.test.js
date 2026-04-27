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
const pathRec = join(root, "text/gamemaker/pregen/word-recognizability.json");

/** Default in generate-puzzle-pool.mjs; keep test in sync for regression. */
const RECOG_MIN_EXPECTED = 8;

test("puzzle pool: 1000 entries, six words each, Σ min_tiles = 50, opener 8 tile labels, scores high→low in file", () => {
  const raw = readFileSync(pathPool, "utf8");
  const j = JSON.parse(raw);
  assert.equal(j.version, 1);
  assert.ok(Array.isArray(j.puzzles));
  assert.equal(j.puzzles.length, 1000);

  const recJson = JSON.parse(readFileSync(pathRec, "utf8"));
  const recMap = recJson.words;
  assert.ok(recMap && typeof recMap === "object");

  for (let pi = 0; pi < j.puzzles.length; pi++) {
    const p = j.puzzles[pi];
    const prev = pi > 0 ? j.puzzles[pi - 1] : null;
    if (prev) {
      assert.ok(
        p.letterUnionSize <= prev.letterUnionSize,
        "letterUnionSize sorted descending: " + p.id
      );
      if (p.letterUnionSize === prev.letterUnionSize) {
        assert.ok(
          p.puzzleWordTotalSum <= prev.puzzleWordTotalSum,
          "puzzleWordTotalSum descending within same letterUnionSize: " + p.id
        );
      }
    }
    assert.ok(
      typeof p.letterUnionSize === "number" &&
        p.letterUnionSize >= 1 &&
        p.letterUnionSize <= 26,
      "letterUnionSize in [1,26]: " + p.id
    );
    assert.ok(
      typeof p.puzzleWordTotalSum === "number" && p.puzzleWordTotalSum > 0,
      "puzzleWordTotalSum: " + p.id
    );

    assert.ok(p.id && typeof p.id === "string");
    assert.equal(p.words.length, PERFECT_HUNT_WORD_COUNT);
    for (let wi = 1; wi < p.words.length; wi++) {
      assert.ok(
        (p.words[wi].wordTotal || 0) < (p.words[wi - 1].wordTotal || 0),
        "strict descending wordTotal in file order: " + p.id
      );
    }
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

    const sumWordTotal = byScore.reduce((s, w) => s + (w.wordTotal || 0), 0);
    assert.equal(
      p.puzzleWordTotalSum,
      sumWordTotal,
      "puzzleWordTotalSum matches words: " + p.id
    );

    for (const w of p.words) {
      const word = String(w.word || "").toLowerCase();
      const labels = wordToTileLabelSequence(word);
      assert.ok(
        labels.length >= 8 && labels.length <= 14,
        "pool words use 8–14 tile labels: " + word
      );
      const rec = recMap[word];
      assert.ok(
        typeof rec === "number" && rec >= RECOG_MIN_EXPECTED,
        "recognizability >= " + RECOG_MIN_EXPECTED + ": " + word + " got " + rec
      );
      const st = wordReuseStats(labels);
      const { wordTotal } = getLiveWordScoreBreakdownFromLabels(labels);
      assert.equal(w.min_tiles, st.minTiles, word);
      assert.equal(w.reuse, st.reuse, word);
      assert.equal(w.wordTotal, wordTotal, word);
    }
  }
});
