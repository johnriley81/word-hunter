export const SFX_MUTED_STORAGE_KEY = "wordhunter_sfx_muted";

/** @returns {boolean} */
export function readStoredMuted() {
  try {
    return globalThis.localStorage?.getItem(SFX_MUTED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/** @param {boolean} muted */
export function persistMuted(muted) {
  try {
    if (muted) {
      globalThis.localStorage?.setItem(SFX_MUTED_STORAGE_KEY, "1");
    } else {
      globalThis.localStorage?.removeItem(SFX_MUTED_STORAGE_KEY);
    }
  } catch {
    /* localStorage unavailable */
  }
}
