/** argv: puzzle JSON — ascending-score hunt replay, FIFO sack, optional shifts (see env vars below). */

import {
  wordToTileLabelSequence,
  normalizeTileText,
  minUniqueTilesForReuseRule,
  getLiveWordScoreBreakdownFromLabels,
  applyColumnShiftInPlace,
  applyRowShiftInPlace,
} from "../js/board-logic.js";
import {
  verifyForwardPuzzle,
  canonicalNextLettersFromJsonArray,
  stripTrailingEmptyNextLetters,
  tryApplyFifoLetterRefillsAfterWordSubmission,
  replacementTilesFirstVisitFlatOrder,
  computeShiftAwareStarterHints,
} from "../js/puzzle-export-sim.js";
import { PERFECT_HUNT_WORD_COUNT, NEXT_LETTERS_LEN } from "../js/config.js";

const N = 4;

function envInt(key, fallback) {
  const raw = process.env[key];
  if (raw === undefined || raw === "") return fallback;
  const v = Number(raw);
  return Number.isFinite(v) ? Math.trunc(v) : fallback;
}

const MAX_SHIFT_OPS_BETWEEN_WORDS = Math.max(0, envInt("PUZZLE_SHIFT_DEPTH", 2));
const MAX_PATHS_PER_SHIFT_SEQ = Math.max(1, envInt("PUZZLE_MAX_PATHS", 40));
const MAX_DFS_NODES = Math.max(1000, envInt("PUZZLE_MAX_NODES", 2_000_000));

const USE_FAIL_MEMO = process.env.PUZZLE_NO_MEMO !== "1";

const SHIFT_PRIM = [
  { t: "col", s: 1 },
  { t: "col", s: -1 },
  { t: "row", s: 1 },
  { t: "row", s: -1 },
  { t: "col", s: 2 },
  { t: "row", s: 2 },
];

const NEIGHBORS8_4 = (() => {
  const nn = N;
  const adj = [];
  for (let f = 0; f < nn * nn; f++) {
    const r = Math.floor(f / nn);
    const c = f % nn;
    const xs = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nr < nn && nc >= 0 && nc < nn) xs.push(nr * nn + nc);
      }
    }
    adj[f] = xs;
  }
  return adj;
})();

function neighbors8Flat(f) {
  return NEIGHBORS8_4[f];
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
  const path = [];
  const g0 = glyphs[0];
  const firstStarts = [];
  for (let f = 0; f < N * N; f++) {
    if (cellLetter(board, f) === g0) firstStarts.push(f);
  }

  function dfs(i) {
    if (out.length >= limit) return;
    if (i === glyphs.length) {
      if (new Set(path).size === minTiles) out.push(path.slice());
      return;
    }
    const need = glyphs[i];
    const cand = i === 0 ? firstStarts : neighbors8Flat(path[path.length - 1]);
    for (let j = 0; j < cand.length; j++) {
      const f = cand[j];
      if (cellLetter(board, f) !== need) continue;
      path.push(f);
      dfs(i + 1);
      path.pop();
    }
  }

  dfs(0);
  return out;
}

function applyCommit(board, queue, path, word) {
  const b = cloneBoard(board);
  const q = queue.slice();
  if (!pathMatchesWord(b, path, word)) return null;
  if (!tryApplyFifoLetterRefillsAfterWordSubmission(b, q, path, N)) return null;
  return { board: b, queue: q };
}

function pathMatchesWord(board, path, word) {
  const glyphs = wordToTileLabelSequence(word);
  if (path.length !== glyphs.length) return false;
  for (let i = 0; i < path.length; i++) {
    const f = path[i];
    const r = Math.floor(f / N);
    const c = f % N;
    if (normalizeTileText(board[r][c]) !== normalizeTileText(glyphs[i])) return false;
  }
  return true;
}

/** DFS: shift combos × paths × commits; caches dead memo states. */
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
      return {
        ok: false,
        reason: "queue not empty after words, left " + queue.length,
        failWi: wi,
      };
    }

    const fk = failKey(board, queue, wi);
    if (USE_FAIL_MEMO && failMemo.has(fk)) {
      return { ok: false, reason: "memo dead", failWi: wi };
    }

    const w = words[wi];
    /** @type {{ ok: false; reason: string; failWi?: number } | null} */
    let bestChildFail = null;

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
        if (!sub.ok) {
          const subWi = typeof sub.failWi === "number" ? sub.failWi : wi + 1;
          if (!bestChildFail || subWi > (bestChildFail.failWi ?? -1)) {
            bestChildFail = { ok: false, reason: sub.reason, failWi: subWi };
          }
        }
      }
    }

    if (USE_FAIL_MEMO) failMemo.add(fk);

    const localFail = {
      ok: false,
      reason:
        "exhausted shifts/paths at word " +
        wi +
        " (" +
        w +
        ") — no full completion from this state",
      failWi: wi,
    };
    if (bestChildFail != null && (bestChildFail.failWi ?? -1) > wi) {
      return bestChildFail;
    }
    return localFail;
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

const printHintsJson = process.argv.includes("--hints-json");
const raw = process.argv.find((a, i) => i >= 2 && a !== "--hints-json") ?? "";
if (!raw.trim()) {
  console.error(
    "Usage: node scripts/analyze-puzzle-json.mjs '{...json...}' [--hints-json]"
  );
  console.error(
    "Env: PUZZLE_SHIFT_DEPTH, PUZZLE_MAX_PATHS, PUZZLE_MAX_NODES, PUZZLE_NO_MEMO, PUZZLE_DEBUG"
  );
  console.error(
    '  --hints-json  prints {"perfect_hunt_starter_flats":[...],"perfect_hunt_starter_neighbor_sigs":[...]}'
  );
  console.error(
    "    from the shift-aware solver replay (omit if using static export-only replay)."
  );
  process.exit(1);
}

const p = JSON.parse(raw);
const grid = p.starting_grid ?? p.startingGrid;
const nextRaw = p.next_letters ?? p.nextLetters;
const hunt = (p.perfect_hunt ?? p.perfectHunt).map((w) => String(w).toLowerCase());

if (!Array.isArray(grid) || grid.length !== 4) throw new Error("bad grid");
if (!Array.isArray(nextRaw)) throw new Error("bad next_letters");
let next;
try {
  next = canonicalNextLettersFromJsonArray(nextRaw);
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  throw new Error("bad next_letters: " + msg);
}
if (!Array.isArray(hunt) || hunt.length !== PERFECT_HUNT_WORD_COUNT) {
  throw new Error("bad perfect_hunt (need " + PERFECT_HUNT_WORD_COUNT + " words)");
}

const scored = hunt.map((w) => ({
  w,
  wordTotal: getLiveWordScoreBreakdownFromLabels(wordToTileLabelSequence(w)).wordTotal,
}));
scored.sort((a, b) => a.wordTotal - b.wordTotal || a.w.localeCompare(b.w));
const wordsAsc = scored.map((x) => x.w);

const sumMinRepl = wordsAsc.reduce(
  (s, w) => s + minUniqueTilesForReuseRule(wordToTileLabelSequence(w)),
  0
);
if (sumMinRepl !== NEXT_LETTERS_LEN) {
  console.log(
    "Precheck FAIL: Σ min unique replacement cells =",
    sumMinRepl,
    "for this ascending hunt, but next_letters length is " + NEXT_LETTERS_LEN + "."
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
    const u = replacementTilesFirstVisitFlatOrder(path).length;
    sumUniq += u;
    console.log(" ", i, wordsAsc[i], "| shifts:", shiftSeqLabel(sh), "| uniqRepl:", u);
  }
  console.log("sum(unique replacement cells):", sumUniq, "/" + NEXT_LETTERS_LEN);

  const v = verifyForwardPuzzle(grid, next, wordsAsc, sol.paths);
  console.log(
    "verifyForwardPuzzle (no shifts, export contract):",
    v.ok ? "OK" : v.reason
  );
  if (printHintsJson) {
    const hints = computeShiftAwareStarterHints(
      grid,
      stripTrailingEmptyNextLetters(next.slice()),
      wordsAsc,
      sol.paths,
      sol.shiftsBefore,
      {}
    );
    console.log("");
    console.log("hints-json (--hints-json, shift-aware replay):");
    console.log(JSON.stringify(hints));
    if (!v.ok) {
      console.log("");
      console.log(
        "note: export verifyForward failed; these presets match the analyzer’s shift+hunt replay."
      );
    }
  }
} else {
  console.log("RESULT:", sol.reason);
  if (sol.nodesExplored != null) console.log("DFS nodes explored:", sol.nodesExplored);
  if (sol.paths && sol.paths.length === PERFECT_HUNT_WORD_COUNT) {
    const v = verifyForwardPuzzle(grid, next, wordsAsc, sol.paths);
    console.log("verifyForwardPuzzle:", v.ok ? "OK" : v.reason);
  } else {
    console.log("verifyForwardPuzzle: skipped (no full path set)");
  }
}
