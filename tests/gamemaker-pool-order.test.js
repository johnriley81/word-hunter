import test from "node:test";
import assert from "node:assert/strict";
import {
  comparePoolWordEntriesDesc,
  comparePoolWordEntriesAscForwardExport,
  comparePoolWordEntriesDescSackRefillOrder,
} from "../js/gamemaker/pool-order.js";

const hi = { word: "zebra", wordTotal: 100 };
const midA = { word: "apple", wordTotal: 50 };
const midB = { word: "banana", wordTotal: 50 };

test("comparePoolWordEntriesDesc: score desc, tie word asc", () => {
  assert.ok(comparePoolWordEntriesDesc(hi, midA) < 0);
  assert.ok(comparePoolWordEntriesDesc(midA, midB) < 0);
  assert.ok(comparePoolWordEntriesDesc(midB, midA) > 0);
});

test("comparePoolWordEntriesAscForwardExport: score asc, tie word asc", () => {
  assert.ok(comparePoolWordEntriesAscForwardExport(midA, hi) < 0);
  assert.ok(comparePoolWordEntriesAscForwardExport(midA, midB) < 0);
});

test("comparePoolWordEntriesDescSackRefillOrder: score desc, tie word desc", () => {
  assert.ok(comparePoolWordEntriesDescSackRefillOrder(hi, midA) < 0);
  assert.ok(comparePoolWordEntriesDescSackRefillOrder(midB, midA) < 0);
  assert.ok(comparePoolWordEntriesDescSackRefillOrder(midA, midB) > 0);
});
