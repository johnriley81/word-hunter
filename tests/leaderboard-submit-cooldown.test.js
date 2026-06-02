import test from "node:test";
import assert from "node:assert/strict";
import {
  LEADERBOARD_SUBMIT_COOLDOWN_MS,
  LEADERBOARD_SUBMIT_COOLDOWN_STORAGE_PREFIX,
  LEADERBOARD_SUBMIT_BUTTON_LABEL,
  leaderboardSubmitCooldownRemainingMs,
  formatLeaderboardSubmitCooldownLabel,
  leaderboardSubmitCooldownStorageKey,
  readPersistedLeaderboardSubmitAt,
  writePersistedLeaderboardSubmitAt,
  clearPersistedLeaderboardSubmitAt,
  syncLiveLeaderboardSubmitCooldown,
  clearLiveLeaderboardSubmitCooldown,
  applyLeaderboardSubmitButtonVisibility,
} from "../js/leaderboard-ui-submit-visibility.js";
import { LEADERBOARD_FETCH_CACHE_MS } from "../js/leaderboard-client.js";

test("leaderboardSubmitCooldownRemainingMs: null or invalid yields 0", () => {
  const now = 1_700_000_000_000;
  assert.equal(leaderboardSubmitCooldownRemainingMs(null, now), 0);
  assert.equal(leaderboardSubmitCooldownRemainingMs(undefined, now), 0);
  assert.equal(leaderboardSubmitCooldownRemainingMs(Number.NaN, now), 0);
});

test("leaderboardSubmitCooldownRemainingMs: counts down within window", () => {
  const now = 1_700_000_000_000;
  assert.equal(
    leaderboardSubmitCooldownRemainingMs(now - 5_000, now),
    LEADERBOARD_SUBMIT_COOLDOWN_MS - 5_000
  );
  assert.equal(
    leaderboardSubmitCooldownRemainingMs(now - LEADERBOARD_SUBMIT_COOLDOWN_MS, now),
    0
  );
  assert.equal(
    leaderboardSubmitCooldownRemainingMs(now - LEADERBOARD_SUBMIT_COOLDOWN_MS - 1, now),
    0
  );
});

test("formatLeaderboardSubmitCooldownLabel: :SS under one minute, M:SS after", () => {
  assert.equal(formatLeaderboardSubmitCooldownLabel(60_000), ":60");
  assert.equal(formatLeaderboardSubmitCooldownLabel(45_000), ":45");
  assert.equal(formatLeaderboardSubmitCooldownLabel(12_000), ":12");
  assert.equal(formatLeaderboardSubmitCooldownLabel(1_000), ":01");
  assert.equal(formatLeaderboardSubmitCooldownLabel(500), ":01");
  assert.equal(formatLeaderboardSubmitCooldownLabel(0), ":00");
  assert.equal(formatLeaderboardSubmitCooldownLabel(90_000), "1:30");
});

test("submit at t=0, endgame at t=45: button disabled with 15s cooldown left", () => {
  const submitAt = 1_700_000_000_000;
  const endgameAt = submitAt + 45_000;
  const remaining = leaderboardSubmitCooldownRemainingMs(submitAt, endgameAt);
  assert.equal(remaining, 15_000);

  const leaderboardButton = {
    classList: {
      _set: new Set(["hiddenDisplay", "leaderboard-action--concealed"]),
      add(c) {
        this._set.add(c);
      },
      remove(c) {
        this._set.delete(c);
      },
      toggle(c, on) {
        if (on) this._set.add(c);
        else this._set.delete(c);
      },
      has(c) {
        return this._set.has(c);
      },
    },
    disabled: false,
    textContent: LEADERBOARD_SUBMIT_BUTTON_LABEL,
    style: { backgroundColor: "", removeProperty() {} },
  };

  applyLeaderboardSubmitButtonVisibility({
    leaderboardUseDemoData: false,
    refs: {
      leaderboardButton,
      leaderboardDemoAdd: null,
      playerName: { value: "Ada" },
    },
    qualifiesForBoardSlot: true,
    score: 88,
    scoreSubmitThreshold: 0,
    liveSubmitUsed: false,
    demoSubmitUsed: false,
    submitCooldownRemainingMs: remaining,
  });

  assert.equal(leaderboardButton.classList.has("hiddenDisplay"), false);
  assert.equal(leaderboardButton.disabled, true);
  assert.equal(leaderboardButton.style.backgroundColor, "rgba(95, 95, 95, 0.92)");
  assert.equal(leaderboardButton.textContent, ":15");
});

test("applyLeaderboardSubmitButtonVisibility: restores SUBMIT when cooldown inactive", () => {
  const leaderboardButton = {
    classList: {
      _set: new Set(),
      add(c) {
        this._set.add(c);
      },
      remove(c) {
        this._set.delete(c);
      },
      toggle(c, on) {
        if (on) this._set.add(c);
        else this._set.delete(c);
      },
      has(c) {
        return this._set.has(c);
      },
    },
    disabled: true,
    textContent: ":01",
    style: { backgroundColor: "gray", removeProperty() {} },
  };

  applyLeaderboardSubmitButtonVisibility({
    leaderboardUseDemoData: false,
    refs: {
      leaderboardButton,
      leaderboardDemoAdd: null,
      playerName: { value: "Ada" },
    },
    qualifiesForBoardSlot: true,
    score: 88,
    scoreSubmitThreshold: 0,
    liveSubmitUsed: false,
    demoSubmitUsed: false,
    submitCooldownRemainingMs: 0,
  });

  assert.equal(leaderboardButton.disabled, false);
  assert.equal(leaderboardButton.textContent, LEADERBOARD_SUBMIT_BUTTON_LABEL);
});

function mockLeaderboardButton(initialHidden = false) {
  return {
    classList: {
      _set: new Set(
        initialHidden ? ["hiddenDisplay", "leaderboard-action--concealed"] : []
      ),
      add(c) {
        this._set.add(c);
      },
      remove(c) {
        this._set.delete(c);
      },
      toggle(c, on) {
        if (on) this._set.add(c);
        else this._set.delete(c);
      },
      has(c) {
        return this._set.has(c);
      },
    },
    disabled: false,
    textContent: LEADERBOARD_SUBMIT_BUTTON_LABEL,
    style: { backgroundColor: "", removeProperty() {} },
  };
}

test("Scenario A: current-run submit hides button despite active cooldown", () => {
  const leaderboardButton = mockLeaderboardButton();

  applyLeaderboardSubmitButtonVisibility({
    leaderboardUseDemoData: false,
    refs: {
      leaderboardButton,
      leaderboardDemoAdd: null,
      playerName: { value: "Ada" },
    },
    qualifiesForBoardSlot: true,
    score: 88,
    scoreSubmitThreshold: 0,
    liveSubmitUsed: true,
    demoSubmitUsed: false,
    submitCooldownRemainingMs: 45_000,
  });

  assert.equal(leaderboardButton.classList.has("hiddenDisplay"), true);
  assert.equal(leaderboardButton.textContent, LEADERBOARD_SUBMIT_BUTTON_LABEL);
  assert.equal(leaderboardButton.style.backgroundColor, "");
});

test("Scenario B: new run within cooldown shows countdown until expired", () => {
  const leaderboardButton = mockLeaderboardButton(true);

  applyLeaderboardSubmitButtonVisibility({
    leaderboardUseDemoData: false,
    refs: {
      leaderboardButton,
      leaderboardDemoAdd: null,
      playerName: { value: "Ada" },
    },
    qualifiesForBoardSlot: true,
    score: 88,
    scoreSubmitThreshold: 0,
    liveSubmitUsed: false,
    demoSubmitUsed: false,
    submitCooldownRemainingMs: 15_000,
  });

  assert.equal(leaderboardButton.classList.has("hiddenDisplay"), false);
  assert.equal(leaderboardButton.disabled, true);
  assert.equal(leaderboardButton.textContent, ":15");
});

test("submit cooldown duration matches leaderboard fetch cache", () => {
  assert.equal(LEADERBOARD_SUBMIT_COOLDOWN_MS, LEADERBOARD_FETCH_CACHE_MS);
});

test("leaderboardSubmitCooldownStorageKey is keyed by puzzle id", () => {
  assert.equal(
    leaderboardSubmitCooldownStorageKey(42),
    `${LEADERBOARD_SUBMIT_COOLDOWN_STORAGE_PREFIX}42`
  );
});

function mockStorage() {
  const map = new Map();
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
    removeItem(key) {
      map.delete(key);
    },
  };
}

test("localStorage persistence survives reload simulation within cooldown window", () => {
  const storage = mockStorage();
  const puzzleId = 7;
  const submitAt = 1_700_000_000_000;
  const reloadAt = submitAt + 15_000;

  writePersistedLeaderboardSubmitAt(puzzleId, submitAt, storage);
  const reloaded = readPersistedLeaderboardSubmitAt(puzzleId, reloadAt, storage);
  assert.equal(reloaded, submitAt);
  assert.equal(leaderboardSubmitCooldownRemainingMs(reloaded, reloadAt), 45_000);

  const st = {
    liveLeaderboardSubmitCooldownAt: null,
    liveLeaderboardSubmitCooldownTimer: null,
  };
  syncLiveLeaderboardSubmitCooldown(st, puzzleId, reloadAt, storage);
  assert.equal(st.liveLeaderboardSubmitCooldownAt, submitAt);
});

test("expired persisted cooldown is cleared on read", () => {
  const storage = mockStorage();
  const puzzleId = 9;
  const submitAt = 1_700_000_000_000;
  const afterWindow = submitAt + LEADERBOARD_SUBMIT_COOLDOWN_MS + 1;

  writePersistedLeaderboardSubmitAt(puzzleId, submitAt, storage);
  assert.equal(readPersistedLeaderboardSubmitAt(puzzleId, afterWindow, storage), null);
  assert.equal(storage.getItem(leaderboardSubmitCooldownStorageKey(puzzleId)), null);
});

test("clearLiveLeaderboardSubmitCooldown clears timestamp and optional storage", () => {
  const storage = mockStorage();
  const puzzleId = 3;
  const st = {
    liveLeaderboardSubmitCooldownAt: Date.now(),
    liveLeaderboardSubmitCooldownTimer: null,
  };
  writePersistedLeaderboardSubmitAt(
    puzzleId,
    st.liveLeaderboardSubmitCooldownAt,
    storage
  );
  clearLiveLeaderboardSubmitCooldown(st, puzzleId, storage);
  assert.equal(st.liveLeaderboardSubmitCooldownAt, null);
  assert.equal(st.liveLeaderboardSubmitCooldownTimer, null);
  assert.equal(storage.getItem(leaderboardSubmitCooldownStorageKey(puzzleId)), null);
});

test("syncLiveLeaderboardSubmitCooldown loads null for different puzzle day", () => {
  const storage = mockStorage();
  const submitAt = 1_700_000_000_000;
  writePersistedLeaderboardSubmitAt(1, submitAt, storage);

  const st = {
    liveLeaderboardSubmitCooldownAt: null,
    liveLeaderboardSubmitCooldownTimer: null,
  };
  syncLiveLeaderboardSubmitCooldown(st, 2, submitAt + 5_000, storage);
  assert.equal(st.liveLeaderboardSubmitCooldownAt, null);
});
