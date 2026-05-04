/** Keep TILE_LABEL_* in sync with generate-puzzle-pool.mjs */

import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { wordToTileLabelSequence } from "../js/board-logic.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const TILE_LABEL_MIN = Math.max(
  1,
  parseInt(process.env.TILE_LABEL_MIN || "8", 10) || 8
);
const TILE_LABEL_MAX = Math.max(
  TILE_LABEL_MIN,
  parseInt(process.env.TILE_LABEL_MAX || "16", 10) || 16
);

const rawPath = join(root, "text/gamemaker/pregen/word-recognizability.raw.json");
const outPath = join(root, "text/gamemaker/pregen/word-recognizability.json");

const raw = JSON.parse(readFileSync(rawPath, "utf8"));
if (!raw.words || typeof raw.words !== "object") {
  throw new Error("word-recognizability.raw.json: missing .words object");
}

const words = {};
for (const [w, rec] of Object.entries(raw.words)) {
  const n = wordToTileLabelSequence(w).length;
  if (n < TILE_LABEL_MIN || n > TILE_LABEL_MAX) continue;
  words[w] = rec;
}

const payload = {
  version: typeof raw.version === "number" ? raw.version : 1,
  ...(raw.stage != null ? { stage: raw.stage } : {}),
  tileLabelLength: [TILE_LABEL_MIN, TILE_LABEL_MAX],
  filter: "wordToTileLabelSequence",
  words,
};

writeFileSync(outPath, JSON.stringify(payload, null, 2) + "\n", "utf8");

console.error(
  `Filtered ${
    Object.keys(words).length
  } words (${TILE_LABEL_MIN}–${TILE_LABEL_MAX} tile labels) → ${outPath}`
);
