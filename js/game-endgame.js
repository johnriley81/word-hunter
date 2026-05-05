import {
  ENDGAME_GRID_BATCH_FADE_MS,
  ENDGAME_PAUSE_AFTER_GAME_OVER_MESSAGES_MS,
  ENDGAME_RETRY_REVEAL_DELAY_MS,
  ENDGAME_SOUND_FALLBACK_MS,
  ENDGAME_TILE_TO_INACTIVE_MS,
  GAME_OVER_FLASH_HOLD_EXTRA_MS,
  GAME_OVER_FLASH_TIMES,
  PERFECT_ENDGAME_DEBOUNCE_BEFORE_GAME_OVER_MS,
  PERFECT_HUNT_GAME_OVER_MESSAGE,
  happyHuntingColor,
} from "./config.js";
import { pickRandomScenarioMessage } from "./board-logic.js";
import { clearWordSubmitFeedbackTimer, bumpWordReplaceEpoch } from "./word-drag.js";
import { getTileText, syncConsumedEmptySlotVisual } from "./grid-tiles.js";
import { showMessage, getShowMessageDurationMs } from "./ui-word-line.js";

/**
 * Endgame tile choreography, audio fallback, and grid batch fade before leaderboard post-game UI.
 */
export function createGameEndgameCoordinator(deps) {
  let endgameBlankRestoreFallbackTimer = null;
  let endgameTileStartTimer = null;
  let endgamePostgameRevealDelayTimer = null;
  let perfectGameOverDeferTimer = null;
  let retryRevealDelayTimer = null;

  function clearInternalEndgameTimers() {
    if (endgameBlankRestoreFallbackTimer !== null) {
      window.clearTimeout(endgameBlankRestoreFallbackTimer);
      endgameBlankRestoreFallbackTimer = null;
    }
    if (endgameTileStartTimer !== null) {
      window.clearTimeout(endgameTileStartTimer);
      endgameTileStartTimer = null;
    }
    if (endgamePostgameRevealDelayTimer !== null) {
      window.clearTimeout(endgamePostgameRevealDelayTimer);
      endgamePostgameRevealDelayTimer = null;
    }
    if (perfectGameOverDeferTimer !== null) {
      window.clearTimeout(perfectGameOverDeferTimer);
      perfectGameOverDeferTimer = null;
    }
    if (retryRevealDelayTimer !== null) {
      window.clearTimeout(retryRevealDelayTimer);
      retryRevealDelayTimer = null;
    }
  }

  function onGameOverSoundEndedPostGameUi() {
    if (endgameBlankRestoreFallbackTimer !== null) {
      window.clearTimeout(endgameBlankRestoreFallbackTimer);
      endgameBlankRestoreFallbackTimer = null;
    }
  }

  function triggerEndgameTileExitAnimation() {
    const gridButtonElements = deps.getGridButtons();
    const grid = deps.grid;
    const st = deps.rtState;

    for (let i = 0; i < gridButtonElements.length; i++) {
      const el = gridButtonElements[i];
      if (getTileText(el) === "") {
        el.classList.remove(
          "grid-button--slot-consumed",
          "grid-button--slot-consumed-hunt-pace",
          "grid-button--slot-consumed-instant"
        );
        el.classList.add("grid-button--inactive");
      } else {
        el.classList.remove("selected");
        el.classList.remove(
          "grid-button--word-release-green",
          "grid-button--word-release-hunt-pace",
          "grid-button--slot-consumed",
          "grid-button--slot-consumed-hunt-pace",
          "grid-button--slot-consumed-instant",
          "grid-button--active",
          "grid-button--letter-flip",
          "grid-button--letter-swap-in",
          "grid-button--palette-to-active",
          "grid-button--palette-to-inactive",
          "grid-button--palette-to-active-fade-in"
        );
        el.classList.add("grid-button--inactive");
        el.style.animation = "none";
        el.style.transition = "none";
      }
    }
    void grid.offsetWidth;
    if (endgamePostgameRevealDelayTimer !== null) {
      window.clearTimeout(endgamePostgameRevealDelayTimer);
      endgamePostgameRevealDelayTimer = null;
    }
    grid.style.setProperty(
      "--endgame-grid-batch-fade-ms",
      `${ENDGAME_GRID_BATCH_FADE_MS}ms`
    );
    void grid.offsetWidth;
    grid.classList.add("grid--endgame-final-fade");
    endgamePostgameRevealDelayTimer = window.setTimeout(() => {
      endgamePostgameRevealDelayTimer = null;
      st.endgamePostUiReady = true;
      deps.getLbCtl().maybeShowPostGameUi();
    }, ENDGAME_GRID_BATCH_FADE_MS);
  }

  function endGame(opts = {}) {
    const isPerfectStinger = opts.endgameStinger === "perfect";
    const st = deps.rtState;
    const grid = deps.grid;
    const {
      gridLineContainer,
      doneButton,
      boardShiftZone,
      buttonContainer,
      startButton,
      retryButton,
      playerName,
      leaderboardButton,
      leaderboardDemoAdd,
    } = deps.refs;

    deps.setIsGameActive(false);
    clearWordSubmitFeedbackTimer(deps.ctx);
    bumpWordReplaceEpoch(deps.ctx);
    st.endgamePostUiReady = false;
    st.endgameUiShown = false;
    st.copyScoreLineUsed = false;
    st.postgameSequenceStarted = false;
    if (st.postgameCopyScoreTimer !== null) {
      window.clearTimeout(st.postgameCopyScoreTimer);
      st.postgameCopyScoreTimer = null;
    }
    deps.getLbCtl().hidePostgameLeaderboardOverlay();
    st.demoLeaderboardSubmitUsed = false;
    st.liveLeaderboardSubmitUsed = false;
    st.liveLeaderboardPreviewRows = null;
    st.liveLeaderboardEligibilityRows = null;
    clearInternalEndgameTimers();

    deps.clearTapStreak();

    deps.setRulesOverlayVisible(false);

    grid.classList.remove("grid--endgame-final-fade");
    grid.style.removeProperty("--endgame-grid-batch-fade-ms");

    const buttons = deps.getGridButtons();
    for (let i = 0; i < buttons.length; i++) {
      buttons[i].disabled = true;
      buttons[i].classList.remove("selected");
      buttons[i].classList.remove("grid-button--selected-enter");
      buttons[i].classList.remove(
        "grid-button--invalid-shake",
        "grid-button--word-success",
        "grid-button--word-release-green",
        "grid-button--word-release-hunt-pace",
        "grid-button--letter-flip",
        "grid-button--letter-swap-in",
        "grid-button--slot-consumed",
        "grid-button--slot-consumed-hunt-pace",
        "grid-button--slot-consumed-instant",
        deps.perfectHuntHintClass
      );
      buttons[i].removeAttribute("data-selection-visits");
      buttons[i].style.color = "";
      buttons[i].style.removeProperty("background-color");
      buttons[i].style.removeProperty("border-color");
      buttons[i].style.removeProperty("filter");
      syncConsumedEmptySlotVisual(buttons[i], getTileText(buttons[i]));
    }
    deps.ctx.state.perfectHuntHintFlat = null;
    deps.ctx.state.perfectHuntHintStickyFlat = null;
    deps.runGridTilePaletteTransition("toInactive", ENDGAME_TILE_TO_INACTIVE_MS, () => {
      const tiles = deps.getGridButtons();
      for (let i = 0; i < tiles.length; i++) {
        const el = tiles[i];
        el.classList.remove("grid-button--active");
        el.classList.add("grid-button--inactive");
      }
    });
    if (!isPerfectStinger) {
      deps.playSound("gameOver", deps.getIsMuted(), {
        onEnded: onGameOverSoundEndedPostGameUi,
      });
    }
    endgameBlankRestoreFallbackTimer = window.setTimeout(() => {
      endgameBlankRestoreFallbackTimer = null;
      onGameOverSoundEndedPostGameUi();
    }, ENDGAME_SOUND_FALLBACK_MS);
    deps.resetSelectionState();
    while (gridLineContainer.firstChild) {
      gridLineContainer.firstChild.remove();
    }

    doneButton.classList.add("hiddenDisplay");
    doneButton.classList.remove("visibleDisplay");
    boardShiftZone.classList.add("hiddenDisplay");
    boardShiftZone.classList.remove("visibleDisplay");

    buttonContainer.classList.remove("hiddenDisplay");
    startButton.classList.add("hiddenDisplay");
    startButton.classList.remove("visibleDisplay");
    st.deferRetryUntilCopyScoreVisible = isPerfectStinger;
    retryButton.classList.add("hiddenDisplay");
    retryButton.classList.remove("visibleDisplay", "dock-fade-in");
    retryButton.disabled = true;
    if (!isPerfectStinger) {
      retryRevealDelayTimer = window.setTimeout(() => {
        retryRevealDelayTimer = null;
        retryButton.classList.remove("hiddenDisplay", "dock-fade-in");
        retryButton.classList.add("visibleDisplay", "dock-fade-in");
        retryButton.disabled = false;
      }, ENDGAME_RETRY_REVEAL_DELAY_MS);
    }

    const gameOverFlashText = isPerfectStinger
      ? PERFECT_HUNT_GAME_OVER_MESSAGE
      : pickRandomScenarioMessage("game_over", "Game Over");

    const scheduleGameOverFlashesAndGridFadeExit = () => {
      showMessage(
        deps.ctx,
        gameOverFlashText,
        GAME_OVER_FLASH_TIMES,
        happyHuntingColor,
        null,
        GAME_OVER_FLASH_HOLD_EXTRA_MS
      );
      const gameOverMessageLeadMs = getShowMessageDurationMs(
        GAME_OVER_FLASH_TIMES,
        GAME_OVER_FLASH_HOLD_EXTRA_MS
      );
      endgameTileStartTimer = window.setTimeout(() => {
        endgameTileStartTimer = null;
        triggerEndgameTileExitAnimation();
      }, gameOverMessageLeadMs + ENDGAME_PAUSE_AFTER_GAME_OVER_MESSAGES_MS);
    };

    if (isPerfectStinger) {
      perfectGameOverDeferTimer = window.setTimeout(() => {
        perfectGameOverDeferTimer = null;
        scheduleGameOverFlashesAndGridFadeExit();
      }, PERFECT_ENDGAME_DEBOUNCE_BEFORE_GAME_OVER_MS);
    } else {
      scheduleGameOverFlashesAndGridFadeExit();
    }
    playerName.classList.add("hiddenDisplay");
    leaderboardButton.classList.add("hiddenDisplay");
    leaderboardButton.classList.add("leaderboard-action--concealed");
    if (leaderboardDemoAdd) {
      leaderboardDemoAdd.classList.remove("leaderboard-demo-add--eligible");
      leaderboardDemoAdd.classList.remove("leaderboard-demo-add--spent");
      leaderboardDemoAdd.disabled = false;
      leaderboardDemoAdd.classList.add("hiddenDisplay");
    }
  }

  return {
    endGame,
    onGameOverSoundEndedPostGameUi,
    clearInternalEndgameTimers,
  };
}
