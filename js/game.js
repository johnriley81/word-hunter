import {
  lightGreenPreviewColor,
  lightRedPreviewColor,
  happyHuntingColor,
  UPCOMING_LABEL,
  UPCOMING_PREVIEW_MAX,
  PRE_START_WORDMARK,
  GRID_SIZE,
  START_TOUCHPAD_FADE_MS,
  TILE_PALETTE_MS,
  TILE_PALETTE_TRANSITION_SETTLE_MS,
  POSTGAME_BEAT_MS,
  ENDGAME_TILE_SEQUENCE_MS,
  ENDGAME_TILE_EXIT_BUFFER_MS,
  LEADERBOARD_USE_DEMO_DATA,
  LEADERBOARD_REVEAL_LEAD_MS,
  LEADERBOARD_AFTER_ENDGAME_TILE_FADE_MS,
  ENDGAME_SOUND_FALLBACK_MS,
  ENDGAME_TILE_PAUSE_AFTER_GAMEOVER_MS,
  GAME_OVER_FLASH_TIMES,
  GAME_OVER_FLASH_HOLD_EXTRA_MS,
} from "./config.js";
import {
  pickRandomScenarioMessage,
  getLiveWordScoreBreakdownFromLabels,
  applyColumnShiftInPlace,
  applyRowShiftInPlace,
} from "./board-logic.js";
import {
  sounds,
  soundPlayPools,
  GAME_SOUND_IDS,
  syncLiveSfxMute,
  playSound,
  scheduleDeferredGameAudioWarmup,
} from "./audio.js";
import {
  calculateDiffDays,
  loadWordhunterTextAssets,
} from "./game-lifecycle.js";
import { createLeaderboardController } from "./leaderboard-ui.js";
import {
  getTileText,
  setTileText,
  syncDomFromBoard as syncDomFromBoardTiles,
} from "./grid-tiles.js";
import { attachShiftGestures, ensureShiftPreviewElements } from "./shift-dom.js";
import {
  getShowMessageDurationMs,
  clearWordLineTimers,
  crossfadeWordmarkToHappyHunting,
  fadeInCurrentWordLine,
  showMessage,
} from "./ui-word-line.js";
import {
  bumpWordReplaceEpoch,
  clearWordSubmitFeedbackTimer,
  createWordDragHandlers,
  resetWordSelectionState,
} from "./word-drag.js";
import { attachRulesDock } from "./rules-dock.js";

let isMouseDown = false;
let isGameActive = false;
let longestWord = "";
let websiteLink = "https://wordhunter.io/";
let leaderboardLink = "https://johnriley81.pythonanywhere.com/leaderboard/";
let playerPosition;

export function initGame(ctx) {
  Object.assign(ctx.refs, {
    grid: document.querySelector("#grid"),
    gridPan: document.getElementById("grid-pan"),
    gridStage: document.getElementById("grid-stage"),
    shiftPreviewStrip: document.getElementById("shift-preview-strip"),
    startButton: document.querySelector("#start"),
    currentWordElement: document.querySelector("#current-word"),
    queueNextHeaderElement: document.querySelector("#queue-next-header"),
    nextLettersElement: document.querySelector("#queue-next-values"),
    queueSackCountElement: document.querySelector("#queue-sack-count"),
    scoreElement: document.querySelector("#score"),
    scoreSwipeSumElement: document.querySelector("#score-swipe-sum"),
    scoreLengthElement: document.querySelector("#score-length"),
    scoreWordTotalElement: document.querySelector("#score-word-total"),
    scoreGameTotalElement: document.querySelector("#score-game-total"),
    gameInfoContainer: document.querySelector("#game-info-container"),
    bottomDock: document.querySelector("#bottom-dock"),
    rules: document.querySelector("#rules"),
    rulesButton: document.querySelector("#rules-button"),
    muteButton: document.getElementById("mute-button"),
    doneButton: document.querySelector("#done-button"),
    boardShiftZone: document.getElementById("board-shift-zone"),
    boardShiftHints: document.getElementById("board-shift-hints"),
    boardShiftDismissButton: document.getElementById("board-shift-dismiss"),
    buttonContainer: document.getElementById("button-container"),
    retryButton: document.querySelector("#retry-button"),
    gridLineContainer: document.querySelector("#line-container"),
    gridLineWrapper: document.getElementById("grid-line-wrapper"),
    gridViewport: document.getElementById("grid-viewport"),
    leaderboardElements: document.getElementById("leaderboard-elements"),
    leaderboardTable: document.getElementById("leaderboard-table"),
    playerName: document.getElementById("player-name"),
    leaderboardButton: document.getElementById("leaderboard-button"),
    leaderboardDemoAdd: document.getElementById("leaderboard-demo-add"),
  });

  const {
    grid,
    gridPan,
    gridStage,
    shiftPreviewStrip,
    startButton,
    currentWordElement,
    queueNextHeaderElement,
    nextLettersElement,
    queueSackCountElement,
    scoreElement,
    scoreSwipeSumElement,
    scoreLengthElement,
    scoreWordTotalElement,
    scoreGameTotalElement,
    gameInfoContainer,
    bottomDock,
    rules,
    rulesButton,
    muteButton,
    doneButton,
    boardShiftZone,
    boardShiftHints,
    boardShiftDismissButton,
    buttonContainer,
    retryButton,
    gridLineContainer,
    gridLineWrapper,
    gridViewport,
    leaderboardElements,
    leaderboardTable,
    playerName,
    leaderboardButton,
    leaderboardDemoAdd,
  } = ctx.refs;

  const SVG_NS = "http://www.w3.org/2000/svg";
  const wordState = ctx.state.word;
  /** @type {ReturnType<typeof createLeaderboardController> | undefined} */
  let lbCtl;

  startButton.disabled = true;
  nextLettersElement.textContent = "";
  if (queueSackCountElement) queueSackCountElement.textContent = "0";

  let score = 0;
  let nextLetters = [];
  let wordSet = new Set();
  let gridsList = [];
  let diffDays = 0;
  let nextLettersList = [];
  let isPaused = false;
  let isMuted = false;

  const { setRulesOverlayVisible } = attachRulesDock({
    refs: { rules, gameInfoContainer, bottomDock, grid },
    gridPan,
    rules,
    rulesButton,
    muteButton,
    getIsMuted: () => isMuted,
    setIsMuted: (v) => {
      isMuted = v;
    },
    onPausedChange: (v) => {
      isPaused = v;
    },
  });

  let endgameBlankRestoreFallbackTimer = null;
  let startUiTransitionTimer = null;
  let endgameTileStartTimer = null;
  let endgameTileRevealTimer = null;
  let endgamePostUiReady = false;
  let endgameUiShown = false;
  let postgameSequenceStarted = false;
  let postgameCopyScoreTimer = null;
  let leaderboardFadeOutTimer = null;
  /** @type {Array<[string, number, number|string, string]> | null} */
  let demoLeaderboardRows = null;
  let demoLeaderboardSubmitUsed = false;
  let tilePaletteTransitionTimer = null;
  const shiftState = {
    get pointerId() {
      return ctx.state.shift.pointerId;
    },
    get animating() {
      return ctx.state.shift.animating;
    },
  };
  const selectionState = {
    get isPointerDown() {
      return isMouseDown;
    },
    get selectedCount() {
      return wordState.selectedButtons.length;
    },
  };
  const uiState = {
    get paused() {
      return isPaused;
    },
    get gameActive() {
      return isGameActive;
    },
  };

  function clearTapStreak() {
    ctx.state.shift.doubleTapPrevAt = 0;
  }

  function resetSelectionState() {
    resetWordSelectionState(ctx, {
      updateCurrentWord,
      updateScoreStrip,
    });
  }

  function syncGridViewportSize() {
    if (!gridViewport) return;
    gridViewport.style.padding = "";
    gridViewport.style.width = "";
    gridViewport.style.height = "";
  }

  function lockGridSizeForSwipe() {
    if (ctx.state.shift.lockedGridWidthPx > 0 && ctx.state.shift.lockedGridHeightPx > 0) return;
    const br = grid.getBoundingClientRect();
    if (br.width < 1 || br.height < 1) return;
    ctx.state.shift.lockedGridWidthPx = br.width;
    ctx.state.shift.lockedGridHeightPx = br.height;
    grid.style.width = ctx.state.shift.lockedGridWidthPx + "px";
    grid.style.maxWidth = ctx.state.shift.lockedGridWidthPx + "px";
    grid.style.height = ctx.state.shift.lockedGridHeightPx + "px";
  }

  function unlockGridSizeAfterSwipe() {
    ctx.state.shift.lockedGridWidthPx = 0;
    ctx.state.shift.lockedGridHeightPx = 0;
  }

  function syncLineOverlaySize() {
    if (!gridLineWrapper) return;
    syncGridViewportSize();
    const wrap = gridLineWrapper.getBoundingClientRect();
    const gridR = grid.getBoundingClientRect();
    const offsetLeft = Math.round(gridR.left - wrap.left);
    const offsetTop = Math.round(gridR.top - wrap.top);
    gridLineContainer.style.left = offsetLeft + "px";
    gridLineContainer.style.top = offsetTop + "px";

    const tiles = grid.querySelectorAll(".grid-button");
    if (!tiles.length) {
      gridLineContainer.style.width = grid.offsetWidth + "px";
      gridLineContainer.style.height = grid.offsetHeight + "px";
      return;
    }
    const gridRect = grid.getBoundingClientRect();
    let maxBottom = 0;
    let maxRight = 0;
    tiles.forEach((tile) => {
      const br = tile.getBoundingClientRect();
      maxBottom = Math.max(maxBottom, br.bottom - gridRect.top);
      maxRight = Math.max(maxRight, br.right - gridRect.left);
    });
    gridLineContainer.style.width =
      Math.ceil(Math.max(grid.offsetWidth, maxRight)) + "px";
    gridLineContainer.style.height =
      Math.ceil(Math.max(grid.offsetHeight, maxBottom)) + "px";
  }


  GAME_SOUND_IDS.forEach((key) => {
    sounds[key].load();
    const pool = soundPlayPools[key];
    if (pool) {
      for (let i = 1; i < pool.length; i++) {
        pool[i].load();
      }
    }
  });

  loadWordhunterTextAssets()
    .then(({ wordSet: ws, gridsList: gl, nextLettersList: nll }) => {
      wordSet = ws;
      gridsList = gl;
      nextLettersList = nll;
      generateGrid();
      nextLetters = generateNextLetters();
      updateNextLetters();
      startButton.disabled = false;
    })
    .catch((error) => {
      console.error("Fetch error:", error);
    });

  startButton.addEventListener("click", () => {
    void startGame();
  });

  retryButton.addEventListener("click", function () {
    retryButton.disabled = true;
    const leaderboardFadeFinishesLater =
      lbCtl.beginPostgameLeaderboardOverlayFadeOut();
    resetRoundToPregame({
      forImmediateStart: true,
      skipLeaderboardOverlayTeardown: leaderboardFadeFinishesLater,
    });
    void startGame({ skipWordmarkInIntro: true, fadeTilesToActive: true });
  });

  currentWordElement.addEventListener("click", function () {
    if (!isGameActive) {
      copyToClipboard(score, longestWord, diffDays);
    }
  });

  leaderboardButton.addEventListener("click", () => void lbCtl.getLeaderboard(true));
  if (leaderboardDemoAdd) {
    leaderboardDemoAdd.addEventListener("click", () => {
      if (!LEADERBOARD_USE_DEMO_DATA) return;
      if (leaderboardDemoAdd.disabled || demoLeaderboardSubmitUsed) return;
      if (Number(score) <= 0) return;
      lbCtl.finalizeDemoLeaderboardSubmit();
    });
  }
  leaderboardTable.addEventListener("click", (e) => {
    if (!LEADERBOARD_USE_DEMO_DATA || demoLeaderboardSubmitUsed) return;
    if (!(e.target instanceof Element)) return;
    const td = e.target.closest("td[data-demo-self-name]");
    if (!td || !leaderboardTable.contains(td)) return;
    if (td.querySelector(".leaderboard-inline-name-input")) return;
    e.preventDefault();
    lbCtl.openDemoLeaderboardInlineNameEdit(td);
  });
  updateCurrentWord();
  currentWordElement.textContent = PRE_START_WORDMARK;
  currentWordElement.style.color = "white";


  function applyColumnShift(signedSteps) {
    applyColumnShiftInPlace(ctx.state.gameBoard, signedSteps, GRID_SIZE);
  }

  function applyRowShift(signedSteps) {
    applyRowShiftInPlace(ctx.state.gameBoard, signedSteps, GRID_SIZE);
  }

  function syncDomFromBoard() {
    syncDomFromBoardTiles(grid, ctx.state.gameBoard, GRID_SIZE);
  }

  const shiftHost = {
    shiftState,
    uiState,
    getIsGameActive: () => isGameActive,
    getIsPaused: () => isPaused,
    getIsMouseDown: () => isMouseDown,
    getIsMuted: () => isMuted,
    endGame,
    syncDomFromBoard,
    applyColumnShift,
    applyRowShift,
    syncLineOverlaySize,
    clearTapStreak,
    lockGridSizeForSwipe,
    unlockGridSizeAfterSwipe,
  };
  const { resetShiftDragVisualHard } = attachShiftGestures(ctx, shiftHost);

  function runGridTilePaletteTransition(direction, durationMs, onComplete) {
    if (tilePaletteTransitionTimer !== null) {
      window.clearTimeout(tilePaletteTransitionTimer);
      tilePaletteTransitionTimer = null;
    }

    const tiles = grid.querySelectorAll(".grid-button");
    for (let i = 0; i < tiles.length; i++) {
      const el = tiles[i];
      el.classList.remove(
        "grid-button--palette-to-active",
        "grid-button--palette-to-inactive"
      );
    }
    const cls =
      direction === "toActive"
        ? "grid-button--palette-to-active"
        : "grid-button--palette-to-inactive";
    const durStr = `${durationMs}ms`;

    let paletteTransitionDone = false;
    const finalizePaletteTransition = () => {
      if (paletteTransitionDone) return;
      paletteTransitionDone = true;
      if (tilePaletteTransitionTimer !== null) {
        window.clearTimeout(tilePaletteTransitionTimer);
        tilePaletteTransitionTimer = null;
      }
      if (onComplete) onComplete();
      for (let i = 0; i < tiles.length; i++) {
        const el = tiles[i];
        el.classList.remove(
          "grid-button--palette-to-active",
          "grid-button--palette-to-inactive"
        );
        el.style.removeProperty("--tile-palette-ms");
      }
    };

    void grid.offsetWidth;
    for (let i = 0; i < tiles.length; i++) {
      const el = tiles[i];
      el.style.setProperty("--tile-palette-ms", durStr);
      el.classList.add(cls);
    }
    tilePaletteTransitionTimer = window.setTimeout(
      finalizePaletteTransition,
      durationMs + TILE_PALETTE_TRANSITION_SETTLE_MS
    );
  }

  function startGame(arg) {
    if (arg instanceof MouseEvent) {
      arg = undefined;
    }
    const skipWordmarkInIntro =
      arg &&
      typeof arg === "object" &&
      arg.skipWordmarkInIntro === true;
    const fadeTilesToActive =
      arg &&
      typeof arg === "object" &&
      arg.fadeTilesToActive === true;
    playSound("button1", isMuted);
    clearTapStreak();
    isGameActive = true;
    startButton.disabled = true;
    startButton.classList.add("dock-fade-out");
    buttonContainer.classList.remove("hiddenDisplay");
    buttonContainer.classList.add("dock-fade-out");
    boardShiftZone.classList.remove("hiddenDisplay");
    boardShiftZone.classList.add("visibleDisplay");
    boardShiftZone.classList.add("dock-fade-in");
    if (startUiTransitionTimer !== null) {
      window.clearTimeout(startUiTransitionTimer);
    }
    startUiTransitionTimer = window.setTimeout(() => {
      buttonContainer.classList.add("hiddenDisplay");
      buttonContainer.classList.remove("dock-fade-out");
      startButton.classList.add("hiddenDisplay");
      startButton.classList.remove("visibleDisplay");
      startButton.classList.remove("dock-fade-out");
      boardShiftZone.classList.remove("dock-fade-in");
      startUiTransitionTimer = null;
    }, START_TOUCHPAD_FADE_MS);
    currentWordElement.classList.remove("hidden");
    currentWordElement.classList.add("visible");

    syncLineOverlaySize();
    requestAnimationFrame(syncLineOverlaySize);
    lockGridSizeForSwipe();

    score = 0;
    wordState.currentWord = "";
    updateScore();

    const activateGridTilesForPlay = () => {
      const buttons = grid.getElementsByClassName("grid-button");
      for (let i = 0; i < buttons.length; i++) {
        const b = buttons[i];
        b.classList.remove(
          "grid-button--palette-to-active",
          "grid-button--palette-to-inactive"
        );
        b.style.removeProperty("--tile-palette-ms");
        b.disabled = false;
        b.classList.add("grid-button--active");
        b.classList.remove("grid-button--inactive");
        b.style.color = "";
        b.classList.remove("grid-button--endgame-exit");
      }
    };
    if (fadeTilesToActive) {
      runGridTilePaletteTransition("toActive", TILE_PALETTE_MS, activateGridTilesForPlay);
    } else {
      activateGridTilesForPlay();
    }
    crossfadeWordmarkToHappyHunting(ctx, {
      skipWordmark: skipWordmarkInIntro,
    });
    updateCurrentWord();
    updateNextLetters();
    scheduleDeferredGameAudioWarmup();
  }

  function generateGrid() {
    while (grid.firstChild) {
      grid.removeChild(grid.firstChild);
    }
    diffDays = calculateDiffDays();
    const gridLetters = gridsList[diffDays % gridsList.length];
    ctx.state.gameBoard = [];

    for (let i = 0; i < GRID_SIZE; i++) {
      ctx.state.gameBoard[i] = [];
      for (let j = 0; j < GRID_SIZE; j++) {
        ctx.state.gameBoard[i][j] = gridLetters[i][j];
        const button = document.createElement("button");
        button.type = "button";
        button.classList.add("grid-button");
        button.classList.add("grid-button--inactive");
        setTileText(button, gridLetters[i][j]);
        button.disabled = true;
        button.addEventListener("mousedown", (e) => wordDrag.handleMouseDown(e));
        button.addEventListener("mouseover", (e) => wordDrag.handleMouseOver(e));
        button.addEventListener("touchstart", (e) => wordDrag.handleTouchStart(e), {
          passive: false,
        });
        button.addEventListener("touchmove", (e) => wordDrag.handleTouchMove(e));
        grid.appendChild(button);
      }
    }

    ensureShiftPreviewElements(ctx);
    syncLineOverlaySize();
    requestAnimationFrame(syncLineOverlaySize);
    requestAnimationFrame(lockGridSizeForSwipe);
  }

  function generateNextLetters() {
    diffDays = calculateDiffDays();
    const idx = diffDays % nextLettersList.length;
    const raw = nextLettersList[idx];
    nextLetters = Array.isArray(raw) ? raw.slice() : [];
    return nextLetters;
  }

  function getLiveWordScoreBreakdown(buttonSequence) {
    const sequence = Array.isArray(buttonSequence) ? buttonSequence : [];
    const labels = sequence.map((button) => getTileText(button));
    return getLiveWordScoreBreakdownFromLabels(labels);
  }

  function updateScoreStrip() {
    if (
      !scoreSwipeSumElement ||
      !scoreLengthElement ||
      !scoreWordTotalElement ||
      !scoreGameTotalElement
    ) {
      return;
    }
    const live = getLiveWordScoreBreakdown(wordState.selectedButtons);
    scoreSwipeSumElement.textContent = String(live.letterSum);
    scoreLengthElement.textContent = String(live.length);
    scoreWordTotalElement.textContent = String(live.wordTotal);
    scoreGameTotalElement.textContent = String(score);
  }

  function updateScore() {
    if (!scoreElement) return;
    updateScoreStrip();
  }

  function updateCurrentWord() {
    if (ctx.state.wordLine.active) return;
    currentWordElement.classList.remove("current-word--soft-hidden");
    if (!wordState.currentWord) {
      currentWordElement.textContent = "";
      currentWordElement.style.color = "white";
      return;
    }
    currentWordElement.textContent = wordState.currentWord.toUpperCase();
    if (wordState.currentWord.length < 3) {
      currentWordElement.style.color = "white";
      return;
    }
    currentWordElement.style.color = validateWord(wordState.currentWord)
      ? lightGreenPreviewColor
      : lightRedPreviewColor;
  }

  ctx.fn.updateCurrentWord = updateCurrentWord;

  function updateNextLetters() {
    if (queueNextHeaderElement) {
      queueNextHeaderElement.textContent = UPCOMING_LABEL;
    }
    while (nextLettersElement.firstChild) {
      nextLettersElement.removeChild(nextLettersElement.firstChild);
    }
    const slice = nextLetters.slice(0, UPCOMING_PREVIEW_MAX);
    const hasMoreUpcoming = nextLetters.length > UPCOMING_PREVIEW_MAX;

    if (queueSackCountElement) {
      queueSackCountElement.textContent = String(nextLetters.length);
    }

    if (slice.length === 0) {
      nextLettersElement.textContent = "";
      return;
    }

    const headSpan = document.createElement("span");
    headSpan.className = "queue-ribbon-letter--head";
    headSpan.textContent = String(slice[0]);
    nextLettersElement.appendChild(headSpan);
    if (slice.length > 1) {
      nextLettersElement.appendChild(
        document.createTextNode(", " + slice.slice(1).join(", "))
      );
    }
    if (hasMoreUpcoming) {
      nextLettersElement.appendChild(document.createTextNode("..."));
    }
  }

  const wordDragHost = {
    grid,
    gridLineContainer,
    nextLettersElement,
    svgNs: SVG_NS,
    gridSize: GRID_SIZE,
    getGameActive: () => isGameActive,
    getMuted: () => isMuted,
    getMouseDown: () => isMouseDown,
    setMouseDown: (v) => {
      isMouseDown = v;
    },
    getNextLetters: () => nextLetters,
    updateCurrentWord,
    updateScoreStrip,
    updateNextLetters,
    updateScore,
    validateWord: (word) => wordSet.has(word.toLowerCase()),
    getWordScoreFromSelectedTiles: (seq) =>
      getLiveWordScoreBreakdown(seq).wordTotal,
    getLongestWord: () => longestWord,
    setLongestWord: (w) => {
      longestWord = w;
    },
    addToScore: (delta) => {
      score += delta;
    },
  };
  const wordDrag = createWordDragHandlers(ctx, wordDragHost);

  document.addEventListener("touchend", (e) => wordDrag.handleTouchEnd(e));
  document.addEventListener("mouseup", (e) => wordDrag.handleMouseUp(e));

  lbCtl = createLeaderboardController({
    ctx,
    leaderboardLink,
    getScore: () => score,
    getLongestWord: () => longestWord,
    getDiffDays: () => diffDays,
    getIsMuted: () => isMuted,
    getIsGameActive: () => isGameActive,
    getEndgamePostUiReady: () => endgamePostUiReady,
    setEndgamePostUiReady: (v) => {
      endgamePostUiReady = v;
    },
    getEndgameUiShown: () => endgameUiShown,
    setEndgameUiShown: (v) => {
      endgameUiShown = v;
    },
    getPostgameSequenceStarted: () => postgameSequenceStarted,
    setPostgameSequenceStarted: (v) => {
      postgameSequenceStarted = v;
    },
    getPostgameCopyScoreTimer: () => postgameCopyScoreTimer,
    setPostgameCopyScoreTimer: (v) => {
      postgameCopyScoreTimer = v;
    },
    getLeaderboardFadeOutTimer: () => leaderboardFadeOutTimer,
    setLeaderboardFadeOutTimer: (v) => {
      leaderboardFadeOutTimer = v;
    },
    getDemoRows: () => demoLeaderboardRows,
    setDemoRows: (v) => {
      demoLeaderboardRows = v;
    },
    getDemoSubmitUsed: () => demoLeaderboardSubmitUsed,
    setDemoSubmitUsed: (v) => {
      demoLeaderboardSubmitUsed = v;
    },
    getPlayerPosition: () => playerPosition,
    setPlayerPosition: (v) => {
      playerPosition = v;
    },
    playSound,
    updateNextLetters,
  });

  function setEndgameBlankTilesHidden(hide) {
    const tiles = grid.getElementsByClassName("grid-button");
    for (let i = 0; i < tiles.length; i++) {
      const el = tiles[i];
      if (getTileText(el) === "") {
        el.classList.toggle("grid-button--endgame-blank-hidden", hide);
      }
    }
  }

  function triggerEndgameTileExitAnimation() {
    const tiles = grid.getElementsByClassName("grid-button");
    for (let i = 0; i < tiles.length; i++) {
      tiles[i].classList.remove("grid-button--endgame-exit");
    }
    requestAnimationFrame(() => {
      for (let i = 0; i < tiles.length; i++) {
        tiles[i].classList.add("grid-button--endgame-exit");
      }
    });
    if (endgameTileRevealTimer !== null) {
      window.clearTimeout(endgameTileRevealTimer);
    }
    endgameTileRevealTimer = window.setTimeout(() => {
      endgamePostUiReady = true;
      endgameTileRevealTimer = null;
      lbCtl.maybeShowPostGameUi();
    }, Math.max(
      0,
      ENDGAME_TILE_SEQUENCE_MS +
        ENDGAME_TILE_EXIT_BUFFER_MS -
        LEADERBOARD_REVEAL_LEAD_MS +
        LEADERBOARD_AFTER_ENDGAME_TILE_FADE_MS
    ));
  }

  function onGameOverSoundEndedPostGameUi() {
    if (endgameBlankRestoreFallbackTimer !== null) {
      window.clearTimeout(endgameBlankRestoreFallbackTimer);
      endgameBlankRestoreFallbackTimer = null;
    }
    sounds.gameOver.removeEventListener(
      "ended",
      onGameOverSoundEndedPostGameUi
    );
  }

  function endGame() {
    isGameActive = false;
    clearWordSubmitFeedbackTimer(ctx);
    bumpWordReplaceEpoch(ctx);
    endgamePostUiReady = false;
    endgameUiShown = false;
    postgameSequenceStarted = false;
    if (postgameCopyScoreTimer !== null) {
      window.clearTimeout(postgameCopyScoreTimer);
      postgameCopyScoreTimer = null;
    }
    lbCtl.hidePostgameLeaderboardOverlay();
    demoLeaderboardSubmitUsed = false;
    if (endgameTileStartTimer !== null) {
      window.clearTimeout(endgameTileStartTimer);
      endgameTileStartTimer = null;
    }
    if (endgameTileRevealTimer !== null) {
      window.clearTimeout(endgameTileRevealTimer);
      endgameTileRevealTimer = null;
    }
    clearTapStreak();

    setRulesOverlayVisible(false);

    const buttons = grid.getElementsByClassName("grid-button");
    for (let i = 0; i < buttons.length; i++) {
      buttons[i].disabled = true;
      buttons[i].classList.remove("selected");
      buttons[i].classList.remove("grid-button--selected-enter");
      buttons[i].classList.remove(
        "grid-button--invalid-shake",
        "grid-button--word-success",
        "grid-button--word-release-green",
        "grid-button--letter-flip",
        "grid-button--letter-swap-in"
      );
      buttons[i].removeAttribute("data-selection-visits");
      buttons[i].style.color = "";
      buttons[i].classList.remove("grid-button--endgame-exit");
    }
    runGridTilePaletteTransition("toInactive", TILE_PALETTE_MS, () => {
      const tiles = grid.getElementsByClassName("grid-button");
      for (let i = 0; i < tiles.length; i++) {
        tiles[i].classList.remove("grid-button--active");
        tiles[i].classList.add("grid-button--inactive");
      }
    });
    setEndgameBlankTilesHidden(true);
    if (endgameBlankRestoreFallbackTimer !== null) {
      window.clearTimeout(endgameBlankRestoreFallbackTimer);
      endgameBlankRestoreFallbackTimer = null;
    }
    sounds.gameOver.removeEventListener(
      "ended",
      onGameOverSoundEndedPostGameUi
    );
    try {
      sounds.gameOver.pause();
      sounds.gameOver.currentTime = 0;
    } catch (_) {}
    playSound("gameOver", isMuted);
    sounds.gameOver.addEventListener(
      "ended",
      onGameOverSoundEndedPostGameUi
    );
    if (endgameBlankRestoreFallbackTimer !== null) {
      window.clearTimeout(endgameBlankRestoreFallbackTimer);
    }
    endgameBlankRestoreFallbackTimer = window.setTimeout(() => {
      endgameBlankRestoreFallbackTimer = null;
      onGameOverSoundEndedPostGameUi();
    }, ENDGAME_SOUND_FALLBACK_MS);
    resetSelectionState();
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
    retryButton.classList.remove("hiddenDisplay");
    retryButton.classList.add("visibleDisplay");
    retryButton.disabled = false;

    showMessage(
      ctx,
      pickRandomScenarioMessage("game_over", "Game Over"),
      GAME_OVER_FLASH_TIMES,
      happyHuntingColor,
      null,
      GAME_OVER_FLASH_HOLD_EXTRA_MS
    );
    endgameTileStartTimer = window.setTimeout(() => {
      endgameTileStartTimer = null;
      triggerEndgameTileExitAnimation();
    },
      getShowMessageDurationMs(
        GAME_OVER_FLASH_TIMES,
        GAME_OVER_FLASH_HOLD_EXTRA_MS
      ) + ENDGAME_TILE_PAUSE_AFTER_GAMEOVER_MS
    );
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

  function resetRoundToPregame(options = {}) {
    const forImmediateStart = options.forImmediateStart === true;
    const skipLeaderboardOverlayTeardown =
      options.skipLeaderboardOverlayTeardown === true;
    isGameActive = false;
    isPaused = false;
    isMouseDown = false;
    clearTapStreak();

    if (endgameBlankRestoreFallbackTimer !== null) {
      window.clearTimeout(endgameBlankRestoreFallbackTimer);
      endgameBlankRestoreFallbackTimer = null;
    }
    if (endgameTileStartTimer !== null) {
      window.clearTimeout(endgameTileStartTimer);
      endgameTileStartTimer = null;
    }
    if (endgameTileRevealTimer !== null) {
      window.clearTimeout(endgameTileRevealTimer);
      endgameTileRevealTimer = null;
    }
    if (postgameCopyScoreTimer !== null) {
      window.clearTimeout(postgameCopyScoreTimer);
      postgameCopyScoreTimer = null;
    }
    if (!skipLeaderboardOverlayTeardown && leaderboardFadeOutTimer !== null) {
      window.clearTimeout(leaderboardFadeOutTimer);
      leaderboardFadeOutTimer = null;
    }
    postgameSequenceStarted = false;
    demoLeaderboardRows = null;
    demoLeaderboardSubmitUsed = false;
    if (!skipLeaderboardOverlayTeardown) {
      lbCtl.hidePostgameLeaderboardOverlay();
    }
    if (tilePaletteTransitionTimer !== null) {
      window.clearTimeout(tilePaletteTransitionTimer);
      tilePaletteTransitionTimer = null;
    }
    clearWordSubmitFeedbackTimer(ctx);
    bumpWordReplaceEpoch(ctx);
    if (startUiTransitionTimer !== null) {
      window.clearTimeout(startUiTransitionTimer);
      startUiTransitionTimer = null;
    }
    clearWordLineTimers(ctx);

    sounds.gameOver.removeEventListener(
      "ended",
      onGameOverSoundEndedPostGameUi
    );
    try {
      sounds.gameOver.pause();
      sounds.gameOver.currentTime = 0;
    } catch (_) {}

    endgamePostUiReady = false;
    endgameUiShown = false;

    ctx.state.shift.animating = false;
    ctx.state.shift.pointerId = null;
    ctx.state.shift.dragLockedHorizontal = null;
    playerPosition = undefined;

    score = 0;
    longestWord = "";

    resetShiftDragVisualHard();
    grid.style.width = "";
    grid.style.maxWidth = "";
    grid.style.height = "";

    while (gridLineContainer.firstChild) {
      gridLineContainer.firstChild.remove();
    }
    resetSelectionState();

    generateGrid();
    generateNextLetters();
    updateNextLetters();
    updateScore();

    setRulesOverlayVisible(false);

    rulesButton.classList.remove("hiddenDisplay", "hidden");
    muteButton.classList.remove("hiddenDisplay", "hidden");

    doneButton.classList.add("hiddenDisplay");
    doneButton.classList.remove("visibleDisplay");

    buttonContainer.classList.remove("hiddenDisplay");
    retryButton.classList.add("hiddenDisplay");
    retryButton.classList.remove("visibleDisplay");

    if (forImmediateStart) {
      boardShiftZone.classList.remove("dock-fade-in");
      boardShiftZone.classList.add("hiddenDisplay");
      boardShiftZone.classList.remove("visibleDisplay");
      startButton.classList.add("hiddenDisplay");
      startButton.classList.remove("visibleDisplay");
      startButton.classList.remove("dock-fade-out");
      startButton.disabled = true;
    } else {
      boardShiftZone.classList.add("hiddenDisplay");
      boardShiftZone.classList.remove("visibleDisplay", "dock-fade-in");
      startButton.classList.remove("hiddenDisplay");
      startButton.classList.add("visibleDisplay");
      startButton.disabled = false;
      startButton.classList.remove("dock-fade-out");
    }

    currentWordElement.classList.remove("current-word--soft-hidden");
    currentWordElement.classList.remove("current-word--valid-solve");
    currentWordElement.style.color = "white";
    if (!forImmediateStart) {
      currentWordElement.textContent = PRE_START_WORDMARK;
    }

    playerName.classList.add("hiddenDisplay");
    playerName.disabled = false;
    leaderboardButton.classList.add("hiddenDisplay");
    leaderboardButton.classList.add("leaderboard-action--concealed");
    leaderboardButton.disabled = false;
    leaderboardButton.style.backgroundColor = "";
    if (leaderboardDemoAdd) {
      leaderboardDemoAdd.classList.remove("leaderboard-demo-add--eligible");
      leaderboardDemoAdd.classList.remove("leaderboard-demo-add--spent");
      leaderboardDemoAdd.disabled = false;
      leaderboardDemoAdd.classList.add("hiddenDisplay");
    }

    const tiles = grid.querySelectorAll(".grid-button");
    for (let i = 0; i < tiles.length; i++) {
      tiles[i].classList.remove(
        "grid-button--palette-to-active",
        "grid-button--palette-to-inactive",
        "grid-button--selected-enter",
        "grid-button--invalid-shake",
        "grid-button--word-success",
        "grid-button--word-release-green",
        "grid-button--letter-flip",
        "grid-button--letter-swap-in",
        "grid-button--endgame-exit"
      );
    }

    syncLineOverlaySize();
    requestAnimationFrame(syncLineOverlaySize);
  }

  function copyToClipboard(score, longestWord, diffDays) {
    playSound("copy", isMuted);
    let leaderboardText = "";
    if (playerPosition) {
      leaderboardText = `#${playerPosition} on `;
    }
    navigator.clipboard
      .writeText(
        `${leaderboardText}wordhunter #${diffDays} 🏹${score}\n🏆 ${longestWord.toUpperCase()} 🏆\n${websiteLink}`
      )
      .then(function () {
        alert("Score copied to clipboard");
      })
      .catch(function (err) {
        alert("FAIL\n\nUnable to copy score to clipboard");
        console.log("Error in copyToClipboard:", err);
      });
  }

  function validateWord(word) {
    return wordSet.has(word.toLowerCase());
  }
}
