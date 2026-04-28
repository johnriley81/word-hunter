import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { simulateChronoToEndBoard } from "../js/puzzle-export-sim.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pathFixture = join(root, "tests/fixtures/gamemaker-export-trueness-sample.json");

test("trueness sample: embedded solvedGrid disagrees with chrono end from paths", () => {
  const j = JSON.parse(readFileSync(pathFixture, "utf8"));
  const ed = (j.editorHarness || j.startingGrid).map((r) =>
    r.map((c) => String(c || "").toLowerCase())
  );
  /** buildPlaysChron is newest-first; simulation advances oldest commits first */
  const chronOldestFirst = j.buildPlaysChron.slice().reverse();
  const sim = simulateChronoToEndBoard(ed, chronOldestFirst);
  const solved = j.solvedGrid.map((r) => r.map((c) => String(c || "").toLowerCase()));
  assert.notDeepEqual(
    solved,
    sim,
    "export solvedGrid should match simulateChrono for a valid handoff"
  );
  assert.equal(sim[3][0], "h", "last-built word spelling on chrono sim at (3,0)");
  assert.equal(solved[3][0], "n", "fixture as exported has a stale/wrong cell");
});
