import test from "node:test";
import assert from "node:assert/strict";
import { SCORE_SUBMIT_THRESHOLD } from "../js/config.js";
import { deriveLiveLeaderboardAfterFetch } from "../js/leaderboard-live-flow.js";
import { normalizeLeaderboardRows } from "../js/leaderboard-api.js";
import { demoRunQualifiesForLeaderboard } from "../js/leaderboard-lifecycle.js";

const EMPTY_PAD = ["", 0, "", ""];

const baseInput = {
  scoreThreshold: SCORE_SUBMIT_THRESHOLD,
  useDemoData: false,
  liveSubmitUsed: false,
  trophyWord: "STAR",
};

test("GET [] + qualifying run: preview merge shows player at row 1", () => {
  const { tableRows, committed, canPost } = deriveLiveLeaderboardAfterFetch(
    { ok: true, raw: [] },
    {
      ...baseInput,
      clicked: false,
      score: 88,
      nameTrim: "Ada",
    }
  );
  assert.equal(canPost, false);
  assert.equal(committed, false);
  assert.equal(tableRows[0][0], "Ada");
  assert.equal(tableRows[0][2], 88);
});

test("clicked at minimum score: no POST, no preview merge on GET []", () => {
  const { tableRows, committed, canPost } = deriveLiveLeaderboardAfterFetch(
    { ok: true, raw: [] },
    {
      ...baseInput,
      clicked: true,
      score: SCORE_SUBMIT_THRESHOLD,
      nameTrim: "Ada",
    }
  );
  assert.equal(canPost, false);
  assert.equal(committed, false);
  assert.equal(tableRows.length, 0);
});

test("GET [] + score 1: preview merge shows player (above minimum)", () => {
  const { tableRows, canPost } = deriveLiveLeaderboardAfterFetch(
    { ok: true, raw: [] },
    {
      ...baseInput,
      clicked: false,
      score: 1,
      nameTrim: "Ada",
    }
  );
  assert.equal(canPost, false);
  assert.equal(tableRows[0][0], "Ada");
  assert.equal(tableRows[0][2], 1);
});

test("clicked but empty name: canPost false, preview merge", () => {
  const { canPost, committed, tableRows } = deriveLiveLeaderboardAfterFetch(
    { ok: true, raw: [] },
    {
      ...baseInput,
      clicked: true,
      score: 88,
      nameTrim: "   ",
    }
  );
  assert.equal(canPost, false);
  assert.equal(committed, false);
  assert.equal(tableRows[0][2], 88);
});

test("POST success + commit message: rows from top_10, committed", () => {
  const top10 = [
    ["Bob", 100, "zzz"],
    ["Ada", 88, "STAR"],
  ];
  const raw = {
    message: "Record inserted successfully.",
    top_10: top10,
  };
  const { tableRows, committed, canPost } = deriveLiveLeaderboardAfterFetch(
    { ok: true, raw },
    {
      ...baseInput,
      clicked: true,
      score: 88,
      nameTrim: "Ada",
    }
  );
  assert.equal(canPost, true);
  assert.equal(committed, true);
  assert.equal(tableRows.length, 10);
  assert.deepEqual(tableRows[0], ["Bob", 0, 100, "zzz"]);
  assert.deepEqual(tableRows[1], ["Ada", 0, 88, "STAR"]);
  assert.deepEqual(tableRows.slice(2), Array(8).fill(EMPTY_PAD));
});

test("POST 200 soft-fail message: not committed, still returns top_10", () => {
  const top10 = [["Ada", 88, "STAR"]];
  const { tableRows, committed } = deriveLiveLeaderboardAfterFetch(
    { ok: true, raw: { message: "Profanity rejected", top_10: top10 } },
    {
      ...baseInput,
      clicked: true,
      score: 88,
      nameTrim: "Ada",
    }
  );
  assert.equal(committed, false);
  assert.equal(tableRows.length, 10);
  assert.deepEqual(tableRows[0], normalizeLeaderboardRows(top10)[0]);
  assert.deepEqual(tableRows.slice(1), Array(9).fill(EMPTY_PAD));
});

test("POST !ok with empty payload: preview fallback, not committed", () => {
  const { tableRows, committed } = deriveLiveLeaderboardAfterFetch(
    { ok: false, status: 400, raw: {} },
    {
      ...baseInput,
      clicked: true,
      score: 88,
      nameTrim: "Ada",
    }
  );
  assert.equal(committed, false);
  assert.equal(tableRows.length, 10);
  assert.equal(tableRows[0][0], "Ada");
});

test("POST 200 root JSON array (same as GET): populates table from response only", () => {
  const rows = [
    ["Zoe", 90, "SUN"],
    ["Ada", 88, "STAR"],
  ];
  const { tableRows, committed, canPost } = deriveLiveLeaderboardAfterFetch(
    { ok: true, raw: rows },
    {
      ...baseInput,
      clicked: true,
      score: 88,
      nameTrim: "Ada",
    }
  );
  assert.equal(canPost, true);
  assert.equal(committed, true);
  assert.equal(tableRows.length, 10);
  assert.deepEqual(tableRows[0], ["Zoe", 0, 90, "SUN"]);
  assert.deepEqual(tableRows[1], ["Ada", 0, 88, "STAR"]);
  assert.deepEqual(tableRows.slice(2), Array(8).fill(EMPTY_PAD));
});

test("POST 200 empty object: committed; rows only from server (empty here)", () => {
  const { tableRows, committed, canPost } = deriveLiveLeaderboardAfterFetch(
    { ok: true, raw: {} },
    {
      ...baseInput,
      clicked: true,
      score: 88,
      nameTrim: "Ada",
    }
  );
  assert.equal(canPost, true);
  assert.equal(committed, true);
  assert.deepEqual(tableRows, []);
});

test("Lambda API Gateway envelope: parse body then same commit + rows", () => {
  const top10 = [["Ada", 88, "STAR"]];
  const inner = {
    message: "Record inserted successfully.",
    top_10: top10,
  };
  const { tableRows, committed } = deriveLiveLeaderboardAfterFetch(
    { ok: true, raw: { body: JSON.stringify(inner) } },
    {
      ...baseInput,
      clicked: true,
      score: 88,
      nameTrim: "Ada",
    }
  );
  assert.equal(committed, true);
  assert.equal(tableRows.length, 10);
  assert.deepEqual(tableRows[0], ["Ada", 0, 88, "STAR"]);
  assert.deepEqual(tableRows.slice(1), Array(9).fill(EMPTY_PAD));
});

test("derive: submit cutoff uses GET board before preview merge", () => {
  const raw = Array.from({ length: 10 }, (_, i) => [`N${i}`, 200 - i * 10, "STAR"]);
  const { tableRows, eligibilityRows } = deriveLiveLeaderboardAfterFetch(
    { ok: true, raw },
    {
      ...baseInput,
      clicked: false,
      score: 115,
      nameTrim: "",
      trophyWord: "STAR",
    }
  );
  assert.equal(eligibilityRows[9][2], 110);
  assert.ok(demoRunQualifiesForLeaderboard(eligibilityRows, 115));
  assert.equal(tableRows[9][2], 115);
  assert.equal(demoRunQualifiesForLeaderboard(tableRows, 115), false);
});
