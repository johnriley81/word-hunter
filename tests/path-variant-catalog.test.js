import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { GRID_SIZE } from "../js/config.js";
import {
  loadPathSignatureCatalog,
  pickCatalogPathFlat,
  scoreBestCatalogPlacement,
} from "../js/puzzle-export-sim/path-variant-catalog.js";
import { isPathGamemakerLegal } from "../js/puzzle-export-sim/word-path-search.js";
import { comparePoolWordEntriesAscForwardExport } from "../js/puzzle-build/pool-order.js";
import {
  wordReuseStats,
  getLiveWordScoreBreakdownFromLabels,
  wordToTileLabelSequence,
} from "../js/board-logic.js";
import { tryBuildAutomatedPuzzle } from "../js/puzzle-export-sim/auto-puzzle-build.js";
import { loadPathCatalogIfReady } from "../js/puzzle-export-sim/load-path-catalog.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const CATALOG = join(root, "text/gamemaker/pregen/path-signature-catalog.json");

test(
  "pickCatalogPathFlat returns legal path on mismatching snapshot (overlay pick)",
  {
    skip: !existsSync(CATALOG),
  },
  () => {
    const catalog = loadPathSignatureCatalog(CATALOG);
    const rep =
      catalog.signatures[Object.keys(catalog.signatures)[0]]?.representativeWord;
    assert.ok(rep);
    const z = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill("z"));
    const picked = pickCatalogPathFlat(catalog, rep, z);
    assert.ok(picked, "catalog pick must not gate on snapshot letters");
    const v = isPathGamemakerLegal(rep, picked.pathFlat);
    assert.ok(v.ok, v.reason);
  }
);

test(
  "scoreBestCatalogPlacement matches pickCatalogPathFlat",
  {
    skip: !existsSync(CATALOG),
  },
  () => {
    const catalog = loadPathSignatureCatalog(CATALOG);
    const rep =
      catalog.signatures[Object.keys(catalog.signatures)[0]]?.representativeWord;
    assert.ok(rep);
    const empty = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(""));
    const picked = pickCatalogPathFlat(catalog, rep, empty);
    const scored = scoreBestCatalogPlacement(catalog, rep, empty);
    if (!picked) {
      assert.equal(scored, null);
      return;
    }
    assert.ok(scored);
    assert.deepEqual(scored.pathFlat, picked.pathFlat);
    assert.equal(scored.score, picked.score);
  }
);

test(
  "pickCatalogPathFlat ranks placements on snapshot (blank-first score)",
  {
    skip: !existsSync(CATALOG),
  },
  () => {
    const catalog = loadPathSignatureCatalog(CATALOG);
    const rep =
      catalog.signatures[Object.keys(catalog.signatures)[0]]?.representativeWord;
    assert.ok(rep);
    const sg = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(""));
    sg[0][0] = "a";
    sg[0][1] = "b";
    const picked = pickCatalogPathFlat(catalog, rep, sg);
    assert.ok(picked);
    assert.ok(picked.score >= 0);
  }
);

test(
  "tryBuildAutomatedPuzzle regen word row with catalog (asc stamp, no DFS)",
  {
    skip: !existsSync(CATALOG),
  },
  () => {
    const catalog = loadPathCatalogIfReady(CATALOG);
    if (!catalog) return;

    const hunt = [
      "bleeding",
      "painfully",
      "imbalances",
      "songwriters",
      "popularity",
      "achievement",
      "stockholders",
    ];
    const poolSeven = hunt
      .map((w) => {
        const labels = wordToTileLabelSequence(w);
        const st = wordReuseStats(labels);
        return {
          word: w,
          min_tiles: st.minTiles,
          reuse: st.reuse,
          wordTotal: getLiveWordScoreBreakdownFromLabels(labels).wordTotal,
        };
      })
      .sort(comparePoolWordEntriesAscForwardExport);

    const r = tryBuildAutomatedPuzzle(poolSeven, {
      seed: 42,
      wholeBuildAttempts: 40,
      maxAttemptsPerWord: 8000,
      pathCatalog: catalog,
      requireUniqueSpelling: true,
      lookaheadProbeNext: false,
      placementOrder: "input",
      returnFailureTally: true,
    });
    assert.ok(
      r.ok || (r.failureTally && r.failureTally.placement_catalog > 0),
      "regen row should place via catalog: " + JSON.stringify(r)
    );
    if (r.failureTally) assert.equal(r.failureTally.placement_dfs ?? 0, 0);
  }
);
