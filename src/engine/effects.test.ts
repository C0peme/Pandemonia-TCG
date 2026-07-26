import { describe, expect, it } from 'vitest';
import { applyEffects } from '@engine/effects';
import { blankState, place, unit } from '@engine/testkit';
import type { GameEvent } from '@engine/events';
import type { GameState } from '@engine/types';

const apply = (
  s: GameState,
  effects: Parameters<typeof applyEffects>[2],
  targets: Parameters<typeof applyEffects>[3],
) => {
  const events: GameEvent[] = [];
  const error = applyEffects(s, 0, effects, targets, undefined, events);
  return { error, events };
};

describe('effect resolution', () => {
  it('damages a targeted enemy unit (ability damage)', () => {
    const s = blankState();
    place(s, 1, 'ground1', unit({ owner: 1, attack: 0, hp: 5 }));
    const target = s.players[1].lanes.ground1.front!;
    apply(s, [{ kind: 'damage', amount: 3, target: 'enemy' }], [{ kind: 'unit', iid: target.iid }]);
    expect(s.players[1].lanes.ground1.front?.hp).toBe(2);
  });

  it('damages a leader', () => {
    const s = blankState();
    apply(s, [{ kind: 'damage', amount: 4, target: 'enemy' }], [{ kind: 'leader', player: 1 }]);
    expect(s.players[1].leaderHp).toBe(26);
  });

  it('Immunity does NOT block ability damage', () => {
    const s = blankState();
    place(s, 1, 'ground1', unit({ owner: 1, attack: 0, hp: 5, keywords: { immunity: true } }));
    const target = s.players[1].lanes.ground1.front!;
    apply(s, [{ kind: 'damage', amount: 3, target: 'enemy' }], [{ kind: 'unit', iid: target.iid }]);
    expect(s.players[1].lanes.ground1.front?.hp).toBe(2);
  });

  it('Immunity blocks status effects, debuff and displacement', () => {
    const s = blankState();
    place(s, 1, 'ground1', unit({ owner: 1, attack: 2, hp: 5, keywords: { immunity: true } }));
    const target = s.players[1].lanes.ground1.front!;
    apply(s, [{ kind: 'applyStatus', target: 'enemy', status: 'freeze' }], [{ kind: 'unit', iid: target.iid }]);
    apply(s, [{ kind: 'debuff', stat: { attack: 1 }, target: 'enemy' }], [{ kind: 'unit', iid: target.iid }]);
    apply(s, [{ kind: 'expel', target: 'enemy' }], [{ kind: 'unit', iid: target.iid }]);
    const after = s.players[1].lanes.ground1.front;
    expect(after?.status.freeze).toBeFalsy();
    expect(after?.attack).toBe(2); // debuff blocked
    expect(after).toBeDefined(); // expel blocked
  });

  it('heals a unit but not past its max', () => {
    const s = blankState();
    place(s, 0, 'ground1', unit({ owner: 0, attack: 1, hp: 1 }));
    s.players[0].lanes.ground1.front!.maxHp = 5;
    s.players[0].lanes.ground1.front!.hp = 2;
    const target = s.players[0].lanes.ground1.front!;
    apply(s, [{ kind: 'heal', amount: 10, target: 'ally' }], [{ kind: 'unit', iid: target.iid }]);
    expect(s.players[0].lanes.ground1.front?.hp).toBe(5);
  });

  it('buffs and debuffs stats', () => {
    const s = blankState();
    place(s, 0, 'ground1', unit({ owner: 0, attack: 2, hp: 3 }));
    const id = s.players[0].lanes.ground1.front!.iid;
    apply(s, [{ kind: 'buff', stat: { attack: 2, hp: 2 }, target: 'ally' }], [{ kind: 'unit', iid: id }]);
    expect(s.players[0].lanes.ground1.front?.attack).toBe(4);
    expect(s.players[0].lanes.ground1.front?.maxHp).toBe(5);

    apply(s, [{ kind: 'debuff', stat: { attack: 1 }, target: 'ally' }], [{ kind: 'unit', iid: id }]);
    expect(s.players[0].lanes.ground1.front?.attack).toBe(3);
  });

  it('applies a status effect', () => {
    const s = blankState();
    place(s, 1, 'ground1', unit({ owner: 1, attack: 1, hp: 5 }));
    const id = s.players[1].lanes.ground1.front!.iid;
    apply(s, [{ kind: 'applyStatus', status: 'poison', target: 'enemy' }], [{ kind: 'unit', iid: id }]);
    expect(s.players[1].lanes.ground1.front?.status.poisoned).toBe(1); // default level
  });

  it('applies poison at a custom level via amount', () => {
    const s = blankState();
    place(s, 1, 'ground1', unit({ owner: 1, attack: 1, hp: 5 }));
    const id = s.players[1].lanes.ground1.front!.iid;
    apply(s, [{ kind: 'applyStatus', status: 'poison', amount: 3, target: 'enemy' }], [{ kind: 'unit', iid: id }]);
    expect(s.players[1].lanes.ground1.front?.status.poisoned).toBe(3);
  });

  it('a new status overwrites an existing one (poison over burn)', () => {
    const s = blankState();
    place(s, 1, 'ground1', unit({ owner: 1, attack: 1, hp: 5, status: { burn: 3 } }));
    const id = s.players[1].lanes.ground1.front!.iid;
    apply(s, [{ kind: 'applyStatus', status: 'poison', target: 'enemy' }], [{ kind: 'unit', iid: id }]);
    const u = s.players[1].lanes.ground1.front!;
    expect(u.status.poisoned).toBeGreaterThan(0);
    expect(u.status.burn).toBeUndefined(); // burn overwritten
  });

  it('Sleep and Freeze coexist; neither overwrites the other', () => {
    const s = blankState();
    place(s, 1, 'ground1', unit({ owner: 1, attack: 1, hp: 5, status: { freeze: 2 } }));
    const id = s.players[1].lanes.ground1.front!.iid;
    apply(s, [{ kind: 'applyStatus', status: 'sleep', amount: 1, target: 'enemy' }], [{ kind: 'unit', iid: id }]);
    const u = s.players[1].lanes.ground1.front!;
    expect(u.status.sleep).toBeGreaterThan(0);
    expect(u.status.freeze).toBe(2); // freeze preserved
  });

  it('a non-Sleep/Freeze status clears both Sleep and Freeze', () => {
    const s = blankState();
    place(s, 1, 'ground1', unit({ owner: 1, attack: 1, hp: 5, status: { sleep: 1, sleepHeal: 1, freeze: 2 } }));
    const id = s.players[1].lanes.ground1.front!.iid;
    apply(s, [{ kind: 'applyStatus', status: 'poison', target: 'enemy' }], [{ kind: 'unit', iid: id }]);
    const u = s.players[1].lanes.ground1.front!;
    expect(u.status.poisoned).toBeGreaterThan(0);
    expect(u.status.sleep).toBeUndefined();
    expect(u.status.freeze).toBeUndefined();
    expect(u.status.sleepHeal).toBeUndefined();
  });

  it('Poison blocks healing (a heal does nothing to a poisoned unit)', () => {
    const s = blankState();
    place(s, 0, 'ground1', unit({ owner: 0, attack: 1, hp: 5, status: { poisoned: 1 } }));
    const u0 = s.players[0].lanes.ground1.front!;
    u0.hp = 2; // damaged
    apply(s, [{ kind: 'heal', amount: 3, target: 'ally' }], [{ kind: 'unit', iid: u0.iid }]);
    expect(s.players[0].lanes.ground1.front!.hp).toBe(2); // poison blocked the heal
  });

  it('draws cards', () => {
    const s = blankState();
    s.players[0].deck = [
      { iid: 'd1', cardId: 'v0' },
      { iid: 'd2', cardId: 'v1' },
    ];
    apply(s, [{ kind: 'draw', amount: 2 }], []);
    expect(s.players[0].hand).toHaveLength(2);
    expect(s.players[0].deck).toHaveLength(0);
  });

  it('expels a unit back to its owner hand', () => {
    const s = blankState();
    place(s, 1, 'ground1', unit({ owner: 1, attack: 1, hp: 5, cardId: 'v3' }));
    const id = s.players[1].lanes.ground1.front!.iid;
    apply(s, [{ kind: 'expel', target: 'enemy' }], [{ kind: 'unit', iid: id }]);
    expect(s.players[1].lanes.ground1.front).toBeUndefined();
    expect(s.players[1].hand.some((c) => c.iid === id)).toBe(true);
  });

  it('rejects a wrong-side target via scope', () => {
    const s = blankState();
    place(s, 0, 'ground1', unit({ owner: 0, attack: 1, hp: 5 }));
    const id = s.players[0].lanes.ground1.front!.iid;
    const { error } = apply(s, [{ kind: 'damage', amount: 3, target: 'enemy' }], [
      { kind: 'unit', iid: id },
    ]);
    expect(error).toMatch(/enemy/);
  });

  it('kills a unit reduced to 0 and clears it', () => {
    const s = blankState();
    place(s, 1, 'ground1', unit({ owner: 1, attack: 1, hp: 2 }));
    const id = s.players[1].lanes.ground1.front!.iid;
    apply(s, [{ kind: 'damage', amount: 5, target: 'enemy' }], [{ kind: 'unit', iid: id }]);
    expect(s.players[1].lanes.ground1.front).toBeUndefined();
  });
});
