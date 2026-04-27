import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import {
  verifyForwardPuzzleIfCoveredChain50,
  recomputeCoveredChronFromHarness,
  buildNext50FromCoveredInBuildOrder,
  simulateChronoToEndBoard,
} from "../js/puzzle-export-sim.js";
import { PERFECT_HUNT_WORD_COUNT } from "../js/config.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pathJson = join(root, "text/gamemaker/puzzle-tester-export.json");

test("puzzle-tester: recompute covered + penultimate board and verify vs embedded forwardVerify", () => {
  const j = JSON.parse(readFileSync(pathJson, "utf8"));
  assert.equal(j.type, "wordhunter-gamemaker-export");
  const ed = (j.editorHarness || j.startingGrid).map((r) =>
    r.map((c) => String(c || "").toLowerCase())
  );
  const fixed = recomputeCoveredChronFromHarness(ed, j.buildPlaysChron);
  assert.equal(fixed.length, PERFECT_HUNT_WORD_COUNT);
  const next50 = buildNext50FromCoveredInBuildOrder(fixed, { fillEmpty: "a" });
  assert.equal(next50.length, 50);
  const bPenult = simulateChronoToEndBoard(
    ed,
    fixed.slice(0, PERFECT_HUNT_WORD_COUNT - 1)
  );
  const order = j.wordsAscending
    .map((w, i) => ({ w, i }))
    .sort((a, b) => (a.w.wordTotal || 0) - (b.w.wordTotal || 0));
  const wordsAsc = order.map((x) => String(x.w.word || "").toLowerCase());
  const pathByWord = new Map(
    fixed.map((p) => [String(p.word || "").toLowerCase(), p.pathFlat])
  );
  const pathsPlayOrder = wordsAsc.map((w) => pathByWord.get(w) || []);
  const solved = (j.solvedGrid && j.solvedGrid.length ? j.solvedGrid : bPenult).map(
    (r) => r.map((c) => String(c || "").toLowerCase())
  );

  const v = verifyForwardPuzzleIfCoveredChain50(
    solved,
    next50,
    wordsAsc,
    pathsPlayOrder,
    fixed
  );
  const snap = j.forwardVerify;
  assert.equal(v.ok, snap.ok, "recomputed ok vs export forwardVerify");
  assert.equal(v.reason, snap.reason, "recomputed reason vs export");
  assert.equal(v.queueLeft.length, snap.queueLeft.length, "queue len");
});
