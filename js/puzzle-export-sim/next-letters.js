import { NEXT_LETTERS_LEN, GRID_SIZE } from "../config.js";
import { normalizeTileText } from "../board-logic.js";

/** True when every cell is blank after `normalizeTileText` (e.g. gamemaker empty template). */
export function isGridAllNormalizedEmpty(grid, gridSize = GRID_SIZE) {
  const n = gridSize;
  if (!Array.isArray(grid) || grid.length !== n) return false;
  return grid.every(
    (row) =>
      Array.isArray(row) &&
      row.length === n &&
      row.every((cell) => normalizeTileText(String(cell ?? "")) === "")
  );
}

/** Strip trailing sack padding before JSON round-trip / display. */
export function stripTrailingEmptyNextLetters(tokens) {
  const out = Array.isArray(tokens) ? tokens.slice() : [];
  while (out.length > 0 && out[out.length - 1] === "") out.pop();
  return out;
}

/** Drops every `""` — sack counting must use canonical/padded arrays instead. */
export function omitEmptyNextLetterSlots(tokens) {
  return (Array.isArray(tokens) ? tokens : []).filter((t) => t !== "");
}

/** Canonical runtime sack length after importing compact JSON. */
export function padNextLettersToLen(tokens, len = NEXT_LETTERS_LEN) {
  const src = Array.isArray(tokens) ? tokens : [];
  const out = src.slice(0, len);
  while (out.length < len) out.push("");
  return out;
}

/** Compact JSON sack → lowercase, trim trailing blanks, pad to NEXT_LETTERS_LEN. */
export function canonicalNextLettersFromJsonArray(raw) {
  if (!Array.isArray(raw)) throw new Error("next_letters must be an array");
  const mapped = /** @type {string[]} */ (
    raw.map((c) => String(c ?? "").toLowerCase())
  );
  const trimmed = stripTrailingEmptyNextLetters(mapped);
  if (trimmed.length === 0)
    throw new Error("next_letters must have at least one entry");
  if (trimmed.length > NEXT_LETTERS_LEN) {
    throw new Error("next_letters at most " + NEXT_LETTERS_LEN + " entries");
  }
  return padNextLettersToLen(trimmed);
}
