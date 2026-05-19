#!/usr/bin/env node
/**
 * Emit JSON Lines compatible with text/puzzles.txt: for each pool row in range,
 * run tryBuildAutomatedPuzzle, then serializePuzzleRow (same canonical packing as shipped puzzles).
 *
 * Usage:
 *   node scripts/export-built-puzzle-lines.mjs --from 0 --to 9 --out text/puzzles-new.jsonl
 *   node scripts/export-built-puzzle-lines.mjs --from 100 --to 199 --append --out text/puzzles.txt --lookahead --attempts-build 40
 *
 * Multi-seed (matches regen ergonomics): `--seed-skew N` tries `(base_seed + si*4093)` for si=0..N.
 * **`--attempts-word`** / **`--attempts-build`** default **`12000`** / **`280`** unless overridden.
 * `--tiered` runs a cheap no-lookahead skew pass plus a full pass (default `--seed-skew` becomes 120 when
 * tiered without an explicit `--seed-skew`).
 *
 * By default placements require gamemaker **unique spelling** on the snapped board (exactly one path per word —
 * nicer for players). Pass `--allow-ambiguous-spelling` to opt into ambiguous paths like `scripts/auto-puzzle-build`
 * without `--strict-uniqueness`.
 * Inter-word toroidal shifts are **off by default** during construction (`--shift` enables).
 * Shift builds skip forward replay verify by default (`--verify` to enable). See `auto-puzzle-build.mjs` header.
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
import { PUZZLE_POOL_JSON, repoRoot } from "./lib/puzzle-build-paths.mjs";

const cli = createPuzzleBuildCli();
const from = cli.argvNum("--from", 0);
const toIncl = cli.argvNum("--to", 0);
const append = cli.hasFlag("--append") || cli.hasFlag("-a");
const failFast = cli.hasFlag("--fail-fast");
const verbose = cli.hasFlag("--verbose");
const exportTiered = cli.hasFlag("--tiered");
const allowAmbiguousSpelling = cli.hasFlag("--allow-ambiguous-spelling");
const lookaheadOn = cli.hasFlag("--lookahead");

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

if (cli.pathCatalog) {
  console.error("[export-built] path catalog loaded");
}

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
const hi =
  Number.isFinite(toIncl) && toIncl > 0
    ? Math.min(puzzles.length - 1, Math.floor(toIncl))
    : Math.min(puzzles.length - 1, lo);

if (hi < lo) {
  console.error("--to must be >= --from", lo, hi);
  process.exit(1);
}

if (!outPath) {
  console.error("Need --out path (relative to repo root is fine)");
  process.exit(1);
}

const seedBase = cli.argvNum("--seed-base", 42);
const sameSeedEveryRow = cli.hasFlag("--same-seed-every-row");

/** @returns {number} */
function seedForRow(pi) {
  const b = Math.floor(Number(seedBase)) || 42;
  if (sameSeedEveryRow) return b >>> 0;
  return (pi * 9973 + b) >>> 0;
}

function buildExportTierList() {
  if (!exportTiered) {
    return [
      {
        label: exportSeedSkew === 0 ? "single" : "scan",
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

/** @returns {NonNullable<Parameters<typeof tryBuildAutomatedPuzzle>[1]>} */
function buildOptsForSeed(seed, tier) {
  const {
    wholeBuildAttempts: att = cli.wholeBuildAttempts,
    lookaheadProbeNext = lookaheadOn,
  } = tier ?? {};
  return mergeAutoBuildOpts(cli, seed, {
    wholeBuildAttempts: att,
    requireUniqueSpelling: !allowAmbiguousSpelling,
    lookaheadProbeNext,
  });
}

/** @param {ReturnType<typeof buildExportTierList>[number]} tier */
function tryBuildWordsWithTierSkew(words, /** @type {number} */ pi, tier) {
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
    if (r.ok && r.row) return /** @type {typeof r & { ok: true }} */ (r);
  }
  return null;
}

function tryExportPoolRow(words, /** @type {number} */ pi) {
  const tiers = buildExportTierList();
  for (let ti = 0; ti < tiers.length; ti++) {
    if (verbose && tiers.length > 1)
      console.error(
        `[export-built] pool ${pi} tier=${ti + 1}/${tiers.length} "${tiers[ti].label}"`
      );
    const r = tryBuildWordsWithTierSkew(words, pi, tiers[ti]);
    if (r) return r;
  }
  return null;
}

let ok = 0;
let skipped = 0;
const errors = [];

if (!append) {
  writeFileSync(outPath, "", "utf8");
}

for (let pi = lo; pi <= hi; pi++) {
  const entry = puzzles[pi];
  const words = entry.words;
  if (!Array.isArray(words) || words.length !== 7) {
    errors.push({ pi, id: entry.id, reason: "pool row missing seven words" });
    skipped++;
    if (failFast) break;
    continue;
  }

  const seed = seedForRow(pi);
  const r = tryExportPoolRow(words, pi);
  if (!r || !r.ok || !("row" in r)) {
    const failureReason =
      r && typeof r === "object" && "reason" in r ? String(r.reason ?? "") : "";
    errors.push({
      pi,
      id: entry.id,
      reason: failureReason.trim() !== "" ? failureReason : "build failed",
      seed,
    });
    skipped++;
    if (verbose)
      console.error("[export-built]", pi, entry.id, "FAIL", r?.reason, "seed", seed);
    if (failFast) break;
    continue;
  }

  try {
    const norm = normalizePuzzleRow(/** @type {Record<string, unknown>} */ (r.row));
    validatePuzzleRow(norm);
    const line = serializePuzzleRow(norm) + "\n";
    appendFileSync(outPath, line, "utf8");
    ok++;
    if (verbose) console.error("[export-built]", pi, entry.id, "ok", seed);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push({ pi, id: entry.id, reason: "serialize/validate: " + msg });
    skipped++;
    if (verbose) console.error("[export-built]", pi, entry.id, "serialize FAIL", msg);
    if (failFast) break;
  }
}

const summary = {
  pool: PUZZLE_POOL_JSON.replace(repoRoot + "/", ""),
  rangeInclusive: [lo, hi],
  written: ok,
  skipped,
  append,
  out: outPath.replace(repoRoot + "/", ""),
  tiered: exportTiered || exportSeedSkew > 0,
  seedSkew: exportSeedSkew,
};
console.log(JSON.stringify(summary, null, 2));
if (errors.length && errors.length <= 48)
  console.error(JSON.stringify({ errors }, null, 2));
else if (errors.length > 48)
  console.error(errors.length + " errors (suppress detail; rerange or --fail-fast)");

process.exit(errors.length ? 2 : 0);
