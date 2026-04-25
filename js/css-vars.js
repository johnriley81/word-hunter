import {
  WORD_RELEASE_GREEN_MS,
  WORD_LETTER_FLIP_MS,
  WORD_COMMIT_AFTER_PULSE_MS,
  CURRENT_WORD_FADE_MS,
  LEADERBOARD_POSTGAME_FADE_MS,
  ENDGAME_TILE_SEQUENCE_MS,
} from "./config.js";

export function syncWordReplaceAnimationCssVars() {
  const root = document.documentElement;
  root.style.setProperty("--word-release-green-ms", `${WORD_RELEASE_GREEN_MS}ms`);
  root.style.setProperty("--word-tile-flip-ms", `${WORD_LETTER_FLIP_MS}ms`);
  root.style.setProperty("--word-queue-pulse-ms", `${WORD_COMMIT_AFTER_PULSE_MS}ms`);
  root.style.setProperty("--current-word-fade-ms", `${CURRENT_WORD_FADE_MS}ms`);
  root.style.setProperty(
    "--leaderboard-postgame-fade-ms",
    `${LEADERBOARD_POSTGAME_FADE_MS}ms`
  );
  root.style.setProperty("--endgame-tile-exit-ms", `${ENDGAME_TILE_SEQUENCE_MS}ms`);
}
