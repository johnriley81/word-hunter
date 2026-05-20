/** Authoring blocklist only (`text/wordlist.txt` is unchanged). */
export const PROBLEMATIC_WORDS_PATH = "text/gamemaker/problematic-words.txt";

/** Fallback when the file is missing (tests / offline). */
export const DEFAULT_PROBLEMATIC_WORDS = Object.freeze([
  "thousand",
  "subjectivity",
  "subjectively",
]);

/**
 * @param {string} text
 * @returns {Set<string>}
 */
export function parseProblematicWordsText(text) {
  /** @type {Set<string>} */
  const out = new Set();
  for (const line of String(text || "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const wordPart = trimmed.split("#")[0].trim().toLowerCase();
    if (/^[a-z]+$/.test(wordPart)) out.add(wordPart);
  }
  return out;
}

/** @returns {Set<string>} */
export function defaultProblematicWordsSet() {
  return new Set(DEFAULT_PROBLEMATIC_WORDS);
}

/**
 * @param {string} word
 * @param {Set<string>} blocked
 */
export function isProblematicWord(word, blocked) {
  const w = String(word || "")
    .trim()
    .toLowerCase();
  return w.length > 0 && blocked.has(w);
}

/**
 * @param {Iterable<string>} words
 * @param {Set<string>} blocked
 * @returns {string[]}
 */
export function filterWordsExcludingProblematic(words, blocked) {
  /** @type {string[]} */
  const out = [];
  for (const raw of words) {
    const w = String(raw || "")
      .trim()
      .toLowerCase();
    if (!/^[a-z]+$/.test(w)) continue;
    if (blocked.has(w)) continue;
    out.push(w);
  }
  return out;
}

/** @param {Array<{ words?: unknown[] }>} lists @param {Set<string>} blocked */
export function filterProblematicFromPoolLists(lists, blocked) {
  if (!(blocked instanceof Set) || blocked.size === 0) return lists;
  return lists.map((row) => {
    const words = Array.isArray(row.words) ? row.words : [];
    return {
      ...row,
      words: words.filter((raw) => {
        const w = String(/** @type {{ word?: unknown }} */ (raw).word || raw || "")
          .trim()
          .toLowerCase();
        return w && !blocked.has(w);
      }),
    };
  });
}
