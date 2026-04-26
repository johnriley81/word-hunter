export { calculateDiffDays } from "./puzzle-calendar.js";
import { parsePuzzlesFileText } from "./puzzle-row-format.js";

export async function loadWordhunterTextAssets() {
  const wordlistRes = await fetch("text/wordlist.txt");
  const wordlistText = await wordlistRes.text();
  const wordSet = new Set(wordlistText.toLowerCase().split("\n"));

  const puzzlesRes = await fetch("text/puzzles.txt");
  const puzzlesText = await puzzlesRes.text();
  const puzzles = parsePuzzlesFileText(puzzlesText, { fileLabel: "text/puzzles.txt" });

  return { wordSet, puzzles };
}
