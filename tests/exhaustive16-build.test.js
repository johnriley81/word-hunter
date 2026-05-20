import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tryBuildAutomatedPuzzle } from "../js/puzzle-export-sim/auto-puzzle-build.js";
import { loadPathCatalogIfReady } from "../js/puzzle-export-sim/load-path-catalog.js";
import { comparePoolWordEntriesDesc } from "../js/puzzle-build/pool-order.js";
import {
  wordToTileLabelSequence,
  wordReuseStats,
  getLiveWordScoreBreakdownFromLabels,
} from "../js/board-logic.js";
import { verifyForwardPuzzleIfCoveredChain } from "../js/puzzle-export-sim/forward-verify.js";
import { stripTrailingEmptyNextLetters } from "../js/puzzle-export-sim/next-letters.js";
import { PERFECT_HUNT_WORD_COUNT } from "../js/config.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = join(root, "text/gamemaker/pregen/path-signature-catalog.json");
const poolPath = join(root, "text/gamemaker/pregen/puzzle-pool.json");

function wordEntry(word) {
  const w = String(word || "")
    .trim()
    .toLowerCase();
  const labels = wordToTileLabelSequence(w);
  const st = wordReuseStats(labels);
  const { wordTotal } = getLiveWordScoreBreakdownFromLabels(labels);
  return { word: w, min_tiles: st.minTiles, reuse: st.reuse, wordTotal };
}

const slow = process.env.WORD_HUNTER_SLOW_BUILD_TEST === "1";

(slow ? test : test.skip)(
  "tryBuildAutomatedPuzzle exhaustive16 shift mode verifies",
  { timeout: 120_000 },
  () => {
    const catalog = loadPathCatalogIfReady(catalogPath);
    assert.ok(catalog, "path catalog required for exhaustive16 smoke test");
    const pool = JSON.parse(readFileSync(poolPath, "utf8"));
    const hunt = pool.puzzles[0];
    assert.ok(hunt && hunt.length === PERFECT_HUNT_WORD_COUNT);
    const poolSeven = hunt.map(wordEntry).sort(comparePoolWordEntriesDesc);

    const r = tryBuildAutomatedPuzzle(poolSeven, {
      seed: 42,
      wholeBuildAttempts: 24,
      maxAttemptsPerWord: 4000,
      shiftBetweenWords: true,
      interWordShiftMode: "exhaustive16",
      pathCatalog: catalog,
      lookaheadProbeNext: false,
      placementCandidateSamples: 2,
    });

    assert.equal(r.ok, true, r.reason ?? "build failed");
    assert.ok(r.row);
    const shifts = /** @type {{ perfect_hunt_shifts_before?: unknown }} */ (r.row)
      .perfect_hunt_shifts_before;
    assert.ok(Array.isArray(shifts), "expected perfect_hunt_shifts_before");
    assert.equal(shifts.length, PERFECT_HUNT_WORD_COUNT);
    for (let i = 1; i < PERFECT_HUNT_WORD_COUNT; i++) {
      const row = shifts[i];
      assert.ok(
        Array.isArray(row) && row.length > 0,
        `ascending hunt index ${i} requires a grid rotation`
      );
    }

    const orderAsc = poolSeven
      .map((e, i) => ({ e, i }))
      .sort((a, b) => a.e.word.localeCompare(b.e.word));
    const wordsAsc = orderAsc.map((x) => x.e.word);
    const pathsAsc = orderAsc.map((x) => r.pathsAsc[x.i]);
    const nextTrim = stripTrailingEmptyNextLetters(
      /** @type {string[]} */ (r.row.next_letters)
    );
    const empty = Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => ""));
    const vrf = verifyForwardPuzzleIfCoveredChain(
      empty,
      nextTrim,
      wordsAsc,
      pathsAsc,
      null,
      shifts,
      { fillEmptyPathCells: true }
    );
    assert.equal(vrf.ok, true, vrf.reason ?? "verify failed");
  }
);

test("exhaustive16 requires shiftBetweenWords", () => {
  const poolSeven = ["a", "b", "c", "d", "e", "f", "g"].map((w) => ({
    word: w.repeat(8),
    min_tiles: 8,
    reuse: 0,
    wordTotal: 100,
  }));
  const r = tryBuildAutomatedPuzzle(poolSeven, {
    interWordShiftMode: "exhaustive16",
    shiftBetweenWords: false,
  });
  assert.equal(r.ok, false);
  assert.match(String(r.reason ?? ""), /shiftBetweenWords/);
});
