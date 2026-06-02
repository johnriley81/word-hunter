/**
 * Path geometry, placement scoring, and legality checks (no DFS search).
 * @module puzzle-export-sim/path-placement
 */
import { GRID_SIZE } from "../config.js";
import {
  wordToTileLabelSequence,
  minUniqueTilesForReuseRule,
  normalizeTileText,
  minTileLikeBudgetMultisetFromLabels,
  analyzeTileReusePairing,
} from "../board-logic.js";
import { rotatePathFlatQuarterTurnsCW } from "./grid-symmetry.js";

/** Per first-visit on a blank snapshot cell; dominates covered-letter tie-break (see {@link scorePlacementCoverExisting}). */
export const PLACEMENT_BLANK_FIRST_WEIGHT = 4096;

/** Hub centrality tie-break magnitude (matches builder subsample ranking). */
export const PLACEMENT_HUB_RANK_WEIGHT = 720;

/** Mulberry32 — deterministic RNG for `--seed`. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function popcntMask(mask) {
  let m = mask >>> 0;
  let c = 0;
  while (m) {
    m &= m - 1;
    c++;
  }
  return c;
}

/** Fisher-Yates shuffle in place with rng() ∈ [0,1). */
export function shuffleInPlace(arr, rng) {
  const a = arr;
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
}

/**
 * Integer delta from flat `a` to `b` on an n×n row-major grid (each in {-1,0,1} for
 * king-adjacent cells).
 */
export function flatStepDelta(a, b, gridSize) {
  const n = Math.max(1, Math.floor(Number(gridSize)) || GRID_SIZE);
  const ar = Math.floor(a / n);
  const ac = a % n;
  const br = Math.floor(b / n);
  const bc = b % n;
  return { dr: br - ar, dc: bc - ac };
}

/**
 * Lower = better for “long straight runs”: 0 continues previous direction, orthogonal-first
 * when no prior vector, penalize diagonal elbows when reuse allows straighter solves.
 *
 * @param {number[]} path prefix (last cell is `lastFlat`)
 * @param {number} lastFlat `path[path.length - 1]`
 * @param {number} nextFlat candidate next cell
 * @param {number} gridSize
 * @returns {number} tier in [0, 4]
 */
export function straightPreferenceTier(path, lastFlat, nextFlat, gridSize) {
  const n = Math.max(1, Math.floor(Number(gridSize)) || GRID_SIZE);
  const v2 = flatStepDelta(lastFlat, nextFlat, n);
  const man2 = Math.abs(v2.dr) + Math.abs(v2.dc);
  const orth2 = man2 === 1;

  if (path.length < 2) {
    return orth2 ? 0 : 2;
  }
  const prev = path[path.length - 2];
  const v1 = flatStepDelta(prev, lastFlat, n);
  if (v1.dr === v2.dr && v1.dc === v2.dc) {
    return 0;
  }
  const orth1 = Math.abs(v1.dr) + Math.abs(v1.dc) === 1;
  if (orth1 && orth2) {
    return 1;
  }
  if (!orth1 && orth2) {
    return 3;
  }
  if (orth1 && !orth2) {
    return 3;
  }
  return 4;
}

/**
 * @returns {number[]} neighbor flats in explorer order — straight-preferring unless
 * `preferStraight === false`.
 */
function orderNeighborsStraightPreference(
  neigh,
  path,
  lastFlat,
  rng,
  gridSize,
  preferStraight,
  reuseFrac
) {
  if (!preferStraight || neigh.length <= 1) {
    const a = neigh.slice();
    shuffleInPlace(a, rng);
    return a;
  }
  /** @type {{ i: number, next: number }[]} */
  const scored = neigh.map((next, idx) => ({
    i: idx,
    next,
    key:
      straightPreferenceTier(path, lastFlat, next, gridSize) +
      rng() * (0.08 + 2.85 * reuseFrac),
  }));
  scored.sort((a, b) => (a.key !== b.key ? a.key - b.key : a.i - b.i));
  return scored.map((s) => s.next);
}

/**
 * Snapshot-aware neighbor DFS order — **never drops** edges. Tier 0 = already-lettered tile (any letter);
 * tier 1 = blank. Overlay placement may cross wrong letters; they are only deprioritized.
 */
function orderNeighborsSoftSnapshotStraight(
  neigh,
  path,
  lastFlat,
  _glyphNeedNorm,
  snapshotBoard4,
  rng,
  gridSize,
  preferStraight,
  preferCoverExistingNeighbors,
  reuseFrac
) {
  if (!preferCoverExistingNeighbors || !snapshotBoard4) {
    return orderNeighborsStraightPreference(
      neigh,
      path,
      lastFlat,
      rng,
      gridSize,
      preferStraight,
      reuseFrac
    );
  }
  /** @type {{ next: number; key: number; i: number }[]} */
  const scored = [];
  for (let idx = 0; idx < neigh.length; idx++) {
    const next = neigh[idx];
    const t = tileNormalizedAt(snapshotBoard4, next, gridSize);
    const snapT = t === "" ? 1 : 0;
    const st = preferStraight
      ? straightPreferenceTier(path, lastFlat, next, gridSize)
      : Math.floor(rng() * 5);
    const key = snapT * 10 + st + rng() * (0.08 + 2.85 * reuseFrac);
    scored.push({ next, key, i: idx });
  }
  scored.sort((a, b) => (a.key !== b.key ? a.key - b.key : a.i - b.i));
  return scored.map((s) => s.next);
}

/**
 * King-adjacent neighbors (orthogonal + diagonal) on a square grid — matches
 * `isAdjacentGridTiles` when both indices lie on-board.
 *
 * @param {number} flat row-major flat index in [0, gridSize²)
 * @param {number} [gridSize]
 * @returns {number[]}
 */
export function neighborFlats(flat, gridSize = GRID_SIZE) {
  const n = Math.max(1, Math.floor(Number(gridSize)) || GRID_SIZE);
  const r = Math.floor(flat / n);
  const c = flat % n;
  const out = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < n && nc >= 0 && nc < n) {
        out.push(nr * n + nc);
      }
    }
  }
  return out;
}

/**
 * King-graph degree of `flat` on an n×n grid (corner 3 … interior 8 on 4×4).
 *
 * @param {number} flat
 * @param {number} [gridSize]
 */
export function kingDegree(flat, gridSize = GRID_SIZE) {
  return neighborFlats(flat, gridSize).length;
}

/**
 * Larger ⇒ closer to grid center (king grid “hub” heuristic). Uses Manhattan distance to **(n−1)/2**.
 *
 * @param {number} flat
 * @param {number} [gridSize]
 */
export function centerProximityScore(flat, gridSize = GRID_SIZE) {
  const n = Math.max(1, Math.floor(Number(gridSize)) || GRID_SIZE);
  const r = Math.floor(flat / n);
  const c = flat % n;
  const rc = (n - 1) / 2;
  const dist = Math.abs(r - rc) + Math.abs(c - rc);
  return -dist;
}

/**
 * Placement ranking: reward paths whose **revisited** flats sit on central, high-degree cells.
 * Each extra visit beyond the first at flat `f` contributes **`extra × (kingDegree(f) + centerProximityScore(f))`**.
 *
 * @param {number[]} pathFlat
 * @param {number} [gridSize]
 */
export function scoreReuseHubCentrality(pathFlat, gridSize = GRID_SIZE) {
  const n = Math.max(1, Math.floor(Number(gridSize)) || GRID_SIZE);
  if (!Array.isArray(pathFlat) || pathFlat.length === 0) return 0;
  /** @type {Map<number, number>} */
  const counts = new Map();
  for (let i = 0; i < pathFlat.length; i++) {
    const f = pathFlat[i];
    counts.set(f, (counts.get(f) ?? 0) + 1);
  }
  let sum = 0;
  for (const [f, cnt] of counts) {
    if (cnt < 2) continue;
    const extra = cnt - 1;
    sum += extra * (kingDegree(f, n) + centerProximityScore(f, n));
  }
  return sum;
}

/**
 * @param {number} dcNow popcntMask distinct visited
 * @param {number} minTiles
 * @param {number} stepsLeft inclusive steps remaining including current extension
 * @param {number} reuseFrac (nSteps - minTiles) / nSteps
 */
function reuseHubOrderingPressure(dcNow, minTiles, stepsLeft, reuseFrac) {
  if (reuseFrac <= 0 || stepsLeft <= 0) return 0;
  if (dcNow >= minTiles) return 1;
  const distinctRemaining = minTiles - dcNow;
  const slack = stepsLeft - distinctRemaining;
  if (slack <= 0) return 1;
  return Math.min(
    1,
    0.35 + 0.65 * (distinctRemaining / Math.max(stepsLeft, 1)) + 0.35 * reuseFrac
  );
}

/**
 * Secondary ordering: prefer hub-friendly cells; preserves snapshot/straight priority via `ordIdx` dominance.
 *
 * @param {number[]} ordered neighbors from `orderNeighborsSoftSnapshotStraight`
 * @param {number} mask visited bitmask
 * @param {number} gridSize
 * @param {() => number} rng
 * @param {number} reuseFrac
 * @param {number} pressure [0,1]
 * @param {number} weight user weight (typically 0.1–0.3)
 */
/** @type {Map<number, { min: number; max: number }>} */
const geomHubBoundsCache = new Map();

function geomHubMinMax(gridSize) {
  const n = Math.max(1, Math.floor(Number(gridSize)) || GRID_SIZE);
  const cached = geomHubBoundsCache.get(n);
  if (cached) return cached;
  const nc = n * n;
  let max = -Infinity;
  let min = Infinity;
  for (let f = 0; f < nc; f++) {
    const g = kingDegree(f, n) + centerProximityScore(f, n);
    max = Math.max(max, g);
    min = Math.min(min, g);
  }
  const out = { min, max };
  geomHubBoundsCache.set(n, out);
  return out;
}

/**
 * Secondary ordering: prefer hub-friendly cells; preserves snapshot/straight priority via `ordIdx` dominance.
 *
 * @param {number[]} ordered neighbors from `orderNeighborsSoftSnapshotStraight`
 * @param {number} gridSize
 * @param {() => number} rng
 * @param {number} reuseFrac
 * @param {number} pressure [0,1]
 * @param {number} weight user weight (typically 0.1–0.3)
 */
function orderNeighborsReuseHubCentrality(
  ordered,
  gridSize,
  rng,
  reuseFrac,
  pressure,
  weight
) {
  if (!ordered.length || pressure <= 0 || weight <= 0) return ordered;
  const { min: minGeom, max: maxGeom } = geomHubMinMax(gridSize);
  const span = Math.max(1e-6, maxGeom - minGeom);
  /** @type {{ next: number; key: number; ordIdx: number }[]} */
  const scored = ordered.map((next, ordIdx) => {
    const geom = kingDegree(next, gridSize) + centerProximityScore(next, gridSize);
    const normHub = (geom - minGeom) / span;
    const jitter = rng() * (0.015 + 0.28 * reuseFrac);
    const alpha = weight * pressure;
    const key = ordIdx + alpha * (1 - normHub) + jitter;
    return { next, key, ordIdx };
  });
  scored.sort((a, b) => (a.key !== b.key ? a.key - b.key : a.ordIdx - b.ordIdx));
  return scored.map((s) => s.next);
}

/** DFS neighbor ordering (used by {@link ./path-search.js}). */
export {
  orderNeighborsSoftSnapshotStraight,
  orderNeighborsReuseHubCentrality,
  reuseHubOrderingPressure,
};

/** True iff consecutive flats are king-adjacent on `[0, n)²`. */
export function flatsAreAdjacent(a, b, gridSize = GRID_SIZE) {
  const n = Math.max(1, Math.floor(Number(gridSize)) || GRID_SIZE);
  const Ar = Math.floor(a / n);
  const Ac = a % n;
  const Br = Math.floor(b / n);
  const Bc = b % n;
  const dr = Math.abs(Ar - Br);
  const dc = Math.abs(Ac - Bc);
  return dr <= 1 && dc <= 1 && dr + dc > 0;
}

function validateAdjacencyChain(pathFlat, gridSize) {
  const p = pathFlat;
  const n = p.length;
  if (n <= 1) return { ok: true };
  for (let i = 1; i < n; i++) {
    if (!flatsAreAdjacent(p[i - 1], p[i], gridSize)) {
      return {
        ok: false,
        reason: `not adjacent step ${i - 1}→${i}: flats ${p[i - 1]} → ${p[i]}`,
      };
    }
  }
  return { ok: true };
}

/**
 * True iff the flat sequence would collide with **main-game word-drag** semantics: tapping a
 * cell that equals the prior stroke’s **`selectedButtons[length−2]`** tile is interpreted as undo
 * (backstroke), not another letter visit.
 *
 * That happens exactly when **`pathFlat[i] === pathFlat[i−2]`** for some **`i ≥ 2`** —
 * successive selection order `⋯A,B,A⋯` along the spelled path (king-adjacent).
 *
 * @param {number[]} pathFlat
 */
export function pathFlatConflictsPenultimateUndoStroke(pathFlat) {
  const p = pathFlat;
  if (!Array.isArray(p)) return false;
  for (let i = 2; i < p.length; i++) {
    if (p[i] === p[i - 2]) return true;
  }
  return false;
}

/**
 * True iff every reuse of the same flat uses the **same glyph** everywhere — matching real
 * play where each tap appends **`getTileText`** (same label on revisit).
 *
 * @param {number[]} pathFlat
 * @param {string[]} glyphs from `wordToTileLabelSequence`
 */
export function pathFlatReuseMatchesGlyphPerFlat(pathFlat, glyphs) {
  if (
    !Array.isArray(pathFlat) ||
    !Array.isArray(glyphs) ||
    pathFlat.length !== glyphs.length
  ) {
    return false;
  }
  /** @type {Map<number, string>} */
  const flatFirstGlyph = new Map();
  for (let i = 0; i < pathFlat.length; i++) {
    const f = pathFlat[i];
    const g = glyphs[i];
    const prev = flatFirstGlyph.get(f);
    if (prev === undefined) flatFirstGlyph.set(f, g);
    else if (prev !== g) return false;
  }
  return true;
}

export function tileNormalizedAt(board, flat, gridSize) {
  const n = gridSize;
  const r = Math.floor(flat / n);
  const c = flat % n;
  const raw = board[r] != null ? String(board[r][c] ?? "") : "";
  if (raw.trim() === "") return "";
  return normalizeTileText(raw);
}

/**
 * Puzzle-builder preference: score first visits along path against pre-placement snapshot — count
 * empty tiles imprinted (`blanks`) and nonempty tiles that spend one unit of **minimal-tile multiset
 * budget** for this word (`likes`). Budget per normalized label is `glyph count − paired reuses` from
 * {@link minTileLikeBudgetMultisetFromLabels} (`q`/`QU` → `qu`).
 *
 * Walking is still in path order; spending is by first-visit cell: each nonempty first visit with
 * label `ℓ` earns a like iff `wallet[ℓ]` is still positive, then decrements it (revisits unchanged).
 *
 * Revisits to the same flat are ignored — only **first encounter** contributes.
 *
 * Higher `score` = better (`blanksFirstVisited * 65536 + likesFirstVisited`).
 *
 * @param {string[][] | null | undefined} snapshotBoard4
 * @param {number[]} pathFlat
 * @param {string[]} glyphs from `wordToTileLabelSequence`
 * @param {number} [gridSize]
 */
export function scorePlacementPreferenceOnSnapshot(
  snapshotBoard4,
  pathFlat,
  glyphs,
  gridSize = GRID_SIZE
) {
  const n = Math.max(1, Math.floor(Number(gridSize)) || GRID_SIZE);
  if (
    !snapshotBoard4 ||
    !Array.isArray(pathFlat) ||
    !Array.isArray(glyphs) ||
    pathFlat.length !== glyphs.length
  ) {
    return { blanksFirstVisited: 0, likesFirstVisited: 0, score: 0 };
  }
  /** @type {Map<string, number>} */
  const wallet = new Map(minTileLikeBudgetMultisetFromLabels(glyphs));

  /** @type {Set<number>} */
  const seen = new Set();
  let blanksFirst = 0;
  let likesFirst = 0;
  for (let i = 0; i < pathFlat.length; i++) {
    const f = pathFlat[i];
    if (seen.has(f)) continue;
    seen.add(f);
    const t = tileNormalizedAt(snapshotBoard4, f, n);
    if (t === "") blanksFirst++;
    else {
      const rem = wallet.get(t) ?? 0;
      if (rem > 0) {
        likesFirst++;
        wallet.set(t, rem - 1);
      }
    }
  }
  const BL = 65536;
  const score = blanksFirst * BL + likesFirst;
  return { blanksFirstVisited: blanksFirst, likesFirstVisited: likesFirst, score };
}

/**
 * Placement preference on snapshot: **blank** first visits rank above **covered** (nonempty) first visits.
 * Covered cells add a mild tie-break when blank counts match; hub rank is applied separately.
 *
 * @param {string[][] | null | undefined} snapshotBoard4
 * @param {number[]} pathFlat
 * @param {number} [gridSize]
 */
export function scorePlacementCoverExisting(
  snapshotBoard4,
  pathFlat,
  gridSize = GRID_SIZE
) {
  const n = Math.max(1, Math.floor(Number(gridSize)) || GRID_SIZE);
  if (!snapshotBoard4 || !Array.isArray(pathFlat) || pathFlat.length === 0) {
    return { coveredFirstVisited: 0, blanksFirstVisited: 0, score: 0 };
  }
  /** @type {Set<number>} */
  const seen = new Set();
  let covered = 0;
  let blanks = 0;
  for (let i = 0; i < pathFlat.length; i++) {
    const f = pathFlat[i];
    if (seen.has(f)) continue;
    seen.add(f);
    const t = tileNormalizedAt(snapshotBoard4, f, n);
    if (t === "") blanks++;
    else covered++;
  }
  const score = blanks * PLACEMENT_BLANK_FIRST_WEIGHT + covered;
  return { coveredFirstVisited: covered, blanksFirstVisited: blanks, score };
}

/**
 * Combined placement rank: blank-first {@link scorePlacementCoverExisting} plus optional hub tie-break.
 *
 * @param {string[][] | null | undefined} snapshotBoard4
 * @param {number[]} pathFlat
 * @param {number} [gridSize]
 * @param {number} [hubRankWeight] when > 0, adds {@link scoreReuseHubCentrality} × weight
 */
export function scorePlacementPathRank(
  snapshotBoard4,
  pathFlat,
  gridSize = GRID_SIZE,
  hubRankWeight = 0
) {
  const cover = scorePlacementCoverExisting(snapshotBoard4, pathFlat, gridSize).score;
  const hubW = Number(hubRankWeight);
  if (!Number.isFinite(hubW) || hubW <= 0) return cover;
  return cover + scoreReuseHubCentrality(pathFlat, gridSize) * hubW;
}

/**
 * Pick the best legal rotation (0..3) of `basePathFlat` by placement rank (cover-existing + optional hub).
 *
 * @param {string} word
 * @param {number[]} basePathFlat
 * @param {string[][] | null | undefined} snapshotBoard4
 * @param {{ gridSize?: number; hubRankWeight?: number }} [opts]
 * @returns {{ pathFlat: number[]; quartersCW: number; score: number } | null}
 */
export function pickBestPathFlatByCoverRotations(
  word,
  basePathFlat,
  snapshotBoard4,
  opts = {}
) {
  const gridSize = opts.gridSize ?? GRID_SIZE;
  const hubRankWeight =
    typeof opts.hubRankWeight === "number" && Number.isFinite(opts.hubRankWeight)
      ? opts.hubRankWeight
      : 0;
  const lc = String(word || "").toLowerCase();
  if (!Array.isArray(basePathFlat) || basePathFlat.length === 0) return null;

  /** @type {{ pathFlat: number[]; quartersCW: number; score: number } | null} */
  let best = null;
  for (let q = 0; q < 4; q++) {
    const pathFlat = rotatePathFlatQuarterTurnsCW(
      basePathFlat,
      /** @type {0|1|2|3} */ (q),
      gridSize
    );
    const legal = isPathGamemakerLegal(lc, pathFlat, { gridSize });
    if (!legal.ok) continue;
    const sc = scorePlacementPathRank(
      snapshotBoard4,
      pathFlat,
      gridSize,
      hubRankWeight
    );
    if (
      best === null ||
      sc > best.score ||
      (sc === best.score && q < best.quartersCW)
    ) {
      best = { pathFlat, quartersCW: q, score: sc };
    }
  }
  return best;
}

/**
 * Letters shown on each tile for "this stroke" when checking spelling ambiguity: start from
 * optional `snapshotBoard4` (pre-drag grid), then stamp first-visit glyphs from the path
 * (same rule as play: a flat's label is fixed once first visited).
 *
 * @param {string[][] | null | undefined} snapshotBoard4 rows of tile text; q/qu normalized
 * @param {number[]} pathFlat
 * @param {string[]} glyphs
 * @returns {string[][] | null} mutable board, or null if path conflicts with snapshot letters
 */
export function buildBoardForUniquenessFromSnapshot(
  snapshotBoard4,
  pathFlat,
  glyphs,
  gridSize = GRID_SIZE
) {
  const n = Math.max(1, Math.floor(Number(gridSize)) || GRID_SIZE);
  /** @type {string[][]} */
  const b = [];
  for (let r = 0; r < n; r++) {
    b[r] = [];
    for (let c = 0; c < n; c++) {
      const rawSrc =
        snapshotBoard4 &&
        snapshotBoard4[r] &&
        snapshotBoard4[r][c] !== undefined &&
        snapshotBoard4[r][c] !== null
          ? String(snapshotBoard4[r][c]).trim()
          : "";
      if (rawSrc === "") {
        b[r][c] = "";
        continue;
      }
      const tn = normalizeTileText(rawSrc);
      b[r][c] = tn === "qu" ? "qu" : tn;
    }
  }
  const flatSeen = new Set();
  for (let i = 0; i < pathFlat.length; i++) {
    const f = pathFlat[i];
    const rr = Math.floor(f / n);
    const cc = f % n;
    const needN = normalizeTileText(glyphs[i]);
    const haveN = tileNormalizedAt(b, f, n);

    if (!flatSeen.has(f)) {
      flatSeen.add(f);
      if (haveN === "") {
        b[rr][cc] = needN === "qu" ? "qu" : needN;
      } else if (haveN !== needN) {
        return null;
      }
    } else if (haveN !== needN) {
      return null;
    }
  }
  return b;
}

/**
 * Canonical key for refill-parity uniqueness: scan `pathFlat` left-to-right and record each flat's first step with
 * its normalized glyph (same traversal order as **`replacementTilesFirstVisitFlatOrder`** in refill-fifo).
 *
 * **Parity caveat:** Treat **`fifo_equivalence`** uniqueness as builder tooling unless gameplay confirms ambiguous
 * revisit strokes remain hint/refill-aligned with this signature alone.
 *
 * @param {number[]} pathFlat
 * @param {string[]} glyphs Aligned tile labels (`wordToTileLabelSequence`).
 */
export function fifoFirstVisitSpellingSignature(pathFlat, glyphs) {
  const seen = new Set();
  const parts = [];
  for (let i = 0; i < pathFlat.length; i++) {
    const f = pathFlat[i];
    if (seen.has(f)) continue;
    seen.add(f);
    parts.push(`${f}:${normalizeTileText(glyphs[i])}`);
  }
  return parts.join(",");
}

/**
 * Geometry + distinct cells + replay-style glyph coherence (reuse) + optional dictionary.
 *
 * @param {string} word
 * @param {number[]} pathFlat
 * @param {{ gridSize?: number; requireDict?: boolean; dictionary?: Set<string>; allowPenultimateUndoCollision?: boolean }} [opts]
 */
export function isPathGamemakerLegal(word, pathFlat, opts = {}) {
  const gridSize = opts.gridSize ?? GRID_SIZE;
  const lc = String(word || "").toLowerCase();
  const glyphs = wordToTileLabelSequence(lc);
  const minTiles = minUniqueTilesForReuseRule(glyphs);

  if (pathFlat.length !== glyphs.length) {
    return {
      ok: false,
      reason:
        pathFlat.length < glyphs.length
          ? `path shorter than glyphs (${pathFlat.length} < ${glyphs.length})`
          : `path longer than glyphs (${pathFlat.length} > ${glyphs.length})`,
    };
  }

  const adj = validateAdjacencyChain(pathFlat, gridSize);
  if (!adj.ok) {
    return { ok: false, reason: /** @type {{ reason: string }} */ (adj).reason };
  }

  const distinct = new Set(pathFlat).size;
  if (distinct !== minTiles) {
    return {
      ok: false,
      reason: `distinct flats ${distinct} !== minTiles ${minTiles}`,
    };
  }

  if (!pathFlatReuseMatchesGlyphPerFlat(pathFlat, glyphs)) {
    return {
      ok: false,
      reason:
        "same flat must reuse the same glyph on each revisit (would append different `getTileText` mid-word)",
    };
  }

  if (
    opts.allowPenultimateUndoCollision !== true &&
    pathFlatConflictsPenultimateUndoStroke(pathFlat)
  ) {
    return {
      ok: false,
      reason: "selection order clashes with penultimate-tap undo (⋯A,B,A⋯ along path)",
    };
  }

  if (opts.requireDict && opts.dictionary && !opts.dictionary.has(lc)) {
    return { ok: false, reason: "dict" };
  }

  return { ok: true, reason: "ok" };
}
