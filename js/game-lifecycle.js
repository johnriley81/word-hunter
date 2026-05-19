import { parsePuzzlesFileText } from "./puzzle-row-format.js";

export { calculatePuzzleDayIndex, puzzleListIndex } from "./puzzle-calendar.js";

const WORDLIST_URL = new URL("../text/wordlist.txt", import.meta.url);
const PUZZLES_URL = new URL("../text/puzzles.txt", import.meta.url);

/**
 * @param {URL} url
 * @param {string} label
 */
async function fetchTextAsset(url, label) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(label + " HTTP " + res.status + " (" + url.href + ")");
  }
  return res.text();
}

/** Lowercase gameplay dictionary only — for gamemaker path validation without loading puzzles. */
export async function loadWordlistWordSet() {
  const wordlistText = await fetchTextAsset(WORDLIST_URL, "text/wordlist.txt");
  return new Set(wordlistText.toLowerCase().split("\n"));
}

/**
 * @returns {Promise<
 *   | { ok: true; wordSet: Set<string>; puzzles: ReturnType<typeof parsePuzzlesFileText> }
 *   | { ok: false; error: string }
 * >}
 */
export async function loadWordhunterTextAssets() {
  try {
    const wordSet = await loadWordlistWordSet();
    const puzzlesText = await fetchTextAsset(PUZZLES_URL, "text/puzzles.txt");
    const puzzles = parsePuzzlesFileText(puzzlesText, {
      fileLabel: "text/puzzles.txt",
    });
    if (!puzzles.length) {
      return { ok: false, error: "text/puzzles.txt has no puzzle rows" };
    }
    return { ok: true, wordSet, puzzles };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}
