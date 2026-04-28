import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import {
  recomputeCoveredChronFromHarness,
  buildNextLettersFromCoveredInBuildOrder,
  coveredFirstVisitCountTotal,
  simulateChronoToEndBoard,
} from "../js/puzzle-export-sim.js";
import { PERFECT_HUNT_WORD_COUNT, NEXT_LETTERS_LEN } from "../js/config.js";
import { wordReuseStats } from "../js/board-logic.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pathJson = join(root, "text/gamemaker/puzzle-tester-export.json");

test("puzzle-tester: recompute covered, sack length, chrono end board vs solvedGrid", () => {
  const j = JSON.parse(readFileSync(pathJson, "utf8"));
  assert.equal(j.type, "wordhunter-gamemaker-export");
  const ed = (j.editorHarness || j.startingGrid).map((r) =>
    r.map((c) => String(c || "").toLowerCase())
  );
  /** Gamemaker JSON is newest-commit first; recompute / simulate use oldest → newest */
  const chronOldestFirst = j.buildPlaysChron.slice().reverse();
  const fixed = recomputeCoveredChronFromHarness(ed, chronOldestFirst);
  assert.equal(fixed.length, PERFECT_HUNT_WORD_COUNT);
  const chain = coveredFirstVisitCountTotal(fixed.map((p) => ({ covered: p.covered })));
  const expectedFromWords = fixed.reduce(
    (s, p) => s + wordReuseStats(p.word).minTiles,
    0
  );
  assert.equal(
    chain,
    expectedFromWords,
    "covered chain length matches Σ min_tiles for export words"
  );
  const playsNewestFirst = fixed.slice().reverse();
  const nextLetters = buildNextLettersFromCoveredInBuildOrder(playsNewestFirst, {
    fillEmpty: "a",
  });
  assert.equal(nextLetters.length, NEXT_LETTERS_LEN);
  const bPenult = simulateChronoToEndBoard(
    ed,
    fixed.slice(0, PERFECT_HUNT_WORD_COUNT - 1)
  );
  const solved = (j.solvedGrid && j.solvedGrid.length ? j.solvedGrid : bPenult).map(
    (r) => r.map((c) => String(c || "").toLowerCase())
  );
  const simEnd = simulateChronoToEndBoard(ed, chronOldestFirst);
  assert.deepEqual(
    simEnd,
    solved,
    "simulate(ed, oldest-first plays) equals export solvedGrid"
  );
});
