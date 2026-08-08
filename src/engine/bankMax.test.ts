import { describe, expect, it } from 'vitest';
import { blankState, testRegistry, unit, place } from '@engine/testkit';
import { applyEffects, applyTriggeredEffects } from '@engine/effects';
import { ELEMENTS } from '@engine/constants';
import type { GameEvent } from '@engine/events';

// Corpselock's signature (Stage 4). Replaced a -2 cost discount that had quietly stopped
// mattering: costMod only ever reduces `cost.energy`, and after the ability-pip rework most
// of a card's cost lives in pips instead.
describe('bankMax', () => {
  const fire = (s: ReturnType<typeof blankState>, player: 0 | 1 = 0) => {
    const events: GameEvent[] = [];
    applyEffects(s, player, [{ kind: 'bankMax' }], [], undefined, events, testRegistry);
    return events;
  };

  it('fills every element bank to its cap', () => {
    const s = blankState();
    s.players[0].elementCaps = { fire: 3, water: 2, nature: 4, earth: 1 };
    s.players[0].bank = { fire: 1, water: 0, nature: 0, earth: 0 };
    fire(s);
    expect(s.players[0].bank).toEqual({ fire: 3, water: 2, nature: 4, earth: 1 });
  });

  it('never overfills or reduces a bank already at cap', () => {
    const s = blankState();
    s.players[0].elementCaps = { fire: 2, water: 2, nature: 2, earth: 2 };
    s.players[0].bank = { fire: 2, water: 2, nature: 2, earth: 2 };
    const events = fire(s);
    expect(s.players[0].bank).toEqual({ fire: 2, water: 2, nature: 2, earth: 2 });
    expect(events.filter((e) => e.t === 'bank')).toHaveLength(0); // nothing to report
  });

  it('reports one bank event per element actually filled', () => {
    const s = blankState();
    s.players[0].elementCaps = { fire: 2, water: 2, nature: 2, earth: 2 };
    s.players[0].bank = { fire: 2, water: 0, nature: 1, earth: 0 };
    const banked = fire(s).filter((e) => e.t === 'bank') as Extract<GameEvent, { t: 'bank' }>[];
    expect(banked.map((e) => e.element).sort()).toEqual(['earth', 'nature', 'water']);
    expect(banked.reduce((sum, e) => sum + e.amount, 0)).toBe(5); // 2 + 1 + 2
  });

  it('is per-player — it never touches the opponent', () => {
    const s = blankState();
    for (const p of [0, 1] as const) {
      s.players[p].elementCaps = { fire: 2, water: 2, nature: 2, earth: 2 };
      s.players[p].bank = { fire: 0, water: 0, nature: 0, earth: 0 };
    }
    fire(s, 0);
    expect(ELEMENTS.every((el) => s.players[1].bank[el] === 0)).toBe(true);
  });

  // Regression: player-scoped effects are dispatched from an explicit whitelist in
  // applyTriggeredEffects. A kind missing from it falls through to unit-targeting and is
  // dropped silently — exactly how `energyNext` resolved to nothing when it was added.
  it('resolves from a triggered context, not just a cast', () => {
    const s = blankState();
    s.players[0].elementCaps = { fire: 2, water: 2, nature: 2, earth: 2 };
    s.players[0].bank = { fire: 0, water: 0, nature: 0, earth: 0 };
    const u = unit({ owner: 0, attack: 1, hp: 2 });
    place(s, 0, 'ground1', u);
    const events: GameEvent[] = [];
    applyTriggeredEffects(s, u, [{ kind: 'bankMax' }], events, undefined, testRegistry);
    expect(s.players[0].bank).toEqual({ fire: 2, water: 2, nature: 2, earth: 2 });
  });
});
