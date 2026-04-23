const greenTextColor = "#07f03a";
const redTextColor = "#f76d6d";
const lightGreenPreviewColor = "#8ff7a8";
const lightRedPreviewColor = "#ff9b9b";
const redTextColorLeaderboard = "red";
const goldTextColor = "#e3af02";
const happyHuntingColor = "gold";
const UPCOMING_LABEL = "UPCOMING:";
const UPCOMING_PREVIEW_MAX = 7;
const PRE_START_WORDMARK = "WORDHUNTER";
const INTRO_MESSAGE_TEXT = "Happy Hunting";

const GRID_SIZE = 4;
const SHIFT_STRIDE_FIRST_FRAC = 0.4;
const SHIFT_AXIS_LOCK_PX = 8;
const SHIFT_SLIDE_SENSITIVITY = 2;
const SHIFT_SETTLE_MS = 340;
const SHIFT_SETTLE_EASE = "cubic-bezier(0.2, 0.85, 0.25, 1)";
const SHIFT_COMMIT_SNAP_MS = 220;
const SHIFT_COMMIT_SNAP_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const SHIFT_COMMIT_SNAP_END_GRACE_MS = 140;
const SHIFT_REJOIN_SNAP_MS = 130;
const SHIFT_GESTURE_FALLBACK_MS = 800;
const SHIFT_TAP_MAX_TRAVEL_PX = 20;
const SHIFT_TAP_MAX_PRESS_MS = 500;
const SHIFT_DOUBLE_END_GAME_MAX_GAP_MS_TOUCH = 325;
const SHIFT_DOUBLE_END_GAME_MAX_GAP_MS_MOUSE = 550;
const SCORE_SUBMIT_THRESHOLD = 50;
const SHIFT_MIDWAY_TICK_STEPS_CAP = 64;
const START_TOUCHPAD_FADE_MS = 420;
const TILE_PALETTE_MS = 420;
const CURRENT_WORD_FADE_MS = 220;
const CURRENT_WORD_MESSAGE_EXTRA_MS = 500;
const CURRENT_WORD_MESSAGE_ON_MS = 1100 + CURRENT_WORD_MESSAGE_EXTRA_MS;
const ENDGAME_TILE_FLASH_MS = 260;
const ENDGAME_TILE_FADE_MS = 360;
const ENDGAME_TILE_SEQUENCE_MS = ENDGAME_TILE_FLASH_MS + ENDGAME_TILE_FADE_MS;
const COPY_SCORE_REVEAL_LEAD_MS = 1000;
const COPY_SCORE_SOUND_UI_LEAD_MS = 1500;
const ENDGAME_SOUND_FALLBACK_MS = 14000;
const ENDGAME_TILE_PAUSE_AFTER_GAMEOVER_MS = 500;
const GAME_OVER_FLASH_TIMES = 2;
const GAME_OVER_FLASH_HOLD_EXTRA_MS = 400;
const WORD_INVALID_SHAKE_MS = 320;
const WORD_LINE_FADE_MS = 520;
const WORD_PATH_COLOR_STEPS = 11;
const WORD_RELEASE_GREEN_MS = 255;
const WORD_LETTER_FLIP_MS = 416;
const WORD_REPLACE_FLIP_OVERLAP_MS = Math.floor(WORD_LETTER_FLIP_MS / 2);
const WORD_COMMIT_AFTER_PULSE_MS = 300;
const WORD_COMMIT_CHAIN_PULSE_MS = 48;
const WORD_REPLACE_TAIL_SLACK_MS = 160;

function syncWordReplaceAnimationCssVars() {
  const root = document.documentElement;
  root.style.setProperty("--word-release-green-ms", `${WORD_RELEASE_GREEN_MS}ms`);
  root.style.setProperty("--word-tile-flip-ms", `${WORD_LETTER_FLIP_MS}ms`);
  root.style.setProperty("--word-queue-pulse-ms", `${WORD_COMMIT_AFTER_PULSE_MS}ms`);
  root.style.setProperty("--current-word-fade-ms", `${CURRENT_WORD_FADE_MS}ms`);
}

function getWordReplaceAnimationHoldMs(tileCount) {
  const n = Math.max(1, Math.floor(Number(tileCount)) || 1);
  const greenPhaseMs = WORD_RELEASE_GREEN_MS + WORD_REPLACE_TAIL_SLACK_MS;
  const gapBetweenFlipStarts =
    WORD_LETTER_FLIP_MS - WORD_REPLACE_FLIP_OVERLAP_MS;
  const afterGreenMs =
    WORD_COMMIT_AFTER_PULSE_MS +
    (n - 1) * gapBetweenFlipStarts +
    WORD_LETTER_FLIP_MS +
    WORD_REPLACE_TAIL_SLACK_MS;
  return greenPhaseMs + afterGreenMs;
}

const WORD_SUCCESS_MESSAGE_FADE_EARLY_MS = 250;

const SCENARIO_MESSAGE_VARIANTS = Object.freeze({
  game_over: Object.freeze(["Game Over"]),
});

let isMouseDown = false;
let isGameActive = false;
let longestWord = "";
let websiteLink = "https://wordhunter.io/";
let leaderboardLink = "https://johnriley81.pythonanywhere.com/leaderboard/";
let playerPosition;
const LETTER_WEIGHTS = Object.freeze({
  a: 1,
  b: 3,
  c: 3,
  d: 2,
  e: 1,
  f: 4,
  g: 2,
  h: 4,
  i: 1,
  j: 8,
  k: 5,
  l: 1,
  m: 3,
  n: 1,
  o: 1,
  p: 3,
  q: 10,
  qu: 11,
  r: 1,
  s: 1,
  t: 1,
  u: 1,
  v: 4,
  w: 4,
  x: 8,
  y: 4,
  z: 10,
});

function normalizeTileText(text) {
  const normalized = String(text || "").trim().toLowerCase();
  if (normalized === "q") return "qu";
  return normalized;
}

function getLetterWeight(tileText) {
  const normalized = normalizeTileText(tileText);
  return LETTER_WEIGHTS[normalized] ?? 1;
}

function shiftMaxStepsPerGesture(n) {
  return Math.max(1, n - 1);
}

function shiftCommitStepsFromAxisMag(magPx, stridePx, n) {
  if (magPx <= 0) return 0;
  const first = stridePx * SHIFT_STRIDE_FIRST_FRAC;
  if (magPx < first) return 0;
  const cap = shiftMaxStepsPerGesture(n);
  return Math.min(cap, 1 + Math.floor((magPx - first) / stridePx));
}

function clampAxisMagToCommitBandForK(magPx, stridePx, k) {
  if (k <= 0 || magPx <= 0) return magPx;
  const first = stridePx * SHIFT_STRIDE_FIRST_FRAC;
  const low = first + (k - 1) * stridePx;
  const hiEx = first + k * stridePx;
  return Math.min(Math.max(magPx, low), hiEx - 1e-6);
}

function quantizeShiftVisualAxis(tx, ty, horizontal, stridePx, n) {
  const rawAxis = horizontal ? tx : ty;
  const magRaw = Math.abs(rawAxis);
  if (magRaw <= 0) {
    return { tx, ty, rawTx: tx, rawTy: ty };
  }
  const steps = shiftCommitStepsFromAxisMag(magRaw, stridePx, n);
  if (steps === 0) {
    return { tx, ty, rawTx: tx, rawTy: ty };
  }
  const sign = rawAxis >= 0 ? 1 : -1;
  const snapped = clampAxisMagToCommitBandForK(magRaw, stridePx, steps);
  if (horizontal) {
    return { tx: sign * snapped, ty: 0, rawTx: tx, rawTy: ty };
  }
  return { tx: 0, ty: sign * snapped, rawTx: tx, rawTy: ty };
}

function countShiftMidwayCrossings(prevMag, currMag, stridePx) {
  if (stridePx <= 0) return 0;
  const lo = Math.min(prevMag, currMag);
  const hi = Math.max(prevMag, currMag);
  let count = 0;
  for (let k = 0; k < SHIFT_MIDWAY_TICK_STEPS_CAP; k++) {
    const t = (k + 0.5) * stridePx;
    if (t > hi) break;
    if (t > lo) count++;
  }
  return count;
}

function pickRandomScenarioMessage(scenarioKey, fallbackMessage = "") {
  const variants = SCENARIO_MESSAGE_VARIANTS[scenarioKey];
  if (!Array.isArray(variants) || variants.length === 0) {
    return fallbackMessage;
  }
  const i = Math.floor(Math.random() * variants.length);
  return variants[i];
}

const GAME_SOUND_SPEC = [
  { id: "click", src: "sounds/click.wav" },
  { id: "button1", src: "sounds/button1.wav" },
  { id: "button2", src: "sounds/button2.wav" },
  { id: "bing", src: "sounds/bing.wav" },
  { id: "invalid", src: "sounds/invalid.wav" },
  { id: "pop", src: "sounds/pop.wav" },
  { id: "tick", src: "sounds/tick.wav" },
  { id: "gameOver", src: "sounds/gameOver.wav" },
];

const GAME_SOUND_IDS = GAME_SOUND_SPEC.map((d) => d.id);

// Word length 3→10+ maps to playbackRate; preservesPitch=false so pitch tracks rate.
const BING_PLAYBACK_RATES_FOR_LENGTH = [
  0.82, 0.9, 0.98, 1.06, 1.14, 1.22, 1.3, 1.38,
];

function setBingPitchScalesWithPlaybackRate(el) {
  if (!el) return;
  try {
    el.preservesPitch = false;
  } catch (_) {}
}

function bingPlaybackRateForWordLength(len) {
  const idx = Math.min(Math.max(len - 3, 0), 7);
  return BING_PLAYBACK_RATES_FOR_LENGTH[idx];
}

const SFX_PLAY_POOL_SIZE = 4;

function buildGameSoundsFromSpec(spec) {
  const o = {};
  for (const { id, src } of spec) {
    const a = new Audio(src);
    a.preload = "auto";
    if (id === "bing") setBingPitchScalesWithPlaybackRate(a);
    o[id] = a;
  }
  return o;
}

function buildSoundPlayPools(spec, soundMap) {
  const pools = {};
  for (const { id, src } of spec) {
    if (id === "gameOver") continue;
    const pool = [soundMap[id]];
    for (let i = 1; i < SFX_PLAY_POOL_SIZE; i++) {
      const a = new Audio(src);
      a.preload = "auto";
      if (id === "bing") setBingPitchScalesWithPlaybackRate(a);
      pool.push(a);
    }
    pools[id] = pool;
  }
  return pools;
}

let sounds = buildGameSoundsFromSpec(GAME_SOUND_SPEC);
let soundPlayPools = buildSoundPlayPools(GAME_SOUND_SPEC, sounds);
let soundPlayPoolCursor = Object.fromEntries(
  Object.keys(soundPlayPools).map((id) => [id, 0])
);

document.addEventListener("DOMContentLoaded", () => {
  syncWordReplaceAnimationCssVars();
  const grid = document.querySelector("#grid");
  const gridPan = document.getElementById("grid-pan");
  const gridStage = document.getElementById("grid-stage");
  const shiftPreviewStrip = document.getElementById("shift-preview-strip");
  const startButton = document.querySelector("#start");
  startButton.disabled = true;
  const currentWordElement = document.querySelector("#current-word");
  const queueNextHeaderElement = document.querySelector("#queue-next-header");
  const nextLettersElement = document.querySelector("#queue-next-values");
  const queueSackCountElement = document.querySelector("#queue-sack-count");
  nextLettersElement.textContent = "";
  if (queueSackCountElement) queueSackCountElement.textContent = "0";
  const scoreElement = document.querySelector("#score");
  const scoreSwipeSumElement = document.querySelector("#score-swipe-sum");
  const scoreLengthElement = document.querySelector("#score-length");
  const scoreWordTotalElement = document.querySelector("#score-word-total");
  const scoreGameTotalElement = document.querySelector("#score-game-total");
  const gameInfoContainer = document.querySelector("#game-info-container");
  const bottomDock = document.querySelector("#bottom-dock");
  const rules = document.querySelector("#rules");
  const rulesButton = document.querySelector("#rules-button");
  const muteButton = document.getElementById("mute-button");
  const doneButton = document.querySelector("#done-button");
  const boardShiftZone = document.getElementById("board-shift-zone");
  const boardShiftHints = document.getElementById("board-shift-hints");
  const boardShiftDismissButton = document.getElementById("board-shift-dismiss");
  const buttonContainer = document.getElementById("button-container");
  const retryButton = document.querySelector("#retry-button");
  const gridLineContainer = document.querySelector("#line-container");
  const SVG_NS = "http://www.w3.org/2000/svg";
  const gridLineWrapper = document.getElementById("grid-line-wrapper");
  const gridViewport = document.getElementById("grid-viewport");
  const leaderboardElements = document.getElementById("leaderboard-elements");
  const leaderboardTable = document.getElementById("leaderboard-table");
  const playerName = document.getElementById("player-name");
  const leaderboardButton = document.getElementById("leaderboard-button");

  function getTileButtonFromEvent(event) {
    if (!(event.target instanceof Element)) return null;
    const button = event.target.closest(".grid-button");
    if (!button || !grid.contains(button)) return null;
    return button;
  }

  function getTileText(el) {
    if (!el) return "";
    return normalizeTileText(el.dataset.tileText || el.textContent);
  }

  function setTileText(el, tileText) {
    const normalized = normalizeTileText(tileText);
    el.dataset.tileText = normalized;
    const isBlankTile = normalized === "";

    let glyph = el.querySelector(".tile-glyph");
    if (!glyph) {
      glyph = document.createElement("span");
      glyph.className = "tile-glyph";
      el.appendChild(glyph);
    }
    glyph.textContent = normalized;

    let badge = el.querySelector(".tile-weight-badge");
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "tile-weight-badge";
      badge.setAttribute("aria-hidden", "true");
      el.appendChild(badge);
    }
    badge.textContent = isBlankTile
      ? ""
      : String(getLetterWeight(normalized));
    badge.style.display = isBlankTile ? "none" : "";
    el.disabled = isBlankTile;
  }

  let score = 0;
  let currentWord = "";
  let nextLetters = [];
  let selectedButtons = [];
  let selectedButtonSet = new Set();
  let lastButton = null;
  let wordSet = new Set();
  let gridsList = [];
  let diffDays = 0;
  let nextLettersList = [];
  /** @type {string[][]} */
  let board = [];
  let isPaused = false;
  let isMuted = false;

  let shiftPointerId = null;
  let shiftStartX = 0;
  let shiftStartY = 0;
  let shiftPointerDownAt = 0;
  let shiftDoubleTapPrevAt = 0;
  let shiftAnimating = false;
  /** @type {null | boolean} */
  let shiftDragLockedHorizontal = null;
  let shiftVisualTx = 0;
  let shiftVisualTy = 0;
  let shiftVisualStripCount = 0;
  let shiftVisualStripHorizontal = true;
  let shiftSwipeTickPrevMag = 0;
  let shiftLockedGridWidthPx = 0;
  let shiftLockedGridHeightPx = 0;
  let currentWordMessageActive = false;
  let currentWordMessageTimer = null;
  let currentWordMessageFadeTimer = null;
  let currentWordMessageEpoch = 0;

  function beginCurrentWordMessageSession() {
    currentWordMessageEpoch++;
    const myEpoch = currentWordMessageEpoch;
    if (currentWordMessageTimer) {
      window.clearTimeout(currentWordMessageTimer);
      currentWordMessageTimer = null;
    }
    if (currentWordMessageFadeTimer) {
      window.clearTimeout(currentWordMessageFadeTimer);
      currentWordMessageFadeTimer = null;
    }
    currentWordMessageActive = true;
    return myEpoch;
  }
  let endgameBlankRestoreFallbackTimer = null;
  let startUiTransitionTimer = null;
  let endgameTileStartTimer = null;
  let endgameTileRevealTimer = null;
  let endgamePostUiReady = false;
  let endgameSoundReady = false;
  let endgameUiShown = false;
  let endgameSoundEarlyTimer = null;
  let tilePaletteTransitionTimer = null;
  let wordSubmitFeedbackTimer = null;
  let wordReplaceEpoch = 0;
  let wordReplaceLockGen = 0;
  const shiftState = {
    get pointerId() {
      return shiftPointerId;
    },
    get animating() {
      return shiftAnimating;
    },
  };
  const selectionState = {
    get isPointerDown() {
      return isMouseDown;
    },
    get selectedCount() {
      return selectedButtons.length;
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
    shiftDoubleTapPrevAt = 0;
  }

  function resetSelectionState() {
    selectedButtons = [];
    selectedButtonSet = new Set();
    lastButton = null;
    currentWord = "";
    updateCurrentWord();
    updateScoreStrip();
  }

  function clearWordSubmitFeedbackTimer() {
    if (wordSubmitFeedbackTimer !== null) {
      window.clearTimeout(wordSubmitFeedbackTimer);
      wordSubmitFeedbackTimer = null;
    }
  }

  function finishWordDragCleanup(options = {}) {
    const skipLines = options.skipLines === true;
    clearWordSubmitFeedbackTimer();
    currentWord = "";
    selectedButtons.forEach((button) => {
      button.classList.remove(
        "selected",
        "grid-button--selected-enter",
        "grid-button--invalid-shake",
        "grid-button--word-success",
        "grid-button--word-release-green",
        "grid-button--letter-flip",
        "grid-button--letter-swap-in"
      );
      button.removeAttribute("data-selection-visits");
    });
    updateCurrentWord();
    selectedButtons = [];
    selectedButtonSet = new Set();
    lastButton = null;
    updateScoreStrip();
    if (!skipLines) {
      while (gridLineContainer.firstChild) {
        gridLineContainer.firstChild.remove();
      }
    }
  }

  function wordPathDragStrokeColorAt(p) {
    let u = p % 1;
    if (u < 0) u += 1;
    const lerp = (a, b, t) => Math.round(a + (b - a) * t);
    const rRed = 4 / 11;
    const rPink = 7 / 11;
    const rBlue = 9 / 11;
    const am = { r: 255, g: 175, b: 0 };
    const rd = { r: 255, g: 0, b: 0 };
    const pk = { r: 255, g: 125, b: 195 };
    const bl = { r: 85, g: 145, b: 255 };
    if (u <= rRed) {
      const t = rRed > 0 ? u / rRed : 0;
      return `rgb(${lerp(am.r, rd.r, t)},${lerp(am.g, rd.g, t)},${lerp(
        am.b,
        rd.b,
        t
      )})`;
    }
    if (u <= rPink) {
      const t = (u - rRed) / (rPink - rRed);
      return `rgb(${lerp(rd.r, pk.r, t)},${lerp(rd.g, pk.g, t)},${lerp(
        rd.b,
        pk.b,
        t
      )})`;
    }
    if (u <= rBlue) {
      const t = (u - rPink) / (rBlue - rPink);
      return `rgb(${lerp(pk.r, bl.r, t)},${lerp(pk.g, bl.g, t)},${lerp(
        pk.b,
        bl.b,
        t
      )})`;
    }
    const t = rBlue < 1 ? (u - rBlue) / (1 - rBlue) : 0;
    return `rgb(${lerp(bl.r, am.r, t)},${lerp(bl.g, am.g, t)},${lerp(
      bl.b,
      am.b,
      t
    )})`;
  }

  function restyleAllWordConnectorLines() {
    const lineEls = gridLineContainer.querySelectorAll("line");
    let defs = gridLineContainer.querySelector("defs");
    if (lineEls.length === 0) {
      if (defs) defs.remove();
      return;
    }
    const n = selectedButtons.length;
    if (n < 2 || lineEls.length !== n - 1) return;
    if (!defs) {
      defs = document.createElementNS(SVG_NS, "defs");
      gridLineContainer.insertBefore(defs, gridLineContainer.firstChild);
    }
    defs.replaceChildren();
    const gridRect = grid.getBoundingClientRect();
    const colorSpan = WORD_PATH_COLOR_STEPS;
    const pathColorPhase = (k) => ((k / colorSpan) % 1 + 1) % 1;
    for (let i = 0; i < lineEls.length; i++) {
      const line = lineEls[i];
      const btnA = selectedButtons[i];
      const btnB = selectedButtons[i + 1];
      const lastRect = btnA.getBoundingClientRect();
      const currRect = btnB.getBoundingClientRect();
      const x1 = lastRect.left + lastRect.width / 2 - gridRect.left;
      const y1 = lastRect.top + lastRect.height / 2 - gridRect.top;
      const x2 = currRect.left + currRect.width / 2 - gridRect.left;
      const y2 = currRect.top + currRect.height / 2 - gridRect.top;
      line.setAttribute("x1", String(x1));
      line.setAttribute("y1", String(y1));
      line.setAttribute("x2", String(x2));
      line.setAttribute("y2", String(y2));
      const p0 = pathColorPhase(i);
      const p1 = pathColorPhase(i + 1);
      const gradId = `word-conn-path-grad-${i}`;
      const grad = document.createElementNS(SVG_NS, "linearGradient");
      grad.setAttribute("id", gradId);
      grad.setAttribute("gradientUnits", "userSpaceOnUse");
      grad.setAttribute("x1", String(x1));
      grad.setAttribute("y1", String(y1));
      grad.setAttribute("x2", String(x2));
      grad.setAttribute("y2", String(y2));
      const stop0 = document.createElementNS(SVG_NS, "stop");
      stop0.setAttribute("offset", "0%");
      stop0.setAttribute("stop-color", wordPathDragStrokeColorAt(p0));
      const stop1 = document.createElementNS(SVG_NS, "stop");
      stop1.setAttribute("offset", "100%");
      stop1.setAttribute("stop-color", wordPathDragStrokeColorAt(p1));
      grad.appendChild(stop0);
      grad.appendChild(stop1);
      defs.appendChild(grad);
      line.setAttribute("stroke", `url(#${gradId})`);
    }
  }

  function applyWordConnectorLineOutcome(isValid) {
    const lines = gridLineContainer.querySelectorAll("line");
    const winClass = "grid-line--result-valid";
    const loseClass = "grid-line--result-invalid";
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      line.classList.remove(winClass, loseClass);
      line.classList.add(isValid ? winClass : loseClass);
    }
  }

  function fadeOutWordConnectorLines(onComplete) {
    const lines = gridLineContainer.querySelectorAll("line");
    if (lines.length === 0) {
      if (onComplete) onComplete();
      return;
    }
    for (let i = 0; i < lines.length; i++) {
      lines[i].classList.add("grid-line--fade-out");
    }
    window.setTimeout(() => {
      while (gridLineContainer.firstChild) {
        gridLineContainer.firstChild.remove();
      }
      if (onComplete) onComplete();
    }, WORD_LINE_FADE_MS + 40);
  }

  function bumpWordReplaceEpoch() {
    wordReplaceEpoch++;
    wordReplaceLockGen = 0;
  }

  function runSuccessPopThenStaggeredFlip(tilesToReplace) {
    wordReplaceEpoch++;
    const epoch = wordReplaceEpoch;
    const n = tilesToReplace.length;
    const gridN = GRID_SIZE;
    if (n === 0) {
      return;
    }
    wordReplaceLockGen = epoch;

    let phaseBStarted = false;
    let greenDoneCount = 0;

    const runTileStep = (i) => {
      if (epoch !== wordReplaceEpoch) return;
      const head = nextLettersElement.querySelector(".queue-ribbon-letter--head");
      if (head) {
        head.classList.add("queue-ribbon-letter--pulse");
      }
      const pulseMs =
        i === 0 ? WORD_COMMIT_AFTER_PULSE_MS : WORD_COMMIT_CHAIN_PULSE_MS;
      window.setTimeout(() => {
        if (epoch !== wordReplaceEpoch) return;
        const button = tilesToReplace[i];

        const runFlipAndFinish = (nextLetter) => {
          if (epoch !== wordReplaceEpoch) return;
          if (i === 0) {
            fadeOutWordConnectorLines();
          }
          button.classList.remove("grid-button--letter-flip");
          void button.offsetWidth;
          button.classList.add("grid-button--letter-flip");

          const midMs = Math.max(40, Math.floor(WORD_LETTER_FLIP_MS / 2));
          window.setTimeout(() => {
            if (epoch !== wordReplaceEpoch) return;
            setTileText(button, nextLetter);
            const idx = Array.prototype.indexOf.call(grid.children, button);
            const r = Math.floor(idx / gridN);
            const c = idx % gridN;
            board[r][c] = nextLetter;
          }, midMs);

          const onFlipEnd = (e) => {
            if (e.target !== button) return;
            button.removeEventListener("animationend", onFlipEnd);
            button.classList.remove("grid-button--letter-flip");
            button.classList.remove("grid-button--word-release-green");
          };
          button.addEventListener("animationend", onFlipEnd);

          window.setTimeout(() => {
            if (epoch !== wordReplaceEpoch) return;
            button.classList.remove("grid-button--letter-flip");
            button.classList.remove("grid-button--word-release-green");
            button.removeEventListener("animationend", onFlipEnd);
            if (i === n - 1) {
              lastButton = null;
              wordReplaceLockGen = 0;
            }
          }, WORD_LETTER_FLIP_MS + WORD_REPLACE_TAIL_SLACK_MS);
        };

        let didShift = false;
        const afterHeadGone = () => {
          if (epoch !== wordReplaceEpoch || didShift) return;
          didShift = true;
          const nextLetter = nextLetters.shift() || "";
          updateNextLetters();
          runFlipAndFinish(nextLetter);
        };

        afterHeadGone();
      }, pulseMs);
    };

    const startPhaseB = () => {
      if (epoch !== wordReplaceEpoch || phaseBStarted) return;
      phaseBStarted = true;
      const gapBetweenFlipStarts =
        WORD_LETTER_FLIP_MS - WORD_REPLACE_FLIP_OVERLAP_MS;
      window.setTimeout(() => runTileStep(0), 0);
      for (let i = 1; i < n; i++) {
        const flipStartMs =
          WORD_COMMIT_AFTER_PULSE_MS + i * gapBetweenFlipStarts;
        const delayMs = flipStartMs - WORD_COMMIT_CHAIN_PULSE_MS;
        window.setTimeout(() => runTileStep(i), delayMs);
      }
    };

    for (let i = 0; i < n; i++) {
      const b = tilesToReplace[i];
      b.classList.remove("grid-button--word-success");
      b.classList.add("grid-button--word-release-green");
    }

    for (let i = 0; i < n; i++) {
      const btn = tilesToReplace[i];
      btn.addEventListener(
        "animationend",
        () => {
          greenDoneCount++;
          if (greenDoneCount >= n) {
            startPhaseB();
          }
        },
        { once: true }
      );
    }

    window.setTimeout(() => {
      if (epoch !== wordReplaceEpoch || phaseBStarted) return;
      startPhaseB();
    }, WORD_RELEASE_GREEN_MS + WORD_REPLACE_TAIL_SLACK_MS);
  }

  function resetShiftVisualState() {
    shiftVisualTx = 0;
    shiftVisualTy = 0;
    shiftVisualStripCount = 0;
  }

  function syncGridViewportSize() {
    if (!gridViewport) return;
    gridViewport.style.padding = "";
    gridViewport.style.width = "";
    gridViewport.style.height = "";
  }

  function lockGridSizeForSwipe() {
    if (shiftLockedGridWidthPx > 0 && shiftLockedGridHeightPx > 0) return;
    const br = grid.getBoundingClientRect();
    if (br.width < 1 || br.height < 1) return;
    shiftLockedGridWidthPx = br.width;
    shiftLockedGridHeightPx = br.height;
    grid.style.width = shiftLockedGridWidthPx + "px";
    grid.style.maxWidth = shiftLockedGridWidthPx + "px";
    grid.style.height = shiftLockedGridHeightPx + "px";
  }

  function unlockGridSizeAfterSwipe() {
    shiftLockedGridWidthPx = 0;
    shiftLockedGridHeightPx = 0;
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

  function ensureShiftPreviewElements() {
    if (!shiftPreviewStrip) return;
    let inner = shiftPreviewStrip.querySelector(".shift-preview-inner");
    if (!inner) {
      inner = document.createElement("div");
      inner.className = "shift-preview-inner";
      shiftPreviewStrip.appendChild(inner);
    }
    const cap = GRID_SIZE * GRID_SIZE;
    while (inner.querySelectorAll(".shift-preview-tile").length < cap) {
      const d = document.createElement("div");
      d.className = "grid-button grid-button--active shift-preview-tile";
      d.setAttribute("aria-hidden", "true");
      inner.appendChild(d);
    }
    inner.querySelectorAll(".shift-preview-tile").forEach((el) => {
      el.classList.add("grid-button--active");
      el.classList.remove("grid-button--inactive");
    });
  }

  function getGridCellMetrics() {
    const tile = grid.querySelector(".grid-button");
    const gap =
      parseFloat(getComputedStyle(grid).columnGap) ||
      parseFloat(getComputedStyle(grid).gap) ||
      20;
    if (!tile) {
      return { tw: 72, th: 72, gap };
    }
    const br = tile.getBoundingClientRect();
    return { tw: br.width, th: br.height, gap };
  }

  function clearShiftPreview() {
    if (gridStage) {
      gridStage.classList.remove("grid-stage--col", "grid-stage--strip-end");
    }
    if (shiftPreviewStrip) {
      shiftPreviewStrip.classList.add("shift-preview-strip--hidden");
      shiftPreviewStrip.style.width = "";
      shiftPreviewStrip.style.height = "";
      shiftPreviewStrip.style.opacity = "";
      shiftPreviewStrip.style.transition = "";
      shiftPreviewStrip.style.overflow = "";
      const inner = shiftPreviewStrip.querySelector(".shift-preview-inner");
      if (inner) {
        inner.classList.remove(
          "shift-preview-inner--col",
          "shift-preview-inner--row"
        );
        inner.style.gridTemplateColumns = "";
        inner.style.gridTemplateRows = "";
        inner.style.width = "";
        inner.style.height = "";
      }
    }
  }

  function setPreviewInnerGrid(inner, nRows, nCols, m) {
    inner.style.gridTemplateColumns = `repeat(${nCols}, ${m.tw}px)`;
    inner.style.gridTemplateRows = `repeat(${nRows}, ${m.th}px)`;
    const w = nCols * m.tw + Math.max(0, nCols - 1) * m.gap;
    const h = nRows * m.th + Math.max(0, nRows - 1) * m.gap;
    inner.style.width = w + "px";
    inner.style.height = h + "px";
  }

  function showPreviewTiles(inner, need) {
    inner.querySelectorAll(".shift-preview-tile").forEach((el, i) => {
      el.style.display = i < need ? "" : "none";
    });
  }

  function fillPreviewStripWithBoard(inner, k, mapCellToBoard) {
    const n = GRID_SIZE;
    const tiles = inner.querySelectorAll(".shift-preview-tile");
    const need = n * k;
    let t = 0;
    for (let row = 0; row < need; row++) {
      const mapped = mapCellToBoard(row, n, k);
      const ch = board[mapped.r][mapped.c];
      const el = tiles[t++];
      if (getTileText(el) !== ch) setTileText(el, ch);
    }
    showPreviewTiles(inner, need);
  }

  function fillPreviewStripHorizontalLeft(inner, k) {
    fillPreviewStripWithBoard(inner, k, (idx, n, cols) => {
      const r = Math.floor(idx / cols);
      const cInStrip = idx % cols;
      return { r, c: n - cols + cInStrip };
    });
  }

  function fillPreviewStripHorizontalRight(inner, k) {
    fillPreviewStripWithBoard(inner, k, (idx, _n, cols) => {
      const r = Math.floor(idx / cols);
      const c = idx % cols;
      return { r, c };
    });
  }

  function fillPreviewStripVerticalTop(inner, k) {
    fillPreviewStripWithBoard(inner, k, (idx, n, rows) => {
      const rInStrip = Math.floor(idx / n);
      const c = idx % n;
      return { r: n - rows + rInStrip, c };
    });
  }

  function fillPreviewStripVerticalBottom(inner, k) {
    fillPreviewStripWithBoard(inner, k, (idx, n) => {
      const r = Math.floor(idx / n);
      const c = idx % n;
      return { r, c };
    });
  }

  function refillShiftPreviewFromBoardAfterCommit(horizontal, signedVis, k, opts) {
    const reuseTileText = opts && opts.reuseTileText;
    const n = GRID_SIZE;
    const m = getGridCellMetrics();
    const inner = shiftPreviewStrip
      ? shiftPreviewStrip.querySelector(".shift-preview-inner")
      : null;
    if (!inner) return;
    const need = n * k;
    if (horizontal) {
      if (signedVis > 0) {
        setPreviewInnerGrid(inner, n, k, m);
        inner.classList.remove("shift-preview-inner--col");
        inner.classList.add("shift-preview-inner--row");
        if (!reuseTileText) {
          fillPreviewStripHorizontalLeft(inner, k);
        }
      } else {
        setPreviewInnerGrid(inner, n, k, m);
        inner.classList.remove("shift-preview-inner--col");
        inner.classList.add("shift-preview-inner--row");
        if (!reuseTileText) {
          fillPreviewStripHorizontalRight(inner, k);
        }
      }
    } else {
      if (signedVis > 0) {
        setPreviewInnerGrid(inner, k, n, m);
        inner.classList.remove("shift-preview-inner--row");
        inner.classList.add("shift-preview-inner--col");
        if (!reuseTileText) {
          fillPreviewStripVerticalTop(inner, k);
        }
      } else {
        setPreviewInnerGrid(inner, k, n, m);
        inner.classList.remove("shift-preview-inner--row");
        inner.classList.add("shift-preview-inner--col");
        if (!reuseTileText) {
          fillPreviewStripVerticalBottom(inner, k);
        }
      }
    }
    showPreviewTiles(inner, need);
  }

  function updateShiftStageVisual(txVis, tyVis, horizontal, rawTx, rawTy) {
    if (rawTx === undefined) rawTx = txVis;
    if (rawTy === undefined) rawTy = tyVis;

    if (!gridStage || !shiftPreviewStrip) {
      shiftVisualStripCount = 0;
      grid.style.transition = "none";
      grid.style.transform = `translate(${txVis}px, ${tyVis}px)`;
      return;
    }

    const inner = shiftPreviewStrip.querySelector(".shift-preview-inner");
    if (!inner) return;

    const n = GRID_SIZE;
    const m = getGridCellMetrics();
    const strideX = m.tw + m.gap;
    const strideY = m.th + m.gap;
    const gridH = grid.offsetHeight;

    if (horizontal) {
      gridStage.classList.remove("grid-stage--col");
      if (txVis > 0) {
        const magRaw = Math.abs(rawTx);
        const steps = shiftCommitStepsFromAxisMag(magRaw, strideX, n);
        if (steps === 0) {
          shiftVisualStripCount = 0;
          clearShiftPreview();
          gridStage.style.transition = "none";
          gridStage.style.transform = `translate(${txVis}px, 0)`;
          return;
        }
        const k = steps;
        shiftVisualStripCount = k;
        shiftVisualStripHorizontal = true;
        gridStage.classList.remove("grid-stage--strip-end");
        const ghostW = k * m.tw + Math.max(0, k - 1) * m.gap;
        shiftPreviewStrip.classList.remove("shift-preview-strip--hidden");
        shiftPreviewStrip.style.width = ghostW + "px";
        shiftPreviewStrip.style.height = gridH + "px";
        inner.classList.remove("shift-preview-inner--col");
        inner.classList.add("shift-preview-inner--row");
        setPreviewInnerGrid(inner, n, k, m);
        fillPreviewStripHorizontalLeft(inner, k);
        const baseX = -(ghostW + m.gap) + txVis;
        gridStage.style.transition = "none";
        gridStage.style.transform = `translate(${baseX}px, 0)`;
      } else if (txVis < 0) {
        const magRaw = Math.abs(rawTx);
        const steps = shiftCommitStepsFromAxisMag(magRaw, strideX, n);
        if (steps === 0) {
          shiftVisualStripCount = 0;
          clearShiftPreview();
          gridStage.style.transition = "none";
          gridStage.style.transform = `translate(${txVis}px, 0)`;
          return;
        }
        const k = steps;
        shiftVisualStripCount = k;
        shiftVisualStripHorizontal = true;
        gridStage.classList.add("grid-stage--strip-end");
        const ghostW = k * m.tw + Math.max(0, k - 1) * m.gap;
        shiftPreviewStrip.classList.remove("shift-preview-strip--hidden");
        shiftPreviewStrip.style.width = ghostW + "px";
        shiftPreviewStrip.style.height = gridH + "px";
        inner.classList.remove("shift-preview-inner--col");
        inner.classList.add("shift-preview-inner--row");
        setPreviewInnerGrid(inner, n, k, m);
        fillPreviewStripHorizontalRight(inner, k);
        gridStage.style.transition = "none";
        gridStage.style.transform = `translate(${txVis}px, 0)`;
      } else {
        shiftVisualStripCount = 0;
        clearShiftPreview();
        gridStage.style.transition = "none";
        gridStage.style.transform = "translate(0, 0)";
      }
    } else {
      gridStage.classList.add("grid-stage--col");
      const gridW = grid.offsetWidth;
      if (tyVis > 0) {
        const magRaw = Math.abs(rawTy);
        const steps = shiftCommitStepsFromAxisMag(magRaw, strideY, n);
        if (steps === 0) {
          shiftVisualStripCount = 0;
          clearShiftPreview();
          gridStage.style.transition = "none";
          gridStage.style.transform = `translate(0, ${tyVis}px)`;
          return;
        }
        const k = steps;
        shiftVisualStripCount = k;
        shiftVisualStripHorizontal = false;
        gridStage.classList.remove("grid-stage--strip-end");
        const ghostH = k * m.th + Math.max(0, k - 1) * m.gap;
        shiftPreviewStrip.classList.remove("shift-preview-strip--hidden");
        shiftPreviewStrip.style.width = gridW + "px";
        shiftPreviewStrip.style.height = ghostH + "px";
        inner.classList.remove("shift-preview-inner--row");
        inner.classList.add("shift-preview-inner--col");
        setPreviewInnerGrid(inner, k, n, m);
        fillPreviewStripVerticalTop(inner, k);
        const baseY = -ghostH + tyVis;
        gridStage.style.transition = "none";
        gridStage.style.transform = `translate(0, ${baseY}px)`;
      } else if (tyVis < 0) {
        const magRaw = Math.abs(rawTy);
        const steps = shiftCommitStepsFromAxisMag(magRaw, strideY, n);
        if (steps === 0) {
          shiftVisualStripCount = 0;
          clearShiftPreview();
          gridStage.style.transition = "none";
          gridStage.style.transform = `translate(0, ${tyVis}px)`;
          return;
        }
        const k = steps;
        shiftVisualStripCount = k;
        shiftVisualStripHorizontal = false;
        gridStage.classList.add("grid-stage--strip-end");
        const ghostH = k * m.th + Math.max(0, k - 1) * m.gap;
        shiftPreviewStrip.classList.remove("shift-preview-strip--hidden");
        shiftPreviewStrip.style.width = gridW + "px";
        shiftPreviewStrip.style.height = ghostH + "px";
        inner.classList.remove("shift-preview-inner--row");
        inner.classList.add("shift-preview-inner--col");
        setPreviewInnerGrid(inner, k, n, m);
        fillPreviewStripVerticalBottom(inner, k);
        gridStage.style.transition = "none";
        gridStage.style.transform = `translate(0, ${tyVis}px)`;
      } else {
        shiftVisualStripCount = 0;
        clearShiftPreview();
        gridStage.style.transition = "none";
        gridStage.style.transform = "translate(0, 0)";
      }
    }
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

  fetch("text/wordlist.txt")
    .then((response) => response.text())
    .then((data) => {
      wordSet = new Set(data.toLowerCase().split("\n"));

      return fetch("text/grids.txt");
    })
    .then((response) => response.text())
    .then((data) => {
      gridsList = data.split("\n").map((line) => {
        try {
          return JSON.parse(line);
        } catch (error) {
          console.error("Error parsing line:", line);
          console.error("Parse error:", error);
        }
      });

      return fetch("text/nextletters.txt");
    })
    .then((response) => response.text())
    .then((data) => {
      nextLettersList = data.split("\n").map((line) => {
        try {
          return JSON.parse(line);
        } catch (error) {
          console.error("Error parsing line:", line);
          console.error("Parse error:", error);
        }
      });

      generateGrid();
      nextLetters = generateNextLetters();
      updateNextLetters();
      startButton.disabled = false;
    })
    .catch((error) => {
      console.error("Fetch error:", error);
    });

  document.addEventListener("touchend", handleTouchEnd);
  document.addEventListener("mouseup", handleMouseUp);
  startButton.addEventListener("click", () => {
    void startGame();
  });

  function setRulesOverlayVisible(isVisible) {
    rules.classList.toggle("hidden", !isVisible);
    rules.classList.toggle("visible", isVisible);
    gameInfoContainer.classList.toggle("hiddenDisplay", isVisible);
    bottomDock.classList.toggle("hiddenDisplay", isVisible);
    grid.classList.toggle("hidden", isVisible);
    grid.classList.toggle("visible", !isVisible);
    if (gridPan) {
      gridPan.classList.toggle("hidden", isVisible);
      gridPan.classList.toggle("visible", !isVisible);
    }
    isPaused = isVisible;
  }

  function onRulesOverlayClick(event) {
    if (event.target.closest("a[href]")) return;
    setRulesOverlayVisible(false);
  }

  retryButton.addEventListener("click", function () {
    resetRoundToPregame({ forImmediateStart: true });
    void startGame({ skipWordmarkInIntro: true });
  });
  rules.addEventListener("click", onRulesOverlayClick);
  rulesButton.addEventListener("click", function () {
    setRulesOverlayVisible(true);
  });
  muteButton.addEventListener("click", function () {
    if (isMuted) {
      isMuted = false;
      muteButton.textContent = "🔔";
    } else {
      isMuted = true;
      muteButton.textContent = "🔕";
    }
  });

  currentWordElement.addEventListener("click", function () {
    if (!isGameActive) {
      copyToClipboard(score, longestWord, diffDays);
    }
  });

  leaderboardButton.addEventListener("click", () => getLeaderboard(true));
  updateCurrentWord();
  currentWordElement.textContent = PRE_START_WORDMARK;
  currentWordElement.style.color = "white";

  let shiftTickCtx = null;
  let shiftTickBuffer = null;
  let shiftTickDecodePromise = null;
  let shiftTickScheduleEnd = 0;

  const SHIFT_TICK_POOL_SIZE = 12;
  const shiftTickPool = Array.from({ length: SHIFT_TICK_POOL_SIZE }, () => {
    const a = new Audio("sounds/tick.wav");
    a.preload = "auto";
    return a;
  });
  let shiftTickPoolIndex = 0;

  let gameAudioUnlocked = false;
  let gameAudioUnlockInFlight = null;

  function ensureShiftTickAudio() {
    if (shiftTickDecodePromise) return shiftTickDecodePromise;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) {
      shiftTickDecodePromise = Promise.resolve();
      return shiftTickDecodePromise;
    }
    shiftTickDecodePromise = (async () => {
      shiftTickCtx = new Ctx();
      const res = await fetch("sounds/tick.wav");
      if (!res.ok) throw new Error("tick fetch failed");
      const arr = await res.arrayBuffer();
      const copy = arr.slice(0);
      shiftTickBuffer = await shiftTickCtx.decodeAudioData(copy);
    })().catch(() => {
      shiftTickCtx = null;
      shiftTickBuffer = null;
      shiftTickDecodePromise = null;
    });
    return shiftTickDecodePromise;
  }

  function unlockGameAudio() {
    if (gameAudioUnlocked) return Promise.resolve();
    if (gameAudioUnlockInFlight) return gameAudioUnlockInFlight;
    gameAudioUnlockInFlight = (async () => {
      try {
        async function primeHtmlAudioElement(el) {
          const prevMuted = el.muted;
          try {
            el.muted = true;
            await el.play();
            el.pause();
            el.currentTime = 0;
          } catch (_) {
          } finally {
            el.muted = prevMuted;
          }
        }
        for (const key of Object.keys(sounds)) {
          await primeHtmlAudioElement(sounds[key]);
        }
        for (const id of Object.keys(soundPlayPools)) {
          const pool = soundPlayPools[id];
          for (let i = 1; i < pool.length; i++) {
            await primeHtmlAudioElement(pool[i]);
          }
        }
        await ensureShiftTickAudio();
        if (shiftTickCtx && shiftTickCtx.state !== "closed") {
          try {
            await shiftTickCtx.resume();
            shiftTickScheduleEnd = shiftTickCtx.currentTime;
          } catch (_) {}
        }
        gameAudioUnlocked = true;
      } finally {
        gameAudioUnlockInFlight = null;
      }
    })();
    return gameAudioUnlockInFlight;
  }

  function playShiftTicksHtml5Pool(nPlay) {
    const cap = Math.min(nPlay, 10);
    for (let i = 0; i < cap; i++) {
      const a = shiftTickPool[shiftTickPoolIndex];
      shiftTickPoolIndex = (shiftTickPoolIndex + 1) % shiftTickPool.length;
      try {
        a.pause();
        a.currentTime = 0;
      } catch (_) {}
      void a.play().catch(() => {});
    }
  }

  function playShiftTicks(count) {
    if (isMuted || count <= 0) return;
    const nPlay = Math.min(count, 28);
    if (shiftTickBuffer && shiftTickCtx) {
      if (shiftTickCtx.state === "suspended") {
        void shiftTickCtx
          .resume()
          .then(() => {
            if (shiftTickCtx) {
              shiftTickScheduleEnd = shiftTickCtx.currentTime;
            }
          })
          .catch(() => {});
        playShiftTicksHtml5Pool(nPlay);
        return;
      }
      try {
        void shiftTickCtx.resume();
      } catch (_) {}
      const spacing = 0.0032;
      const now = shiftTickCtx.currentTime;
      if (shiftTickScheduleEnd > now + 0.12) {
        shiftTickScheduleEnd = now;
      }
      let t = Math.max(now + 0.0015, shiftTickScheduleEnd);
      for (let i = 0; i < nPlay; i++) {
        const src = shiftTickCtx.createBufferSource();
        src.buffer = shiftTickBuffer;
        src.connect(shiftTickCtx.destination);
        src.start(t + i * spacing);
      }
      shiftTickScheduleEnd = t + nPlay * spacing;
      return;
    }
    playShiftTicksHtml5Pool(nPlay);
  }

  function armOneShotAudioUnlockOnGridAndShift() {
    const onFirstPointer = () => {
      void unlockGameAudio();
    };
    grid.addEventListener("pointerdown", onFirstPointer, {
      once: true,
      capture: true,
    });
    boardShiftZone.addEventListener("pointerdown", onFirstPointer, {
      once: true,
      capture: true,
    });
  }

  armOneShotAudioUnlockOnGridAndShift();

  void ensureShiftTickAudio();

  boardShiftZone.addEventListener("pointerdown", onShiftPointerDown, {
    passive: false,
  });
  boardShiftZone.addEventListener("pointermove", onShiftPointerMove, {
    passive: false,
  });
  boardShiftZone.addEventListener("pointerup", onShiftPointerUp, {
    passive: false,
  });
  boardShiftZone.addEventListener("pointercancel", onShiftPointerUp, {
    passive: false,
  });
  boardShiftZone.addEventListener(
    "touchmove",
    (event) => {
      if (!isGameActive || isPaused) return;
      if (event.cancelable) event.preventDefault();
    },
    { passive: false }
  );
  boardShiftZone.addEventListener(
    "touchend",
    (event) => {
      if (!isGameActive || isPaused) return;
      if (event.cancelable) event.preventDefault();
    },
    { passive: false }
  );
  if (boardShiftDismissButton && boardShiftHints) {
    let boardShiftHintsHideInProgress = false;
    const BOARD_SHIFT_HINTS_FADE_MS = 320;
    const hideBoardShiftHints = (event) => {
      if (event.cancelable) event.preventDefault();
      event.stopPropagation();
      if (
        boardShiftHintsHideInProgress ||
        boardShiftHints.classList.contains("hiddenDisplay")
      ) {
        return;
      }
      playSound("button2", isMuted);
      boardShiftHintsHideInProgress = true;
      boardShiftZone.classList.add("board-shift-zone--instructions-fading");
      let finalized = false;
      const finalize = () => {
        if (finalized) return;
        finalized = true;
        boardShiftHints.removeEventListener("transitionend", onTransitionEnd);
        window.clearTimeout(fallbackTimer);
        boardShiftHints.classList.add("hiddenDisplay");
        boardShiftDismissButton.classList.add("hiddenDisplay");
        boardShiftZone.classList.remove(
          "board-shift-zone--instructions-fading"
        );
        boardShiftHintsHideInProgress = false;
      };
      const onTransitionEnd = (e) => {
        if (e.target !== boardShiftHints || e.propertyName !== "opacity") {
          return;
        }
        finalize();
      };
      boardShiftHints.addEventListener("transitionend", onTransitionEnd);
      const fallbackTimer = window.setTimeout(
        finalize,
        BOARD_SHIFT_HINTS_FADE_MS + 80
      );
    };
    boardShiftDismissButton.addEventListener("pointerdown", (event) => {
      if (event.cancelable) event.preventDefault();
      event.stopPropagation();
    });
    boardShiftDismissButton.addEventListener("pointerup", hideBoardShiftHints, {
      passive: false,
    });
    boardShiftDismissButton.addEventListener("touchend", hideBoardShiftHints, {
      passive: false,
    });
    boardShiftDismissButton.addEventListener("click", hideBoardShiftHints);
  }

  function resetShiftDragVisualHard() {
    if (gridPan) {
      gridPan.style.transition = "";
      gridPan.style.transform = "";
    }
    if (gridStage) {
      gridStage.style.transition = "";
      gridStage.style.transform = "";
    }
    grid.style.transition = "";
    grid.style.transform = "";
    clearShiftPreview();
    shiftVisualTx = 0;
    shiftVisualTy = 0;
    shiftVisualStripCount = 0;
    unlockGridSizeAfterSwipe();
    if (gridLineWrapper) {
      gridLineWrapper.classList.remove("grid-line-wrapper--shift-clipping");
    }
    syncLineOverlaySize();
  }

  function finishShiftSwipeAnimation() {
    if (gridPan) {
      gridPan.style.transition = "";
      gridPan.style.transform = "";
    }
    if (gridStage) {
      gridStage.style.transition = "";
      gridStage.style.transform = "";
    }
    grid.style.transition = "";
    grid.style.transform = "";
    clearShiftPreview();
    shiftVisualStripCount = 0;
    if (gridLineWrapper) {
      gridLineWrapper.classList.remove("grid-line-wrapper--shift-clipping");
    }
    shiftAnimating = false;
    syncLineOverlaySize();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        unlockGridSizeAfterSwipe();
        syncLineOverlaySize();
      });
    });
  }

  function cancelGridShiftAnimations() {
    if (typeof grid.getAnimations === "function") {
      grid.getAnimations().forEach((a) => a.cancel());
    }
    if (gridStage && typeof gridStage.getAnimations === "function") {
      gridStage.getAnimations().forEach((a) => a.cancel());
    }
  }

  function animateGridSettleFromTo(dx, dy, onDone, durationMs) {
    const settleMs = durationMs != null ? durationMs : SHIFT_SETTLE_MS;
    const startT = `translate(${dx}px, ${dy}px)`;
    const endT = "translate(0px, 0px)";
    let doneCalled = false;
    let fallbackTimer = 0;

    const finish = () => {
      if (doneCalled) return;
      doneCalled = true;
      if (fallbackTimer) window.clearTimeout(fallbackTimer);
      cancelGridShiftAnimations();
      grid.style.transform = "";
      grid.style.transition = "";
      onDone();
    };

    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
      finish();
      return;
    }

    fallbackTimer = window.setTimeout(finish, SHIFT_GESTURE_FALLBACK_MS);

    if (typeof grid.animate === "function") {
      const anim = grid.animate([{ transform: startT }, { transform: endT }], {
        duration: settleMs,
        easing: "cubic-bezier(0.2, 0.85, 0.25, 1)",
        fill: "forwards",
      });
      anim.finished
        .then(() => finish())
        .catch(() => finish());
      return;
    }

    grid.style.transition = "none";
    grid.style.transform = startT;
    requestAnimationFrame(() => {
      grid.style.transition = `transform ${settleMs}ms ${SHIFT_SETTLE_EASE}`;
      grid.style.transform = endT;
      const onEnd = (ev) => {
        if (ev.target !== grid || ev.propertyName !== "transform") return;
        grid.removeEventListener("transitionend", onEnd);
        finish();
      };
      grid.addEventListener("transitionend", onEnd);
    });
  }

  function computeShiftSnapPlan(horizontal, signedVis, k, mDrag, stageTransformFromDrag) {
    const stride = horizontal ? mDrag.tw + mDrag.gap : mDrag.th + mDrag.gap;
    const mag = Math.abs(signedVis);
    const snappedMag = clampAxisMagToCommitBandForK(mag, stride, k);
    const snappedSigned = signedVis >= 0 ? snappedMag : -snappedMag;
    const targetTransform = computeShiftStageTransformString(
      horizontal,
      snappedSigned,
      k,
      mDrag
    );
    const skipSnapAnimate = stageTransformsWithinPx(
      stageTransformFromDrag,
      targetTransform,
      0.45
    );
    return { targetTransform, skipSnapAnimate };
  }

  function computeShiftStageTransformString(horizontal, signedAxis, k, m) {
    if (horizontal) {
      const tx = signedAxis;
      if (tx > 0) {
        const ghostW = k * m.tw + Math.max(0, k - 1) * m.gap;
        const baseX = -(ghostW + m.gap) + tx;
        return `translate(${baseX}px, 0)`;
      }
      if (tx < 0) {
        return `translate(${tx}px, 0)`;
      }
      return "translate(0px, 0px)";
    }

    const ty = signedAxis;
    if (ty > 0) {
      const ghostH = k * m.th + Math.max(0, k - 1) * m.gap;
      const baseY = -ghostH + ty;
      return `translate(0px, ${baseY}px)`;
    }
    if (ty < 0) {
      return `translate(0px, ${ty}px)`;
    }
    return "translate(0px, 0px)";
  }

  function parseStageTranslatePx(transformCss) {
    if (!transformCss || transformCss === "none") return { x: 0, y: 0 };
    try {
      const m = new DOMMatrixReadOnly(transformCss);
      return { x: m.m41, y: m.m42 };
    } catch (_) {
      return { x: 0, y: 0 };
    }
  }

  function gridInverseCompensateTranslateString(stageTransformCss) {
    const { x, y } = parseStageTranslatePx(stageTransformCss);
    return `translate(${-x}px, ${-y}px)`;
  }

  function stageTransformsWithinPx(a, b, epsPx) {
    const pa = parseStageTranslatePx(a);
    const pb = parseStageTranslatePx(b);
    return Math.hypot(pa.x - pb.x, pa.y - pb.y) < epsPx;
  }

  function runShiftSpringBackToZero() {
    const hadMove = shiftVisualTx !== 0 || shiftVisualTy !== 0;
    shiftVisualTx = 0;
    shiftVisualTy = 0;
    if (!hadMove) {
      if (gridLineWrapper) {
        gridLineWrapper.classList.remove("grid-line-wrapper--shift-clipping");
      }
      clearShiftPreview();
      if (gridStage) {
        gridStage.style.transition = "";
        gridStage.style.transform = "";
      }
      if (gridPan) {
        gridPan.style.transition = "";
        gridPan.style.transform = "";
      }
      grid.style.transition = "";
      grid.style.transform = "";
      syncLineOverlaySize();
      return;
    }

    shiftAnimating = true;
    if (gridLineWrapper) {
      gridLineWrapper.classList.add("grid-line-wrapper--shift-clipping");
    }

    const before = grid.getBoundingClientRect();
    clearShiftPreview();
    if (gridStage) {
      gridStage.style.transition = "none";
      gridStage.style.transform = "";
    }
    if (gridPan) {
      gridPan.style.transition = "none";
      gridPan.style.transform = "";
    }
    grid.style.transition = "none";
    grid.style.transform = "";
    void grid.offsetHeight;
    const after = grid.getBoundingClientRect();
    const dx = before.left - after.left;
    const dy = before.top - after.top;

    syncLineOverlaySize();
    animateGridSettleFromTo(dx, dy, () => {
      finishShiftSwipeAnimation();
    });
  }

  function runShiftSettleAfterDrag(applyShift, meta) {
    const { horizontal, signedVis, k } = meta;
    shiftVisualTx = 0;
    shiftVisualTy = 0;

    shiftAnimating = true;
    if (gridLineWrapper) {
      gridLineWrapper.classList.add("grid-line-wrapper--shift-clipping");
    }

    const useStageSettle =
      gridStage &&
      shiftPreviewStrip &&
      !shiftPreviewStrip.classList.contains("shift-preview-strip--hidden");

    if (!useStageSettle) {
      const before = grid.getBoundingClientRect();
      clearShiftPreview();
      if (gridStage) {
        gridStage.style.transition = "none";
        gridStage.style.transform = "";
      }
      if (gridPan) {
        gridPan.style.transition = "none";
        gridPan.style.transform = "";
      }
      grid.style.transition = "none";
      grid.style.transform = "";
      applyShift();
      syncDomFromBoard();
      void grid.offsetHeight;
      const after = grid.getBoundingClientRect();
      const dx = before.left - after.left;
      const dy = before.top - after.top;
      syncLineOverlaySize();
      animateGridSettleFromTo(dx, dy, () => {
        finishShiftSwipeAnimation();
      });
      return;
    }

    const mDrag = getGridCellMetrics();
    let stageTransformFromDrag = gridStage.style.transform;
    if (!stageTransformFromDrag) {
      stageTransformFromDrag = computeShiftStageTransformString(
        horizontal,
        signedVis,
        k,
        mDrag
      );
    }

    grid.style.transition = "none";
    grid.style.transform = "";

    const { targetTransform, skipSnapAnimate } = computeShiftSnapPlan(
      horizontal,
      signedVis,
      k,
      mDrag,
      stageTransformFromDrag
    );

    const useWaapiSettle =
      typeof gridStage.animate === "function" &&
      typeof grid.animate === "function";

    let rejoinDone = false;
    let fallbackTimer;
    let snapEndTimer = null;
    let snapStageTransitionEndHandler = null;
    let snapWaapiAnim = null;
    let snapWaapiSafetyTimer = null;
    let rejoinWaapiStageAnim = null;
    let rejoinWaapiGridAnim = null;
    let rejoinWaapiSafetyTimer = null;
    let commitDone = false;

    const commitBoardNow = () => {
      if (commitDone) return;
      commitDone = true;
      applyShift();
      syncDomFromBoard();
      syncLineOverlaySize();
    };

    const afterSnapTeardown = () => {
      if (rejoinDone) {
        return;
      }
      rejoinDone = true;
      window.clearTimeout(fallbackTimer);
      if (snapEndTimer != null) {
        window.clearTimeout(snapEndTimer);
        snapEndTimer = null;
      }
      if (snapWaapiSafetyTimer != null) {
        window.clearTimeout(snapWaapiSafetyTimer);
        snapWaapiSafetyTimer = null;
      }
      if (snapWaapiAnim) {
        try {
          snapWaapiAnim.cancel();
        } catch (_) {}
        snapWaapiAnim = null;
      }
      if (gridStage && snapStageTransitionEndHandler) {
        gridStage.removeEventListener(
          "transitionend",
          snapStageTransitionEndHandler
        );
        snapStageTransitionEndHandler = null;
      }
      if (gridStage) {
        gridStage.style.transition = "";
      }
      const stageCssForComp =
        gridStage && gridStage.style.transform
          ? gridStage.style.transform
          : "none";
      const gridComp0 = gridInverseCompensateTranslateString(stageCssForComp);
      grid.style.transition = "none";
      grid.style.transform = gridComp0;
      void grid.offsetHeight;
      clearShiftPreview();
      commitBoardNow();

      const stageT = gridStage ? gridStage.style.transform : "";
      const stageAtRest =
        !stageT ||
        stageT === "none" ||
        stageT === "translate(0px, 0px)" ||
        stageT === "translate(0, 0)";

      let rejoinTimer = null;
      let rejoinFinished = false;
      let rejoinStageEnded = false;
      let rejoinGridEnded = false;

      function onRejoinTransitionEnd(ev) {
        if (ev.target !== gridStage && ev.target !== grid) {
          return;
        }
        if (ev.propertyName !== "transform" && ev.propertyName !== "translate") {
          return;
        }
        if (rejoinTimer != null) {
          window.clearTimeout(rejoinTimer);
          rejoinTimer = null;
        }
        if (ev.target === gridStage) {
          if (rejoinStageEnded) return;
          rejoinStageEnded = true;
        } else {
          if (rejoinGridEnded) return;
          rejoinGridEnded = true;
        }
        if (rejoinStageEnded && rejoinGridEnded) {
          if (gridStage) {
            gridStage.removeEventListener(
              "transitionend",
              onRejoinTransitionEnd
            );
          }
          grid.removeEventListener("transitionend", onRejoinTransitionEnd);
          finishRejoin();
        }
      }

      function finishRejoin() {
        if (rejoinFinished) {
          return;
        }
        rejoinFinished = true;
        if (rejoinWaapiSafetyTimer != null) {
          window.clearTimeout(rejoinWaapiSafetyTimer);
          rejoinWaapiSafetyTimer = null;
        }
        if (rejoinWaapiStageAnim) {
          try {
            rejoinWaapiStageAnim.cancel();
          } catch (_) {}
          rejoinWaapiStageAnim = null;
        }
        if (rejoinWaapiGridAnim) {
          try {
            rejoinWaapiGridAnim.cancel();
          } catch (_) {}
          rejoinWaapiGridAnim = null;
        }
        if (rejoinTimer != null) {
          window.clearTimeout(rejoinTimer);
          rejoinTimer = null;
        }
        if (gridStage) {
          gridStage.removeEventListener(
            "transitionend",
            onRejoinTransitionEnd
          );
        }
        grid.removeEventListener("transitionend", onRejoinTransitionEnd);
        if (gridStage) {
          gridStage.style.transition = "";
          gridStage.style.transform = "";
        }
        grid.style.transition = "";
        grid.style.transform = "";
        finishShiftSwipeAnimation();
      }

      if (!gridStage || stageAtRest) {
        finishRejoin();
        return;
      }

      if (useWaapiSettle) {
        const stageFrom =
          gridStage.style.transform || "translate(0px, 0px)";
        gridStage.style.transition = "none";
        void gridStage.offsetHeight;
        void grid.offsetHeight;
        rejoinWaapiStageAnim = gridStage.animate(
          [{ transform: stageFrom }, { transform: "translate(0px, 0px)" }],
          {
            duration: SHIFT_REJOIN_SNAP_MS,
            easing: SHIFT_COMMIT_SNAP_EASE,
            fill: "forwards",
          }
        );
        rejoinWaapiGridAnim = grid.animate(
          [{ transform: gridComp0 }, { transform: "translate(0px, 0px)" }],
          {
            duration: SHIFT_REJOIN_SNAP_MS,
            easing: SHIFT_COMMIT_SNAP_EASE,
            fill: "forwards",
          }
        );
        rejoinWaapiSafetyTimer = window.setTimeout(() => {
          rejoinWaapiSafetyTimer = null;
          finishRejoin();
        }, SHIFT_REJOIN_SNAP_MS + SHIFT_COMMIT_SNAP_END_GRACE_MS);
        Promise.all([
          rejoinWaapiStageAnim.finished,
          rejoinWaapiGridAnim.finished,
        ])
          .then(() => {
            if (rejoinWaapiSafetyTimer != null) {
              window.clearTimeout(rejoinWaapiSafetyTimer);
              rejoinWaapiSafetyTimer = null;
            }
            if (rejoinFinished) return;
            finishRejoin();
          })
          .catch(() => {});
      } else {
        rejoinTimer = window.setTimeout(() => {
          rejoinTimer = null;
          finishRejoin();
        }, SHIFT_REJOIN_SNAP_MS + SHIFT_COMMIT_SNAP_END_GRACE_MS);

        gridStage.style.transition = "none";
        void gridStage.offsetHeight;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (gridStage) {
              gridStage.removeEventListener(
                "transitionend",
                onRejoinTransitionEnd
              );
              gridStage.addEventListener(
                "transitionend",
                onRejoinTransitionEnd
              );
            }
            grid.removeEventListener(
              "transitionend",
              onRejoinTransitionEnd
            );
            grid.addEventListener("transitionend", onRejoinTransitionEnd);
            gridStage.style.transition = `transform ${SHIFT_REJOIN_SNAP_MS}ms ${SHIFT_COMMIT_SNAP_EASE}`;
            grid.style.transition = `transform ${SHIFT_REJOIN_SNAP_MS}ms ${SHIFT_COMMIT_SNAP_EASE}`;
            void grid.offsetHeight;
            void gridStage.offsetHeight;
            gridStage.style.transform = "translate(0px, 0px)";
            grid.style.transform = "translate(0px, 0px)";
          });
        });
      }
    };

    fallbackTimer = window.setTimeout(() => {
      afterSnapTeardown();
    }, SHIFT_GESTURE_FALLBACK_MS);

    syncLineOverlaySize();

    if (skipSnapAnimate) {
      gridStage.style.transition = "none";
      gridStage.style.transform = targetTransform;
      void grid.offsetHeight;
      requestAnimationFrame(() => afterSnapTeardown());
    } else if (useWaapiSettle) {
      gridStage.style.transition = "none";
      gridStage.style.transform = stageTransformFromDrag;
      void gridStage.offsetHeight;
      snapWaapiAnim = gridStage.animate(
        [{ transform: stageTransformFromDrag }, { transform: targetTransform }],
        {
          duration: SHIFT_COMMIT_SNAP_MS,
          easing: SHIFT_COMMIT_SNAP_EASE,
          fill: "forwards",
        }
      );
      snapWaapiSafetyTimer = window.setTimeout(() => {
        snapWaapiSafetyTimer = null;
        afterSnapTeardown();
      }, SHIFT_COMMIT_SNAP_MS + SHIFT_COMMIT_SNAP_END_GRACE_MS);
      snapWaapiAnim.finished
        .then(() => {
          if (snapWaapiSafetyTimer != null) {
            window.clearTimeout(snapWaapiSafetyTimer);
            snapWaapiSafetyTimer = null;
          }
          if (rejoinDone) return;
          afterSnapTeardown();
        })
        .catch(() => {});
    } else {
      snapStageTransitionEndHandler = (ev) => {
        if (ev.target !== gridStage) {
          return;
        }
        if (ev.propertyName !== "transform" && ev.propertyName !== "translate") {
          return;
        }
        if (gridStage && snapStageTransitionEndHandler) {
          gridStage.removeEventListener(
            "transitionend",
            snapStageTransitionEndHandler
          );
          snapStageTransitionEndHandler = null;
        }
        window.clearTimeout(snapEndTimer);
        snapEndTimer = null;
        afterSnapTeardown();
      };
      snapEndTimer = window.setTimeout(() => {
        snapEndTimer = null;
        afterSnapTeardown();
      }, SHIFT_COMMIT_SNAP_MS + SHIFT_COMMIT_SNAP_END_GRACE_MS);
      gridStage.style.transition = "none";
      gridStage.style.transform = stageTransformFromDrag;
      void gridStage.offsetHeight;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (gridStage && snapStageTransitionEndHandler) {
            gridStage.removeEventListener(
              "transitionend",
              snapStageTransitionEndHandler
            );
          }
          gridStage.addEventListener(
            "transitionend",
            snapStageTransitionEndHandler
          );
          gridStage.style.transition = `transform ${SHIFT_COMMIT_SNAP_MS}ms ${SHIFT_COMMIT_SNAP_EASE}`;
          gridStage.style.transform = targetTransform;
        });
      });
    }
  }

  function onShiftPointerDown(e) {
    if (!uiState.gameActive || uiState.paused || shiftState.animating) return;
    if (e.button != null && e.button !== 0) return;
    if (e.cancelable) e.preventDefault();
    shiftPointerDownAt = performance.now();
    void unlockGameAudio();
    cancelGridShiftAnimations();
    shiftPointerId = e.pointerId;
    shiftStartX = e.clientX;
    shiftStartY = e.clientY;
    shiftDragLockedHorizontal = null;
    resetShiftVisualState();
    shiftVisualStripHorizontal = false;
    shiftSwipeTickPrevMag = 0;
    if (gridPan) {
      gridPan.style.transition = "";
      gridPan.style.transform = "";
    }
    if (gridStage) {
      gridStage.style.transition = "";
      gridStage.style.transform = "";
    }
    grid.style.transition = "";
    grid.style.transform = "";
    clearShiftPreview();
    unlockGridSizeAfterSwipe();
    lockGridSizeForSwipe();
    if (gridLineWrapper) {
      gridLineWrapper.classList.remove("grid-line-wrapper--shift-clipping");
    }
    syncLineOverlaySize();
    try {
      boardShiftZone.setPointerCapture(e.pointerId);
    } catch (_) {}
  }

  function onShiftPointerMove(e) {
    if (shiftState.pointerId !== e.pointerId || shiftState.animating) return;
    if (e.cancelable) e.preventDefault();

    const samples =
      typeof e.getCoalescedEvents === "function"
        ? (() => {
            const c = e.getCoalescedEvents();
            return c.length ? c : [e];
          })()
        : [e];

    let tickCrossingsTotal = 0;
    let tickMagCursor = shiftSwipeTickPrevMag;

    for (let si = 0; si < samples.length; si++) {
      const sample = samples[si];
      const sdx = sample.clientX - shiftStartX;
      const sdy = sample.clientY - shiftStartY;
      const sadx = Math.abs(sdx);
      const sady = Math.abs(sdy);

      const wasLocked = shiftDragLockedHorizontal !== null;
      if (
        !wasLocked &&
        Math.max(sadx, sady) >= SHIFT_AXIS_LOCK_PX
      ) {
        shiftDragLockedHorizontal = sadx >= sady;
      }

      if (shiftDragLockedHorizontal === null) {
        continue;
      }

      const justLocked = !wasLocked && shiftDragLockedHorizontal !== null;
      if (justLocked) {
        tickMagCursor = 0;
      }

      const n = GRID_SIZE;
      const m = getGridCellMetrics();
      const stride = shiftDragLockedHorizontal ? m.tw + m.gap : m.th + m.gap;
      const maxSlide = shiftMaxStepsPerGesture(n) * stride;
      const axis = shiftDragLockedHorizontal ? sdx : sdy;
      const clamped = Math.max(
        Math.min(axis * SHIFT_SLIDE_SENSITIVITY, maxSlide),
        -maxSlide
      );
      const mag = Math.abs(clamped);
      tickCrossingsTotal += countShiftMidwayCrossings(
        tickMagCursor,
        mag,
        stride
      );
      tickMagCursor = mag;
    }

    if (shiftDragLockedHorizontal === null) {
      if (gridPan) {
        gridPan.style.transition = "none";
        gridPan.style.transform = "";
      }
      if (gridStage) {
        gridStage.style.transition = "none";
        gridStage.style.transform = "translate(0, 0)";
      }
      grid.style.transition = "none";
      grid.style.transform = "translate(0, 0)";
      clearShiftPreview();
      resetShiftVisualState();
      shiftSwipeTickPrevMag = 0;
      syncLineOverlaySize();
      return;
    }

    shiftSwipeTickPrevMag = tickMagCursor;
    playShiftTicks(tickCrossingsTotal);

    const dx = e.clientX - shiftStartX;
    const dy = e.clientY - shiftStartY;
    const n = GRID_SIZE;
    const m = getGridCellMetrics();
    const stride = shiftDragLockedHorizontal ? m.tw + m.gap : m.th + m.gap;
    const maxSlide = shiftMaxStepsPerGesture(n) * stride;
    const axis = shiftDragLockedHorizontal ? dx : dy;
    const clamped = Math.max(
      Math.min(axis * SHIFT_SLIDE_SENSITIVITY, maxSlide),
      -maxSlide
    );
    let tx = 0;
    let ty = 0;
    if (shiftDragLockedHorizontal) {
      tx = clamped;
    } else {
      ty = clamped;
    }
    const q = quantizeShiftVisualAxis(
      tx,
      ty,
      shiftDragLockedHorizontal,
      stride,
      n
    );
    updateShiftStageVisual(q.tx, q.ty, shiftDragLockedHorizontal, q.rawTx, q.rawTy);
    shiftVisualTx = q.tx;
    shiftVisualTy = q.ty;
    syncLineOverlaySize();
  }

  function onShiftPointerUp(e) {
    if (shiftState.pointerId !== e.pointerId) return;
    if (e.cancelable) e.preventDefault();
    try {
      boardShiftZone.releasePointerCapture(e.pointerId);
    } catch (_) {}
    const dx = e.clientX - shiftStartX;
    const dy = e.clientY - shiftStartY;
    const travel = Math.hypot(dx, dy);
    const pressMs = performance.now() - shiftPointerDownAt;
    const lockedHorizontal = shiftDragLockedHorizontal;
    shiftDragLockedHorizontal = null;
    shiftPointerId = null;

    const noSwipeAxisLock = lockedHorizontal === null;
    const looksLikeTap =
      noSwipeAxisLock &&
      travel < SHIFT_TAP_MAX_TRAVEL_PX &&
      pressMs < SHIFT_TAP_MAX_PRESS_MS &&
      isGameActive &&
      !isPaused &&
      !shiftAnimating &&
      !isMouseDown;

    if (looksLikeTap) {
      const now = performance.now();
      const doubleEndGapMs =
        e.pointerType === "mouse" || e.pointerType === "pen"
          ? SHIFT_DOUBLE_END_GAME_MAX_GAP_MS_MOUSE
          : SHIFT_DOUBLE_END_GAME_MAX_GAP_MS_TOUCH;
      if (shiftDoubleTapPrevAt > 0 && now - shiftDoubleTapPrevAt < doubleEndGapMs) {
        clearTapStreak();
        resetShiftDragVisualHard();
        endGame();
        return;
      }
      shiftDoubleTapPrevAt = now;
      return;
    } else {
      clearTapStreak();
    }

    tryApplyBoardShift(dx, dy, lockedHorizontal);
  }

  function tryApplyBoardShift(dx, dy, lockedHorizontal) {
    if (shiftAnimating) return;

    const hadVisual = shiftVisualTx !== 0 || shiftVisualTy !== 0;

    if (!isGameActive || isPaused) {
      resetShiftDragVisualHard();
      return;
    }
    if (isMouseDown) {
      if (hadVisual) {
        runShiftSpringBackToZero();
      } else {
        resetShiftDragVisualHard();
      }
      return;
    }

    const n = GRID_SIZE;
    const m = getGridCellMetrics();
    const horizontal =
      lockedHorizontal !== null ? lockedHorizontal : Math.abs(dx) >= Math.abs(dy);
    const stride = horizontal ? m.tw + m.gap : m.th + m.gap;
    const magVis = horizontal ? Math.abs(shiftVisualTx) : Math.abs(shiftVisualTy);
    const signedVis = horizontal ? shiftVisualTx : shiftVisualTy;

    const steps = shiftCommitStepsFromAxisMag(magVis, stride, n);
    if (steps === 0) {
      if (hadVisual) {
        runShiftSpringBackToZero();
      }
      return;
    }

    const applyShift = () => {
      const signedSteps = signedVis >= 0 ? steps : -steps;
      if (horizontal) {
        applyColumnShift(signedSteps);
      } else {
        applyRowShift(signedSteps);
      }
    };
    runShiftSettleAfterDrag(applyShift, { horizontal, signedVis, k: steps });
  }

  function applyColumnShift(signedSteps) {
    const n = GRID_SIZE;
    const kk = Math.abs(signedSteps) % n;
    if (kk === 0) return;
    const copy = board.map((row) => row.slice());
    const right = signedSteps > 0;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        board[r][c] = right
          ? copy[r][(c - kk + n * 10) % n]
          : copy[r][(c + kk) % n];
      }
    }
  }

  function applyRowShift(signedSteps) {
    const n = GRID_SIZE;
    const kk = Math.abs(signedSteps) % n;
    if (kk === 0) return;
    const copy = board.map((row) => row.slice());
    const down = signedSteps > 0;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        board[r][c] = down
          ? copy[(r - kk + n * 10) % n][c]
          : copy[(r + kk) % n][c];
      }
    }
  }

  function syncDomFromBoard() {
    const n = GRID_SIZE;
    const tiles = grid.children;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        setTileText(tiles[r * n + c], board[r][c]);
      }
    }
  }

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
    for (let i = 0; i < tiles.length; i++) {
      const el = tiles[i];
      el.style.setProperty("--tile-palette-ms", durStr);
      el.classList.add(cls);
    }
    tilePaletteTransitionTimer = window.setTimeout(() => {
      tilePaletteTransitionTimer = null;
      for (let i = 0; i < tiles.length; i++) {
        const el = tiles[i];
        el.classList.remove(
          "grid-button--palette-to-active",
          "grid-button--palette-to-inactive"
        );
        el.style.removeProperty("--tile-palette-ms");
      }
      if (onComplete) onComplete();
    }, durationMs);
  }

  function crossfadeWordmarkToHappyHunting(options = {}) {
    const skipWordmark = options.skipWordmark === true;
    const myEpoch = beginCurrentWordMessageSession();
    currentWordElement.classList.remove("current-word--valid-solve");

    if (skipWordmark) {
      currentWordElement.classList.add("current-word--soft-hidden");
      currentWordElement.textContent = INTRO_MESSAGE_TEXT;
      currentWordElement.style.color = happyHuntingColor;
      currentWordElement.style.transition = `opacity ${START_TOUCHPAD_FADE_MS}ms ease`;
      requestAnimationFrame(() => {
        if (myEpoch !== currentWordMessageEpoch) return;
        requestAnimationFrame(() => {
          if (myEpoch !== currentWordMessageEpoch) return;
          currentWordElement.classList.remove("current-word--soft-hidden");
        });
      });
    } else {
      currentWordElement.textContent = PRE_START_WORDMARK;
      currentWordElement.style.color = "white";
      currentWordElement.classList.remove("current-word--soft-hidden");

      const half = Math.max(1, Math.floor(START_TOUCHPAD_FADE_MS / 2));
      currentWordElement.style.transition = `opacity ${half}ms ease`;

      requestAnimationFrame(() => {
        if (myEpoch !== currentWordMessageEpoch) return;
        requestAnimationFrame(() => {
          if (myEpoch !== currentWordMessageEpoch) return;
          currentWordElement.classList.add("current-word--soft-hidden");
        });
      });

      window.setTimeout(() => {
        if (myEpoch !== currentWordMessageEpoch) return;
        currentWordElement.textContent = INTRO_MESSAGE_TEXT;
        currentWordElement.style.color = happyHuntingColor;
        currentWordElement.classList.remove("current-word--soft-hidden");
      }, half);
    }

    window.setTimeout(() => {
      if (myEpoch !== currentWordMessageEpoch) return;
      currentWordElement.style.transition = "";
    }, START_TOUCHPAD_FADE_MS);

    const holdBeforeFade = CURRENT_WORD_MESSAGE_ON_MS - CURRENT_WORD_FADE_MS;
    currentWordMessageTimer = window.setTimeout(() => {
      if (myEpoch !== currentWordMessageEpoch) return;
      currentWordElement.classList.add("current-word--soft-hidden");
      currentWordMessageFadeTimer = window.setTimeout(() => {
        if (myEpoch !== currentWordMessageEpoch) return;
        currentWordMessageActive = false;
        updateCurrentWord();
        currentWordMessageTimer = null;
        currentWordMessageFadeTimer = null;
      }, CURRENT_WORD_FADE_MS);
    }, START_TOUCHPAD_FADE_MS + holdBeforeFade);
  }

  function scheduleDeferredGameAudioWarmup() {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        void unlockGameAudio();
        playSound("bing", true, {
          playbackRate: BING_PLAYBACK_RATES_FOR_LENGTH[0],
        });
        playSound("bing", true, {
          playbackRate: BING_PLAYBACK_RATES_FOR_LENGTH[7],
        });
        playSound("invalid", true);
      });
    });
  }

  function startGame(arg) {
    if (arg instanceof MouseEvent) {
      arg = undefined;
    }
    const skipWordmarkInIntro =
      arg &&
      typeof arg === "object" &&
      arg.skipWordmarkInIntro === true;
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
    currentWord = "";
    updateScore();

    runGridTilePaletteTransition("toActive", TILE_PALETTE_MS, () => {
      const buttons = grid.getElementsByClassName("grid-button");
      for (let i = 0; i < buttons.length; i++) {
        buttons[i].disabled = false;
        buttons[i].classList.add("grid-button--active");
        buttons[i].classList.remove("grid-button--inactive");
        buttons[i].style.color = "";
        buttons[i].classList.remove("grid-button--endgame-exit");
      }
    });
    crossfadeWordmarkToHappyHunting({
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
    board = [];

    for (let i = 0; i < GRID_SIZE; i++) {
      board[i] = [];
      for (let j = 0; j < GRID_SIZE; j++) {
        board[i][j] = gridLetters[i][j];
        const button = document.createElement("button");
        button.type = "button";
        button.classList.add("grid-button");
        button.classList.add("grid-button--inactive");
        setTileText(button, gridLetters[i][j]);
        button.disabled = true;
        button.addEventListener("mousedown", handleMouseDown);
        button.addEventListener("mouseover", handleMouseOver);
        button.addEventListener("touchstart", handleTouchStart, {
          passive: false,
        });
        button.addEventListener("touchmove", handleTouchMove);
        grid.appendChild(button);
      }
    }

    ensureShiftPreviewElements();
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
    const length = sequence.reduce((total, button) => {
      return total + getTileText(button).length;
    }, 0);
    if (length === 0) {
      return { letterSum: 0, length: 0, wordTotal: 0 };
    }
    const letterSum = sequence.reduce((sum, button) => {
      return sum + getLetterWeight(getTileText(button));
    }, 0);
    return {
      letterSum,
      length,
      wordTotal: letterSum * length,
    };
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
    const live = getLiveWordScoreBreakdown(selectedButtons);
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
    if (currentWordMessageActive) return;
    currentWordElement.classList.remove("current-word--soft-hidden");
    if (!currentWord) {
      currentWordElement.textContent = "";
      currentWordElement.style.color = "white";
      return;
    }
    currentWordElement.textContent = currentWord.toUpperCase();
    if (currentWord.length < 3) {
      currentWordElement.style.color = "white";
      return;
    }
    currentWordElement.style.color = validateWord(currentWord)
      ? lightGreenPreviewColor
      : lightRedPreviewColor;
  }

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

  function calculateDiffDays() {
    const now = new Date();
    const start = new Date(2023, 4, 20);

    const diffTime = Math.abs(now - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return diffDays;
  }

  function handleTouchStart(event) {
    if (!isGameActive) return;
    const targetButton = getTileButtonFromEvent(event);
    beginSelectionOnButton(targetButton);
  }

  function handleTouchMove(event) {
    if (!isGameActive) return;
    event.preventDefault();
    const touch = event.touches[0];
    const element = document.elementFromPoint(touch.clientX, touch.clientY);
    const button =
      element && element instanceof Element
        ? element.closest(".grid-button")
        : null;

    if (button && grid.contains(button)) {
      extendSelectionToButton(button);
    }
  }

  function handleTouchEnd(event) {
    if (!isGameActive) return;
    handleMouseUp(event);
  }

  function syncSelectionVisitDepth() {
    const counts = new Map();
    for (const btn of selectedButtons) {
      counts.set(btn, (counts.get(btn) || 0) + 1);
    }
    for (const btn of grid.children) {
      if (!btn.classList.contains("grid-button")) continue;
      const n = counts.get(btn);
      if (n === undefined) {
        btn.removeAttribute("data-selection-visits");
      } else {
        btn.setAttribute("data-selection-visits", String(n));
      }
    }
  }

  function beginSelectionOnButton(targetButton) {
    if (!targetButton) return;
    if (targetButton.disabled) return;
    if (wordReplaceLockGen !== 0) return;
    if (
      getTileText(targetButton) !== "" &&
      (lastButton === null || isAdjacent(lastButton, targetButton))
    ) {
      isMouseDown = true;
      currentWord += getTileText(targetButton);
      selectedButtons.push(targetButton);
      selectedButtonSet.add(targetButton);
      targetButton.classList.add("selected");
      lastButton = targetButton;
      syncSelectionVisitDepth();
      updateCurrentWord();
      updateScoreStrip();
    }
  }

  function handleMouseDown(event) {
    if (!isGameActive) return;
    const targetButton = getTileButtonFromEvent(event);
    beginSelectionOnButton(targetButton);
  }

  function extendSelectionToButton(targetButton) {
    if (!targetButton) return;
    if (targetButton.disabled) return;
    if (
      isMouseDown &&
      getTileText(targetButton) !== "" &&
      (lastButton === null || isAdjacent(lastButton, targetButton))
    ) {
      let extendedWithNewTile = false;
      if (targetButton === selectedButtons[selectedButtons.length - 2]) {
        const removedButton = selectedButtons.pop();
        currentWord = currentWord.slice(0, -1);
        if (getTileText(removedButton) === "qu") {
          currentWord = currentWord.slice(0, -1);
        }

        const linesOnly = gridLineContainer.querySelectorAll("line");
        if (linesOnly.length) linesOnly[linesOnly.length - 1].remove();
        restyleAllWordConnectorLines();

        if (!selectedButtons.includes(removedButton)) {
          removedButton.classList.remove("selected");
          removedButton.classList.remove("grid-button--selected-enter");
          selectedButtonSet.delete(removedButton);
        }
      } else {
        extendedWithNewTile = true;
        currentWord += getTileText(targetButton);
        selectedButtons.push(targetButton);
        selectedButtonSet.add(targetButton);
        targetButton.classList.add("selected");

        if (lastButton) {
          const line = document.createElementNS(SVG_NS, "line");
          line.setAttribute("stroke-width", "3");
          gridLineContainer.appendChild(line);
          restyleAllWordConnectorLines();
        }
      }
      lastButton = targetButton;
      syncSelectionVisitDepth();
      if (extendedWithNewTile) {
        const v = targetButton.getAttribute("data-selection-visits");
        if (v === "1") {
          targetButton.classList.add("grid-button--selected-enter");
          const onSelectedEnterEnd = (e) => {
            if (e.target !== targetButton) return;
            targetButton.removeEventListener("animationend", onSelectedEnterEnd);
            targetButton.classList.remove("grid-button--selected-enter");
          };
          targetButton.addEventListener("animationend", onSelectedEnterEnd);
        }
      }
      updateCurrentWord();
      updateScoreStrip();
    }
  }

  function handleMouseOver(event) {
    if (!isGameActive) return;
    const targetButton = getTileButtonFromEvent(event);
    extendSelectionToButton(targetButton);
  }

  function handleMouseUp(event) {
    if (!isGameActive) return;
    if (!isMouseDown) return;
    isMouseDown = false;

    if (currentWord.length <= 2) {
      if (gridLineContainer.querySelector("line")) {
        finishWordDragCleanup({ skipLines: true });
        fadeOutWordConnectorLines();
      } else {
        finishWordDragCleanup();
      }
      return;
    }

    if (validateWord(currentWord)) {
      const len = currentWord.length;
      playSound("bing", isMuted, {
        playbackRate: bingPlaybackRateForWordLength(len),
      });
      let wordScore = getWordScoreFromSelectedTiles(selectedButtons);
      score += wordScore;
      const tilesToReplace = Array.from(selectedButtonSet);
      showMessage(
        `${currentWord.toUpperCase()} +${wordScore}`,
        1,
        greenTextColor,
        Math.max(
          0,
          getWordReplaceAnimationHoldMs(tilesToReplace.length) -
            WORD_SUCCESS_MESSAGE_FADE_EARLY_MS
        )
      );
      if (currentWord.length >= longestWord.length) {
        longestWord = currentWord;
      }
      updateScore();

      applyWordConnectorLineOutcome(true);

      selectedButtons.forEach((button) => {
        button.classList.remove("selected", "grid-button--selected-enter");
        button.removeAttribute("data-selection-visits");
      });
      selectedButtons = [];
      selectedButtonSet = new Set();
      lastButton = null;
      updateCurrentWord();
      updateScoreStrip();
      currentWord = "";

      runSuccessPopThenStaggeredFlip(tilesToReplace);
    } else {
      playSound("invalid", isMuted);
      showMessage("INVALID", 1, redTextColor);
      applyWordConnectorLineOutcome(false);
      fadeOutWordConnectorLines();
      for (let i = 0; i < selectedButtons.length; i++) {
        selectedButtons[i].classList.add("grid-button--invalid-shake");
      }
      clearWordSubmitFeedbackTimer();
      wordSubmitFeedbackTimer = window.setTimeout(() => {
        wordSubmitFeedbackTimer = null;
        finishWordDragCleanup();
      }, WORD_INVALID_SHAKE_MS);
    }
  }

  function isAdjacent(button1, button2) {
    const n = GRID_SIZE;
    const index1 = Array.prototype.indexOf.call(grid.children, button1);
    const index2 = Array.prototype.indexOf.call(grid.children, button2);
    const r1 = Math.floor(index1 / n);
    const c1 = index1 % n;
    const r2 = Math.floor(index2 / n);
    const c2 = index2 % n;
    const dr = Math.abs(r1 - r2);
    const dc = Math.abs(c1 - c2);
    return dr <= 1 && dc <= 1 && dr + dc > 0;
  }

  function beginCurrentWordOpacityFade(myEpoch) {
    currentWordElement.style.transition = `opacity ${CURRENT_WORD_FADE_MS}ms ease-out`;
    currentWordElement.classList.remove("current-word--valid-solve");
    requestAnimationFrame(() => {
      if (myEpoch !== currentWordMessageEpoch) return;
      currentWordElement.classList.add("current-word--soft-hidden");
    });
  }

  function showMessage(
    message,
    flashTimes = 1,
    color = "white",
    visibleHoldMs = null,
    flashHoldExtraMs = 0
  ) {
    const myEpoch = beginCurrentWordMessageSession();
    currentWordElement.style.transition = "";
    currentWordElement.textContent = message;
    currentWordElement.style.color = color;
    currentWordElement.classList.remove("current-word--soft-hidden");
    currentWordElement.classList.remove("current-word--valid-solve");

    const holdBeforeFade =
      visibleHoldMs != null && visibleHoldMs > 0 && flashTimes === 1
        ? visibleHoldMs
        : CURRENT_WORD_MESSAGE_ON_MS -
            CURRENT_WORD_FADE_MS +
            flashHoldExtraMs;
    if (visibleHoldMs != null && visibleHoldMs > 0 && flashTimes === 1) {
      currentWordElement.classList.add("current-word--valid-solve");
    }

    if (flashTimes > 1) {
      currentWordMessageTimer = window.setTimeout(() => {
        if (myEpoch !== currentWordMessageEpoch) return;
        beginCurrentWordOpacityFade(myEpoch);
        currentWordMessageFadeTimer = window.setTimeout(() => {
          if (myEpoch !== currentWordMessageEpoch) return;
          currentWordElement.style.transition = "";
          currentWordMessageActive = false;
          updateCurrentWord();
          currentWordMessageTimer = window.setTimeout(() => {
            if (myEpoch !== currentWordMessageEpoch) return;
            showMessage(
              message,
              flashTimes - 1,
              color,
              visibleHoldMs,
              flashHoldExtraMs
            );
          }, 380);
        }, CURRENT_WORD_FADE_MS);
      }, CURRENT_WORD_MESSAGE_ON_MS - CURRENT_WORD_FADE_MS + flashHoldExtraMs);
    } else {
      currentWordMessageTimer = window.setTimeout(() => {
        if (myEpoch !== currentWordMessageEpoch) return;
        beginCurrentWordOpacityFade(myEpoch);
        currentWordMessageFadeTimer = window.setTimeout(() => {
          if (myEpoch !== currentWordMessageEpoch) return;
          currentWordElement.style.transition = "";
          currentWordMessageActive = false;
          updateCurrentWord();
          currentWordMessageTimer = null;
          currentWordMessageFadeTimer = null;
        }, CURRENT_WORD_FADE_MS);
      }, holdBeforeFade);
    }
  }

  function getShowMessageDurationMs(flashTimes, flashHoldExtraMs = 0) {
    const flashes = Math.max(1, Number(flashTimes) || 1);
    const onMs = CURRENT_WORD_MESSAGE_ON_MS;
    const extra = Math.max(0, Number(flashHoldExtraMs) || 0);
    if (flashes === 1) {
      return onMs + extra;
    }
    return flashes * onMs + (flashes - 1) * 380 + flashes * extra;
  }

  function setEndgameBlankTilesHidden(hide) {
    const tiles = grid.getElementsByClassName("grid-button");
    for (let i = 0; i < tiles.length; i++) {
      const el = tiles[i];
      if (getTileText(el) === "") {
        el.classList.toggle("grid-button--endgame-blank-hidden", hide);
      }
    }
  }

  function maybeShowPostGameUi() {
    if (!endgamePostUiReady || !endgameSoundReady || endgameUiShown) return;
    endgameUiShown = true;
    if (currentWordMessageTimer) {
      window.clearTimeout(currentWordMessageTimer);
      currentWordMessageTimer = null;
    }
    if (currentWordMessageFadeTimer) {
      window.clearTimeout(currentWordMessageFadeTimer);
      currentWordMessageFadeTimer = null;
    }
    currentWordMessageActive = false;
    currentWordElement.classList.remove("current-word--soft-hidden");
    currentWordElement.classList.remove("current-word--valid-solve");
    currentWordElement.textContent = "Copy Score";
    currentWordElement.style.color = happyHuntingColor;
    updateNextLetters();
    playerName.classList.add("hiddenDisplay");
    leaderboardButton.classList.add("hiddenDisplay");
    leaderboardTable.classList.add("hiddenDisplay");
    leaderboardTable.classList.remove("visibleDisplay");
    leaderboardElements.classList.remove("visibleDisplay");
    leaderboardElements.style.display = "none";
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
      maybeShowPostGameUi();
    }, Math.max(0, ENDGAME_TILE_SEQUENCE_MS + 80 - COPY_SCORE_REVEAL_LEAD_MS));
  }

  function scheduleGameOverSoundUiReadyEarly() {
    if (endgameSoundEarlyTimer !== null) {
      window.clearTimeout(endgameSoundEarlyTimer);
      endgameSoundEarlyTimer = null;
    }
    const dur = sounds.gameOver.duration;
    if (!Number.isFinite(dur) || dur <= 0) return;
    const delay = Math.max(0, dur * 1000 - COPY_SCORE_SOUND_UI_LEAD_MS);
    endgameSoundEarlyTimer = window.setTimeout(() => {
      endgameSoundEarlyTimer = null;
      if (endgameUiShown) return;
      endgameSoundReady = true;
      maybeShowPostGameUi();
    }, delay);
  }

  function onGameOverSoundEndedPostGameUi() {
    if (endgameSoundEarlyTimer !== null) {
      window.clearTimeout(endgameSoundEarlyTimer);
      endgameSoundEarlyTimer = null;
    }
    if (endgameBlankRestoreFallbackTimer !== null) {
      window.clearTimeout(endgameBlankRestoreFallbackTimer);
      endgameBlankRestoreFallbackTimer = null;
    }
    sounds.gameOver.removeEventListener(
      "ended",
      onGameOverSoundEndedPostGameUi
    );
    endgameSoundReady = true;
    maybeShowPostGameUi();
  }

  function endGame() {
    isGameActive = false;
    clearWordSubmitFeedbackTimer();
    bumpWordReplaceEpoch();
    endgamePostUiReady = false;
    endgameSoundReady = false;
    endgameUiShown = false;
    if (endgameSoundEarlyTimer !== null) {
      window.clearTimeout(endgameSoundEarlyTimer);
      endgameSoundEarlyTimer = null;
    }
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
    sounds.gameOver.addEventListener(
      "loadedmetadata",
      scheduleGameOverSoundUiReadyEarly,
      { once: true }
    );
    scheduleGameOverSoundUiReadyEarly();
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

    rulesButton.classList.add("hiddenDisplay");
    rulesButton.classList.add("hidden");
    rulesButton.classList.remove("visible");
    muteButton.classList.add("hiddenDisplay");
    muteButton.classList.add("hidden");
    muteButton.classList.remove("visible");
    doneButton.classList.add("hiddenDisplay");
    doneButton.classList.remove("visibleDisplay");
    boardShiftZone.classList.add("hiddenDisplay");
    boardShiftZone.classList.remove("visibleDisplay");

    buttonContainer.classList.remove("hiddenDisplay");
    startButton.classList.add("hiddenDisplay");
    startButton.classList.remove("visibleDisplay");
    retryButton.classList.remove("hiddenDisplay");
    retryButton.classList.add("visibleDisplay");

    showMessage(
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
    leaderboardElements.style.display = "none";
    leaderboardElements.classList.remove("visibleDisplay");
    leaderboardTable.classList.add("hiddenDisplay");
    leaderboardTable.classList.remove("visibleDisplay");
  }

  function resetRoundToPregame(options = {}) {
    const forImmediateStart = options.forImmediateStart === true;
    isGameActive = false;
    isPaused = false;
    isMouseDown = false;
    clearTapStreak();

    if (endgameBlankRestoreFallbackTimer !== null) {
      window.clearTimeout(endgameBlankRestoreFallbackTimer);
      endgameBlankRestoreFallbackTimer = null;
    }
    if (endgameSoundEarlyTimer !== null) {
      window.clearTimeout(endgameSoundEarlyTimer);
      endgameSoundEarlyTimer = null;
    }
    if (endgameTileStartTimer !== null) {
      window.clearTimeout(endgameTileStartTimer);
      endgameTileStartTimer = null;
    }
    if (endgameTileRevealTimer !== null) {
      window.clearTimeout(endgameTileRevealTimer);
      endgameTileRevealTimer = null;
    }
    if (tilePaletteTransitionTimer !== null) {
      window.clearTimeout(tilePaletteTransitionTimer);
      tilePaletteTransitionTimer = null;
    }
    clearWordSubmitFeedbackTimer();
    bumpWordReplaceEpoch();
    if (startUiTransitionTimer !== null) {
      window.clearTimeout(startUiTransitionTimer);
      startUiTransitionTimer = null;
    }
    if (currentWordMessageTimer) {
      window.clearTimeout(currentWordMessageTimer);
      currentWordMessageTimer = null;
    }
    if (currentWordMessageFadeTimer) {
      window.clearTimeout(currentWordMessageFadeTimer);
      currentWordMessageFadeTimer = null;
    }

    sounds.gameOver.removeEventListener(
      "ended",
      onGameOverSoundEndedPostGameUi
    );
    try {
      sounds.gameOver.pause();
      sounds.gameOver.currentTime = 0;
    } catch (_) {}

    endgamePostUiReady = false;
    endgameSoundReady = false;
    endgameUiShown = false;
    currentWordMessageActive = false;

    shiftAnimating = false;
    shiftPointerId = null;
    shiftDragLockedHorizontal = null;
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
    leaderboardButton.disabled = false;
    leaderboardButton.style.backgroundColor = "";
    leaderboardElements.style.display = "none";
    leaderboardElements.classList.remove("visibleDisplay");
    leaderboardTable.classList.add("hiddenDisplay");
    leaderboardTable.classList.remove("visibleDisplay");

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

  async function getLeaderboard(clicked = false) {
    if (clicked) {
      playSound("click", isMuted);
      playerName.disabled = true;
      leaderboardButton.disabled = true;
      leaderboardButton.style.backgroundColor = "gray";
    }

    let requestURL = `${leaderboardLink}${diffDays}`;

    let requestOptions = {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    };

    if (score > SCORE_SUBMIT_THRESHOLD && playerName.value != "") {
      requestOptions.method = "POST";
      requestOptions.body = JSON.stringify({
        player: playerName.value,
        hard: false,
        score: score,
        trophy: longestWord,
      });
    }

    const response = await fetch(requestURL, requestOptions);
    const data = await response.json();

    const parsedBody = JSON.parse(data["body"]);
    const leaderboard =
      score > SCORE_SUBMIT_THRESHOLD && playerName.value !== ""
        ? parsedBody.top_10
        : parsedBody;

    leaderboardTable.innerHTML = "";

    let tbody = document.createElement("tbody");

    let headerRow = document.createElement("tr");
    ["#", "👤", "🏹", "🏆"].forEach((headerText) => {
      let th = document.createElement("th");
      th.textContent = headerText;
      headerRow.appendChild(th);
    });
    headerRow.style.backgroundColor = "black";
    headerRow.style.color = "white";
    tbody.appendChild(headerRow);

    leaderboard.forEach((row, index) => {
      let tr = document.createElement("tr");
      let [player, rowHardFlag, rowScore, rowTrophy] = row;

      let color = "white";
      if (rowHardFlag === 1) {
        color = redTextColorLeaderboard;
      }
      if (
        player === playerName.value &&
        rowScore === score &&
        rowTrophy === longestWord
      ) {
        playerPosition = index + 1;
        color = goldTextColor;
      }

      if (player === "doughack") {
        player = "doug";
        color = "magenta";
      }

      tr.style.color = color;

      let positionDisplay;
      if (index === 0) {
        positionDisplay = "🥇";
      } else {
        positionDisplay = index + 1;
      }

      [positionDisplay, player, rowScore, rowTrophy].forEach(
        (cellText, cellIndex) => {
          let td = document.createElement("td");
          td.textContent = cellText;

          if (cellIndex === 0 || cellIndex === 2) {
            td.classList.add("centered-cell");
          }

          tr.appendChild(td);
        }
      );
      tbody.appendChild(tr);
    });

    leaderboardTable.appendChild(tbody);
  }

  function getWordScoreFromSelectedTiles(buttonSequence) {
    return getLiveWordScoreBreakdown(buttonSequence).wordTotal;
  }

  function copyToClipboard(score, longestWord, diffDays) {
    playSound("click", isMuted);
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

  function playSound(name, muted, options) {
    const opts = options && typeof options === "object" ? options : {};
    const playbackRateRaw =
      typeof opts.playbackRate === "number" ? opts.playbackRate : 1;
    const playbackRate = Math.min(2, Math.max(0.25, playbackRateRaw));
    const sound = sounds[name];
    if (!sound) return;
    if (name === "gameOver") {
      sound.muted = !!muted;
      sound.defaultPlaybackRate = playbackRate;
      sound.playbackRate = playbackRate;
      void sound.play().catch(() => {});
      return;
    }
    const pool = soundPlayPools[name];
    if (!pool || pool.length === 0) return;
    let idx = soundPlayPoolCursor[name];
    if (idx === undefined) idx = 0;
    soundPlayPoolCursor[name] = (idx + 1) % pool.length;
    const a = pool[idx];
    a.muted = !!muted;
    if (name === "bing") setBingPitchScalesWithPlaybackRate(a);
    a.defaultPlaybackRate = playbackRate;
    a.playbackRate = playbackRate;
    try {
      a.pause();
      a.currentTime = 0;
    } catch (_) {}
    void a.play().catch(() => {});
  }
});
