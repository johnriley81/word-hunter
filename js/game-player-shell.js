import { NEXT_LETTERS_UI_COUNT, PERFECT_HUNT_WORD_COUNT } from "./config.js";
import { loadWordhunterTextAssets } from "./game-lifecycle.js";

export function createPlayerLeaderboardRuntimeState() {
  return {
    demoLeaderboardRows: null,
    liveLeaderboardPreviewRows: null,
    liveLeaderboardEligibilityRows: null,
    demoLeaderboardSubmitUsed: false,
    liveLeaderboardSubmitUsed: false,
    liveLeaderboardNameRejected: false,
    liveLeaderboardSubmitCooldownAt: null,
    liveLeaderboardSubmitCooldownTimer: null,
    playerPosition: undefined,
    postgameCopyScoreTimer: null,
    leaderboardFadeOutTimer: null,
    endgamePostUiReady: false,
    endgameUiShown: false,
    postgameSequenceStarted: false,
    copyScoreLineUsed: false,
    deferRetryUntilCopyScoreVisible: false,
  };
}

export function hydrateRulesHudCounts(
  rulesNextLettersCountElement,
  rulesPerfectHuntCountElement
) {
  if (rulesNextLettersCountElement) {
    rulesNextLettersCountElement.textContent = String(NEXT_LETTERS_UI_COUNT);
  }
  if (rulesPerfectHuntCountElement) {
    rulesPerfectHuntCountElement.textContent = String(PERFECT_HUNT_WORD_COUNT);
  }
}

export function freezePlayerShellBeforeAssets({
  startButton,
  nextLettersElement,
  queueSackCountElement,
}) {
  startButton.disabled = true;
  nextLettersElement.textContent = "";
  if (queueSackCountElement) queueSackCountElement.textContent = "0";
}

export async function loadPlayerWordhunterAssetBundle() {
  const loaded = await loadWordhunterTextAssets();
  if (!loaded.ok) {
    console.error("[word-hunter] asset load failed:", loaded.error);
    return { error: loaded.error };
  }
  return { wordSet: loaded.wordSet, puzzles: loaded.puzzles };
}
