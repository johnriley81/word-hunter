import test from "node:test";
import assert from "node:assert/strict";
import { isLeaderboardInlineNameInputFocused } from "../js/leaderboard-ui-helpers.js";

function mockLeaderboardTable(input) {
  return {
    querySelector(sel) {
      return sel === ".leaderboard-inline-name-input" ? input ?? null : null;
    },
  };
}

test("isLeaderboardInlineNameInputFocused: false when table has no inline input", () => {
  assert.equal(isLeaderboardInlineNameInputFocused(mockLeaderboardTable(), {}), false);
});

test("isLeaderboardInlineNameInputFocused: false when inline input is not focused", () => {
  const input = {};
  const table = mockLeaderboardTable(input);
  assert.equal(isLeaderboardInlineNameInputFocused(table, {}), false);
});

test("isLeaderboardInlineNameInputFocused: true when inline input is activeElement", () => {
  const input = {};
  const table = mockLeaderboardTable(input);
  assert.equal(isLeaderboardInlineNameInputFocused(table, input), true);
});
