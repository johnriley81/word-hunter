/**
 * Fast unit tests for path geometry / legality helpers used by the path catalog and builder.
 * Placement uses precomputed catalog variants (+ optional DFS fallback); heavy DFS placement
 * integration tests live in path-catalog-integration (with catalog) or slow build tests.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  neighborFlats,
  flatsAreAdjacent,
  isPathGamemakerLegal,
  popcntMask,
  pathFlatReuseMatchesGlyphPerFlat,
  straightPreferenceTier,
  countGamemakerWordPathsOnBoard,
  scorePlacementCoverExisting,
  pickBestPathFlatByCoverRotations,
  PLACEMENT_BLANK_FIRST_WEIGHT,
  kingDegree,
  centerProximityScore,
  scoreReuseHubCentrality,
  fifoFirstVisitSpellingSignature,
} from "../js/puzzle-export-sim/word-path-search.js";
import { rotatePathFlatQuarterTurnsCW } from "../js/puzzle-export-sim/grid-symmetry.js";
import { wordToTileLabelSequence } from "../js/board-logic.js";
import { GRID_SIZE } from "../js/config.js";

/** Known legal binging witness (catalog / legality checks only — no DFS). */
const BINGING_PATH = [12, 8, 4, 5, 8, 4, 5];

test("neighborFlats: center has 8 neighbors on 4×4", () => {
  const n = neighborFlats(5, 4);
  assert.equal(n.length, 8);
  assert.ok(n.includes(0));
  assert.ok(n.includes(10));
});

test("neighborFlats: corner has 3 neighbors", () => {
  assert.equal(neighborFlats(0, GRID_SIZE).length, 3);
});

test("kingDegree matches neighborFlats length on 4×4", () => {
  assert.equal(kingDegree(0, 4), 3);
  assert.equal(kingDegree(5, 4), 8);
  assert.equal(kingDegree(15, 4), 3);
});

test("centerProximityScore: interior beats corner on 4×4", () => {
  const corner = centerProximityScore(0, 4);
  const interior = centerProximityScore(6, 4);
  assert.ok(interior > corner);
});

test("scoreReuseHubCentrality sums reused-flat hub geometry", () => {
  assert.equal(scoreReuseHubCentrality([0, 1, 2, 3], 4), 0);
  const pathReuse = [5, 6, 5];
  const hub = scoreReuseHubCentrality(pathReuse, 4);
  const flat5Extras = kingDegree(5, 4) + centerProximityScore(5, 4);
  assert.equal(hub, flat5Extras);
});

test("glyph reuse coherence rejects impossible flat sequence for binging", () => {
  const glyphs = wordToTileLabelSequence("binging");
  const badPath = [12, 8, 13, 9, 12, 8, 12];
  assert.equal(pathFlatReuseMatchesGlyphPerFlat(badPath, glyphs), false);
});

test("isPathGamemakerLegal accepts known binging witness", () => {
  const v = isPathGamemakerLegal("binging", BINGING_PATH);
  assert.ok(v.ok, v.reason);
  const glyphs = wordToTileLabelSequence("binging");
  assert.equal(pathFlatReuseMatchesGlyphPerFlat(BINGING_PATH, glyphs), true);
});

test("popcntMask matches Set size for path", () => {
  let m = 0;
  for (const f of BINGING_PATH) m |= 1 << f;
  assert.equal(popcntMask(m), new Set(BINGING_PATH).size);
});

test("flatsAreAdjacent matches king move", () => {
  assert.ok(flatsAreAdjacent(0, 1, GRID_SIZE));
  assert.ok(flatsAreAdjacent(0, 5, GRID_SIZE));
  assert.ok(!flatsAreAdjacent(0, 2, GRID_SIZE));
});

test("straightPreferenceTier: repeat same step vector ranks 0", () => {
  const pathDown = [12, 8];
  assert.equal(straightPreferenceTier(pathDown, 8, 4, GRID_SIZE), 0);
});

test("countGamemakerWordPathsOnBoard finds two aa paths on two vertically stacked a tiles", () => {
  /** @type {string[][]} */
  const board = [];
  const n = 4;
  for (let r = 0; r < n; r++) {
    board[r] = [];
    for (let c = 0; c < n; c++) board[r][c] = "";
  }
  board[3][0] = "a";
  board[2][0] = "a";
  assert.equal(countGamemakerWordPathsOnBoard("aa", board, { stopAfter: 10 }), 2);
});

test("fifoFirstVisitSpellingSignature matches for geometric path variants sharing first visits", () => {
  const glyphs = wordToTileLabelSequence("deccdac");
  const p1 = [2, 7, 10, 6, 2, 5, 6];
  const p2 = [2, 7, 10, 6, 2, 5, 10];
  assert.ok(isPathGamemakerLegal("deccdac", p1).ok);
  assert.ok(isPathGamemakerLegal("deccdac", p2).ok);
  assert.equal(
    fifoFirstVisitSpellingSignature(p1, glyphs),
    fifoFirstVisitSpellingSignature(p2, glyphs)
  );
});

test("countGamemakerWordPathsOnBoard fifo_equivalence collapses duplicate FIFO classes", () => {
  const grid = [
    ["b", "d", "d", "d"],
    ["a", "a", "c", "e"],
    ["b", "a", "c", "d"],
    ["b", "e", "c", "e"],
  ];
  assert.equal(
    countGamemakerWordPathsOnBoard("deccdac", grid, {
      gridSize: GRID_SIZE,
      stopAfter: 20,
    }),
    2
  );
  assert.equal(
    countGamemakerWordPathsOnBoard("deccdac", grid, {
      gridSize: GRID_SIZE,
      stopAfter: 20,
      uniqueSpellingMode: "fifo_equivalence",
    }),
    1
  );
});

test("scorePlacementCoverExisting prefers blank first visits over covered", () => {
  /** @type {string[][]} */
  const sg = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(""));
  sg[0][0] = "x";
  const oneCover = scorePlacementCoverExisting(sg, [0, 1], GRID_SIZE);
  const twoBlank = scorePlacementCoverExisting(sg, [2, 3], GRID_SIZE);
  assert.equal(oneCover.coveredFirstVisited, 1);
  assert.equal(oneCover.blanksFirstVisited, 1);
  assert.equal(twoBlank.blanksFirstVisited, 2);
  assert.ok(twoBlank.score > oneCover.score);
  assert.equal(twoBlank.score, 2 * PLACEMENT_BLANK_FIRST_WEIGHT);
  assert.equal(oneCover.score, PLACEMENT_BLANK_FIRST_WEIGHT + 1);
});

test("pickBestPathFlatByCoverRotations picks highest blank-first rank among rotations", () => {
  /** @type {string[][]} */
  const sg = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(""));
  sg[0][0] = "a";
  sg[0][1] = "b";
  const base = [0, 1, 2];
  let maxScore = -1;
  for (let q = 0; q < 4; q++) {
    const pf = rotatePathFlatQuarterTurnsCW(
      base,
      /** @type {0|1|2|3} */ (q),
      GRID_SIZE
    );
    const sc = scorePlacementCoverExisting(sg, pf, GRID_SIZE).score;
    if (sc > maxScore) maxScore = sc;
  }
  const best = pickBestPathFlatByCoverRotations("abc", base, sg, {
    gridSize: GRID_SIZE,
  });
  assert.ok(best);
  assert.equal(best.score, maxScore);
});
