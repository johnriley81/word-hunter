import { syncWordReplaceAnimationCssVars } from "./css-vars.js";
import { createGameContext } from "./game-context.js";
import { initGame } from "./game.js";

document.addEventListener("DOMContentLoaded", () => {
  syncWordReplaceAnimationCssVars();
  initGame(createGameContext());
});
