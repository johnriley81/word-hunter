import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeTileText,
  getLetterWeight,
  getLiveWordScoreBreakdownFromLabels,
  wordToTileLabelSequence,
  minUniqueTilesForReuseRule,
  wordReuseStats,
  applyColumnShiftInPlace,
  applyRowShiftInPlace,
  remapFlatAfterColumnShiftSigned,
  remapFlatAfterRowShiftSigned,
  shiftCommitStepsFromAxisMag,
  computeShiftSnapPlan,
  buildPerfectHuntMetadata,
  computePerfectHuntStarterFlat,
  puzzleRowPerfectHuntStarterHints,
  exportedOrthoNeighborSigMatches,
  normalizedOrthoNeighborsAtFlat,
  normalizedTorusOrthoNsweQuad,
  torNeighborQuadExportTokensFromBoard,
  PERFECT_HUNT_TOR_NEIGHBOR_LEN,
} from "../js/board-logic.js";
import {
  GRID_SIZE,
  SHIFT_STRIDE_FIRST_FRAC,
  CHOIR_PLAYBACK_RATES_FOR_RANK,
  PERFECT_HUNT_WORD_COUNT,
  getWordSuccessShowMessageTotalMs,
} from "../js/config.js";

test("word success showMessage total duration is reasonable for tile counts", () => {
  assert.ok(getWordSuccessShowMessageTotalMs(4) > 500);
  assert.ok(getWordSuccessShowMessageTotalMs(7) > getWordSuccessShowMessageTotalMs(4));
});

test("normalizeTileText trims and maps q to qu", () => {
  assert.equal(normalizeTileText(" Q "), "qu");
  assert.equal(normalizeTileText("a"), "a");
});

test("wordToTileLabelSequence maps qu to one label", () => {
  assert.deepEqual(wordToTileLabelSequence("quip"), ["qu", "i", "p"]);
  assert.deepEqual(wordToTileLabelSequence("aardvark"), [
    "a",
    "a",
    "r",
    "d",
    "v",
    "a",
    "r",
    "k",
  ]);
});

test("minUniqueTilesForReuseRule: two distinct between same labels", () => {
  assert.equal(minUniqueTilesForReuseRule("happy"), 5);
  assert.equal(minUniqueTilesForReuseRule("dudes"), 5);
  assert.equal(wordReuseStats("binging").minTiles, 4);
  assert.equal(wordReuseStats("binging").reuse, 3);
  assert.equal(minUniqueTilesForReuseRule("aardvark"), 6);
});

test("getLiveWordScoreBreakdownFromLabels multiplies sum by string length", () => {
  const { letterSum, length, wordTotal } = getLiveWordScoreBreakdownFromLabels([
    "a",
    "b",
  ]);
  assert.equal(letterSum, getLetterWeight("a") + getLetterWeight("b"));
  assert.equal(length, 2);
  assert.equal(wordTotal, letterSum * length);
});

test("applyColumnShiftInPlace rotates columns", () => {
  const n = 2;
  const board = [
    ["a", "b"],
    ["c", "d"],
  ];
  applyColumnShiftInPlace(board, 1, n);
  assert.deepEqual(board, [
    ["b", "a"],
    ["d", "c"],
  ]);
});

test("applyRowShiftInPlace rotates rows", () => {
  const n = 2;
  const board = [
    ["a", "b"],
    ["c", "d"],
  ];
  applyRowShiftInPlace(board, 1, n);
  assert.deepEqual(board, [
    ["c", "d"],
    ["a", "b"],
  ]);
});

function boardWithUniqueLabels(n) {
  const b = [];
  let id = 0;
  for (let r = 0; r < n; r++) {
    const row = [];
    for (let c = 0; c < n; c++) {
      row.push(`t${id++}`);
    }
    b.push(row);
  }
  return b;
}

function flatOfToken(board, tok, n) {
  for (let r = 0; r < n; r++) {
    const c = board[r].indexOf(tok);
    if (c !== -1) return r * n + c;
  }
  return -1;
}

test("remapFlat follows applyColumnShiftInPlace for unique cells", () => {
  const n = 4;
  const shifts = [-3, -1, 1, 2];
  for (const steps of shifts) {
    const board = boardWithUniqueLabels(n);
    const flatHint = n + 2;
    const tok = board[Math.floor(flatHint / n)][flatHint % n];
    const expectedFlat = remapFlatAfterColumnShiftSigned(flatHint, steps, n);
    applyColumnShiftInPlace(board, steps, n);
    assert.equal(flatOfToken(board, tok, n), expectedFlat);
  }
});

test("remapFlat follows applyRowShiftInPlace for unique cells", () => {
  const n = 4;
  const shifts = [-2, -1, 1, 3];
  for (const steps of shifts) {
    const board = boardWithUniqueLabels(n);
    const flatHint = n + 2;
    const tok = board[Math.floor(flatHint / n)][flatHint % n];
    const expectedFlat = remapFlatAfterRowShiftSigned(flatHint, steps, n);
    applyRowShiftInPlace(board, steps, n);
    assert.equal(flatOfToken(board, tok, n), expectedFlat);
  }
});

test("shiftCommitStepsFromAxisMag respects stride and first fraction", () => {
  const n = GRID_SIZE;
  const stride = 80;
  const first = stride * SHIFT_STRIDE_FIRST_FRAC;
  assert.equal(shiftCommitStepsFromAxisMag(0, stride, n), 0);
  assert.equal(shiftCommitStepsFromAxisMag(first - 1, stride, n), 0);
  assert.equal(shiftCommitStepsFromAxisMag(first + 0.001, stride, n), 1);
});

test("computeShiftSnapPlan returns target transform", () => {
  const mDrag = { tw: 40, th: 40, gap: 10 };
  const { targetTransform, skipSnapAnimate } = computeShiftSnapPlan(
    true,
    50,
    1,
    mDrag,
    "translate(0px, 0px)"
  );
  assert.match(targetTransform, /translate\(/);
  assert.equal(typeof skipSnapAnimate, "boolean");
});

test("buildPerfectHuntMetadata: targetSum matches board-logic wordTotals", () => {
  const hunt = ["aa", "zzz", "no"];
  const rates = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const meta = buildPerfectHuntMetadata(hunt, rates);
  assert.ok(meta);
  const rows = hunt.map((word) => {
    const w = word.toLowerCase();
    const { wordTotal } = getLiveWordScoreBreakdownFromLabels(
      wordToTileLabelSequence(w)
    );
    return { word: w, wordTotal };
  });
  rows.sort((a, b) => {
    if (a.wordTotal !== b.wordTotal) return a.wordTotal - b.wordTotal;
    return a.word.localeCompare(b.word);
  });
  const expectedSum = rows.reduce((s, r) => s + r.wordTotal, 0);
  assert.equal(meta.targetSum, expectedSum);
  for (let i = 0; i < rows.length; i++) {
    assert.equal(meta.choirRateByWord.get(rows[i].word), rates[i]);
  }
});

test("buildPerfectHuntMetadata: ties break by word string", () => {
  const hunt = ["ba", "ab"];
  const meta = buildPerfectHuntMetadata(hunt, [1.1, 1.2]);
  assert.ok(meta);
  assert.equal(meta.choirRateByWord.get("ab"), 1.1);
  assert.equal(meta.choirRateByWord.get("ba"), 1.2);
});

test("buildPerfectHuntMetadata: maps PERFECT_HUNT_WORD_COUNT words to choir rates", () => {
  assert.ok(CHOIR_PLAYBACK_RATES_FOR_RANK.length >= PERFECT_HUNT_WORD_COUNT);
  const hunt = Array.from({ length: PERFECT_HUNT_WORD_COUNT }, (_, i) =>
    "a".repeat(i + 3)
  );
  const meta = buildPerfectHuntMetadata(hunt, CHOIR_PLAYBACK_RATES_FOR_RANK);
  assert.ok(meta);
  assert.equal(meta.choirRateByWord.size, PERFECT_HUNT_WORD_COUNT);
});

test("exportedOrthoNeighborSigMatches: one vertical + one horizontal sufficient", () => {
  const actual = normalizedOrthoNeighborsAtFlat(
    [
      ["x", "y"],
      ["a", "b"],
    ].map((r) => r.map((c) => String(c))),
    /* flat */ 1,
    2
  );
  assert.equal(
    exportedOrthoNeighborSigMatches(actual, {
      n: "wrong",
      s: "b",
      w: "wrong",
      e: null,
    }),
    true
  );
  assert.equal(
    exportedOrthoNeighborSigMatches(actual, { n: null, s: "bogus", w: "y" }),
    false
  );
});

test("Perfect Hunt starter: row-major ambiguity resolved by exported flat then neighbor sig", () => {
  const board = [
    ["b", "x", "z", "z"],
    ["x", "a", "z", "z"],
    ["z", "z", "a", "z"],
    ["z", "z", "z", "z"],
  ].map((r) => r.map((c) => String(c)));
  const hunt = ["ab"];
  const base = computePerfectHuntStarterFlat(board, hunt, 0, true, 4, null);
  assert.equal(base, 5);
  const byFlat = computePerfectHuntStarterFlat(
    board,
    hunt,
    0,
    true,
    4,
    puzzleRowPerfectHuntStarterHints([10], null, undefined)
  );
  assert.equal(byFlat, 10);
  /* Full four-way sig would match both `a` tiles under relaxed ortho rules; one vertical + one horizontal pin the lower-right `a` only. */
  const sigOnly = puzzleRowPerfectHuntStarterHints(
    null,
    [{ n: "z", e: "z" }],
    undefined
  );
  const byOrtho = computePerfectHuntStarterFlat(board, hunt, 0, true, 4, sigOnly);
  assert.equal(byOrtho, 10);
});

test("Perfect Hunt starter: invalid flat hint with no neighbor sig yields null (no legacy scan)", () => {
  const board = [
    ["b", "x", "z", "z"],
    ["x", "a", "z", "z"],
    ["z", "z", "x", "z"],
    ["z", "z", "z", "z"],
  ].map((r) => r.map((c) => String(c)));
  const hunt = ["ab"];
  const wrongFlat = puzzleRowPerfectHuntStarterHints([10], null, undefined);
  const got = computePerfectHuntStarterFlat(board, hunt, 0, true, 4, wrongFlat);
  assert.equal(got, null);
});

test("torNeighborQuadExportTokens wraps top-right corner (N,E)", () => {
  /* flat 3 = row0 col3; torus north → row 3 col3, east → row 0 col0 */
  const board = [
    ["a", "b", "c", "x"],
    ["d", "e", "f", "y"],
    ["g", "h", "i", "j"],
    ["n", ".", ",", "up"],
  ].map((r) => r.map((c) => String(c)));
  assert.deepStrictEqual(normalizedTorusOrthoNsweQuad(board, 3, 4), [
    "up",
    "y",
    "c",
    "a",
  ]);
  assert.deepStrictEqual(torNeighborQuadExportTokensFromBoard(board, 3, 4), [
    "up",
    "y",
    "c",
    "a",
  ]);
});

test("Perfect Hunt starter: toroidal ring picks matching w among two via exported quad", () => {
  const board = [
    ["z", "w", "e", "z"],
    ["z", "z", "z", "z"],
    ["z", "w", "z", "z"],
    ["z", "z", "z", "z"],
  ].map((r) => r.map((c) => String(c)));
  /** w at flats 1 and 9 — export quad captured from flat 9 only */
  const hunt = ["wzzz"];
  const base = [];
  while (base.length < PERFECT_HUNT_TOR_NEIGHBOR_LEN) base.push("0");
  const ring9 = normalizedTorusOrthoNsweQuad(board, 9, 4).map((t) =>
    t === "" ? "0" : t
  );
  for (let i = 0; i < 4; i++) base[i] = ring9[i];
  const hints = puzzleRowPerfectHuntStarterHints(null, null, base);
  const flat = computePerfectHuntStarterFlat(board, hunt, 0, true, 4, hints);
  assert.equal(flat, 9);
});

test("Perfect Hunt starter: validated starter flat beats tor hints", () => {
  const board = [
    ["z", "w", "z", "z"],
    ["z", "z", "z", "z"],
    ["z", "w", "z", "z"],
    ["z", "z", "z", "z"],
  ].map((r) => r.map((c) => String(c)));
  const hunt = ["wzzz"];
  const torZeros = [];
  while (torZeros.length < PERFECT_HUNT_TOR_NEIGHBOR_LEN) torZeros.push("0");
  const hints = puzzleRowPerfectHuntStarterHints([9], null, torZeros);
  const flat = computePerfectHuntStarterFlat(board, hunt, 0, true, 4, hints);
  assert.equal(flat, 9);
});
