import { parsePuzzlesFileText } from "./puzzle-row-format.js";
import {
  decodePuzzleEncFileBase64,
  decryptPuzzleFileBytes,
  puzzleDecryptAvailable,
} from "./puzzle-file-crypto.js";

export { calculatePuzzleDayIndex, puzzleListIndex } from "./puzzle-calendar.js";

const WORDLIST_URL = new URL("../text/wordlist.txt", import.meta.url);
const PUZZLES_ENC_URL = new URL("../text/puzzles.enc", import.meta.url);
const PUZZLES_PLAIN_URL = new URL("../text/puzzles.txt", import.meta.url);

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

/** @param {unknown} error */
function isHttpNotFound(error) {
  return error instanceof Error && /HTTP 404\b/.test(error.message);
}

/** Lowercase gameplay dictionary — shared by asset load and puzzle tooling. */
export async function loadWordlistWordSet() {
  const wordlistText = await fetchTextAsset(WORDLIST_URL, "text/wordlist.txt");
  return new Set(wordlistText.toLowerCase().split("\n"));
}

async function loadPlaintextPuzzlesFile() {
  return fetchTextAsset(PUZZLES_PLAIN_URL, "text/puzzles.txt");
}

async function loadShippedPuzzlesPlaintext() {
  if (!puzzleDecryptAvailable()) {
    try {
      return await loadPlaintextPuzzlesFile();
    } catch {
      throw new Error(
        "Puzzle decryption needs HTTPS or localhost. Use a secure URL, or serve text/puzzles.txt for local dev."
      );
    }
  }

  try {
    const b64 = await fetchTextAsset(PUZZLES_ENC_URL, "text/puzzles.enc");
    const fileBytes = decodePuzzleEncFileBase64(b64);
    return decryptPuzzleFileBytes(fileBytes);
  } catch (error) {
    if (isHttpNotFound(error)) {
      return loadPlaintextPuzzlesFile();
    }
    throw error;
  }
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
      fileLabel: "puzzles",
    });
    if (!puzzles.length) {
      return { ok: false, error: "Shipped puzzles file has no puzzle rows" };
    }
    return { ok: true, wordSet, puzzles };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}
