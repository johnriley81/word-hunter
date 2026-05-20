/**
 * Scripted puzzle construction: descend-score placement, optional toroidal
 * shifts **between chronological word commits only** (not during placement search for a word:
 * never inside inner placement retries or subsamples). **`auto-puzzle-build.mjs`** / **`export-built-puzzle-lines.mjs`** default
 * **`shiftBetweenWords: false`** (`--shift` enables); randomized path
 * symmetry + snapshot letter bias (see word-path-search).
 *
 * Placement uses **`pathCatalog`** first (`pickCatalogPathFlat`): every variant × four rotations,
 * ranked by blank-first snapshot score + hub tie-break (overlay — snapshot letters never gate legality).
 * DFS fallback is off when a catalog is loaded unless **`allowPlacementDfsFallback: true`**.
 *
 * Words are stamped in build list order (descending score). Export uses
 * `buildGamemakerDictExportPayload` (ascending `perfect_hunt`, descending sack stack for `next_letters`).
 * `simulateChronoToEndBoard`
 * commits each path onto the grid.
 */

import { GRID_SIZE, PERFECT_HUNT_WORD_COUNT } from "../config.js";
import {
  wordToTileLabelSequence,
  minUniqueTilesForReuseRule,
  normalizeTileText,
  normalizedExportedTorNeighborToken,
  torNeighborQuadExportTokensFromBoard,
} from "../board-logic.js";
import {
  comparePoolWordEntriesAscForwardExport,
  comparePoolWordEntriesDesc,
} from "../puzzle-build/pool-order.js";
import { buildGamemakerDictExportPayload } from "../puzzle-build/build-export-payload.js";
import {
  deriveCoveredPlaysForFinalGridFifo,
  simulateChronoToEndBoard,
} from "./chrono-build.js";
import {
  findRandomLegalPathFlat,
  mulberry32,
  pickBestPathFlatByCoverRotations,
  PLACEMENT_HUB_RANK_WEIGHT,
  scorePlacementCoverExisting,
  scoreReuseHubCentrality,
} from "./word-path-search.js";
import { pickCatalogPathFlat } from "./path-catalog/path-variant-catalog.js";
import {
  applyShiftSeqToBoard,
  canonicalOverlayGridFromShiftAscReplay,
  normalizeShiftsBeforeOps,
  pathSpellsWordOnBoard,
  shiftAwareStarterHintsReplay,
} from "./shift-starter.js";
import { replacementTilesFirstVisitFlatOrder } from "./refill-fifo.js";
import { verifyForwardPuzzleIfCoveredChain } from "./forward-verify.js";
import {
  assertUniqueFifoPlayPathOnBoard,
  assertUniqueFifoPlayPathsOnShippedGrid,
} from "./play-path-uniqueness.js";
import { resolveOneWordPathOnShippedGrid } from "./resolve-shipped-paths.js";
import {
  canonicalNextLettersFromJsonArray,
  stripLeadingEmptyNextLetters,
  stripTrailingEmptyNextLetters,
} from "./next-letters.js";
import { pickBestPlacementAcrossTorusTranslations } from "./torus-translations.js";
import { collectSwapAlternatesMatchingStats } from "../puzzle-build/swap-buckets.js";
import {
  allPlacedHuntPathsVisibleOnBoard,
  buildBetweenShiftCandidates,
  cloneBoard,
  deriveCoveredFromSnapshot,
  emptyBoard,
  randomBetweenShiftSeq,
  shuffledCopyWithRng,
  tileNormAt,
} from "./build-board-utils.js";

export { randomBetweenShiftSeq } from "./build-board-utils.js";

/** @typedef {{ word: string; min_tiles?: number; reuse?: number; wordTotal?: number }} PoolWordLike */

/**
 * @param {PoolWordLike[]} poolWordsSeven length 7
 * @param {{
 *   seed?: number;
 *   maxAttemptsPerWord?: number;
 *   wholeBuildAttempts?: number;
 *   shiftMaxSteps?: number;
 *   shiftBetweenWords?: boolean; toroidal shifts between chronological commits only. **`auto-puzzle-build.mjs`** /
 *   **`export-built-puzzle-lines.mjs`** default **`false`** (`--shift` enables); when **`true`**, recorded ops export as
 *   **`perfect_hunt_shifts_before`** (ascending hunt index); forward verify replays those shifts on the solved grid
 *   before each ascending path (paths stay in placement / post-shift coordinates) —
 *   runtime swipe parity vs chronological placement remains a separate alignment task.
 *   preferStraight?: boolean;
 *   requireUniqueSpelling?: boolean;
 *   preferSnapshotLetterMatch?: boolean;
 *   lookaheadProbeNext?: boolean;
 *   lookaheadAttempts?: number;
 *   lookaheadInnerTries?: number; used when **`lookaheadProbeNext`** — inner placement rounds per slot (default **`12`**). When lookahead is **off**, inner retries add little value (RNG already varies per placement subs and `wholeBuildAttempts`); default is **`1`** unless you pass **`lookaheadInnerTries`** explicitly.
 *   shiftGameplayOnlyPlacement?: boolean; when shifting, disable lookahead-based placement rejection so authoring mirrors gameplay per-word validity (default **`true`**).
 *   shiftUseLookaheadHeuristics?: boolean; when shifting, still allow lookahead inside shift candidate scoring even if `shiftGameplayOnlyPlacement` is enabled (default **`false`**).
 *   shiftRelaxUniqueSpelling?: boolean; when shifting, relax unique-spelling gate during authoring unless strict uniqueness is explicitly requested (default **`true`**).
 *   shiftFeasibilityProbeAttempts?: number; quick probe budget per shift candidate for current word (default derived from **`maxAttemptsPerWord`**).
 *   shiftFeasibilityLookaheadAttempts?: number; quick lookahead probe budget per shift candidate for the next word (default derived from `shiftFeasibilityProbeAttempts`).
 *   shiftFeasibilityCandidateLimit?: number; max shift candidates scored before each shifted step (default **`12`**).
 *   shiftBacktrackVariantLimit?: number; top scored shift variants retried for a step before declaring placement failure (default **`3`**).
 *   allowNoopShiftFallback?: boolean; when shifted step variants fail, append a no-op shift variant (`[]`) as last resort (default **`true`**).
 *   pathSearchExploreBudget?: number | undefined; **`maxExploreNodes`** per shuffle start inside `findRandomLegalPathFlat`; omit/unset for no path cap. Regen **`cheap`** sets this; **`full`** still applies a **`uniqCountExploreBudget`** default so ambiguity checks cannot run unbounded.
 *   uniqCountExploreBudget?: number | undefined; **`countGamemakerWordPathsOnBoard`** cap per uniq check (placement leaves); default derived from **`pathSearchExploreBudget`** or from **`maxAttemptsPerWord`** when the path budget is omitted.
 *   uniqueSpellingMode?: 'geometry' | 'fifo_equivalence'; forwarded to **`findRandomLegalPathFlat`** (**default `geometry`**). **`fifo_equivalence`** relaxes ambiguity to refill first-visit parity only (**live parity risk**).
 *   reusePairingHardConstraint?: boolean; forwarded to **`findRandomLegalPathFlat`** (**default `false`**).
 *   lookaheadPreferSnapshotLetterMatch?: boolean;
 *   placementCandidateSamples?: number;
 *   placementOrder?: "scoreDesc" | "input"; default **`scoreDesc`**. Use **`input`** to place words in the order given (regen: same as `perfect_hunt` in JSON); avoids sorting by pool score so the first word is typically shorter/simpler before the grid densifies.
 *   debugVerify?: boolean;
 *   debugTrace?: boolean;
 *   debugTiming?: boolean;
 *   debugVerbose?: boolean; when true — trace + timing + per-call path-search heartbeats (regen `--trace-build`)
 *   diagnoseBuild?: boolean; `[build-diag]` JSON on stderr without full trace
 *   debugPlacement?: boolean; log placement_fail / placement_word_swap without **`debugTrace`**
 *   swapWordBuckets?: Map; same-stats alternates for placement retries
 *   placementWordSwap?: boolean; default true when buckets set
 *   placementWordSwapMaxPerSlot?: number; default 24
 *   placementSlotTimeBudgetMs?: number; optional per-slot wall ms
 *   returnFailureTally?: boolean;
 *   returnLastPlacementFailure?: boolean;
 *   returnLastPlayPathUniqFailure?: boolean;
 *   pathCatalog?: import("./path-catalog/path-variant-catalog.js").PathSignatureCatalogJson | null;
 *   usePathCatalog?: boolean; when true and `pathCatalog` set — try precomputed paths before DFS (default **`true`** when catalog provided).
 *   allowPlacementDfsFallback?: boolean; when false and catalog is loaded, skip `findRandomLegalPathFlat` on catalog miss (default **`false`**).
 *   skipForwardVerify?: boolean; skip `verifyForwardPuzzleIfCoveredChain` (`--no-verify`, or shift CLI without `--verify`).
 *   skipPlayPathUniqueness?: boolean; skip shipped-grid FIFO play-path uniqueness gate (debug only).
 *   requireCoexistentPathsOnFinalGrid?: boolean; reject commits unless every placed hunt path spells on the board after the stamp (default **`true`**; pass **`false`** to disable).
 *   interWordShiftMode?: "sampled" | "exhaustive16"; when **`exhaustive16`**, score placements on all torus translations (requires **`shiftBetweenWords`**).
 * }} [opts]
 */
export function tryBuildAutomatedPuzzle(poolWordsSeven, opts = {}) {
  const n = GRID_SIZE;
  if (
    !Array.isArray(poolWordsSeven) ||
    poolWordsSeven.length !== PERFECT_HUNT_WORD_COUNT
  ) {
    return { ok: false, reason: "need exactly " + PERFECT_HUNT_WORD_COUNT + " words" };
  }

  const interWordShiftMode =
    opts.interWordShiftMode === "exhaustive16" ? "exhaustive16" : "sampled";
  const shiftBetweenEarly = opts.shiftBetweenWords === true;
  if (interWordShiftMode === "exhaustive16" && !shiftBetweenEarly) {
    return {
      ok: false,
      reason: "interWordShiftMode exhaustive16 requires shiftBetweenWords: true",
    };
  }

  const seed0 =
    typeof opts.seed === "number" && Number.isFinite(opts.seed)
      ? Math.floor(opts.seed)
      : (Date.now() & 0xffffffff) >>> 0;

  const maxAttemptsPerWord =
    typeof opts.maxAttemptsPerWord === "number" && opts.maxAttemptsPerWord > 0
      ? Math.floor(opts.maxAttemptsPerWord)
      : 10000;
  const pathSearchExploreBudget =
    typeof opts.pathSearchExploreBudget === "number" &&
    Number.isFinite(opts.pathSearchExploreBudget) &&
    opts.pathSearchExploreBudget > 0
      ? Math.floor(opts.pathSearchExploreBudget)
      : undefined;

  /** @type {number | undefined} */
  let uniqCountExploreBudget = undefined;
  const uniqExplicit =
    typeof opts.uniqCountExploreBudget === "number" &&
    Number.isFinite(opts.uniqCountExploreBudget) &&
    opts.uniqCountExploreBudget > 0
      ? Math.floor(opts.uniqCountExploreBudget)
      : undefined;
  if (opts.requireUniqueSpelling !== false) {
    uniqCountExploreBudget =
      uniqExplicit ??
      (pathSearchExploreBudget !== undefined
        ? Math.min(320_000, Math.floor(Math.max(pathSearchExploreBudget * 6, 24_000)))
        : Math.min(420_000, Math.floor(Math.max(maxAttemptsPerWord * 54, 55_000))));
  } else uniqCountExploreBudget = uniqExplicit;
  const wholeBuildAttempts =
    typeof opts.wholeBuildAttempts === "number" && opts.wholeBuildAttempts > 0
      ? Math.floor(opts.wholeBuildAttempts)
      : 120;
  const shiftMaxSteps =
    typeof opts.shiftMaxSteps === "number" && opts.shiftMaxSteps >= 0
      ? Math.floor(opts.shiftMaxSteps)
      : 3;
  const shiftFeasibilityProbeAttempts =
    typeof opts.shiftFeasibilityProbeAttempts === "number" &&
    Number.isFinite(opts.shiftFeasibilityProbeAttempts) &&
    opts.shiftFeasibilityProbeAttempts > 0
      ? Math.floor(opts.shiftFeasibilityProbeAttempts)
      : Math.max(120, Math.min(900, Math.floor(maxAttemptsPerWord / 7)));
  const shiftFeasibilityLookaheadAttempts =
    typeof opts.shiftFeasibilityLookaheadAttempts === "number" &&
    Number.isFinite(opts.shiftFeasibilityLookaheadAttempts) &&
    opts.shiftFeasibilityLookaheadAttempts > 0
      ? Math.floor(opts.shiftFeasibilityLookaheadAttempts)
      : Math.max(90, Math.min(640, Math.floor(shiftFeasibilityProbeAttempts * 0.65)));
  const shiftFeasibilityCandidateLimit =
    typeof opts.shiftFeasibilityCandidateLimit === "number" &&
    Number.isFinite(opts.shiftFeasibilityCandidateLimit) &&
    opts.shiftFeasibilityCandidateLimit > 0
      ? Math.floor(opts.shiftFeasibilityCandidateLimit)
      : 12;
  const shiftBacktrackVariantLimit =
    typeof opts.shiftBacktrackVariantLimit === "number" &&
    Number.isFinite(opts.shiftBacktrackVariantLimit) &&
    opts.shiftBacktrackVariantLimit > 0
      ? Math.floor(opts.shiftBacktrackVariantLimit)
      : 3;
  const shiftBetween = opts.shiftBetweenWords === true;
  const allowNoopShiftFallback = shiftBetween
    ? false
    : opts.allowNoopShiftFallback !== false;
  const uniqueSpellingMode =
    opts.uniqueSpellingMode === "fifo_equivalence" ? "fifo_equivalence" : "geometry";
  const reusePairingHardConstraint = opts.reusePairingHardConstraint === true;

  const mapped = poolWordsSeven.map((e) => ({
    word: String(e.word || "").toLowerCase(),
    min_tiles: Number(e.min_tiles),
    reuse: Number(e.reuse),
    wordTotal: Number(e.wordTotal),
  }));
  const placementOrder = opts.placementOrder === "input" ? "input" : "scoreDesc";
  const currentWords =
    placementOrder === "input"
      ? mapped.slice()
      : mapped.slice().sort(comparePoolWordEntriesDesc);

  const ultra = opts.debugVerbose === true;
  const trace = opts.debugTrace === true || ultra;
  const wantTiming = opts.debugTiming === true || ultra;
  const diagnoseBuild = opts.diagnoseBuild === true;
  const debugPlacement = opts.debugPlacement === true || diagnoseBuild;
  const swapWordBuckets =
    opts.swapWordBuckets instanceof Map && opts.swapWordBuckets.size > 0
      ? opts.swapWordBuckets
      : null;
  const problematicWords =
    opts.problematicWords instanceof Set && opts.problematicWords.size > 0
      ? opts.problematicWords
      : null;
  const placementWordSwapEnabled =
    swapWordBuckets != null && opts.placementWordSwap !== false;
  const placementWordSwapMaxPerSlot =
    typeof opts.placementWordSwapMaxPerSlot === "number" &&
    Number.isFinite(opts.placementWordSwapMaxPerSlot) &&
    opts.placementWordSwapMaxPerSlot > 0
      ? Math.floor(opts.placementWordSwapMaxPerSlot)
      : 24;
  const placementSlotTimeBudgetMs =
    typeof opts.placementSlotTimeBudgetMs === "number" &&
    Number.isFinite(opts.placementSlotTimeBudgetMs) &&
    opts.placementSlotTimeBudgetMs > 0
      ? Math.floor(opts.placementSlotTimeBudgetMs)
      : undefined;
  const pathCatalog = opts.pathCatalog ?? null;
  const usePathCatalog = pathCatalog != null && opts.usePathCatalog !== false;
  const allowPlacementDfsFallback =
    (usePathCatalog && opts.allowPlacementDfsFallback === true) ||
    interWordShiftMode === "exhaustive16";
  const requireCoexistentPathsOnFinalGrid = shiftBetween
    ? opts.requireCoexistentPathsOnFinalGrid === true
    : opts.requireCoexistentPathsOnFinalGrid !== false;

  /**
   * @param {string} wordLc
   * @param {Parameters<typeof findRandomLegalPathFlat>[1]} findOpts
   */
  function findPlacementPath(wordLc, findOpts) {
    const snap = findOpts.snapshotBoard4 ?? null;
    if (usePathCatalog && pathCatalog) {
      const picked = pickCatalogPathFlat(pathCatalog, wordLc, snap, {
        gridSize: n,
        hubRankWeight: PLACEMENT_HUB_RANK_WEIGHT,
      });
      if (picked) {
        tally.placement_catalog++;
        const glyphs = wordToTileLabelSequence(wordLc);
        const minTiles = minUniqueTilesForReuseRule(glyphs);
        return {
          pathFlat: picked.pathFlat,
          minTiles,
          reuse: glyphs.length - minTiles,
        };
      }
      if (!allowPlacementDfsFallback) {
        return null;
      }
    }
    tally.placement_dfs++;
    const dfs = findRandomLegalPathFlat(wordLc, findOpts);
    if (!dfs) return null;
    const best = pickBestPathFlatByCoverRotations(wordLc, dfs.pathFlat, snap, {
      gridSize: n,
      hubRankWeight: PLACEMENT_HUB_RANK_WEIGHT,
    });
    if (best) {
      return {
        pathFlat: best.pathFlat,
        minTiles: dfs.minTiles,
        reuse: dfs.reuse,
      };
    }
    return dfs;
  }

  /**
   * Pick ascending hunt paths that spell on `board` (overlay export / FIFO alignment).
   * @param {string[][]} board
   * @param {string[]} wordsAsc
   */
  /**
   * @param {Array<{ n: string | null; s: string | null; w: string | null; e: string | null }>} sigs
   */
  function flattenStarterNeighborSigs(sigs) {
    /** @type {string[]} */
    const out = [];
    for (const sig of sigs || []) {
      out.push(
        normalizedExportedTorNeighborToken(sig.n),
        normalizedExportedTorNeighborToken(sig.s),
        normalizedExportedTorNeighborToken(sig.w),
        normalizedExportedTorNeighborToken(sig.e)
      );
    }
    return out;
  }

  /**
   * @param {string[][]} board
   * @param {string} word
   * @param {number} [wi]
   * @param {{ uniqueSpellingMode?: "geometry" | "fifo_equivalence" }} [resolveOpts]
   */
  function resolveOneWordPathOnBoard(board, word, wi = 0, resolveOpts = {}) {
    const resolveUniqueMode =
      resolveOpts.uniqueSpellingMode === "fifo_equivalence"
        ? "fifo_equivalence"
        : uniqueSpellingMode;
    const w = String(word || "").toLowerCase();
    const resolveCatalog = pathCatalog;
    const resolveUseCatalog = resolveCatalog != null && opts.usePathCatalog !== false;
    let picked = null;
    if (resolveUseCatalog && resolveCatalog) {
      const cat = pickCatalogPathFlat(resolveCatalog, w, board, {
        gridSize: n,
        hubRankWeight: PLACEMENT_HUB_RANK_WEIGHT,
      });
      if (cat) {
        const glyphs = wordToTileLabelSequence(w);
        let spells = true;
        for (let pi = 0; pi < cat.pathFlat.length; pi++) {
          const f = cat.pathFlat[pi];
          const r = Math.floor(f / n);
          const c = f % n;
          if (normalizeTileText(board[r][c]) !== normalizeTileText(glyphs[pi])) {
            spells = false;
            break;
          }
        }
        if (spells) {
          picked = cat.pathFlat.slice();
        }
      }
    }
    if (!picked) {
      const dfs = findRandomLegalPathFlat(w, {
        seed: (seed0 + wi * 1597) >>> 0,
        maxAttempts: maxAttemptsPerWord,
        snapshotBoard4: board,
        preferStraight: opts.preferStraight !== false,
        requireUniqueSpelling: false,
        preferSnapshotLetterMatch: true,
        uniqueSpellingMode: resolveUniqueMode,
        reusePairingHardConstraint,
        pathRotationQuarterTurnsCW: 0,
        reuseHubCentralityBias: true,
        ...(pathSearchExploreBudget !== undefined
          ? { maxExploreNodes: pathSearchExploreBudget }
          : {}),
        ...(uniqCountExploreBudget !== undefined ? { uniqCountExploreBudget } : {}),
      });
      if (dfs) picked = dfs.pathFlat.slice();
    }
    if (!picked) return null;
    const glyphs = wordToTileLabelSequence(w);
    for (let pi = 0; pi < picked.length; pi++) {
      const f = picked[pi];
      const r = Math.floor(f / n);
      const c = f % n;
      if (normalizeTileText(board[r][c]) !== normalizeTileText(glyphs[pi])) return null;
    }
    return picked;
  }

  function resolveAscendingPathsOnBoard(board, wordsAsc) {
    /** @type {number[][]} */
    const pathsAsc = [];
    for (let wi = 0; wi < wordsAsc.length; wi++) {
      const picked = resolveOneWordPathOnBoard(board, wordsAsc[wi], wi);
      if (!picked) return null;
      pathsAsc.push(picked);
    }
    return pathsAsc;
  }

  const pathSearchTrace = ultra;
  /** @type {Record<string, number>} */
  const tally = {
    fail_path_inner: 0,
    fail_lookahead_inner: 0,
    fail_export_null: 0,
    fail_verify: 0,
    fail_play_path_uniq: 0,
    fail_grid_coherence: 0,
    placement_catalog: 0,
    placement_dfs: 0,
    placement_word_swap: 0,
    fail_swap_exhausted: 0,
  };

  /** @type {{ word: string; slot: number; step: number; phase: string; msSlot?: number } | null} */
  let lastPlacementFailure = null;
  /** @type {{ word: string; huntIndex: number; reason?: string } | null} */
  let lastPlayPathUniqFailure = null;

  /**
   * @param {number} slot
   * @param {Set<string>} tried
   * @param {number} swapCount
   * @param {number} attemptSeed
   */
  function pickSwapWordForSlot(slot, tried, swapCount, attemptSeed) {
    if (!placementWordSwapEnabled || !swapWordBuckets) return null;
    const alts = collectSwapAlternatesMatchingStats(
      swapWordBuckets,
      currentWords,
      slot,
      problematicWords
    );
    const fresh = alts.filter((e) => !tried.has(e.word));
    if (fresh.length === 0) return null;
    const ix = ((attemptSeed + slot * 31 + swapCount * 17) >>> 0) % fresh.length >>> 0;
    return fresh[ix];
  }

  const lookaheadProbe = opts.lookaheadProbeNext === true;
  const shiftGameplayOnlyPlacement =
    shiftBetween && opts.shiftGameplayOnlyPlacement !== false;
  const lookaheadPlacementGate = lookaheadProbe && !shiftGameplayOnlyPlacement;
  const shiftRelaxUniqueSpelling =
    shiftBetween &&
    opts.shiftRelaxUniqueSpelling !== false &&
    opts.requireUniqueSpelling !== true;
  const requireUniqueSpellingPlacement = shiftRelaxUniqueSpelling
    ? false
    : opts.requireUniqueSpelling !== false;
  const shiftUseLookaheadHeuristics = shiftBetween
    ? opts.shiftUseLookaheadHeuristics === true
    : lookaheadProbe;
  const lookaheadSnapBias = opts.lookaheadPreferSnapshotLetterMatch !== false;
  const shiftCandidatePool = buildBetweenShiftCandidates(shiftMaxSteps);
  const innerKTriesExplicit =
    typeof opts.lookaheadInnerTries === "number" &&
    Number.isFinite(opts.lookaheadInnerTries);
  const innerKConfigured = innerKTriesExplicit
    ? Math.max(1, Math.floor(/** @type {number} */ (opts.lookaheadInnerTries)))
    : null;
  /** Placement retry rounds inside one whole-build attempt (`k` axis). Defaults to **`12`** with lookahead (`next`-word feasibility probe), **`1`** without unless overrides. */
  const innerKMaxDefaulted = lookaheadPlacementGate
    ? innerKConfigured ?? 12
    : innerKConfigured ?? 1;

  const line = (
    /** @type {string} */ msg,
    /** @type {Record<string, unknown>} */ extra = {}
  ) => {
    const placementMsg =
      msg === "placement_fail" ||
      msg === "placement_word_swap" ||
      msg === "placement_ok";
    if (!trace && !(debugPlacement && placementMsg)) return;
    console.error("[auto-build]", msg, JSON.stringify(extra));
  };

  /** One-line failure diagnosis when `diagnoseBuild` is set. */
  const diag = (/** @type {Record<string, unknown>} */ o) => {
    if (!diagnoseBuild) return;
    console.error("[build-diag]", JSON.stringify(o));
  };

  for (let attempt = 0; attempt < wholeBuildAttempts; attempt++) {
    const tAttempt0 = wantTiming ? Date.now() : 0;
    const seed = (seed0 + attempt * 2654435761) >>> 0;
    const tAttemptWall = diagnoseBuild ? Date.now() : 0;
    diag({ kind: "attempt_begin", attempt, seed });
    if (ultra) {
      console.error("[auto-build] attempt_begin", JSON.stringify({ attempt, seed }));
    }
    /** @type {string[][]} */
    let gameBoard = emptyBoard(n);
    /**
     * Gamemaker toolbar order (desc score). `perfect_hunt_shifts_before` still keyed by ascending hunt index.
     */
    const placementSeqToolbar = shiftBetween
      ? currentWords
          .map((e, i) => ({ e, i }))
          .sort((a, b) => comparePoolWordEntriesDesc(a.e, b.e))
          .map((x) => x.i)
      : currentWords.map((_, i) => i);
    let orientationRowK = 0;
    let orientationColK = 0;

    /** Toroidal ops before toolbar step `step` (`step >= 1`), keyed by toolbar slot index. */
    /** @type {Array<Array<{ t: "row" | "col"; s: number }>>} */
    const chronShiftsBeforeToolbarStep = Array.from(
      { length: PERFECT_HUNT_WORD_COUNT },
      () => []
    );
    /** @type {Array<{ word: string; pathFlat: number[]; min_tiles: number; covered: string[]; starter_tor_neighbor_quad: string[] } | null>} */
    const buildPlays = Array(PERFECT_HUNT_WORD_COUNT).fill(null);
    let failed = false;

    for (let step = 0; step < PERFECT_HUNT_WORD_COUNT; step++) {
      const slot = placementSeqToolbar[step];
      const boardAtStepStart = cloneBoard(gameBoard);
      const orientRowAtStep = orientationRowK;
      const orientColAtStep = orientationColK;
      /** @type {Set<string>} */
      const slotWordsTried = new Set();
      let swapCount = 0;
      const tSlotWallSwap = Date.now();

      slot_swap: while (true) {
        let slotFailed = false;
        let slotFailPhase = "";
        const w = currentWords[slot].word;
        slotWordsTried.add(w);
        const glyphs = wordToTileLabelSequence(w);
        const minTiles = minUniqueTilesForReuseRule(glyphs);
        const tSlot0 = wantTiming ? Date.now() : 0;
        /** @type {{ pathFlat: number[]; minTiles: number; reuse: number } | null} */
        let pathRes = null;
        /** @type {string[][] | null} */
        let snap = null;

        /** Inter-word shifts run once here (before path search); not between inner placement retries. */
        /** @type {Array<{ seq: Array<{ t: "row" | "col"; s: number }>; board: string[][] }>} */
        let shiftVariants = [{ seq: [], board: cloneBoard(gameBoard) }];
        /** @type {{ pathFlat: number[]; minTiles: number; reuse: number } | null} */
        let exhaustive16Prepick = null;
        if (step > 0 && shiftBetween && interWordShiftMode === "exhaustive16") {
          const nextSlotEx =
            step + 1 < PERFECT_HUNT_WORD_COUNT ? placementSeqToolbar[step + 1] : null;
          const wNextEx = nextSlotEx != null ? currentWords[nextSlotEx].word : null;
          const exSeed = (seed + slot * 7919 + attempt * 104729) >>> 0;
          const boardHasLetters = gameBoard.some((row) =>
            row.some((c) => String(c ?? "").trim() !== "")
          );
          const exPick = pickBestPlacementAcrossTorusTranslations(gameBoard, w, {
            catalog: pathCatalog,
            gridSize: n,
            usePathCatalog,
            allowPlacementDfsFallback,
            homeRowK: orientationRowK,
            homeColK: orientationColK,
            requireNonIdentityRotation: boardHasLetters,
            findPlacementOpts: {
              seed: exSeed,
              maxAttempts: maxAttemptsPerWord,
              ...(pathSearchExploreBudget !== undefined
                ? { maxExploreNodes: pathSearchExploreBudget }
                : {}),
              ...(uniqCountExploreBudget !== undefined
                ? { uniqCountExploreBudget }
                : {}),
              preferStraight: opts.preferStraight !== false,
              requireUniqueSpelling: requireUniqueSpellingPlacement,
              preferSnapshotLetterMatch:
                opts.preferSnapshotLetterMatch === false
                  ? false
                  : opts.preferSnapshotLetterMatch === true
                    ? true
                    : step === 0 ||
                      !gameBoard.some((row) =>
                        row.some((c) => String(c ?? "").trim() !== "")
                      ),
              uniqueSpellingMode,
              reusePairingHardConstraint,
              pathRotationQuarterTurnsCW: 0,
              reuseHubCentralityBias: true,
            },
            shiftUseLookaheadHeuristics,
            nextWordLc: wNextEx,
            lookaheadSnapBias,
            lookaheadAttempts: shiftFeasibilityLookaheadAttempts,
            pathSearchExploreBudget,
            uniqCountExploreBudget,
          });
          if (!exPick) {
            tally.fail_path_inner++;
            slotFailed = true;
            slotFailPhase = "exhaustive16_no_placement";
          } else {
            if (exPick.source === "catalog") tally.placement_catalog++;
            else tally.placement_dfs++;
            orientationRowK =
              typeof exPick.targetRowK === "number" ? exPick.targetRowK : exPick.rowK;
            orientationColK =
              typeof exPick.targetColK === "number" ? exPick.targetColK : exPick.colK;
            shiftVariants = [{ seq: exPick.shiftSeq, board: exPick.winningBoard }];
            exhaustive16Prepick = {
              pathFlat: exPick.pathFlat,
              minTiles: exPick.minTiles,
              reuse: exPick.reuse,
            };
            if (trace) {
              line("exhaustive16_pick", {
                attempt,
                slot,
                word: w,
                rowK: exPick.rowK,
                colK: exPick.colK,
                translationCount: exPick.translationCount,
                score: exPick.score,
              });
            }
          }
        } else if (!slotFailed && step > 0 && shiftBetween) {
          const preShiftBoard = cloneBoard(gameBoard);
          const rngS = (() => {
            let a = (seed + step * 97868987 + attempt * 17) >>> 0;
            return () => {
              a = (a + 0x6d2b79f5) >>> 0;
              let t = a;
              t = Math.imul(t ^ (t >>> 15), t | 1);
              t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
              return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
            };
          })();
          const seqCandidates = shuffledCopyWithRng(shiftCandidatePool, rngS).slice(
            0,
            Math.min(shiftFeasibilityCandidateLimit, shiftCandidatePool.length)
          );
          /** @type {Array<{ seq: Array<{ t: "row" | "col"; s: number }>; board: string[][]; score: number }>} */
          const scored = [];
          for (let ci = 0; ci < seqCandidates.length; ci++) {
            const seqCandidate = normalizeShiftsBeforeOps(seqCandidates[ci]);
            const shiftedBoard = applyShiftSeqToBoard(gameBoard, seqCandidate, n);
            const shiftedNonEmpty = shiftedBoard.some((row) =>
              row.some((c) => String(c ?? "").trim() !== "")
            );
            let shiftedSnapBias = true;
            if (opts.preferSnapshotLetterMatch === false) shiftedSnapBias = false;
            else if (opts.preferSnapshotLetterMatch === true) shiftedSnapBias = true;
            else shiftedSnapBias = step === 0 || !shiftedNonEmpty;
            const probeSeed = (seed + attempt * 1009 + step * 65537 + ci * 31337) >>> 0;
            const probeCur = findPlacementPath(w, {
              seed: probeSeed,
              maxAttempts: shiftFeasibilityProbeAttempts,
              ...(pathSearchExploreBudget !== undefined
                ? { maxExploreNodes: pathSearchExploreBudget }
                : {}),
              ...(uniqCountExploreBudget !== undefined
                ? { uniqCountExploreBudget }
                : {}),
              snapshotBoard4: shiftedBoard,
              preferStraight: opts.preferStraight !== false,
              requireUniqueSpelling: requireUniqueSpellingPlacement,
              preferSnapshotLetterMatch: shiftedSnapBias,
              uniqueSpellingMode,
              reusePairingHardConstraint,
              pathRotationQuarterTurnsCW: 0,
              reuseHubCentralityBias: true,
            });
            if (!probeCur) continue;
            const pref = scorePlacementCoverExisting(
              shiftedBoard,
              probeCur.pathFlat,
              n
            );
            let score =
              pref.score +
              scoreReuseHubCentrality(probeCur.pathFlat, n) * PLACEMENT_HUB_RANK_WEIGHT;
            if (shiftUseLookaheadHeuristics && step + 1 < PERFECT_HUNT_WORD_COUNT) {
              const nextSlotProbe = placementSeqToolbar[step + 1];
              const wNextProbe = currentWords[nextSlotProbe].word;
              const shiftedAfterCur = simulateChronoToEndBoard(shiftedBoard, [
                { word: w, pathFlat: probeCur.pathFlat },
              ]);
              const laSeed = (probeSeed + 9176) >>> 0;
              const probeNext = findPlacementPath(wNextProbe, {
                seed: laSeed,
                maxAttempts: shiftFeasibilityLookaheadAttempts,
                snapshotBoard4: shiftedAfterCur,
                preferStraight: opts.preferStraight !== false,
                requireUniqueSpelling: false,
                preferSnapshotLetterMatch: lookaheadSnapBias,
                pathRotationQuarterTurnsCW: 0,
              });
              if (!probeNext) score -= 45000;
              else score += 12000;
            }
            score += rngS() * 0.001;
            scored.push({ seq: seqCandidate, board: shiftedBoard, score });
          }
          scored.sort((a, b) => b.score - a.score);
          shiftVariants = scored
            .slice(0, Math.max(1, shiftBacktrackVariantLimit))
            .map((x) => ({ seq: x.seq, board: x.board }));
          if (shiftVariants.length === 0) {
            let seq = randomBetweenShiftSeq(rngS, shiftMaxSteps);
            if (seq.length === 0)
              seq = [{ t: rngS() < 0.5 ? "row" : "col", s: rngS() < 0.5 ? 1 : -1 }];
            shiftVariants = [
              {
                seq: normalizeShiftsBeforeOps(seq),
                board: applyShiftSeqToBoard(gameBoard, seq, n),
              },
            ];
          }
          if (allowNoopShiftFallback) {
            shiftVariants.push({ seq: [], board: preShiftBoard });
          }
        }

        if (!slotFailed) {
          const tSlotDiag = Date.now();
          let boardFilledCells = 0;
          let hadCandAny = false;
          let hadLookaheadFailAny = false;

          for (let variantIx = 0; variantIx < shiftVariants.length; variantIx++) {
            const variant = shiftVariants[variantIx];
            chronShiftsBeforeToolbarStep[slot] = normalizeShiftsBeforeOps(variant.seq);
            gameBoard = cloneBoard(variant.board);

            if (exhaustive16Prepick) {
              snap = cloneBoard(gameBoard);
              boardFilledCells = gameBoard
                .flat()
                .filter((c) => String(c ?? "").trim() !== "").length;
              pathRes = exhaustive16Prepick;
              break;
            }

            const nonempty = gameBoard.some((row) =>
              row.some((c) => String(c ?? "").trim() !== "")
            );
            let snapBias = true;
            if (opts.preferSnapshotLetterMatch === false) snapBias = false;
            else if (opts.preferSnapshotLetterMatch === true) snapBias = true;
            else snapBias = step === 0 || !nonempty;

            snap = cloneBoard(gameBoard);
            boardFilledCells = gameBoard
              .flat()
              .filter((c) => String(c ?? "").trim() !== "").length;
            if (ultra) {
              console.error(
                "[auto-build] slot_begin",
                JSON.stringify({
                  attempt,
                  slot,
                  word: w,
                  minTiles,
                  boardFilledCells,
                  variantIx,
                  shiftVariants: shiftVariants.length,
                })
              );
            }

            const innerKMax = innerKMaxDefaulted;
            const placementSamplesRaw = Number(opts.placementCandidateSamples);
            const placementCandidateSamples =
              Number.isFinite(placementSamplesRaw) && placementSamplesRaw >= 1
                ? Math.min(48, Math.floor(placementSamplesRaw))
                : 8;
            const attemptsPerPlacementSample =
              placementCandidateSamples <= 1
                ? maxAttemptsPerWord
                : Math.max(
                    1,
                    Math.floor(maxAttemptsPerWord / placementCandidateSamples)
                  );
            let hadCand = false;
            let hadLookaheadFail = false;
            pathRes = null;
            inner: for (let k = 0; k < innerKMax; k++) {
              const tK0 = wantTiming ? Date.now() : 0;
              if (ultra) {
                console.error(
                  "[auto-build] inner_k_start",
                  JSON.stringify({ attempt, slot, k, word: w, variantIx })
                );
              }
              /** @type {{ pathFlat: number[]; minTiles: number; reuse: number } | null} */
              let cand = /** @type {typeof cand} */ (null);
              let bestCandScore = -1;
              for (let sub = 0; sub < placementCandidateSamples; sub++) {
                const tPl = wantTiming ? Date.now() : 0;
                const subSeed =
                  ((seed +
                    slot * 7919 +
                    attempt * 104729 +
                    k * 999983 +
                    sub * 12289 +
                    Math.imul(sub, 65537) +
                    variantIx * 2048) >>>
                    0) >>>
                  0;
                const candTry = findPlacementPath(w, {
                  seed: subSeed,
                  maxAttempts: attemptsPerPlacementSample,
                  ...(pathSearchExploreBudget !== undefined
                    ? { maxExploreNodes: pathSearchExploreBudget }
                    : {}),
                  ...(uniqCountExploreBudget !== undefined
                    ? { uniqCountExploreBudget }
                    : {}),
                  snapshotBoard4: gameBoard,
                  preferStraight: opts.preferStraight !== false,
                  requireUniqueSpelling: requireUniqueSpellingPlacement,
                  preferSnapshotLetterMatch: snapBias,
                  uniqueSpellingMode,
                  reusePairingHardConstraint,
                  pathRotationQuarterTurnsCW: 0,
                  debugPathSearch: pathSearchTrace,
                  debugPathSearchLabel: ultra
                    ? `placement.a${attempt}.s${slot}.v${variantIx}.sub${sub}`
                    : "",
                  reuseHubCentralityBias: true,
                });
                if (wantTiming && ultra) {
                  const dPl = Date.now() - tPl;
                  console.error(
                    "[auto-build] placement_findPath",
                    JSON.stringify({
                      ms: dPl,
                      attempt,
                      slot,
                      k,
                      sub,
                      variantIx,
                      word: w,
                      ok: !!candTry,
                      maxAttempts: attemptsPerPlacementSample,
                    })
                  );
                }
                if (!candTry) continue;
                const pref = scorePlacementCoverExisting(
                  gameBoard,
                  candTry.pathFlat,
                  n
                );
                const hubRank = scoreReuseHubCentrality(candTry.pathFlat, n);
                const combinedRank = pref.score + hubRank * PLACEMENT_HUB_RANK_WEIGHT;
                if (combinedRank > bestCandScore || cand === null) {
                  bestCandScore = combinedRank;
                  cand = candTry;
                }
              }
              if (!cand) {
                if (ultra) {
                  console.error(
                    "[auto-build] inner_k_no_placement",
                    JSON.stringify({
                      ms: Date.now() - tK0,
                      attempt,
                      slot,
                      k,
                      word: w,
                      variantIx,
                    })
                  );
                }
                continue inner;
              }
              hadCand = true;

              if (lookaheadPlacementGate && step + 1 < PERFECT_HUNT_WORD_COUNT) {
                const nextSlot = placementSeqToolbar[step + 1];
                const wNext = currentWords[nextSlot].word;
                const boardAfterCand = simulateChronoToEndBoard(snap, [
                  { word: w, pathFlat: cand.pathFlat },
                ]);
                const laMax =
                  typeof opts.lookaheadAttempts === "number" &&
                  opts.lookaheadAttempts > 0
                    ? Math.floor(opts.lookaheadAttempts)
                    : 2200;
                const tLa0 = wantTiming ? Date.now() : 0;
                const laSeed2 =
                  (seed + slot * 5179 + k * 611953 + attempt + variantIx * 3079) >>> 0;
                const probe = findPlacementPath(wNext, {
                  seed: laSeed2,
                  maxAttempts: laMax,
                  snapshotBoard4: boardAfterCand,
                  preferStraight: opts.preferStraight !== false,
                  requireUniqueSpelling: false,
                  preferSnapshotLetterMatch: lookaheadSnapBias,
                  pathRotationQuarterTurnsCW: 0,
                  debugPathSearch: pathSearchTrace,
                  debugPathSearchLabel: ultra
                    ? `lookahead.a${attempt}.s${slot}.v${variantIx}`
                    : "",
                });
                if (wantTiming && ultra) {
                  console.error(
                    "[auto-build] lookahead_findPath",
                    JSON.stringify({
                      ms: Date.now() - tLa0,
                      attempt,
                      slot,
                      k,
                      variantIx,
                      word: wNext,
                      ok: !!probe,
                      maxAttempts: laMax,
                    })
                  );
                }
                if (!probe) {
                  hadLookaheadFail = true;
                  if (ultra) {
                    console.error(
                      "[auto-build] inner_k_lookahead_failed",
                      JSON.stringify({
                        ms: Date.now() - tK0,
                        attempt,
                        slot,
                        k,
                        variantIx,
                        fromWord: w,
                        nextWord: wNext,
                      })
                    );
                  }
                  continue inner;
                }
              }

              if (ultra) {
                console.error(
                  "[auto-build] inner_k_accepted",
                  JSON.stringify({
                    ms: Date.now() - tK0,
                    msSlotSoFar: wantTiming ? Date.now() - tSlot0 : 0,
                    attempt,
                    slot,
                    k,
                    variantIx,
                    word: w,
                    pathLen: cand.pathFlat.length,
                  })
                );
              }
              pathRes = cand;
              break inner;
            }
            hadCandAny = hadCandAny || hadCand;
            hadLookaheadFailAny = hadLookaheadFailAny || hadLookaheadFail;

            if (ultra && wantTiming) {
              console.error(
                "[auto-build] slot_end",
                JSON.stringify({
                  ms: Date.now() - tSlot0,
                  attempt,
                  slot,
                  word: w,
                  variantIx,
                  placed: !!pathRes && !failed,
                })
              );
            }
            if (!pathRes) continue;
            break;
          }

          if (!pathRes) {
            const phase =
              hadCandAny && hadLookaheadFailAny
                ? "lookahead_inner_exhausted"
                : "path_inner_exhausted";
            if (phase === "path_inner_exhausted") tally.fail_path_inner++;
            else tally.fail_lookahead_inner++;
            line("placement_fail", {
              attempt,
              slot,
              phase,
              word: w,
              nextWord:
                lookaheadPlacementGate && step + 1 < PERFECT_HUNT_WORD_COUNT
                  ? currentWords[placementSeqToolbar[step + 1]].word
                  : undefined,
              innerTries: innerKMaxDefaulted,
              lookaheadOn: lookaheadPlacementGate && step + 1 < PERFECT_HUNT_WORD_COUNT,
              minTiles,
              shiftVariantsTried: shiftVariants.length,
            });
            diag({
              kind: "placement_fail",
              attempt,
              slot,
              word: w,
              phase,
              msSlot: Date.now() - tSlotDiag,
              boardFilledCells,
              lookaheadOn: lookaheadPlacementGate && step + 1 < PERFECT_HUNT_WORD_COUNT,
              hadCand: hadCandAny,
              hadLookaheadFail: hadLookaheadFailAny,
              shiftVariantsTried: shiftVariants.length,
            });
            slotFailed = true;
            slotFailPhase = phase;
          }

          if (!slotFailed && !snap) {
            slotFailed = true;
            slotFailPhase = "no_snap";
          }
        } // end placement search when !slotFailed

        if (!slotFailed && pathRes && snap) {
          const pathFlat = pathRes.pathFlat;
          const covered = deriveCoveredFromSnapshot(snap, pathFlat, n);
          const after = simulateChronoToEndBoard(snap, [{ word: w, pathFlat }]);
          if (
            requireCoexistentPathsOnFinalGrid &&
            !allPlacedHuntPathsVisibleOnBoard(
              after,
              currentWords,
              buildPlays,
              placementSeqToolbar,
              step,
              slot,
              pathFlat
            )
          ) {
            tally.fail_grid_coherence++;
            line("placement_fail", {
              attempt,
              slot,
              phase: "grid_coherence",
              word: w,
              step,
            });
            diag({
              kind: "placement_fail",
              attempt,
              slot,
              word: w,
              phase: "grid_coherence",
            });
            slotFailed = true;
            slotFailPhase = "grid_coherence";
          }
          if (!slotFailed) {
            const starterTorQuad = torNeighborQuadExportTokensFromBoard(
              after,
              pathFlat[0],
              n
            );

            buildPlays[slot] = {
              word: w,
              pathFlat,
              min_tiles: minTiles,
              covered,
              starter_tor_neighbor_quad: starterTorQuad,
            };
            gameBoard = after;
            if (debugPlacement) {
              line("placement_ok", {
                attempt,
                step,
                slot,
                word: w,
                placedSteps: step + 1,
                swapCount,
              });
            }
            break slot_swap;
          } // end commit when !slotFailed
        }

        if (slotFailed) {
          const msSlot = Date.now() - tSlotWallSwap;
          lastPlacementFailure = {
            word: w,
            slot,
            step,
            phase: slotFailPhase,
            msSlot,
          };
          if (slotFailPhase === "exhaustive16_no_placement") {
            line("placement_fail", {
              attempt,
              slot,
              phase: slotFailPhase,
              word: w,
              step,
              swapCount,
            });
            diag({
              kind: "placement_fail",
              attempt,
              slot,
              word: w,
              phase: slotFailPhase,
              msSlot,
              step,
            });
          }
          const overSlotBudget =
            placementSlotTimeBudgetMs !== undefined &&
            msSlot >= placementSlotTimeBudgetMs;
          const alt = pickSwapWordForSlot(slot, slotWordsTried, swapCount, seed);
          if (
            placementWordSwapEnabled &&
            alt &&
            swapCount < placementWordSwapMaxPerSlot &&
            !overSlotBudget
          ) {
            swapCount++;
            tally.placement_word_swap++;
            const fromWord = w;
            currentWords[slot] = {
              word: alt.word,
              min_tiles: alt.min_tiles,
              reuse: alt.reuse,
              wordTotal: alt.wordTotal,
            };
            gameBoard = cloneBoard(boardAtStepStart);
            orientationRowK = orientRowAtStep;
            orientationColK = orientColAtStep;
            chronShiftsBeforeToolbarStep[slot] = [];
            line("placement_word_swap", {
              attempt,
              step,
              slot,
              from: fromWord,
              to: alt.word,
              swapCount,
              phase: slotFailPhase,
              msSlot,
            });
            diag({
              kind: "placement_word_swap",
              attempt,
              step,
              slot,
              from: fromWord,
              to: alt.word,
              swapCount,
              phase: slotFailPhase,
            });
            continue slot_swap;
          }
          if (placementWordSwapEnabled && !alt) tally.fail_swap_exhausted++;
          if (overSlotBudget) {
            diag({
              kind: "placement_slot_timeout",
              attempt,
              slot,
              word: w,
              msSlot,
              budgetMs: placementSlotTimeBudgetMs,
            });
          }
          failed = true;
          break slot_swap;
        }
      } // end slot_swap while
      if (failed) break;
    } // end step for

    if (!failed && diagnoseBuild) {
      diag({
        kind: "placement_chain_ok",
        attempt,
        msWall: Date.now() - tAttemptWall,
        lookaheadOn: lookaheadPlacementGate,
      });
    }

    if (failed) {
      if (wantTiming)
        console.error("[auto-build] attempt_done ms=" + (Date.now() - tAttempt0), {
          attempt,
          outcome: "placement",
        });
      continue;
    }

    const orderAsc = currentWords
      .map((e, i) => ({ e, i }))
      .sort((a, b) => comparePoolWordEntriesAscForwardExport(a.e, b.e));
    const wordsAsc = orderAsc.map((x) => String(x.e.word || "").toLowerCase());
    const poolEntriesAsc = orderAsc.map((x) => currentWords[x.i]);

    /** @type {Array<Array<{ t: "row" | "col"; s: number }>> | null} */
    let perfect_hunt_shifts_before = null;
    if (shiftBetween) {
      perfect_hunt_shifts_before = Array.from(
        { length: PERFECT_HUNT_WORD_COUNT },
        () => []
      );
      for (let si = 1; si < PERFECT_HUNT_WORD_COUNT; si++) {
        const toolbarSlot = orderAsc[si].i;
        perfect_hunt_shifts_before[si] = normalizeShiftsBeforeOps(
          chronShiftsBeforeToolbarStep[toolbarSlot]
        );
      }
    }

    /** @type {number[][]} */
    let pathsAsc = orderAsc.map(
      (x) => (buildPlays[x.i] && buildPlays[x.i].pathFlat.slice()) || []
    );
    if (pathsAsc.some((p) => !p || !p.length)) {
      tally.fail_export_null++;
      line("export_paths_missing", { attempt });
      diag({ kind: "export_fail", attempt, reason: "placement_paths_missing" });
      continue;
    }

    /** Final generation board (gamemaker `starting_grid` / FIFO source). */
    /** @type {string[][]} */
    let exportGrid = gameBoard.map((r) => r.map((c) => String(c || "").toLowerCase()));

    if (shiftBetween && perfect_hunt_shifts_before) {
      const canon = canonicalOverlayGridFromShiftAscReplay(
        emptyBoard(n),
        wordsAsc,
        pathsAsc,
        perfect_hunt_shifts_before,
        n
      );
      if (!canon.ok) {
        tally.fail_export_null++;
        line("export_shift_canon_fail", { attempt, reason: canon.reason ?? "" });
        diag({ kind: "export_fail", attempt, reason: canon.reason ?? "shift_canon" });
        if (wantTiming)
          console.error("[auto-build] attempt_done ms=" + (Date.now() - tAttempt0), {
            attempt,
            outcome: "export_canon",
          });
        continue;
      }
    } else {
      const resolved = resolveAscendingPathsOnBoard(exportGrid, wordsAsc);
      if (!resolved) {
        tally.fail_export_null++;
        line("export_resolve_paths_fail", { attempt });
        diag({ kind: "export_fail", attempt, reason: "resolve_paths_on_final_grid" });
        if (wantTiming)
          console.error("[auto-build] attempt_done ms=" + (Date.now() - tAttempt0), {
            attempt,
            outcome: "export_paths",
          });
        continue;
      }
      pathsAsc = resolved;
    }

    const shippedStartingGrid = exportGrid.map((r) =>
      r.map((c) => String(c || "").toLowerCase())
    );

    /** Gamemaker export: `buildPlaysChron[i]` matches `currentWords[i]`. */
    const buildPlaysChronForExport = buildPlays.map((p) => {
      if (!p) return null;
      const w = String(p.word || "").toLowerCase();
      const ascIx = wordsAsc.indexOf(w);
      const pathFlat = ascIx >= 0 ? pathsAsc[ascIx] : p.pathFlat;
      return {
        word: p.word,
        pathFlat: pathFlat.slice(),
        covered: (p.covered || []).map((ch) => String(ch || "").toLowerCase()),
        min_tiles: p.min_tiles,
        starter_tor_neighbor_quad: Array.isArray(p.starter_tor_neighbor_quad)
          ? p.starter_tor_neighbor_quad.slice()
          : torNeighborQuadExportTokensFromBoard(exportGrid, pathFlat[0], n),
      };
    });

    if (!shiftBetween) {
      const fifoPlays = deriveCoveredPlaysForFinalGridFifo(
        exportGrid,
        wordsAsc,
        pathsAsc,
        poolEntriesAsc
      );
      if (!fifoPlays || fifoPlays.length !== PERFECT_HUNT_WORD_COUNT) {
        tally.fail_export_null++;
        line("export_fifo_covered_fail", { attempt });
        diag({ kind: "export_fail", attempt, reason: "fifo_covered" });
        if (wantTiming)
          console.error("[auto-build] attempt_done ms=" + (Date.now() - tAttempt0), {
            attempt,
            outcome: "export",
          });
        continue;
      }
      const fifoByWord = new Map(
        fifoPlays.map((fp) => [String(fp.word || "").toLowerCase(), fp])
      );
      for (const play of buildPlaysChronForExport) {
        if (!play) continue;
        const fifo = fifoByWord.get(String(play.word || "").toLowerCase());
        if (fifo) {
          play.covered = fifo.covered.slice();
          play.starter_tor_neighbor_quad = torNeighborQuadExportTokensFromBoard(
            exportGrid,
            play.pathFlat[0],
            n
          );
        }
      }
    }
    if (buildPlaysChronForExport.some((p) => p == null)) {
      tally.fail_export_null++;
      line("export_plays_incomplete", { attempt });
      continue;
    }

    const payload = buildGamemakerDictExportPayload({
      gameBoard: exportGrid,
      buildPlaysChron: /** @type {NonNullable<(typeof buildPlays)[0]>[]} */ (
        buildPlaysChronForExport
      ),
      currentWords,
      wordCount: PERFECT_HUNT_WORD_COUNT,
    });
    if (!payload) {
      tally.fail_export_null++;
      line("export_payload_null", { attempt });
      diag({ kind: "export_fail", attempt });
      if (wantTiming)
        console.error("[auto-build] attempt_done ms=" + (Date.now() - tAttempt0), {
          attempt,
          outcome: "export",
        });
      continue;
    }

    const playsForPayload = buildPlaysChronForExport;

    let nextTrim = stripTrailingEmptyNextLetters(
      Array.isArray(payload.next_letters) ? payload.next_letters.slice() : []
    );
    nextTrim = stripLeadingEmptyNextLetters(nextTrim);
    nextTrim = stripTrailingEmptyNextLetters(nextTrim);

    if (shiftBetween && perfect_hunt_shifts_before) {
      const boardHunt0 = applyShiftSeqToBoard(
        shippedStartingGrid.map((row) => row.slice()),
        perfect_hunt_shifts_before[0] || [],
        n
      );
      if (!pathSpellsWordOnBoard(boardHunt0, wordsAsc[0], pathsAsc[0], n)) {
        tally.fail_export_null++;
        line("export_first_hunt_not_on_starting_grid", { attempt, word: wordsAsc[0] });
        diag({
          kind: "export_fail",
          attempt,
          reason: "first_hunt_not_on_starting_grid",
          word: wordsAsc[0],
        });
        continue;
      }
    }

    let perfect_hunt_starter_tor_neighbors = payload.perfect_hunt_starter_tor_neighbors;
    if (shiftBetween && perfect_hunt_shifts_before) {
      let nextCanon;
      try {
        nextCanon = canonicalNextLettersFromJsonArray(nextTrim);
      } catch {
        tally.fail_export_null++;
        diag({ kind: "export_fail", attempt, reason: "next_letters_canon" });
        continue;
      }
      const huntReplay = shiftAwareStarterHintsReplay(
        shippedStartingGrid.map((r) => r.slice()),
        nextCanon,
        wordsAsc,
        pathsAsc,
        perfect_hunt_shifts_before,
        { fillEmptyPathCells: true }
      );
      if (!huntReplay.ok) {
        tally.fail_export_null++;
        line("export_shift_starter_hints_fail", {
          attempt,
          reason: huntReplay.reason ?? "",
          phase: huntReplay.phase ?? "",
        });
        diag({
          kind: "export_fail",
          attempt,
          reason: huntReplay.reason ?? "shift_starter_hints",
          phase: huntReplay.phase ?? "",
        });
        continue;
      }
      perfect_hunt_starter_tor_neighbors = flattenStarterNeighborSigs(
        huntReplay.perfect_hunt_starter_neighbor_sigs
      );
    }

    if (opts.skipPlayPathUniqueness === true) {
      // debug bypass
    } else if (shiftBetween) {
      const board0 = applyShiftSeqToBoard(
        shippedStartingGrid.map((r) => r.slice()),
        perfect_hunt_shifts_before[0] || [],
        n
      );
      let path0 = pathsAsc[0] || [];
      if (!pathSpellsWordOnBoard(board0, wordsAsc[0], path0, n)) {
        const picked = resolveOneWordPathOnShippedGrid(board0, wordsAsc[0], 0, {
          pathCatalog,
          seed: seed0,
          maxAttemptsPerWord,
          pathSearchExploreBudget,
        });
        if (!picked) {
          tally.fail_play_path_uniq++;
          lastPlayPathUniqFailure = {
            word: wordsAsc[0],
            huntIndex: 0,
            reason: "resolve_hunt0",
          };
          line("play_path_resolve_fail", { attempt, huntIndex: 0 });
          diag({ kind: "play_path_uniq_fail", attempt, reason: "resolve_hunt0" });
          continue;
        }
        path0 = picked;
      }
      const playUniq = assertUniqueFifoPlayPathOnBoard(board0, wordsAsc[0], path0, {
        uniqCountExploreBudget,
        pathSearchExploreBudget,
        maxAttemptsPerWord,
      });
      if (!playUniq.ok) {
        tally.fail_play_path_uniq++;
        const hi = typeof playUniq.huntIndex === "number" ? playUniq.huntIndex : 0;
        lastPlayPathUniqFailure = {
          word: wordsAsc[hi] ?? wordsAsc[0],
          huntIndex: hi,
          reason: playUniq.reason ?? "",
        };
        if (opts.debugVerify || trace)
          line("play_path_uniq_fail", {
            attempt,
            reason: playUniq.reason ?? "",
            huntIndex: playUniq.huntIndex,
          });
        diag({
          kind: "play_path_uniq_fail",
          attempt,
          reason: playUniq.reason ?? "",
          huntIndex: playUniq.huntIndex,
        });
        if (wantTiming)
          console.error("[auto-build] attempt_done ms=" + (Date.now() - tAttempt0), {
            attempt,
            outcome: "play_path_uniq",
          });
        continue;
      }
    } else {
      const uniqPathsAsc = pathsAsc;
      const playUniq = assertUniqueFifoPlayPathsOnShippedGrid(
        {
          starting_grid: shippedStartingGrid,
          perfect_hunt: wordsAsc,
          pathsAsc: uniqPathsAsc,
          perfect_hunt_shifts_before: null,
        },
        {
          uniqCountExploreBudget,
          pathSearchExploreBudget,
          maxAttemptsPerWord,
        }
      );
      if (!playUniq.ok) {
        tally.fail_play_path_uniq++;
        const hi = typeof playUniq.huntIndex === "number" ? playUniq.huntIndex : 0;
        lastPlayPathUniqFailure = {
          word: wordsAsc[hi] ?? wordsAsc[0],
          huntIndex: hi,
          reason: playUniq.reason ?? "",
        };
        if (opts.debugVerify || trace)
          line("play_path_uniq_fail", {
            attempt,
            reason: playUniq.reason ?? "",
            huntIndex: playUniq.huntIndex,
          });
        diag({
          kind: "play_path_uniq_fail",
          attempt,
          reason: playUniq.reason ?? "",
          huntIndex: playUniq.huntIndex,
        });
        if (wantTiming)
          console.error("[auto-build] attempt_done ms=" + (Date.now() - tAttempt0), {
            attempt,
            outcome: "play_path_uniq",
          });
        continue;
      }
    }

    if (opts.skipForwardVerify !== true) {
      const vrf = verifyForwardPuzzleIfCoveredChain(
        shippedStartingGrid.map((r) => r.slice()),
        nextTrim,
        wordsAsc,
        pathsAsc,
        playsForPayload,
        shiftBetween ? perfect_hunt_shifts_before : null,
        shiftBetween
          ? {
              fillEmptyPathCells: true,
              pathCatalog,
              seed: seed0,
              maxAttemptsPerWord,
              pathSearchExploreBudget,
              uniqCountExploreBudget,
              skipPlayPathUniqueness: opts.skipPlayPathUniqueness === true,
            }
          : {
              pathCatalog,
              seed: seed0,
              maxAttemptsPerWord,
              pathSearchExploreBudget,
              uniqCountExploreBudget,
              skipPlayPathUniqueness: opts.skipPlayPathUniqueness === true,
            }
      );
      if (!vrf.ok) {
        tally.fail_verify++;
        if (opts.debugVerify || trace)
          line("verify_fail", { attempt, reason: vrf.reason ?? "" });
        diag({ kind: "verify_fail", attempt, reason: vrf.reason ?? "" });
        if (wantTiming)
          console.error("[auto-build] attempt_done ms=" + (Date.now() - tAttempt0), {
            attempt,
            outcome: "verify",
          });
        continue;
      }
    } else if (trace) {
      line("verify_skipped", { attempt });
    }

    /** @type {Record<string, unknown>} */
    const row = {
      starting_grid: shippedStartingGrid.map((r) =>
        r.map((c) => String(c || "").toLowerCase())
      ),
      next_letters: nextTrim,
      perfect_hunt: payload.perfect_hunt.map((w) => String(w || "").toLowerCase()),
      perfect_hunt_starter_tor_neighbors,
    };
    if (perfect_hunt_shifts_before) {
      row.perfect_hunt_shifts_before = perfect_hunt_shifts_before;
    }

    diag({ kind: "success", attempt });
    return { ok: true, row, payload, pathsAsc, wordsAsc };
  }

  diag({
    kind: "run_exhausted",
    wholeBuildAttempts,
    tally,
    maxAttemptsPerWord,
    lookaheadOn: lookaheadPlacementGate,
    innerKMaxEffective: innerKMaxDefaulted,
  });

  line("exhausted", {
    wholeBuildAttempts,
    tally,
    maxAttemptsPerWord,
    lookaheadOn: lookaheadPlacementGate,
    innerKConfigured: innerKConfigured ?? undefined,
    innerKMaxEffective: innerKMaxDefaulted,
  });
  if (wantTiming && !trace) {
    console.error(
      "[auto-build] exhausted",
      JSON.stringify({
        wholeBuildAttempts,
        tally,
        maxAttemptsPerWord,
        innerKMaxEffective: innerKMaxDefaulted,
      })
    );
  }
  /** @type {{ ok: false; reason: string; failureTally?: Record<string, number> }} */
  const out = {
    ok: false,
    reason: "exhausted wholeBuildAttempts without valid verify",
  };
  if (opts.returnFailureTally === true) out.failureTally = { ...tally };
  if (
    (opts.returnLastPlacementFailure === true || opts.returnFailureTally === true) &&
    lastPlacementFailure
  ) {
    out.lastPlacementFailure = lastPlacementFailure;
  }
  if (opts.returnLastPlayPathUniqFailure === true && lastPlayPathUniqFailure) {
    out.lastPlayPathUniqFailure = lastPlayPathUniqFailure;
  }
  return out;
}
