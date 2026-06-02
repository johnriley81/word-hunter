import test from "node:test";
import assert from "node:assert/strict";
import {
  LEADERBOARD_SUBMIT_COOLDOWN_MS,
  leaderboardSubmitCooldownRemainingMs,
  clearLiveLeaderboardSubmitCooldown,
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

test("submit cooldown duration matches leaderboard fetch cache", () => {
  assert.equal(LEADERBOARD_SUBMIT_COOLDOWN_MS, LEADERBOARD_FETCH_CACHE_MS);
});

test("clearLiveLeaderboardSubmitCooldown clears timestamp", () => {
  const st = {
    liveLeaderboardSubmitCooldownAt: Date.now(),
    liveLeaderboardSubmitCooldownTimer: null,
  };
  clearLiveLeaderboardSubmitCooldown(st);
  assert.equal(st.liveLeaderboardSubmitCooldownAt, null);
  assert.equal(st.liveLeaderboardSubmitCooldownTimer, null);
});
