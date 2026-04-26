import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import {
  verifyForwardPuzzle,
  recomputeCoveredChronFromHarness,
  buildNext50FromCoveredInBuildOrder,
  simulateChronoToEndBoard,
} from "../js/puzzle-export-sim.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pathFixture = join(root, "tests/fixtures/gamemaker-export-trueness-sample.json");

test("trueness sample: embedded solvedGrid disagrees with chrono end from paths", () => {
  const j = JSON.parse(readFileSync(pathFixture, "utf8"));
  const ed = (j.editorHarness || j.startingGrid).map((r) =>
    r.map((c) => String(c || "").toLowerCase())
  );
  const sim = simulateChronoToEndBoard(ed, j.buildPlaysChron);
  const solved = j.solvedGrid.map((r) => r.map((c) => String(c || "").toLowerCase()));
  assert.notDeepEqual(
    solved,
    sim,
    "export solvedGrid should match simulateChrono for a valid handoff"
  );
  assert.equal(sim[3][0], "t", "last-built word (trueness) places t at (3,0)");
  assert.equal(solved[3][0], "n", "fixture as exported has a stale/wrong cell");
});

test("trueness sample: forward verify with embedded solvedGrid matches 'want t got n'", () => {
  const j = JSON.parse(readFileSync(pathFixture, "utf8"));
  const ed = j.editorHarness.map((r) => r.map((c) => String(c || "").toLowerCase()));
  const fixed = recomputeCoveredChronFromHarness(ed, j.buildPlaysChron);
  const next50 = buildNext50FromCoveredInBuildOrder(fixed, { fillEmpty: "a" });
  const byScore = j.wordsAscending
    .slice()
    .sort((a, b) => (a.wordTotal || 0) - (b.wordTotal || 0));
  const wordsAsc = byScore.map((x) => String(x.word || "").toLowerCase());
  const pathByWord = new Map(
    fixed.map((p) => [String(p.word || "").toLowerCase(), p.pathFlat])
  );
  const paths = wordsAsc.map((w) => pathByWord.get(w) || []);
  const solved = j.solvedGrid.map((r) => r.map((c) => String(c || "").toLowerCase()));
  const v = verifyForwardPuzzle(solved, next50, wordsAsc, paths);
  assert.equal(v.ok, false);
  assert.equal(v.reason, "word 0 at step 0 want t got n");
});
