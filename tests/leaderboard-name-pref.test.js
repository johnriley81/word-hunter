import assert from "node:assert/strict";
import { test } from "node:test";
import {
  LEADERBOARD_NAME_STORAGE_KEY,
  persistLeaderboardSubmitName,
  readStoredLeaderboardName,
} from "../js/leaderboard-name-pref.js";

test("leaderboard name pref: sanitize and round-trip", () => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => {
      store.set(k, v);
    },
    removeItem: (k) => {
      store.delete(k);
    },
  };

  assert.equal(readStoredLeaderboardName(), "");

  persistLeaderboardSubmitName("abc9!? xy");
  assert.equal(store.get(LEADERBOARD_NAME_STORAGE_KEY), "ABCXY");
  assert.equal(readStoredLeaderboardName(), "ABCXY");

  persistLeaderboardSubmitName("");
  assert.equal(store.has(LEADERBOARD_NAME_STORAGE_KEY), false);
  assert.equal(readStoredLeaderboardName(), "");
});
