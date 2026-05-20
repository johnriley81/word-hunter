#!/usr/bin/env node
/** Read text/puzzles.enc → write gitignored text/puzzles.txt for local editing. */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  decryptPuzzleFileBytesSync,
  decodePuzzleEncFileBase64,
} from "./lib/puzzle-file-crypto.mjs";
import { assertPuzzleKeyReady } from "./lib/puzzle-key-ready.mjs";
import { puzzleTextPaths } from "./lib/puzzle-text-paths.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { plain: plainPath, enc: encPath } = puzzleTextPaths(root);

assertPuzzleKeyReady();

if (!existsSync(encPath)) {
  console.error("Missing text/puzzles.enc");
  process.exit(1);
}

const b64 = readFileSync(encPath, "utf8");
const plaintext = decryptPuzzleFileBytesSync(decodePuzzleEncFileBase64(b64));
writeFileSync(
  plainPath,
  plaintext.endsWith("\n") ? plaintext : plaintext + "\n",
  "utf8"
);
console.log("Wrote", plainPath);
