import test from "node:test";
import assert from "node:assert/strict";
import { parsePlainWordListParam, findSampleRowInJsonl } from "../js/debug-reverse-ui.js";

test("parsePlainWordListParam splits commas and trims", () => {
  assert.deepEqual(parsePlainWordListParam("cat,dog , BIRD"), ["cat", "dog", "bird"]);
});

test("parsePlainWordListParam empty", () => {
  assert.deepEqual(parsePlainWordListParam(""), []);
  assert.deepEqual(parsePlainWordListParam("  ,  "), []);
});

test("findSampleRowInJsonl picks sample_id", () => {
  const body = `{"sample_id":0,"words":["a","b"]}\n{"sample_id":1,"words":["x"]}\n`;
  const row = findSampleRowInJsonl(body, 1);
  assert.deepEqual(row.words, ["x"]);
});

test("findSampleRowInJsonl throws when missing", () => {
  assert.throws(() => findSampleRowInJsonl('{"sample_id":0}\n', 9), /sample_id 9 not found/);
});
