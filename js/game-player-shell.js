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
export async function loadPlayerWordhunterAssetBundle() {
  try {
    const { wordSet, puzzles } = await loadWordhunterTextAssets();
    if (!puzzles.length) {
      console.error("text/puzzles.txt has no puzzle rows");
      return null;
    }
    return { wordSet, puzzles };
  } catch (error) {
    console.error("Fetch error:", error);
    return null;
  }
}
