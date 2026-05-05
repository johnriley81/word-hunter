import { initThemeToggle, readStoredTheme } from "./app-theme.js";
import { syncWordReplaceAnimationCssVars } from "./css-vars.js";
import { createGameContext } from "./game-context.js";
import { initGame } from "./game.js";

document.addEventListener("DOMContentLoaded", () => {
  syncWordReplaceAnimationCssVars();
  initThemeToggle(document.querySelector("#theme-toggle"), {
    getInitialTheme: readStoredTheme,
  });
  initGame(createGameContext());
});
