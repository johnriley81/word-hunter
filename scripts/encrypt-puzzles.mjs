#!/usr/bin/env node
/** Read gitignored text/puzzles.txt → write committed text/puzzles.enc. */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  decryptPuzzleFileBytesSync,
  decodePuzzleEncFileBase64,
  encryptPuzzleFilePlaintextSync,
  encodePuzzleEncFileBase64,
} from "./lib/puzzle-file-crypto.mjs";
import { assertPuzzleKeyReady } from "./lib/puzzle-key-ready.mjs";
import { puzzleTextPaths } from "./lib/puzzle-text-paths.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { plain: plainPath, enc: encPath } = puzzleTextPaths(root);

assertPuzzleKeyReady();

if (!existsSync(plainPath)) {
  if (existsSync(encPath)) {
    process.exit(0);
  }
  console.error(
    "Missing text/puzzles.txt — run npm run decrypt:puzzles or export/regen first."
  );
  process.exit(1);
}

const plaintext = readFileSync(plainPath, "utf8");

if (existsSync(encPath)) {
  try {
    const existing = decryptPuzzleFileBytesSync(
      decodePuzzleEncFileBase64(readFileSync(encPath, "utf8"))
    );
    if (existing === plaintext) {
      process.exit(0);
    }
  } catch {
    // Re-encrypt below if the existing blob is missing or invalid.
  }
}

const blob = encryptPuzzleFilePlaintextSync(plaintext);
writeFileSync(encPath, encodePuzzleEncFileBase64(blob) + "\n", "utf8");
console.log("Wrote", encPath, `(${blob.length} bytes ciphertext blob)`);
