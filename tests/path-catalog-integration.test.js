import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import {
  pathCatalogStats,
  loadPathCatalogIfReady,
} from "../js/puzzle-export-sim/load-path-catalog.js";
import { pickCatalogPathFlat } from "../js/puzzle-export-sim/path-variant-catalog.js";
import { loadPathSignatureCatalog } from "../js/puzzle-export-sim/path-variant-catalog.js";
import { tryBuildAutomatedPuzzle } from "../js/puzzle-export-sim/auto-puzzle-build.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const CATALOG = join(root, "text/gamemaker/pregen/path-signature-catalog.json");

test("path catalog stats when file exists", { skip: !existsSync(CATALOG) }, () => {
  const st = pathCatalogStats(CATALOG);
  assert.ok(st);
  assert.ok(st.signatures > 0);
  assert.ok(st.words > 0);
});

test(
  "pickCatalogPathFlat returns legal path on empty board when variants exist",
  {
    skip: !existsSync(CATALOG),
  },
  () => {
    const catalog = loadPathSignatureCatalog(CATALOG);
    const st = pathCatalogStats(CATALOG);
    if (!st || st.withVariants === 0) {
      return;
    }
    const rep =
      catalog.signatures[Object.keys(catalog.signatures)[0]]?.representativeWord;
    assert.ok(rep);
    const picked = pickCatalogPathFlat(catalog, rep, null);
    assert.ok(picked);
    assert.ok(Array.isArray(picked.pathFlat));
    assert.ok(picked.pathFlat.length > 0);
  }
);

test(
  "tryBuildAutomatedPuzzle uses path catalog when provided",
  {
    skip: !existsSync(CATALOG),
  },
  () => {
    const catalog = loadPathCatalogIfReady(CATALOG);
    if (!catalog) return;

    const poolPath = join(root, "text/gamemaker/pregen/puzzle-pool.json");
    if (!existsSync(poolPath)) return;

    const pool = JSON.parse(readFileSync(poolPath, "utf8"));
    const entry = pool.puzzles?.[0];
    if (!entry?.words || entry.words.length !== 7) return;

    const r = tryBuildAutomatedPuzzle(entry.words, {
      seed: 42,
      wholeBuildAttempts: 12,
      maxAttemptsPerWord: 800,
      pathCatalog: catalog,
      requireUniqueSpelling: false,
      lookaheadProbeNext: false,
      returnFailureTally: true,
    });

    assert.ok(
      r.ok || (r.failureTally && r.failureTally.placement_catalog > 0),
      "build should succeed or use catalog paths: " + JSON.stringify(r)
    );
    if (r.failureTally) assert.equal(r.failureTally.placement_dfs ?? 0, 0);
    if (r.ok) {
      assert.ok(Array.isArray(r.row?.perfect_hunt));
      assert.equal(r.row.perfect_hunt.length, 7);
    }
  }
);
