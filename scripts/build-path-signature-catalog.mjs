#!/usr/bin/env node
/**
 * Phase 1+2: build path-signature catalog from a word list.
 *
 * Outputs:
 *   text/gamemaker/pregen/path-signature-catalog.json
 *   text/gamemaker/pregen/path-signature-index.tsv
 *   text/gamemaker/pregen/path-signature-orphans.txt
 *
 * Env:
 *   PUZZLE_WORDLIST — default text/gamemaker/puzzle-wordlist.txt
 *   VARIANTS_PER_SIG — default 3
 *   VARIANT_SEEDS — comma-separated base seeds (default 6 seeds)
 *   VARIANT_MAX_ATTEMPTS — default 600
 *   VARIANT_MAX_EXPLORE_NODES — default 40000 (prevents DFS hangs)
 *   VARIANT_SIG_MS — per-signature wall ms before skip (default 12000)
 *
 * Flags:
 *   --signatures-only — skip geometric variant DFS (fast)
 *   --resume — load OUT_JSON; only fill signatures missing variants
 *   --reverse — process the missing-variant queue from last → first
 *   --from-index N — 1-based offset into the missing-variant queue
 *   --limit N — process at most N signatures from that queue
 *   --skip-at N — skip queue item at 1-based index (stuck slot)
 *   --max-words N — truncate lexicon (debug)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { GRID_SIZE } from "../js/config.js";
import { pathSignatureFromWord } from "../js/puzzle-export-sim/path-catalog/path-signature.js";
import { canonicalPathFlatKey } from "../js/puzzle-export-sim/path-catalog/path-variant-catalog.js";
import {
  findRandomLegalPathFlat,
  isPathGamemakerLegal,
} from "../js/puzzle-export-sim/word-path-search.js";
import { loadProblematicWordsSet } from "./lib/problematic-words.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const DEFAULT_WORDLIST = join(root, "text/gamemaker/puzzle-wordlist.txt");
const OUT_DIR = join(root, "text/gamemaker/pregen");
const OUT_JSON = join(OUT_DIR, "path-signature-catalog.json");
const OUT_TSV = join(OUT_DIR, "path-signature-index.tsv");
const OUT_ORPHANS = join(OUT_DIR, "path-signature-orphans.txt");

const VARIANTS_PER_SIG = Math.max(
  1,
  parseInt(process.env.VARIANTS_PER_SIG || "3", 10) || 3
);
const VARIANT_SEED_BASES = (process.env.VARIANT_SEEDS || "1,7,42,99,511,4099")
  .split(",")
  .map((s) => parseInt(s.trim(), 10))
  .filter((n) => Number.isFinite(n));
const VARIANT_MAX_ATTEMPTS = Math.max(
  50,
  parseInt(process.env.VARIANT_MAX_ATTEMPTS || "600", 10) || 600
);
const VARIANT_MAX_EXPLORE_NODES = Math.max(
  1000,
  parseInt(process.env.VARIANT_MAX_EXPLORE_NODES || "40000", 10) || 40000
);
const VARIANT_SIG_MS = Math.max(
  500,
  parseInt(process.env.VARIANT_SIG_MS || "12000", 10) || 12000
);

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function argvNum(name, def) {
  const ix = process.argv.indexOf(name);
  if (ix === -1 || ix + 1 >= process.argv.length) return def;
  const v = Number(process.argv[ix + 1]);
  return Number.isFinite(v) ? v : def;
}

const signaturesOnly = hasFlag("--signatures-only");
const resume = hasFlag("--resume") || (!signaturesOnly && existsSync(OUT_JSON));
const reverse = hasFlag("--reverse");
const fromIndex = Math.max(1, Math.floor(argvNum("--from-index", 1)));
const limit = argvNum("--limit", 0);
const skipAt = argvNum("--skip-at", 0);
const maxWords = argvNum("--max-words", 0);

/** @type {Record<string, { variants?: unknown[]; labelRank?: number[] }> | null} */
let priorSignatures = null;
if (resume && existsSync(OUT_JSON)) {
  try {
    const prev = JSON.parse(readFileSync(OUT_JSON, "utf8"));
    if (prev && prev.signatures && typeof prev.signatures === "object") {
      priorSignatures = prev.signatures;
    }
  } catch {
    priorSignatures = null;
  }
}

const wordlistRel = process.env.PUZZLE_WORDLIST || "text/gamemaker/puzzle-wordlist.txt";
const wordlistPath = join(root, wordlistRel);
if (!existsSync(wordlistPath)) {
  console.error(`Word list not found: ${wordlistRel}`);
  process.exit(1);
}

/** @returns {string[][]} */
function emptyBoard(n) {
  /** @type {string[][]} */
  const out = [];
  for (let r = 0; r < n; r++) {
    out[r] = [];
    for (let c = 0; c < n; c++) out[r][c] = "";
  }
  return out;
}

const blockedWords = loadProblematicWordsSet();
const rawList = readFileSync(wordlistPath, "utf8");
/** @type {string[]} */
let words = rawList
  .split(/\r?\n/)
  .map((w) => w.trim().toLowerCase())
  .filter((w) => w && /^[a-z]+$/.test(w) && !blockedWords.has(w));
words = [...new Set(words)].sort();
if (maxWords > 0) words = words.slice(0, maxWords);

/** @type {Map<string, { labelRank: number[]; reuseSlots: Array<[number, number]>; stats: { length: number; minTiles: number; reuse: number }; tileSlotDisplay: string; words: string[] }>} */
const sigGroups = new Map();
/** @type {Record<string, string>} */
const wordToSigKey = {};

for (const w of words) {
  const rec = pathSignatureFromWord(w);
  wordToSigKey[w] = rec.sigKey;
  let g = sigGroups.get(rec.sigKey);
  if (!g) {
    g = {
      labelRank: rec.labelRank,
      reuseSlots: rec.reuseSlots,
      stats: rec.stats,
      tileSlotDisplay: rec.tileSlotDisplay,
      words: [],
    };
    sigGroups.set(rec.sigKey, g);
  }
  g.words.push(w);
}

/** @type {Record<string, unknown>} */
const signatures = {};
/** @type {string[]} */
const orphanSigs = [];

function pickRepresentativeWord(wordList) {
  return wordList.slice().sort((a, b) => a.length - b.length || a.localeCompare(b))[0];
}

function signatureEntryFromGroup(sigKey, g) {
  const rep = pickRepresentativeWord(g.words);
  return {
    labelRank: g.labelRank,
    reuseSlots: g.reuseSlots,
    stats: g.stats,
    tileSlotDisplay: g.tileSlotDisplay,
    representativeWord: rep,
    variants: [],
  };
}

/** @param {unknown[]} variants */
function variantCount(variants) {
  return Array.isArray(variants) ? variants.length : 0;
}

/** Seed all signature rows (metadata + prior variants). */
for (const [sigKey, g] of sigGroups) {
  const base = signatureEntryFromGroup(sigKey, g);
  const prior = priorSignatures?.[sigKey];
  if (prior && typeof prior === "object") {
    signatures[sigKey] = {
      ...base,
      ...prior,
      labelRank: base.labelRank,
      reuseSlots: base.reuseSlots,
      stats: base.stats,
      tileSlotDisplay: base.tileSlotDisplay,
    };
  } else {
    signatures[sigKey] = base;
  }
}

const emptySnap = emptyBoard(GRID_SIZE);

function flushCatalogPartial(/** @type {boolean} */ final) {
  const catalogPartial = {
    version: 1,
    gridSize: GRID_SIZE,
    wordlistRel,
    builtAt: new Date().toISOString(),
    signaturesOnly,
    partial: !final,
    signatures,
    wordToSigKey,
  };
  writeFileSync(OUT_JSON, JSON.stringify(catalogPartial));
}

/**
 * @param {string} sigKey
 * @param {number} queueIndex 1-based index in work queue (for logging)
 */
function fillVariantsForSignature(sigKey, queueIndex) {
  const g = sigGroups.get(sigKey);
  if (!g) return;
  const rep = pickRepresentativeWord(g.words);
  const entry = /** @type {{ variants: unknown[] }} */ (signatures[sigKey]);
  /** @type {Set<string>} */
  const seenPathKeys = new Set();
  /** @type {Array<{ pathFlat: number[]; symmetry: { quartersCW: number }; witness: Record<string, unknown> }>} */
  const variants = [];

  for (const pv of entry.variants || []) {
    if (
      !pv ||
      typeof pv !== "object" ||
      !Array.isArray(/** @type {{ pathFlat?: unknown }} */ (pv).pathFlat)
    ) {
      continue;
    }
    const pathFlat = /** @type {number[]} */ (
      /** @type {{ pathFlat: number[] }} */ (pv).pathFlat
    );
    const pKey = canonicalPathFlatKey(pathFlat, GRID_SIZE);
    if (seenPathKeys.has(pKey)) continue;
    seenPathKeys.add(pKey);
    variants.push(/** @type {typeof variants[0]} */ (pv));
    if (variants.length >= VARIANTS_PER_SIG) break;
  }

  if (variants.length >= VARIANTS_PER_SIG) {
    entry.variants = variants;
    return;
  }

  const tSig0 = Date.now();
  for (
    let si = 0;
    si < VARIANT_SEED_BASES.length && variants.length < VARIANTS_PER_SIG;
    si++
  ) {
    if (Date.now() - tSig0 > VARIANT_SIG_MS) {
      console.error(
        `[path-catalog] skip slow sig #${queueIndex} ${rep} (>${VARIANT_SIG_MS}ms)`
      );
      break;
    }
    const seed = (VARIANT_SEED_BASES[si] + queueIndex * 9973) >>> 0;
    const found = findRandomLegalPathFlat(rep, {
      seed,
      maxAttempts: VARIANT_MAX_ATTEMPTS,
      maxExploreNodes: VARIANT_MAX_EXPLORE_NODES,
      snapshotBoard4: emptySnap,
      requireUniqueSpelling: false,
      ignoreSnapshotLetterGate: true,
      preferSnapshotLetterMatch: false,
      preferStraight: true,
    });
    if (!found) continue;
    const legal = isPathGamemakerLegal(rep, found.pathFlat);
    if (!legal.ok) continue;
    const pKey = canonicalPathFlatKey(found.pathFlat, GRID_SIZE);
    if (seenPathKeys.has(pKey)) continue;
    seenPathKeys.add(pKey);
    variants.push({
      pathFlat: found.pathFlat,
      symmetry: { quartersCW: 0 },
      witness: {
        emptyBoard: true,
        requireUniqueSpelling: false,
        representativeWord: rep,
      },
    });
  }

  entry.variants = variants;
  if (variants.length === 0) orphanSigs.push(sigKey);
}

if (!signaturesOnly) {
  /** @type {string[]} */
  let workQueue = [];
  for (const sigKey of sigGroups.keys()) {
    const n = variantCount(
      /** @type {{ variants?: unknown[] }} */ (signatures[sigKey]).variants
    );
    if (n < VARIANTS_PER_SIG) workQueue.push(sigKey);
  }

  if (reverse) workQueue.reverse();

  const start = fromIndex - 1;
  if (skipAt > 0) {
    const skipIx = skipAt - 1;
    if (skipIx >= 0 && skipIx < workQueue.length) {
      const skipped = workQueue[skipIx];
      console.error(`[path-catalog] --skip-at ${skipAt}: ${skipped}`);
      workQueue.splice(skipIx, 1);
    }
  }

  workQueue = workQueue.slice(start, limit > 0 ? start + limit : undefined);

  console.error(
    `[path-catalog] missing variants: ${workQueue.length} to process` +
      (reverse ? " (reverse)" : "") +
      ` from-index=${fromIndex}` +
      (limit > 0 ? ` limit=${limit}` : "") +
      ` exploreCap=${VARIANT_MAX_EXPLORE_NODES}`
  );

  let done = 0;
  for (const sigKey of workQueue) {
    done++;
    const queueIndex = reverse ? sigGroups.size - done + 1 : start + done;
    fillVariantsForSignature(sigKey, queueIndex);
    if (done % 50 === 0 || done === workQueue.length) {
      console.error(`[path-catalog] filled ${done}/${workQueue.length} …`);
      flushCatalogPartial(done === workQueue.length);
    }
  }
  flushCatalogPartial(true);
}

mkdirSync(OUT_DIR, { recursive: true });

/** @type {Array<{ sigKey: string; wordCount: number; example: string; tileSlot: string; variants: number }>} */
const indexRows = [];
for (const [sigKey, g] of sigGroups) {
  const sig = /** @type {{ variants?: unknown[] }} */ (signatures[sigKey]);
  const nVar = variantCount(sig?.variants);
  indexRows.push({
    sigKey,
    wordCount: g.words.length,
    example: pickRepresentativeWord(g.words),
    tileSlot: g.tileSlotDisplay,
    variants: nVar,
  });
}
indexRows.sort((a, b) => b.wordCount - a.wordCount || a.sigKey.localeCompare(b.sigKey));

const tsvLines = [
  "sigKey\twordCount\tvariants\texample\ttileSlot",
  ...indexRows.map(
    (r) => `${r.sigKey}\t${r.wordCount}\t${r.variants}\t${r.example}\t${r.tileSlot}`
  ),
];
writeFileSync(OUT_TSV, tsvLines.join("\n") + "\n");

const orphanSet = new Set(orphanSigs);
/** @type {string[]} */
const orphanWords = [];
for (const sigKey of orphanSet) {
  const g = sigGroups.get(sigKey);
  if (g) orphanWords.push(...g.words);
}
writeFileSync(
  OUT_ORPHANS,
  orphanWords.length ? orphanWords.sort().join("\n") + "\n" : "# no orphan signatures\n"
);

const withVariants = indexRows.filter((r) => r.variants > 0).length;
const catalog = {
  version: 1,
  gridSize: GRID_SIZE,
  wordlistRel,
  builtAt: new Date().toISOString(),
  signaturesOnly,
  partial: false,
  signatures,
  wordToSigKey,
};
writeFileSync(OUT_JSON, JSON.stringify(catalog));

console.error(
  `[path-catalog] words=${words.length} signatures=${sigGroups.size} ` +
    `withVariants=${withVariants} orphanSigs=${orphanSet.size} ` +
    `signaturesOnly=${signaturesOnly}`
);
console.error(`[path-catalog] wrote ${OUT_JSON}`);
console.error(`[path-catalog] wrote ${OUT_TSV}`);
console.error(`[path-catalog] wrote ${OUT_ORPHANS}`);
