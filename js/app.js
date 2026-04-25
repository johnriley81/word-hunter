import { syncWordReplaceAnimationCssVars } from "./css-vars.js";
import { createGameContext } from "./game-context.js";
import { initGame } from "./game.js";

syncWordReplaceAnimationCssVars();

document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  initGame(createGameContext(), {
    reverseDebug: params.get("debug_mode") === "1",
  });
});
