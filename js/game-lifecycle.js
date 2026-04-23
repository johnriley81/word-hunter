export { calculateDiffDays } from "./puzzle-calendar.js";

export async function loadWordhunterTextAssets() {
  const wordlistRes = await fetch("text/wordlist.txt");
  const wordlistText = await wordlistRes.text();
  const wordSet = new Set(wordlistText.toLowerCase().split("\n"));

  const gridsRes = await fetch("text/grids.txt");
  const gridsText = await gridsRes.text();
  const gridsList = gridsText.split("\n").map((line) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      console.error("Error parsing line:", line);
      console.error("Parse error:", error);
    }
  });

  const nextRes = await fetch("text/nextletters.txt");
  const nextText = await nextRes.text();
  const nextLettersList = nextText.split("\n").map((line) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      console.error("Error parsing line:", line);
      console.error("Parse error:", error);
    }
  });

  return { wordSet, gridsList, nextLettersList };
}
