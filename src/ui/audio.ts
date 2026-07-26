/**
 * Sound engine — a thin Web Audio layer for one-shot game SFX.
 *
 * Design (see also `soundMap.ts` for event→clip wiring in `useGame`):
 *   - A single lazily-created `AudioContext`. Constructing one before a user gesture
 *     warns in some browsers, so we build it on first use and `resume()` it from the
 *     first pointer/key event (`unlockAudio`) to satisfy the autoplay policy.
 *   - Every clip is fetched + `decodeAudioData`'d ONCE into an `AudioBuffer` and cached.
 *     A missing file (404) caches `null` so we never re-fetch it — this is what lets the
 *     game ship before the real audio assets exist: absent clips are simply silent.
 *   - Each play spins a fresh one-shot `AudioBufferSourceNode` (buffer sources cannot be
 *     restarted per spec) routed through a shared master `GainNode`. Overlapping combat
 *     hits therefore "just work" with no manual voice pooling.
 *   - `muted` / `volume` live on the master gain and persist to their own localStorage
 *     key (kept out of the content store in `store.ts`, which only holds card content).
 *
 * Nothing here throws out to callers: audio is best-effort and must never break the game.
 */

const LS_KEY = 'pandemonia.audio.v1';

/**
 * Extensions tried per clip, in preference order. `.ogg`/`.mp3` are the real-asset formats;
 * `.wav` covers the generated placeholder set (see `scripts/gen-sfx.mjs`). The first one that
 * 200s wins and is cached, so the extra probes only happen once per clip at preload time.
 */
const EXTS = ['ogg', 'mp3', 'wav'] as const;

interface AudioSettings {
  muted: boolean;
  volume: number; // 0..1  — master (SFX + music)
  musicMuted: boolean;
  musicVolume: number; // 0..1 — music bus, relative to master
}

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

const loadSettings = (): AudioSettings => {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<AudioSettings>;
      return {
        muted: typeof p.muted === 'boolean' ? p.muted : false,
        volume: typeof p.volume === 'number' ? clamp01(p.volume) : 0.7,
        musicMuted: typeof p.musicMuted === 'boolean' ? p.musicMuted : false,
        musicVolume: typeof p.musicVolume === 'number' ? clamp01(p.musicVolume) : 0.4,
      };
    }
  } catch {
    /* fall through to defaults */
  }
  return { muted: false, volume: 0.7, musicMuted: false, musicVolume: 0.4 };
};

let settings = loadSettings();
const saveSettings = (): void => {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(settings));
  } catch {
    /* storage unavailable — keep working in-memory */
  }
};

// --- Context + master bus (lazy) ----------------------------------------------

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let musicBus: GainNode | null = null; // music routes through here → master (own volume/mute)
let musicSource: AudioBufferSourceNode | null = null;
let musicName: string | null = null; // track name currently playing (avoid restarting the same loop)

/** `null` means "known missing" (404) so we don't retry; absent key means "not loaded yet". */
const buffers = new Map<string, AudioBuffer | null>();
const inflight = new Map<string, Promise<AudioBuffer | null>>();

const ensureCtx = (): AudioContext => {
  if (!ctx) {
    const Ctor: typeof AudioContext =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = settings.muted ? 0 : settings.volume;
    master.connect(ctx.destination);
    musicBus = ctx.createGain();
    musicBus.gain.value = settings.musicMuted ? 0 : settings.musicVolume;
    musicBus.connect(master);
  }
  return ctx;
};

const applyMasterGain = (): void => {
  if (master) master.gain.value = settings.muted ? 0 : settings.volume;
};

const applyMusicGain = (): void => {
  if (musicBus) musicBus.gain.value = settings.musicMuted ? 0 : settings.musicVolume;
};

// --- Loading ------------------------------------------------------------------

const load = (name: string): Promise<AudioBuffer | null> => {
  if (buffers.has(name)) return Promise.resolve(buffers.get(name) ?? null);
  const existing = inflight.get(name);
  if (existing) return existing;
  const p = (async (): Promise<AudioBuffer | null> => {
    try {
      for (const ext of EXTS) {
        let res: Response;
        try {
          res = await fetch(`${import.meta.env.BASE_URL}sfx/${name}.${ext}`);
        } catch {
          continue; // network error for this format → try the next
        }
        if (!res.ok) continue;
        // A dev server / SPA host answers a missing asset with the index.html shell
        // (200, text/html). Treat any non-audio response as "not this format".
        const ct = res.headers.get('content-type') ?? '';
        if (ct.includes('text/html')) continue;
        try {
          const buf = await ensureCtx().decodeAudioData(await res.arrayBuffer());
          buffers.set(name, buf);
          return buf;
        } catch {
          continue; // corrupt/undecodable for this format → try the next
        }
      }
      buffers.set(name, null); // no format found → silent, don't retry
      return null;
    } catch {
      buffers.set(name, null);
      return null;
    } finally {
      inflight.delete(name);
    }
  })();
  inflight.set(name, p);
  return p;
};

// --- Public API ---------------------------------------------------------------

/** Resume the context from a user gesture (autoplay policy). Idempotent, cheap to spam. */
export const unlockAudio = (): void => {
  void ensureCtx().resume();
};

/** Warm the decode cache so the first in-game hit has no fetch latency. */
export const preloadAll = (names: readonly string[]): void => {
  for (const n of names) void load(n);
};

/**
 * Fire a one-shot. Missing clips are silent no-ops. `opts.gain` scales this voice only
 * (0..1-ish), on top of the master volume — use it to tuck quieter/louder clips into the mix.
 */
export const playSound = (name: string, opts?: { gain?: number }): void => {
  if (settings.muted) return;
  const c = ensureCtx();
  const buf = buffers.get(name);
  if (buf === undefined) {
    // Not loaded yet: load, then play once (only if it turned out to exist).
    void load(name).then((b) => {
      if (b) playSound(name, opts);
    });
    return;
  }
  if (buf === null || !master) return; // known-missing or no bus
  const src = c.createBufferSource();
  src.buffer = buf;
  if (opts?.gain !== undefined && opts.gain !== 1) {
    const g = c.createGain();
    g.gain.value = opts.gain;
    src.connect(g).connect(master);
  } else {
    src.connect(master);
  }
  src.start(0);
};

export const getMuted = (): boolean => settings.muted;
export const getVolume = (): number => settings.volume;

export const setMuted = (m: boolean): void => {
  settings = { ...settings, muted: m };
  saveSettings();
  applyMasterGain();
};

export const setVolume = (v: number): void => {
  settings = { ...settings, volume: clamp01(v) };
  saveSettings();
  applyMasterGain();
};

// --- Music (looping background track through its own bus) ----------------------

/**
 * Start a looping track from `public/sfx/<name>.*`. Idempotent for the same track (a
 * second call while it's already playing is a no-op), so it's safe to call on every
 * unlock. Missing files are silent. Fades in briefly to avoid a hard click.
 */
export const playMusic = (name: string): void => {
  if (musicName === name && musicSource) return; // already looping this track
  const c = ensureCtx();
  const buf = buffers.get(name);
  if (buf === undefined) {
    void load(name).then((b) => {
      if (b) playMusic(name);
    });
    return;
  }
  if (buf === null || !musicBus) return;
  stopMusic();
  const src = c.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  src.connect(musicBus);
  src.start(0);
  musicSource = src;
  musicName = name;
};

export const stopMusic = (): void => {
  if (musicSource) {
    try { musicSource.stop(); } catch { /* already stopped */ }
    musicSource.disconnect();
  }
  musicSource = null;
  musicName = null;
};

export const getMusicMuted = (): boolean => settings.musicMuted;
export const getMusicVolume = (): number => settings.musicVolume;

export const setMusicMuted = (m: boolean): void => {
  settings = { ...settings, musicMuted: m };
  saveSettings();
  applyMusicGain();
};

export const setMusicVolume = (v: number): void => {
  settings = { ...settings, musicVolume: clamp01(v) };
  saveSettings();
  applyMusicGain();
};
