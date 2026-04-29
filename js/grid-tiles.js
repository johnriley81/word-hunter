import { normalizeTileText, getLetterWeight } from "./board-logic.js";

export function getTileButtonFromEvent(grid, event) {
  if (!(event.target instanceof Element)) return null;
  const button = event.target.closest(".grid-button");
  if (!button || !grid.contains(button)) return null;
  return button;
}

export function getTileText(el) {
  if (!el) return "";
  return normalizeTileText(el.dataset.tileText || el.textContent);
}

export function setTileText(el, tileText) {
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
  badge.textContent = isBlankTile ? "" : String(getLetterWeight(normalized));
  badge.style.display = isBlankTile ? "none" : "";
  if (!isBlankTile) {
    el.classList.remove(
      "grid-button--slot-consumed",
      "grid-button--slot-consumed-hunt-pace",
      "grid-button--slot-consumed-instant"
    );
  }
  el.disabled = isBlankTile;
}

/**
 * Peeled-slot styling (`grid-button--slot-consumed*`).
 * For blanks, `slot-consumed-instant` fully hides the tile. By default blanks
 * stay visible; pass `deferInstantHideForBlank: false` only if you need that
 * legacy instant-hide (unused in main game flow).
 */
export function syncConsumedEmptySlotVisual(el, cellText, opts = {}) {
  const deferInstantHideForBlank = opts.deferInstantHideForBlank !== false;
  const blank = normalizeTileText(cellText) === "";
  if (blank) {
    el.classList.remove(
      "grid-button--slot-consumed",
      "grid-button--slot-consumed-hunt-pace"
    );
    if (deferInstantHideForBlank) {
      el.classList.remove("grid-button--slot-consumed-instant");
    } else {
      el.classList.add("grid-button--slot-consumed-instant");
    }
  } else {
    el.classList.remove(
      "grid-button--slot-consumed",
      "grid-button--slot-consumed-hunt-pace",
      "grid-button--slot-consumed-instant"
    );
  }
}

/**
 * Like setTileText but never disables the button (for gamemaker empty cells).
 * @param {HTMLButtonElement} el
 * @param {string} tileText
 */
export function setTileTextAllowEmpty(el, tileText) {
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
  badge.textContent = isBlankTile ? "" : String(getLetterWeight(normalized));
  badge.style.display = isBlankTile ? "none" : "";
  el.disabled = false;
}

/** Resync tiles from logical board — blank cells stay visible (no instant peel-hide). */
export function syncDomFromBoard(grid, gameBoard, gridSize) {
  const n = gridSize;
  const tiles = grid.children;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const v = gameBoard[r][c];
      setTileText(tiles[r * n + c], v);
      syncConsumedEmptySlotVisual(tiles[r * n + c], v);
    }
  }
}
