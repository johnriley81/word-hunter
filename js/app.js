import { syncWordReplaceAnimationCssVars } from "./css-vars.js";
import { createGameContext } from "./game-context.js";
import { initGame } from "./game.js";

syncWordReplaceAnimationCssVars();

document.addEventListener("DOMContentLoaded", () => {
  initGame(createGameContext());
});
