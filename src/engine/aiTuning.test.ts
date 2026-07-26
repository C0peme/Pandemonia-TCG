import { describe, expect, it } from 'vitest';
import { deckAggro, deckControl, deckDoT, deckMidrange, deckRamp, deckSwarm, starterRegistry } from '@cards/data/starter';
import { DEFAULT_WEIGHTS } from '@engine/ai';
import { formatWeights, matchSize, playMatch, tuneWeights } from '@engine/aiTuning';

// A spread of archetypes so tuned weights generalise rather than overfit one matchup.
const TUNE_DECKS = [deckAggro, deckControl, deckDoT, deckMidrange, deckRamp, deckSwarm];

describe('aiTuning harness', () => {
  it('plays a deterministic, fully-decided match', () => {
    const decks = [deckAggro, deckControl];
    const seeds = [1];
    const a = playMatch(starterRegistry, decks, DEFAULT_WEIGHTS, DEFAULT_WEIGHTS, seeds);
    const b = playMatch(starterRegistry, decks, DEFAULT_WEIGHTS, DEFAULT_WEIGHTS, seeds);
    expect(a).toEqual(b); // reproducible
    expect(a.a + a.b + a.draws).toBe(matchSize(decks, seeds));
  }, 60000);
});

// Gated: run with `TUNE=1 npx vitest run src/engine/aiTuning.test.ts` to optimise the weights.
// It prints a paste-ready object literal to fold into DEFAULT_WEIGHTS.
const TUNE = process.env.TUNE === '1';
describe('aiTuning (offline)', () => {
  (TUNE ? it : it.skip)('coordinate-ascends the eval weights via self-play', () => {
    const t0 = Date.now();
    // Focus on the high-impact / most-uncertain weights (the new combat-keyword terms and the
    // core stat/life tradeoffs) so the run is tractable and less prone to noise-fitting.
    const tuned = tuneWeights(starterRegistry, TUNE_DECKS, DEFAULT_WEIGHTS, {
      seeds: [1, 2],
      factors: [0.5, 1.5],
      passes: 2,
      marginFrac: 0.18,
      keys: ['attack', 'hp', 'lifeDanger', 'doubleStrike', 'multiTarget', 'spike', 'bloodlust', 'kamikaze', 'onHit', 'taunt', 'engineHorizon', 'growthHorizon'],
      // eslint-disable-next-line no-console
      log: (m) => console.log(`[tune] ${m}`),
    });
    // Validate on HELD-OUT seeds the tuner never saw, so we measure generalisation not overfit.
    const holdout = playMatch(starterRegistry, TUNE_DECKS, tuned, DEFAULT_WEIGHTS, [11, 12, 13]);
    // eslint-disable-next-line no-console
    console.log(`[tune] holdout tuned-vs-default: ${holdout.a}-${holdout.b} (draws ${holdout.draws}) in ${Date.now() - t0}ms`);
    // eslint-disable-next-line no-console
    console.log(`[tune] weights = ${formatWeights(tuned)}`);
    expect(holdout.a + holdout.b + holdout.draws).toBeGreaterThan(0);
  }, 600000);
});
