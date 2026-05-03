import { parsePuzzlesFileText } from "./puzzle-row-format.js";

export { calculatePuzzleDayIndex, puzzleListIndex } from "./puzzle-calendar.js";

/** Lowercase gameplay dictionary only — for gamemaker path validation without loading puzzles. */
export async function loadWordlistWordSet() {
  const wordlistRes = await fetch("text/wordlist.txt");
  const wordlistText = await wordlistRes.text();
  return new Set(wordlistText.toLowerCase().split("\n"));
}

export async function loadWordhunterTextAssets() {
  const wordSet = await loadWordlistWordSet();

  const puzzlesRes = await fetch("text/puzzles.txt");
  const puzzlesText = await puzzlesRes.text();
  const puzzles = parsePuzzlesFileText(puzzlesText, { fileLabel: "text/puzzles.txt" });

  return { wordSet, puzzles };
}
