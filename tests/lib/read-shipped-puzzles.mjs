import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  decryptPuzzleFileBytesSync,
  decodePuzzleEncFileBase64,
} from "../../scripts/lib/puzzle-file-crypto.mjs";
import { puzzleTextPaths } from "../../scripts/lib/puzzle-text-paths.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const { plain: plainPath, enc: encPath } = puzzleTextPaths(root);

export function readShippedPuzzlesText() {
  if (existsSync(plainPath)) {
    return readFileSync(plainPath, "utf8");
  }
  if (!existsSync(encPath)) {
    throw new Error("Missing text/puzzles.txt and text/puzzles.enc");
  }
  const b64 = readFileSync(encPath, "utf8");
  return decryptPuzzleFileBytesSync(decodePuzzleEncFileBase64(b64));
}
