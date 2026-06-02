import { GRID_SIZE } from "./config.js";
import {
  getLiveWordScoreBreakdownFromLabels,
  wordToTileLabelSequence,
} from "./board-logic.js";
import { canonicalNextLettersFromJsonArray } from "./puzzle-export-sim/next-letters.js";

export function buildGameLettersList(startingGrid, nextLettersRaw) {
  const flat = [];
  const n = GRID_SIZE;
  for (let i = 0; i < n; i++) {
    const row = startingGrid[i];
    for (let j = 0; j < n; j++) {
      flat.push(String(row?.[j] ?? "").toLowerCase());
    }
  }
  const padded = canonicalNextLettersFromJsonArray(
    Array.isArray(nextLettersRaw) ? nextLettersRaw : []
  );
  return flat.concat(padded);
}

export function canConsumeWordFromLetterPool(pool, word) {
  const letters = pool.slice();
  const tiles = wordToTileLabelSequence(String(word || "").toLowerCase());
  for (const tile of tiles) {
    const idx = letters.indexOf(tile);
    if (idx < 0) return false;
    letters.splice(idx, 1);
  }
  return true;
}

/** Unique tile labels used across all played words (`qu` is one tile). */
export function uniqueTilesFromWords(wordsPlayed) {
  const units = new Set();
  for (const word of wordsPlayed) {
    for (const tile of wordToTileLabelSequence(String(word || "").toLowerCase())) {
      units.add(tile);
    }
  }
  return units;
}

/** Non-empty tiles from `gameLetters` (starting grid + next letters). */
export function availableTilesFromGameLetters(gameLetters) {
  return (Array.isArray(gameLetters) ? gameLetters : [])
    .map((t) => String(t ?? "").toLowerCase())
    .filter((t) => t !== "");
}

/** Every unique tile in words must appear at least once in game letters (ignore counts). */
export function wordsUniqueTilesSubsetOfGameLetters(gameLetters, wordsPlayed) {
  const needed = uniqueTilesFromWords(wordsPlayed);
  if (needed.size === 0) return false;
  const available = new Set(availableTilesFromGameLetters(gameLetters));
  for (const tile of needed) {
    if (!available.has(tile)) return false;
  }
  return true;
}

export function scoreFromWordsPlayed(wordsPlayed) {
  let total = 0;
  for (const word of wordsPlayed) {
    const labels = wordToTileLabelSequence(String(word || "").toLowerCase());
    total += getLiveWordScoreBreakdownFromLabels(labels).wordTotal;
  }
  return total;
}

export function validatedScoreFromGameLetters(gameLetters, wordsPlayed, trophyWord) {
  const words = Array.isArray(wordsPlayed) ? wordsPlayed : [];
  const trophy = String(trophyWord ?? "")
    .trim()
    .toLowerCase();
  if (!trophy || words.length === 0) return 0;
  if (!wordsUniqueTilesSubsetOfGameLetters(gameLetters, words)) return 0;

  let trophySeen = false;
  for (const word of words) {
    const w = String(word || "").toLowerCase();
    if (!w) return 0;
    if (w === trophy) trophySeen = true;
  }
  if (!trophySeen) return 0;
  return scoreFromWordsPlayed(words);
}

export function buildScoreValidationPayload(gameLetters, wordsPlayed) {
  return {
    gameLetters: Array.isArray(gameLetters) ? gameLetters.slice() : [],
    wordsPlayed: (Array.isArray(wordsPlayed) ? wordsPlayed : []).map((w) =>
      String(w || "").toLowerCase()
    ),
  };
}

export function scoreValidationPayloadMatches(
  payload,
  submittedScore,
  trophyWord,
  scoreWordFn
) {
  if (!payload || typeof payload !== "object") return false;
  const { gameLetters, wordsPlayed } =
    /** @type {{ gameLetters?: unknown; wordsPlayed?: unknown }} */ (payload);
  const computed = validatedScoreFromGameLetters(
    Array.isArray(gameLetters) ? gameLetters : [],
    Array.isArray(wordsPlayed) ? wordsPlayed : [],
    trophyWord
  );
  if (computed !== Number(submittedScore)) return false;
  const words = Array.isArray(wordsPlayed) ? wordsPlayed : [];
  let manual = 0;
  for (const w of words) {
    manual += scoreWordFn(String(w || "").toLowerCase());
  }
  return manual === computed;
}
