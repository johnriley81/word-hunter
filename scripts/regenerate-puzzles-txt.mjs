#!/usr/bin/env node
/**
 * Rebuild `text/puzzles.txt` from existing rows' `perfect_hunt` lists using the current
 * `tryBuildAutomatedPuzzle` + forward verify pipeline (unique spelling + lookahead defaults here).
 *
 * Pool metadata is reconstructed per word via reuse/min_tiles/wordTotal (same as puzzle-pool gen).
 *
 * Placement now counts spelling ambiguity against the **full** `starting_grid` even when overlay
 * search ignores snapshot gates; regen may reject rows / need more `--seed-skew` or `--attempts-build`.
 * Rows that slipped through older builds may require another full regen against the tightened check.
 *
 * Inter-word board shifts are **off by default**. Pass **`--shift`** for `shiftBetweenWords: true`.
 * Pass **`--shift-exhaustive16`** (implies **`--shift`**) for all 16 torus grid layouts before each word placement.
 * Shift placement uses ascending hunt order and requires a non-identity rotation from the home orientation before each word after the first.
 * Forward replay verify runs by default; pass **`--no-verify`** to skip.
 *
 * Usage:
 *   node scripts/regenerate-puzzles-txt.mjs [--in text/puzzles.txt] [--shift] [--attempts-build N] [--seed-skew N]
 *   node scripts/regenerate-puzzles-txt.mjs [--no-lookahead] …
 *   node scripts/regenerate-puzzles-txt.mjs [--verbose-seeds] [--explain-last-failure] [--trace-build] [--debug-placement]
 *   Pass **`--no-word-swap`** to disable same-stats word alternates on placement failure (default: load puzzle-wordlist buckets).
 *   **`--no-substitute-problematic`** — do not swap blocked words out of `perfect_hunt` before build.
 *   **`--no-discover-problematic`** — do not append failing words and retry the row.
 *   node scripts/regenerate-puzzles-txt.mjs [--max-rows N] [--from-line K] …
 *   node scripts/regenerate-puzzles-txt.mjs [--out text/puzzles.new.txt] [--from-line N] [--reuse-prefix OLD.txt]
 *
 * Tiered search is **ON by default** (cheap skew pass, then full lookahead). Pass **`--no-tiered`** for one heavy pass only.
 * Pass **`--skip-cheap-tier`** to run only the lookahead **`full`** tier (same knobs as tier 2); avoids burning minutes on no-lookahead screening when pools need lookahead anyway.
 *
 * Rows can take minutes: each skew tries `tryBuildAutomatedPuzzle` once (expensive). Between lines the
 * process is working; stderr progress prints every few skew steps and **always logs seed-skew 0** after each
 * tier starts (use **`--verbose-seeds`** for every skew). Pass **`--explain-last-failure`** to dump failure
 * tallies when a row gives up; pass **`--trace-build`** for fine-grained timings per slot / placement call / path-search heartbeat.
 *
 * Resuming stopped runs:
 *   - Prefer **`--max-rows N`** to rebuild only the first row (or **`--from-line K --max-rows 1`** for one line) while
 *     copying **`--in`** tail unchanged — good for smoke tests before running a full regen with no **`--max-rows`**.
 *   - To **iterate faster** while tuning the pipe, lower **`--seed-skew`** and **`--attempts-build`** and write a side file
 *     (npm **`regen:puzzle:dev`** → **`text/puzzles.dev.txt`**) until playthrough confirms behavior; raise knobs and rerun
 *     **`regen:puzzle:one`** / **`regen:puzzles:inplace`** for production-quality grids.
 *   - Prefer `--out` pointing at a new file until the batch finishes, then mv/replace when done.
 *   - `--from-line K` skips regenerating lines 1 … K−1 (copied verbatim from `--reuse-prefix`
 *     if passed, otherwise from `--in`). After each regenerated row we flush `--out` so a kill retains
 *     completed tails.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { comparePoolWordEntriesDesc } from "../js/puzzle-build/pool-order.js";
import { tryBuildAutomatedPuzzle } from "../js/puzzle-export-sim/auto-puzzle-build.js";
import {
  normalizePuzzleRow,
  serializePuzzleRow,
  validatePuzzleRow,
} from "../js/puzzle-row-format.js";
import {
  createPuzzleBuildCli,
  makeRegenBuildOpts,
  swapWordBucketsForCli,
} from "./lib/puzzle-build-cli.mjs";
import {
  discoverAndRefresh,
  substituteBlockedInPool,
} from "./lib/pool-problematic.mjs";
import { loadProblematicWordsSet } from "./lib/problematic-words.mjs";
import { wordEntryFromWord } from "./lib/word-pool-entry.mjs";
import { repoRoot } from "./lib/puzzle-build-paths.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = repoRoot;
const cli = createPuzzleBuildCli();
const pathCatalog = cli.pathCatalog;
if (pathCatalog) {
  console.error(`[regen] path catalog loaded`);
}

function hasFlag(flag) {
  return cli.hasFlag(flag);
}

function argvNum(name, def) {
  return cli.argvNum(name, def);
}

function argvOptionalPath(name) {
  const ix = process.argv.indexOf(name);
  if (ix === -1 || ix + 1 >= process.argv.length) return null;
  const p = String(argv[ix + 1] || "").trim();
  return p === "" ? null : resolve(root, p);
}

const argv = cli.argv;

const inIx = argv.indexOf("--in");
const inPath =
  inIx !== -1 && inIx + 1 < argv.length
    ? resolve(root, argv[inIx + 1])
    : resolve(root, "text/puzzles.txt");

const outPath = argvOptionalPath("--out") ?? inPath;
const reusePrefixPath = argvOptionalPath("--reuse-prefix");

const shiftExhaustive16 = cli.shiftExhaustive16;
const shiftOn = cli.shiftOn;
if (shiftExhaustive16) {
  console.error(`[regen] inter-word shift mode: exhaustive16`);
}
const verboseSeeds = hasFlag("--verbose-seeds") || hasFlag("--v");
/** After all seeds exhaust for a row, run one traced build with tallies printed to stderr. */
const explainLastFailure = hasFlag("--explain-last-failure");
/** Verbose **`[auto-build]`** / **`[path-search]`** lines on stderr (temporary profiling). */
const traceBuild = hasFlag("--trace-build");
/** Log which word/slot failed placement and optional swaps without full trace. */
const debugPlacement = hasFlag("--debug-placement");
/** Replace blocked `perfect_hunt` spellings with same-stats alternates before build (default on). */
const substituteProblematic = !hasFlag("--no-substitute-problematic");
/** On row failure, append newly found words to `problematic-words.txt` and retry (default on). */
const discoverProblematic = !hasFlag("--no-discover-problematic");
const maxDiscoverRoundsPerRow = Math.max(
  1,
  Math.floor(argvNum("--discover-max-rounds", 12))
);
/** When set, `tryBuildAutomatedPuzzle` never probes the next word — much faster (forward verify still runs unless **`--no-verify`**). */
const noLookaheadProbe = hasFlag("--no-lookahead");
/** Tiered cheap→full rounds (default ON). Override with `--no-tiered`. */
const tiered = !hasFlag("--no-tiered");
/** With tiered mode: omit cheap no-lookahead tier; run lookahead **`full`** pass only (`--seed-skew` / `--attempts-build` apply). */
const skipCheapTier = hasFlag("--skip-cheap-tier");
/** Skip forward replay verify (`--no-verify` only). */
const skipForwardVerify = hasFlag("--no-verify");

const wholeBuildAttempts = Math.max(40, Math.floor(argvNum("--attempts-build", 250)));
const maxSeedSkew = Math.max(0, Math.floor(argvNum("--seed-skew", 80)));
const seedBase = argvNum("--seed-base", 42);

/** 1-based: regenerate from this line onward; earlier lines copied verbatim */
const fromLine = Math.max(1, Math.floor(argvNum("--from-line", 1)));
const startLi = fromLine - 1;

/** Regenerate at most this many puzzles from `--from-line` onward; omit for all remaining lines */
const ixMaxRows = argv.indexOf("--max-rows");
/** @type {number} */
let maxRows = Number.POSITIVE_INFINITY;
if (ixMaxRows !== -1 && ixMaxRows + 1 < argv.length) {
  const v = Math.floor(Number(argv[ixMaxRows + 1]));
  maxRows = Number.isFinite(v) && v >= 1 ? v : 1;
}

/** Logs every skew step when stderr is interactive; otherwise every `step` skips. */
let seedLogStep =
  maxSeedSkew <= 120
    ? Math.max(1, Math.ceil(maxSeedSkew / 24))
    : Math.max(5, Math.ceil(maxSeedSkew / 20));

/** @param {Parameters<typeof tryBuildAutomatedPuzzle>[1]} tierExtras @param {number} dbgSeed */
function runDiagnosticBuild(poolSeven, dbgSeed, tierExtras) {
  return tryBuildAutomatedPuzzle(
    poolSeven,
    makeRegenBuildOpts(cli, dbgSeed, {
      ...tierExtras,
      returnFailureTally: true,
      returnLastPlacementFailure: true,
      returnLastPlayPathUniqFailure: true,
      debugVerify: true,
      debugVerbose: traceBuild,
      diagnoseBuild: true,
      placementOrder: "input",
    })
  );
}

function rowForLineWithTiers(opts) {
  const {
    oldLines,
    li,
    rowLabelOneBased,
    tiers,
    traceBuild,
    swapBuckets,
    substituteProblematic,
  } = opts;
  const j = JSON.parse(oldLines[li]);
  /** Shift builds place in ascending hunt order; fixed-grid regen keeps desc toolbar order. */
  let poolSeven = shiftOn
    ? j.perfect_hunt.map(wordEntryFromWord)
    : j.perfect_hunt.map(wordEntryFromWord).sort(comparePoolWordEntriesDesc);
  const base = (li * 9973 + Math.floor(Number(seedBase) || 42)) >>> 0;

  poolSeven = substituteBlockedInPool(
    poolSeven,
    problematicWords,
    /** @type {Map<string, unknown>} */ (swapBuckets),
    base,
    {
      enabled: substituteProblematic,
      logPrefix: `[regen] row ${rowLabelOneBased}`,
      verbose: true,
    }
  );
  if (!substituteProblematic) {
    const blockedInRow = poolSeven
      .map((e) => e.word)
      .filter((w) => problematicWords.has(w));
    if (blockedInRow.length) {
      console.warn(
        `[regen] row ${rowLabelOneBased}: blocklisted words in perfect_hunt: ${blockedInRow.join(
          ", "
        )}`
      );
    }
  }

  for (let ti = 0; ti < tiers.length; ti++) {
    const cfg = tiers[ti];
    const skewCap = cfg.maxSeedSkew;
    const attempts = cfg.wholeBuildAttempts;
    const lookahead = cfg.lookaheadProbeNext;
    seedLogStep =
      skewCap <= 120
        ? Math.max(1, Math.ceil(skewCap / 24))
        : Math.max(5, Math.ceil(skewCap / 20));

    const t0Row = Date.now();
    console.error(
      `[regen] row ${rowLabelOneBased}: tier "${
        cfg.label
      }" seeds 0..${skewCap} (buildAttempts=${attempts}, maxPath/word=${
        cfg.maxAttemptsPerWord ?? 10000
      }, lookahead=${lookahead})`
    );

    for (let si = 0; si <= skewCap; si++) {
      if (
        verboseSeeds ||
        si === 0 ||
        (si > 0 && si % seedLogStep === 0) ||
        si === skewCap
      ) {
        const elapsedSec = ((Date.now() - t0Row) / 1000).toFixed(1);
        console.error(
          `[regen] row ${rowLabelOneBased} [${cfg.label}] seed-skew ${si}/${skewCap} (${elapsedSec}s tier-elapsed)`
        );
      }
      const seed = (base + Math.imul(si, 4093)) >>> 0;
      const r = tryBuildAutomatedPuzzle(
        poolSeven,
        makeRegenBuildOpts(cli, seed, {
          wholeBuildAttempts: attempts,
          lookaheadProbeNext: lookahead,
          maxAttemptsPerWord: cfg.maxAttemptsPerWord ?? 10000,
          placementCandidateSamples: cfg.placementCandidateSamples ?? 6,
          ...(typeof cfg.pathSearchExploreBudget === "number" &&
          cfg.pathSearchExploreBudget > 0
            ? { pathSearchExploreBudget: Math.floor(cfg.pathSearchExploreBudget) }
            : {}),
          ...(typeof cfg.lookaheadAttempts === "number" && cfg.lookaheadAttempts > 0
            ? { lookaheadAttempts: Math.floor(cfg.lookaheadAttempts) }
            : {}),
          ...(typeof cfg.lookaheadInnerTries === "number" && cfg.lookaheadInnerTries > 0
            ? { lookaheadInnerTries: Math.floor(cfg.lookaheadInnerTries) }
            : {}),
          debugVerbose: traceBuild,
          diagnoseBuild: explainLastFailure || debugPlacement,
          placementOrder: "input",
        })
      );
      if (r.ok && r.row) {
        console.error(`[regen] row ${rowLabelOneBased}: ok (${cfg.label}, skew=${si})`);
        return r.row;
      }
    }
  }

  const hunt = poolSeven.map((e) => e.word).join(", ");
  const lastCfg = tiers[tiers.length - 1];
  const lastSi = Math.max(0, lastCfg.maxSeedSkew);
  const dbgSeed = (base + Math.imul(lastSi, 4093)) >>> 0;
  const tierExtras = {
    wholeBuildAttempts: lastCfg.wholeBuildAttempts,
    lookaheadProbeNext: lastCfg.lookaheadProbeNext,
    maxAttemptsPerWord: lastCfg.maxAttemptsPerWord ?? 10000,
    placementCandidateSamples: lastCfg.placementCandidateSamples ?? 6,
    ...(typeof lastCfg.pathSearchExploreBudget === "number" &&
    lastCfg.pathSearchExploreBudget > 0
      ? { pathSearchExploreBudget: Math.floor(lastCfg.pathSearchExploreBudget) }
      : {}),
    ...(typeof lastCfg.lookaheadAttempts === "number" && lastCfg.lookaheadAttempts > 0
      ? { lookaheadAttempts: Math.floor(lastCfg.lookaheadAttempts) }
      : {}),
    ...(typeof lastCfg.lookaheadInnerTries === "number" &&
    lastCfg.lookaheadInnerTries > 0
      ? { lookaheadInnerTries: Math.floor(lastCfg.lookaheadInnerTries) }
      : {}),
  };
  const diag = runDiagnosticBuild(poolSeven, dbgSeed, tierExtras);
  if (explainLastFailure || discoverProblematic) {
    console.error(
      `[regen] row ${rowLabelOneBased}: diagnostic last seed (${dbgSeed}) -> ${
        diag.ok
          ? "ok (unexpected)"
          : JSON.stringify({
              reason: diag.reason,
              failureTally: diag.failureTally ?? null,
              lastPlacementFailure: diag.lastPlacementFailure ?? null,
              lastPlayPathUniqFailure: diag.lastPlayPathUniqFailure ?? null,
            })
      }`
    );
  }
  const err = new Error(`[regenerate-puzzles-txt] build failed row ${li + 1}: ${hunt}`);
  /** @type {Record<string, unknown>} */
  err.buildDiag = diag;
  throw err;
}

function buildTiers() {
  if (!tiered) {
    return [
      {
        label: "single",
        maxSeedSkew,
        wholeBuildAttempts,
        maxAttemptsPerWord: 5600,
        pathSearchExploreBudget: 400_000,
        lookaheadProbeNext: !noLookaheadProbe,
        lookaheadAttempts: 920,
        lookaheadInnerTries: 7,
      },
    ];
  }
  if (skipCheapTier) {
    return [
      {
        label: "full",
        maxSeedSkew,
        wholeBuildAttempts,
        maxAttemptsPerWord: 8000,
        pathSearchExploreBudget: 460_000,
        lookaheadProbeNext: !noLookaheadProbe,
        lookaheadAttempts: 920,
        lookaheadInnerTries: 7,
      },
    ];
  }
  const cheapSkew = Math.max(2, Math.min(maxSeedSkew, 40));
  const pct = Math.floor(wholeBuildAttempts * 0.45);
  /** Cheap screens seeds without lookahead; cap outer builds/skew (**`14 … 22`**) so we still advance seeds quickly; **`full`** uses **`--attempts-build`**. */
  const cheapAttempts = Math.min(Math.max(pct, 14), 22);
  return [
    {
      label: "cheap",
      maxSeedSkew: cheapSkew,
      wholeBuildAttempts: cheapAttempts,
      lookaheadProbeNext: false,
      maxAttemptsPerWord: 5600,
      pathSearchExploreBudget: 380000,
    },
    {
      label: "full",
      maxSeedSkew,
      wholeBuildAttempts,
      maxAttemptsPerWord: 8000,
      pathSearchExploreBudget: 460_000,
      lookaheadProbeNext: !noLookaheadProbe,
      lookaheadAttempts: 920,
      lookaheadInnerTries: 7,
    },
  ];
}

const raw = readFileSync(inPath, "utf8");
const oldLines = raw.split("\n").filter((ln) => ln.trim().length > 0);

/** First index AFTER the last regenerated line (exclusive) */
const regenEndExclusive = Math.min(oldLines.length, startLi + maxRows);

const prefixSourceRaw = readFileSync(reusePrefixPath ?? inPath, "utf8");
const prefixLines = prefixSourceRaw.split("\n").filter((ln) => ln.trim().length > 0);

if (prefixLines.length < startLi) {
  throw new Error(
    `[regenerate-puzzles-txt] need at least ${startLi} lines in prefix source (got ${prefixLines.length})`
  );
}

let problematicWords = loadProblematicWordsSet();
let swapBuckets = swapWordBucketsForCli(cli);

const tiers = buildTiers();
if (skipForwardVerify) {
  console.warn("[regen] forward replay verify disabled (--no-verify)");
}
const outLines = [];

for (let li = 0; li < startLi; li++) {
  outLines.push(prefixLines[li].trim());
}

if (regenEndExclusive < oldLines.length) {
  console.error(
    `[regen] partial run: rewriting lines ${
      startLi + 1
    }–${regenEndExclusive} only; copying lines ${regenEndExclusive + 1}–${
      oldLines.length
    } verbatim from input`
  );
}

for (let li = startLi; li < regenEndExclusive; li++) {
  const preview = JSON.parse(oldLines[li]).perfect_hunt.slice(0, 2).join(", ");
  console.error(`[regen] ${li + 1}/${oldLines.length}: ${preview} …`);

  let rowRaw = null;
  for (
    let discoverRound = 0;
    discoverRound < maxDiscoverRoundsPerRow;
    discoverRound++
  ) {
    try {
      rowRaw = rowForLineWithTiers({
        oldLines,
        li,
        rowLabelOneBased: li + 1,
        tiers,
        traceBuild,
        swapBuckets,
        substituteProblematic,
      });
      break;
    } catch (err) {
      const buildDiag = /** @type {{ buildDiag?: Record<string, unknown> }} */ (err)
        .buildDiag;
      if (
        !discoverProblematic ||
        !buildDiag ||
        discoverRound + 1 >= maxDiscoverRoundsPerRow
      ) {
        throw err;
      }
      const refreshed = discoverAndRefresh(
        /** @type {Parameters<typeof discoverAndRefresh>[0]} */ (buildDiag),
        problematicWords,
        `[regen] row ${li + 1}`
      );
      if (!refreshed) throw err;
      problematicWords = refreshed.blocked;
      swapBuckets = refreshed.buckets;
    }
  }
  if (!rowRaw) {
    throw new Error(`[regen] row ${li + 1}: no result after discover rounds`);
  }

  const norm = normalizePuzzleRow(/** @type {Record<string, unknown>} */ (rowRaw));
  validatePuzzleRow(norm);
  outLines.push(serializePuzzleRow(norm));
  writeFileSync(outPath, outLines.join("\n") + "\n", "utf8");
  console.error(
    `[regen] flushed ${outLines.length} lines → ${outPath.replace(root + "/", "")}`
  );
}

for (let li = regenEndExclusive; li < oldLines.length; li++) {
  outLines.push(oldLines[li].trim());
}
writeFileSync(outPath, outLines.join("\n") + "\n", "utf8");
if (regenEndExclusive < oldLines.length) {
  console.error(
    `[regen] appended ${
      oldLines.length - regenEndExclusive
    } unchanged tail lines → ${outPath.replace(root + "/", "")}`
  );
}

console.error(
  JSON.stringify(
    {
      ok: outLines.length,
      in: inPath.replace(root + "/", ""),
      out: outPath.replace(root + "/", ""),
      fromLine,
      regeneratedLines: `[${startLi + 1}, ${regenEndExclusive}]`,
      maxRowsRaw: ixMaxRows === -1 ? "all" : maxRows,
      tiered,
      skipCheapTier,
      shiftOn,
      wholeBuildAttempts,
      maxSeedSkew,
      traceBuild,
    },
    null,
    2
  )
);
