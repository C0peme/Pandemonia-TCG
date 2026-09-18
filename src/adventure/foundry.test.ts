import { describe, expect, it } from 'vitest';
import { buildRegistry } from '@cards/registry';
import { starterCards, starterLeaders, starterDecks } from '@cards/data/starter';
import { FOUNDRY_START_ACT, FOUNDRY_ACT_GAIN, foundryDeck, foundrySize, foundryStack } from '@adventure/foundry';
import { rollEncounter } from '@adventure/encounters';
import { buildRunRegistry, advEnemyCardId, advCardId } from '@adventure/runRegistry';
import type { MapNode } from '@adventure/schema';

const base = buildRegistry(starterCards, starterLeaders);
const deck = starterDecks[0]!;
const node = (over: Partial<MapNode> = {}): MapNode => ({
  id: 'n3-0', kind: 'combat', layer: 3, col: 0, next: [], seed: 21, visited: false, ...over,
});

describe('the Foundry: enemies enhance too', () => {
  it('does nothing before the start act — acts 1-3 are the introduction', () => {
    for (let act = 1; act < FOUNDRY_START_ACT; act++) {
      expect(foundrySize(act), `act ${act}`).toBe(0);
      expect(foundryStack(42, act), `act ${act}`).toEqual([]);
    }
    expect(foundrySize(FOUNDRY_START_ACT)).toBe(FOUNDRY_ACT_GAIN);
  });

  it('ACCUMULATES: each act\'s stack is the previous act\'s plus more, never a re-roll', () => {
    // The whole reason this is derived from one roller rather than stored on RunState. The
    // enemy's build has to visibly grow across the run — act 7 is act 6 plus one more
    // working — or it reads as a different opponent every act rather than one that learned.
    for (const seed of [1, 42, 9001]) {
      for (let act = FOUNDRY_START_ACT; act < 12; act++) {
        const prev = foundryStack(seed, act);
        const next = foundryStack(seed, act + 1);
        expect(next.length).toBeGreaterThan(prev.length);
        expect(next.slice(0, prev.length)).toEqual(prev);
      }
    }
  });

  it('is fixed by the run seed alone — a reload can never re-roll the enemy\'s build', () => {
    expect(foundryStack(42, 8)).toEqual(foundryStack(42, 8));
    expect(foundryStack(42, 8)).not.toEqual(foundryStack(43, 8));
  });

  it('outpaces the player after act 3, which is the point', () => {
    // The player's curve is one working per Enhance node walked to — call it ~2 an act, and
    // capped by what the map offers. This one is unconditional and steeper, so the gap
    // opens from act 4 and is wide by act 8. Difficulty comes from the enemy getting
    // better, never from the player being allowed less.
    const playerish = (act: number): number => 2 * act;
    expect(foundrySize(FOUNDRY_START_ACT)).toBeLessThan(playerish(FOUNDRY_START_ACT));
    expect(foundrySize(10)).toBeGreaterThan(playerish(10) - playerish(FOUNDRY_START_ACT - 1));
    // And it keeps climbing rather than plateauing.
    expect(foundrySize(12)).toBeGreaterThan(foundrySize(8));
  });

  it('deepens as well as widens — late acts stack several workings on one body', () => {
    const deepest = (act: number): number => {
      const owned = foundryDeck(base, deck, 42, act);
      return Math.max(0, ...owned.map((o) => o.enhancements.length));
    };
    expect(deepest(FOUNDRY_START_ACT)).toBeGreaterThan(0);
    expect(deepest(11)).toBeGreaterThan(deepest(FOUNDRY_START_ACT));
    // A God Unit on their side is an emergent consequence of the same curve, not a
    // special case: deep enough into a run, some enemy card is carrying a stack.
    expect(deepest(14)).toBeGreaterThanOrEqual(4);
  });

  it('only ever works on units and foundations', () => {
    for (const act of [5, 8, 12]) {
      for (const o of foundryDeck(base, deck, 42, act)) {
        if (o.enhancements.length === 0) continue;
        const type = base.cards.get(o.cardId)!.type;
        expect(type === 'unit' || type === 'foundation', `${o.cardId} @ act ${act}`).toBe(true);
      }
    }
  });

  it('hands every working out — none are silently dropped on the floor', () => {
    for (const act of [4, 7, 11]) {
      const owned = foundryDeck(base, deck, 42, act);
      const dealt = owned.reduce((n, o) => n + o.enhancements.length, 0);
      expect(dealt, `act ${act}`).toBe(foundrySize(act));
    }
  });
});

describe('the Foundry through a real encounter', () => {
  it('is absent early and present from the start act, with matching derived defs', () => {
    expect(rollEncounter(base, node(), 2).enemyOwned).toBeUndefined();

    const enc = rollEncounter(base, node(), 8);
    expect(enc.enemyOwned).toBeDefined();
    const reg = buildRunRegistry(base, {
      deck: [], enemyDeck: enc.enemyOwned!, enemyLeaderId: enc.enemyLeaderId, enemyLeaderHp: enc.enemyHp,
    });
    // Every id the enemy deck names must resolve — the deck literal and the materialized
    // defs are built from the same list precisely so they cannot drift.
    for (const entry of enc.enemyDeck.cards) {
      expect(reg.cards.get(entry.cardId), entry.cardId).toBeTruthy();
    }
    expect(enc.enemyDeck.cards.some((c) => c.cardId.startsWith('adve:'))).toBe(true);
  });

  it('keeps the enemy\'s derived ids in their own namespace, clear of the player\'s', () => {
    // Both sides now mint derived defs from uid-like counters. A shared prefix would have
    // one side's enhanced card silently resolve to the other's body.
    expect(advEnemyCardId('e0')).not.toBe(advCardId('e0'));
    const enc = rollEncounter(base, node(), 9);
    const reg = buildRunRegistry(base, {
      deck: [{ uid: 'e0', cardId: 'coal-runner', enhancements: [{ kind: 'stat', attack: 5, hp: 5 }] }],
      enemyDeck: enc.enemyOwned!,
      enemyLeaderId: enc.enemyLeaderId, enemyLeaderHp: enc.enemyHp,
    });
    const mine = reg.cards.get(advCardId('e0'))!;
    expect(mine.type === 'unit' && mine.attack).toBe(
      (base.cards.get('coal-runner') as { attack: number }).attack + 5,
    );
  });

  it('the same run faces the same accumulated build at every node of an act', () => {
    // Keyed to the RUN seed, not the node seed: the enemy is one opponent getting better,
    // not a series of unrelated ones that happen to be scaled the same.
    const a = rollEncounter(base, node({ id: 'a', seed: 1 }), 8, 1, 777);
    const b = rollEncounter(base, node({ id: 'b', seed: 2 }), 8, 1, 777);
    const stackOf = (e: typeof a): number => (e.enemyOwned ?? []).reduce((n, o) => n + o.enhancements.length, 0);
    expect(stackOf(a)).toBe(stackOf(b));
  });
});
