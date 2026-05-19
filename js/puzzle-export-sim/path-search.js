/**
 * Path counting and randomized DFS placement search.
 * @module puzzle-export-sim/path-search
 */
import { GRID_SIZE } from "../config.js";
import {
  wordToTileLabelSequence,
  minUniqueTilesForReuseRule,
  normalizeTileText,
  analyzeTileReusePairing,
} from "../board-logic.js";
import { rotatePathFlatQuarterTurnsCW } from "./grid-symmetry.js";
import {
  mulberry32,
  popcntMask,
  shuffleInPlace,
  neighborFlats,
  pathFlatReuseMatchesGlyphPerFlat,
  buildBoardForUniquenessFromSnapshot,
  fifoFirstVisitSpellingSignature,
  orderNeighborsSoftSnapshotStraight,
  orderNeighborsReuseHubCentrality,
  reuseHubOrderingPressure,
  tileNormalizedAt,
} from "./path-placement.js";

/**
 * Brute-force counts on this fixed-letter board (each step's tile glyph matches `word`, king moves + reuse rules).
 *
 * **`uniqueSpellingMode: 'geometry'`** (default): counts **distinct valid paths** (full stroke sequences).
 *
 * **`uniqueSpellingMode: 'fifo_equivalence'`**: counts **distinct** {@link fifoFirstVisitSpellingSignature} keys —
 * paths that share first-visit flat order + glyphs imprinted at those visits collapse to one class.
 *
 * Stop early via `stopAfter` (default unlimited) — use `2` to check ambiguity (`≠ 1` gates reject).
 * Pass **`exploreBudget: { remaining: number }`** to cap DFS (mutation); if exhausted mid-count — **ambiguous**
 * for gates (`≠ 1`): finite **`stopAfter`** → return **`stopAfter`**, else **`2`**, unless already **`≥ stopAfter`**
 * distinct items were collected.
 */
export function countGamemakerWordPathsOnBoard(word, board, opts = {}) {
  const gridSize = opts.gridSize ?? GRID_SIZE;
  const stopAfter =
    typeof opts.stopAfter === "number" ? opts.stopAfter : Number.POSITIVE_INFINITY;
  const exploreBudgetRaw =
    opts.exploreBudget != null &&
    typeof opts.exploreBudget === "object" &&
    typeof opts.exploreBudget.remaining === "number"
      ? opts.exploreBudget
      : null;
  const uniqueSpellingMode =
    opts.uniqueSpellingMode === "fifo_equivalence" ? "fifo_equivalence" : "geometry";
  const glyphs = wordToTileLabelSequence(String(word || "").toLowerCase());
  const minTiles = minUniqueTilesForReuseRule(glyphs);
  const n = gridSize;
  const L = glyphs.length;

  function flatMatchesGlyphIdx(flat, gi) {
    const t = tileNormalizedAt(board, flat, n);
    if (t === "") return false;
    return t === normalizeTileText(glyphs[gi]);
  }

  if (uniqueSpellingMode === "fifo_equivalence") {
    /** @type {Set<string>} */
    const signatures = new Set();
    let abortedCount = false;

    /** @param {number[]} path */
    function dfsFifo(path) {
      if (Number.isFinite(stopAfter) && signatures.size >= stopAfter) return;
      if (exploreBudgetRaw != null) {
        exploreBudgetRaw.remaining -= 1;
        if (exploreBudgetRaw.remaining < 0) {
          abortedCount = true;
          return;
        }
      }
      if (path.length === L) {
        if (
          new Set(path).size === minTiles &&
          pathFlatReuseMatchesGlyphPerFlat(path, glyphs)
        ) {
          signatures.add(fifoFirstVisitSpellingSignature(path, glyphs));
        }
        return;
      }
      const last = path[path.length - 1];
      const ix = path.length;
      const neigh = neighborFlats(last, n);
      for (const nf of neigh) {
        if (!flatMatchesGlyphIdx(nf, ix)) continue;
        if (path.length >= 2 && nf === path[path.length - 2]) continue;
        path.push(nf);
        dfsFifo(path);
        path.pop();
        if (Number.isFinite(stopAfter) && signatures.size >= stopAfter) return;
        if (abortedCount) return;
      }
    }

    outerFifo: for (let f = 0; f < n * n; f++) {
      if (!flatMatchesGlyphIdx(f, 0)) continue;
      dfsFifo([f]);
      if (Number.isFinite(stopAfter) && signatures.size >= stopAfter) break outerFifo;
      if (abortedCount) break outerFifo;
    }

    if (abortedCount) {
      if (signatures.size >= stopAfter && Number.isFinite(stopAfter))
        return signatures.size;
      return Number.isFinite(stopAfter) ? stopAfter : 2;
    }
    return signatures.size;
  }

  let found = 0;
  let abortedCount = false;

  /** @param {number[]} path */
  function dfs(path) {
    if (found >= stopAfter) return;
    if (exploreBudgetRaw != null) {
      exploreBudgetRaw.remaining -= 1;
      if (exploreBudgetRaw.remaining < 0) {
        abortedCount = true;
        return;
      }
    }
    if (path.length === L) {
      if (
        new Set(path).size === minTiles &&
        pathFlatReuseMatchesGlyphPerFlat(path, glyphs)
      ) {
        found++;
      }
      return;
    }
    const last = path[path.length - 1];
    const ix = path.length;
    const neigh = neighborFlats(last, n);
    for (const nf of neigh) {
      if (!flatMatchesGlyphIdx(nf, ix)) continue;
      if (path.length >= 2 && nf === path[path.length - 2]) continue;
      path.push(nf);
      dfs(path);
      path.pop();
      if (found >= stopAfter) return;
      if (abortedCount) return;
    }
  }

  outer: for (let f = 0; f < n * n; f++) {
    if (!flatMatchesGlyphIdx(f, 0)) continue;
    dfs([f]);
    if (found >= stopAfter) break outer;
    if (abortedCount) break outer;
  }

  if (abortedCount) {
    if (found >= stopAfter && Number.isFinite(stopAfter)) return found;
    return Number.isFinite(stopAfter) ? stopAfter : 2;
  }

  return found;
}
/**
 * Stable-partition neighbor trial order: at reuse-second endpoint steps try the paired hub flat first when present.
 *
 * @param {number[]} neighborOrder
 * @param {number | null | undefined} hubFlat earlier flat index fixed by partner pairing (must equal path partner cell)
 */
function stablePartnerHubFirst(neighborOrder, hubFlat) {
  if (hubFlat == null) return neighborOrder;
  const pref = [];
  const rest = [];
  for (const x of neighborOrder) {
    if (x === hubFlat) pref.push(x);
    else rest.push(x);
  }
  return pref.length ? pref.concat(rest) : neighborOrder;
}

/**
 * @param {number} startFlat
 * @param {string} wordLc
 * @param {string[]} glyphs
 * @param {number} nSteps
 * @param {number} minTiles
 * @param {() => number} rng
 * @param {number} gridSize
 * @param {boolean} preferStraight
 * @param {boolean} requireUniqueSpelling
 * @param {string[][] | null | undefined} neighborSnap snapshot for neighbor-tier / gate (null in overlay mode)
 * @param {string[][] | null | undefined} uniquenessSnap full grid for ambiguity count (real `snapshotBoard4` even when overlay)
 * @param {boolean} preferSnapshotLetterMatch
 * @param {{ remaining: number } | null} exploreBudget DFS node budget (**mutates** `.remaining`; when exhausted, prune this branch)
 * @param {number | null | undefined} uniqCountExploreBudget when set — **`countGamemakerWordPathsOnBoard`** uses a fresh `{ remaining }` per leaf check (**cap** uniqueness DFS); **`null`/unset** skips the cap inside `dfsFromStart` (caller may still omit via `findRandomLegalPathFlat` options).
 * @param {boolean} reuseHubBias when true and word has reuse — secondary neighbor ordering favors central hubs.
 * @param {number} reuseHubCentralityWeight tie-break magnitude (**~0.18** default when bias enabled).
 * @param {(number | null)[]} partnerAtStep from **`analyzeTileReusePairing`** (`length === nSteps`).
 * @param {boolean} reusePairingHardConstraint Tier B — hub-only extension when hub adjacent (**risk**: alternate maximal pairings).
 * @param {'geometry' | 'fifo_equivalence'} uniqueSpellingMode leaf ambiguity counting mode for **`countGamemakerWordPathsOnBoard`**.
 */
function dfsFromStart(
  startFlat,
  wordLc,
  glyphs,
  nSteps,
  minTiles,
  rng,
  gridSize,
  preferStraight,
  requireUniqueSpelling,
  neighborSnap,
  uniquenessSnap,
  preferSnapshotLetterMatch,
  exploreBudget,
  uniqCountExploreBudget,
  reuseHubBias,
  reuseHubCentralityWeight,
  partnerAtStep,
  reusePairingHardConstraint,
  uniqueSpellingMode
) {
  const reuseFrac = (nSteps - minTiles) / Math.max(nSteps, 1);
  const path = [startFlat];
  let mask = 1 << startFlat;

  function extend() {
    if (exploreBudget != null) {
      exploreBudget.remaining -= 1;
      if (exploreBudget.remaining < 0) return null;
    }
    if (path.length === nSteps) {
      if (
        popcntMask(mask) !== minTiles ||
        !pathFlatReuseMatchesGlyphPerFlat(path, glyphs)
      ) {
        return null;
      }
      if (requireUniqueSpelling !== false) {
        const brd = buildBoardForUniquenessFromSnapshot(
          uniquenessSnap ?? null,
          path.slice(),
          glyphs,
          gridSize
        );
        const uniqEb =
          typeof uniqCountExploreBudget === "number" &&
          Number.isFinite(uniqCountExploreBudget) &&
          uniqCountExploreBudget > 0
            ? { remaining: uniqCountExploreBudget }
            : null;
        if (
          !brd ||
          countGamemakerWordPathsOnBoard(wordLc, brd, {
            gridSize,
            stopAfter: 2,
            uniqueSpellingMode,
            ...(uniqEb ? { exploreBudget: uniqEb } : {}),
          }) !== 1
        ) {
          return null;
        }
      }
      return path.slice();
    }
    const stepsLeft = nSteps - path.length;
    const dcNow = popcntMask(mask);
    if (dcNow > minTiles) return null;
    if (dcNow + stepsLeft < minTiles) return null;

    const glyphIdx = path.length;
    const pReuse = partnerAtStep[glyphIdx];
    const hubFlat = pReuse != null && pReuse < glyphIdx ? path[pReuse] : null;
    const glyphNeedNorm = normalizeTileText(glyphs[glyphIdx]);
    const last = path[path.length - 1];
    let neigh = neighborFlats(/** @type {number} */ (last), gridSize);
    if (dcNow === minTiles) {
      neigh = neigh.filter((f) => mask & (1 << f));
    }
    if (reusePairingHardConstraint && hubFlat != null && neigh.includes(hubFlat)) {
      /** Tier B optional hard prune — alternate maximal disjoint pairings can invalidate this restriction. */
      neigh = [hubFlat];
    }
    const orderBoard = uniquenessSnap ?? neighborSnap ?? null;
    const ordered = orderNeighborsSoftSnapshotStraight(
      neigh,
      path,
      last,
      glyphNeedNorm,
      orderBoard,
      rng,
      gridSize,
      preferStraight,
      preferSnapshotLetterMatch,
      reuseFrac
    );
    const hubPressure = reuseHubOrderingPressure(dcNow, minTiles, stepsLeft, reuseFrac);
    const ordered2 =
      reuseHubBias && reuseFrac > 0 && hubPressure > 0 && reuseHubCentralityWeight > 0
        ? orderNeighborsReuseHubCentrality(
            ordered,
            gridSize,
            rng,
            reuseFrac,
            hubPressure,
            reuseHubCentralityWeight
          )
        : ordered;
    /** Tier A reuse-guided ordering: prefer the paired hub flat when this glyph step is its second endpoint. */
    const orderedReuse =
      hubFlat != null ? stablePartnerHubFirst(ordered2, hubFlat) : ordered2;
    for (const next of orderedReuse) {
      let reusedOk = true;
      for (let k = 0; k < path.length; k++) {
        if (path[k] === next && glyphs[k] !== glyphs[glyphIdx]) {
          reusedOk = false;
          break;
        }
      }
      if (!reusedOk) continue;
      if (path.length >= 2 && next === path[path.length - 2]) continue;
      const nm = mask | (1 << next);
      if (popcntMask(nm) > minTiles) continue;
      const oldMask = mask;
      path.push(next);
      mask = nm;
      const got = extend();
      path.pop();
      mask = oldMask;
      if (got) return got;
    }
    return null;
  }

  return extend();
}

/**
 * Find one legally spellable path on board positions only (tile letters would repeat on
 * revisits as in real gameplay). Sweeps starts in random order with straight-preferred DFS
 * per start (shuffle-only mode when `preferStraight === false`). Returns null if none found.
 *
 * @param {string} word
 * @param {{
 *   gridSize?: number;
 *   seed?: number;
 *   maxAttempts?: number;
 *   maxExploreNodes?: number | null; cap DFS **`extend`** calls **for the whole `findRandomLegalPathFlat` run** (shared across outer shuffle rounds and start cells); omit/unset for unrestricted.
 *   uniqCountExploreBudget?: number | null; cap **`countGamemakerWordPathsOnBoard`** leaves (**fresh budget per uniq check**) — avoids pathological ambiguity proofs hanging the builder.
 *   preferStraight?: boolean;
 *   requireUniqueSpelling?: boolean;
 *   snapshotBoard4?: string[][] | null;
 *   preferSnapshotLetterMatch?: boolean;
 *   ignoreSnapshotLetterGate?: boolean;
 *   pathRotationQuarterTurnsCW?: 0 | 1 | 2 | 3;
 *   debugPathSearch?: boolean;
 *   debugPathSearchLabel?: string;
 *   reuseHubCentralityBias?: boolean; when true (builder) and word has tile reuse — DFS neighbor order favors central high-degree hubs (**legality unchanged**).
 *   reuseHubCentralityWeight?: number; tie-break strength (**default `0.18`** when bias on); omit or **`≤ 0`** to disable reordering inside biased runs.
 *   uniqueSpellingMode?: 'geometry' | 'fifo_equivalence'; default **`geometry`**. **`fifo_equivalence`** counts distinct {@link fifoFirstVisitSpellingSignature} keys only (**GameMaker/live parity not guaranteed** — refill tooling mode).
 *   reusePairingHardConstraint?: boolean; default **`false`**. **`true`** — Tier B hub-only pruning when the maximal pairing hub is adjacent (**false negatives** under alternate maximal pairings).
 * }} [options]
 * @returns {{ pathFlat: number[]; minTiles: number; reuse: number } | null}
 */
export function findRandomLegalPathFlat(word, options = {}) {
  const gridSize = options.gridSize ?? GRID_SIZE;
  const cellCount = gridSize * gridSize;
  const lc = String(word || "").toLowerCase();
  const glyphs = wordToTileLabelSequence(lc);
  const minTiles = minUniqueTilesForReuseRule(glyphs);
  const nSteps = glyphs.length;
  const reuse = nSteps - minTiles;
  const preferStraight = options.preferStraight !== false;
  const requireUniqueSpelling = options.requireUniqueSpelling !== false;
  const snapshotBoard4 =
    options.snapshotBoard4 !== undefined ? options.snapshotBoard4 : null;
  /** Placement is always overlay: snapshot letters do not gate DFS; snapshot is used for cover-existing bias and uniqueness. */
  const neighborSnap = null;
  const uniquenessSnap = snapshotBoard4;
  const preferCoverExistingNeighbors =
    typeof options.preferCoverExistingNeighbors === "boolean"
      ? options.preferCoverExistingNeighbors
      : typeof options.preferSnapshotLetterMatch === "boolean"
        ? options.preferSnapshotLetterMatch
        : true;
  const rotationQ = (((Number(options.pathRotationQuarterTurnsCW) | 0) % 4) + 4) % 4;

  if (nSteps === 0) {
    return { pathFlat: [], minTiles: 0, reuse: 0 };
  }

  const maxAttempts =
    typeof options.maxAttempts === "number" && options.maxAttempts > 0
      ? Math.floor(options.maxAttempts)
      : 4096;

  const exploreNodesCfg =
    typeof options.maxExploreNodes === "number" &&
    Number.isFinite(options.maxExploreNodes) &&
    options.maxExploreNodes > 0
      ? Math.floor(options.maxExploreNodes)
      : null;

  const uniqCountExploreCfg =
    typeof options.uniqCountExploreBudget === "number" &&
    Number.isFinite(options.uniqCountExploreBudget) &&
    options.uniqCountExploreBudget > 0
      ? Math.floor(options.uniqCountExploreBudget)
      : null;

  const reuseHubBias = options.reuseHubCentralityBias === true && reuse > 0;
  const hubWExplicit =
    typeof options.reuseHubCentralityWeight === "number" &&
    Number.isFinite(options.reuseHubCentralityWeight);
  const reuseHubCentralityWeight = reuseHubBias
    ? hubWExplicit
      ? Math.max(0, /** @type {number} */ (options.reuseHubCentralityWeight))
      : 0.18
    : 0;

  const uniqueSpellingMode =
    options.uniqueSpellingMode === "fifo_equivalence" ? "fifo_equivalence" : "geometry";
  const reusePairingHardConstraint = options.reusePairingHardConstraint === true;
  const { partnerAtStep } = analyzeTileReusePairing(glyphs);

  const baseSeed =
    typeof options.seed === "number" && Number.isFinite(options.seed)
      ? Math.floor(options.seed)
      : Date.now() & 0xffffffff;

  const tracePath = options.debugPathSearch === true;
  const traceLabelRaw = options.debugPathSearchLabel;
  const traceLabel =
    typeof traceLabelRaw === "string" && traceLabelRaw.trim() !== ""
      ? traceLabelRaw.trim()
      : "";
  const tPathAll0 = tracePath ? Date.now() : 0;
  const heartbeatEvery = Math.max(5, Math.min(200, Math.floor(maxAttempts / 25) || 5));

  const invocationPathBudget =
    exploreNodesCfg != null ? { remaining: exploreNodesCfg } : null;

  for (let att = 0; att < maxAttempts; att++) {
    if (invocationPathBudget != null && invocationPathBudget.remaining < 0) break;
    const rng = mulberry32(baseSeed + att * 1000003);
    const starts = [];
    for (let f = 0; f < cellCount; f++) {
      starts.push(f);
    }
    if (starts.length === 0) continue;
    if (
      tracePath &&
      (att === 0 || att % heartbeatEvery === 0 || att === maxAttempts - 1)
    ) {
      console.error(
        "[path-search]",
        JSON.stringify({
          label: traceLabel || "(path)",
          word: lc,
          outerAtt: att,
          outerMax: maxAttempts,
          nSteps,
          requireUniqueSpelling: requireUniqueSpelling !== false,
          starterCount: starts.length,
          elapsedMs: Date.now() - tPathAll0,
        })
      );
    }
    shuffleInPlace(starts, rng);
    for (const s of starts) {
      const candidate = dfsFromStart(
        s,
        lc,
        glyphs,
        nSteps,
        minTiles,
        rng,
        gridSize,
        preferStraight,
        requireUniqueSpelling,
        neighborSnap,
        uniquenessSnap,
        preferCoverExistingNeighbors,
        invocationPathBudget,
        uniqCountExploreCfg,
        reuseHubBias,
        reuseHubCentralityWeight,
        partnerAtStep,
        reusePairingHardConstraint,
        uniqueSpellingMode
      );
      if (candidate) {
        /** @type {number[]} */
        let outPath = candidate;
        if (rotationQ !== 0) {
          outPath = rotatePathFlatQuarterTurnsCW(candidate, rotationQ, gridSize);
          if (requireUniqueSpelling !== false) {
            const brd = buildBoardForUniquenessFromSnapshot(
              snapshotBoard4 ?? null,
              outPath,
              glyphs,
              gridSize
            );
            const uniqEb =
              uniqCountExploreCfg != null ? { remaining: uniqCountExploreCfg } : null;
            if (
              !brd ||
              countGamemakerWordPathsOnBoard(lc, brd, {
                gridSize,
                stopAfter: 2,
                uniqueSpellingMode,
                ...(uniqEb ? { exploreBudget: uniqEb } : {}),
              }) !== 1
            ) {
              continue;
            }
          }
        }
        if (tracePath) {
          console.error(
            "[path-search] found",
            JSON.stringify({
              label: traceLabel || "(path)",
              word: lc,
              outerAtt: att,
              elapsedMs: Date.now() - tPathAll0,
              minTiles,
              reuse,
            })
          );
        }
        return { pathFlat: outPath, minTiles, reuse };
      }
    }
  }

  if (tracePath) {
    console.error(
      "[path-search] exhausted",
      JSON.stringify({
        label: traceLabel || "(path)",
        word: lc,
        outerMax: maxAttempts,
        elapsedMs: Date.now() - tPathAll0,
      })
    );
  }
  return null;
}
