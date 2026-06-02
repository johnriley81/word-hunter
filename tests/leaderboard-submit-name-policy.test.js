import test from "node:test";
import assert from "node:assert/strict";
import { applyLeaderboardSubmitButtonVisibility } from "../js/leaderboard-ui-submit-visibility.js";

function mockClassList() {
  const set = new Set();
  return {
    add: (c) => set.add(c),
    remove: (c) => set.delete(c),
    toggle: (c, on) => (on ? set.add(c) : set.delete(c)),
    has: (c) => set.has(c),
  };
}

function mockRefs(playerNameValue) {
  const leaderboardButton = {
    classList: mockClassList(),
    disabled: false,
    style: { backgroundColor: "", removeProperty() {} },
  };
  return {
    leaderboardButton,
    leaderboardDemoAdd: null,
    playerName: { value: playerNameValue },
  };
}

test("applyLeaderboardSubmitButtonVisibility: shows live submit for prohibited name before submit click", () => {
  const refs = mockRefs("FUCK");
  applyLeaderboardSubmitButtonVisibility({
    leaderboardUseDemoData: false,
    refs,
    qualifiesForBoardSlot: true,
    score: 88,
    scoreSubmitThreshold: 0,
    liveSubmitUsed: false,
    demoSubmitUsed: false,
    submitCooldownRemainingMs: 0,
  });
  assert.equal(refs.leaderboardButton.classList.has("hiddenDisplay"), false);
  assert.equal(refs.leaderboardButton.disabled, false);
});

test("applyLeaderboardSubmitButtonVisibility: hides live submit after name rejected (lost turn)", () => {
  const refs = mockRefs("FUCK");
  applyLeaderboardSubmitButtonVisibility({
    leaderboardUseDemoData: false,
    refs,
    qualifiesForBoardSlot: true,
    score: 88,
    scoreSubmitThreshold: 0,
    liveSubmitUsed: false,
    liveNameRejected: true,
    demoSubmitUsed: false,
    submitCooldownRemainingMs: 0,
  });
  assert.equal(refs.leaderboardButton.disabled, true);
});

test("applyLeaderboardSubmitButtonVisibility: hides live submit after lost turn (submit used)", () => {
  const refs = mockRefs("FUCK");
  applyLeaderboardSubmitButtonVisibility({
    leaderboardUseDemoData: false,
    refs,
    qualifiesForBoardSlot: true,
    score: 88,
    scoreSubmitThreshold: 0,
    liveSubmitUsed: true,
    demoSubmitUsed: false,
    submitCooldownRemainingMs: 0,
  });
  assert.equal(refs.leaderboardButton.classList.has("hiddenDisplay"), true);
  assert.equal(refs.leaderboardButton.disabled, true);
});

test("applyLeaderboardSubmitButtonVisibility: shows live submit for acceptable name on slot", () => {
  const refs = mockRefs("Ada");
  applyLeaderboardSubmitButtonVisibility({
    leaderboardUseDemoData: false,
    refs,
    qualifiesForBoardSlot: true,
    score: 88,
    scoreSubmitThreshold: 0,
    liveSubmitUsed: false,
    demoSubmitUsed: false,
    submitCooldownRemainingMs: 0,
  });
  assert.equal(refs.leaderboardButton.classList.has("hiddenDisplay"), false);
  assert.equal(refs.leaderboardButton.disabled, false);
});
