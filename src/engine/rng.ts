/**
 * Deterministic, serializable RNG (mulberry32).
 *
 * The engine must be reproducible: the same seed + same actions => same game.
 * RNG state is a plain number stored in the game state, so it serializes cleanly
 * for networking and replays. All functions are pure and return new state.
 */
export interface Rng {
  s: number;
}

export const createRng = (seed: number): Rng => ({ s: seed >>> 0 });

/** Advance the RNG, returning a float in [0, 1) and the next state. */
export const next = (rng: Rng): { rng: Rng; value: number } => {
  let t = (rng.s + 0x6d2b79f5) >>> 0;
  let x = t;
  x = Math.imul(x ^ (x >>> 15), x | 1);
  x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
  const value = ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  return { rng: { s: t }, value };
};

/** Integer in [0, maxExclusive). */
export const nextInt = (rng: Rng, maxExclusive: number): { rng: Rng; value: number } => {
  const { rng: r, value } = next(rng);
  return { rng: r, value: Math.floor(value * maxExclusive) };
};

/** Immutable Fisher–Yates shuffle. Returns a new array and the advanced RNG. */
export const shuffle = <T>(rng: Rng, input: readonly T[]): { rng: Rng; result: T[] } => {
  const result = [...input];
  let r = rng;
  for (let i = result.length - 1; i > 0; i--) {
    const step = nextInt(r, i + 1);
    r = step.rng;
    const j = step.value;
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return { rng: r, result };
};
