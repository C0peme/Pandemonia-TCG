import { describe, expect, it } from 'vitest';
import { applyEffects } from '@engine/effects';
import { resolveEndOfTurn } from '@engine/endOfTurn';
import { blankState, place, unit, testRegistry } from '@engine/testkit';
import type { GameEvent } from '@engine/events';

/**
 * Every path that writes a unit's attack has to respect the drowning shadow store
 * (`predrownAttack`), or it either breaks the "submerged units have 0 attack" invariant
 * or silently loses the write when the unit surfaces. `drowning.ts` owns the rule via
 * `addAttack`/`reconcileDrowning`; these are the two paths that used to bypass it.
 */
describe('attack writes respect the drowning shadow store', () => {
  const submerged = (attack: number) => {
    const u = unit({ owner: 0, attack: 0, hp: 4, status: { drowning: true } });
    u.predrownAttack = attack;
    return u;
  };

  it('setStats on a drowning unit leaves it at 0 attack and banks the new value', () => {
    const s = blankState();
    const u = submerged(3);
    place(s, 0, 'water', u);
    const events: GameEvent[] = [];

    const error = applyEffects(
      s,
      0,
      [{ kind: 'setStats', target: 'ally', stat: { attack: 5, hp: 5 } }],
      [{ kind: 'unit', iid: u.iid }],
      undefined,
      events,
      testRegistry,
    );

    expect(error ?? undefined).toBeUndefined();
    // The invariant: a submerged unit never has live attack.
    expect(u.attack).toBe(0);
    expect(u.status.drowning).toBe(true);
    // ...and the new value is not lost — it is what it surfaces with.
    expect(u.predrownAttack).toBe(5);
    expect(u.maxHp).toBe(5);
  });

  it('setStats that only changes HP does not wipe a drowning unit banked attack', () => {
    const s = blankState();
    const u = submerged(3);
    place(s, 0, 'water', u);
    const events: GameEvent[] = [];

    applyEffects(
      s,
      0,
      [{ kind: 'setStats', target: 'ally', stat: { hp: 7 } }],
      [{ kind: 'unit', iid: u.iid }],
      undefined,
      events,
      testRegistry,
    );

    expect(u.attack).toBe(0);
    expect(u.predrownAttack).toBe(3);
    expect(u.maxHp).toBe(7);
  });

  it('Metamorphosis under water keeps the new form submerged at 0 attack', () => {
    const s = blankState();
    // `grub` metamorphoses into `v2` (a 3/3 vanilla) after 1 turn — neither swims.
    const u = unit({
      owner: 0,
      cardId: 'v0',
      attack: 0,
      hp: 3,
      status: { drowning: true },
      keywords: { metamorphosis: { into: 'v2', everyTurns: 1 } },
    });
    u.predrownAttack = 1;
    u.turnsInPlay = 5;
    place(s, 0, 'water', u);

    const events: GameEvent[] = [];
    resolveEndOfTurn(s, 0, events, testRegistry);

    expect(u.cardId).toBe('v2');
    // Still in Water, still cannot swim -> still drowning, still 0 attack.
    expect(u.status.drowning).toBe(true);
    expect(u.attack).toBe(0);
    // The evolved form's attack is what it surfaces with, not the old form's.
    const evolved = testRegistry.cards.get('v2');
    expect(evolved && evolved.type === 'unit' ? evolved.attack : -1).toBe(u.predrownAttack);
  });
});
