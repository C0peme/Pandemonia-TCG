import { describe, expect, it } from 'vitest';
import { buildRegistry } from '@cards/registry';
import { starterCards, starterLeaders } from '@cards/data/starter';
import { simulateRun } from '@adventure/runSim';
import { startRun } from '@adventure/run';
import { SMART_POLICY, cardFit, relicFit, eventOutcomeValue } from '@adventure/policy';
import { makeRoller } from '@adventure/seed';

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

  it('reinforces a keyword the deck has already committed to', () => {
    // noctua's starter already carries 6 `growth` instances (bloom-elk x3, iron-seed x2's
    // grant, surge-sprite). fertile-mound (also growth) isn't owned in either branch, so
    // the diminishing-copies term is 0 in both and can't confound the comparison.
    const run = startRun('noctua', 1, base);
    const withoutGrowth = { ...run, deck: run.deck.filter((c) => !['bloom-elk', 'iron-seed', 'surge-sprite'].includes(c.cardId)) };
    const committedScore = cardFit(base, run, 'fertile-mound');
    const uncommittedScore = cardFit(base, withoutGrowth, 'fertile-mound');
    expect(committedScore).toBeGreaterThan(uncommittedScore);
  });
});

describe('eventOutcomeValue', () => {
  it('ranks a guaranteed relic above nothing', () => {
    const run = startRun('kedou', 1, base);
    expect(eventOutcomeValue(base, run, { kind: 'relic', bands: ['common', 'rare'] })).toBeGreaterThan(
      eventOutcomeValue(base, run, { kind: 'nothing' }),
    );
  });

  it('values sacrificing two cards for a buff only once the deck can afford it', () => {
    const run = startRun('kedou', 1, base);
    const bloated = { ...run, deck: [...run.deck, ...run.deck, ...run.deck].slice(0, 30) };
    const lean = { ...run, deck: run.deck.slice(0, 18) };
    expect(eventOutcomeValue(base, bloated, { kind: 'sacrificeEnhance' })).toBeGreaterThan(0);
    expect(eventOutcomeValue(base, lean, { kind: 'sacrificeEnhance' })).toBeLessThan(0);
  });

  it('scores a named card outcome via cardFit instead of the flat random-card estimate', () => {
    const run = startRun('screyera', 1, base);
    const named = eventOutcomeValue(base, run, { kind: 'card', cardId: 'gravel-hound' });
    const random = eventOutcomeValue(base, run, { kind: 'card', cardId: 'random' });
    expect(named).toEqual(cardFit(base, run, 'gravel-hound'));
    expect(named).not.toEqual(random);
  });
});

describe('SMART_POLICY.route boss lookahead', () => {
  it('prefers a wider card pick (elite) over gearing up while far from the boss, but gears up once the boss is close', () => {
    const run = startRun('kedou', 1, base);
    const healthy = { ...run, hp: run.maxHp };
    const nodeAt = (layer: number, id: string) => ({ [id]: { layer } });
    const reachable = [
      { id: 'elite-1', kind: 'elite', layer: 0, col: 0, next: [], seed: 1, visited: false },
      { id: 'enhance-1', kind: 'enhance', layer: 0, col: 1, next: [], seed: 2, visited: false },
    ] as const;
    const roll = makeRoller(1);

    const far = {
      ...healthy,
      currentNodeId: 'start',
      map: { ...healthy.map, layers: [[], [], [], [], [], []], nodes: { ...healthy.map.nodes, ...nodeAt(0, 'start') } },
    };
    const near = {
      ...healthy,
      currentNodeId: 'start',
      map: { ...healthy.map, layers: [[], [], [], [], [], []], nodes: { ...healthy.map.nodes, ...nodeAt(4, 'start') } },
    };

    expect(SMART_POLICY.route(far as typeof run, reachable as never, roll)).toBe('elite-1');
    expect(SMART_POLICY.route(near as typeof run, reachable as never, roll)).toBe('enhance-1');
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
