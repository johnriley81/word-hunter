import test from "node:test";
import assert from "node:assert/strict";
import {
  rotateFlatQuarterTurnsCW,
  rotatePathFlatQuarterTurnsCW,
} from "../js/puzzle-export-sim/grid-symmetry.js";

test("rotateFlatQuarterTurnsCW 4×4: flat 0 → 3 after one quarter-turn CW", () => {
  assert.equal(rotateFlatQuarterTurnsCW(0, 1, 4), 3);
});

test("rotateFlatQuarterTurnsCW four quarter-turns restores index", () => {
  const n = 4;
  const flats = Array.from({ length: n * n }, (_, i) => i);
  for (const f of flats) {
    let cur = f;
    for (let k = 0; k < 4; k++) cur = rotateFlatQuarterTurnsCW(cur, 1, n);
    assert.equal(cur, f, "4×90° CW should restore flat " + f);
  }
});

test("rotatePathFlatQuarterTurnsCW rotates each flat", () => {
  const path = [0, 5, 10];
  const rotated = rotatePathFlatQuarterTurnsCW(path, 1, 4);
  assert.deepStrictEqual(
    rotated,
    path.map((f) => rotateFlatQuarterTurnsCW(f, 1, 4))
  );
});
