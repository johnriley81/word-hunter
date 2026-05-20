import { parsePuzzlesFileText } from "./puzzle-row-format.js";
import {
  decodePuzzleEncFileBase64,
  decryptPuzzleFileBytes,
} from "./puzzle-file-crypto.js";

export { calculatePuzzleDayIndex, puzzleListIndex } from "./puzzle-calendar.js";

const WORDLIST_URL = new URL("../text/wordlist.txt", import.meta.url);
const PUZZLES_ENC_URL = new URL("../text/puzzles.enc", import.meta.url);

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

/** Lowercase gameplay dictionary — shared by asset load and puzzle tooling. */
export async function loadWordlistWordSet() {
  const wordlistText = await fetchTextAsset(WORDLIST_URL, "text/wordlist.txt");
  return new Set(wordlistText.toLowerCase().split("\n"));
}

async function loadShippedPuzzlesPlaintext() {
  const b64 = await fetchTextAsset(PUZZLES_ENC_URL, "text/puzzles.enc");
  const fileBytes = decodePuzzleEncFileBase64(b64);
  return decryptPuzzleFileBytes(fileBytes);
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
    const puzzlesText = await loadShippedPuzzlesPlaintext();
    const puzzles = parsePuzzlesFileText(puzzlesText, {
      fileLabel: "text/puzzles.enc",
    });
    if (!puzzles.length) {
      return { ok: false, error: "text/puzzles.enc decrypts to no puzzle rows" };
    }
    return { ok: true, wordSet, puzzles };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}
