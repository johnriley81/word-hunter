/** Writes pregen puzzle-pool.json: six words, Σ min_tiles = 50, JSON lists words by descending wordTotal (low-score opener has 8 tile labels). */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { PERFECT_HUNT_WORD_COUNT } from "../js/config.js";
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
  Math.min(10, parseInt(process.env.RECOG_MIN || "8", 10) || 8)
);

const POOL_OVERSAMPLE = Math.max(
  1,
  parseInt(process.env.POOL_OVERSAMPLE || "2", 10) || 2
);

const POOL_RANK_BY_LETTER_UNION = process.env.POOL_RANK_BY_LETTER_UNION !== "0";

/** Tie-break after letter union: "max" = higher Σ wordTotal; "target" = near POOL_WORD_TOTAL_TARGET. */
const POOL_WORD_TOTAL_RANK = process.env.POOL_WORD_TOTAL_RANK || "max";
const POOL_WORD_TOTAL_TARGET =
  parseInt(process.env.POOL_WORD_TOTAL_TARGET || "1100", 10) || 1100;

const HUNT = PERFECT_HUNT_WORD_COUNT;
const TARGET_MIN_SUM = 50;

/** Integer partitions of TARGET_MIN_SUM into HUNT parts (min tile counts 6–11). */
const MIN_TILE_PATTERNS = [
  [7, 8, 8, 9, 9, 9],
  [8, 8, 8, 8, 9, 9],
  [7, 7, 8, 9, 9, 10],
  [6, 8, 8, 9, 9, 10],
  [7, 8, 8, 8, 9, 10],
  [6, 7, 9, 9, 9, 10],
  [8, 8, 9, 9, 8, 8],
];

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
      "Missing " +
        path +
        " — run: npm run gen:word-rec\n" +
        "(Requires Python 3 and text/word_metrics_7_10.pkl.)"
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
  const raw = readFileSync(join(root, "text/wordlist.txt"), "utf8");
  const set = new Set();
  const out = [];
  for (const line of raw.split("\n")) {
    const w = line.trim().toLowerCase();
    if (!w || !/^[a-z]+$/.test(w)) continue;
    const labels = wordToTileLabelSequence(w);
    const n = labels.length;
    if (n < 8 || n > 14) continue;
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

/** Unique a–z letters across the six spelling strings (max 26). */
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

function tryBuildPuzzle(rng, byMin, pattern) {
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
  if (openerLabels.length !== 8) return null;
  const sum = entries.reduce((s, e) => s + e.min_tiles, 0);
  if (sum !== TARGET_MIN_SUM) return null;
  return { words: entries };
}

function main() {
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
    if (m < 6 || m > 11) continue;
    if (!byMin.has(m)) byMin.set(m, []);
    byMin.get(m).push(e);
  }

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
    const pattern = MIN_TILE_PATTERNS[Math.floor(rng() * MIN_TILE_PATTERNS.length)];
    const built = tryBuildPuzzle(rng, byMin, pattern);
    if (!built) continue;
    const sorted = built.words.map((x) => x.word).sort();
    const key = puzzleKey(sorted);
    if (seen.has(key)) continue;
    seen.add(key);
    const u = letterUnionSize(built.words);
    const scoreSum = puzzleWordTotalSum(built.words);
    puzzles.push({
      words: built.words,
      letterUnionSize: u,
      puzzleWordTotalSum: scoreSum,
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
    words: p.words.slice().reverse(),
  }));

  writeFileSync(
    outPath,
    JSON.stringify({ version: 1, count: numbered.length, puzzles: numbered }, null, 2) +
      "\n",
    "utf8"
  );
  console.log(
    `Wrote ${
      numbered.length
    } puzzles to ${outPath} (RECOG_MIN=${RECOG_MIN}, rankByLetterUnion=${POOL_RANK_BY_LETTER_UNION}, wordTotalRank=${POOL_WORD_TOTAL_RANK}${
      POOL_WORD_TOTAL_RANK === "target" ? " target=" + POOL_WORD_TOTAL_TARGET : ""
    })`
  );
}

main();
