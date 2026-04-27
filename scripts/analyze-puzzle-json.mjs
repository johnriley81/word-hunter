/**
 * Paste a published puzzle JSON (argv). Simulates hunt words in ascending wordTotal order.
 *
 * Matches gameplay: after each word, replacements use the queue; **before** each word you may
 * apply up to N whole-grid row/column shifts (same ops as shift-dom: applyRowShift /
 * applyColumnShift on the 4×4).
 *
 * Note: `verifyForwardPuzzle` in puzzle-export-sim.js still assumes **no** shifts — export
 * verification / CI does not model swipes unless extended.
 *
 * Usage: node scripts/analyze-puzzle-json.mjs '{"starting_grid":...}'
 *
 * Precheck: each hunt word uses exactly `minUniqueTilesForReuseRule` replacement cells per
 * play; PERFECT_HUNT_WORD_COUNT words must sum to 50 to match `next_letters`. If not, the puzzle JSON cannot
 * represent a full perfect run (shifts do not change that accounting).
 */
import {
  wordToTileLabelSequence,
  normalizeTileText,
  minUniqueTilesForReuseRule,
  getLiveWordScoreBreakdownFromLabels,
  applyColumnShiftInPlace,
  applyRowShiftInPlace,
} from "../js/board-logic.js";
import { verifyForwardPuzzle } from "../js/puzzle-export-sim.js";
import { PERFECT_HUNT_WORD_COUNT } from "../js/config.js";

const N = 4;

/** Max shift primitives chained between successive words (e.g. 2 = up to two swipes). */
const MAX_SHIFT_OPS_BETWEEN_WORDS = Number(process.env.PUZZLE_SHIFT_DEPTH || 2);

/** Cap distinct paths tried per (word, shift-sequence) to keep search bounded. */
const MAX_PATHS_PER_SHIFT_SEQ = Number(process.env.PUZZLE_MAX_PATHS || 40);

/** Stop after exploring this many DFS nodes (fails with reason if exceeded). */
const MAX_DFS_NODES = Number(process.env.PUZZLE_MAX_NODES || 2_000_000);

const USE_FAIL_MEMO = process.env.PUZZLE_NO_MEMO !== "1";

/** col+1 first — matches common “swipe right” whole-grid column shift. */
const SHIFT_PRIM = [
  { t: "col", s: 1 },
  { t: "col", s: -1 },
  { t: "row", s: 1 },
  { t: "row", s: -1 },
  { t: "col", s: 2 },
  { t: "row", s: 2 },
];

function neighbors8(f, n = N) {
  const r = Math.floor(f / n);
  const c = f % n;
  const out = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < n && nc >= 0 && nc < n) out.push(nr * n + nc);
    }
  }
  return out;
}

function cloneBoard(board) {
  return board.map((row) => row.map((c) => String(c || "").toLowerCase()));
}

function cellLetter(board, f) {
  const r = Math.floor(f / N);
  const c = f % N;
  return normalizeTileText(board[r][c]);
}

function applySeqToBoard(board, seq) {
  const b = cloneBoard(board);
  for (const op of seq) {
    if (op.t === "col") applyColumnShiftInPlace(b, op.s, N);
    else applyRowShiftInPlace(b, op.s, N);
  }
  return b;
}

function* genShiftSeqs(maxLen) {
  yield [];
  function* rec(buf, targetLen) {
    if (buf.length === targetLen) {
      yield buf.slice();
      return;
    }
    for (const p of SHIFT_PRIM) {
      buf.push(p);
      yield* rec(buf, targetLen);
      buf.pop();
    }
  }
  for (let d = 1; d <= maxLen; d++) {
    yield* rec([], d);
  }
}

function findAllPathsOnBoard(board, word, limit) {
  const glyphs = wordToTileLabelSequence(word);
  const minTiles = minUniqueTilesForReuseRule(glyphs);
  const out = [];

  function dfs(i, path) {
    if (out.length >= limit) return;
    if (i === glyphs.length) {
      if (new Set(path).size === minTiles) out.push(path.slice());
      return;
    }
    const g = glyphs[i];
    const candidates =
      i === 0
        ? Array.from({ length: 16 }, (_, f) => f).filter(
            (f) => cellLetter(board, f) === g
          )
        : neighbors8(path[path.length - 1]).filter((f) => cellLetter(board, f) === g);
    for (const f of candidates) {
      dfs(i + 1, [...path, f]);
    }
  }
  dfs(0, []);
  return out;
}

function uniquesInPathOrder(pathFlat) {
  const out = [];
  const seen = new Set();
  for (const f of pathFlat) {
    if (!seen.has(f)) {
      seen.add(f);
      out.push(f);
    }
  }
  return out;
}

function pathMatchesWord(board, path, word) {
  const glyphs = wordToTileLabelSequence(word);
  if (path.length !== glyphs.length) return false;
  for (let i = 0; i < path.length; i++) {
    const f = path[i];
    const r = Math.floor(f / N);
    const c = f % N;
    if (normalizeTileText(board[r][c]) !== glyphs[i]) return false;
  }
  return true;
}

function applyCommit(board, queue, path, word) {
  const b = cloneBoard(board);
  const q = queue.slice();
  if (!pathMatchesWord(b, path, word)) return null;
  const uniques = uniquesInPathOrder(path);
  if (uniques.length > q.length) return null;
  for (const f of uniques) {
    const r = Math.floor(f / N);
    const c = f % N;
    b[r][c] = normalizeTileText((q.shift() || "").toLowerCase());
  }
  return { board: b, queue: q };
}

/**
 * DFS: before each word, try shift sequences (length 0..MAX), then paths, then commit.
 * Memoizes dead ends (board + queue + word index) to cut duplicate work.
 * @returns {{ ok: boolean, paths?: number[][], shiftsBefore?: object[][][], reason?: string }}
 */
function shiftAwareSolve(board0, queue0, words) {
  const failMemo = new Set();
  let nodes = 0;

  function failKey(board, queue, wi) {
    return wi + "\0" + board.flat().join("") + "\0" + queue.join("");
  }

  function dfs(board, queue, wi, pathsAcc, shiftsAcc) {
    nodes++;
    if (nodes > MAX_DFS_NODES) {
      return {
        ok: false,
        reason: "aborted: exceeded PUZZLE_MAX_NODES=" + MAX_DFS_NODES,
      };
    }
    if (wi >= words.length) {
      if (queue.length === 0) {
        return { ok: true, paths: pathsAcc, shiftsBefore: shiftsAcc };
      }
      return { ok: false, reason: "queue not empty after words, left " + queue.length };
    }

    const fk = failKey(board, queue, wi);
    if (USE_FAIL_MEMO && failMemo.has(fk)) {
      return { ok: false, reason: "memo dead" };
    }

    const w = words[wi];
    for (const seq of genShiftSeqs(MAX_SHIFT_OPS_BETWEEN_WORDS)) {
      const bShifted = applySeqToBoard(board, seq);
      const paths = findAllPathsOnBoard(bShifted, w, MAX_PATHS_PER_SHIFT_SEQ);
      if (process.env.PUZZLE_DEBUG && wi === 0 && seq.length === 0) {
        console.error("[debug] word0 paths with no preshift:", paths.length);
      }
      for (const path of paths) {
        const applied = applyCommit(bShifted, queue, path, w);
        if (!applied) continue;
        const sub = dfs(
          applied.board,
          applied.queue,
          wi + 1,
          [...pathsAcc, path],
          [...shiftsAcc, seq]
        );
        if (sub.ok) return sub;
        if (sub.reason && sub.reason.startsWith("aborted:")) return sub;
      }
    }

    if (USE_FAIL_MEMO) failMemo.add(fk);
    return {
      ok: false,
      reason:
        "exhausted shifts/paths at word " +
        wi +
        " (" +
        w +
        ") — no full completion from this state",
    };
  }

  const out = dfs(cloneBoard(board0), queue0.slice(), 0, [], []);
  if (!out.ok && out.reason && !out.reason.startsWith("aborted:")) {
    out.nodesExplored = nodes;
  } else if (out.ok) {
    out.nodesExplored = nodes;
  }
  return out;
}

function shiftSeqLabel(seq) {
  if (!seq.length) return "[]";
  return seq.map((o) => `${o.t}${o.s > 0 ? "+" : ""}${o.s}`).join(" → ");
}

const raw = process.argv[2] || "";
if (!raw.trim()) {
  console.error("Usage: node scripts/analyze-puzzle-json.mjs '{...json...}'");
  console.error(
    "Optional env: PUZZLE_SHIFT_DEPTH (default 3), PUZZLE_MAX_PATHS (default 80)"
  );
  process.exit(1);
}

const p = JSON.parse(raw);
const grid = p.starting_grid ?? p.startingGrid;
const next = p.next_letters ?? p.nextLetters;
const hunt = (p.perfect_hunt ?? p.perfectHunt).map((w) => String(w).toLowerCase());

if (!Array.isArray(grid) || grid.length !== 4) throw new Error("bad grid");
if (!Array.isArray(next) || next.length !== 50) throw new Error("bad next_letters");
if (!Array.isArray(hunt) || hunt.length !== PERFECT_HUNT_WORD_COUNT) {
  throw new Error("bad perfect_hunt (need " + PERFECT_HUNT_WORD_COUNT + " words)");
}

const scored = hunt.map((w) => ({
  w,
  wordTotal: getLiveWordScoreBreakdownFromLabels(wordToTileLabelSequence(w)).wordTotal,
}));
scored.sort((a, b) => a.wordTotal - b.wordTotal || a.w.localeCompare(b.w));
const wordsAsc = scored.map((x) => x.w);

/** Each valid play replaces exactly minUniqueTilesForReuseRule glyphs; hunt plays must sum to 50. */
const sumMinRepl = wordsAsc.reduce(
  (s, w) => s + minUniqueTilesForReuseRule(wordToTileLabelSequence(w)),
  0
);
if (sumMinRepl !== 50) {
  console.log(
    "Precheck FAIL: Σ min unique replacement cells =",
    sumMinRepl,
    "for this ascending hunt, but next_letters length is 50."
  );
  console.log(
    "No sequence of " +
      PERFECT_HUNT_WORD_COUNT +
      " valid words can drain the queue — shifts/path search cannot fix that."
  );
  console.log(
    "Words (ascending wordTotal):",
    wordsAsc
      .map(
        (w) => w + "(" + minUniqueTilesForReuseRule(wordToTileLabelSequence(w)) + ")"
      )
      .join(", ")
  );
  process.exit(1);
}

console.log(
  "shift-aware solve (max",
  MAX_SHIFT_OPS_BETWEEN_WORDS,
  "ops between words, max",
  MAX_PATHS_PER_SHIFT_SEQ,
  "paths per seq)…"
);

const sol = shiftAwareSolve(grid, next, wordsAsc);
if (sol.ok) {
  console.log(
    "RESULT: OK — full ascending-order completion with shifts + queue drain."
  );
  let sumUniq = 0;
  for (let i = 0; i < wordsAsc.length; i++) {
    const sh = sol.shiftsBefore[i];
    const path = sol.paths[i];
    const u = uniquesInPathOrder(path).length;
    sumUniq += u;
    console.log(" ", i, wordsAsc[i], "| shifts:", shiftSeqLabel(sh), "| uniqRepl:", u);
  }
  console.log("sum(unique replacement cells):", sumUniq, "/ 50");

  const v = verifyForwardPuzzle(grid, next, wordsAsc, sol.paths);
  console.log(
    "verifyForwardPuzzle (no shifts, export contract):",
    v.ok ? "OK" : v.reason
  );
} else {
  console.log("RESULT:", sol.reason);
  if (sol.nodesExplored != null) console.log("DFS nodes explored:", sol.nodesExplored);
  if (sol.paths && sol.paths.length === PERFECT_HUNT_WORD_COUNT) {
    const v = verifyForwardPuzzle(grid, next, wordsAsc, sol.paths);
    console.log("verifyForwardPuzzle:", v.ok ? "OK" : v.reason);
  } else {
    console.log(
      "verifyForwardPuzzle: skipped (no full solution — export sim assumes no shifts)"
    );
  }
}
