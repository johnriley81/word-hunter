import test from "node:test";
import assert from "node:assert/strict";
import { wordPathDragStrokeColorAt } from "../js/word-path.js";

test("wordPathDragStrokeColorAt returns rgb for phase", () => {
  const c = wordPathDragStrokeColorAt(0.25);
  assert.match(c, /^rgb\(\d+,\d+,\d+\)$/);
});
