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

export function scoreFromWordsPlayed(wordsPlayed) {
  let total = 0;
  for (const word of wordsPlayed) {
    const labels = wordToTileLabelSequence(String(word || "").toLowerCase());
    total += getLiveWordScoreBreakdownFromLabels(labels).wordTotal;
  }
  return total;
}

export function validatedScoreFromGameLetters(gameLetters, wordsPlayed, trophyWord) {
  const pool = (Array.isArray(gameLetters) ? gameLetters : []).map((c) =>
    String(c ?? "").toLowerCase()
  );
  const words = Array.isArray(wordsPlayed) ? wordsPlayed : [];
  const trophy = String(trophyWord ?? "")
    .trim()
    .toLowerCase();
  if (!trophy || words.length === 0) return 0;

  let trophySeen = false;
  for (const word of words) {
    const w = String(word || "").toLowerCase();
    if (!w) return 0;
    if (!canConsumeWordFromLetterPool(pool, w)) return 0;
    const tiles = wordToTileLabelSequence(w);
    for (const tile of tiles) {
      const idx = pool.indexOf(tile);
      if (idx < 0) return 0;
      pool.splice(idx, 1);
    }
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
