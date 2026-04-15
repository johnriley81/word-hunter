// colors (game messages / leaderboard; keep in sync with theme intent)
const greenTextColor = "#07f03a";
const redTextColor = "red";
const lightGreenPreviewColor = "#8ff7a8";
const lightRedPreviewColor = "#ff9b9b";
const redTextColorLeaderboard = "red";
const goldTextColor = "#e3af02";
const happyHuntingColor = "gold";
const UPCOMING_LABEL = "UPCOMING:";
const UPCOMING_PREVIEW_MAX = 7;
const PRE_START_WORDMARK = "WORDHUNTER";

/** Grid dimension (NxN). Must match `text/grids.txt` puzzle shape. */
const GRID_SIZE = 4;
/**
 * First column/row counts after dragging this fraction of one (tile+gap) stride.
 * After that, each additional full stride adds one more (floor), so one cell of motion ≈ one step.
 */
const SHIFT_STRIDE_FIRST_FRAC = 0.4;
/** Minimum dominant-axis movement before we lock to horizontal vs vertical drag. */
const SHIFT_AXIS_LOCK_PX = 8;
/** Pointer travel × this maps into slide offset (2 = half as much drag for the same motion). */
const SHIFT_SLIDE_SENSITIVITY = 2;
/** Settle after commit: slightly longer ease-out so tiles read as sliding into place. */
const SHIFT_SETTLE_MS = 340;
const SHIFT_SETTLE_EASE = "cubic-bezier(0.2, 0.85, 0.25, 1)";
/** After commit: ease `#grid-stage` from finger pose to stride snap (ghost tiles ride with it). */
const SHIFT_COMMIT_SNAP_MS = 220;
const SHIFT_COMMIT_SNAP_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const SHIFT_COMMIT_SNAP_END_GRACE_MS = 140;
/** Stage return to identity after DOM commit (while `#grid` is hidden); shorter than stride snap cuts blank time. */
const SHIFT_REJOIN_SNAP_MS = 130;
const SHIFT_GESTURE_FALLBACK_MS = 800;
const SHIFT_TAP_MAX_TRAVEL_PX = 20;
const SHIFT_TAP_MAX_PRESS_MS = 500;
const SCORE_SUBMIT_THRESHOLD = 50;
const ENDGAME_SOUND_FALLBACK_MS = 14000;
const SHIFT_MIDWAY_TICK_STEPS_CAP = 64;

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
  // Keep classic Boggle behavior: standalone q tiles are treated as qu.
  if (normalized === "q") return "qu";
  return normalized;
}

function getLetterWeight(tileText) {
  const normalized = normalizeTileText(tileText);
  return LETTER_WEIGHTS[normalized] ?? 1;
}

/** Max row/column steps per swipe (`n - 1`); a full `n` shift is identity on an n×n board. */
function shiftMaxStepsPerGesture(n) {
  return Math.max(1, n - 1);
}

/** Commit step count from drag magnitude (0 .. shiftMaxStepsPerGesture(n)). */
function shiftCommitStepsFromAxisMag(magPx, stridePx, n) {
  if (magPx <= 0) return 0;
  const first = stridePx * SHIFT_STRIDE_FIRST_FRAC;
  if (magPx < first) return 0;
  const cap = shiftMaxStepsPerGesture(n);
  return Math.min(cap, 1 + Math.floor((magPx - first) / stridePx));
}

/**
 * Clamp |axis| into the commit band for strip depth `k` (same [low, hi) as strip thresholds).
 * Continuous within the band so drag does not stick on inner stride plateaus.
 */
function clampAxisMagToCommitBandForK(magPx, stridePx, k) {
  if (k <= 0 || magPx <= 0) return magPx;
  const first = stridePx * SHIFT_STRIDE_FIRST_FRAC;
  const low = first + (k - 1) * stridePx;
  const hiEx = first + k * stridePx;
  return Math.min(Math.max(magPx, low), hiEx - 1e-6);
}

/** Snap locked-axis motion into the stride band for the current step count (quantize while dragging). */
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

/** Mid-stride lines at (k + ½) * stride — tick when drag magnitude crosses these. */
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

let sounds = {
  click: new Audio("sounds/click.wav"),
  bing: new Audio("sounds/bing.wav"),
  bing2: new Audio("sounds/bing2.wav"),
  invalid: new Audio("sounds/invalid.wav"),
  pop: new Audio("sounds/pop.wav"),
  tick: new Audio("sounds/tick.wav"),
  gameOver: new Audio("sounds/gameOver.wav"),
};

document.addEventListener("DOMContentLoaded", () => {
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
  const closeRules = document.querySelector("#close-rules");
  const doneButton = document.querySelector("#done-button");
  const boardShiftZone = document.getElementById("board-shift-zone");
  const boardShiftHints = document.getElementById("board-shift-hints");
  const boardShiftDismissButton = document.getElementById("board-shift-dismiss");
  const buttonContainer = document.getElementById("button-container");
  const retryButton = document.querySelector("#retry-button");
  const gridLineContainer = document.querySelector("#line-container");
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
      : String(getDisplayedTileWeight(normalized));
    badge.style.display = isBlankTile ? "none" : "";
    el.disabled = isBlankTile;
    const shouldArmVisual =
      bigGameHuntArmed &&
      el.classList.contains("grid-button--active") &&
      !isBlankTile;
    el.classList.toggle("grid-button--hunt-armed", shouldArmVisual);
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
  /** @type {string[][]} Row-major letters; kept in sync with #grid tiles. */
  let board = [];
  let isPaused = false;
  let isMuted = false;

  let shiftPointerId = null;
  let shiftStartX = 0;
  let shiftStartY = 0;
  /** `performance.now()` at shift pointer down (double-tap detection). */
  let shiftPointerDownAt = 0;
  /** Tap streak state for swipe-zone gestures (double = hunt, triple = end). */
  let shiftTapStreakCount = 0;
  let shiftTapStreakLastAt = 0;
  const SHIFT_TAP_STREAK_WINDOW_MS = 340;
  let shiftTapActionTimer = null;
  let shiftAnimating = false;
  /** @type {null | boolean} null until axis is chosen from the first meaningful move. */
  let shiftDragLockedHorizontal = null;
  let shiftVisualTx = 0;
  let shiftVisualTy = 0;
  /** Last strip depth shown by ghost UI; avoids pointer-up stride reflow changing k vs drag. */
  let shiftVisualStripCount = 0;
  /** Axis for `shiftVisualStripCount` (same as `updateShiftStageVisual` `horizontal`). */
  let shiftVisualStripHorizontal = true;
  /** Last locked-axis swipe magnitude (px) for midway tick detection. */
  let shiftSwipeTickPrevMag = 0;
  /** Pixel-locked grid size during active swipe to prevent live layout distortion. */
  let shiftLockedGridWidthPx = 0;
  let shiftLockedGridHeightPx = 0;
  let currentWordMessageActive = false;
  let currentWordMessageTimer = null;
  let endgameBlankRestoreFallbackTimer = null;
  let bigGameHuntUsed = false;
  let bigGameHuntArmed = false;

  /* Grouped state views to make ownership explicit without changing runtime behavior. */
  const shiftState = {
    get pointerId() {
      return shiftPointerId;
    },
    get animating() {
      return shiftAnimating;
    },
  };
  const huntState = {
    get used() {
      return bigGameHuntUsed;
    },
    get armed() {
      return bigGameHuntArmed;
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
    shiftTapStreakCount = 0;
    shiftTapStreakLastAt = 0;
    if (shiftTapActionTimer !== null) {
      window.clearTimeout(shiftTapActionTimer);
      shiftTapActionTimer = null;
    }
  }

  function resetHuntState() {
    bigGameHuntArmed = false;
    bigGameHuntUsed = false;
    syncBigGameHuntTileVisualState();
  }

  function resetSelectionState() {
    selectedButtons = [];
    selectedButtonSet = new Set();
    lastButton = null;
    currentWord = "";
    updateCurrentWord();
    updateScoreStrip();
  }

  function resetShiftVisualState() {
    shiftVisualTx = 0;
    shiftVisualTy = 0;
    shiftVisualStripCount = 0;
  }

  function getDisplayedTileWeight(tileText) {
    const base = getLetterWeight(tileText);
    return bigGameHuntArmed ? base * 2 : base;
  }

  function syncGridViewportSize() {
    if (!gridViewport) return;
    // Approach A: keep sizing CSS-driven to avoid JS/CSS drift.
    gridViewport.style.padding = "";
    gridViewport.style.width = "";
    gridViewport.style.height = "";
  }

  function syncBigGameHuntTileVisualState() {
    const tiles = document.querySelectorAll(".grid-button");
    for (let i = 0; i < tiles.length; i++) {
      const tile = tiles[i];
      const tileText = getTileText(tile);
      const shouldArmVisual =
        bigGameHuntArmed &&
        tile.classList.contains("grid-button--active") &&
        tileText !== "";
      tile.classList.toggle("grid-button--hunt-armed", shouldArmVisual);
      const badge = tile.querySelector(".tile-weight-badge");
      if (badge && tileText !== "") {
        badge.textContent = String(getDisplayedTileWeight(tileText));
      }
    }
  }

  function lockGridSizeForSwipe() {
    if (shiftLockedGridWidthPx > 0 && shiftLockedGridHeightPx > 0) return;
    const br = grid.getBoundingClientRect();
    if (br.width < 1 || br.height < 1) return;
    // Keep sub-pixel precision so swipe mode doesn't slightly compress tile gaps.
    shiftLockedGridWidthPx = br.width;
    shiftLockedGridHeightPx = br.height;
    grid.style.width = shiftLockedGridWidthPx + "px";
    grid.style.maxWidth = shiftLockedGridWidthPx + "px";
    grid.style.height = shiftLockedGridHeightPx + "px";
  }

  function unlockGridSizeAfterSwipe() {
    // Keep the measured pixel size applied at rest too; this matches the geometry
    // seen during swipe and avoids fallback-to-CSS drift/clipping on release.
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
    /* Row-major order must match CSS grid auto-flow (default row). */
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

  /**
   * After commit: resize preview strip to match the refreshed `#grid` (cell metrics may change).
   * When `reuseTileText` is true, keep the letters already painted during drag — they are the
   * wrapped slice and still match the main grid after `applyShift` (refilling from `board`
   * with the old index math would flash the wrong glyphs for one frame).
   */
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

  Object.keys(sounds).forEach((key) => {
    sounds[key].load();
  });

  fetch("text/wordlist.txt")
    .then((response) => response.text())
    .then((data) => {
      wordSet = new Set(data.toLowerCase().split("\n"));

      // Fetch grids.txt after wordlist.txt has been fetched
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

      // Fetch nextletters.txt after grids.txt has been fetched
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

      // Call generateGrid() after all files have been fetched
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
  startButton.addEventListener("click", startGame);

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

  retryButton.addEventListener("click", function () {
    playSound("click", isMuted);
    window.location.reload();
  });
  closeRules.addEventListener("click", function () {
    setRulesOverlayVisible(false);
  });
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

  /** Web Audio path: Safari throttles rapid `HTMLAudioElement.play()`; scheduled buffers are reliable. */
  let shiftTickCtx = null;
  let shiftTickBuffer = null;
  let shiftTickDecodePromise = null;
  /** End time of last scheduled tick (ctx.currentTime) so bursts do not overlap incorrectly. */
  let shiftTickScheduleEnd = 0;

  const SHIFT_TICK_POOL_SIZE = 12;
  const shiftTickPool = Array.from({ length: SHIFT_TICK_POOL_SIZE }, () => {
    const a = new Audio("sounds/tick.wav");
    a.preload = "auto";
    return a;
  });
  let shiftTickPoolIndex = 0;

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

  function playShiftTicks(count) {
    if (isMuted || count <= 0) return;
    const nPlay = Math.min(count, 28);
    if (shiftTickBuffer && shiftTickCtx) {
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
    for (let i = 0; i < Math.min(nPlay, 10); i++) {
      const a = shiftTickPool[shiftTickPoolIndex];
      shiftTickPoolIndex = (shiftTickPoolIndex + 1) % shiftTickPool.length;
      try {
        a.pause();
        a.currentTime = 0;
      } catch (_) {}
      void a.play().catch(() => {});
    }
  }

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
    const hideBoardShiftHints = (event) => {
      if (event.cancelable) event.preventDefault();
      event.stopPropagation();
      boardShiftHints.classList.add("hiddenDisplay");
      boardShiftDismissButton.classList.add("hiddenDisplay");
    };
    /* Safari/Chrome mobile: zone-level touchend preventDefault can suppress click. */
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
    /* Unlock inline grid size on the next paint so commit + overlay settle first. */
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

  /** Stage transform for snap (same geometry as drag; applied to `#grid-stage` only). */
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

  /** Child `#grid` transform that cancels current `#grid-stage` translate (sum ≈ 0 in viewport). */
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

  /**
   * Committed shift: apply board + DOM, keep ghost letters on the preview strip (resize only),
   * ease `#grid-stage` from the finger pose to the stride snap, then clear preview + stage.
   */
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

    /* Pre-apply metrics match the drag transform; post-sync cell size can change. */
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
    /** Non-once listener must be removed explicitly; `once:true` breaks if another property transitions first. */
    let snapStageTransitionEndHandler = null;
    /** Web Animations API: stride snap on `#grid-stage`. */
    let snapWaapiAnim = null;
    let snapWaapiSafetyTimer = null;
    /** WAAPI: dual rejoin to identity after commit. */
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
      /* Keep letters visible: cancel stage offset with inverse translate on `#grid` so
         committed tile text does not flash wrong-frame and the board does not go blank. */
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
    void ensureShiftTickAudio();
    if (shiftTickCtx) {
      void shiftTickCtx.resume().catch(() => {});
    }
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

    const runDoubleTapHuntAction = () => {
      if (bigGameHuntUsed) {
        showMessage("No more hunting", 1, "white");
        return;
      }
      if (bigGameHuntArmed) {
        bigGameHuntArmed = false;
        syncBigGameHuntTileVisualState();
        showMessage("Nevermind", 1, "white");
      } else {
        bigGameHuntArmed = true;
        syncBigGameHuntTileVisualState();
        showMessage("Big Game Hunting", 1, happyHuntingColor);
      }
    };

    if (looksLikeTap) {
      const now = performance.now();
      if (
        shiftTapStreakLastAt > 0 &&
        now - shiftTapStreakLastAt < SHIFT_TAP_STREAK_WINDOW_MS
      ) {
        shiftTapStreakCount += 1;
      } else {
        shiftTapStreakCount = 1;
      }
      shiftTapStreakLastAt = now;

      if (shiftTapStreakCount >= 3) {
        clearTapStreak();
        resetShiftDragVisualHard();
        endGame();
        return;
      }

      if (shiftTapStreakCount === 2) {
        if (shiftTapActionTimer !== null) {
          window.clearTimeout(shiftTapActionTimer);
        }
        shiftTapActionTimer = window.setTimeout(() => {
          shiftTapActionTimer = null;
          runDoubleTapHuntAction();
          shiftTapStreakCount = 0;
          shiftTapStreakLastAt = 0;
        }, SHIFT_TAP_STREAK_WINDOW_MS);
      }
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

  /** Positive = shift columns toward increasing c (drag preview “right”); negative = left. */
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

  /** Positive = shift rows toward increasing r (drag preview “down”); negative = up. */
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

  function startGame() {
    playSound("click", isMuted);
    playSound("bing", true);
    playSound("bing2", true);
    playSound("invalid", true);
    clearTapStreak();
    resetHuntState();
    isGameActive = true;
    startButton.classList.add("hiddenDisplay");
    startButton.classList.remove("visibleDisplay");
    buttonContainer.classList.add("hiddenDisplay");
    currentWordElement.classList.remove("hidden");
    currentWordElement.classList.add("visible");
    boardShiftZone.classList.remove("hiddenDisplay");
    boardShiftZone.classList.add("visibleDisplay");

    const buttons = grid.getElementsByClassName("grid-button");
    for (let i = 0; i < buttons.length; i++) {
      buttons[i].disabled = false; // Enable the buttons
      buttons[i].classList.add("grid-button--active");
      buttons[i].classList.remove("grid-button--inactive");
      buttons[i].style.color = "";
    }

    syncLineOverlaySize();
    requestAnimationFrame(syncLineOverlaySize);
    lockGridSizeForSwipe();

    score = 0;
    currentWord = "";
    showMessage("Happy Hunting", 1, happyHuntingColor);
    updateScore();
    updateCurrentWord();
    updateNextLetters();
  }

  function generateGrid() {
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
    nextLetters = nextLettersList[diffDays % nextLettersList.length];
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
    const huntMultiplier = bigGameHuntArmed ? 2 : 1;
    const displayedLetterSum = live.letterSum * huntMultiplier;
    const displayedWordTotal = live.wordTotal * huntMultiplier;
    scoreSwipeSumElement.textContent = String(displayedLetterSum);
    scoreLengthElement.textContent = String(live.length);
    scoreWordTotalElement.textContent = String(displayedWordTotal);
    scoreGameTotalElement.textContent = String(score);
  }

  function updateScore() {
    if (!scoreElement) return;
    updateScoreStrip();
  }

  function updateCurrentWord() {
    if (currentWordMessageActive) return;
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
    const hasMoreUpcoming = nextLetters.length > UPCOMING_PREVIEW_MAX;
    let displayedNextLetters = nextLetters
      .slice(0, UPCOMING_PREVIEW_MAX)
      .join(", ");
    if (hasMoreUpcoming && displayedNextLetters.length > 0) {
      displayedNextLetters += "...";
    }
    nextLettersElement.textContent = displayedNextLetters;
    if (queueSackCountElement) {
      queueSackCountElement.textContent = String(nextLetters.length);
    }
  }

  // Helper function to calculate the difference in days between two dates
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

  /** Updates `data-selection-visits` from how often each tile appears in the path. */
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
      if (targetButton === selectedButtons[selectedButtons.length - 2]) {
        const removedButton = selectedButtons.pop();
        currentWord = currentWord.slice(0, -1);
        if (getTileText(removedButton) === "qu") {
          currentWord = currentWord.slice(0, -1);
        }

        // Remove the corresponding line
        gridLineContainer.lastChild.remove();

        // Check if this button is still part of the word
        if (!selectedButtons.includes(removedButton)) {
          removedButton.classList.remove("selected");
          selectedButtonSet.delete(removedButton);
        }
      } else {
        currentWord += getTileText(targetButton);
        selectedButtons.push(targetButton);
        selectedButtonSet.add(targetButton);
        targetButton.classList.add("selected");

        // Add a line from the last button to this one
        if (lastButton) {
          const line = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "line"
          );

          const lastRect = lastButton.getBoundingClientRect();
          const currRect = targetButton.getBoundingClientRect();

          line.setAttribute(
            "x1",
            lastRect.left +
              lastRect.width / 2 -
              grid.getBoundingClientRect().left
          );
          line.setAttribute(
            "y1",
            lastRect.top +
              lastRect.height / 2 -
              grid.getBoundingClientRect().top
          );
          line.setAttribute(
            "x2",
            currRect.left +
              currRect.width / 2 -
              grid.getBoundingClientRect().left
          );
          line.setAttribute(
            "y2",
            currRect.top +
              currRect.height / 2 -
              grid.getBoundingClientRect().top
          );

          // transform line from orange to red
          const wordLength = selectedButtons.length;
          const lettersChange = 8;
          const color =
            wordLength <= lettersChange
              ? `rgb(255, ${Math.round(
                  255 - (255 / lettersChange) * (wordLength - 1)
                )}, 0)`
              : "rgb(255, 0, 0)";
          line.setAttribute("stroke", color);
          line.setAttribute("stroke-width", "3");

          gridLineContainer.appendChild(line);
        }
      }
      lastButton = targetButton;
      syncSelectionVisitDepth();
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
    if (isMouseDown) {
      isMouseDown = false;
      if (currentWord.length > 2) {
        if (validateWord(currentWord)) {
          if (currentWord.length >= 5) {
            playSound("bing2", isMuted);
          } else {
            playSound("bing", isMuted);
          }
          let wordScore = getWordScoreFromSelectedTiles(selectedButtons);
          if (bigGameHuntArmed) {
            wordScore *= 2;
            bigGameHuntArmed = false;
            bigGameHuntUsed = true;
            syncBigGameHuntTileVisualState();
          }
          score += wordScore;
          showMessage(
            `${currentWord.toUpperCase()} +${wordScore}`,
            1,
            greenTextColor
          );
          if (currentWord.length >= longestWord.length) {
            longestWord = currentWord;
          }
          updateScore();
          replaceLetters();
        } else {
          playSound("invalid", isMuted);
          showMessage("INVALID", 1, redTextColor);
        }
      }
      currentWord = "";
      selectedButtons.forEach((button) => {
        button.classList.remove("selected");
        button.removeAttribute("data-selection-visits");
      });
      updateCurrentWord();
      selectedButtons = [];
      selectedButtonSet = new Set();
      lastButton = null;
      updateScoreStrip();
      while (gridLineContainer.firstChild) {
        gridLineContainer.firstChild.remove();
      }
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

  function replaceLetters() {
    const n = GRID_SIZE;
    const uniqueSelectedButtons = Array.from(selectedButtonSet);
    uniqueSelectedButtons.forEach((button) => {
      const nextLetter = nextLetters.shift() || "";
      setTileText(button, nextLetter);
      const idx = Array.prototype.indexOf.call(grid.children, button);
      const r = Math.floor(idx / n);
      const c = idx % n;
      board[r][c] = nextLetter;
    });
    selectedButtonSet.clear();
    lastButton = null;
    updateNextLetters();
    syncBigGameHuntTileVisualState();
  }

  function showMessage(message, flashTimes = 1, color = "white") {
    if (currentWordMessageTimer) {
      window.clearTimeout(currentWordMessageTimer);
      currentWordMessageTimer = null;
    }
    currentWordMessageActive = true;
    currentWordElement.textContent = message;
    currentWordElement.style.color = color;

    if (flashTimes > 1) {
      currentWordMessageTimer = window.setTimeout(() => {
        currentWordMessageActive = false;
        updateCurrentWord();
        currentWordMessageTimer = window.setTimeout(() => {
          showMessage(message, flashTimes - 1, color);
        }, 380);
      }, 820);
    } else {
      currentWordMessageTimer = window.setTimeout(() => {
        currentWordMessageActive = false;
        updateCurrentWord();
        currentWordMessageTimer = null;
      }, 1100);
    }
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

  function onGameOverSoundEndedPostGameUi() {
    if (endgameBlankRestoreFallbackTimer !== null) {
      window.clearTimeout(endgameBlankRestoreFallbackTimer);
      endgameBlankRestoreFallbackTimer = null;
    }
    sounds.gameOver.removeEventListener(
      "ended",
      onGameOverSoundEndedPostGameUi
    );
    /* Keep blank tiles hidden for the whole post-game screen (letter tiles only). */
    if (currentWordMessageTimer) {
      window.clearTimeout(currentWordMessageTimer);
      currentWordMessageTimer = null;
    }
    currentWordMessageActive = false;
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

  function endGame() {
    playSound("gameOver", isMuted);
    isGameActive = false;
    resetHuntState();
    clearTapStreak();

    setRulesOverlayVisible(false);

    const buttons = grid.getElementsByClassName("grid-button");
    for (let i = 0; i < buttons.length; i++) {
      buttons[i].disabled = true;
      buttons[i].classList.remove("grid-button--active");
      buttons[i].classList.add("grid-button--inactive");
      buttons[i].classList.remove("selected");
      buttons[i].removeAttribute("data-selection-visits");
      buttons[i].style.color = "";
    }
    syncBigGameHuntTileVisualState();
    setEndgameBlankTilesHidden(true);
    sounds.gameOver.removeEventListener(
      "ended",
      onGameOverSoundEndedPostGameUi
    );
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

    // Hide Rules, Done, shift zone, mute/help
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

    // Show Retry button
    buttonContainer.classList.remove("hiddenDisplay");
    startButton.classList.add("hiddenDisplay");
    startButton.classList.remove("visibleDisplay");
    retryButton.classList.remove("hiddenDisplay");
    retryButton.classList.add("visibleDisplay");

    showMessage("Game Over", 2, happyHuntingColor);
    playerName.classList.add("hiddenDisplay");
    leaderboardButton.classList.add("hiddenDisplay");
    leaderboardElements.style.display = "none";
    leaderboardElements.classList.remove("visibleDisplay");
    leaderboardTable.classList.add("hiddenDisplay");
    leaderboardTable.classList.remove("visibleDisplay");
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

    // make the API request
    const response = await fetch(requestURL, requestOptions);
    const data = await response.json();

    const parsedBody = JSON.parse(data["body"]);
    const leaderboard =
      score > SCORE_SUBMIT_THRESHOLD && playerName.value !== ""
        ? parsedBody.top_10
        : parsedBody;

    // clear the existing leaderboard table
    leaderboardTable.innerHTML = "";

    // create a table body
    let tbody = document.createElement("tbody");

    // add the table header
    let headerRow = document.createElement("tr");
    ["#", "👤", "🏹", "🏆"].forEach((headerText) => {
      let th = document.createElement("th");
      th.textContent = headerText;
      headerRow.appendChild(th);
    });
    headerRow.style.backgroundColor = "black";
    headerRow.style.color = "white";
    tbody.appendChild(headerRow);

    // add the new leaderboard rows
    leaderboard.forEach((row, index) => {
      let tr = document.createElement("tr");
      let [player, rowHardFlag, rowScore, rowTrophy] = row;

      // Determine the color of the row
      let color = "white"; // default color
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

      // Determine the displayed position (medal or number)
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

          // Add class for first and third columns
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
        `${leaderboardText}WordHunter #${diffDays} 🏹${score}\n🏆 ${longestWord.toUpperCase()} 🏆\n${websiteLink}`
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

  function playSound(name, muted) {
    let sound = sounds[name];
    sound.muted = muted;
    sound.play();
  }
});
