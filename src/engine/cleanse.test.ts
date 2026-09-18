/**
 * Cleanse (Purify / Tail Twins revive) — regressions for three defects that came from
 * `cleanse` predating the mechanics it has to coexist with.
 */
import { describe, expect, it } from 'vitest';
import { testRegistry, blankState, unit } from '@engine/testkit';
import { starterRegistry } from '@cards/data/starter';
import { applyEffects } from '@engine/effects';
import { reconcileDrowning } from '@engine/drowning';
import { resolveStartOfTurn } from '@engine/endOfTurn';
import type { GameEvent } from '@engine/events';
import type { TargetRef } from '@engine/actions';

const cleanse = (s: ReturnType<typeof blankState>, iid: string): string | null => {
  const events: GameEvent[] = [];
  return applyEffects(s, 0, [{ kind: 'cleanse', target: 'ally' }], [{ kind: 'unit', iid }] as TargetRef[], undefined, events, testRegistry);
};

describe('cleanse targeting', () => {
  it('resolves against a picked unit instead of erroring', () => {
    // `cleanse` was missing from the TARGETED set, so it never consumed a target ref and
    // every card-cast cleanse (Purify) failed outright.
    const s = blankState();
    const u = unit({ owner: 0, attack: 2, hp: 5, status: { poisoned: 3 } });
    s.players[0].lanes.ground1.front = u;
    expect(cleanse(s, u.iid)).toBeNull();
    expect(u.status.poisoned).toBeUndefined();
  });

  it('a cleanse spell as authored in the card pool is castable', () => {
    // Was written against Purify and `testRegistry` — which is built from testkit's own tiny
    // card list and has never contained a starter card, so the guard below silently made the
    // whole test a no-op. Pointed at the real pool and at Rejuvenate, which absorbed Purify's
    // niche when the duplicate was cut (cleanse + heal 2 for one energy, vs cleanse alone).
    const purify = starterRegistry.cards.get('rejuvenate');
    if (!purify || purify.type !== 'spell') throw new Error('rejuvenate missing from the pool');
    const s = blankState();
    const u = unit({ owner: 0, attack: 2, hp: 5, status: { burn: 2 } });
    s.players[0].lanes.ground1.front = u;
    const events: GameEvent[] = [];
    expect(applyEffects(s, 0, purify.effects, [{ kind: 'unit', iid: u.iid }, { kind: 'unit', iid: u.iid }] as TargetRef[], undefined, events, starterRegistry)).toBeNull();
    expect(u.status.burn).toBeUndefined();
  });
});

describe('cleanse vs drowning (positional, not an affliction)', () => {
  it('leaves drowning intact so the unit keeps its remembered attack', () => {
    const s = blankState();
    const u = unit({ owner: 0, attack: 3, hp: 5, status: { poisoned: 2 } });
    s.players[0].lanes.water.front = u;
    reconcileDrowning(u, 'water');
    expect(u.attack).toBe(0);
    expect(u.predrownAttack).toBe(3);

    expect(cleanse(s, u.iid)).toBeNull();
    expect(u.status.poisoned).toBeUndefined(); // the affliction goes
    expect(u.status.drowning).toBe(true); // the position stays

    // The real damage of the old bug: a later refresh used to overwrite predrownAttack
    // with the zeroed value, permanently destroying the unit's attack.
    reconcileDrowning(u, 'water');
    expect(u.predrownAttack).toBe(3);
    reconcileDrowning(u, 'ground1');
    expect(u.attack).toBe(3);
  });

  it('a cleansed drowning unit still takes its drown tick', () => {
    const s = blankState();
    const u = unit({ owner: 0, attack: 3, hp: 5 });
    s.players[0].lanes.water.front = u;
    reconcileDrowning(u, 'water');
    cleanse(s, u.iid);
    const events: GameEvent[] = [];
    resolveStartOfTurn(s, 0, events, testRegistry);
    expect(events.some((e) => e.t === 'drownTick')).toBe(true);
  });
});

describe('cleanse vs keyword-backed statuses', () => {
  it('keeps beneficial statuses — cleanse targets your own unit', () => {
    // Zombified is a REVIVE ("revives once at 1 HP when destroyed"), i.e. a buff. Cleanse is
    // cast on your own unit, so stripping any of these would be perverse.
    const s = blankState();
    const u = unit({ owner: 0, attack: 2, hp: 4, keywords: { trueShield: true, taunt: true, zombified: true }, shield: 2 });
    u.keywords.shield = 2;
    s.players[0].lanes.ground1.front = u;
    cleanse(s, u.iid);
    expect(u.keywords.zombified).toBe(true);
    expect(u.keywords.trueShield).toBe(true);
    expect(u.keywords.taunt).toBe(true);
    expect(u.shield).toBe(2);
  });

  it('still clears the afflictions alongside them', () => {
    const s = blankState();
    const u = unit({ owner: 0, attack: 2, hp: 4, keywords: { zombified: true }, status: { poisoned: 3, freeze: 2 } });
    s.players[0].lanes.ground1.front = u;
    cleanse(s, u.iid);
    expect(u.status.poisoned).toBeUndefined();
    expect(u.status.freeze).toBeUndefined();
    expect(u.keywords.zombified).toBe(true);
  });
});

describe('True Shield expiry', () => {
  it('logs an expiry event, not a spurious "applied"', () => {
    const s = blankState();
    const u = unit({ owner: 0, attack: 2, hp: 4, keywords: { trueShield: true } });
    s.players[0].lanes.ground1.front = u;
    const events: GameEvent[] = [];
    resolveStartOfTurn(s, 0, events, testRegistry);
    expect(u.keywords.trueShield).toBeUndefined();
    expect(events.some((e) => e.t === 'statusExpired' && e.status === 'trueShield')).toBe(true);
    expect(events.some((e) => e.t === 'statusApplied' && e.status === 'trueShield')).toBe(false);
  });
});
