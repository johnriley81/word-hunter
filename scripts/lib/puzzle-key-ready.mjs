import { PUZZLE_FILE_KEY_OBFUSCATED } from "../../js/puzzle-file-key.js";

export function assertPuzzleKeyReady() {
  if (PUZZLE_FILE_KEY_OBFUSCATED.every((b) => b === 0)) {
    console.error("Run npm run init:puzzle-key first.");
    process.exit(1);
  }
}
