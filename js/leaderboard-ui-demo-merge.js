import {
  LEADERBOARD_USE_DEMO_DATA,
  LEADERBOARD_DEMO_EMPTY_BOARD,
  LEADERBOARD_DEMO_INJECT_PERFECT_HUNT_ROW,
  LEADERBOARD_DEMO_INJECT_OVER_PERFECT_HUNT_ROW,
  LEADERBOARD_DEMO_OVER_PERFECT_SCORE_EXTRA,
} from "./config.js";
import { mergeDemoRunIntoTop10 } from "./leaderboard-lifecycle.js";
import { leaderboardNumericScore } from "./leaderboard-ui-helpers.js";

/** Demo-only row injection for perfect / over-perfect hunt preview (see config flags). */
export function mergeDemoLeaderboardPreviewRows(leaderboard, perfectTargetSum) {
  if (!LEADERBOARD_USE_DEMO_DATA) return leaderboard;
  if (LEADERBOARD_DEMO_EMPTY_BOARD) {
    return leaderboard;
  }
  const target = perfectTargetSum;
  if (target == null || !Number.isFinite(target)) return leaderboard;
  let rows = leaderboard;
  if (LEADERBOARD_DEMO_INJECT_PERFECT_HUNT_ROW) {
    const hasPerfect = rows.some(
      (r) =>
        String(r[0] || "")
          .trim()
          .toUpperCase() === "PERFECT" &&
        Number(r[2]) === target &&
        String(r[3] || "")
          .trim()
          .toUpperCase() === "PERFECT HUNT"
    );
    if (!hasPerfect) {
      rows = mergeDemoRunIntoTop10(rows, "PERFECT", target, "PERFECT HUNT");
    }
  }
  if (LEADERBOARD_DEMO_INJECT_OVER_PERFECT_HUNT_ROW) {
    const extra = Math.max(1, Number(LEADERBOARD_DEMO_OVER_PERFECT_SCORE_EXTRA) || 1);
    const overScore = target + extra;
    const hasOver = rows.some((r) => {
      const n = leaderboardNumericScore(r);
      return (
        n != null &&
        n > target &&
        String(r[0] || "")
          .trim()
          .toUpperCase() === "TOOHIGH"
      );
    });
    if (!hasOver) {
      rows = mergeDemoRunIntoTop10(rows, "TOOHIGH", overScore, "HOW??");
    }
  }
  return rows;
}
