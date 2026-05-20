import { resolve } from "node:path";

export function puzzleTextPaths(root) {
  return {
    plain: resolve(root, "text/puzzles.txt"),
    enc: resolve(root, "text/puzzles.enc"),
  };
}
