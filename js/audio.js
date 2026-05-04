import {
  GAME_SOUND_SPEC,
  GAME_SOUND_IDS,
  SFX_PLAY_POOL_SIZE,
  BING_PLAYBACK_RATES_FOR_LENGTH,
  CHOIR_PLAYBACK_RATES_FOR_RANK,
} from "./config.js";
import {
  initWebSfxFromSpec,
  isWebAudioContextAvailable,
  isWebSfxPathActive,
  setSfxMasterMuted,
  playWebSfx,
  resetWebGameOver,
} from "./web-audio-sfx.js";

export {
  GAME_SOUND_SPEC,
  GAME_SOUND_IDS,
  BING_PLAYBACK_RATES_FOR_LENGTH,
  CHOIR_PLAYBACK_RATES_FOR_RANK,
} from "./config.js";

function setSfxPitchScalesWithPlaybackRate(el) {
  if (!el) return;
  try {
    el.preservesPitch = false;
  } catch (_) {}
}

export function bingPlaybackRateForWordLength(len) {
  const idx = Math.min(Math.max(len - 3, 0), 7);
  return BING_PLAYBACK_RATES_FOR_LENGTH[idx];
}

function buildGameSoundsFromSpec(spec) {
  const o = {};
  for (const { id, src } of spec) {
    const a = new Audio(src);
    a.preload = "auto";
    if (id === "bing" || id === "choir") setSfxPitchScalesWithPlaybackRate(a);
    o[id] = a;
  }
  return o;
}

function buildSoundPlayPools(spec, soundMap) {
  const pools = {};
  for (const { id, src } of spec) {
    if (id === "gameOver" || id === "perfect") continue;
    const pool = [soundMap[id]];
    for (let i = 1; i < SFX_PLAY_POOL_SIZE; i++) {
      const a = new Audio(src);
      a.preload = "auto";
      if (id === "bing" || id === "choir") setSfxPitchScalesWithPlaybackRate(a);
      pool.push(a);
    }
    pools[id] = pool;
  }
  return pools;
}

export const sounds = buildGameSoundsFromSpec(GAME_SOUND_SPEC);
export const soundPlayPools = buildSoundPlayPools(GAME_SOUND_SPEC, sounds);
export const soundPlayPoolCursor = Object.fromEntries(
  Object.keys(soundPlayPools).map((id) => [id, 0])
);

/** Eager `.load()` for HTML Audio paths (warm start before unlock). */
export function preloadGameSoundLayers() {
  GAME_SOUND_IDS.forEach((key) => {
    sounds[key].load();
    const pool = soundPlayPools[key];
    if (pool) {
      for (let i = 1; i < pool.length; i++) {
        pool[i].load();
      }
    }
  });
}

let gameAudioUnlocked = false;
let gameAudioUnlockInFlight = null;
let registeredHtmlGameOverEnded = null;
let registeredHtmlPerfectEnded = null;

async function primeHtmlAudioElement(el) {
  const prevMuted = el.muted;
  try {
    el.muted = true;
    await el.play();
    el.pause();
    el.currentTime = 0;
  } catch (_) {
  } finally {
    el.muted = prevMuted;
  }
}

export function unlockGameAudio() {
  if (gameAudioUnlocked) return Promise.resolve();
  if (gameAudioUnlockInFlight) return gameAudioUnlockInFlight;
  gameAudioUnlockInFlight = (async () => {
    try {
      if (isWebAudioContextAvailable()) {
        try {
          const ok = await initWebSfxFromSpec(GAME_SOUND_SPEC);
          if (ok) {
            gameAudioUnlocked = true;
            return;
          }
        } catch (_) {
          // fall back to HTML Audio priming
        }
      }
      const primers = [];
      for (const key of Object.keys(sounds)) {
        primers.push(primeHtmlAudioElement(sounds[key]));
      }
      for (const id of Object.keys(soundPlayPools)) {
        const pool = soundPlayPools[id];
        for (let i = 1; i < pool.length; i++) {
          primers.push(primeHtmlAudioElement(pool[i]));
        }
      }
      await Promise.all(primers);
      gameAudioUnlocked = true;
    } finally {
      gameAudioUnlockInFlight = null;
    }
  })();
  return gameAudioUnlockInFlight;
}

export function syncLiveSfxMute(muted) {
  if (isWebSfxPathActive()) {
    setSfxMasterMuted(!!muted);
  }
  for (const key of Object.keys(sounds)) {
    try {
      sounds[key].muted = muted;
    } catch (_) {}
  }
  for (const id of Object.keys(soundPlayPools)) {
    const pool = soundPlayPools[id];
    for (let i = 0; i < pool.length; i++) {
      try {
        pool[i].muted = muted;
      } catch (_) {}
    }
  }
}

function stopAllSfxHtml() {
  for (const id of Object.keys(soundPlayPools)) {
    const pool = soundPlayPools[id];
    for (let i = 0; i < pool.length; i++) {
      try {
        pool[i].pause();
        pool[i].currentTime = 0;
      } catch (_) {}
    }
  }
}

function playHtmlSound(name, muted, opts) {
  const playbackRateRaw = typeof opts.playbackRate === "number" ? opts.playbackRate : 1;
  const playbackRate = Math.min(2, Math.max(0.25, playbackRateRaw));
  const sound = sounds[name];
  if (!sound) return;
  if (name === "gameOver" || name === "perfect") {
    if (registeredHtmlGameOverEnded) {
      try {
        sounds.gameOver.removeEventListener("ended", registeredHtmlGameOverEnded);
      } catch (_) {}
      registeredHtmlGameOverEnded = null;
    }
    if (registeredHtmlPerfectEnded) {
      try {
        sounds.perfect.removeEventListener("ended", registeredHtmlPerfectEnded);
      } catch (_) {}
      registeredHtmlPerfectEnded = null;
    }
    try {
      sound.pause();
      sound.currentTime = 0;
    } catch (_) {}
    stopAllSfxHtml();
    sound.muted = !!muted;
    sound.defaultPlaybackRate = playbackRate;
    sound.playbackRate = playbackRate;
    const onEnded = typeof opts.onEnded === "function" ? opts.onEnded : null;
    if (onEnded) {
      const handler =
        name === "gameOver"
          ? function onGameOverHtmlEnded() {
              registeredHtmlGameOverEnded = null;
              onEnded();
            }
          : function onPerfectHtmlEnded() {
              registeredHtmlPerfectEnded = null;
              onEnded();
            };
      if (name === "gameOver") {
        registeredHtmlGameOverEnded = handler;
        sounds.gameOver.addEventListener("ended", registeredHtmlGameOverEnded);
      } else {
        registeredHtmlPerfectEnded = handler;
        sounds.perfect.addEventListener("ended", registeredHtmlPerfectEnded);
      }
    }
    void sound.play().catch(() => {});
    return;
  }
  const pool = soundPlayPools[name];
  if (!pool || pool.length === 0) return;
  let idx = soundPlayPoolCursor[name];
  if (idx === undefined) idx = 0;
  soundPlayPoolCursor[name] = (idx + 1) % pool.length;
  const a = pool[idx];
  a.muted = !!muted;
  if (name === "bing" || name === "choir") setSfxPitchScalesWithPlaybackRate(a);
  a.defaultPlaybackRate = playbackRate;
  a.playbackRate = playbackRate;
  try {
    a.pause();
    a.currentTime = 0;
  } catch (_) {}
  void a.play().catch(() => {});
}

export function playSound(name, muted, options) {
  const opts = options && typeof options === "object" ? options : {};
  if (isWebSfxPathActive()) {
    if (!gameAudioUnlocked) {
      void unlockGameAudio().then(() => playSound(name, muted, options));
      return;
    }
    if (playWebSfx(name, !!muted, opts)) {
      return;
    }
  }
  if (!gameAudioUnlocked) {
    void unlockGameAudio().then(() => playSound(name, muted, options));
    return;
  }
  playHtmlSound(name, !!muted, opts);
}

export function resetGameOverAudio() {
  if (isWebSfxPathActive()) {
    resetWebGameOver();
    return;
  }
  if (registeredHtmlGameOverEnded) {
    try {
      sounds.gameOver.removeEventListener("ended", registeredHtmlGameOverEnded);
    } catch (_) {}
    registeredHtmlGameOverEnded = null;
  }
  if (registeredHtmlPerfectEnded) {
    try {
      sounds.perfect.removeEventListener("ended", registeredHtmlPerfectEnded);
    } catch (_) {}
    registeredHtmlPerfectEnded = null;
  }
  try {
    sounds.gameOver.pause();
    sounds.gameOver.currentTime = 0;
  } catch (_) {}
  try {
    sounds.perfect.pause();
    sounds.perfect.currentTime = 0;
  } catch (_) {}
}

export function scheduleDeferredGameAudioWarmup() {
  const skipBingInvalidPrimes = gameAudioUnlocked;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      void unlockGameAudio().then(() => {
        if (skipBingInvalidPrimes) return;
        playSound("bing", true, {
          playbackRate: BING_PLAYBACK_RATES_FOR_LENGTH[0],
        });
        playSound("bing", true, {
          playbackRate: BING_PLAYBACK_RATES_FOR_LENGTH[7],
        });
        playSound("invalid", true);
        playSound("choir", true, {
          playbackRate: CHOIR_PLAYBACK_RATES_FOR_RANK[0],
        });
        playSound("choir", true, {
          playbackRate: CHOIR_PLAYBACK_RATES_FOR_RANK[8],
        });
      });
    });
  });
}
