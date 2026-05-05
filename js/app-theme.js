/** @typedef {"default" | "night"} AppTheme */

/**
 * Toggles `data-theme` on `<html>`. Night visuals (dock, tiles, background, etc.) live in
 * style.css under `[data-theme="night"]`, not here — keep new theme chrome as CSS overrides.
 */

export const THEME_STORAGE_KEY = "wordhunter_theme";

/** Default / light theme icon (tap → night). */
const THEME_ICON_LIGHT = "\u{1F31B}";
/** Night mode active (tap → default). */
const THEME_ICON_NIGHT = "\u{1F338}";

/** @returns {AppTheme} */
export function readStoredTheme() {
  try {
    const raw = globalThis.localStorage?.getItem(THEME_STORAGE_KEY);
    if (raw === "night") return "night";
  } catch (_) {}
  return "default";
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
 * @param {AppTheme} theme
 * @param {{ root?: HTMLElement | null; toggleButton?: HTMLButtonElement | null }} [opts]
 */
export function applyTheme(theme, opts = {}) {
  const root = opts.root ?? globalThis.document?.documentElement;
  setRootTheme(root, theme);

  const btn = opts.toggleButton ?? null;
  if (btn) {
    const isNight = theme === "night";
    btn.textContent = isNight ? THEME_ICON_NIGHT : THEME_ICON_LIGHT;
    btn.setAttribute("aria-pressed", isNight ? "true" : "false");
    btn.setAttribute(
      "aria-label",
      isNight ? "Disable night mode" : "Enable night mode"
    );
  }

  try {
    globalThis.localStorage?.setItem(THEME_STORAGE_KEY, theme);
  } catch (_) {}
}

/**
 * @param {HTMLButtonElement | null} toggleButton
 * @param {{ getInitialTheme?: () => AppTheme }} [opts]
 */
export function initThemeToggle(toggleButton, opts = {}) {
  if (!toggleButton) return;

  const initial = opts.getInitialTheme ? opts.getInitialTheme() : readStoredTheme();
  applyTheme(initial, { toggleButton });

  toggleButton.addEventListener("click", () => {
    const next =
      toggleButton.getAttribute("aria-pressed") === "true" ? "default" : "night";
    applyTheme(next, { toggleButton });
  });
}
