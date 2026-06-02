import test from "node:test";
import assert from "node:assert/strict";
import {
  getLeaderboardSessionId,
  getLeaderboardSubmitName,
  setLeaderboardSubmitName,
  resetLeaderboardSessionStorageForTests,
} from "../js/leaderboard-session.js";
import {
  fetchLiveLeaderboardNetworkResult,
  resetLeaderboardFetchCacheForTests,
} from "../js/leaderboard-client.js";
import {
  leaderboardPostMessageIndicatesCommit,
  leaderboardPostTreatAsCommitted,
} from "../js/leaderboard-api.js";

function installLocalStorageMock() {
  /** @type {Map<string, string>} */
  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => {
      store.set(String(key), String(value));
    },
    removeItem: (key) => {
      store.delete(String(key));
    },
    clear: () => {
      store.clear();
    },
    get length() {
      return store.size;
    },
    key: (index) => Array.from(store.keys())[index] ?? null,
  };
}

test("getLeaderboardSessionId: stable for same puzzleId, new for different puzzleId", () => {
  installLocalStorageMock();
  resetLeaderboardSessionStorageForTests();
  const first = getLeaderboardSessionId(42);
  const second = getLeaderboardSessionId(42);
  const other = getLeaderboardSessionId(99);
  assert.equal(first, second);
  assert.notEqual(first, other);
  assert.match(first, /^[0-9a-f-]{36}$/i);
});

test("getLeaderboardSubmitName: persists committed name per puzzle", () => {
  installLocalStorageMock();
  resetLeaderboardSessionStorageForTests();
  assert.equal(getLeaderboardSubmitName(42), "");
  setLeaderboardSubmitName(42, "Ada");
  assert.equal(getLeaderboardSubmitName(42), "Ada");
  assert.equal(getLeaderboardSubmitName(99), "");
});

test("fetchLiveLeaderboardNetworkResult POST body includes sessionId", async () => {
  installLocalStorageMock();
  resetLeaderboardSessionStorageForTests();
  resetLeaderboardFetchCacheForTests();
  /** @type {Record<string, unknown> | null} */
  let capturedBody = null;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    capturedBody = JSON.parse(String(options?.body ?? "{}"));
    return {
      ok: true,
      status: 200,
      json: async () => ({ message: "Record inserted successfully.", top_10: [] }),
    };
  };
  try {
    await fetchLiveLeaderboardNetworkResult({
      leaderboardLink: "http://example.test/leaderboard/",
      puzzleId: 7,
      canPost: true,
      playerNameTrim: "ADA",
      score: 10,
      trophyWord: "cat",
      scoreValidationPayload: { gameLetters: [], wordsPlayed: [] },
    });
    assert.ok(capturedBody);
    assert.equal(typeof capturedBody.sessionId, "string");
    assert.match(String(capturedBody.sessionId), /^[0-9a-f-]{36}$/i);
    assert.equal(capturedBody.sessionId, getLeaderboardSessionId(7));
  } finally {
    globalThis.fetch = originalFetch;
    resetLeaderboardFetchCacheForTests();
    resetLeaderboardSessionStorageForTests();
  }
});

test("leaderboard commit markers include update and score-not-improved", () => {
  assert.equal(
    leaderboardPostMessageIndicatesCommit({ message: "Record updated successfully." }),
    true
  );
  assert.equal(
    leaderboardPostMessageIndicatesCommit({ message: "Score not improved." }),
    true
  );
  assert.equal(
    leaderboardPostTreatAsCommitted(true, { message: "Score not improved." }, true),
    false
  );
});
