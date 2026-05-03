import test from "node:test";
import assert from "node:assert/strict";
import {
  top10RowsFromPayload,
  leaderboardRowsFromResponse,
  leaderboardPostMessageIndicatesCommit,
  leaderboardPostTreatAsCommitted,
  parsedFetchPayload,
  normalizeLeaderboardRows,
  LEADERBOARD_META_LIVE_PREVIEW,
} from "../js/leaderboard-api.js";
import {
  applyLiveLeaderboardPreviewMerge,
  leaderboardLiveSelfRowIndex,
  leaderboardLiveSubmitNameFallbackRaw,
  mergeDemoRunIntoTop10,
} from "../js/leaderboard-lifecycle.js";
import { leaderboardNumericScore } from "../js/leaderboard-ui-helpers.js";

test("top10RowsFromPayload: Flask GET root array and empty POST object", () => {
  assert.deepEqual(top10RowsFromPayload([]), []);
  assert.deepEqual(top10RowsFromPayload([["a", 1, "t"]]), [["a", 1, "t"]]);
  assert.deepEqual(top10RowsFromPayload({ top_10: [["b", 2, "u"]] }), [["b", 2, "u"]]);
  assert.deepEqual(top10RowsFromPayload({ top10: [["c", 3, "v"]] }), [["c", 3, "v"]]);
  assert.deepEqual(top10RowsFromPayload({ leaderboard: [["d", 4, "w"]] }), [
    ["d", 4, "w"],
  ]);
  assert.deepEqual(top10RowsFromPayload({ message: "x" }), []);
});

test("leaderboardRowsFromResponse: ok GET uses array; ok POST uses top_10", () => {
  const ok = { ok: true };
  assert.deepEqual(leaderboardRowsFromResponse(ok, [["Ada", 88, "star"]], false), [
    ["Ada", 88, "star"],
  ]);
  assert.deepEqual(
    leaderboardRowsFromResponse(
      ok,
      { message: "ok", top_10: [["Ada", 88, "star"]] },
      true
    ),
    [["Ada", 88, "star"]]
  );
});

test("leaderboardPostMessageIndicatesCommit", () => {
  assert.equal(
    leaderboardPostMessageIndicatesCommit({ message: "Record inserted successfully." }),
    true
  );
  assert.equal(
    leaderboardPostMessageIndicatesCommit({ message: "This record already exists." }),
    true
  );
  assert.equal(
    leaderboardPostMessageIndicatesCommit({ message: "Profanity rejected" }),
    false
  );
  assert.equal(leaderboardPostMessageIndicatesCommit({}), false);
});

test("leaderboardPostTreatAsCommitted", () => {
  assert.equal(leaderboardPostTreatAsCommitted(false, {}, true), false);
  assert.equal(leaderboardPostTreatAsCommitted(true, {}, true), true);
  assert.equal(
    leaderboardPostTreatAsCommitted(true, { message: "Profanity rejected" }, true),
    false
  );
  assert.equal(leaderboardPostTreatAsCommitted(true, { error: "bad" }, true), false);
  assert.equal(
    leaderboardPostTreatAsCommitted(true, { top_10: [["a", 1, "t"]] }, true),
    true
  );
  assert.equal(
    leaderboardPostTreatAsCommitted(
      true,
      { message: "Record inserted successfully." },
      true
    ),
    true
  );
  assert.equal(
    leaderboardPostTreatAsCommitted(
      true,
      { message: "Your score was recorded." },
      true
    ),
    true
  );
});

test("parsedFetchPayload: API Gateway body string", () => {
  assert.deepEqual(parsedFetchPayload({ body: '{"top_10":[],"message":"x"}' }), {
    top_10: [],
    message: "x",
  });
  assert.deepEqual(parsedFetchPayload({ body: "not json" }), {});
});

test("mergeDemoRunIntoTop10: removes prior row same name+score+trophy before insert", () => {
  const base = normalizeLeaderboardRows([
    ["YOU", 88, "blinders"],
    ["TOMMY", 88, "blinders"],
  ]);
  const merged = mergeDemoRunIntoTop10(base, "YOU", 88, "blinders");
  const you888 = merged.filter(
    (r) =>
      String(r[0]).toUpperCase() === "YOU" &&
      r[2] === 88 &&
      String(r[3]).toLowerCase() === "blinders"
  );
  assert.equal(you888.length, 1);
  assert.ok(merged.some((r) => String(r[0]).toUpperCase() === "TOMMY" && r[2] === 88));
});

test("mergeDemoRunIntoTop10: same score preserves API order; new row ranks last among ties", () => {
  const base = normalizeLeaderboardRows([
    ["ALEX", 100, "ZEBRA"],
    ["BETH", 100, "YAK"],
  ]);
  const merged = mergeDemoRunIntoTop10(base, "CARLA", 100, "XRAY");
  const ranks = merged
    .filter((r) => r[0] && leaderboardNumericScore(r) === 100)
    .map((r) => r[0]);
  assert.deepEqual(ranks, ["ALEX", "BETH", "CARLA"]);
});

test("leaderboardLiveSubmitNameFallbackRaw: single matching row when field empty", () => {
  const rows = normalizeLeaderboardRows([["BOB", 50, "Z"]]);
  assert.equal(leaderboardLiveSubmitNameFallbackRaw(rows, "", 50, "Z"), "BOB");
});

test("leaderboardLiveSubmitNameFallbackRaw: disambiguate by preview key when field empty", () => {
  const rows = normalizeLeaderboardRows([
    ["TOMMY", 0, 50, "Z"],
    ["YOU", 0, 50, "Z", LEADERBOARD_META_LIVE_PREVIEW],
  ]);
  assert.equal(leaderboardLiveSubmitNameFallbackRaw(rows, "", 50, "Z"), "YOU");
});

test("leaderboardLiveSelfRowIndex: prefers tagged current-run preview row", () => {
  const rows = normalizeLeaderboardRows([
    ["YOU", 0, 50, "Z"],
    ["TOMMY", 0, 50, "Z"],
    ["YOU", 0, 50, "Z", LEADERBOARD_META_LIVE_PREVIEW],
  ]);
  assert.equal(leaderboardLiveSelfRowIndex(rows, "", 50, "Z"), 2);
  assert.equal(leaderboardLiveSelfRowIndex(rows, "TOMMY", 50, "Z"), 1);
});

test("applyLiveLeaderboardPreviewMerge: keeps API row; adds preview below on same name/score/trophy", () => {
  const norm = normalizeLeaderboardRows([
    ["YOU", 88, "blinders"],
    ["TOMMY", 88, "blinders"],
  ]);
  const merged = applyLiveLeaderboardPreviewMerge(norm, "", 88, "blinders", {
    useDemoData: false,
    liveSubmitUsed: false,
  });
  const youRows = merged.filter(
    (r) => String(r[0]).toUpperCase() === "YOU" && r[2] === 88
  );
  assert.equal(youRows.length, 2);
  const previewIdx = merged.findIndex((r) => r[4] === LEADERBOARD_META_LIVE_PREVIEW);
  const firstYouIdx = merged.findIndex(
    (r) => String(r[0]).toUpperCase() === "YOU" && r[2] === 88 && r.length < 5
  );
  assert.ok(firstYouIdx >= 0 && previewIdx > firstYouIdx);
});

test("applyLiveLeaderboardPreviewMerge: empty GET + qualifying score shows player", () => {
  const norm = normalizeLeaderboardRows([]);
  const merged = applyLiveLeaderboardPreviewMerge(norm, "Ada", 88, "STAR", {
    useDemoData: false,
    liveSubmitUsed: false,
  });
  assert.equal(merged[0][0], "Ada");
  assert.equal(merged[0][2], 88);
  assert.equal(merged.length, 10);
});

test("applyLiveLeaderboardPreviewMerge: skipped after submit or in demo", () => {
  const norm = normalizeLeaderboardRows([]);
  const optsA = { useDemoData: false, liveSubmitUsed: true };
  assert.deepEqual(applyLiveLeaderboardPreviewMerge(norm, "Ada", 88, "X", optsA), norm);
  const optsB = { useDemoData: true, liveSubmitUsed: false };
  assert.deepEqual(applyLiveLeaderboardPreviewMerge(norm, "Ada", 88, "X", optsB), norm);
});

test("normalizeLeaderboardRows: API 3-tuple to internal 4-field row", () => {
  const [r] = normalizeLeaderboardRows([["Ada", 88, "star"]]);
  assert.deepEqual(r, ["Ada", 0, 88, "star"]);
});

test("normalizeLeaderboardRows: preserves live-preview meta when present", () => {
  const [r] = normalizeLeaderboardRows([
    ["Ada", 0, 88, "star", LEADERBOARD_META_LIVE_PREVIEW],
  ]);
  assert.deepEqual(r, ["Ada", 0, 88, "star", LEADERBOARD_META_LIVE_PREVIEW]);
});
