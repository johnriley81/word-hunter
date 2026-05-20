import test from "node:test";
import assert from "node:assert/strict";
import { readShippedPuzzlesText } from "./lib/read-shipped-puzzles.mjs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tryBuildAutomatedPuzzle } from "../js/puzzle-export-sim/auto-puzzle-build.js";
import { loadPathCatalogIfReady } from "../js/puzzle-export-sim/load-path-catalog.js";
import {
  wordToTileLabelSequence,
  wordReuseStats,
  getLiveWordScoreBreakdownFromLabels,
} from "../js/board-logic.js";
import { normalizeTileText } from "../js/board-logic.js";
import { parsePuzzlesFileText } from "../js/puzzle-row-format.js";
import { verifyForwardPuzzleWithShifts } from "../js/puzzle-export-sim/forward-verify.js";
import {
  applyShiftSeqToBoard,
  pathSpellsWordOnBoard,
} from "../js/puzzle-export-sim/shift-starter.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const catalog = loadPathCatalogIfReady(
  join(root, "text/gamemaker/pregen/path-signature-catalog.json")
);

function wordEntry(word) {
  const w = String(word || "")
    .trim()
    .toLowerCase();
  const labels = wordToTileLabelSequence(w);
  const st = wordReuseStats(labels);
  const { wordTotal } = getLiveWordScoreBreakdownFromLabels(labels);
  return { word: w, min_tiles: st.minTiles, reuse: st.reuse, wordTotal };
}

test("shift export uses end-of-generation starting_grid and dense next_letters head", () => {
  assert.ok(catalog, "path catalog required");
  const rows = parsePuzzlesFileText(readShippedPuzzlesText());
  assert.ok(rows.length >= 1, "shipped puzzles need at least one row");
  const hunt = rows[0].perfect_hunt;
  const pool = hunt.map(wordEntry);

  let built = null;
  for (let si = 0; si <= 200 && !built; si++) {
    const seed = (99 + Math.imul(si, 4093)) >>> 0;
    const r = tryBuildAutomatedPuzzle(pool, {
      seed,
      wholeBuildAttempts: 1,
      shiftBetweenWords: true,
      interWordShiftMode: "exhaustive16",
      pathCatalog: catalog,
      lookaheadProbeNext: true,
      maxAttemptsPerWord: 8000,
      requireCoexistentPathsOnFinalGrid: false,
      skipPlayPathUniqueness: true,
    });
    if (r.ok && r.row) built = r;
  }
  assert.ok(built, "expected a converged shift build");

  const row = built.row;
  const wordsAsc = row.perfect_hunt;
  const pathsAsc = built.pathsAsc;
  assert.ok(
    row.starting_grid.some((r) => r.some((c) => normalizeTileText(c) !== "")),
    "starting_grid should be the solved end-of-generation board"
  );
  assert.ok(Array.isArray(row.perfect_hunt_shifts_before));
  assert.ok(
    row.perfect_hunt_shifts_before
      .slice(1)
      .some((seq) => Array.isArray(seq) && seq.length > 0),
    "expected at least one inter-word shift after the first hunt word"
  );

  const letterCount = row.next_letters.filter((ch) => ch !== "").length;
  assert.ok(letterCount >= 40, "sack should be mostly letters, got " + letterCount);
  assert.equal(
    row.next_letters.findIndex((ch) => ch !== ""),
    0,
    "next_letters should not lead with blank peel slots (gamemaker-style)"
  );

  const boardHunt0 = applyShiftSeqToBoard(
    row.starting_grid,
    row.perfect_hunt_shifts_before[0] || [],
    4
  );
  assert.ok(
    pathSpellsWordOnBoard(boardHunt0, wordsAsc[0], pathsAsc[0]),
    "first perfect_hunt word must spell on starting_grid (after shift[0])"
  );

  const nextTrim = row.next_letters;
  const vrf = verifyForwardPuzzleWithShifts(
    row.starting_grid,
    nextTrim,
    wordsAsc,
    pathsAsc,
    row.perfect_hunt_shifts_before,
    {
      fillEmptyPathCells: true,
      pathCatalog: catalog,
      seed: 42,
      skipPlayPathUniqueness: true,
    }
  );
  assert.equal(vrf.ok, true, vrf.reason ?? "forward verify failed");
});
