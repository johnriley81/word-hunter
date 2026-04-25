import {
  lightGreenPreviewColor,
  lightRedPreviewColor,
  reverseDebugOverTileWordColor,
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
  LEADERBOARD_OVERLAY_FADE_OUT_TOTAL_MS,
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
  crossfadeCopyScoreToCopied,
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
import {
  findAlternateWordInSlotPool,
  loadReverseDebugSession,
  navigateReverseDebugAnotherSample,
} from "./reverse-debug-boot.js";
import {
  prependCoverOrder,
  reverseUnplayOneWord,
  wordToTileStrings,
  countGoBackOverlapOpportunities,
  validateReverseAuthoringDragPath,
  pathCellsFromGridButtons,
} from "./debug-reverse-build.js";

let isMouseDown = false;
let isGameActive = false;
let longestWord = "";
let websiteLink = "https://wordhunter.io/";
let leaderboardLink = "https://johnriley81.pythonanywhere.com/leaderboard/";
let playerPosition;
// Temporary artifact playback override for normal mode. After a full reverse-debug
// pass, the grid is the forward start and `nextletters` is the game sack in
// queue.shift() order: head = what the *first* forward word consumes. Unplay
// order is by descending hunt score, so the first forward play must be the
// *lowest* score word, then next-lowest, …, highest last — not an arbitrary list.
// Do not reverse the exported queue; paste `nextletters_queue_json` from the
// downloaded artifact, or match `nextletters_cover_order_json` (same order).
const TEMP_ARTIFACT_PLAYBACK = {
  enabled: true,
  wordsInArtifactOrder: [
    "national",
    "treatment",
    "required",
    "happened",
    "watching",
    "questions",
    "government",
    "difficult",
    "completely",
  ],
  grid: [
    ["n", "e", "l", "h"],
    ["o", "a", "n", "i"],
    ["i", "t", "n", "e"],
    ["h", "m", "r", "d"],
  ],
  nextletters: [
    "a", "a", "i", "n", "r", "a", "a", "t", "d", "c", "e", "qu", "d", "p",
    "e", "t", "d", "i", "p", "t", "e", "i", "p", "c", "w", "o", "e", "g",
    "a", "e", "u", "n", "o", "n", "r", "s", "t", "t", "y", "qu", "m", "f",
    "f", "g", "l", "o", "v", "f", "c", "p", "l", "d", "i", "p", "d", "e",
    "e", "t", "m",
  ],
};

export function initGame(ctx, options = {}) {
  const reverseDebug = options.reverseDebug === true;
  let reverseDebugCoverOrder = [];
  let reverseDebugEntries = [];
  let reverseDebugNextIndex = 0;
  /** @type {string[][] | null} */
  let reverseDebugSlotWordPools = null;
  /** @type {HTMLElement | null} */
  let reverseDebugMetaWrap = null;

  if (reverseDebug) {
    document.body.classList.add("reverse-debug-mode");
  }

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
    rulesPerfectScore: document.getElementById("rules-perfect-score"),
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
    rulesPerfectScore,
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
  let perfectScoresList = [];
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
  let copyScoreLineUsed = false;
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
      if (reverseDebug) {
        return reverseDebugEntries.length > 0;
      }
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

  function reverseDebugListHuntTotal() {
    let s = 0;
    for (let i = 0; i < reverseDebugEntries.length; i++) {
      s += reverseDebugEntries[i].score;
    }
    return s;
  }

  function ensureReverseDebugMetaDom() {
    if (!reverseDebug || reverseDebugMetaWrap || !gameInfoContainer) return;
    const wrap = document.createElement("div");
    wrap.className = "reverse-debug-meta";
    wrap.innerHTML =
      '<div class="reverse-debug-meta__row">' +
      '<span id="reverse-debug-word-line" class="reverse-debug-meta__label" aria-live="polite"></span>' +
      '<button type="button" id="reverse-debug-swap-word" class="reverse-debug-meta__refresh">Swap word</button>' +
      "</div>" +
      '<div class="reverse-debug-meta__row">' +
      '<span id="reverse-debug-total-line" class="reverse-debug-meta__label" aria-live="polite"></span>' +
      '<button type="button" id="reverse-debug-swap-list" class="reverse-debug-meta__refresh">Swap list</button>' +
      "</div>";
    const swapWordBtn = wrap.querySelector("#reverse-debug-swap-word");
    if (swapWordBtn instanceof HTMLButtonElement && !swapWordBtn.dataset.reverseDebugWired) {
      swapWordBtn.dataset.reverseDebugWired = "1";
      swapWordBtn.addEventListener("click", () => {
        reverseDebugHandleSwapWord();
      });
    }
    const swapListBtn = wrap.querySelector("#reverse-debug-swap-list");
    if (swapListBtn instanceof HTMLButtonElement && !swapListBtn.dataset.reverseDebugWired) {
      swapListBtn.dataset.reverseDebugWired = "1";
      swapListBtn.addEventListener("click", () => {
        navigateReverseDebugAnotherSample();
      });
    }
    const ribbon = gameInfoContainer.querySelector("#queue-ribbon");
    if (ribbon && ribbon.nextSibling) {
      gameInfoContainer.insertBefore(wrap, ribbon.nextSibling);
    } else {
      gameInfoContainer.appendChild(wrap);
    }
    reverseDebugMetaWrap = wrap;
  }

  function reverseDebugDownloadArtifactTxt() {
    const params = new URLSearchParams(window.location.search);
    const sampleId = params.get("debug_sample_id") ?? "";
    const huntTotal = reverseDebugEntries.reduce((s, ent) => s + ent.score, 0);
    const forwardByScore = reverseDebugEntries
      .slice()
      .sort((a, b) => a.score - b.score);
    const lines = [
      "# word-hunter reverse-debug artifact",
      `# completed_utc: ${new Date().toISOString()}`,
      `# page: ${window.location.href}`,
      `sample_id: ${sampleId}`,
      `words: ${reverseDebugEntries.map((ent) => ent.word).join(",")}`,
      `scores: ${reverseDebugEntries.map((ent) => ent.score).join(",")}`,
      `hunt_total: ${huntTotal}`,
      "# Forward play: lowest hunt score first, then ascending (matches queue head → tail).",
      `forward_word_order: ${forwardByScore.map((e) => e.word).join(",")}`,
      "",
      "final_grid_json:",
      JSON.stringify(ctx.state.gameBoard),
      "",
      "nextletters_queue_json:",
      JSON.stringify(nextLetters),
      "",
      "nextletters_cover_order_json:",
      JSON.stringify(reverseDebugCoverOrder),
      "",
    ];
    const blob = new Blob([lines.join("\n")], {
      type: "text/plain;charset=utf-8",
    });
    const a = document.createElement("a");
    const stamp = new Date().toISOString().replace(/:/g, "-").replace(/\./g, "-");
    a.href = URL.createObjectURL(blob);
    a.download = `reverse-debug-puzzle-${stamp}.txt`;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  function reverseDebugHandleSwapWord() {
    const entry = reverseDebugEntries[reverseDebugNextIndex];
    if (!entry || !reverseDebugSlotWordPools) return;
    const next = findAlternateWordInSlotPool(
      entry,
      reverseDebugSlotWordPools,
      reverseDebugEntries,
      reverseDebugNextIndex,
    );
    const btn = reverseDebugMetaWrap?.querySelector("#reverse-debug-swap-word");
    if (!next) {
      if (btn instanceof HTMLButtonElement) {
        const prev = btn.textContent;
        btn.textContent = "No match";
        window.setTimeout(() => {
          btn.textContent = prev || "Swap word";
        }, 1200);
      }
      return;
    }
    entry.word = next;
    bumpWordReplaceEpoch(ctx);
    resetSelectionState();
    reverseDebugRenderLabels();
    updateCurrentWord();
    updateScoreStrip();
    reverseDebugSyncTileDragPreview();
  }

  function reverseDebugRenderLabels() {
    ensureReverseDebugMetaDom();
    if (!reverseDebugMetaWrap) return;
    const wordLine = reverseDebugMetaWrap.querySelector("#reverse-debug-word-line");
    const totalLine = reverseDebugMetaWrap.querySelector("#reverse-debug-total-line");
    const swapWordBtn = reverseDebugMetaWrap.querySelector("#reverse-debug-swap-word");
    const swapBtn = reverseDebugMetaWrap.querySelector("#reverse-debug-swap-list");
    if (!(wordLine instanceof HTMLElement) || !(totalLine instanceof HTMLElement)) return;
    const e = reverseDebugEntries[reverseDebugNextIndex];
    const tot = reverseDebugListHuntTotal();
    const done =
      reverseDebugEntries.length > 0 &&
      reverseDebugNextIndex >= reverseDebugEntries.length;

    if (swapWordBtn instanceof HTMLButtonElement) {
      if (done || !e) {
        swapWordBtn.disabled = true;
        swapWordBtn.title = "No current word to swap.";
      } else if (!reverseDebugSlotWordPools) {
        swapWordBtn.disabled = true;
        swapWordBtn.title =
          "Word pools unavailable — set debug_word_pools or ensure word-lists JSON loads.";
      } else {
        swapWordBtn.disabled = false;
        swapWordBtn.title =
          "Swap current word in-place: same slot, same score, same overlap rule.";
      }
    }
    if (swapBtn instanceof HTMLButtonElement) {
      swapBtn.disabled = false;
      swapBtn.title =
        "Load a different random list (same JSONL).";
    }

    if (!e) {
      if (done) {
        wordLine.textContent = "All words reversed. Artifact downloaded.";
        totalLine.textContent = `[TOT]: ${tot}`;
      } else {
        wordLine.textContent = "";
        totalLine.textContent = reverseDebugEntries.length === 0 ? "" : `[TOT]: ${tot}`;
      }
      return;
    }

    const o = countGoBackOverlapOpportunities(e.word);
    wordLine.textContent = `[${e.word}]: o${o}`;
    totalLine.textContent = `[TOT]: ${tot}`;
  }

  function enterReverseDebugPlaySurface() {
    isGameActive = true;
    startButton.disabled = true;
    startButton.classList.add("hiddenDisplay", "dock-fade-out");
    buttonContainer.classList.add("hiddenDisplay");
    boardShiftZone.classList.remove("hiddenDisplay");
    boardShiftZone.classList.add("visibleDisplay");
    doneButton.classList.add("hiddenDisplay");
    currentWordElement.classList.remove("hidden");
    currentWordElement.classList.add("visible");
    syncLineOverlaySize();
    requestAnimationFrame(syncLineOverlaySize);
    lockGridSizeForSwipe();
    score = 0;
    wordState.currentWord = "";
    updateScore();
    const buttons = grid.getElementsByClassName("grid-button");
    for (let i = 0; i < buttons.length; i++) {
      const b = buttons[i];
      b.disabled = false;
      b.classList.add("grid-button--active");
      b.classList.remove("grid-button--inactive");
    }
    crossfadeWordmarkToHappyHunting(ctx, { skipWordmark: true });
    updateCurrentWord();
    updateNextLetters();
    scheduleDeferredGameAudioWarmup();
  }

  function wireReverseDebugWordCommit() {
    wordDragHost.onCommittedSelection = (_word, selectedButtons) => {
      const entry = reverseDebugEntries[reverseDebugNextIndex];
      if (!entry) return "invalid";
      const tilesW = wordToTileStrings(entry.word);
      if (selectedButtons.length !== tilesW.length) return "invalid";
      const path = pathCellsFromGridButtons(
        selectedButtons,
        grid,
        GRID_SIZE,
      );
      if (!path || !validateReverseAuthoringDragPath(path, entry.word)) {
        return "invalid";
      }
      try {
        const out = reverseUnplayOneWord(
          ctx.state.gameBoard,
          nextLetters,
          entry.word,
          path,
        );
        ctx.state.gameBoard = out.board;
        nextLetters = out.queue;
        prependCoverOrder(reverseDebugCoverOrder, out.coverLettersThisStep);
        reverseDebugNextIndex += 1;
        syncDomFromBoardTiles(grid, ctx.state.gameBoard, GRID_SIZE, {
          allowEmptySelectable: true,
        });
        updateNextLetters();
        reverseDebugRenderLabels();
        if (reverseDebugNextIndex >= reverseDebugEntries.length) {
          reverseDebugDownloadArtifactTxt();
          reverseDebugRenderLabels();
        }
        return true;
      } catch (err) {
        console.debug("reverse unplay rejected", err);
        return "invalid";
      }
    };
  }

  if (reverseDebug) {
    loadReverseDebugSession(new URLSearchParams(window.location.search))
      .then((session) => {
        reverseDebugEntries = session.sortedEntries;
        reverseDebugSlotWordPools = session.slotWordPools ?? null;
        reverseDebugNextIndex = 0;
        reverseDebugCoverOrder = [];
        nextLetters = [];
        wordSet = new Set();
        gridsList = [];
        nextLettersList = [];
        generateGridFromBoard(session.board);
        wireReverseDebugWordCommit();
        enterReverseDebugPlaySurface();
        reverseDebugRenderLabels();
        updateScoreStrip();
        if (reverseDebugEntries.length === 0) {
          showMessage(
            ctx,
            "No word list (set debug_sample, debug_word_list, or debug_words)",
            2,
            happyHuntingColor,
          );
        }
      })
      .catch((error) => {
        console.error("Reverse debug load error:", error);
        showMessage(
          ctx,
          "Reverse debug failed to load",
          2,
          lightRedPreviewColor,
        );
      });
  } else {
    loadWordhunterTextAssets()
      .then(({ wordSet: ws, gridsList: gl, nextLettersList: nll, perfectScores: ps }) => {
        wordSet = ws;
        gridsList = gl;
        nextLettersList = nll;
        perfectScoresList = Array.isArray(ps) ? ps.slice() : [];
        generateGrid();
        nextLetters = generateNextLetters();
        updateRulesPerfectScore();
        updateNextLetters();
        startButton.disabled = false;
      })
      .catch((error) => {
        console.error("Fetch error:", error);
      });
  }

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
    const startAfterMs = leaderboardFadeFinishesLater
      ? LEADERBOARD_OVERLAY_FADE_OUT_TOTAL_MS
      : 0;
    window.setTimeout(() => {
      void startGame({ skipWordmarkInIntro: true, fadeTilesToActive: true });
    }, startAfterMs);
  });

  currentWordElement.addEventListener("click", function () {
    if (isGameActive) return;
    if (endgameUiShown && !copyScoreLineUsed) {
      void copyScoreFirstTap();
    } else {
      copyScoreQuietTap();
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
  if (!reverseDebug) {
    currentWordElement.textContent = PRE_START_WORDMARK;
    currentWordElement.style.color = "white";
  }


  function applyColumnShift(signedSteps) {
    applyColumnShiftInPlace(ctx.state.gameBoard, signedSteps, GRID_SIZE);
  }

  function applyRowShift(signedSteps) {
    applyRowShiftInPlace(ctx.state.gameBoard, signedSteps, GRID_SIZE);
  }

  function syncDomFromBoard() {
    syncDomFromBoardTiles(grid, ctx.state.gameBoard, GRID_SIZE, {
      allowEmptySelectable: reverseDebug,
    });
  }

  const shiftHost = {
    shiftState,
    uiState,
    getIsGameActive: () => {
      if (reverseDebug) {
        return reverseDebugEntries.length > 0;
      }
      return isGameActive;
    },
    getEndGameFromDoubleTapEnabled: () => !reverseDebug,
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
          "grid-button--palette-to-inactive",
          "grid-button--palette-to-active-fade-in"
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
  }

  function generateGrid() {
    while (grid.firstChild) {
      grid.removeChild(grid.firstChild);
    }
    diffDays = calculateDiffDays();
    const gridLetters = TEMP_ARTIFACT_PLAYBACK.enabled
      ? TEMP_ARTIFACT_PLAYBACK.grid
      : gridsList[diffDays % gridsList.length];
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

  function generateGridFromBoard(sourceBoard) {
    while (grid.firstChild) {
      grid.removeChild(grid.firstChild);
    }
    ctx.state.gameBoard = [];
    for (let i = 0; i < GRID_SIZE; i++) {
      ctx.state.gameBoard[i] = [];
      for (let j = 0; j < GRID_SIZE; j++) {
        const letter = sourceBoard[i][j];
        ctx.state.gameBoard[i][j] = letter;
        const button = document.createElement("button");
        button.type = "button";
        button.classList.add("grid-button", "grid-button--active");
        setTileText(button, letter);
        button.disabled = false;
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
    const raw = TEMP_ARTIFACT_PLAYBACK.enabled
      ? TEMP_ARTIFACT_PLAYBACK.nextletters
      : nextLettersList[diffDays % nextLettersList.length];
    nextLetters = Array.isArray(raw) ? raw.slice() : [];
    return nextLetters;
  }

  function updateRulesPerfectScore() {
    if (!(rulesPerfectScore instanceof HTMLElement)) return;
    if (!Array.isArray(perfectScoresList) || perfectScoresList.length === 0) return;
    const idx = diffDays % perfectScoresList.length;
    const val = Number(perfectScoresList[idx]);
    if (Number.isFinite(val) && val > 0) {
      rulesPerfectScore.textContent = String(Math.floor(val));
    }
  }

  function getLiveWordScoreBreakdown(buttonSequence) {
    const sequence = Array.isArray(buttonSequence) ? buttonSequence : [];
    if (reverseDebug) {
      const e = reverseDebugEntries[reverseDebugNextIndex];
      if (!e || sequence.length === 0) {
        return { letterSum: 0, length: 0, wordTotal: 0 };
      }
      const tiles = wordToTileStrings(e.word);
      return getLiveWordScoreBreakdownFromLabels(
        tiles.slice(0, Math.min(sequence.length, tiles.length)),
      );
    }
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
    if (endgameUiShown) return;
    currentWordElement.classList.remove("current-word--soft-hidden");
    if (reverseDebug) {
      const e = reverseDebugEntries[reverseDebugNextIndex];
      if (!e) {
        currentWordElement.textContent = "";
        currentWordElement.style.color = "white";
        return;
      }
      if (!wordState.currentWord) {
        currentWordElement.textContent = "";
        currentWordElement.style.color = "white";
        return;
      }
      currentWordElement.textContent = wordState.currentWord.toUpperCase();
      const overExisting =
        wordState.selectedButtons &&
        wordState.selectedButtons.some((b) => getTileText(b) !== "");
      const tiles = wordToTileStrings(e.word);
      const covered = wordState.selectedButtons.length;
      const expected = tiles.slice(0, covered).join("");
      const pref = wordState.currentWord.toLowerCase();
      if (overExisting) {
        currentWordElement.style.color = reverseDebugOverTileWordColor;
      } else if (expected.startsWith(pref)) {
        currentWordElement.style.color = lightGreenPreviewColor;
      } else {
        currentWordElement.style.color = lightRedPreviewColor;
      }
      return;
    }
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

  function reverseDebugClearTileDragPreview() {
    if (!reverseDebug) return;
    grid.querySelectorAll(".grid-button[data-reverse-drag-preview]").forEach((el) => {
      el.removeAttribute("data-reverse-drag-preview");
    });
  }

  function reverseDebugSyncTileDragPreview() {
    if (!reverseDebug) return;
    reverseDebugClearTileDragPreview();
    const e = reverseDebugEntries[reverseDebugNextIndex];
    if (!e) return;
    const tiles = wordToTileStrings(e.word);
    for (let p = 0; p < wordState.selectedButtons.length; p++) {
      const btn = wordState.selectedButtons[p];
      const piece = tiles[p];
      if (!piece) continue;
      btn.setAttribute(
        "data-reverse-drag-preview",
        piece === "qu" ? "QU" : piece.toUpperCase(),
      );
    }
  }

  const wordDragHost = {
    grid,
    gridLineContainer,
    nextLettersElement,
    svgNs: SVG_NS,
    gridSize: GRID_SIZE,
    getGameActive: () => {
      if (reverseDebug) {
        return reverseDebugNextIndex < reverseDebugEntries.length;
      }
      return isGameActive;
    },
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
    allowBlankSelection: reverseDebug,
    getSyntheticSelectionToken: (_button, appendIndex) => {
      if (!reverseDebug) return "";
      const e = reverseDebugEntries[reverseDebugNextIndex];
      if (!e) return "";
      const tiles = wordToTileStrings(e.word);
      return tiles[appendIndex] || "";
    },
    canSelectButtonAtStep: (button, _appendIndex, selectedSoFar) => {
      if (!reverseDebug) return true;
      const e = reverseDebugEntries[reverseDebugNextIndex];
      if (!e) return false;
      const sel = Array.isArray(selectedSoFar) ? selectedSoFar : [];
      const tentative = sel.concat([button]);
      const cells = pathCellsFromGridButtons(tentative, grid, GRID_SIZE);
      if (!cells) return false;
      return validateReverseAuthoringDragPath(cells, e.word);
    },
    getSubmitUnitCount: (_word, selectedButtons) => {
      if (reverseDebug) return selectedButtons.length;
      return _word.length;
    },
    validateWord: (word) => {
      if (reverseDebug) {
        return true;
      }
      return wordSet.has(word.toLowerCase());
    },
    getWordScoreFromSelectedTiles: (seq) =>
      getLiveWordScoreBreakdown(seq).wordTotal,
    getLongestWord: () => longestWord,
    setLongestWord: (w) => {
      longestWord = w;
    },
    addToScore: (delta) => {
      score += delta;
    },
    clearTileDragPreview: reverseDebugClearTileDragPreview,
    syncTileDragPreview: reverseDebugSyncTileDragPreview,
    ...(reverseDebug
      ? {
          getReverseWordTileLengthForSfx() {
            const e = reverseDebugEntries[reverseDebugNextIndex];
            if (!e) return 3;
            return wordToTileStrings(e.word).length;
          },
        }
      : {}),
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
    void grid.offsetWidth;
    for (let i = 0; i < tiles.length; i++) {
      const el = tiles[i];
      if (getTileText(el) === "") continue;
      el.classList.add("grid-button--endgame-exit");
    }
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
    copyScoreLineUsed = false;
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
    grid.classList.remove("grid--awaiting-retry-fade-in");
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
    copyScoreLineUsed = false;

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
        "grid-button--palette-to-active-fade-in",
        "grid-button--selected-enter",
        "grid-button--invalid-shake",
        "grid-button--word-success",
        "grid-button--word-release-green",
        "grid-button--letter-flip",
        "grid-button--letter-swap-in",
        "grid-button--endgame-exit"
      );
    }

    if (forImmediateStart && skipLeaderboardOverlayTeardown) {
      grid.classList.add("grid--awaiting-retry-fade-in");
    }

    syncLineOverlaySize();
    requestAnimationFrame(syncLineOverlaySize);
  }

  function buildClipboardScoreText() {
    let leaderboardText = "";
    if (playerPosition) {
      leaderboardText = `#${playerPosition} on `;
    }
    return `${leaderboardText}wordhunter #${diffDays} 🏹${score}\n🏆 ${longestWord.toUpperCase()} 🏆\n${websiteLink}`;
  }

  function writeScoreToClipboardPromise() {
    try {
      const text = buildClipboardScoreText();
      if (
        navigator.clipboard &&
        typeof navigator.clipboard.writeText === "function"
      ) {
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
    if (copyScoreLineUsed) return;
    copyScoreLineUsed = true;
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
    if (reverseDebug) {
      return true;
    }
    return wordSet.has(word.toLowerCase());
  }
}
