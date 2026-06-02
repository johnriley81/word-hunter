const STORAGE_PREFIX = "wordhunter:lb-session:";
const SUBMIT_NAME_PREFIX = "wordhunter:lb-submit-name:";

/** @type {Map<string, string>} */
const memoryFallback = new Map();

/** @type {Map<string, string>} */
const submitNameMemoryFallback = new Map();

function randomUUID() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function resetLeaderboardSessionStorageForTests() {
  memoryFallback.clear();
  submitNameMemoryFallback.clear();
  try {
    if (typeof globalThis.localStorage === "undefined") return;
    const keys = [];
    for (let i = 0; i < globalThis.localStorage.length; i += 1) {
      const key = globalThis.localStorage.key(i);
      if (key?.startsWith(STORAGE_PREFIX) || key?.startsWith(SUBMIT_NAME_PREFIX)) {
        keys.push(key);
      }
    }
    for (const key of keys) globalThis.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

/**
 * Last successfully committed leaderboard name for this puzzle (survives reload).
 *
 * @param {number | string} puzzleId
 */
export function getLeaderboardSubmitName(puzzleId) {
  const key = `${SUBMIT_NAME_PREFIX}${String(puzzleId)}`;
  try {
    if (typeof globalThis.localStorage !== "undefined") {
      const existing = globalThis.localStorage.getItem(key);
      if (existing) return existing;
    }
  } catch {
    // fall through to in-memory fallback
  }
  return submitNameMemoryFallback.get(key) ?? "";
}

/**
 * @param {number | string} puzzleId
 * @param {string} nameTrim
 */
export function setLeaderboardSubmitName(puzzleId, nameTrim) {
  const key = `${SUBMIT_NAME_PREFIX}${String(puzzleId)}`;
  const value = String(nameTrim ?? "").trim();
  if (!value) return;
  try {
    if (typeof globalThis.localStorage !== "undefined") {
      globalThis.localStorage.setItem(key, value);
      return;
    }
  } catch {
    // fall through to in-memory fallback
  }
  submitNameMemoryFallback.set(key, value);
}

/**
 * Stable UUID per puzzle day for session-scoped leaderboard UPSERT.
 *
 * @param {number | string} puzzleId
 */
export function getLeaderboardSessionId(puzzleId) {
  const key = `${STORAGE_PREFIX}${String(puzzleId)}`;
  try {
    if (typeof globalThis.localStorage !== "undefined") {
      const existing = globalThis.localStorage.getItem(key);
      if (existing) return existing;
      const id = randomUUID();
      globalThis.localStorage.setItem(key, id);
      return id;
    }
  } catch {
    // fall through to in-memory fallback
  }
  if (memoryFallback.has(key)) return memoryFallback.get(key);
  const id = randomUUID();
  memoryFallback.set(key, id);
  return id;
}
