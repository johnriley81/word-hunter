import { NEXT_LETTERS_UI_COUNT, PERFECT_HUNT_WORD_COUNT } from "./config.js";
import { loadWordhunterTextAssets } from "./game-lifecycle.js";

/** Fresh mutable leaderboard UI state bag wired from `game.js` `initGame`. */
export function createPlayerLeaderboardRuntimeState() {
  return {
    demoLeaderboardRows: null,
    liveLeaderboardPreviewRows: null,
    liveLeaderboardEligibilityRows: null,
    demoLeaderboardSubmitUsed: false,
    liveLeaderboardSubmitUsed: false,
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

/** Initial rules overlay copy that depends only on numeric config. */
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

/** Disables start and clears transient queue HUD until puzzles load. */
export function freezePlayerShellBeforeAssets({
  startButton,
  nextLettersElement,
  queueSackCountElement,
}) {
  startButton.disabled = true;
  nextLettersElement.textContent = "";
  if (queueSackCountElement) queueSackCountElement.textContent = "0";
}

/**
 * Fetches puzzles + wordlist. Resolves `null` when puzzles are missing or fetch fails is handled upstream.
 */
/**
 * @returns {Promise<{ wordSet: Set<string>; puzzles: unknown[] } | { error: string }>}
 */
export async function loadPlayerWordhunterAssetBundle() {
  const loaded = await loadWordhunterTextAssets();
  if (!loaded.ok) {
    console.error("[word-hunter] asset load failed:", loaded.error);
    return { error: loaded.error };
  }
  return { wordSet: loaded.wordSet, puzzles: loaded.puzzles };
}
