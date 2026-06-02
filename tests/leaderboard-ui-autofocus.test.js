import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isDesktopFinePointerForAutofocus,
  shouldAutofocusLeaderboardNameEntry,
} from "../js/leaderboard-ui-autofocus.js";

function mockMatchMedia(matches) {
  return (query) => ({
    matches,
    media: query,
  });
}

test("isDesktopFinePointerForAutofocus: true for fine pointer + hover", () => {
  assert.equal(isDesktopFinePointerForAutofocus(mockMatchMedia(true)), true);
});

test("isDesktopFinePointerForAutofocus: false for coarse pointer", () => {
  assert.equal(isDesktopFinePointerForAutofocus(mockMatchMedia(false)), false);
});

test("isDesktopFinePointerForAutofocus: false when matchMedia missing", () => {
  assert.equal(isDesktopFinePointerForAutofocus(undefined), false);
});

test("shouldAutofocusLeaderboardNameEntry: live desktop with qualifying score", () => {
  assert.equal(
    shouldAutofocusLeaderboardNameEntry({
      leaderboardUseDemoData: false,
      liveTurnSpent: false,
      playerNameValue: "",
      submitCooldownRemainingMs: 0,
      runScore: 100,
      scoreSubmitThreshold: 0,
      matchMedia: mockMatchMedia(true),
    }),
    true
  );
});

test("shouldAutofocusLeaderboardNameEntry: skips demo mode", () => {
  assert.equal(
    shouldAutofocusLeaderboardNameEntry({
      leaderboardUseDemoData: true,
      liveTurnSpent: false,
      playerNameValue: "",
      runScore: 100,
      scoreSubmitThreshold: 0,
      matchMedia: mockMatchMedia(true),
    }),
    false
  );
});

test("shouldAutofocusLeaderboardNameEntry: skips mobile coarse pointer", () => {
  assert.equal(
    shouldAutofocusLeaderboardNameEntry({
      leaderboardUseDemoData: false,
      liveTurnSpent: false,
      playerNameValue: "",
      runScore: 100,
      scoreSubmitThreshold: 0,
      matchMedia: mockMatchMedia(false),
    }),
    false
  );
});

test("shouldAutofocusLeaderboardNameEntry: skips cooldown when name empty", () => {
  assert.equal(
    shouldAutofocusLeaderboardNameEntry({
      leaderboardUseDemoData: false,
      liveTurnSpent: false,
      playerNameValue: "",
      submitCooldownRemainingMs: 45_000,
      runScore: 100,
      scoreSubmitThreshold: 0,
      matchMedia: mockMatchMedia(true),
    }),
    false
  );
});

test("shouldAutofocusLeaderboardNameEntry: allows cooldown when name present", () => {
  assert.equal(
    shouldAutofocusLeaderboardNameEntry({
      leaderboardUseDemoData: false,
      liveTurnSpent: false,
      playerNameValue: "Ada",
      submitCooldownRemainingMs: 45_000,
      runScore: 100,
      scoreSubmitThreshold: 0,
      matchMedia: mockMatchMedia(true),
    }),
    true
  );
});

test("shouldAutofocusLeaderboardNameEntry: skips when user already in input", () => {
  assert.equal(
    shouldAutofocusLeaderboardNameEntry({
      leaderboardUseDemoData: false,
      liveTurnSpent: false,
      playerNameValue: "",
      runScore: 100,
      scoreSubmitThreshold: 0,
      activeElement: { tagName: "INPUT", isContentEditable: false },
      matchMedia: mockMatchMedia(true),
    }),
    false
  );
});

test("shouldAutofocusLeaderboardNameEntry: skips when name rejected", () => {
  assert.equal(
    shouldAutofocusLeaderboardNameEntry({
      leaderboardUseDemoData: false,
      liveTurnSpent: false,
      liveNameRejected: true,
      playerNameValue: "",
      runScore: 100,
      scoreSubmitThreshold: 0,
      matchMedia: mockMatchMedia(true),
    }),
    false
  );
});
