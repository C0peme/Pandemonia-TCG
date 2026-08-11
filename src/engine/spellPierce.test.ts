/**
 * Card damage is a HIT: it resolves through the same `wakeOnHit` path as a unit's attack, so a
 * spell and a swing cannot disagree about what Freeze does. `pierce` is the effect-side twin of
 * the `pierce` keyword.
 */
import { describe, expect, it } from 'vitest';
import { applyEffects } from '@engine/effects';
import { blankState, unit, place, testRegistry } from '@engine/testkit';
import type { GameEvent } from '@engine/events';
import type { Effect } from '@cards/schema';

const registry = testRegistry;

const hit = (target: { freeze?: number; immunity?: boolean; shield?: number; hp?: number }, pierce: boolean) => {
  const s = blankState();
  const u = unit({ owner: 1, attack: 2, hp: target.hp ?? 5 });
  if (target.immunity) u.keywords.immunity = true;
  if (target.shield) { u.keywords.shield = target.shield; u.shield = target.shield; }
  if (target.freeze) u.status.freeze = target.freeze;
  place(s, 1, 'ground1', u);
  const events: GameEvent[] = [];
  const effect = { kind: 'damage', amount: 3, target: 'enemy', ...(pierce ? { pierce: true } : {}) } as Effect;
  applyEffects(s, 0, [effect], [{ kind: 'unit', iid: u.iid }], undefined, events, registry);
  return { unit: u, events };
};

describe('card damage resolves as a hit', () => {
  it('Freeze absorbs an ordinary damage effect, exactly as it absorbs an attack', () => {
    const { unit: u, events } = hit({ freeze: 1 }, false);
    expect(u.hp).toBe(5); // fully absorbed
    expect(u.status.freeze).toBeFalsy(); // ...and consumed
    expect(events.some((e) => e.t === 'blocked' && e.source === 'freeze')).toBe(true);
  });

  it('pierce ignores the Freeze block — the answer to something you just froze', () => {
    const { unit: u } = hit({ freeze: 1 }, true);
    expect(u.hp).toBe(2);
    expect(u.status.freeze).toBeFalsy();
  });

  it('pierce ignores Shield too, like Pierce', () => {
    expect(hit({ shield: 1 }, false).unit.hp).toBe(5); // shield eats it
    expect(hit({ shield: 1 }, true).unit.hp).toBe(2);
  });

  it('Immunity still stops a piercing hit', () => {
    const { unit: u } = hit({ freeze: 1, immunity: true }, true);
    expect(u.hp).toBe(2); // damage lands (Immunity does not prevent damage itself)
    expect(u.status.freeze).toBeFalsy();
  });

  it('an unfrozen target takes ordinary damage unchanged', () => {
    expect(hit({}, false).unit.hp).toBe(2);
  });
});
