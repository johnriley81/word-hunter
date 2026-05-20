#!/usr/bin/env node
/**
 * Build pool rows into JSON lines for `text/puzzles.txt`.
 *
 *   node scripts/export-built-puzzle-lines.mjs --from 0 --to 99 --out text/puzzles.txt --shift --shift-exhaustive16
 *   node scripts/export-built-puzzle-lines.mjs --from 0 --target 100 --out text/puzzles.txt --shift …
 *
 * `--target N` scans the pool until N rows are written (skips failures). `--seed-skew` tries
 * `(rowSeed + si*4093)` per row. `--skip-cheap-tier` with `--tiered` runs one full pass only.
 */

import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  normalizePuzzleRow,
  serializePuzzleRow,
  validatePuzzleRow,
} from "../js/puzzle-row-format.js";
import { tryBuildAutomatedPuzzle } from "../js/puzzle-export-sim/auto-puzzle-build.js";
import { createPuzzleBuildCli, mergeAutoBuildOpts } from "./lib/puzzle-build-cli.mjs";
import {
  discoverAndRefresh,
  substituteBlockedInPool,
  wordsFromPoolEntry,
} from "./lib/pool-problematic.mjs";
import { loadProblematicWordsSet } from "./lib/problematic-words.mjs";
import { swapWordBucketsForCli } from "./lib/puzzle-build-cli.mjs";
import { PUZZLE_POOL_JSON, repoRoot } from "./lib/puzzle-build-paths.mjs";

const cli = createPuzzleBuildCli();
const from = cli.argvNum("--from", 0);
const toIncl = cli.argvNum("--to", 0);
const append = cli.hasFlag("--append") || cli.hasFlag("-a");
const failFast = cli.hasFlag("--fail-fast");
const verbose = cli.hasFlag("--verbose");
const exportTiered = cli.hasFlag("--tiered");
const skipCheapTier = cli.hasFlag("--skip-cheap-tier");
const allowAmbiguousSpelling = cli.hasFlag("--allow-ambiguous-spelling");
const lookaheadOn = cli.hasFlag("--lookahead");
const substituteProblematic = !cli.hasFlag("--no-substitute-problematic");
const discoverProblematic = !cli.hasFlag("--no-discover-problematic");
const maxDiscoverRoundsPerRow = Math.max(
  1,
  Math.floor(cli.argvNum("--discover-max-rounds", 4))
);
const targetCount = Math.max(0, Math.floor(cli.argvNum("--target", 0)));

let problematicWords = loadProblematicWordsSet();
let swapBuckets = swapWordBucketsForCli(cli);

const seedSkewArgvIx = cli.argv.indexOf("--seed-skew");
let exportSeedSkew = Math.max(
  0,
  Math.floor(
    seedSkewArgvIx !== -1 && seedSkewArgvIx + 1 < cli.argv.length
      ? Number(cli.argv[seedSkewArgvIx + 1])
      : 0
  )
);
if (!Number.isFinite(exportSeedSkew)) exportSeedSkew = 0;
if (exportTiered && exportSeedSkew === 0 && seedSkewArgvIx === -1) {
  exportSeedSkew = 120;
}

if (cli.pathCatalog) console.error("[export-built] path catalog loaded");

const outIx = cli.argv.indexOf("--out");
const outArg = outIx !== -1 ? cli.argv[outIx + 1] : "";
const outPath =
  outArg && String(outArg).trim() !== ""
    ? String(outArg).startsWith("/")
      ? String(outArg)
      : resolve(repoRoot, String(outArg))
    : null;

const rawPool = readFileSync(PUZZLE_POOL_JSON, "utf8");
const pool = JSON.parse(rawPool);
const puzzles = pool.puzzles;
if (!Array.isArray(puzzles) || puzzles.length === 0) {
  console.error("No puzzles in pool:", PUZZLE_POOL_JSON);
  process.exit(1);
}

const lo = Math.max(0, Math.floor(from));
let hi =
  Number.isFinite(toIncl) && toIncl > 0
    ? Math.min(puzzles.length - 1, Math.floor(toIncl))
    : Math.min(puzzles.length - 1, lo);
if (targetCount > 0) {
  hi = Math.min(puzzles.length - 1, Math.max(hi, lo + targetCount * 4));
}

if (hi < lo) {
  console.error("--to must be >= --from", lo, hi);
  process.exit(1);
}
if (!outPath) {
  console.error("Need --out path");
  process.exit(1);
}

const seedBase = cli.argvNum("--seed-base", 42);
const sameSeedEveryRow = cli.hasFlag("--same-seed-every-row");

function seedForRow(pi) {
  const b = Math.floor(Number(seedBase)) || 42;
  if (sameSeedEveryRow) return b >>> 0;
  return (pi * 9973 + b) >>> 0;
}

function buildExportTierList() {
  if (!exportTiered || skipCheapTier) {
    return [
      {
        label: exportSeedSkew === 0 ? "single" : "full",
        maxSeedSkew: exportSeedSkew,
        wholeBuildAttempts: cli.wholeBuildAttempts,
        lookaheadProbeNext: lookaheadOn,
      },
    ];
  }
  const cheapSkew = Math.max(2, Math.min(exportSeedSkew, 80));
  const cheapAttempts = Math.max(40, Math.floor(cli.wholeBuildAttempts * 0.45));
  return [
    {
      label: "cheap",
      maxSeedSkew: cheapSkew,
      wholeBuildAttempts: cheapAttempts,
      lookaheadProbeNext: false,
    },
    {
      label: "full",
      maxSeedSkew: exportSeedSkew,
      wholeBuildAttempts: cli.wholeBuildAttempts,
      lookaheadProbeNext: lookaheadOn,
    },
  ];
}

function buildOptsForSeed(seed, tier) {
  const {
    wholeBuildAttempts: att = cli.wholeBuildAttempts,
    lookaheadProbeNext = lookaheadOn,
  } = tier ?? {};
  return mergeAutoBuildOpts(cli, seed, {
    wholeBuildAttempts: att,
    requireUniqueSpelling: !allowAmbiguousSpelling,
    lookaheadProbeNext,
    placementOrder: cli.shiftOn ? "input" : undefined,
  });
}

function diagnosticBuild(words, pi, tier) {
  const seed = (seedForRow(pi) + Math.imul(Math.max(0, tier.maxSeedSkew), 4093)) >>> 0;
  return tryBuildAutomatedPuzzle(words, {
    ...buildOptsForSeed(seed, tier),
    returnFailureTally: true,
    returnLastPlacementFailure: true,
    returnLastPlayPathUniqFailure: true,
    wholeBuildAttempts: tier.wholeBuildAttempts,
    lookaheadProbeNext: tier.lookaheadProbeNext,
  });
}

function tryBuildWordsWithTierSkew(words, pi, tier) {
  const seedBaseRow = seedForRow(pi);
  const logEvery =
    tier.maxSeedSkew > 160
      ? 40
      : tier.maxSeedSkew > 60
        ? 25
        : Math.max(1, Math.ceil(tier.maxSeedSkew / 8));
  for (let si = 0; si <= tier.maxSeedSkew; si++) {
    const seed = (seedBaseRow + Math.imul(si, 4093)) >>> 0;
    if (verbose && si > 0 && (si === tier.maxSeedSkew || si % logEvery === 0)) {
      console.error(
        `[export-built] pool ${pi} [${tier.label}] skew ${si}/${tier.maxSeedSkew}`
      );
    }
    const r = tryBuildAutomatedPuzzle(words, buildOptsForSeed(seed, tier));
    if (r.ok && r.row) return r;
  }
  return null;
}

function tryExportPoolRow(words, pi) {
  for (const tier of buildExportTierList()) {
    if (verbose) console.error(`[export-built] pool ${pi} tier "${tier.label}"`);
    const r = tryBuildWordsWithTierSkew(words, pi, tier);
    if (r) return r;
  }
  return null;
}

let ok = 0;
let skipped = 0;
const errors = [];
let lastPoolIndex = lo;

if (!append) writeFileSync(outPath, "", "utf8");

for (let pi = lo; pi <= hi && (targetCount <= 0 || ok < targetCount); pi++) {
  lastPoolIndex = pi;
  const entry = puzzles[pi];
  if (!Array.isArray(entry.words) || entry.words.length !== 7) {
    errors.push({ pi, id: entry.id, reason: "pool row missing seven words" });
    skipped++;
    if (failFast) break;
    continue;
  }

  const seed = seedForRow(pi);
  let words = substituteBlockedInPool(
    wordsFromPoolEntry(entry, cli.shiftOn),
    problematicWords,
    /** @type {Map<string, unknown>} */ (swapBuckets),
    seed,
    {
      enabled: substituteProblematic,
      logPrefix: verbose ? `[export-built] pool ${pi}` : undefined,
      verbose,
    }
  );

  let r = null;
  for (
    let discoverRound = 0;
    discoverRound < maxDiscoverRoundsPerRow;
    discoverRound++
  ) {
    r = tryExportPoolRow(words, pi);
    if (r?.ok && r.row) break;
    if (!discoverProblematic || discoverRound + 1 >= maxDiscoverRoundsPerRow) break;

    const tiers = buildExportTierList();
    const diag = diagnosticBuild(words, pi, tiers[tiers.length - 1]);
    const refreshed = discoverAndRefresh(
      diag,
      problematicWords,
      `[export-built] pool ${pi}`
    );
    if (!refreshed) break;
    problematicWords = refreshed.blocked;
    swapBuckets = refreshed.buckets;
    words = substituteBlockedInPool(words, problematicWords, swapBuckets, seed, {
      enabled: substituteProblematic,
      logPrefix: verbose ? `[export-built] pool ${pi}` : undefined,
      verbose,
    });
  }

  if (!r?.ok || !r.row) {
    errors.push({
      pi,
      id: entry.id,
      reason: "build failed",
      seed,
    });
    skipped++;
    if (verbose) console.error("[export-built]", pi, entry.id, "FAIL", seed);
    if (failFast) break;
    continue;
  }

  try {
    const norm = normalizePuzzleRow(/** @type {Record<string, unknown>} */ (r.row));
    validatePuzzleRow(norm);
    appendFileSync(outPath, serializePuzzleRow(norm) + "\n", "utf8");
    ok++;
    if (verbose || (pi - lo) % 50 === 0) {
      console.error("[export-built]", pi, entry.id, "ok", `(${ok} written)`);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push({ pi, id: entry.id, reason: msg });
    skipped++;
    if (failFast) break;
  }
}

console.log(
  JSON.stringify(
    {
      pool: PUZZLE_POOL_JSON.replace(repoRoot + "/", ""),
      rangeInclusive: [lo, lastPoolIndex],
      targetCount: targetCount > 0 ? targetCount : undefined,
      written: ok,
      skipped,
      out: outPath.replace(repoRoot + "/", ""),
    },
    null,
    2
  )
);
if (errors.length && errors.length <= 48) {
  console.error(JSON.stringify({ errors }, null, 2));
} else if (errors.length > 48) {
  console.error(`${errors.length} errors (use --verbose or --fail-fast)`);
}

process.exit(
  targetCount > 0 && ok < targetCount ? 2 : errors.length && ok === 0 ? 2 : 0
);
