/**
 * Generates placeholder sound effects + a looping ambient track as 16-bit PCM WAV files
 * into `public/sfx/`. These are fully synthesized here (no external/copyrighted samples),
 * so the game ships with audible, legal placeholder audio. Swap any file for a real clip
 * of the same base name at any time — the loader (`src/ui/audio.ts`) tries .ogg/.mp3/.wav.
 *
 *   node scripts/gen-sfx.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SR = 44100;
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sfx');
mkdirSync(OUT, { recursive: true });

// --- tiny synth toolkit -------------------------------------------------------

const buf = (secs) => new Float32Array(Math.max(1, Math.floor(secs * SR)));
const t = (i) => i / SR;
const clamp = (x) => Math.max(-1, Math.min(1, x));

/** Exponential decay envelope. */
const decay = (i, tau) => Math.exp(-t(i) / tau);
/** Attack-decay envelope. */
const ad = (i, atk, tau) => {
  const x = t(i);
  const a = atk <= 0 ? 1 : Math.min(1, x / atk);
  return a * Math.exp(-Math.max(0, x - atk) / tau);
};
const sine = (i, f) => Math.sin(2 * Math.PI * f * t(i));
const noise = () => Math.random() * 2 - 1;

/** Mix synth callbacks (i -> sample) into one buffer of `secs`. */
const render = (secs, fn) => {
  const b = buf(secs);
  for (let i = 0; i < b.length; i++) b[i] = clamp(fn(i));
  return b;
};

/** Light soft-clip / drive for a crunchier, lo-fi character. */
const drive = (b, amt = 1.6) => {
  for (let i = 0; i < b.length; i++) b[i] = Math.tanh(b[i] * amt);
  return b;
};

/** Downsample-and-hold (bitcrush-ish) for a grittier placeholder texture. */
const crush = (b, hold = 3) => {
  for (let i = 0; i < b.length; i += hold) {
    const v = b[i];
    for (let j = 1; j < hold && i + j < b.length; j++) b[i + j] = v;
  }
  return b;
};

const writeWav = (name, samples) => {
  const n = samples.length;
  const data = Buffer.alloc(44 + n * 2);
  data.write('RIFF', 0);
  data.writeUInt32LE(36 + n * 2, 4);
  data.write('WAVE', 8);
  data.write('fmt ', 12);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20); // PCM
  data.writeUInt16LE(1, 22); // mono
  data.writeUInt32LE(SR, 24);
  data.writeUInt32LE(SR * 2, 28);
  data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34);
  data.write('data', 36);
  data.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) data.writeInt16LE(Math.round(clamp(samples[i]) * 32767), 44 + i * 2);
  writeFileSync(join(OUT, `${name}.wav`), data);
  console.log(`  ${name}.wav (${(n / SR).toFixed(2)}s)`);
};

// --- per-event voices ---------------------------------------------------------

const voices = {
  // Combat
  attack_melee: () => drive(render(0.28, (i) => (noise() * 0.7 + sine(i, 140)) * decay(i, 0.06)), 2),
  attack_sniper: () => render(0.3, (i) => sine(i, 1600 - 2400 * t(i)) * ad(i, 0.002, 0.05) * 0.9),
  attack_lethal: () => drive(render(0.5, (i) => (noise() * 0.6 + sine(i, 90 - 60 * t(i))) * decay(i, 0.22)), 2.2),
  leader_hit: () => drive(render(0.35, (i) => (noise() * 0.8 + sine(i, 110)) * decay(i, 0.12)), 1.8),
  unit_death: () => render(0.5, (i) => (noise() * 0.5 + sine(i, 200 - 160 * t(i))) * decay(i, 0.2)),
  shield_block: () => render(0.3, (i) => (sine(i, 520) + sine(i, 780)) * 0.5 * ad(i, 0.004, 0.09)),
  // Playing cards
  unit_summon: () => render(0.34, (i) => (sine(i, 330 + 200 * t(i)) + sine(i, 495)) * 0.5 * ad(i, 0.01, 0.14)),
  foundation_place: () => drive(render(0.3, (i) => (noise() * 0.4 + sine(i, 160)) * decay(i, 0.09)), 1.5),
  spell_cast: () => render(0.5, (i) => (sine(i, 600 + 500 * Math.sin(2 * Math.PI * 7 * t(i)))) * ad(i, 0.02, 0.22) * 0.7),
  hero_power: () => render(0.6, (i) => (sine(i, 300 + 400 * t(i)) + sine(i, 450 + 600 * t(i))) * 0.45 * ad(i, 0.02, 0.3)),
  environment_play: () => render(0.6, (i) => (noise() * 0.25 + sine(i, 240)) * ad(i, 0.05, 0.3) * 0.7),
  // Status / stat
  burn: () => render(0.35, (i) => noise() * decay(i, 0.14) * 0.6),
  poison: () => render(0.4, (i) => (sine(i, 220 + 40 * Math.sin(2 * Math.PI * 12 * t(i)))) * decay(i, 0.18) * 0.6),
  heal: () => render(0.5, (i) => (sine(i, 660) + sine(i, 990)) * 0.4 * ad(i, 0.03, 0.28)),
  buff: () => render(0.4, (i) => sine(i, 440 + 330 * t(i)) * ad(i, 0.01, 0.2) * 0.7),
  debuff: () => render(0.4, (i) => sine(i, 440 - 240 * t(i)) * ad(i, 0.01, 0.2) * 0.7),
  transform: () => render(0.7, (i) => sine(i, 300 + 300 * Math.sin(2 * Math.PI * 3 * t(i))) * ad(i, 0.03, 0.35) * 0.7),
  signature: () => render(0.9, (i) => (sine(i, 523) + sine(i, 659) + sine(i, 784)) / 3 * ad(i, 0.02, 0.5)),
  // UI
  draw: () => render(0.2, (i) => noise() * decay(i, 0.05) * 0.5),
  bank: () => render(0.22, (i) => (sine(i, 880) + sine(i, 1320)) * 0.4 * ad(i, 0.002, 0.07)),
  game_over: () => render(1.4, (i) => (sine(i, 220 - 80 * t(i)) + sine(i, 110 - 40 * t(i))) * 0.4 * ad(i, 0.05, 0.9)),
  ui_deny: () => drive(render(0.2, (i) => sine(i, 150) * ad(i, 0.002, 0.06)), 2),
  move: () => render(0.3, (i) => sine(i, 300 + 500 * t(i)) * ad(i, 0.01, 0.12) * 0.6), // a swept "whoosh" up
  kamikaze: () => drive(render(0.6, (i) => (noise() * 0.9 + sine(i, 80 - 50 * t(i))) * decay(i, 0.22)), 2.4), // explosion
  sacrifice_select: () => render(0.16, (i) => (sine(i, 520) + sine(i, 660)) * 0.4 * ad(i, 0.002, 0.05)), // soft blip
  sacrifice_confirm: () => drive(render(0.35, (i) => (noise() * 0.5 + sine(i, 130)) * decay(i, 0.1)), 1.8), // dagger thunk
  end_turn: () => render(0.3, (i) => (sine(i, 440) + sine(i, 587)) * 0.4 * ad(i, 0.004, 0.12)), // confirm chord
  expel: () => render(0.28, (i) => sine(i, 900 - 600 * t(i)) * ad(i, 0.005, 0.1) * 0.5), // downward pop, unit pushed off board
};

// --- looping ambient music track ----------------------------------------------
// A slow, dark drone with a wandering high partial. Seamless: it's a pure sum of
// sines over an integer number of cycles of the LFO, so the loop point is glitch-free.

const music = () => {
  const LOOP = 16; // seconds; LFOs use frequencies that complete whole cycles in this span
  const b = buf(LOOP);
  for (let i = 0; i < b.length; i++) {
    const x = t(i);
    const drone = sine(i, 55) * 0.5 + sine(i, 82.5) * 0.3 + sine(i, 110) * 0.2; // A1 + fifth + octave
    const swell = 0.6 + 0.4 * Math.sin(2 * Math.PI * (1 / LOOP) * x); // one full swell per loop
    const shimmer = Math.sin(2 * Math.PI * 440 * x) * 0.06 * (0.5 + 0.5 * Math.sin(2 * Math.PI * (2 / LOOP) * x));
    const hiss = noise() * 0.015;
    b[i] = clamp((drone * swell + shimmer + hiss) * 0.6);
  }
  return crush(drive(b, 1.2), 2);
};

// --- run ----------------------------------------------------------------------

console.log('Generating SFX →', OUT);
for (const [name, fn] of Object.entries(voices)) writeWav(name, fn());
console.log('Generating music track…');
writeWav('music_ambient', music());
console.log('Done.');
