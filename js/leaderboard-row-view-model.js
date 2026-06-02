import { LEADERBOARD_META_LIVE_PREVIEW } from "./leaderboard-api.js";
import {
  leaderboardPreviewNameKey,
  sanitizeLeaderboardName,
} from "./leaderboard-lifecycle.js";
import {
  leaderboardNumericScore,
  rowPerfectOverFlags,
} from "./leaderboard-ui-helpers.js";

export const LB_SELF_ROW_FG = "var(--leaderboard-self-row-highlight-color)";
export const LB_TABLE_DEFAULT_FG = "var(--leaderboard-table-text-color)";

/**
 * @typedef {Object} LeaderboardRowViewModel
 * @property {number} index
 * @property {string} positionDisplay
 * @property {string} displayNameCell
 * @property {string} displayScoreCell
 * @property {string} displayTrophyCell
 * @property {"perfect"|"over"|null} nameTrophyFlash
 * @property {boolean} highlightSelfRow
 * @property {boolean} useInlineNameCell
 * @property {string} rowColor
 * @property {boolean} isLiveCurrentRunPreviewRow
 */

export function createLeaderboardRowRenderContext({
  useDemoData,
  demoSubmitUsed,
  turnSpent,
  typedPlayerName,
  runScore,
  runTrophyWord,
  perfectTarget,
}) {
  return {
    useDemoData,
    demoSubmitUsed,
    liveTurnSpent: turnSpent,
    typedPlayerName: String(typedPlayerName ?? ""),
    perfectTarget: perfectTarget ?? null,
    runScoreNum: Number(runScore),
    runTrophyWord: String(runTrophyWord || ""),
  };
}

/**
 * @param {unknown[][]} rows
 * @param {ReturnType<typeof createLeaderboardRowRenderContext>} ctx
 * @returns {{ viewModels: LeaderboardRowViewModel[]; playerPosition: number | undefined }}
 */
export function buildLeaderboardRowViewModels(rows, ctx) {
  const typedPlayerName = String(ctx.typedPlayerName || "").trim();
  const typedCanonical = String(
    sanitizeLeaderboardName(typedPlayerName) || typedPlayerName
  ).trim();
  const previewNameKey = leaderboardPreviewNameKey(ctx.typedPlayerName);
  const runTrophyWord = String(ctx.runTrophyWord || "").trim();
  const perfectTarget = ctx.perfectTarget ?? null;
  const runScoreNum = Number(ctx.runScoreNum);
  const turnSpent = ctx.liveTurnSpent;

  /** @type {LeaderboardRowViewModel[]} */
  const viewModels = [];
  let playerPosition;

  rows.forEach((row, index) => {
    const [playerRaw, , , rowTrophy] = row;
    let color = LB_TABLE_DEFAULT_FG;

    const playerStr = String(playerRaw || "").trim();
    const scoreNum = leaderboardNumericScore(row);
    const hasScore = scoreNum !== null;
    const { isPerfectHuntScore, isAbovePerfectHunt } = rowPerfectOverFlags(
      perfectTarget,
      row
    );
    const trophyStr = String(rowTrophy || "").trim();
    const trophyMatches = trophyStr === runTrophyWord;
    const isDemoSelfRow =
      ctx.useDemoData &&
      hasScore &&
      Number.isFinite(runScoreNum) &&
      scoreNum === runScoreNum &&
      trophyMatches;
    const sameScoreAndTrophyAsRun =
      hasScore &&
      Number.isFinite(runScoreNum) &&
      scoreNum === runScoreNum &&
      trophyMatches;
    const rowPreviewNameKey = leaderboardPreviewNameKey(playerStr);
    const isLiveStatsAndNameMatch =
      sameScoreAndTrophyAsRun && rowPreviewNameKey === previewNameKey;
    const isLiveCurrentRunPreviewRow =
      isLiveStatsAndNameMatch && row[4] === LEADERBOARD_META_LIVE_PREVIEW;
    const isLiveInlineSelfRow =
      !ctx.useDemoData && !turnSpent && isLiveCurrentRunPreviewRow;
    const isLiveSubmittedSelfRow =
      !ctx.useDemoData && turnSpent && isLiveStatsAndNameMatch;
    const playerCanonical = String(
      sanitizeLeaderboardName(playerStr) || playerStr
    ).trim();
    const nameMatches =
      Boolean(typedCanonical) &&
      Boolean(playerCanonical) &&
      playerCanonical === typedCanonical;
    const scoreMatches =
      scoreNum !== null && Number.isFinite(runScoreNum) && scoreNum === runScoreNum;
    const nameMatchesHighlight =
      nameMatches &&
      scoreMatches &&
      trophyMatches &&
      (ctx.useDemoData ||
        (rowPreviewNameKey === previewNameKey &&
          (turnSpent || row[4] === LEADERBOARD_META_LIVE_PREVIEW)));

    const displayNameCell = playerStr || "";
    const displayScoreCell = scoreNum === null ? "" : String(scoreNum);
    const displayTrophyCell = isPerfectHuntScore ? "PERFECT HUNT" : trophyStr || "";
    const nameTrophyFlash = isPerfectHuntScore
      ? "perfect"
      : isAbovePerfectHunt
        ? "over"
        : null;

    const useInlineNameCell =
      (isDemoSelfRow && !ctx.demoSubmitUsed) || isLiveInlineSelfRow;

    const highlightSelfRow =
      isDemoSelfRow ||
      isLiveInlineSelfRow ||
      isLiveSubmittedSelfRow ||
      nameMatchesHighlight;

    if (highlightSelfRow) {
      playerPosition = index + 1;
      color = LB_SELF_ROW_FG;
    }

    viewModels.push({
      index,
      positionDisplay: `${index + 1}.`,
      displayNameCell,
      displayScoreCell,
      displayTrophyCell,
      nameTrophyFlash,
      highlightSelfRow,
      useInlineNameCell,
      rowColor: color,
      isLiveCurrentRunPreviewRow,
    });
  });

  return { viewModels, playerPosition };
}
