import { GRID_SIZE, SHIFT_MAX_STEPS_PER_GESTURE } from "./config.js";

/** Ensures the shift preview strip has enough inactive tile slots for max drag steps. */
export function ensureShiftPreviewElements(ctx) {
  const { shiftPreviewStrip } = ctx.refs;
  if (!shiftPreviewStrip) return;
  let inner = shiftPreviewStrip.querySelector(".shift-preview-inner");
  if (!inner) {
    inner = document.createElement("div");
    inner.className = "shift-preview-inner";
    shiftPreviewStrip.appendChild(inner);
  }
  const cap = GRID_SIZE * SHIFT_MAX_STEPS_PER_GESTURE;
  const tiles = inner.querySelectorAll(".shift-preview-tile");
  const frag = document.createDocumentFragment();
  for (let i = tiles.length; i < cap; i++) {
    const d = document.createElement("div");
    d.className = "grid-button grid-button--active shift-preview-tile";
    d.setAttribute("aria-hidden", "true");
    frag.appendChild(d);
  }
  inner.appendChild(frag);
  inner.querySelectorAll(".shift-preview-tile").forEach((el) => {
    el.classList.add("grid-button--active");
    el.classList.remove("grid-button--inactive");
  });
}
