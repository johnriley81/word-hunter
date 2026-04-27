/** Writes text/gamemaker/pregen/puzzle-pool.json — PERFECT_HUNT_WORD_COUNT words per row, Σ min_tiles = 50, strict ascending wordTotal, opener has 8 tile labels. */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
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

function loadCandidateWords() {
  const raw = readFileSync(join(root, "text/wordlist.txt"), "utf8");
  const set = new Set();
  const out = [];
  for (const line of raw.split("\n")) {
    const w = line.trim().toLowerCase();
    if (!w || !/^[a-z]+$/.test(w)) continue;
    const labels = wordToTileLabelSequence(w);
    const n = labels.length;
    if (n < 8 || n > 14) continue;
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
  const poolWords = loadCandidateWords();
  if (poolWords.length < 40) {
    console.error("Too few candidate words after filter");
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

  const rng = mulberry32(SEED);
  const puzzles = [];
  const seen = new Set();
  let attempts = 0;
  const maxAttempts = POOL_SIZE * 2000;

  while (puzzles.length < POOL_SIZE && attempts < maxAttempts) {
    attempts++;
    const pattern = MIN_TILE_PATTERNS[Math.floor(rng() * MIN_TILE_PATTERNS.length)];
    const built = tryBuildPuzzle(rng, byMin, pattern);
    if (!built) continue;
    const sorted = built.words.map((x) => x.word).sort();
    const key = puzzleKey(sorted);
    if (seen.has(key)) continue;
    seen.add(key);
    puzzles.push({
      id: `pool-${String(puzzles.length + 1).padStart(4, "0")}`,
      words: built.words,
    });
  }

  if (puzzles.length < POOL_SIZE) {
    console.warn(
      `Only generated ${puzzles.length} puzzles (wanted ${POOL_SIZE}); try new SEED or relax filters`
    );
  }

  const outDir = join(root, "text/gamemaker/pregen");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "puzzle-pool.json");
  writeFileSync(
    outPath,
    JSON.stringify({ version: 1, count: puzzles.length, puzzles }, null, 2) + "\n",
    "utf8"
  );
  console.log(`Wrote ${puzzles.length} puzzles to ${outPath}`);
}

main();
