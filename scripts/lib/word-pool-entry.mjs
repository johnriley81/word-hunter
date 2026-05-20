import {
  wordReuseStats,
  getLiveWordScoreBreakdownFromLabels,
  wordToTileLabelSequence,
} from "../../js/board-logic.js";

/**
 * Pool toolbar metadata for one lowercase word (regen / swap buckets).
 *
 * @param {string} word
 */
export function wordEntryFromWord(word) {
  const w = String(word || "")
    .trim()
    .toLowerCase();
  const labels = wordToTileLabelSequence(w);
  const st = wordReuseStats(labels);
  const { wordTotal } = getLiveWordScoreBreakdownFromLabels(labels);
  return { word: w, min_tiles: st.minTiles, reuse: st.reuse, wordTotal };
}
