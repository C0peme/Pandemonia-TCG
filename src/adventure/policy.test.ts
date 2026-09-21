import { describe, expect, it } from 'vitest';
import { buildRegistry } from '@cards/registry';
import { starterCards, starterLeaders } from '@cards/data/starter';
import { simulateRun } from '@adventure/runSim';
import { startRun } from '@adventure/run';
import { SMART_POLICY, cardFit, relicFit } from '@adventure/policy';

const base = buildRegistry(starterCards, starterLeaders);
const fast = { usePlan: false, maxActs: 2, policy: SMART_POLICY } as const;

describe('SMART_POLICY', () => {
  it.each(starterLeaders.map((l) => l.id))('%s: plays a full run without stalling', (leaderId) => {
    const r = simulateRun(base, leaderId, 3, fast);
    expect(r.outcome).not.toBe('stalled');
  });

  it('is deterministic for a fixed leader and seed', () => {
    expect(simulateRun(base, 'orsyric', 7, fast)).toEqual(simulateRun(base, 'orsyric', 7, fast));
  });

  it('takes at least one Copper Mech attempt across a run', () => {
    const r = simulateRun(base, 'orsyric', 5, { usePlan: false, maxActs: 3, policy: SMART_POLICY });
    expect(r.copperAttempts).toBeGreaterThan(0);
  });
});

describe('cardFit', () => {
  it('scores a card higher when it matches the leader element', () => {
    // screyera is earth; gravel-hound is an earth card. Swapping only leaderId isolates
    // the element-match bonus from every other term (deck contents, HP, etc. unchanged).
    const run = startRun('screyera', 1, base);
    const offElementLeader = { ...run, leaderId: 'orsyric' }; // fire leader, same run otherwise
    const onElementScore = cardFit(base, run, 'gravel-hound');
    const offElementScore = cardFit(base, offElementLeader, 'gravel-hound');
    expect(onElementScore).toBeGreaterThan(offElementScore);
  });

  it('values a reach card much more when the deck has none yet', () => {
    const run = startRun('cleath', 1, base);
    const withoutReach = { ...run, deck: run.deck.filter((c) => c.cardId !== 'watchtowers') };
    const withReach = { ...withoutReach, deck: [...withoutReach.deck, { uid: 'test', cardId: 'watchtowers', enhancements: [] }] };
    const scoreOnEmptyReach = cardFit(base, withoutReach, 'watchtowers');
    const scoreAlreadyHasReach = cardFit(base, withReach, 'watchtowers');
    expect(scoreOnEmptyReach).toBeGreaterThan(scoreAlreadyHasReach);
  });
});

describe('relicFit', () => {
  it('scores a relic matching the leader element higher than a generic one', () => {
    const run = startRun('kedou', 1, base); // kedou is fire
    const matching = relicFit(run, base, 'emberbrand'); // fire units +1 attack
    const generic = relicFit(run, base, 'coin-pouch'); // flat coins, no plan fit
    expect(matching).toBeGreaterThan(generic);
  });
});
