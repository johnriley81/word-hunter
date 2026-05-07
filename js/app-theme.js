/** @typedef {"default" | "night"} AppTheme */

/** `data-theme` = day/night (CSS in style.css); `data-visual-scheme="og"` = OG overlay; storage keys stay separate. */

export const THEME_STORAGE_KEY = "wordhunter_theme";
export const OG_VISUAL_STORAGE_KEY = "wordhunter_visual_og";

const OG_LONG_PRESS_MS = 1000;
const THEME_ICON_LIGHT = "\u{1F31B}";
const THEME_ICON_NIGHT = "\u{1F338}";

/** @returns {AppTheme} */
export function readStoredTheme() {
  try {
    const raw = globalThis.localStorage?.getItem(THEME_STORAGE_KEY);
    if (raw === "night") return "night";
  } catch (_) {}
  return "default";
}

/** @returns {boolean} */
export function readStoredOgVisual() {
  try {
    return globalThis.localStorage?.getItem(OG_VISUAL_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * @param {HTMLElement | null} [root]
 * @returns {boolean}
 */
export function isOgVisualScheme(root = null) {
  try {
    const el = root ?? globalThis.document?.documentElement;
    if (!el) return false;
    return el.getAttribute("data-visual-scheme") === "og";
  } catch {
    return false;
  }
}

/**
 * @param {boolean} enabled
 * @param {{ root?: HTMLElement | null }} [opts]
 */
export function applyOgVisual(enabled, opts = {}) {
  const root = opts.root ?? globalThis.document?.documentElement;
  if (!root) return;
  if (enabled) {
    root.setAttribute("data-visual-scheme", "og");
  } else {
    root.removeAttribute("data-visual-scheme");
  }
  try {
    if (enabled) {
      globalThis.localStorage?.setItem(OG_VISUAL_STORAGE_KEY, "1");
    } else {
      globalThis.localStorage?.removeItem(OG_VISUAL_STORAGE_KEY);
    }
  } catch (_) {}
}

/**
 * @param {HTMLElement | null} [root]
 * @returns {boolean}
 */
export function isNightTheme(root = null) {
  try {
    const el = root ?? globalThis.document?.documentElement;
    if (!el) return false;
    return el.getAttribute("data-theme") === "night";
  } catch {
    return false;
  }
}

/** @param {HTMLElement | null} root */
function setRootTheme(root, theme) {
  if (!root) return;
  if (theme === "night") {
    root.setAttribute("data-theme", "night");
  } else {
    root.removeAttribute("data-theme");
  }
}

/**
 * @param {HTMLButtonElement | null} toggleButton
 * @param {HTMLElement | null} root
 */
function syncThemeToggleButton(toggleButton, root) {
  if (!toggleButton) return;
  const isNight = isNightTheme(root);
  const og = isOgVisualScheme(root);
  toggleButton.textContent = isNight ? THEME_ICON_NIGHT : THEME_ICON_LIGHT;
  toggleButton.setAttribute("aria-pressed", isNight ? "true" : "false");
  toggleButton.setAttribute(
    "aria-label",
    og
      ? isNight
        ? "Switch to day mode (exits OG visuals)"
        : "Switch to night mode (exits OG visuals)"
      : isNight
        ? "Disable night mode"
        : "Enable night mode"
  );
}

/**
 * @param {AppTheme} theme
 * @param {{ root?: HTMLElement | null; toggleButton?: HTMLButtonElement | null }} [opts]
 */
export function applyTheme(theme, opts = {}) {
  const root = opts.root ?? globalThis.document?.documentElement;
  setRootTheme(root, theme);
  syncThemeToggleButton(opts.toggleButton ?? null, root);
  try {
    globalThis.localStorage?.setItem(THEME_STORAGE_KEY, theme);
  } catch (_) {}
}

/**
 * @param {HTMLButtonElement | null} toggleButton
 * @param {{ getInitialTheme?: () => AppTheme; root?: HTMLElement | null }} [opts]
 */
export function initThemeToggle(toggleButton, opts = {}) {
  if (!toggleButton) return;

  const root = opts.root ?? globalThis.document?.documentElement ?? null;

  const initial = opts.getInitialTheme ? opts.getInitialTheme() : readStoredTheme();
  applyTheme(initial, { toggleButton, root });
  applyOgVisual(readStoredOgVisual(), { root });
  syncThemeToggleButton(toggleButton, root);

  let longPressTimer = null;
  let suppressThemeClick = false;

  function clearLongPressTimer() {
    if (longPressTimer != null) {
      globalThis.clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  }

  toggleButton.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    clearLongPressTimer();
    if (root && isOgVisualScheme(root)) return;
    longPressTimer = globalThis.setTimeout(() => {
      longPressTimer = null;
      applyOgVisual(true, { root });
      const logical = root && isNightTheme(root) ? "night" : "default";
      applyTheme(logical, { toggleButton, root });
      suppressThemeClick = true;
    }, OG_LONG_PRESS_MS);
  });

  toggleButton.addEventListener("pointerup", clearLongPressTimer);
  toggleButton.addEventListener("pointercancel", clearLongPressTimer);
  toggleButton.addEventListener("pointerleave", clearLongPressTimer);

  toggleButton.addEventListener("click", (e) => {
    if (suppressThemeClick) {
      e.preventDefault();
      e.stopImmediatePropagation();
      suppressThemeClick = false;
      return;
    }
    if (root && isOgVisualScheme(root)) {
      applyOgVisual(false, { root });
    }
    const next =
      toggleButton.getAttribute("aria-pressed") === "true" ? "default" : "night";
    applyTheme(next, { toggleButton, root });
  });
}
