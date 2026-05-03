import test from "node:test";
import assert from "node:assert/strict";
import { GRID_SIZE, NEXT_LETTERS_LEN } from "../js/config.js";
import {
  replacementTilesFirstVisitFlatOrder,
  verifyForwardPuzzle,
  stripTrailingEmptyNextLetters,
  padNextLettersToLen,
  computePerfectHuntStarterHints,
  computeShiftAwareStarterHints,
  shiftAwareStarterHintsReplay,
  applyShiftSeqToBoard,
  recomputeCoveredChronFromHarness,
  buildNextLettersFromCoveredInBuildOrder,
} from "../js/puzzle-export-sim.js";
import { normalizedOrthoNeighborsAtFlat } from "../js/board-logic.js";
import { buildGamemakerDictExportPayload } from "../js/gamemaker/build-export-payload.js";
import { comparePoolWordEntriesDescSackRefillOrder } from "../js/gamemaker/pool-order.js";

/**
 * After hunt word 0, replay mutates orthogonal tiles around hunt word 1’s opener.
 * `computeShiftAwareStarterHints` snapshots replay-time orthogonals (used by analyze tooling).
 */

const forbidsTailFlats = new Set([5, 6, 7]);

/** @returns {number[]} distinct flats excluding `forbidsTailFlats` */
function rndDistinct(seed, cnt) {
  const a = Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, i) => i).filter(
    (f) => !forbidsTailFlats.has(f)
  );
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = (s >>> 0) % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, cnt);
}

const replayVsTerminalFixture = (() => {
  const pathsAsc = /** @type {number[][]} */ ([
    [6, 7],
    [5, 9, 13],
  ]);
  const countsRemain = [12, 12, 13, 13, 11];
  for (let i = 0; i < 5; i++) {
    pathsAsc.push(rndDistinct(9001 + i, countsRemain[i]));
  }

  const grid0 = Array.from({ length: GRID_SIZE }, () =>
    Array.from({ length: GRID_SIZE }, () => "z")
  );
  grid0[1][1] = "b"; // starter flat for hunt word 1
  grid0[1][2] = "a"; // hunt word 0 — refilled toward unique east neighbor (`x`) before word 1
  grid0[1][3] = "z";

  const wordsAsc = ["az", "bzz", ...pathsAsc.slice(2).map((p) => "z".repeat(p.length))];

  const uniqFifo = pathsAsc.reduce(
    (s, p) => s + replacementTilesFirstVisitFlatOrder(p).length,
    0
  );
  assert.equal(
    uniqFifo,
    66,
    "fixture uniq first-visit refill count must drain canonical sack"
  );

  /** One non-`z` sack head so flat 6 is `a` before word 0 and `x` before word 1 (east of flat 5). */
  const fifoTrim = ["x", ...Array.from({ length: uniqFifo - 1 }, () => "z")];

  assert.equal(
    verifyForwardPuzzle(
      grid0,
      stripTrailingEmptyNextLetters(padNextLettersToLen(fifoTrim)),
      wordsAsc,
      pathsAsc
    ).ok,
    true,
    "fixture puzzle must replay"
  );

  return { pathsAsc, wordsAsc, grid0, fifoTrim };
})();

test("starter neighbor presets: replay-time east differs from published starting_grid at hunt 1 starter", () => {
  const { pathsAsc, wordsAsc, grid0, fifoTrim } = replayVsTerminalFixture;
  const hints = computePerfectHuntStarterHints(
    grid0.map((row) => row.slice()),
    stripTrailingEmptyNextLetters(padNextLettersToLen(fifoTrim.slice())),
    wordsAsc,
    pathsAsc
  );
  assert.ok(hints);

  const flat1 = hints.perfect_hunt_starter_flats[1];
  assert.equal(flat1, 5);

  const terminalOrtho = normalizedOrthoNeighborsAtFlat(grid0, flat1, GRID_SIZE);
  const replaySig = hints.perfect_hunt_starter_neighbor_sigs[1];

  assert.equal(terminalOrtho.e, "a");
  assert.equal(replaySig.e, "x");
  assert.notDeepEqual(replaySig, terminalOrtho);
});

test("shiftAwareStarterHintsReplay returns phase glyph_path when path shorter than glyphs", () => {
  const g = Array.from({ length: GRID_SIZE }, () =>
    Array.from({ length: GRID_SIZE }, () => "z")
  );
  const r = shiftAwareStarterHintsReplay(
    g.map((row) => row.slice()),
    Array.from({ length: NEXT_LETTERS_LEN }, () => "z"),
    ["too"],
    [[0]],
    [[]],
    {}
  );
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.phase, "glyph_path");
});

test("applyShiftSeqToBoard delegates to board-logic column/row rotates", () => {
  const b = [
    ["a", "b"],
    ["c", "d"],
  ];
  const out = applyShiftSeqToBoard(
    b.map((row) => row.slice()),
    [{ t: "col", s: 1 }],
    2
  );
  assert.deepEqual(out, [
    ["b", "a"],
    ["d", "c"],
  ]);
});

test("computeShiftAwareStarterHints with empty shift rows matches computePerfectHuntStarterHints", () => {
  const { pathsAsc, wordsAsc, grid0, fifoTrim } = replayVsTerminalFixture;
  const nextTrim = stripTrailingEmptyNextLetters(padNextLettersToLen(fifoTrim.slice()));
  const noop = pathsAsc.map(() => []);
  const shiftAware = computeShiftAwareStarterHints(
    grid0.map((row) => row.slice()),
    nextTrim,
    wordsAsc,
    pathsAsc,
    noop
  );
  const legacy = computePerfectHuntStarterHints(
    grid0.map((row) => row.slice()),
    nextTrim,
    wordsAsc,
    pathsAsc
  );
  assert.deepStrictEqual(shiftAware, legacy);
});

test("gamemaker dict export packs only core fields plus tor_neighbor ring (sack-aligned)", () => {
  const pathsAsc = /** @type {number[][]} */ ([
    [6, 7],
    [5, 9, 13],
  ]);
  const countsRemain = [12, 12, 13, 13, 11];
  for (let i = 0; i < 5; i++) {
    pathsAsc.push(rndDistinct(9001 + i, countsRemain[i]));
  }

  const grid0 = Array.from({ length: GRID_SIZE }, () =>
    Array.from({ length: GRID_SIZE }, () => "z")
  );
  grid0[1][1] = "b";
  grid0[1][2] = "a";
  grid0[1][3] = "z";

  const wordsAsc = ["az", "bzz", ...pathsAsc.slice(2).map((p) => "z".repeat(p.length))];

  const chronBare = pathsAsc.map((pathFlat, wi) => ({
    word: wordsAsc[wi],
    pathFlat,
  }));
  const reco = recomputeCoveredChronFromHarness(
    grid0.map((r) => r.slice()),
    chronBare
  );

  const currentWords = wordsAsc.map((w, i) => ({ word: w, wordTotal: (i + 1) * 10 }));

  const orderDescIdx = [...Array(7).keys()].sort((a, b) =>
    comparePoolWordEntriesDescSackRefillOrder(currentWords[a], currentWords[b])
  );
  const playsDescForSack = orderDescIdx.map((i) => ({
    covered: reco[i].covered.slice(),
  }));

  const fifoTrim = stripTrailingEmptyNextLetters(
    buildNextLettersFromCoveredInBuildOrder(playsDescForSack, { fillEmpty: "" })
  );

  assert.equal(
    verifyForwardPuzzle(grid0, fifoTrim.slice(), wordsAsc, pathsAsc).ok,
    true,
    "sack from covered must replay"
  );

  const buildPlaysChron = reco.map((p) => ({
    word: p.word,
    pathFlat: p.pathFlat.slice(),
    covered: p.covered.slice(),
    min_tiles: p.min_tiles,
  }));

  const payload = buildGamemakerDictExportPayload({
    gameBoard: grid0.map((row) => row.slice()),
    buildPlaysChron,
    currentWords,
    wordCount: 7,
  });

  assert.ok(payload);
  assert.deepStrictEqual(Object.keys(payload).sort(), [
    "next_letters",
    "perfect_hunt",
    "perfect_hunt_starter_tor_neighbors",
    "starting_grids",
  ]);
  assert.equal(payload.perfect_hunt_starter_tor_neighbors?.length, 28);
});
