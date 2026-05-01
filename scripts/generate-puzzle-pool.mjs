/** Pregen puzzle-pool.json: Σ min_tiles = NEXT_LETTERS_LEN; rows high→low wordTotal; opener = openingLabelLen glyphs. */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { NEXT_LETTERS_LEN } from "../js/config.js";
import {
  wordToTileLabelSequence,
  wordReuseStats,
  getLiveWordScoreBreakdownFromLabels,
} from "../js/board-logic.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const POOL_SIZE = Math.max(1, parseInt(process.env.POOL_SIZE || "1000", 10) || 1000);
const SEED = parseInt(process.env.SEED || "42", 10) || 42;
const RECOG_MIN = Math.max(
  1,
  Math.min(10, parseInt(process.env.RECOG_MIN || "7", 10) || 7)
);

const POOL_OVERSAMPLE = Math.max(
  1,
  parseInt(process.env.POOL_OVERSAMPLE || "2", 10) || 2
);

const POOL_RANK_BY_LETTER_UNION = process.env.POOL_RANK_BY_LETTER_UNION !== "0";

/** After reuse + letterUnion: Σ wordTotal (“max”), or distance to POOL_WORD_TOTAL_TARGET (“target”). */
const POOL_WORD_TOTAL_RANK = process.env.POOL_WORD_TOTAL_RANK || "max";
const POOL_WORD_TOTAL_TARGET =
  parseInt(process.env.POOL_WORD_TOTAL_TARGET || "1100", 10) || 1100;

/** Σreuse = Σ(labelLength − min_tiles). Rank: reuse (max | near target | ignore), then letterUnion, then wordTotals. */
const POOL_REUSE_SUM_TARGET = Math.max(
  0,
  parseInt(process.env.POOL_REUSE_SUM_TARGET || "10", 10) || 10
);
const POOL_REUSE_RANK = process.env.POOL_REUSE_RANK || "max";

/** Defaults must match filter-word-recogniz-by-tile-length.mjs. */
const TILE_LABEL_MIN = Math.max(
  1,
  parseInt(process.env.TILE_LABEL_MIN || "8", 10) || 8
);
const TILE_LABEL_MAX = Math.max(
  TILE_LABEL_MIN,
  parseInt(process.env.TILE_LABEL_MAX || "16", 10) || 16
);

/** Puzzle-generator lexicon path relative to repo root (defaults to text/wordlist.txt). Env: PUZZLE_WORDLIST. */
const PUZZLE_WORDLIST_REL = (
  process.env.PUZZLE_WORDLIST || "text/wordlist.txt"
).replace(/^\//, "");

const TARGET_MIN_SUM = NEXT_LETTERS_LEN;

/** Partitions of 66 into seven min_tile counts (6–12 each). */
const MIN_TILE_PATTERNS = [
  [9, 9, 9, 9, 10, 10, 10],
  [8, 9, 9, 10, 10, 10, 10],
  [8, 8, 9, 10, 11, 10, 10],
  [10, 10, 9, 10, 9, 10, 8],
  [11, 10, 10, 9, 9, 9, 8],
  [11, 10, 9, 10, 9, 9, 8],
  [11, 9, 9, 9, 10, 10, 8],
  [12, 9, 9, 9, 9, 9, 9],
  [10, 10, 10, 10, 9, 8, 9],
  [10, 10, 10, 9, 9, 9, 9],
];

/** Fallback when only min_tiles 9–10 buckets are non-empty. */
function minTilePatternsNineTenOnly() {
  const patterns = [];
  for (let a = 0; a < 7; a++) {
    for (let b = a + 1; b < 7; b++) {
      for (let c = b + 1; c < 7; c++) {
        const p = Array(7).fill(9);
        p[a] = p[b] = p[c] = 10;
        patterns.push(p);
      }
    }
  }
  return patterns;
}

function viableMinTilePatterns(byMin) {
  const viable = MIN_TILE_PATTERNS.filter((pattern) =>
    pattern.every((m) => (byMin.get(m)?.length ?? 0) > 0)
  );
  if (viable.length > 0) return viable;

  const alt = minTilePatternsNineTenOnly();
  const ok = alt.filter((pattern) =>
    pattern.every((m) => (byMin.get(m)?.length ?? 0) > 0)
  );
  return ok.length > 0 ? ok : [];
}

function computeMinOpeningLabelLen(poolWords) {
  let n = Infinity;
  for (const w of poolWords) {
    const len = wordToTileLabelSequence(w).length;
    if (len < n) n = len;
  }
  return Number.isFinite(n) ? n : 8;
}

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function loadRecognizabilityMap() {
  const path = join(root, "text/gamemaker/pregen/word-recognizability.json");
  if (!existsSync(path)) {
    console.error(
      `Missing ${path} — run: npm run gen:word-rec (see README for metrics pickle).`
    );
    process.exit(1);
  }
  const j = JSON.parse(readFileSync(path, "utf8"));
  const words = j.words;
  if (!words || typeof words !== "object") {
    console.error("word-recognizability.json: expected top-level .words object");
    process.exit(1);
  }
  return words;
}

/** @param {Record<string, number>} recMap */
function loadCandidateWords(recMap) {
  const wordlistPath = join(root, PUZZLE_WORDLIST_REL);
  if (!existsSync(wordlistPath)) {
    console.error(`PUZZLE_WORDLIST not found: ${PUZZLE_WORDLIST_REL}`);
    process.exit(1);
  }
  const raw = readFileSync(wordlistPath, "utf8");
  const set = new Set();
  const out = [];
  for (const line of raw.split("\n")) {
    const w = line.trim().toLowerCase();
    if (!w || !/^[a-z]+$/.test(w)) continue;
    const labels = wordToTileLabelSequence(w);
    const n = labels.length;
    if (n < TILE_LABEL_MIN || n > TILE_LABEL_MAX) continue;
    const rec = recMap[w];
    if (typeof rec !== "number" || rec < RECOG_MIN) continue;
    if (set.has(w)) continue;
    set.add(w);
    out.push(w);
  }
  return out;
}

function wordEntry(word) {
  const labels = wordToTileLabelSequence(word);
  const st = wordReuseStats(labels);
  const { wordTotal } = getLiveWordScoreBreakdownFromLabels(labels);
  return {
    word,
    min_tiles: st.minTiles,
    reuse: st.reuse,
    wordTotal,
  };
}

function puzzleKey(sortedWords) {
  return sortedWords.join("\0");
}

/** Count of distinct letters used in spelling strings. */
function letterUnionSize(wordEntries) {
  const s = new Set();
  for (const e of wordEntries) {
    const w = String(e.word || "").toLowerCase();
    for (let i = 0; i < w.length; i++) {
      const ch = w[i];
      if (ch >= "a" && ch <= "z") s.add(ch);
    }
  }
  return s.size;
}

function puzzleWordTotalSum(wordEntries) {
  let s = 0;
  for (const e of wordEntries) {
    s += Number(e.wordTotal) || 0;
  }
  return s;
}

/** Σ per-word reuse (label glyphs minus minTiles). */
function puzzleReuseSum(wordEntries) {
  let s = 0;
  for (const e of wordEntries) {
    s += Number(e.reuse) || 0;
  }
  return s;
}

function reuseSortCompare(a, b) {
  if (POOL_REUSE_RANK === "ignore") return 0;
  if (POOL_REUSE_RANK === "max") {
    return (b.reuseSum || 0) - (a.reuseSum || 0);
  }
  const da = Math.abs((a.reuseSum || 0) - POOL_REUSE_SUM_TARGET);
  const db = Math.abs((b.reuseSum || 0) - POOL_REUSE_SUM_TARGET);
  return da - db;
}

function tryBuildPuzzle(rng, byMin, pattern, openingLabelLen) {
  const picked = [];
  const words = [];
  for (const m of pattern) {
    const bucket = byMin.get(m);
    if (!bucket || bucket.length === 0) return null;
    const e = bucket[Math.floor(rng() * bucket.length)];
    if (words.includes(e.word)) return null;
    words.push(e.word);
    picked.push(e);
  }
  const entries = picked
    .slice()
    .sort((a, b) =>
      a.wordTotal !== b.wordTotal
        ? a.wordTotal - b.wordTotal
        : a.word.localeCompare(b.word)
    );
  for (let i = 1; i < entries.length; i++) {
    if (entries[i].wordTotal <= entries[i - 1].wordTotal) return null;
  }
  const openerLabels = wordToTileLabelSequence(entries[0].word);
  if (openerLabels.length !== openingLabelLen) return null;
  const sum = entries.reduce((s, e) => s + e.min_tiles, 0);
  if (sum !== TARGET_MIN_SUM) return null;
  return { words: entries };
}

function main() {
  console.error(`Puzzle candidate lexicon: ${PUZZLE_WORDLIST_REL}`);
  const recMap = loadRecognizabilityMap();
  const poolWords = loadCandidateWords(recMap);
  if (poolWords.length < 40) {
    console.error(
      "Too few candidate words after recognizability >= " +
        RECOG_MIN +
        " and tile filter (" +
        poolWords.length +
        ")"
    );
    process.exit(1);
  }

  const byMin = new Map();
  for (const w of poolWords) {
    const e = wordEntry(w);
    const m = e.min_tiles;
    if (m < 6 || m > 12) continue;
    if (!byMin.has(m)) byMin.set(m, []);
    byMin.get(m).push(e);
  }

  const patterns = viableMinTilePatterns(byMin);
  if (patterns.length === 0) {
    console.error(
      "No min_tiles partition fits non-empty buckets; relax RECOG_MIN or fix word/rec data."
    );
    process.exit(1);
  }

  const openingLabelLen = computeMinOpeningLabelLen(poolWords);

  const collectTarget = POOL_RANK_BY_LETTER_UNION
    ? POOL_SIZE * POOL_OVERSAMPLE
    : POOL_SIZE;

  const rng = mulberry32(SEED);
  const puzzles = [];
  const seen = new Set();
  let attempts = 0;
  const maxAttempts = Math.max(POOL_SIZE * 2000, collectTarget * 4000);

  while (puzzles.length < collectTarget && attempts < maxAttempts) {
    attempts++;
    const pattern = patterns[Math.floor(rng() * patterns.length)];
    const built = tryBuildPuzzle(rng, byMin, pattern, openingLabelLen);
    if (!built) continue;
    const sorted = built.words.map((x) => x.word).sort();
    const key = puzzleKey(sorted);
    if (seen.has(key)) continue;
    seen.add(key);
    const u = letterUnionSize(built.words);
    const scoreSum = puzzleWordTotalSum(built.words);
    const reuseSum = puzzleReuseSum(built.words);
    puzzles.push({
      words: built.words,
      letterUnionSize: u,
      puzzleWordTotalSum: scoreSum,
      reuseSum,
    });
  }

  let finalPuzzles = puzzles;
  if (POOL_RANK_BY_LETTER_UNION && puzzles.length > 0) {
    const byTarget =
      POOL_WORD_TOTAL_RANK === "target"
        ? (a, b) => {
            const da = Math.abs((a.puzzleWordTotalSum || 0) - POOL_WORD_TOTAL_TARGET);
            const db = Math.abs((b.puzzleWordTotalSum || 0) - POOL_WORD_TOTAL_TARGET);
            return da - db;
          }
        : (a, b) => (b.puzzleWordTotalSum || 0) - (a.puzzleWordTotalSum || 0);
    finalPuzzles = puzzles
      .slice()
      .sort(
        (a, b) =>
          reuseSortCompare(a, b) ||
          (b.letterUnionSize || 0) - (a.letterUnionSize || 0) ||
          byTarget(a, b) ||
          puzzleKey(a.words.map((x) => x.word).sort()).localeCompare(
            puzzleKey(b.words.map((x) => x.word).sort())
          )
      )
      .slice(0, POOL_SIZE);
  } else {
    finalPuzzles = puzzles.slice(0, POOL_SIZE);
  }

  if (finalPuzzles.length < POOL_SIZE) {
    console.warn(
      `Only generated ${finalPuzzles.length} puzzles (wanted ${POOL_SIZE}); try new SEED or relax filters`
    );
  }

  const outDir = join(root, "text/gamemaker/pregen");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "puzzle-pool.json");
  const numbered = finalPuzzles.map((p, i) => ({
    id: `pool-${String(i + 1).padStart(4, "0")}`,
    letterUnionSize: p.letterUnionSize,
    puzzleWordTotalSum: p.puzzleWordTotalSum,
    reuseSum: p.reuseSum,
    words: p.words.slice().reverse(),
  }));

  writeFileSync(
    outPath,
    JSON.stringify(
      {
        version: 1,
        openingLabelLen,
        poolReuseSumTarget: POOL_REUSE_SUM_TARGET,
        poolReuseRank: POOL_REUSE_RANK,
        tileLabelLength: [TILE_LABEL_MIN, TILE_LABEL_MAX],
        count: numbered.length,
        puzzles: numbered,
      },
      null,
      2
    ) + "\n",
    "utf8"
  );
  console.log(
    `Wrote ${
      numbered.length
    } puzzles to ${outPath} (RECOG_MIN=${RECOG_MIN}, openingLabelLen=${openingLabelLen}, tileLabels=${TILE_LABEL_MIN}–${TILE_LABEL_MAX}, rank reuse→letterUnion→ΣwordTotal; reuseRank=${POOL_REUSE_RANK}${
      POOL_REUSE_RANK === "near" ? " targetΣreuse=" + POOL_REUSE_SUM_TARGET : ""
    }, rankByLetterUnion=${POOL_RANK_BY_LETTER_UNION}, wordTotalRank=${POOL_WORD_TOTAL_RANK}${
      POOL_WORD_TOTAL_RANK === "target"
        ? " targetΣwordTotal=" + POOL_WORD_TOTAL_TARGET
        : ""
    })`
  );
}

main();
