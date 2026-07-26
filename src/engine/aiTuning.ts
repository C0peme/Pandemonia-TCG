/**
 * Offline self-play tuner for the AI evaluation weights (`EvalWeights`).
 *
 * Every magic number in `evaluate`/`unitValue` is a guess. This module measures them: it
 * plays the fast greedy policy against itself with two weight sets and keeps a change only
 * if it demonstrably wins more games. It is NOT shipped or run in the normal test pass —
 * `aiTuning.test.ts` exposes a `TUNE=1`-gated entry point, and the winning weights are then
 * baked into `DEFAULT_WEIGHTS`. Pure and fully deterministic (seeded RNG), so reproducible.
 *
 * Greedy (not the full search) is used for speed; since the search models the opponent with
 * greedy and shares the same `evaluate`, weights that make greedy play better lift both tiers.
 */
import type { Deck } from '@cards/schema';
import type { Registry } from '@cards/registry';
import { applyAction } from '@engine/engine';
import { initGame } from '@engine/setup';
import { DEFAULT_WEIGHTS, greedyAction, type EvalWeights } from '@engine/ai';
import type { PlayerId } from '@engine/types';

const GUARD = 4000; // hard ply cap so a pathological game can never hang the tuner

/** Play one greedy game to a result; side `aSide` uses `wA`, the other uses `wB`. */
const playGame = (
  registry: Registry,
  deckA: Deck,
  deckB: Deck,
  wA: EvalWeights,
  wB: EvalWeights,
  seed: number,
  aSide: PlayerId,
): 'A' | 'B' | null => {
  const decks: [Deck, Deck] = aSide === 0 ? [deckA, deckB] : [deckB, deckA];
  let game = initGame({ registry, decks, seed });
  let guard = 0;
  while (game.phase !== 'ended' && guard < GUARD) {
    const w = game.active === aSide ? wA : wB;
    game = applyAction(registry, game, greedyAction(registry, game, w)).state;
    guard += 1;
  }
  if (game.winner === null) return null;
  return game.winner === aSide ? 'A' : 'B';
};

export interface MatchResult {
  a: number;
  b: number;
  draws: number;
}

/** Total games a `playMatch` over these decks/seeds will run (both first-player assignments). */
export const matchSize = (decks: Deck[], seeds: number[]): number => decks.length * seeds.length * 2;

/**
 * A match between weight set A and weight set B: every deck paired with the next deck in the
 * list (varied archetype matchups), each seed, and BOTH first-player assignments to cancel
 * the first-move advantage. Returns A's and B's win counts.
 */
export const playMatch = (
  registry: Registry,
  decks: Deck[],
  wA: EvalWeights,
  wB: EvalWeights,
  seeds: number[],
): MatchResult => {
  let a = 0;
  let b = 0;
  let draws = 0;
  for (let i = 0; i < decks.length; i++) {
    const deckA = decks[i]!;
    const deckB = decks[(i + 1) % decks.length]!;
    for (const seed of seeds) {
      for (const aSide of [0, 1] as PlayerId[]) {
        const r = playGame(registry, deckA, deckB, wA, wB, seed, aSide);
        if (r === 'A') a += 1;
        else if (r === 'B') b += 1;
        else draws += 1;
      }
    }
  }
  return { a, b, draws };
};

const round2 = (n: number): number => Math.round(n * 100) / 100;

export interface TuneOptions {
  seeds: number[];
  /** Multiplicative perturbations tried per weight, e.g. [0.5, 1.5, 0.75, 1.25]. */
  factors: number[];
  passes: number;
  /** A candidate must beat the incumbent by more than this fraction of the games played. */
  marginFrac: number;
  /** Restrict tuning to these weights (defaults to all). Cheaper / less noise-prone. */
  keys?: (keyof EvalWeights)[];
  log?: (msg: string) => void;
}

/**
 * Coordinate-ascent over the weights: for each weight, try scaling it by each factor and keep
 * the first perturbation that beats the incumbent by the margin, then move on. A few passes let
 * earlier accepted changes inform later ones. Returns the improved weights (a fresh object).
 */
export const tuneWeights = (registry: Registry, decks: Deck[], start: EvalWeights, opts: TuneOptions): EvalWeights => {
  const { seeds, factors, passes, marginFrac, log = () => {} } = opts;
  const keys = opts.keys ?? (Object.keys(start) as (keyof EvalWeights)[]);
  const margin = Math.max(1, Math.floor(marginFrac * matchSize(decks, seeds)));
  let best: EvalWeights = { ...start };

  for (let pass = 0; pass < passes; pass++) {
    let improvedThisPass = false;
    for (const key of keys) {
      for (const f of factors) {
        const value = round2(best[key] * f);
        if (value === best[key]) continue;
        const cand: EvalWeights = { ...best, [key]: value };
        const { a, b } = playMatch(registry, decks, cand, best, seeds);
        if (a - b > margin) {
          log(`pass ${pass}  ${key}: ${best[key]} -> ${value}  (candidate ${a}-${b}, +${a - b})`);
          best = cand;
          improvedThisPass = true;
          break; // accept and advance to the next weight
        }
      }
    }
    if (!improvedThisPass) break; // converged
  }
  return best;
};

/** Pretty-print weights as a paste-ready object literal for baking into `DEFAULT_WEIGHTS`. */
export const formatWeights = (w: EvalWeights): string => {
  const body = (Object.keys(DEFAULT_WEIGHTS) as (keyof EvalWeights)[])
    .map((k) => `  ${k}: ${w[k]},`)
    .join('\n');
  return `{\n${body}\n}`;
};
