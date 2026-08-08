import { describe, expect, it } from 'vitest';
import { DEFAULT_WEIGHTS } from '@engine/ai';
import { matchSize, playMatch } from '@engine/aiTuning';
import {
  starterRegistry, deckRamp, deckControl, deckAggro, deckDoT, deckMidrange, deckSwarm,
} from '@cards/data/starter';

const DECKS = [deckRamp, deckControl, deckAggro, deckDoT, deckMidrange, deckSwarm];

/**
 * The tuner can only find better weights if its scoreboard is fair. `playGame` seats weight
 * set A on `aSide`, and `aSide` always holds the first deck argument — so unless `playMatch`
 * also swaps the DECK assignment, A permanently plays one deck and B the other, and the score
 * measures which DECK is stronger rather than which AI is. That bias reached 31%-vs-69% on one
 * seed set, far larger than any weight change, which is why tuning runs came back empty.
 */
describe('aiTuning harness fairness', () => {
  it('scores identical weights as exactly even, on every seed set', () => {
    for (const seeds of [[1, 2], [1, 2, 3], [11, 12, 13]]) {
      const r = playMatch(starterRegistry, DECKS, DEFAULT_WEIGHTS, DEFAULT_WEIGHTS, seeds);
      expect(r.draws).toBe(0);
      // Exact, not approximate: every game is mirrored by one with the decks swapped, so a
      // self-match is symmetric by construction. Any drift here means the mirror broke.
      expect(r.a).toBe(r.b);
      expect(r.a + r.b + r.draws).toBe(matchSize(DECKS, seeds));
    }
  }, 900000);

  it('is not merely returning a tie for everything — a crippled weight set loses', () => {
    // Sanity check the instrument can still detect a difference when there genuinely is one.
    const crippled = { ...DEFAULT_WEIGHTS, attack: 0, hp: 0, lifeDanger: 0 };
    const r = playMatch(starterRegistry, DECKS, DEFAULT_WEIGHTS, crippled, [1, 2]);
    expect(r.a).toBeGreaterThan(r.b);
  }, 900000);
});
