import test from "node:test";
import assert from "node:assert/strict";
import { createPerfectHuntWordDragHooks } from "../js/game-perfect-hunt-hooks.js";
import { buildScoreValidationPayload } from "../js/leaderboard-score-validation.js";

function makeMinimalHooksCtx() {
  const ctx = {
    state: {
      perfectHunt: [],
      perfectHuntWordsSubmitted: new Set(),
      perfectHuntOnPace: false,
      perfectHuntOrderIndex: 0,
      perfectHuntHintStickyFlat: null,
      gameBoard: [],
    },
  };
  let score = 0;
  let nextLetters = [];
  let trophyWord = "";
  let trophyWordScore = 0;
  let scoreValidationWordsPlayed = [];

  const hooks = createPerfectHuntWordDragHooks({
    ctx,
    getScore: () => score,
    setScore: (v) => {
      score = v;
    },
    getTrophyWord: () => trophyWord,
    setTrophyWord: (v) => {
      trophyWord = v;
    },
    getTrophyWordScore: () => trophyWordScore,
    setTrophyWordScore: (v) => {
      trophyWordScore = v;
    },
    getNextLetters: () => nextLetters,
    setNextLetters: (v) => {
      nextLetters = v;
    },
    updateNextLetters: () => {},
    getIsGameActive: () => true,
    gridSize: 4,
    scoreValidationWordsPlayed,
    clearPerfectHuntHintVisual: () => {},
    refreshPerfectHuntHint: () => {},
    currentWordMatchesExpectedPerfectHunt: () => false,
  });

  return { hooks, getWordsPlayed: () => scoreValidationWordsPlayed };
}

test("recordLeaderboardScoreTurn keeps shared array after in-place clear", () => {
  const { hooks, getWordsPlayed } = makeMinimalHooksCtx();
  getWordsPlayed().length = 0;
  hooks.recordLeaderboardScoreTurn("hello");
  hooks.recordLeaderboardScoreTurn("world");
  assert.deepEqual(getWordsPlayed(), ["hello", "world"]);
  const payload = buildScoreValidationPayload([], getWordsPlayed());
  assert.deepEqual(payload.wordsPlayed, ["hello", "world"]);
});

test("recordLeaderboardScoreTurn ignores empty words", () => {
  const { hooks, getWordsPlayed } = makeMinimalHooksCtx();
  hooks.recordLeaderboardScoreTurn("");
  assert.deepEqual(getWordsPlayed(), []);
});
