/**
 * Two effect-layer guarantees added for Adventure's signature upgrades.
 *
 * 1. `debuff` must route its attack change through `addAttack`, like every other
 *    attack-writing path. It used to assign `unit.attack` directly, which silently did
 *    NOTHING to a drowning unit (live attack is pinned at 0, the real value lives in
 *    `predrownAttack`) — so the unit surfaced at full strength and any big attack debuff
 *    was simply ignored by anything standing in Water.
 * 2. `buff` can grant an on-hit package, mirroring a Foundation's `grants.onHit`, and —
 *    like that path — only when the target has no printed rider of its own.
 */
import { describe, expect, it } from 'vitest';
import { blankState, unit, place } from '@engine/testkit';
import { applyEffects } from '@engine/effects';
import { reconcileDrowning } from '@engine/drowning';
import type { GameEvent } from '@engine/events';
import type { Effect } from '@cards/schema';

const run = (s: ReturnType<typeof blankState>, effects: Effect[]): GameEvent[] => {
  const events: GameEvent[] = [];
  const err = applyEffects(s, 0, effects, [], undefined, events);
  expect(err).toBeNull();
  return events;
};

describe('debuff vs drowning', () => {
  it('reduces the SHADOW attack of a drowning unit, not the pinned live value', () => {
    const s = blankState();
    const u = unit({ owner: 1, attack: 9, hp: 6 });
    place(s, 1, 'water', u);
    reconcileDrowning(u, 'water');
    // Precondition: drowning parks the real attack and pins the live one at 0.
    expect(u.status.drowning).toBe(true);
    expect(u.attack).toBe(0);
    expect(u.predrownAttack).toBe(9);

    run(s, [{ kind: 'debuff', target: 'all-enemy', stat: { attack: 9 } }]);

    // The debuff must land on the shadow copy — it stays 0 while submerged either way,
    // so the direct-write bug was invisible until the unit surfaced.
    expect(u.attack).toBe(0);
    expect(u.predrownAttack).toBe(0);

    // Surfacing must NOT restore the attack the debuff was supposed to remove.
    reconcileDrowning(u, 'ground1');
    expect(u.status.drowning).toBeFalsy();
    expect(u.attack).toBe(0);
  });

  it('still debuffs a dry unit normally, and never below zero', () => {
    const s = blankState();
    const u = unit({ owner: 1, attack: 3, hp: 6 });
    place(s, 1, 'ground1', u);
    run(s, [{ kind: 'debuff', target: 'all-enemy', stat: { attack: 9 } }]);
    expect(u.attack).toBe(0);
  });
});

describe('buff granting an on-hit package', () => {
  it('grants on-hit to a unit that has none', () => {
    const s = blankState();
    const u = unit({ owner: 0, attack: 2, hp: 4 });
    place(s, 0, 'ground1', u);
    expect(u.onHit).toBeUndefined();

    run(s, [{ kind: 'buff', target: 'all-ally', onHit: { burn: 2 } }]);
    expect(u.onHit).toEqual({ burn: 2 });
  });

  it("never overwrites a unit's own printed rider", () => {
    const s = blankState();
    const u = unit({ owner: 0, attack: 2, hp: 4, onHit: { freeze: true } });
    place(s, 0, 'ground1', u);

    run(s, [{ kind: 'buff', target: 'all-ally', onHit: { burn: 2 } }]);
    expect(u.onHit).toEqual({ freeze: true });
  });

  it('copies the package rather than sharing it between targets', () => {
    const s = blankState();
    const a = unit({ owner: 0, attack: 1, hp: 3 });
    const b = unit({ owner: 0, attack: 1, hp: 3 });
    place(s, 0, 'ground1', a);
    place(s, 0, 'ground2', b);

    run(s, [{ kind: 'buff', target: 'all-ally', onHit: { burn: 2 } }]);
    expect(a.onHit).toEqual({ burn: 2 });
    expect(b.onHit).toEqual({ burn: 2 });
    // Mutating one must not reach the other, or a later status change would leak across units.
    a.onHit!.burn = 5;
    expect(b.onHit!.burn).toBe(2);
  });
});
