/** Builds `text/gamemaker/pregen/word-recognizability.json` via Python 3 + `word_metrics_7_10.pkl`. */

import { execFileSync } from "child_process";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const outPath = join(root, "text/gamemaker/pregen/word-recognizability.json");
const pyScript = join(__dirname, "export-word-recognizability.py");

try {
  execFileSync("python3", [pyScript, root, outPath], {
    stdio: "inherit",
    encoding: "utf8",
  });
} catch (e) {
  console.error(
    "export-word-recognizability: need python3 and text/word_metrics_7_10.pkl"
  );
  process.exit(1);
}
