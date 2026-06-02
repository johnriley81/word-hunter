/**
 * Shipped-grid FIFO play-path uniqueness (player-visible starting_grid + shifts).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readShippedPuzzlesText } from "./lib/read-shipped-puzzles.mjs";
import { parsePuzzlesFileText } from "../js/puzzle-row-format.js";
import {
  assertUniqueFifoPlayPathOnBoard,
  assertUniqueFifoPlayPathsOnShippedGrid,
} from "../js/puzzle-export-sim/play-path-uniqueness.js";
import {
  countGamemakerWordPathsOnBoard,
  isPathGamemakerLegal,
} from "../js/puzzle-export-sim/word-path-search.js";
import { applyShiftSeqToBoard } from "../js/puzzle-export-sim/shift-starter.js";
import {
  resolveOneWordPathOnShippedGrid,
  resolvePathsAscForShippedUniqueness,
} from "../js/puzzle-export-sim/resolve-shipped-paths.js";
import { loadPathCatalogIfReady } from "../js/puzzle-export-sim/path-catalog/load-path-catalog.js";
import { tryBuildAutomatedPuzzle } from "../js/puzzle-export-sim/auto-puzzle-build.js";
import {
  wordToTileLabelSequence,
  wordReuseStats,
  getLiveWordScoreBreakdownFromLabels,
} from "../js/board-logic.js";
import { GRID_SIZE } from "../js/config.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const catalog = loadPathCatalogIfReady(
  join(root, "text/gamemaker/pregen/path-signature-catalog.json")
);

test("assertUniqueFifoPlayPathOnBoard accepts single FIFO class on deccdac grid", () => {
  const grid = [
    ["b", "d", "d", "d"],
    ["a", "a", "c", "e"],
    ["b", "a", "c", "d"],
    ["b", "e", "c", "e"],
  ];
  const path = [2, 7, 10, 6, 2, 5, 6];
  assert.ok(isPathGamemakerLegal("deccdac", path).ok);
  const r = assertUniqueFifoPlayPathOnBoard(grid, "deccdac", path, {
    gridSize: GRID_SIZE,
    uniqCountExploreBudget: 200_000,
  });
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.fifoCount, 1);
});

test("shipped row 0 hunt 0 thousand is FIFO-ambiguous on player-visible board", () => {
  const rows = parsePuzzlesFileText(
    readFileSync(join(root, "tests/fixtures/thousand-fifo-ambiguous-row.jsonl"), "utf8")
  );
  const row = rows[0];
  assert.ok(row, "puzzles.txt row 0");
  const board = applyShiftSeqToBoard(
    row.starting_grid.map((r) => r.slice()),
    row.perfect_hunt_shifts_before[0] || []
  );
  assert.ok(catalog, "path catalog required for resolve witness");
  const path = resolveOneWordPathOnShippedGrid(board, row.perfect_hunt[0], 0, {
    pathCatalog: catalog,
    seed: 1,
    maxAttemptsPerWord: 120_000,
  });
  assert.ok(path, "expected a spelling witness path for thousand");
  const count = countGamemakerWordPathsOnBoard(row.perfect_hunt[0], board, {
    uniqueSpellingMode: "fifo_equivalence",
    stopAfter: 2,
    exploreBudget: { remaining: 400_000 },
  });
  assert.equal(count, 2, "regression: multiple FIFO play classes on shipped grid");
  const uniq = assertUniqueFifoPlayPathOnBoard(board, row.perfect_hunt[0], path, {
    uniqCountExploreBudget: 400_000,
  });
  assert.equal(uniq.ok, false);
  assert.match(String(uniq.reason ?? ""), /fifo_play_path_ambiguous/);
});

test(
  "shift build passes shipped-grid FIFO uniqueness on resolved paths",
  { skip: process.env.WORD_HUNTER_SLOW_BUILD_TEST !== "1" },
  () => {
    assert.ok(catalog, "path catalog required");

    const rows = parsePuzzlesFileText(readShippedPuzzlesText());
    const pool = rows[0].perfect_hunt.map((w) => {
      const labels = wordToTileLabelSequence(w);
      const st = wordReuseStats(labels);
      const { wordTotal } = getLiveWordScoreBreakdownFromLabels(labels);
      return { word: w, min_tiles: st.minTiles, reuse: st.reuse, wordTotal };
    });

    let built = null;
    for (let si = 0; si <= 400 && !built; si++) {
      const seed = (17 + Math.imul(si, 7919)) >>> 0;
      const r = tryBuildAutomatedPuzzle(pool, {
        seed,
        wholeBuildAttempts: 1,
        shiftBetweenWords: true,
        interWordShiftMode: "exhaustive16",
        pathCatalog: catalog,
        lookaheadProbeNext: true,
        maxAttemptsPerWord: 8000,
        requireCoexistentPathsOnFinalGrid: false,
        skipPlayPathUniqueness: false,
      });
      if (r.ok && r.row) built = r;
    }
    assert.ok(built, "expected shift build under FIFO shipped-grid gate");

    const resolved = resolvePathsAscForShippedUniqueness(
      built.row.starting_grid,
      built.row.perfect_hunt,
      built.row.perfect_hunt_shifts_before,
      {
        pathCatalog: catalog,
        seed: built.row.perfect_hunt[0].length,
        nextLetters: built.row.next_letters,
      }
    );
    assert.equal(resolved.ok, true, resolved.ok ? "" : resolved.reason);

    const uniq = assertUniqueFifoPlayPathsOnShippedGrid({
      starting_grid: built.row.starting_grid,
      perfect_hunt: built.row.perfect_hunt,
      pathsAsc: resolved.pathsAsc,
      perfect_hunt_shifts_before: built.row.perfect_hunt_shifts_before,
      next_letters: built.row.next_letters,
    });
    assert.equal(uniq.ok, true, uniq.reason ?? "");
  }
);
