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
  runQualifiesForLeaderboardTop10,
  leaderboardLiveSelfRowIndex,
  leaderboardLiveSubmitNameFallbackRaw,
  mergeRunIntoTop10,
  stripLiveLeaderboardPreviewRows,
} from "../js/leaderboard-lifecycle.js";
import { isLeaderboardNameAcceptable } from "../js/leaderboard-name-policy.js";
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

test("mergeRunIntoTop10: removes prior row same name+score+trophy before insert", () => {
  const base = normalizeLeaderboardRows([
    ["YOU", 88, "blinders"],
    ["TOMMY", 88, "blinders"],
  ]);
  const merged = mergeRunIntoTop10(base, "YOU", 88, "blinders");
  const you888 = merged.filter(
    (r) =>
      String(r[0]).toUpperCase() === "YOU" &&
      r[2] === 88 &&
      String(r[3]).toLowerCase() === "blinders"
  );
  assert.equal(you888.length, 1);
  assert.ok(merged.some((r) => String(r[0]).toUpperCase() === "TOMMY" && r[2] === 88));
});

test("mergeRunIntoTop10: same score preserves API order; new row ranks last among ties", () => {
  const base = normalizeLeaderboardRows([
    ["ALEX", 100, "ZEBRA"],
    ["BETH", 100, "YAK"],
  ]);
  const merged = mergeRunIntoTop10(base, "CARLA", 100, "XRAY");
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
    ["", 0, 50, "Z", LEADERBOARD_META_LIVE_PREVIEW],
  ]);
  assert.equal(leaderboardLiveSubmitNameFallbackRaw(rows, "", 50, "Z"), "");
});

test("leaderboardLiveSelfRowIndex: prefers tagged current-run preview row", () => {
  const rows = normalizeLeaderboardRows([
    ["ALICE", 0, 50, "Z"],
    ["BOB", 0, 50, "Z"],
    ["", 0, 50, "Z", LEADERBOARD_META_LIVE_PREVIEW],
  ]);
  assert.equal(leaderboardLiveSelfRowIndex(rows, "", 50, "Z"), 2);
  assert.equal(leaderboardLiveSelfRowIndex(rows, "BOB", 50, "Z"), 1);
});

test("applyLiveLeaderboardPreviewMerge: empty player name still adds preview row", () => {
  const norm = normalizeLeaderboardRows([
    ["YOU", 88, "blinders"],
    ["TOMMY", 88, "blinders"],
  ]);
  const merged = applyLiveLeaderboardPreviewMerge(norm, "", 88, "blinders", {
    useDemoData: false,
    liveSubmitUsed: false,
  });
  const preview = merged.find((r) => r[4] === LEADERBOARD_META_LIVE_PREVIEW);
  assert.ok(preview);
  assert.equal(String(preview[0] ?? "").trim(), "");
  assert.equal(preview[2], 88);
  assert.equal(String(preview[3] ?? "").toLowerCase(), "blinders");
});

test("runQualifiesForLeaderboardTop10: beat 10th score only (tie does not qualify)", () => {
  const base = normalizeLeaderboardRows(
    Array.from({ length: 10 }, (_, i) => [`P${i}`, 100 - i * 10, "T"])
  );
  assert.equal(runQualifiesForLeaderboardTop10(base, 10), false);
  assert.equal(runQualifiesForLeaderboardTop10(base, 11), true);
  assert.equal(runQualifiesForLeaderboardTop10(base, 9), false);
});

test("applyLiveLeaderboardPreviewMerge: empty GET + qualifying score shows player", () => {
  const norm = normalizeLeaderboardRows([]);
  const merged = applyLiveLeaderboardPreviewMerge(norm, "Ada", 88, "STAR", {
    useDemoData: false,
    liveSubmitUsed: false,
  });
  assert.equal(merged[0][0], "ADA");
  assert.equal(merged[0][2], 88);
  assert.equal(merged.length, 10);
});

test("stripLiveLeaderboardPreviewRows: removes tagged preview only", () => {
  const rows = normalizeLeaderboardRows([
    ["Ada", 0, 88, "star"],
    ["", 0, 88, "star", LEADERBOARD_META_LIVE_PREVIEW],
  ]);
  const stripped = stripLiveLeaderboardPreviewRows(rows);
  assert.equal(stripped.length, 1);
  assert.equal(stripped[0][0], "Ada");
});

test("applyLiveLeaderboardPreviewMerge: prohibited name shows preview before submit", () => {
  const norm = normalizeLeaderboardRows([
    ["YOU", 88, "blinders"],
    ["", 0, 88, "blinders", LEADERBOARD_META_LIVE_PREVIEW],
  ]);
  assert.equal(isLeaderboardNameAcceptable("FUCK"), false);
  const merged = applyLiveLeaderboardPreviewMerge(norm, "fuck", 88, "blinders", {
    useDemoData: false,
    liveSubmitUsed: false,
  });
  const preview = merged.find((r) => r[4] === LEADERBOARD_META_LIVE_PREVIEW);
  assert.ok(preview);
  assert.equal(preview[0], "FUCK");
});

test("applyLiveLeaderboardPreviewMerge: skipped after lost turn (liveSubmitUsed)", () => {
  const norm = normalizeLeaderboardRows([
    ["YOU", 88, "blinders"],
    ["FUCK", 0, 88, "blinders", LEADERBOARD_META_LIVE_PREVIEW],
  ]);
  const merged = applyLiveLeaderboardPreviewMerge(norm, "fuck", 88, "blinders", {
    useDemoData: false,
    liveSubmitUsed: true,
  });
  assert.deepEqual(merged, norm);
  const stripped = stripLiveLeaderboardPreviewRows(merged);
  assert.equal(
    stripped.find((r) => r[4] === LEADERBOARD_META_LIVE_PREVIEW),
    undefined
  );
});

test("applyLiveLeaderboardPreviewMerge: acceptable name restores preview after strip", () => {
  const norm = normalizeLeaderboardRows([["TOMMY", 88, "blinders"]]);
  const merged = applyLiveLeaderboardPreviewMerge(norm, "Ada", 88, "blinders", {
    useDemoData: false,
    liveSubmitUsed: false,
  });
  const preview = merged.find((r) => r[4] === LEADERBOARD_META_LIVE_PREVIEW);
  assert.ok(preview);
  assert.equal(preview[0], "ADA");
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

test("normalizeLeaderboardRows: legacy 4-tuple hard slot coerced to 0", () => {
  const [r] = normalizeLeaderboardRows([["Ada", 1, 88, "star"]]);
  assert.deepEqual(r, ["Ada", 0, 88, "star"]);
});

test("normalizeLeaderboardRows: preserves live-preview meta when present", () => {
  const [r] = normalizeLeaderboardRows([
    ["Ada", 0, 88, "star", LEADERBOARD_META_LIVE_PREVIEW],
  ]);
  assert.deepEqual(r, ["Ada", 0, 88, "star", LEADERBOARD_META_LIVE_PREVIEW]);
});
