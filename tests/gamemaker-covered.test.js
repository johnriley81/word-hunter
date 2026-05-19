import test from "node:test";
import assert from "node:assert/strict";
import { buildNextLettersFromCoveredInBuildOrder } from "../js/puzzle-export-sim/chrono-build.js";
import { deriveCoveredGamemakerPreCommit } from "../js/puzzle-export-sim/gamemaker-covered.js";
import { buildGamemakerDictExportPayload } from "../js/gamemaker/build-export-payload.js";
import { comparePoolWordEntriesDescSackRefillOrder } from "../js/gamemaker/pool-order.js";

test("deriveCoveredGamemakerPreCommit reads pre-commit snapshot on first visits", () => {
  const snap = [
    ["a", "", "", ""],
    ["", "", "", ""],
    ["", "", "", ""],
    ["", "", "", ""],
  ];
  const covered = deriveCoveredGamemakerPreCommit(snap, [0, 1, 5]);
  assert.deepEqual(covered, ["a", "", ""]);
});

test("buildGamemakerDictExportPayload stacks sack like manual export (desc refill order)", () => {
  const currentWords = [
    { word: "high", wordTotal: 200 },
    { word: "low", wordTotal: 50 },
  ];
  const buildPlaysChron = [
    {
      word: "high",
      pathFlat: [0, 1],
      covered: ["x", "y"],
      min_tiles: 2,
      starter_tor_neighbor_quad: ["0", "0", "0", "0"],
    },
    {
      word: "low",
      pathFlat: [2, 3],
      covered: ["p", "q"],
      min_tiles: 2,
      starter_tor_neighbor_quad: ["0", "0", "0", "0"],
    },
  ];
  const payload = buildGamemakerDictExportPayload({
    gameBoard: [
      ["x", "y", "a", "b"],
      ["c", "d", "e", "f"],
      ["p", "q", "g", "h"],
      ["i", "j", "k", "l"],
    ],
    buildPlaysChron,
    currentWords,
    wordCount: 2,
  });
  assert.ok(payload);
  const manual = buildNextLettersFromCoveredInBuildOrder(
    [{ covered: ["x", "y"] }, { covered: ["p", "q"] }],
    { fillEmpty: "" }
  );
  assert.equal(payload.next_letters[0], manual[0]);
  assert.equal(payload.next_letters[1], manual[1]);
  assert.deepEqual(payload.perfect_hunt, ["low", "high"]);
  const desc = currentWords
    .map((e, i) => ({ e, i }))
    .sort((a, b) => comparePoolWordEntriesDescSackRefillOrder(a.e, b.e));
  assert.equal(desc[0].e.word, "high");
});
