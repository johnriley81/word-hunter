#!/usr/bin/env node
/**
 * Automated puzzle builder: pick a 7-word pool row, random path placement, optional shifts, forward verify.
 *
 * `--strict-uniqueness` turns on unique spelling checks in path search (default off: ambiguous spellings allowed for higher success).
 * **`--attempts-word`** / **`--attempts-build`** default **`12000`** / **`280`** (aligned with robust regen flows).
 * Inter-word toroidal shifts are **off by default** (reliable verify path). Pass **`--shift`** to enable experimental rotates between commits (`shiftBetweenWords`).
 * Pass **`--shift-exhaustive16`** (implies **`--shift`**) to score placements on all 16 torus-translated grids before each word (after the first).
 * `--trace` logs each failed attempt (placement phase, export, verify) to stderr — use to see path vs lookahead stalls.
 * `--trace-timing` adds per-attempt milliseconds (stderr) and a failure tally if the build exhausts.
 * `--lookahead-attempts N` lookahead path-search budget per inner try (default 2200 in builder).
 * `--lookahead-inner N` inner candidate retries per placement slot (default 12).
 * `--lookahead` enables next-word lookahead (default on when `--shift`, off otherwise).
 * `--no-lookahead` disables lookahead (useful for quick local probing).
 * `--lookahead-neutral-snap` uses neutral neighbor shuffle for lookahead probe only (legacy; default ranks like-letter then blank tiles).
 * `--placement-samples K` stochastic draws per placement inner try to pick highest blank/like-letter score (default 8 in builder; pass 1 for single draw).
 * Shift builds skip forward replay verify by default; pass **`--verify`** to enable it.
 * **`--no-verify`** always skips verify (including fixed-grid runs).
 * `--no-sieve` disables shiftability prefilter when `--shift` and no `--pool-index` are provided.
 * `--sieve-pools N` number of pool rows to probe quickly before full build (default 120).
 * `--sieve-seeds N` quick seeds per row in sieve mode (default 4).
 * `--sieve-attempts-build N` whole-build attempts per quick probe (default 22).
 * `--sieve-attempts-word N` per-word attempts per quick probe (default 900).
 * `--sieve-top N` top ranked rows to attempt full build on (default 8).
 *
 * Placement is overlay-only: paths may cross snapshot letters; chrono simulate stamps on commit.
 *
 * Successful `--out`/stdout matches `text/puzzles.txt` (starting grid, next_letters, perfect_hunt, starter tor neighbors).
 * With `--shift`, output also includes `perfect_hunt_shifts_before` and verify replays those shifts.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { tryBuildAutomatedPuzzle } from "../js/puzzle-export-sim/auto-puzzle-build.js";
import { createPuzzleBuildCli, mergeAutoBuildOpts } from "./lib/puzzle-build-cli.mjs";
import { PUZZLE_POOL_JSON } from "./lib/puzzle-build-paths.mjs";

const cli = createPuzzleBuildCli();
const seed = cli.argvNum("--seed", 42);
const poolIndex = cli.argvNum("--pool-index", -1);
const verbose = cli.hasFlag("--verbose");
const noSieve = cli.hasFlag("--no-sieve");

if (cli.pathCatalog) {
  console.error(`[auto-puzzle-build] path catalog loaded`);
}
if (cli.shiftExhaustive16) {
  console.error(
    "[auto-puzzle-build] inter-word shift mode: exhaustive16 (all torus translations)"
  );
}
if (cli.hasFlag("--no-verify") || (cli.shiftOn && !cli.hasFlag("--verify"))) {
  const why = cli.hasFlag("--no-verify")
    ? "--no-verify"
    : cli.shiftOn
      ? "shift build (pass --verify to enable)"
      : "?";
  console.warn("[auto-puzzle-build] forward replay verify disabled (" + why + ")");
}

const sievePools = cli.argvNum("--sieve-pools", 120);
const sieveSeeds = cli.argvNum("--sieve-seeds", 4);
const sieveAttemptsBuild = cli.argvNum("--sieve-attempts-build", 22);
const sieveAttemptsWord = cli.argvNum("--sieve-attempts-word", 900);
const sieveTop = cli.argvNum("--sieve-top", 8);

const raw = readFileSync(PUZZLE_POOL_JSON, "utf8");
const pool = JSON.parse(raw);
const puzzles = pool.puzzles;
if (!Array.isArray(puzzles) || puzzles.length === 0) {
  console.error("No puzzles in pool");
  process.exit(1);
}

/**
 * @param {number} rowSeed
 * @param {Partial<Parameters<typeof tryBuildAutomatedPuzzle>[1]>} [overrides]
 */
function makeBuildOpts(rowSeed, overrides = {}) {
  return mergeAutoBuildOpts(cli, rowSeed, overrides);
}

/**
 * @param {{ id?: string, words?: unknown }} entry
 * @param {number} rowSeed
 * @param {Partial<Parameters<typeof tryBuildAutomatedPuzzle>[1]>} [overrides]
 */
function runBuild(entry, rowSeed, overrides = {}) {
  const words = entry.words;
  if (!Array.isArray(words) || words.length !== 7) {
    return {
      ok: false,
      reason: "Pool row must have seven words: " + String(entry.id || "(unknown)"),
    };
  }
  return tryBuildAutomatedPuzzle(words, makeBuildOpts(rowSeed, overrides));
}

/** @type {Array<{ entry: any, score: number, quickSuccesses: number }>} */
let candidates = [];
if (poolIndex >= 0 || !cli.shiftOn || noSieve) {
  const ix =
    poolIndex >= 0
      ? poolIndex % puzzles.length
      : (Math.abs(seed) % puzzles.length) % puzzles.length;
  candidates = [{ entry: puzzles[ix], score: 0, quickSuccesses: 0 }];
} else {
  const limitPools = Math.max(1, Math.min(puzzles.length, Math.floor(sievePools)));
  const probeSeeds = Math.max(1, Math.floor(sieveSeeds));
  for (let i = 0; i < limitPools; i++) {
    const ix = (Math.abs(seed) + i) % puzzles.length;
    const entry = puzzles[ix];
    let score = 0;
    let quickSuccesses = 0;
    for (let j = 0; j < probeSeeds; j++) {
      const probeSeed = (seed + i * 1009 + j * 9176) >>> 0;
      const rr = runBuild(entry, probeSeed, {
        wholeBuildAttempts: Math.max(1, Math.floor(sieveAttemptsBuild)),
        maxAttemptsPerWord: Math.max(50, Math.floor(sieveAttemptsWord)),
        returnFailureTally: true,
        debugTrace: false,
        debugTiming: false,
      });
      if (rr.ok) {
        quickSuccesses++;
        score += 1000000;
      } else {
        const t = rr.failureTally || {};
        score -= (t.fail_lookahead_inner || 0) * 8;
        score -= (t.fail_path_inner || 0) * 5;
        score -= (t.fail_verify || 0) * 60;
        score -= (t.fail_export_null || 0) * 100;
      }
    }
    candidates.push({ entry, score, quickSuccesses });
  }
  candidates.sort((a, b) => b.score - a.score);
  candidates = candidates.slice(0, Math.max(1, Math.floor(sieveTop)));
  if (verbose) {
    console.error(
      "[auto-build] sieve_top",
      candidates.map((c) => ({
        id: c.entry?.id,
        score: c.score,
        quickSuccesses: c.quickSuccesses,
      }))
    );
  }
}

let built = null;
let builtFromId = "";
for (let ci = 0; ci < candidates.length; ci++) {
  const entry = candidates[ci].entry;
  const seedTry = (seed + ci * 7919) >>> 0;
  const r = runBuild(entry, seedTry);
  if (r.ok) {
    built = r;
    builtFromId = String(entry?.id || "");
    break;
  }
}

if (!built || !built.ok) {
  console.error("exhausted selected pool rows without valid build");
  process.exit(2);
}

if (verbose) {
  console.error("Built from pool row", builtFromId || "(unknown)", "seed", seed);
}

const jsonLine = JSON.stringify(built.row);
const outIx = cli.argv.indexOf("--out");
const outPath = outIx !== -1 && cli.argv[outIx + 1] ? cli.argv[outIx + 1] : null;
if (outPath) {
  writeFileSync(outPath, jsonLine + "\n", "utf8");
} else {
  console.log(jsonLine);
}
