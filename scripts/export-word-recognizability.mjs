/**
 * Chain: Python word→rec raw JSON, then Node filters by tile label length (see README).
 */

import { execFileSync } from "child_process";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const rawPath = join(root, "text/gamemaker/pregen/word-recognizability.raw.json");
const pyScript = join(__dirname, "export-word-recognizability.py");
const filterScript = join(__dirname, "filter-word-recogniz-by-tile-length.mjs");

try {
  execFileSync("python3", [pyScript, root, rawPath], {
    stdio: "inherit",
    encoding: "utf8",
  });
} catch (e) {
  console.error("gen:word-rec failed (python3 + metrics pickle — see README)");
  process.exit(1);
}

execFileSync(process.execPath, [filterScript], {
  stdio: "inherit",
  cwd: root,
  env: { ...process.env },
});
