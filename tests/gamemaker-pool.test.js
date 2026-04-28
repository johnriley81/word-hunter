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
import { PERFECT_HUNT_WORD_COUNT, NEXT_LETTERS_LEN } from "../js/config.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pathPool = join(root, "text/gamemaker/pregen/puzzle-pool.json");
const pathRec = join(root, "text/gamemaker/pregen/word-recognizability.json");

const RECOG_MIN_EXPECTED = 7;

function assertPoolRankOrder(assertMod, prev, p, rankReuse, reuseTarget) {
  if (rankReuse === "max") {
    assertMod.ok(
      (prev.reuseSum ?? 0) >= (p.reuseSum ?? 0),
      "reuseSum descending first: " + p.id
    );
    if ((prev.reuseSum ?? 0) === (p.reuseSum ?? 0)) {
      assertMod.ok(
        prev.letterUnionSize >= p.letterUnionSize,
        "letterUnionSize descending when reuseSum ties: " + p.id
      );
      if (prev.letterUnionSize === p.letterUnionSize) {
        assertMod.ok(
          prev.puzzleWordTotalSum >= p.puzzleWordTotalSum,
          "puzzleWordTotalSum descending when reuse and letterUnion tie: " + p.id
        );
      }
    }
  } else if (rankReuse === "near") {
    const dPrev = Math.abs((prev.reuseSum ?? 0) - reuseTarget);
    const d = Math.abs((p.reuseSum ?? 0) - reuseTarget);
    assertMod.ok(d >= dPrev, "|Σreuse − target| non-decreasing first: " + p.id);
    if (d === dPrev) {
      assertMod.ok(
        prev.letterUnionSize >= p.letterUnionSize,
        "letterUnionSize descending when reuse-distance ties: " + p.id
      );
      if (prev.letterUnionSize === p.letterUnionSize) {
        assertMod.ok(
          prev.puzzleWordTotalSum >= p.puzzleWordTotalSum,
          "puzzleWordTotalSum descending when reuse-dist and letterUnion tie: " + p.id
        );
      }
    }
  } else {
    assertMod.ok(
      prev.letterUnionSize >= p.letterUnionSize,
      "letterUnionSize sorted descending (reuse ignored): " + p.id
    );
    if (prev.letterUnionSize === p.letterUnionSize) {
      assertMod.ok(
        prev.puzzleWordTotalSum >= p.puzzleWordTotalSum,
        "puzzleWordTotalSum descending when letterUnion ties: " + p.id
      );
    }
  }
}

test("puzzle pool: 1000 entries, seven words each, Σ min_tiles = 66, Σreuse-led rank, opener labels, scores order", () => {
  const raw = readFileSync(pathPool, "utf8");
  const j = JSON.parse(raw);
  assert.equal(j.version, 1);
  const rankReuse = j.poolReuseRank || "max";
  const reuseTarget =
    typeof j.poolReuseSumTarget === "number" ? j.poolReuseSumTarget : 10;
  const openingExpect = typeof j.openingLabelLen === "number" ? j.openingLabelLen : 8;
  assert.ok(
    openingExpect >= 8 && openingExpect <= 16,
    "openingLabelLen sane (or default 8 for legacy pools)"
  );
  assert.ok(Array.isArray(j.puzzles));
  assert.equal(j.puzzles.length, 1000);

  const recJson = JSON.parse(readFileSync(pathRec, "utf8"));
  const recMap = recJson.words;
  assert.ok(recMap && typeof recMap === "object");

  for (let pi = 0; pi < j.puzzles.length; pi++) {
    const p = j.puzzles[pi];
    const prev = pi > 0 ? j.puzzles[pi - 1] : null;
    if (prev) {
      assertPoolRankOrder(assert, prev, p, rankReuse, reuseTarget);
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
    assert.equal(
      sumMin,
      NEXT_LETTERS_LEN,
      "replacement cells sum (Σ min_tiles): " + p.id
    );
    assert.equal(typeof p.reuseSum, "number", "puzzle exposes reuseSum: " + p.id);
    let reuseTotal = 0;
    for (const w of byScore) reuseTotal += w.reuse || 0;
    assert.equal(
      reuseTotal,
      p.reuseSum,
      "Σ reuse across words matches puzzle: " + p.id
    );
    assert.equal(
      wordToTileLabelSequence(byScore[0].word).length,
      openingExpect,
      "lowest-score word opener label count matches pool opener rule: " + p.id
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
        labels.length >= 8 && labels.length <= 16,
        "pool words use 8–16 tile labels: " + word
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
