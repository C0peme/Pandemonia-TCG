/**
 * Deterministic seed derivation for Adventure runs.
 *
 * Every random decision in a run (map layout, shop stock, enhancement offers, enemy
 * deck trims, fight shuffles) derives its own sub-seed from the master run seed plus
 * a descriptive salt. Nothing depends on the ORDER randomness is consumed in, so a
 * run reloaded from localStorage mid-node reproduces exactly the same offers.
 */
import { createRng, next, nextInt, shuffle } from '@engine/rng';

/** FNV-1a over the salt, folded with the master seed, then whitened through mulberry32. */
export const subSeed = (master: number, ...salt: (string | number)[]): number => {
  let h = (0x811c9dc5 ^ (master >>> 0)) >>> 0;
  const s = salt.join('|');
  for (let i = 0; i < s.length; i++) {
    h = (h ^ s.charCodeAt(i)) >>> 0;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  const { value } = next(createRng(h));
  return Math.floor(value * 4294967296) >>> 0;
};

/**
 * A small imperative roller over the engine's pure RNG, for generator code that
 * draws many values from one sub-seed. Not serialized — always create from a
 * `subSeed` so results are reproducible.
 */
export interface Roller {
  float: () => number;
  int: (maxExclusive: number) => number;
  pick: <T>(arr: readonly T[]) => T;
  shuffle: <T>(arr: readonly T[]) => T[];
  chance: (p: number) => boolean;
}

export const makeRoller = (seed: number): Roller => {
  let rng = createRng(seed);
  const float = (): number => {
    const r = next(rng);
    rng = r.rng;
    return r.value;
  };
  const int = (maxExclusive: number): number => {
    const r = nextInt(rng, maxExclusive);
    rng = r.rng;
    return r.value;
  };
  return {
    float,
    int,
    pick: <T>(arr: readonly T[]): T => {
      if (arr.length === 0) throw new Error('pick from empty array');
      return arr[int(arr.length)]!;
    },
    shuffle: <T>(arr: readonly T[]): T[] => {
      const r = shuffle(rng, arr);
      rng = r.rng;
      return r.result;
    },
    chance: (p: number): boolean => float() < p,
  };
};
