/**
 * Wrongful puzzle pool forensics:
 * - historic export path for civilizations contained ⋯A,B,A⋯ (penultimate tap = undo in main-game drag).
 * - builder + verify must emit only undo-safe paths (see pathFlatConflictsPenultimateUndoStroke).
 *
 * The heavy **`wrongful pool builds …`** case runs only when **`WORD_HUNTER_SLOW_BUILD_TEST=1`**
 * (see **`npm run test:slow`**); default **`npm test`** keeps only the cheap obsolete-path assertion.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  canonicalNextLettersFromJsonArray,
  stripTrailingEmptyNextLetters,
} from "../js/puzzle-export-sim/next-letters.js";
import { tryApplyFifoLetterRefillsAfterWordSubmission } from "../js/puzzle-export-sim/refill-fifo.js";
import { verifyForwardPuzzle } from "../js/puzzle-export-sim/forward-verify.js";
import { tryBuildAutomatedPuzzle } from "../js/puzzle-export-sim/auto-puzzle-build.js";
import {
  wordToTileLabelSequence,
  normalizeTileText,
  wordReuseStats,
  getLiveWordScoreBreakdownFromLabels,
} from "../js/board-logic.js";
import {
  pathFlatConflictsPenultimateUndoStroke,
  isPathGamemakerLegal,
  buildBoardForUniquenessFromSnapshot,
  countGamemakerWordPathsOnBoard,
} from "../js/puzzle-export-sim/word-path-search.js";

const root = dirname(fileURLToPath(import.meta.url));

/** Pre-fix export path / witness (⋯7,11,7⋯ ⇒ penultimate undo on main-site drag). */
const OBSOLETE_EXPORT_CIV_PATH = [1, 2, 3, 7, 11, 7, 10, 9, 6, 2, 5, 8, 4];

function normalizeGridLetters(/** @type {string[][]} */ g) {
  return g.map((row) => row.map((c) => normalizeTileText(String(c ?? ""))));
}

/** @returns {{ row: Record<string, unknown>; lineIndex: number }} */
function locateWrongfulPuzzleMeta() {
  const text = readFileSync(join(root, "../text/puzzles.txt"), "utf8").trim();
  const huntNeedle = `"perfect_hunt":["wrongful"`;
  const lines = text.split("\n").filter((ln) => ln.trim().length);
  let lineIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (!ln.includes(huntNeedle)) continue;
    lineIndex = i;
    return { row: JSON.parse(ln), lineIndex };
  }
  throw new Error("wrongful puzzle row missing from puzzles.txt");
}

function poolSevenFromPerfectHunt(/** @type {string[]} */ ph) {
  return ph.map((w) => {
    const word = String(w || "")
      .trim()
      .toLowerCase();
    const labels = wordToTileLabelSequence(word);
    const st = wordReuseStats(labels);
    const { wordTotal } = getLiveWordScoreBreakdownFromLabels(labels);
    return { word, min_tiles: st.minTiles, reuse: st.reuse, wordTotal };
  });
}

function clone(grid) {
  return grid.map((r) => r.slice());
}

function flatToRC(f, n = 4) {
  return { r: Math.floor(f / n), c: f % n };
}

function tileAt(board, f) {
  const { r, c } = flatToRC(f);
  const raw = board[r]?.[c];
  return normalizeTileText(String(raw ?? ""));
}

function replaySixWords(board0, fifo0, wordsAsc, pathsAscSix) {
  let board = board0;
  let q = fifo0;
  for (let wi = 0; wi < 6; wi++) {
    const w = wordsAsc[wi];
    const pathFlat = pathsAscSix[wi];
    const glyphs = wordToTileLabelSequence(w);
    const b = clone(board);
    const fq = q.slice();
    for (let i = 0; i < pathFlat.length; i++) {
      assert.equal(
        tileAt(b, pathFlat[i]),
        normalizeTileText(glyphs[i]),
        `replay word ${wi} step ${i}`
      );
    }
    assert.ok(tryApplyFifoLetterRefillsAfterWordSubmission(b, fq, pathFlat, 4));
    board = b;
    q = fq;
  }
  return { boardBeforeCiv: board, queueRemainder: q };
}

/**
 * Expensive integration path — mirrors **`scripts/regenerate-puzzles-txt.mjs`** tier order (cheap skew pass,
 * then full lookahead). Worst-case cost is far lower than the old single-tier **`wholeBuildAttempts × seedSkew`** loop,
 * which made **`npm test`** appear hung for tens of minutes.
 */
function seededBuild(poolSeven, lineIndex) {
  const seedBase = 42;
  const base = (lineIndex * 9973 + Math.floor(Number(seedBase) || 42)) >>> 0;
  const common = {
    shiftMaxSteps: 3,
    shiftBetweenWords: false,
    requireUniqueSpelling: true,
    placementCandidateSamples: 6,
    placementOrder: "input",
  };
  const tiers = [
    {
      skewCap: 40,
      wholeBuildAttempts: 22,
      lookaheadProbeNext: false,
      maxAttemptsPerWord: 5600,
      pathSearchExploreBudget: 380_000,
    },
    {
      skewCap: 150,
      wholeBuildAttempts: 250,
      lookaheadProbeNext: true,
      maxAttemptsPerWord: 8000,
      pathSearchExploreBudget: 460_000,
      lookaheadAttempts: 920,
      lookaheadInnerTries: 7,
    },
  ];
  for (const tier of tiers) {
    for (let si = 0; si <= tier.skewCap; si++) {
      const seed = (base + Math.imul(si, 4093)) >>> 0;
      const r = tryBuildAutomatedPuzzle(poolSeven, {
        seed,
        ...common,
        wholeBuildAttempts: tier.wholeBuildAttempts,
        lookaheadProbeNext: tier.lookaheadProbeNext,
        maxAttemptsPerWord: tier.maxAttemptsPerWord,
        pathSearchExploreBudget: tier.pathSearchExploreBudget,
        ...(tier.lookaheadProbeNext
          ? {
              lookaheadAttempts: tier.lookaheadAttempts,
              lookaheadInnerTries: tier.lookaheadInnerTries,
            }
          : {}),
      });
      if (r.ok === true && r.pathsAsc != null && r.wordsAsc != null)
        return /** @type {typeof r & { ok: true }} */ (r);
    }
  }
  return null;
}

/** Set **`WORD_HUNTER_SLOW_BUILD_TEST=1`** to run the auto-build sweep (minutes of CPU). Default **`npm test`** stays fast. */
const RUN_SLOW_WRONGFUL_AUTO_BUILD = process.env.WORD_HUNTER_SLOW_BUILD_TEST === "1";

test("obsolete exported civilizations path trips penultimate-undo collision", () => {
  assert.equal(pathFlatConflictsPenultimateUndoStroke(OBSOLETE_EXPORT_CIV_PATH), true);
  const chk = isPathGamemakerLegal("civilizations", OBSOLETE_EXPORT_CIV_PATH);
  assert.equal(chk.ok, false);
});

test(
  "wrongful pool builds with undo-safe paths and forward verify-replay reaches civilizations",
  { skip: !RUN_SLOW_WRONGFUL_AUTO_BUILD, timeout: 900_000 },
  () => {
    const { row: shipped, lineIndex } = locateWrongfulPuzzleMeta();

    /** @type {string[]} */
    const perfectHuntShipped = /** @type {string[]} */ (shipped.perfect_hunt);
    const poolSeven = poolSevenFromPerfectHunt(perfectHuntShipped);

    const built = seededBuild(poolSeven, lineIndex);
    assert.ok(
      built,
      "tryBuildAutomatedPuzzle exhausted seed skew; try `node scripts/regenerate-puzzles-txt.mjs` with higher --seed-skew"
    );

    /** @type {string[]} */
    const wordsAsc = built.wordsAsc.map((w) => String(w).toLowerCase());
    /** @type {number[][]} */
    const pathsAsc = built.pathsAsc.map((p) => p.slice());

    const poolSet = new Set(perfectHuntShipped.map((w) => String(w).toLowerCase()));
    const builtSet = new Set(wordsAsc);
    assert.equal(poolSet.size, builtSet.size);
    for (const w of poolSet) assert.ok(builtSet.has(w));

    for (let wi = 0; wi < pathsAsc.length; wi++) {
      assert.equal(isPathGamemakerLegal(wordsAsc[wi], pathsAsc[wi]).ok, true);
      assert.equal(pathFlatConflictsPenultimateUndoStroke(pathsAsc[wi]), false);
    }

    /** @type {string[][]} */
    const gridNorm = normalizeGridLetters(
      /** @type {string[][]} */ (built.row.starting_grid)
    );
    let fifo = canonicalNextLettersFromJsonArray(
      /** @type {unknown[]} */ (built.row.next_letters)
    );
    assert.equal(stripTrailingEmptyNextLetters(fifo).length <= fifo.length, true);

    const vrf = verifyForwardPuzzle(gridNorm, fifo, wordsAsc, pathsAsc);
    assert.ok(vrf.ok);

    const { boardBeforeCiv } = replaySixWords(
      gridNorm,
      fifo,
      wordsAsc,
      pathsAsc.slice(0, 6)
    );

    const civ = "civilizations";
    const civIx = wordsAsc.indexOf(civ);
    assert.ok(civIx >= 0);
    const civPath = pathsAsc[civIx];
    const civGlyphs = wordToTileLabelSequence(civ);

    for (let i = 0; i < civPath.length; i++) {
      assert.equal(
        tileAt(boardBeforeCiv, civPath[i]),
        normalizeTileText(civGlyphs[i]),
        `civ tiles step ${i}`
      );
    }
    for (const f of civPath) {
      assert.ok(
        tileAt(boardBeforeCiv, f) !== "",
        "witness should not traverse empty squares"
      );
    }

    const snap = clone(boardBeforeCiv);
    const uniqBoard = buildBoardForUniquenessFromSnapshot(snap, civPath, civGlyphs);
    assert.ok(uniqBoard);
    const amb = countGamemakerWordPathsOnBoard(civ, uniqBoard, { stopAfter: 10 });
    assert.equal(amb, 1);
  }
);
