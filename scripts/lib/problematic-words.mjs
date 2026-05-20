import { appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  defaultProblematicWordsSet,
  parseProblematicWordsText,
} from "../../js/puzzle-build/problematic-words.js";
import { repoRoot } from "./puzzle-build-paths.mjs";

const DEFAULT_PATH = resolve(repoRoot, "text/gamemaker/problematic-words.txt");

/** @type {Set<string> | null} */
let cached = null;

/** @param {string} [filePath] */
export function loadProblematicWordsSet(filePath = DEFAULT_PATH) {
  if (cached) return cached;
  try {
    const parsed = parseProblematicWordsText(readFileSync(filePath, "utf8"));
    cached = parsed.size > 0 ? parsed : defaultProblematicWordsSet();
  } catch {
    cached = defaultProblematicWordsSet();
  }
  return cached;
}

export function resetProblematicWordsCacheForTests() {
  cached = null;
}

/**
 * Append new lowercase words to `problematic-words.txt` (no duplicates).
 *
 * @param {string[]} words
 * @param {string} [filePath]
 * @returns {string[]} newly added words
 */
export function appendProblematicWordsToFile(words, filePath = DEFAULT_PATH) {
  const existing = loadProblematicWordsSet(filePath);
  /** @type {string[]} */
  const toAdd = [];
  for (const raw of words) {
    const w = String(raw || "")
      .trim()
      .toLowerCase();
    if (!/^[a-z]+$/.test(w) || existing.has(w)) continue;
    existing.add(w);
    toAdd.push(w);
  }
  if (toAdd.length === 0) return [];

  appendFileSync(filePath, `${toAdd.map((w) => `${w}\n`).join("")}`);
  resetProblematicWordsCacheForTests();
  return toAdd;
}

export {
  parseProblematicWordsText,
  defaultProblematicWordsSet,
} from "../../js/puzzle-build/problematic-words.js";
