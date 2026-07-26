import { describe, expect, it } from 'vitest';
import { applyAction } from '@engine/engine';
import { resolveCombat } from '@engine/combat';
import { processDeaths } from '@engine/effects';
import { starterRegistry } from '@cards/data/starter';
import { blankState, place, unit } from '@engine/testkit';
import type { GameEvent } from '@engine/events';

describe('WIP audit: cards that should already work', () => {
  it('Carrat: kamikaze conjures Carrocket into its owner hand on death', () => {
    const s = blankState();
    const u = unit({ owner: 0, cardId: 'carrat', hp: 0, keywords: { kamikaze: { kind: 'conjure', cardId: 'carrocket' } } });
    place(s, 0, 'ground1', u);
    const events: GameEvent[] = [];
    processDeaths(s, events, undefined, starterRegistry);
    expect(s.players[0].lanes.ground1.front).toBeUndefined();
    expect(s.players[0].hand.some((c) => c.cardId === 'carrocket')).toBe(true);
  });

  it('Molten Floor: applies Burn during combat, which bites a unit that attacks', () => {
    const s = blankState();
    s.environments.ground1 = { iid: 'env', cardId: 'molten-floor', owner: 0 };
    place(s, 0, 'ground1', unit({ owner: 0, cardId: 'ember-pup', attack: 1, hp: 5 }));
    const { state } = resolveCombat(s, undefined, starterRegistry);
    const u = state.players[0].lanes.ground1.front!;
    expect(u.status.burn).toBe(1);  // environment applied Burn 1 at combat
    expect(u.hp).toBe(4);           // and it procced before the unit attacked the leader
  });

  it('Sludge Pool: applies Poison during combat (poison damage resolves at end of turn)', () => {
    const s = blankState();
    s.environments.ground1 = { iid: 'env', cardId: 'sludge-pool', owner: 0 };
    place(s, 0, 'ground1', unit({ owner: 0, cardId: 'ember-pup', attack: 1, hp: 5 }));
    const { state } = resolveCombat(s, undefined, starterRegistry);
    const u = state.players[0].lanes.ground1.front!;
    expect(u.status.poisoned).toBeGreaterThan(0); // environment applied Poison at combat
    expect(u.hp).toBe(5); // poison does not tick during combat — only at end of turn
  });

  it('Chain Spark: kills the target, then chains 1 to another enemy', () => {
    const s = blankState();
    s.players[0].energy = 5;
    s.players[0].bank = { fire: 1, water: 0, nature: 0, earth: 0 };
    s.players[0].hand = [{ iid: 'sp', cardId: 'chain-spark' }];
    // Primary target dies to the 2 damage; a second enemy takes the chained 1.
    place(s, 1, 'ground1', unit({ owner: 1, cardId: 'v0', attack: 1, hp: 2 }));
    place(s, 1, 'ground2', unit({ owner: 1, cardId: 'v0', attack: 1, hp: 3 }));
    const { state } = applyAction(starterRegistry, s, {
      type: 'playSpell',
      iid: 'sp',
      targets: [{ kind: 'unit', iid: s.players[1].lanes.ground1.front!.iid }],
    });
    expect(state.players[1].lanes.ground1.front).toBeUndefined(); // killed by 2
    expect(state.players[1].lanes.ground2.front?.hp).toBe(2); // chained 1 (3 → 2)
  });

  it('Chain Spark: does NOT chain when the target survives', () => {
    const s = blankState();
    s.players[0].energy = 5;
    s.players[0].bank = { fire: 1, water: 0, nature: 0, earth: 0 };
    s.players[0].hand = [{ iid: 'sp', cardId: 'chain-spark' }];
    place(s, 1, 'ground1', unit({ owner: 1, cardId: 'v0', attack: 1, hp: 5 }));
    place(s, 1, 'ground2', unit({ owner: 1, cardId: 'v0', attack: 1, hp: 3 }));
    const { state } = applyAction(starterRegistry, s, {
      type: 'playSpell',
      iid: 'sp',
      targets: [{ kind: 'unit', iid: s.players[1].lanes.ground1.front!.iid }],
    });
    expect(state.players[1].lanes.ground1.front?.hp).toBe(3); // 5 − 2, survived
    expect(state.players[1].lanes.ground2.front?.hp).toBe(3); // untouched — no chain
  });
});
