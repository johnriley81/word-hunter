export const greenTextColor = "#07f03a";
export const redTextColor = "#f76d6d";
export const lightGreenPreviewColor = "#8ff7a8";
export const lightRedPreviewColor = "#ff9b9b";
export const redTextColorLeaderboard = "red";
export const goldTextColor = "#e3af02";
/** Beige for 👤 / 🏆 on the submitting player’s row when their run is below the puzzle perfect-hunt Σ (rank + 🏹 stay white). */
export const leaderboardSubPerfectRowColor = "#f5e2a2";
/** Success message / highlights when the submitted word is the next perfect-hunt list word on pace. */
export const huntPaceSuccessFlashColor = "#ffdd22";
export const happyHuntingColor = "gold";
export const UPCOMING_LABEL = "UPCOMING:";
export const UPCOMING_PREVIEW_MAX = 7;
export const PRE_START_WORDMARK = "WORDHUNTER";
export const INTRO_MESSAGE_TEXT = "Happy Hunting";

export const GRID_SIZE = 4;

/** Cells on the opening board (`GRID_SIZE` × `GRID_SIZE`). */
export const GRID_CELL_COUNT = GRID_SIZE * GRID_SIZE;

/** Perfect-hunt word count for daily puzzles, gamemaker export, and puzzles.txt rows. */
export const PERFECT_HUNT_WORD_COUNT = 7;

/**
 * Σ `min_unique_tiles` over the seven hunt words (= padded runtime `next_letters`.length).
 * JSON may omit trailing `""` pads; **`""` elsewhere encode positional peels** — do not strip
 * when loading (see `canonicalNextLettersFromJsonArray`).
 */
export const NEXT_LETTERS_LEN = 66;

/** Player-facing sack size in UI (listed replacement letters excluding implicit pad slots). `NEXT_LETTERS_LEN − GRID_CELL_COUNT`. */
export const NEXT_LETTERS_UI_COUNT = NEXT_LETTERS_LEN - GRID_CELL_COUNT;
export const SHIFT_STRIDE_FIRST_FRAC = 0.4;
export const SHIFT_AXIS_LOCK_PX = 8;
export const SHIFT_SLIDE_SENSITIVITY = 2;
export const SHIFT_MAX_STEPS_PER_GESTURE = 19;
export const SHIFT_SETTLE_MS = 340;
export const SHIFT_SETTLE_EASE = "cubic-bezier(0.2, 0.85, 0.25, 1)";
export const SHIFT_COMMIT_SNAP_MS = 220;
export const SHIFT_COMMIT_SNAP_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
export const SHIFT_COMMIT_SNAP_END_GRACE_MS = 140;
export const SHIFT_REJOIN_SNAP_MS = 130;
export const SHIFT_GESTURE_FALLBACK_MS = 800;
export const SHIFT_TAP_MAX_TRAVEL_PX = 20;
export const SHIFT_TAP_MAX_PRESS_MS = 500;
export const SHIFT_DOUBLE_END_GAME_MAX_GAP_MS_TOUCH = 325;
export const SHIFT_DOUBLE_END_GAME_MAX_GAP_MS_MOUSE = 550;
export const SCORE_SUBMIT_THRESHOLD = 50;
export const START_TOUCHPAD_FADE_MS = 420;
export const TILE_PALETTE_MS = 420;
/** Endgame only: active → inactive tile color transition (`tilePaletteToInactive`). */
export const ENDGAME_TILE_TO_INACTIVE_MS = 950;
export const TILE_PALETTE_TRANSITION_SETTLE_MS = 120;
export const CURRENT_WORD_FADE_MS = 220;
export const CURRENT_WORD_MESSAGE_EXTRA_MS = 500;
export const CURRENT_WORD_MESSAGE_ON_MS = 1100 + CURRENT_WORD_MESSAGE_EXTRA_MS;
export const LEADERBOARD_USE_DEMO_DATA = true;
export const LEADERBOARD_DEMO_INJECT_PERFECT_HUNT_ROW = true;
export const LEADERBOARD_DEMO_INJECT_OVER_PERFECT_HUNT_ROW = true;
export const LEADERBOARD_DEMO_OVER_PERFECT_SCORE_EXTRA = 777;
export const DEMO_LEADERBOARD_NAME_MAX = 8;
/** Leaderboard overlay `#leaderboard-elements` opacity in/out (prior 660ms baseline; doubled = half playback speed). */
export const LEADERBOARD_POSTGAME_FADE_MS = 1320;
/** After `#leaderboard-elements` gets `--visible`; use ≈fade duration so “Copy Score” picks up as soon as the panel fade finishes. */
export const LEADERBOARD_COPY_SCORE_AFTER_OVERLAY_FADE_MS =
  LEADERBOARD_POSTGAME_FADE_MS;
export const LEADERBOARD_OVERLAY_FADE_SETTLE_MS = 80;
export const LEADERBOARD_OVERLAY_FADE_OUT_TOTAL_MS =
  LEADERBOARD_POSTGAME_FADE_MS + LEADERBOARD_OVERLAY_FADE_SETTLE_MS;
export const CURRENT_WORD_BRIEF_FADE_IN_MS = 650;
export const ENDGAME_SOUND_FALLBACK_MS = 14000;
export const GAME_OVER_FLASH_TIMES = 2;
export const GAME_OVER_FLASH_HOLD_EXTRA_MS = 400;
/** Brief beat after last “GAME OVER” flash before `#grid.grid--endgame-final-fade`. */
export const ENDGAME_PAUSE_AFTER_GAME_OVER_MESSAGES_MS = 96;
export const WORD_INVALID_SHAKE_MS = 320;
export const WORD_LINE_FADE_MS = 520;
export const WORD_PATH_COLOR_STEPS = 11;
export const WORD_RELEASE_GREEN_MS = 255;
export const WORD_LETTER_FLIP_MS = 416;
/** Legacy tile flip exit duration (`tileEndgameFlipAway` — not used on main endgame path). */
export const ENDGAME_FLIP_EXIT_MS = 1120;
/** Stagger for flip exit delays (unused when flip exit is skipped). */
export const ENDGAME_TILE_STAGGER_MS = 42;
/** Whole-grid exit: `#grid` opacity to 0 (`gridEndgameBatchFade`). Same for regular and perfect hunt. */
export const ENDGAME_GRID_BATCH_FADE_MS = 1000;
export const WORD_REPLACE_FLIP_OVERLAP_MS = Math.floor(WORD_LETTER_FLIP_MS / 2);
export const WORD_COMMIT_AFTER_PULSE_MS = 300;
export const WORD_COMMIT_CHAIN_PULSE_MS = 48;
export const WORD_REPLACE_TAIL_SLACK_MS = 160;

export const WORD_SUCCESS_MESSAGE_FADE_EARLY_MS = 250;

export function getWordReplaceAnimationHoldMs(tileCount) {
  const n = Math.max(1, Math.floor(Number(tileCount)) || 1);
  const greenPhaseMs = WORD_RELEASE_GREEN_MS + WORD_REPLACE_TAIL_SLACK_MS;
  const gapBetweenFlipStarts = WORD_LETTER_FLIP_MS - WORD_REPLACE_FLIP_OVERLAP_MS;
  const afterGreenMs =
    WORD_COMMIT_AFTER_PULSE_MS +
    (n - 1) * gapBetweenFlipStarts +
    WORD_LETTER_FLIP_MS +
    WORD_REPLACE_TAIL_SLACK_MS;
  return greenPhaseMs + afterGreenMs;
}

/** Perfect hunt: wait after final flip so "WORD +score" can finish before GAME OVER flashes. */
export const PERFECT_ENDGAME_DEBOUNCE_BEFORE_GAME_OVER_MS = Math.max(
  0,
  CURRENT_WORD_BRIEF_FADE_IN_MS +
    CURRENT_WORD_FADE_MS -
    WORD_SUCCESS_MESSAGE_FADE_EARLY_MS
);

/** Through `showMessage` with word-drag `visibleHoldMs` (success line). */
export function getWordSuccessShowMessageTotalMs(tileCount) {
  const n = Math.max(1, Math.floor(Number(tileCount)) || 1);
  const visibleHoldMs = Math.max(
    0,
    getWordReplaceAnimationHoldMs(n) - WORD_SUCCESS_MESSAGE_FADE_EARLY_MS
  );
  return visibleHoldMs + CURRENT_WORD_BRIEF_FADE_IN_MS + CURRENT_WORD_FADE_MS;
}

export const SCENARIO_MESSAGE_VARIANTS = Object.freeze({
  game_over: Object.freeze(["Game Over"]),
});

export const PERFECT_HUNT_GAME_OVER_MESSAGE = "GAME OVER";

export const LETTER_WEIGHTS = Object.freeze({
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

export const GAME_SOUND_SPEC = [
  { id: "click", src: "sounds/click.wav" },
  { id: "copy", src: "sounds/copy.wav" },
  { id: "button1", src: "sounds/button1.wav" },
  { id: "bing", src: "sounds/bing.wav" },
  { id: "choir", src: "sounds/choir.wav" },
  { id: "invalid", src: "sounds/invalid.wav" },
  { id: "submit", src: "sounds/submit.wav" },
  { id: "gameOver", src: "sounds/gameOver.wav" },
  { id: "perfect", src: "sounds/perfect.wav" },
];

export const GAME_SOUND_IDS = GAME_SOUND_SPEC.map((d) => d.id);

export const BING_PLAYBACK_RATES_FOR_LENGTH = [
  0.82, 0.9, 0.98, 1.06, 1.14, 1.22, 1.3, 1.38,
];

/** Choir playbackRate steps by ascending hunt word score (rank 0 = lowest). */
export const CHOIR_PLAYBACK_RATES_FOR_RANK = [
  1.0, 1.06, 1.12, 1.18, 1.24, 1.3, 1.36, 1.42, 1.48,
];

export const SFX_PLAY_POOL_SIZE = 4;
