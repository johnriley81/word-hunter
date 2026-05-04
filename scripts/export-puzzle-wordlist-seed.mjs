/**
 * Emit `text/gamemaker/puzzle-wordlist.txt`: words whose JSON **recognizability tier** clears a floor.
 *
 * IMPORTANT: **`EXPORT_RECOG_MIN`** is the **`rec`** field in `word-recognizability.json` (integer **≈ 1–10**),
 * *not* word spelling length (`word.length`), *not* `wordToTileLabelSequence(word).length` (tile glyph count).
 * Tile-label lengths are narrowed earlier in **`npm run gen:word-rec`** (default 8–16 labels).
 *
 * Manual trim afterward (`puzzle-wordlist.txt` — **tier trim only**).
 * **`npm run gen:puzzle-pool`** pulls from **`text/wordlist.txt`** by default (`PUZZLE_WORDLIST`): see **`generate-puzzle-pool.mjs`** (`RECOG_MIN`, `POOL_SIZE`, etc.).
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const EXPORT_RECOG_MIN = Math.max(
  1,
  Math.min(10, parseInt(process.env.EXPORT_RECOG_MIN || "10", 10) || 10)
);

const DEFAULT_OUT = join(root, "text/gamemaker/puzzle-wordlist.txt");
const OUT_PATH_RAW = process.env.OUT_PATH ?? DEFAULT_OUT;

const recPath = join(root, "text/gamemaker/pregen/word-recognizability.json");
const raw = readFileSync(recPath, "utf8");
const j = JSON.parse(raw);
const words = j.words;
if (!words || typeof words !== "object") {
  console.error("word-recognizability.json: missing top-level .words object");
  process.exit(1);
}

const picked = [];
for (const [w, rec] of Object.entries(words)) {
  if (typeof rec !== "number" || rec < EXPORT_RECOG_MIN) continue;
  if (!w || !/^[a-z]+$/.test(w)) continue;
  picked.push(w);
}
picked.sort((a, b) => a.localeCompare(b));
const body = picked.join("\n") + (picked.length ? "\n" : "");

if (OUT_PATH_RAW === "-") {
  process.stdout.write(body);
} else {
  mkdirSync(dirname(OUT_PATH_RAW), { recursive: true });
  writeFileSync(OUT_PATH_RAW, body, "utf8");
  console.error(
    `Wrote ${picked.length} words (recognizability tier rec ≥ ${EXPORT_RECOG_MIN} in word-recognizability.json — 1–10 score, not spelling length nor glyph/tile-label count) → ${OUT_PATH_RAW}`
  );
}
