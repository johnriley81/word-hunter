import test from "node:test";
import assert from "node:assert/strict";
import {
  buildGameLettersList,
  buildScoreValidationPayload,
  scoreValidationPayloadMatches,
} from "../js/leaderboard-score-validation.js";
import {
  getLiveWordScoreBreakdownFromLabels,
  wordToTileLabelSequence,
} from "../js/board-logic.js";
import {
  isLeaderboardNameAcceptable,
  isProhibitedLeaderboardName,
} from "../js/leaderboard-name-policy.js";
import {
  fetchLiveLeaderboardNetworkResult,
  resetLeaderboardFetchCacheForTests,
} from "../js/leaderboard-client.js";

function scoreWord(word) {
  const { wordTotal } = getLiveWordScoreBreakdownFromLabels(
    wordToTileLabelSequence(word)
  );
  return wordTotal;
}

test("buildGameLettersList: starting grid + canonical next letters", () => {
  const grid = [
    ["a", "b", "c", "d"],
    ["e", "f", "g", "h"],
    ["i", "j", "k", "l"],
    ["m", "n", "o", "p"],
  ];
  const letters = buildGameLettersList(grid, ["q", "r", "s"]);
  assert.equal(letters.length, 16 + 66);
  assert.deepEqual(letters.slice(0, 4), ["a", "b", "c", "d"]);
  assert.equal(letters[16], "q");
});

test("scoreValidationPayloadMatches: consumes duplicate tiles once each", () => {
  const payload = buildScoreValidationPayload(["l", "e", "v", "e", "l"], ["level"]);
  assert.equal(
    scoreValidationPayloadMatches(payload, scoreWord("level"), "level", scoreWord),
    true
  );
});

test("scoreValidationPayloadMatches: perfect hunt puzzle 14 payload", () => {
  const gameLetters = [
    "a",
    "w",
    "d",
    "e",
    "y",
    "i",
    "i",
    "e",
    "o",
    "r",
    "s",
    "p",
    "c",
    "e",
    "r",
    "c",
    "d",
    "o",
    "n",
    "f",
    "n",
    "g",
    "s",
    "r",
    "t",
    "r",
    "g",
    "a",
    "i",
    "z",
    "e",
    "d",
    "e",
    "e",
    "v",
    "l",
    "n",
    "c",
    "k",
    "o",
    "l",
    "e",
    "a",
    "t",
    "a",
    "t",
    "c",
    "a",
    "s",
    "i",
    "qu",
    "l",
    "z",
    "i",
    "n",
    "o",
    "y",
    "c",
    "i",
    "m",
    "i",
    "v",
    "e",
    "",
    "",
    "r",
    "",
    "",
    "",
    "l",
    "",
    "h",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
  ];
  const wordsPlayed = [
    "speedway",
    "recordings",
    "confederation",
    "legalization",
    "quicksilver",
    "victimization",
    "hierarchically",
  ];
  const payload = buildScoreValidationPayload(gameLetters, wordsPlayed);
  assert.equal(
    scoreValidationPayloadMatches(payload, 1861, "hierarchically", scoreWord),
    true
  );
});

test("leaderboard name policy blocks obvious profanity fragments", () => {
  assert.equal(isProhibitedLeaderboardName("FUCK"), true);
  assert.equal(isLeaderboardNameAcceptable("ADA"), true);
});

test("fetchLiveLeaderboardNetworkResult bypasses cache for POST submit", async () => {
  resetLeaderboardFetchCacheForTests();
  let calls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    calls += 1;
    return {
      ok: true,
      status: 200,
      json: async () => ({ message: "Record inserted successfully.", top_10: [] }),
    };
  };
  try {
    const params = {
      leaderboardLink: "http://example.test/leaderboard/",
      puzzleId: 7,
      canPost: true,
      playerNameTrim: "ADA",
      score: 10,
      trophyWord: "cat",
      scoreValidationPayload: { gameLetters: [], wordsPlayed: [] },
    };
    await fetchLiveLeaderboardNetworkResult(params);
    await fetchLiveLeaderboardNetworkResult(params);
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
    resetLeaderboardFetchCacheForTests();
  }
});

test("fetchLiveLeaderboardNetworkResult warms GET cache after successful POST", async () => {
  resetLeaderboardFetchCacheForTests();
  let calls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    calls += 1;
    const isPost = options?.method === "POST";
    return {
      ok: true,
      status: 200,
      json: async () =>
        isPost
          ? { message: "Record inserted successfully.", top_10: [["Ada", 88, "star"]] }
          : [["Ada", 88, "star"]],
    };
  };
  try {
    const postParams = {
      leaderboardLink: "http://example.test/leaderboard/",
      puzzleId: 14,
      canPost: true,
      playerNameTrim: "ADA",
      score: 88,
      trophyWord: "star",
      scoreValidationPayload: { gameLetters: [], wordsPlayed: [] },
    };
    const getParams = { ...postParams, canPost: false };
    await fetchLiveLeaderboardNetworkResult(postParams);
    assert.equal(calls, 1);
    await fetchLiveLeaderboardNetworkResult(getParams);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    resetLeaderboardFetchCacheForTests();
  }
});

test("fetchLiveLeaderboardNetworkResult caches GET for one minute", async () => {
  resetLeaderboardFetchCacheForTests();
  let calls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    calls += 1;
    return {
      ok: true,
      status: 200,
      json: async () => [["A", 1, "t"]],
    };
  };
  try {
    const params = {
      leaderboardLink: "http://example.test/leaderboard/",
      puzzleId: 42,
      canPost: false,
      playerNameTrim: "",
      score: 0,
      trophyWord: "",
      scoreValidationPayload: null,
    };
    await fetchLiveLeaderboardNetworkResult(params);
    await fetchLiveLeaderboardNetworkResult(params);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    resetLeaderboardFetchCacheForTests();
  }
});
