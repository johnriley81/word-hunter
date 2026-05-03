#!/usr/bin/env node
/**
 * Audit perfect-hunt starter hint fields in JSON Lines puzzle files (C1 inventory).
 *
 * Production rows carry `perfect_hunt_starter_tor_neighbors` (+ optional
 * `perfect_hunt_starter_flats`). Legacy files may still mention neighbor_sigs
 * / diag keys; those are counted separately without implying parser support.
 *
 * Prints (1) per-line raw key presence before validation,
 * then (2) whether the repo production parser accepts the whole file.
 *
 * Usage:
 *   node scripts/inventory-puzzle-hints.mjs
 *   node scripts/inventory-puzzle-hints.mjs path/to/puzzles.txt
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PERFECT_HUNT_TOR_NEIGHBOR_LEN } from "../js/board-logic.js";
import { parsePuzzlesFileText } from "../js/puzzle-row-format.js";

/** Keys honored by puzzle-row-format (serialized hints). */
const KEYS = /** @type {const} */ ([
  "perfect_hunt_starter_flats",
  "perfect_hunt_starter_tor_neighbors",
]);

/** Presence only — not loaded by production parser unless reintroduced. */
const LEGACY_KEYS = /** @type {const} */ ([
  "perfect_hunt_starter_neighbor_sigs",
  "perfect_hunt_starter_hints_diag",
]);

function isPlainObject(x) {
  return x !== null && typeof x === "object" && !Array.isArray(x);
}

function torArrayLooksExportSized(a) {
  return Array.isArray(a) && a.length === PERFECT_HUNT_TOR_NEIGHBOR_LEN;
}

function main() {
  const rel = process.argv[2] ?? "text/puzzles.txt";
  const abs = resolve(process.cwd(), rel);
  /** @type {string} */
  let text;
  try {
    text = readFileSync(abs, "utf8");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Cannot read:", abs, "-", msg);
    process.exit(1);
    return;
  }

  console.log("File:", abs);
  console.log("");

  /** @type {Record<string, number>} */
  const rawPresent = Object.fromEntries(KEYS.map((k) => [k, 0]));
  /** @type {Record<string, number>} */
  const legacyPresent = Object.fromEntries(LEGACY_KEYS.map((k) => [k, 0]));
  let aliasStartingGrids = 0;
  let jsonLinesNonEmpty = 0;
  const combo = {
    tor_sized_with_flats: 0,
    tor_sized_no_flats: 0,
    flats_without_sized_tor: 0,
    neither_flats_nor_sized_tor: 0,
  };

  let lineNo = 0;
  for (const raw of text.split(/\r?\n/)) {
    lineNo++;
    const t = raw.trim();
    if (!t) continue;
    jsonLinesNonEmpty++;
    let obj;
    try {
      obj = JSON.parse(t);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("JSON parse error line " + lineNo + ":", msg);
      continue;
    }
    if (
      obj &&
      typeof obj === "object" &&
      Array.isArray(/** @type {{ starting_grids?: unknown }} */ (obj).starting_grids)
    )
      aliasStartingGrids++;

    const o = /** @type {Record<string, unknown>} */ (obj);
    const hasFlats =
      KEYS[0] in o &&
      Array.isArray(o[KEYS[0]]) &&
      /** @type {unknown[]} */ (o[KEYS[0]]).length > 0;
    const torKeyPresent = KEYS[1] in o;
    const torRaw = o[KEYS[1]];
    const torSized = torKeyPresent && torArrayLooksExportSized(torRaw);

    if (o[KEYS[0]] != null) rawPresent[KEYS[0]]++;
    if (o[KEYS[1]] != null) rawPresent[KEYS[1]]++;
    for (const lk of LEGACY_KEYS) {
      if (!(lk in o)) continue;
      const v = o[lk];
      if (
        lk === "perfect_hunt_starter_hints_diag"
          ? v != null && isPlainObject(v)
          : Array.isArray(v)
      )
        legacyPresent[lk]++;
    }

    if (torSized && hasFlats) combo.tor_sized_with_flats++;
    else if (torSized) combo.tor_sized_no_flats++;
    else if (hasFlats) combo.flats_without_sized_tor++;
    else combo.neither_flats_nor_sized_tor++;
  }

  console.log("Non-empty JSON lines:", jsonLinesNonEmpty);
  console.log(
    "`starting_grids` alias rows:",
    aliasStartingGrids,
    aliasStartingGrids === 0 ? "(none)" : ""
  );
  console.log("");
  console.log("Raw key presence (value not null) — serialized hint fields:");
  for (const k of KEYS) console.log(`  ${k}: ${rawPresent[k]}`);
  console.log("");
  console.log("Legacy keys present in JSON (ignored by current parser):");
  for (const k of LEGACY_KEYS) console.log(`  ${k}: ${legacyPresent[k]}`);
  console.log("");
  console.log(
    "Raw combinations (tor 'sized' = length",
    PERFECT_HUNT_TOR_NEIGHBOR_LEN + "):"
  );
  console.log("  tor (sized) + starter flats:", combo.tor_sized_with_flats);
  console.log("  tor (sized), no starter flats:", combo.tor_sized_no_flats);
  console.log(
    "  starter flats present but tor not sized:",
    combo.flats_without_sized_tor
  );
  console.log("  neither flats nor sized tor:", combo.neither_flats_nor_sized_tor);
  console.log("");

  try {
    const parsed = parsePuzzlesFileText(text, {
      fileLabel: rel.replaceAll("\\", "/"),
    });
    console.log("Production parser: OK,", parsed.length, "row(s).");
    let withFlats = 0,
      withTor = 0;
    for (const row of parsed) {
      const r = /** @type {Record<string, unknown>} */ (row);
      if (Array.isArray(r.perfect_hunt_starter_flats)) withFlats++;
      if (Array.isArray(r.perfect_hunt_starter_tor_neighbors)) withTor++;
    }
    console.log(
      "  After parse: starter flats arrays",
      withFlats,
      "| tor_neighbors arrays",
      withTor
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Production parser: FAILED:", msg);
    process.exitCode = 2;
  }
}

main();
