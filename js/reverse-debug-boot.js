/**
 * URL-driven data for reverse puzzle authoring (?debug_mode=1).
 */

import { GRID_SIZE } from "./config.js";
import { getLiveWordScoreBreakdownFromLabels } from "./board-logic.js";
import {
  countGoBackOverlapOpportunities,
  extractSlotRepeatSpecsFromDoc,
  pickWordsFromMaterialized,
  sortEntriesForReverseUnplay,
  wordToTileStrings,
} from "./debug-reverse-build.js";

/** Default JSONL for ?debug_mode=1 (no explicit list / JSON hunt URL). */
export const REVERSE_DEBUG_DEFAULT_SAMPLE_URL =
  "debug/reverse-authoring/data/sample_wordlists_100.jsonl";

function emptyBoard() {
  return Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(""));
}

function parseBoardLine(text) {
  const parsed = JSON.parse(String(text).trim());
  if (!Array.isArray(parsed) || parsed.length !== GRID_SIZE) {
    throw new Error("board must be a 4×4 row array");
  }
  for (let r = 0; r < GRID_SIZE; r++) {
    if (!Array.isArray(parsed[r]) || parsed[r].length !== GRID_SIZE) {
      throw new Error(`row ${r} must have length ${GRID_SIZE}`);
    }
  }
  return parsed.map((row) => row.map((cell) => String(cell)));
}

/**
 * @param {string} raw
 * @returns {string[]}
 */
export function parsePlainWordListParam(raw) {
  if (raw == null || String(raw).trim() === "") return [];
  return String(raw)
    .split(",")
    .map((w) => w.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * @param {string} text full JSONL file body
 * @param {number} sampleId
 * @returns {object} parsed row
 */
export function findSampleRowInJsonl(text, sampleId) {
  const want = Number(sampleId);
  for (const line of String(text).split(/\n/)) {
    const t = line.trim();
    if (!t) continue;
    const row = JSON.parse(t);
    if (Number(row.sample_id) === want) return row;
  }
  throw new Error(`sample_id ${want} not found`);
}

/**
 * @param {string[]} words
 * @param {number[] | null} repeatSpecs
 * @param {number[] | null} scoresOverride
 */
function buildEntriesFromPlainWords(words, repeatSpecs, scoresOverride = null) {
  return words.map((word, slotIndex) => {
    const labels = wordToTileStrings(word);
    const bd = getLiveWordScoreBreakdownFromLabels(labels);
    const repeatTiles =
      repeatSpecs != null && repeatSpecs[slotIndex] !== undefined
        ? repeatSpecs[slotIndex]
        : null;
    const ov =
      scoresOverride != null &&
      scoresOverride[slotIndex] !== undefined &&
      Number.isFinite(Number(scoresOverride[slotIndex]))
        ? Number(scoresOverride[slotIndex])
        : bd.wordTotal;
    return {
      word: String(word).toLowerCase(),
      score: ov,
      slotIndex,
      repeatTiles,
    };
  });
}

function cloneBoardRows(board) {
  return board.map((row) => row.slice());
}

/**
 * Per-slot word pools for in-place "swap word" in reverse debug.
 * @param {URLSearchParams} params
 * @returns {Promise<string[][] | null>}
 */
async function loadSlotWordPoolsForDebug(params) {
  const rawPools = params.get("debug_word_pools");
  const poolsUrl =
    rawPools != null && String(rawPools).trim() !== ""
      ? String(rawPools).trim()
      : "debug/reverse-authoring/data/formula_hunt_progressive_1267_word_lists.json";
  const comboIdx = Number(params.get("combination_index") ?? params.get("debug_combo") ?? 0) || 0;
  try {
    const res = await fetch(poolsUrl);
    if (!res.ok) return null;
    const doc = await res.json();
    const rows = doc?.combinations_with_words;
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const row = rows[comboIdx >= 0 && comboIdx < rows.length ? comboIdx : 0];
    const wps = row?.words_per_slot;
    if (!Array.isArray(wps)) return null;
    return wps.map((slot) =>
      Array.isArray(slot) ? slot.map((w) => String(w).toLowerCase()) : [],
    );
  } catch (err) {
    console.warn("debug word pools load failed", err);
    return null;
  }
}

/**
 * @param {{ word: string; score: number; slotIndex: number; repeatTiles?: number | null }} entry
 * @param {string[][] | null | undefined} slotWordPools
 * @param {{ word: string }[]} entries full hunt list (avoid duplicates on other steps)
 * @param {number} currentIndex
 * @returns {string | null} lowercase word
 */
export function findAlternateWordInSlotPool(entry, slotWordPools, entries, currentIndex) {
  if (!entry || !slotWordPools || !Array.isArray(slotWordPools[entry.slotIndex])) {
    return null;
  }
  const col = slotWordPools[entry.slotIndex];
  const tilesLen = wordToTileStrings(entry.word).length;
  const targetScore = entry.score;
  const targetOv = countGoBackOverlapOpportunities(entry.word);
  /** @type {Set<string>} */
  const used = new Set();
  for (let i = 0; i < entries.length; i++) {
    if (i === currentIndex) continue;
    used.add(String(entries[i].word || "").toLowerCase());
  }
  const matches = [];
  for (const w of col) {
    const wl = String(w).toLowerCase();
    if (wl === entry.word) continue;
    if (used.has(wl)) continue;
    const labels = wordToTileStrings(wl);
    if (labels.length !== tilesLen) continue;
    const bd = getLiveWordScoreBreakdownFromLabels(labels);
    if (bd.wordTotal !== targetScore) continue;
    if (countGoBackOverlapOpportunities(wl) !== targetOv) continue;
    matches.push(wl);
  }
  if (matches.length === 0) return null;
  return matches[Math.floor(Math.random() * matches.length)];
}

/**
 * @param {URLSearchParams} params
 * @returns {Promise<{ board: string[][]; sortedEntries: { word: string; score: number; slotIndex: number; repeatTiles: number | null }[]; slotWordPools: string[][] | null }>}
 */
export async function loadReverseDebugSession(params) {
  const board = emptyBoard();
  const boardParam = params.get("debug_board");
  if (boardParam) {
    try {
      const parsed = parseBoardLine(boardParam);
      for (let r = 0; r < GRID_SIZE; r++) {
        board[r] = parsed[r].slice();
      }
    } catch (err) {
      console.warn("debug_board parse failed", err);
    }
  }

  let sortedEntries = [];

  const debugMode = params.get("debug_mode") === "1";
  const sampleUrlParam = params.get("debug_sample");
  const sampleIdParam = params.get("debug_sample_id");
  const listParam = params.get("debug_word_list");
  const jsonUrl = params.get("debug_words");
  const explicitSample =
    (sampleUrlParam != null && String(sampleUrlParam).trim() !== "") ||
    (sampleIdParam != null && String(sampleIdParam).trim() !== "");
  const wantsSample =
    explicitSample || (debugMode && !listParam && !jsonUrl);

  if (listParam) {
    const words = parsePlainWordListParam(listParam);
    sortedEntries = sortEntriesForReverseUnplay(
      buildEntriesFromPlainWords(words, null, null),
    );
    const slotsUrl =
      params.get("debug_slots") ||
      "debug/reverse-authoring/data/formula_hunt_progressive_1267_counts.json";
    try {
      const res = await fetch(slotsUrl);
      if (!res.ok) throw new Error(`slots ${res.status}`);
      const slotDoc = await res.json();
      const repeatSpecs = extractSlotRepeatSpecsFromDoc(slotDoc);
      sortedEntries = sortEntriesForReverseUnplay(
        buildEntriesFromPlainWords(words, repeatSpecs, null),
      );
    } catch (err) {
      console.warn(err);
    }
  } else if (wantsSample) {
    const sampleUrl =
      (sampleUrlParam != null && String(sampleUrlParam).trim()) ||
      REVERSE_DEBUG_DEFAULT_SAMPLE_URL;
    const sampleId =
      sampleIdParam != null && String(sampleIdParam).trim() !== ""
        ? Number(sampleIdParam)
        : 0;
    const res = await fetch(sampleUrl);
    if (!res.ok) throw new Error(`sample ${res.status}`);
    const row = findSampleRowInJsonl(await res.text(), sampleId);
    const words = Array.isArray(row.words)
      ? row.words.map((w) => String(w).toLowerCase())
      : parsePlainWordListParam(String(row.debug_word_list || ""));
    if (words.length === 0) throw new Error("sample row has no words");
    const rep = Array.isArray(row.repeat_tiles_per_slot)
      ? row.repeat_tiles_per_slot.map((n) => Number(n))
      : null;
    const sc = Array.isArray(row.scores) ? row.scores.map((n) => Number(n)) : null;
    sortedEntries = sortEntriesForReverseUnplay(
      buildEntriesFromPlainWords(words, rep, sc),
    );
  } else if (jsonUrl) {
    const res = await fetch(jsonUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const doc = await res.json();
    const combo = Number(params.get("combination_index") ?? params.get("debug_combo")) || 0;
    sortedEntries = sortEntriesForReverseUnplay(pickWordsFromMaterialized(doc, combo));
  }

  const slotWordPools = await loadSlotWordPoolsForDebug(params);
  return { board: cloneBoardRows(board), sortedEntries, slotWordPools };
}

/**
 * Full reload: random `debug_sample_id`, JSONL defaults, clears inline list overrides.
 * Call from the reverse-debug “Another one” control.
 */
export function navigateReverseDebugAnotherSample() {
  const u = new URL(window.location.href);
  const p = u.searchParams;
  const raw = p.get("debug_sample");
  const path =
    raw != null && String(raw).trim() !== ""
      ? String(raw).trim()
      : REVERSE_DEBUG_DEFAULT_SAMPLE_URL;
  p.set("debug_mode", "1");
  p.set("debug_sample", path);
  const m = path.match(/sample_wordlists_(\d+)/i);
  const n = m && m[1] ? Math.max(1, Number(m[1]) || 100) : 100;
  p.set("debug_sample_id", String(Math.floor(Math.random() * n)));
  p.delete("debug_word_list");
  p.delete("debug_words");
  window.location.assign(`${u.pathname}${u.search}${u.hash}`);
}
