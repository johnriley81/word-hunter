export const greenTextColor = "#07f03a";
export const redTextColor = "#f76d6d";
export const lightGreenPreviewColor = "#8ff7a8";
export const lightRedPreviewColor = "#ff9b9b";
export const redTextColorLeaderboard = "red";
export const goldTextColor = "#e3af02";
export const happyHuntingColor = "gold";
export const UPCOMING_LABEL = "UPCOMING:";
export const UPCOMING_PREVIEW_MAX = 7;
export const PRE_START_WORDMARK = "WORDHUNTER";
export const INTRO_MESSAGE_TEXT = "Happy Hunting";

export const GRID_SIZE = 4;
export const SHIFT_STRIDE_FIRST_FRAC = 0.4;
export const SHIFT_AXIS_LOCK_PX = 8;
export const SHIFT_SLIDE_SENSITIVITY = 2;
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
export const TILE_PALETTE_TRANSITION_SETTLE_MS = 120;
export const CURRENT_WORD_FADE_MS = 220;
export const CURRENT_WORD_MESSAGE_EXTRA_MS = 500;
export const CURRENT_WORD_MESSAGE_ON_MS = 1100 + CURRENT_WORD_MESSAGE_EXTRA_MS;
export const POSTGAME_BEAT_MS = 300;
export const ENDGAME_TILE_SEQUENCE_MS = POSTGAME_BEAT_MS;
export const ENDGAME_TILE_EXIT_BUFFER_MS = 0;
export const LEADERBOARD_USE_DEMO_DATA = true;
export const DEMO_LEADERBOARD_NAME_MAX = 8;
export const LEADERBOARD_REVEAL_LEAD_MS = 0;
export const LEADERBOARD_AFTER_ENDGAME_TILE_FADE_MS = 200;
export const LEADERBOARD_POSTGAME_FADE_MS = POSTGAME_BEAT_MS * 2;
export const LEADERBOARD_COPY_SCORE_AFTER_OVERLAY_FADE_MS =
  LEADERBOARD_POSTGAME_FADE_MS + POSTGAME_BEAT_MS;
export const LEADERBOARD_OVERLAY_FADE_SETTLE_MS = 80;
export const LEADERBOARD_OVERLAY_FADE_OUT_TOTAL_MS =
  LEADERBOARD_POSTGAME_FADE_MS + LEADERBOARD_OVERLAY_FADE_SETTLE_MS;
export const CURRENT_WORD_BRIEF_FADE_IN_MS = 650;
export const ENDGAME_SOUND_FALLBACK_MS = 14000;
export const ENDGAME_TILE_PAUSE_AFTER_GAMEOVER_MS = 500;
export const GAME_OVER_FLASH_TIMES = 2;
export const GAME_OVER_FLASH_HOLD_EXTRA_MS = 400;
export const WORD_INVALID_SHAKE_MS = 320;
export const WORD_LINE_FADE_MS = 520;
export const WORD_PATH_COLOR_STEPS = 11;
export const WORD_RELEASE_GREEN_MS = 255;
export const WORD_LETTER_FLIP_MS = 416;
export const WORD_REPLACE_FLIP_OVERLAP_MS = Math.floor(WORD_LETTER_FLIP_MS / 2);
export const WORD_COMMIT_AFTER_PULSE_MS = 300;
export const WORD_COMMIT_CHAIN_PULSE_MS = 48;
export const WORD_REPLACE_TAIL_SLACK_MS = 160;

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

export const WORD_SUCCESS_MESSAGE_FADE_EARLY_MS = 250;

export const SCENARIO_MESSAGE_VARIANTS = Object.freeze({
  game_over: Object.freeze(["Game Over"]),
});

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
  { id: "button2", src: "sounds/button2.wav" },
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
