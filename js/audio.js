import {
  GAME_SOUND_SPEC,
  SFX_PLAY_POOL_SIZE,
  BING_PLAYBACK_RATES_FOR_LENGTH,
} from "./config.js";

export { GAME_SOUND_SPEC, GAME_SOUND_IDS, BING_PLAYBACK_RATES_FOR_LENGTH } from "./config.js";

function setBingPitchScalesWithPlaybackRate(el) {
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
    if (id === "bing") setBingPitchScalesWithPlaybackRate(a);
    o[id] = a;
  }
  return o;
}

function buildSoundPlayPools(spec, soundMap) {
  const pools = {};
  for (const { id, src } of spec) {
    if (id === "gameOver") continue;
    const pool = [soundMap[id]];
    for (let i = 1; i < SFX_PLAY_POOL_SIZE; i++) {
      const a = new Audio(src);
      a.preload = "auto";
      if (id === "bing") setBingPitchScalesWithPlaybackRate(a);
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

let gameAudioUnlocked = false;
let gameAudioUnlockInFlight = null;

export function unlockGameAudio() {
  if (gameAudioUnlocked) return Promise.resolve();
  if (gameAudioUnlockInFlight) return gameAudioUnlockInFlight;
  gameAudioUnlockInFlight = (async () => {
    try {
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
      for (const key of Object.keys(sounds)) {
        await primeHtmlAudioElement(sounds[key]);
      }
      for (const id of Object.keys(soundPlayPools)) {
        const pool = soundPlayPools[id];
        for (let i = 1; i < pool.length; i++) {
          await primeHtmlAudioElement(pool[i]);
        }
      }
      gameAudioUnlocked = true;
    } finally {
      gameAudioUnlockInFlight = null;
    }
  })();
  return gameAudioUnlockInFlight;
}

export function syncLiveSfxMute(muted) {
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

function stopAllHtmlGameAudio() {
  for (const key of Object.keys(sounds)) {
    try {
      sounds[key].pause();
      sounds[key].currentTime = 0;
    } catch (_) {}
  }
  for (const id of Object.keys(soundPlayPools)) {
    const pool = soundPlayPools[id];
    for (let i = 1; i < pool.length; i++) {
      try {
        pool[i].pause();
        pool[i].currentTime = 0;
      } catch (_) {}
    }
  }
}

export function playSound(name, muted, options) {
  const opts = options && typeof options === "object" ? options : {};
  const playbackRateRaw =
    typeof opts.playbackRate === "number" ? opts.playbackRate : 1;
  const playbackRate = Math.min(2, Math.max(0.25, playbackRateRaw));
  const sound = sounds[name];
  if (!sound) return;
  stopAllHtmlGameAudio();
  if (name === "gameOver") {
    sound.muted = !!muted;
    sound.defaultPlaybackRate = playbackRate;
    sound.playbackRate = playbackRate;
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
  if (name === "bing") setBingPitchScalesWithPlaybackRate(a);
  a.defaultPlaybackRate = playbackRate;
  a.playbackRate = playbackRate;
  try {
    a.pause();
    a.currentTime = 0;
  } catch (_) {}
  void a.play().catch(() => {});
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
      });
    });
  });
}
