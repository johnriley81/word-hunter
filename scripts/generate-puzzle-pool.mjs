/** Writes text/gamemaker/pregen/puzzle-pool.json (9-word rows). POOL_SIZE, SEED env optional. */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import {
  wordToTileLabelSequence,
  wordReuseStats,
  getLiveWordScoreBreakdownFromLabels,
} from "../js/board-logic.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const POOL_SIZE = Math.max(1, parseInt(process.env.POOL_SIZE || "1000", 10) || 1000);
const SEED = parseInt(process.env.SEED || "42", 10) || 42;

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
    if (n < 5 || n > 14) continue;
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

function pickNine(rng, pool) {
  const ix = new Set();
  while (ix.size < 9) {
    ix.add(Math.floor(rng() * pool.length));
  }
  return [...ix].map((i) => pool[i]);
}

function puzzleKey(sortedWords) {
  return sortedWords.join("\0");
}

function main() {
  const pool = loadCandidateWords();
  if (pool.length < 20) {
    console.error("Too few candidate words after filter");
    process.exit(1);
  }

  const rng = mulberry32(SEED);
  const puzzles = [];
  const seen = new Set();
  let attempts = 0;
  const maxAttempts = POOL_SIZE * 500;

  while (puzzles.length < POOL_SIZE && attempts < maxAttempts) {
    attempts++;
    const picked = pickNine(rng, pool);
    const sorted = [...picked].sort();
    const key = puzzleKey(sorted);
    if (seen.has(key)) continue;
    seen.add(key);
    puzzles.push({
      id: `pool-${String(puzzles.length + 1).padStart(4, "0")}`,
      words: picked.map(wordEntry),
    });
  }

  if (puzzles.length < POOL_SIZE) {
    console.warn(
      `Only generated ${puzzles.length} puzzles (wanted ${POOL_SIZE}); relax filters or increase maxAttempts`
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
