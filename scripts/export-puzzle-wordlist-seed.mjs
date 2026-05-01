/** Emit puzzle-only candidate seed lines from word-recognizability.json (manual trim afterward). */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const EXPORT_RECOG_MIN = Math.max(
  1,
  Math.min(10, parseInt(process.env.EXPORT_RECOG_MIN || "8", 10) || 8)
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
    `Wrote ${picked.length} words (rec >= ${EXPORT_RECOG_MIN}) → ${OUT_PATH_RAW}`
  );
}
