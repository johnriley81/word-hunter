/**
 * Shared argv parsing and `tryBuildAutomatedPuzzle` option assembly for build/regen CLIs.
 */

import { loadPathCatalogIfReady } from "../../js/puzzle-export-sim/load-path-catalog.js";
import { DEFAULT_PATH_CATALOG } from "./puzzle-build-paths.mjs";

/** @typedef {import("../../js/puzzle-export-sim/auto-puzzle-build.js").tryBuildAutomatedPuzzle} TryBuildAutomatedPuzzle */

/**
 * @param {string[] | undefined} argv
 */
export function createPuzzleBuildCli(argv = process.argv) {
  function hasFlag(flag) {
    return argv.includes(flag);
  }

  function argvNum(name, def) {
    const ix = argv.indexOf(name);
    if (ix === -1 || ix + 1 >= argv.length) return def;
    const v = Number(argv[ix + 1]);
    return Number.isFinite(v) ? v : def;
  }

  function argvOptionalPositiveInt(name) {
    const ix = argv.indexOf(name);
    if (ix === -1 || ix + 1 >= argv.length) return undefined;
    const v = Number(argv[ix + 1]);
    if (!Number.isFinite(v) || v <= 0) return undefined;
    return Math.floor(v);
  }

  const shiftExhaustive16 = hasFlag("--shift-exhaustive16");
  const shiftOn = hasFlag("--shift") || shiftExhaustive16;
  const noPathCatalog = hasFlag("--no-path-catalog");
  const pathCatalog = noPathCatalog
    ? null
    : loadPathCatalogIfReady(DEFAULT_PATH_CATALOG);

  const placementSamplesIx = argv.indexOf("--placement-samples");
  const placementSamplesParsed =
    placementSamplesIx !== -1 && placementSamplesIx + 1 < argv.length
      ? Number(argv[placementSamplesIx + 1])
      : NaN;

  const shared = {
    argv,
    hasFlag,
    argvNum,
    argvOptionalPositiveInt,
    shiftExhaustive16,
    shiftOn,
    pathCatalog,
    maxAttemptsPerWord: argvNum("--attempts-word", 12000),
    wholeBuildAttempts: argvNum("--attempts-build", 280),
    shiftMaxSteps: argvNum("--shift-max", 3),
    placementSamplesParsed,
    lookaheadAttemptsOpt: argvOptionalPositiveInt("--lookahead-attempts"),
    lookaheadInnerTriesOpt: argvOptionalPositiveInt("--lookahead-inner"),
    lookaheadNeutralSnap: hasFlag("--lookahead-neutral-snap"),
  };

  return shared;
}

/**
 * Core build flags used by auto-puzzle-build and export-built-puzzle-lines.
 *
 * @param {ReturnType<typeof createPuzzleBuildCli>} cli
 * @param {{
 *   seed: number;
 *   strictUniqueness?: boolean;
 *   lookaheadOn?: boolean;
 *   trace?: boolean;
 *   traceTiming?: boolean;
 *   skipForwardVerify?: boolean;
 * }} overrides
 * @returns {Parameters<TryBuildAutomatedPuzzle>[1]}
 */
export function makeAutoBuildOpts(cli, overrides) {
  const {
    seed,
    strictUniqueness = cli.hasFlag("--strict-uniqueness"),
    lookaheadOn = !cli.hasFlag("--no-lookahead") &&
      (cli.hasFlag("--lookahead") || cli.shiftOn),
    trace = cli.hasFlag("--trace"),
    traceTiming = cli.hasFlag("--trace-timing"),
    skipForwardVerify = cli.hasFlag("--no-verify") ||
      (cli.shiftOn && !cli.hasFlag("--verify")),
  } = overrides;

  /** @type {Parameters<TryBuildAutomatedPuzzle>[1]} */
  const o = {
    seed,
    maxAttemptsPerWord: cli.maxAttemptsPerWord,
    wholeBuildAttempts: cli.wholeBuildAttempts,
    shiftMaxSteps: cli.shiftMaxSteps,
    shiftBetweenWords: cli.shiftOn,
    requireUniqueSpelling: strictUniqueness,
    lookaheadProbeNext: lookaheadOn,
    debugTrace: trace,
    debugTiming: traceTiming,
  };
  if (cli.lookaheadAttemptsOpt !== undefined)
    o.lookaheadAttempts = cli.lookaheadAttemptsOpt;
  if (cli.lookaheadInnerTriesOpt !== undefined)
    o.lookaheadInnerTries = cli.lookaheadInnerTriesOpt;
  if (cli.lookaheadNeutralSnap) o.lookaheadPreferSnapshotLetterMatch = false;
  if (Number.isFinite(cli.placementSamplesParsed) && cli.placementSamplesParsed >= 1) {
    o.placementCandidateSamples = Math.min(48, Math.floor(cli.placementSamplesParsed));
  }
  if (cli.pathCatalog) o.pathCatalog = cli.pathCatalog;
  if (skipForwardVerify) o.skipForwardVerify = true;
  if (cli.shiftExhaustive16) o.interWordShiftMode = "exhaustive16";
  return o;
}

/**
 * @param {ReturnType<typeof createPuzzleBuildCli>} cli
 * @param {number} seed
 * @param {Partial<Parameters<TryBuildAutomatedPuzzle>[1]>} [extra]
 */
export function mergeAutoBuildOpts(cli, seed, extra = {}) {
  return { ...makeAutoBuildOpts(cli, { seed }), ...extra };
}

/**
 * Regen/export: verify on unless `--no-verify`; shift exhaustive16 from cli.
 *
 * @param {ReturnType<typeof createPuzzleBuildCli>} cli
 * @param {number} seed
 * @param {Partial<Parameters<TryBuildAutomatedPuzzle>[1]>} tierOverrides
 */
export function makeRegenBuildOpts(cli, seed, tierOverrides = {}) {
  /** @type {Parameters<TryBuildAutomatedPuzzle>[1]} */
  const o = {
    seed,
    shiftMaxSteps: cli.shiftMaxSteps,
    shiftBetweenWords: cli.shiftOn,
    requireUniqueSpelling: true,
    ...tierOverrides,
  };
  if (cli.pathCatalog) o.pathCatalog = cli.pathCatalog;
  if (cli.hasFlag("--no-verify")) o.skipForwardVerify = true;
  if (cli.shiftExhaustive16) o.interWordShiftMode = "exhaustive16";
  return o;
}
