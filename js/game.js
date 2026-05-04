import {
  lightGreenPreviewColor,
  lightRedPreviewColor,
  UPCOMING_LABEL,
  UPCOMING_PREVIEW_MAX,
  PRE_START_WORDMARK,
  GRID_SIZE,
  START_TOUCHPAD_FADE_MS,
  TILE_PALETTE_MS,
  TILE_PALETTE_TRANSITION_SETTLE_MS,
  LEADERBOARD_USE_DEMO_DATA,
  LEADERBOARD_API_BASE,
  LEADERBOARD_SUBMIT_SCORE_VALIDATION,
  LEADERBOARD_OVERLAY_FADE_OUT_TOTAL_MS,
  CHOIR_PLAYBACK_RATES_FOR_RANK,
} from "./config.js";
import {
  getLiveWordScoreBreakdownFromLabels,
  buildPerfectHuntMetadata,
  applyColumnShiftInPlace,
  applyRowShiftInPlace,
  computePerfectHuntStarterFlatWithRowHints,
  remapPerfectHuntHintStickyFlatAfterCommittedShift,
} from "./board-logic.js";
import {
  preloadGameSoundLayers,
  resetGameOverAudio,
  syncLiveSfxMute,
  playSound,
  scheduleDeferredGameAudioWarmup,
  unlockGameAudio,
} from "./audio.js";
import { calculatePuzzleDayIndex, puzzleListIndex } from "./game-lifecycle.js";
import { createLeaderboardController } from "./leaderboard-ui.js";
import {
  getTileText,
  setTileText,
  syncConsumedEmptySlotVisual,
  syncDomFromBoard as syncDomFromBoardTiles,
} from "./grid-tiles.js";
import { attachShiftGestures, ensureShiftPreviewElements } from "./shift-dom.js";
import {
  clearWordLineTimers,
  crossfadeCopyScoreToCopied,
  crossfadeWordmarkToHappyHunting,
} from "./ui-word-line.js";
import {
  bumpWordReplaceEpoch,
  clearWordSubmitFeedbackTimer,
  createWordDragHandlers,
  resetWordSelectionState,
} from "./word-drag.js";
import { attachRulesDock } from "./rules-dock.js";
import { omitEmptyNextLetterSlots } from "./puzzle-export-sim/next-letters.js";
import { coerceStarterTorNeighborsForRow } from "./puzzle-row-format.js";
import {
  createLineOverlayLayoutSync,
  lockGridSizeForSwipe as lockGridSizeForSwipeCore,
  unlockGridSizeAfterSwipe as unlockGridSizeAfterSwipeCore,
} from "./grid-layout.js";
import { createGameEndgameCoordinator } from "./game-endgame.js";
import { assignGamePlayerDomRefs } from "./game-player-dom-refs.js";
import {
  createPlayerLeaderboardRuntimeState,
  freezePlayerShellBeforeAssets,
  hydrateRulesHudCounts,
  loadPlayerWordhunterAssetBundle,
} from "./game-player-shell.js";

function cloneBoardSnapshotForLeaderboard(board) {
  return board.map((row) => row.map((cell) => String(cell || "").toLowerCase()));
}

let isMouseDown = false;
let isGameActive = false;
let trophyWord = "";
let trophyWordScore = Number.NEGATIVE_INFINITY;
let websiteLink = "https://wordhunter.io/";
const leaderboardLink = LEADERBOARD_API_BASE;

export function initGame(ctx) {
  assignGamePlayerDomRefs(ctx.refs);

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
    rulesPerfectHuntTotalElement,
    rulesPerfectHuntCountElement,
    rulesNextLettersCountElement,
    muteButton,
    doneButton,
    boardShiftZone,
    boardShiftHints,
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

  /** Live list of `#grid` tile buttons — refresh in `generateGrid` after rebuilding children. */
  let gridButtonElements = grid.getElementsByClassName("grid-button");

  const PERFECT_HUNT_HINT_CLASS = "grid-button--perfect-hunt-hint";

  const leaderboardRtState = createPlayerLeaderboardRuntimeState();

  let resetShiftDragVisualHard = () => {};

  hydrateRulesHudCounts(rulesNextLettersCountElement, rulesPerfectHuntCountElement);

  const SVG_NS = "http://www.w3.org/2000/svg";
  const wordState = ctx.state.word;
  /** @type {ReturnType<typeof createLeaderboardController> | undefined} */
  let lbCtl;

  freezePlayerShellBeforeAssets({
    startButton,
    nextLettersElement,
    queueSackCountElement,
  });

  let score = 0;
  let nextLetters = [];
  let wordSet = new Set();
  /** @type {Array<{ starting_grid: string[][]; next_letters: string[]; perfect_hunt: string[]; perfect_hunt_starter_flats?: number[]; perfect_hunt_starter_tor_neighbors?: string[] }>} */
  let puzzles = [];
  let leaderboardPuzzleId = 0;
  let scoreValidationTurns = [];
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

  let startUiTransitionTimer = null;
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

  const { syncLineOverlaySize, scheduleSyncLineOverlaySize } =
    createLineOverlayLayoutSync({
      grid,
      gridLineWrapper,
      gridLineContainer,
      beforeMeasure: syncGridViewportSize,
    });

  function lockGridSizeForSwipe() {
    lockGridSizeForSwipeCore(grid, ctx.state.shift);
  }

  function unlockGridSizeAfterSwipe() {
    unlockGridSizeAfterSwipeCore(ctx.state.shift);
  }

  preloadGameSoundLayers();

  void loadPlayerWordhunterAssetBundle().then((bundle) => {
    if (!bundle) return;
    wordSet = bundle.wordSet;
    puzzles = bundle.puzzles;
    generateGrid();
    nextLetters = generateNextLetters();
    updateNextLetters();
    startButton.disabled = false;
  });

  startButton.addEventListener("click", () => {
    void startGame();
  });

  retryButton.addEventListener("click", function () {
    void unlockGameAudio();
    retryButton.disabled = true;
    const leaderboardFadeFinishesLater = lbCtl.beginPostgameLeaderboardOverlayFadeOut();
    resetRoundToPregame({
      forImmediateStart: true,
      skipLeaderboardOverlayTeardown: leaderboardFadeFinishesLater,
    });
    const startAfterMs = leaderboardFadeFinishesLater
      ? LEADERBOARD_OVERLAY_FADE_OUT_TOTAL_MS
      : 0;
    window.setTimeout(() => {
      void startGame({ skipWordmarkInIntro: true, fadeTilesToActive: true });
    }, startAfterMs);
  });

  currentWordElement.addEventListener("click", function () {
    if (isGameActive) return;
    if (leaderboardRtState.endgameUiShown && !leaderboardRtState.copyScoreLineUsed) {
      void copyScoreFirstTap();
    } else {
      copyScoreQuietTap();
    }
  });

  leaderboardButton.addEventListener("click", () => void lbCtl.getLeaderboard(true));
  if (leaderboardDemoAdd) {
    leaderboardDemoAdd.addEventListener("click", () => {
      if (!LEADERBOARD_USE_DEMO_DATA) return;
      if (leaderboardDemoAdd.disabled || leaderboardRtState.demoLeaderboardSubmitUsed)
        return;
      if (Number(score) <= 0) return;
      lbCtl.finalizeDemoLeaderboardSubmit();
    });
  }
  leaderboardTable.addEventListener("click", (e) => {
    if (!(e.target instanceof Element)) return;
    const td = e.target.closest("td[data-inline-self-name]");
    if (!td || !leaderboardTable.contains(td)) return;
    if (LEADERBOARD_USE_DEMO_DATA && leaderboardRtState.demoLeaderboardSubmitUsed)
      return;
    if (!LEADERBOARD_USE_DEMO_DATA && leaderboardRtState.liveLeaderboardSubmitUsed)
      return;
    if (td.querySelector(".leaderboard-inline-name-input")) return;
    e.preventDefault();
    lbCtl.openLeaderboardInlineNameEdit(td);
  });
  updateCurrentWord();
  currentWordElement.textContent = PRE_START_WORDMARK;
  currentWordElement.style.color = "white";

  function commitBoardShift(kind, signedSteps) {
    if (kind === "col") {
      applyColumnShiftInPlace(ctx.state.gameBoard, signedSteps, GRID_SIZE);
    } else {
      applyRowShiftInPlace(ctx.state.gameBoard, signedSteps, GRID_SIZE);
    }
    remapPerfectHuntHintStickyFlatAfterCommittedShift(
      ctx.state,
      kind,
      signedSteps,
      GRID_SIZE
    );
  }

  function applyColumnShift(signedSteps) {
    commitBoardShift("col", signedSteps);
  }

  function applyRowShift(signedSteps) {
    commitBoardShift("row", signedSteps);
  }

  function clearPerfectHuntHintVisual() {
    for (let i = 0; i < gridButtonElements.length; i++) {
      gridButtonElements[i].classList.remove(PERFECT_HUNT_HINT_CLASS);
    }
    ctx.state.perfectHuntHintFlat = null;
    ctx.state.perfectHuntHintStickyFlat = null;
  }

  function computePerfectHuntHintFlat() {
    return computePerfectHuntStarterFlatWithRowHints(
      ctx.state.gameBoard,
      ctx.state.perfectHunt,
      ctx.state.perfectHuntOrderIndex,
      ctx.state.perfectHuntOnPace,
      GRID_SIZE,
      ctx.state.perfectHuntStarterFlats,
      ctx.state.perfectHuntStarterTorNeighbors
    );
  }

  function refreshPerfectHuntHint() {
    if (!isGameActive) {
      clearPerfectHuntHintVisual();
      return;
    }

    const nSq = GRID_SIZE * GRID_SIZE;

    let nextFlat;
    if (ctx.state.perfectHuntOnPace && ctx.state.perfectHuntHintStickyFlat != null) {
      nextFlat = ctx.state.perfectHuntHintStickyFlat;
    } else {
      nextFlat = computePerfectHuntHintFlat();
      ctx.state.perfectHuntHintStickyFlat =
        ctx.state.perfectHuntOnPace && nextFlat != null ? nextFlat : null;
    }
    const prevFlat = ctx.state.perfectHuntHintFlat;

    if (nextFlat == null) {
      clearPerfectHuntHintVisual();
      return;
    }

    for (let i = 0; i < nSq; i++) {
      if (i !== nextFlat) {
        grid.children[i]?.classList.remove(PERFECT_HUNT_HINT_CLASS);
      }
    }

    const btn = grid.children[nextFlat];
    if (!btn) {
      ctx.state.perfectHuntHintFlat = null;
      ctx.state.perfectHuntHintStickyFlat = null;
      return;
    }

    if (prevFlat === nextFlat && btn.classList.contains(PERFECT_HUNT_HINT_CLASS)) {
      ctx.state.perfectHuntHintFlat = nextFlat;
      return;
    }

    btn.classList.add(PERFECT_HUNT_HINT_CLASS);
    ctx.state.perfectHuntHintFlat = nextFlat;
  }

  function syncDomFromBoard() {
    syncDomFromBoardTiles(grid, ctx.state.gameBoard, GRID_SIZE);
    refreshPerfectHuntHint();
  }

  function runGridTilePaletteTransition(direction, durationMs, onComplete) {
    if (tilePaletteTransitionTimer !== null) {
      window.clearTimeout(tilePaletteTransitionTimer);
      tilePaletteTransitionTimer = null;
    }

    const tiles = gridButtonElements;
    for (let i = 0; i < tiles.length; i++) {
      const el = tiles[i];
      el.classList.remove(
        "grid-button--palette-to-active",
        "grid-button--palette-to-inactive",
        "grid-button--palette-to-active-fade-in"
      );
    }
    const cls =
      direction === "toActiveFadeIn"
        ? "grid-button--palette-to-active-fade-in"
        : direction === "toActive"
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
      grid.classList.remove("grid--awaiting-retry-fade-in");
      if (onComplete) onComplete();
      for (let i = 0; i < tiles.length; i++) {
        const el = tiles[i];
        el.classList.remove(
          "grid-button--palette-to-active",
          "grid-button--palette-to-inactive",
          "grid-button--palette-to-active-fade-in"
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
    if (direction === "toActiveFadeIn") {
      grid.classList.remove("grid--awaiting-retry-fade-in");
    }
    tilePaletteTransitionTimer = window.setTimeout(
      finalizePaletteTransition,
      durationMs + TILE_PALETTE_TRANSITION_SETTLE_MS
    );
  }

  function startGame(arg) {
    void unlockGameAudio().then(() => syncLiveSfxMute(isMuted));
    if (arg instanceof MouseEvent) {
      arg = undefined;
    }
    const skipWordmarkInIntro =
      arg && typeof arg === "object" && arg.skipWordmarkInIntro === true;
    const fadeTilesToActive =
      arg && typeof arg === "object" && arg.fadeTilesToActive === true;
    playSound("click", isMuted);
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
    scheduleSyncLineOverlaySize();
    lockGridSizeForSwipe();

    score = 0;
    scoreValidationTurns = [];
    wordState.currentWord = "";
    ctx.state.perfectHuntWordsSubmitted?.clear();
    ctx.state.perfectHuntOrderIndex = 0;
    ctx.state.perfectHuntOnPace = Boolean(ctx.state.perfectHunt?.length);
    ctx.state.perfectHuntHintStickyFlat = null;
    updateScore();

    const activateGridTilesForPlay = () => {
      for (let i = 0; i < gridButtonElements.length; i++) {
        const b = gridButtonElements[i];
        b.classList.remove(
          "grid-button--palette-to-active",
          "grid-button--palette-to-inactive",
          "grid-button--palette-to-active-fade-in"
        );
        b.style.removeProperty("--tile-palette-ms");
        b.disabled = false;
        b.classList.add("grid-button--active");
        b.classList.remove("grid-button--inactive");
        b.style.color = "";
        b.style.removeProperty("background-color");
        b.style.removeProperty("border-color");
        b.style.removeProperty("filter");
        b.classList.remove(
          "grid-button--slot-consumed",
          "grid-button--slot-consumed-hunt-pace",
          "grid-button--slot-consumed-instant"
        );
      }
    };
    if (fadeTilesToActive) {
      runGridTilePaletteTransition(
        "toActiveFadeIn",
        TILE_PALETTE_MS,
        activateGridTilesForPlay
      );
    } else {
      activateGridTilesForPlay();
    }
    crossfadeWordmarkToHappyHunting(ctx, {
      skipWordmark: skipWordmarkInIntro,
    });
    updateCurrentWord();
    updateNextLetters();
    scheduleDeferredGameAudioWarmup();
    refreshPerfectHuntHint();
  }

  function generateGrid() {
    while (grid.firstChild) {
      grid.removeChild(grid.firstChild);
    }
    leaderboardPuzzleId = calculatePuzzleDayIndex();
    scoreValidationTurns = [];
    const p = puzzles[puzzleListIndex(puzzles.length)];
    const gridLetters = p.starting_grid;
    ctx.state.perfectHunt = p.perfect_hunt;
    const huntMeta = buildPerfectHuntMetadata(
      p.perfect_hunt,
      CHOIR_PLAYBACK_RATES_FOR_RANK
    );
    if (huntMeta) {
      ctx.state.perfectHuntTargetSum = huntMeta.targetSum;
      ctx.state.perfectHuntChoirRateByWord = huntMeta.choirRateByWord;
    } else {
      ctx.state.perfectHuntTargetSum = null;
      ctx.state.perfectHuntChoirRateByWord = null;
    }
    ctx.state.perfectHuntStarterFlats = Array.isArray(p.perfect_hunt_starter_flats)
      ? p.perfect_hunt_starter_flats.slice()
      : null;
    ctx.state.perfectHuntStarterTorNeighbors = Array.isArray(
      p.perfect_hunt_starter_tor_neighbors
    )
      ? coerceStarterTorNeighborsForRow(p.perfect_hunt_starter_tor_neighbors)
      : null;
    ctx.state.perfectHuntWordsSubmitted = new Set();
    ctx.state.perfectHuntOrderIndex = 0;
    ctx.state.perfectHuntHintFlat = null;
    ctx.state.perfectHuntHintStickyFlat = null;
    ctx.state.perfectHuntOnPace =
      Array.isArray(p.perfect_hunt) && p.perfect_hunt.length > 0;
    if (rulesPerfectHuntTotalElement) {
      rulesPerfectHuntTotalElement.textContent =
        ctx.state.perfectHuntTargetSum != null
          ? String(ctx.state.perfectHuntTargetSum)
          : "—";
    }
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
        syncConsumedEmptySlotVisual(button, gridLetters[i][j]);
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

    gridButtonElements = grid.getElementsByClassName("grid-button");

    ensureShiftPreviewElements(ctx);
    syncLineOverlaySize();
    scheduleSyncLineOverlaySize();
    requestAnimationFrame(lockGridSizeForSwipe);
  }

  function generateNextLetters() {
    leaderboardPuzzleId = calculatePuzzleDayIndex();
    const p = puzzles[puzzleListIndex(puzzles.length)];
    nextLetters = p.next_letters.slice();
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
    if (leaderboardRtState.endgameUiShown) return;
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
    const lettersOnlyPreview = omitEmptyNextLetterSlots(nextLetters);
    const slice = lettersOnlyPreview.slice(0, UPCOMING_PREVIEW_MAX);
    const hasMoreUpcoming = lettersOnlyPreview.length > UPCOMING_PREVIEW_MAX;

    if (queueSackCountElement) {
      queueSackCountElement.textContent = String(
        omitEmptyNextLetterSlots(nextLetters).length
      );
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
    getWordScoreFromSelectedTiles: (seq) => getLiveWordScoreBreakdown(seq).wordTotal,
    getTrophyWord: () => trophyWord,
    recordTrophyWordIfBest(word, wordScore) {
      const w = String(word || "");
      const n = Number(wordScore);
      if (!Number.isFinite(n)) return;
      if (
        n > trophyWordScore ||
        (n === trophyWordScore && w.length > trophyWord.length)
      ) {
        trophyWord = w;
        trophyWordScore = n;
      }
    },
    addToScore: (delta) => {
      score += delta;
    },
    evaluatePerfectHuntSubmit(word, wordScore) {
      const key = String(word || "").toLowerCase();
      if (
        !ctx.state.perfectHunt?.length ||
        ctx.state.perfectHuntTargetSum == null ||
        !ctx.state.perfectHuntChoirRateByWord
      ) {
        return { inList: false, isPerfectCompletion: false, choirPlaybackRate: null };
      }
      const inList = ctx.state.perfectHunt.some((w) => w.toLowerCase() === key);
      if (!inList) {
        return { inList: false, isPerfectCompletion: false, choirPlaybackRate: null };
      }
      const nextSet = new Set(ctx.state.perfectHuntWordsSubmitted);
      nextSet.add(key);
      const choirPlaybackRate = ctx.state.perfectHuntChoirRateByWord.get(key) ?? 1;
      const huntLen = ctx.state.perfectHunt?.length ?? 0;
      const isPerfectCompletion =
        huntLen > 0 &&
        nextSet.size === huntLen &&
        score + wordScore === ctx.state.perfectHuntTargetSum;
      return { inList: true, isPerfectCompletion, choirPlaybackRate };
    },
    commitPerfectHuntWordIfListed(word) {
      const key = String(word || "").toLowerCase();
      if (!ctx.state.perfectHunt?.some((w) => w.toLowerCase() === key)) return;
      ctx.state.perfectHuntWordsSubmitted.add(key);
    },
    recordPerfectHuntOrderPace(word) {
      if (!ctx.state.perfectHuntOnPace) return { brokePace: false };
      const hunt = ctx.state.perfectHunt;
      if (!hunt?.length) {
        ctx.state.perfectHuntOnPace = false;
        ctx.state.perfectHuntHintStickyFlat = null;
        return { brokePace: false };
      }
      const idx = ctx.state.perfectHuntOrderIndex;
      if (idx >= hunt.length) {
        return { brokePace: false };
      }
      const key = String(word || "").toLowerCase();
      const expected = hunt[idx];
      if (key === String(expected).toLowerCase()) {
        ctx.state.perfectHuntHintStickyFlat = null;
        ctx.state.perfectHuntOrderIndex = idx + 1;
        return { brokePace: false };
      }
      ctx.state.perfectHuntOnPace = false;
      ctx.state.perfectHuntHintStickyFlat = null;
      return { brokePace: true };
    },
    collapseNextLetterBlankSlots() {
      nextLetters = omitEmptyNextLetterSlots(nextLetters);
      updateNextLetters();
    },
    isWordKeepingPerfectHuntPace(word) {
      if (!ctx.state.perfectHuntOnPace) return false;
      const hunt = ctx.state.perfectHunt;
      if (!hunt?.length) return false;
      const idx = ctx.state.perfectHuntOrderIndex;
      if (idx >= hunt.length) return false;
      const key = String(word || "").toLowerCase();
      return key === String(hunt[idx]).toLowerCase();
    },
    refreshPerfectHuntHint,
    clearPerfectHuntHintVisual,
    recordLeaderboardScoreTurn(word, replacementCount) {
      if (!LEADERBOARD_SUBMIT_SCORE_VALIDATION) return;
      const letters = cloneBoardSnapshotForLeaderboard(ctx.state.gameBoard);
      scoreValidationTurns.push([
        String(word || "").toLowerCase(),
        letters,
        replacementCount,
      ]);
    },
  };
  const wordDrag = createWordDragHandlers(ctx, wordDragHost);

  document.addEventListener("touchend", (e) => wordDrag.handleTouchEnd(e));
  document.addEventListener("mouseup", (e) => wordDrag.handleMouseUp(e));

  lbCtl = createLeaderboardController({
    ctx,
    leaderboardLink,
    state: leaderboardRtState,
    getScore: () => score,
    getTrophyWord: () => trophyWord,
    getLeaderboardPuzzleId: () => leaderboardPuzzleId,
    getScoreValidationTurns: () => scoreValidationTurns,
    getIsMuted: () => isMuted,
    getIsGameActive: () => isGameActive,
    getPerfectHuntTargetSum: () => ctx.state.perfectHuntTargetSum,
    playSound,
    updateNextLetters,
    revealPostgameRetryAfterCopyScoreVisible: () => {
      if (!leaderboardRtState.deferRetryUntilCopyScoreVisible) return;
      leaderboardRtState.deferRetryUntilCopyScoreVisible = false;
      retryButton.classList.remove("hiddenDisplay");
      retryButton.classList.add("visibleDisplay", "dock-fade-in");
      retryButton.disabled = false;
    },
  });

  const gameEndgame = createGameEndgameCoordinator({
    ctx,
    grid,
    getGridButtons: () => gridButtonElements,
    perfectHuntHintClass: PERFECT_HUNT_HINT_CLASS,
    getLbCtl: () => lbCtl,
    rtState: leaderboardRtState,
    clearTapStreak,
    setRulesOverlayVisible,
    resetSelectionState,
    runGridTilePaletteTransition,
    playSound,
    getIsMuted: () => isMuted,
    setIsGameActive: (v) => {
      isGameActive = v;
    },
    refs: {
      gridLineContainer,
      doneButton,
      boardShiftZone,
      buttonContainer,
      startButton,
      retryButton,
      playerName,
      leaderboardButton,
      leaderboardDemoAdd,
    },
  });

  const shiftHost = {
    shiftState,
    uiState,
    getIsGameActive: () => isGameActive,
    getIsPaused: () => isPaused,
    getIsMouseDown: () => isMouseDown,
    getIsMuted: () => isMuted,
    getShiftsAllowed: () => ctx.state.word.wordReplaceLockGen === 0 && !isMouseDown,
    endGame: (opts) => gameEndgame.endGame(opts),
    syncDomFromBoard,
    applyColumnShift,
    applyRowShift,
    syncLineOverlaySize,
    scheduleSyncLineOverlaySize,
    clearTapStreak,
    lockGridSizeForSwipe,
    unlockGridSizeAfterSwipe,
  };
  ({ resetShiftDragVisualHard } = attachShiftGestures(ctx, shiftHost));

  wordDragHost.endGameWithStinger = (opts) => gameEndgame.endGame(opts);
  wordDragHost.onPerfectFanfareEnded = gameEndgame.onGameOverSoundEndedPostGameUi;

  function resetRoundToPregame(options = {}) {
    const forImmediateStart = options.forImmediateStart === true;
    const skipLeaderboardOverlayTeardown =
      options.skipLeaderboardOverlayTeardown === true;
    grid.classList.remove("grid--awaiting-retry-fade-in");
    grid.classList.remove("grid--endgame-final-fade");
    grid.style.removeProperty("--endgame-grid-batch-fade-ms");
    isGameActive = false;
    isPaused = false;
    isMouseDown = false;
    clearTapStreak();

    gameEndgame.clearInternalEndgameTimers();

    if (leaderboardRtState.postgameCopyScoreTimer !== null) {
      window.clearTimeout(leaderboardRtState.postgameCopyScoreTimer);
      leaderboardRtState.postgameCopyScoreTimer = null;
    }
    if (
      !skipLeaderboardOverlayTeardown &&
      leaderboardRtState.leaderboardFadeOutTimer !== null
    ) {
      window.clearTimeout(leaderboardRtState.leaderboardFadeOutTimer);
      leaderboardRtState.leaderboardFadeOutTimer = null;
    }
    leaderboardRtState.postgameSequenceStarted = false;
    leaderboardRtState.demoLeaderboardRows = null;
    leaderboardRtState.liveLeaderboardPreviewRows = null;
    leaderboardRtState.liveLeaderboardEligibilityRows = null;
    leaderboardRtState.demoLeaderboardSubmitUsed = false;
    leaderboardRtState.liveLeaderboardSubmitUsed = false;
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

    resetGameOverAudio();

    leaderboardRtState.endgamePostUiReady = false;
    leaderboardRtState.endgameUiShown = false;
    leaderboardRtState.copyScoreLineUsed = false;
    leaderboardRtState.deferRetryUntilCopyScoreVisible = false;

    ctx.state.shift.animating = false;
    ctx.state.shift.pointerId = null;
    ctx.state.shift.dragLockedHorizontal = null;
    leaderboardRtState.playerPosition = undefined;

    score = 0;
    trophyWord = "";
    trophyWordScore = Number.NEGATIVE_INFINITY;

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
    retryButton.classList.remove("visibleDisplay", "dock-fade-in");

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

    for (let i = 0; i < gridButtonElements.length; i++) {
      gridButtonElements[i].classList.remove(
        "grid-button--palette-to-active",
        "grid-button--palette-to-inactive",
        "grid-button--palette-to-active-fade-in",
        "grid-button--selected-enter",
        "grid-button--invalid-shake",
        "grid-button--word-success",
        "grid-button--word-release-green",
        "grid-button--word-release-hunt-pace",
        "grid-button--letter-flip",
        "grid-button--letter-swap-in",
        "grid-button--slot-consumed",
        "grid-button--slot-consumed-hunt-pace",
        "grid-button--slot-consumed-instant",
        "grid-button--perfect-hunt-hint"
      );
    }

    if (forImmediateStart && skipLeaderboardOverlayTeardown) {
      grid.classList.add("grid--awaiting-retry-fade-in");
    }

    syncLineOverlaySize();
    scheduleSyncLineOverlaySize();
  }

  function buildClipboardScoreText() {
    let leaderboardText = "";
    if (leaderboardRtState.playerPosition) {
      leaderboardText = `#${leaderboardRtState.playerPosition} on `;
    }
    return `${leaderboardText}wordhunter #${leaderboardPuzzleId} 🏹${score}\n🏆 ${trophyWord.toUpperCase()} 🏆\n${websiteLink}`;
  }

  function writeScoreToClipboardPromise() {
    try {
      const text = buildClipboardScoreText();
      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        return navigator.clipboard.writeText(text);
      }
    } catch (err) {
      return Promise.reject(err);
    }
    return Promise.reject(new Error("Clipboard API unavailable"));
  }

  function copyScoreQuietTap() {
    playSound("copy", isMuted);
    void writeScoreToClipboardPromise().catch((err) => {
      console.error("Error copying score:", err);
    });
  }

  function copyScoreFirstTap() {
    if (leaderboardRtState.copyScoreLineUsed) return;
    leaderboardRtState.copyScoreLineUsed = true;
    playSound("copy", isMuted);
    void writeScoreToClipboardPromise()
      .catch((err) => {
        console.error("Error copying score:", err);
      })
      .finally(() => {
        window.setTimeout(() => {
          crossfadeCopyScoreToCopied(ctx);
        }, 180);
      });
  }

  function validateWord(word) {
    return wordSet.has(word.toLowerCase());
  }
}
