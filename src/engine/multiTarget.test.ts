/**
 * Spells that consume MORE THAN ONE target ref.
 *
 * `applyEffects` walks a cursor over `targets`, one ref per targeted effect. The UI always
 * dispatched exactly one, so a card with two targeted effects — Eksana's upgraded Swift
 * Kill duplicates its damage — read `undefined` for the second and failed the whole cast
 * with "requires a target", on a board full of legal ones.
 */
import { describe, expect, it } from 'vitest';
import { targetRefsNeeded } from '@engine/effects';
import { applyAction } from '@engine/engine';
import { blankState, place, unit } from '@engine/testkit';
import { buildRegistry } from '@cards/registry';
import { starterCards, starterLeaders } from '@cards/data/starter';
import type { Effect } from '@cards/schema';

describe('targetRefsNeeded', () => {
  it('counts one ref per targeted effect', () => {
    const dmg: Effect = { kind: 'damage', amount: 5, target: 'enemy' };
    expect(targetRefsNeeded([dmg])).toBe(1);
    expect(targetRefsNeeded([dmg, dmg])).toBe(2);
    expect(targetRefsNeeded([dmg, dmg, dmg])).toBe(3);
  });

  it('counts nothing for effects that resolve their own target', () => {
    // AOE fans out over a whole side, and `leaderUnit` finds the caster's avatar — neither
    // consumes a ref, so neither may be counted or the UI would ask for a phantom click.
    expect(targetRefsNeeded([{ kind: 'damage', amount: 1, target: 'all-enemy' }])).toBe(0);
    expect(targetRefsNeeded([{ kind: 'buff', target: 'all-ally', stat: { attack: 1 } }])).toBe(0);
    expect(targetRefsNeeded([{ kind: 'buff', target: 'leaderUnit', stat: { attack: 1 } }])).toBe(0);
    // Untargeted effects likewise.
    expect(targetRefsNeeded([{ kind: 'draw', amount: 1, target: 'self' }])).toBe(0);
  });

  it('counts a mixed list correctly', () => {
    expect(targetRefsNeeded([
      { kind: 'damage', amount: 5, target: 'enemy' },
      { kind: 'draw', amount: 1, target: 'self' },
      { kind: 'damage', amount: 5, target: 'enemy' },
      { kind: 'damage', amount: 1, target: 'all-enemy' },
    ])).toBe(2);
  });
});

describe('casting a two-target spell', () => {
  /** A spell whose damage is duplicated, exactly like the upgraded Swift Kill. */
  const twiceCard = {
    id: 'test-twice', name: 'Twice', element: 'fire' as const, tags: [], wip: false,
    type: 'spell' as const, cost: { energy: 0 },
    effects: [
      { kind: 'damage', amount: 5, target: 'enemy' },
      { kind: 'damage', amount: 5, target: 'enemy' },
    ] as Effect[],
  };

  // Seat the test card alongside the real content so the leader/deck plumbing is real.
  const registry = buildRegistry([...starterCards, twiceCard], starterLeaders);

  const setup = () => {
    const s = blankState();
    place(s, 1, 'ground1', unit({ owner: 1, attack: 1, hp: 9 }));
    place(s, 1, 'ground2', unit({ owner: 1, attack: 1, hp: 9 }));
    s.players[0].hand = [{ iid: 'h1', cardId: 'test-twice' }];
    s.players[0].energy = 5;
    return { s };
  };

  it('does NOTHING with only one target — the bug the UI was hitting', () => {
    // Worse than an error: the second effect finds no ref, the cast is abandoned, and
    // even the FIRST strike is rolled back. The player saw a spell that did nothing.
    const { s } = setup();
    const a = s.players[1].lanes.ground1.front!;
    const res = applyAction(registry, s, { type: 'playSpell', iid: 'h1', targets: [{ kind: 'unit', iid: a.iid }] });
    if ('error' in res) return; // an explicit refusal is also acceptable
    expect(res.state.players[1].lanes.ground1.front!.hp, 'no damage landed at all').toBe(9);
    expect(res.state.players[1].lanes.ground2.front!.hp).toBe(9);
  });

  it('resolves with TWO targets, hitting each independently', () => {
    const { s } = setup();
    const a = s.players[1].lanes.ground1.front!;
    const b = s.players[1].lanes.ground2.front!;
    const res = applyAction(registry, s, {
      type: 'playSpell', iid: 'h1',
      targets: [{ kind: 'unit', iid: a.iid }, { kind: 'unit', iid: b.iid }],
    });
    if ('error' in res) throw new Error(String(res.error));
    expect(res.state.players[1].lanes.ground1.front!.hp).toBe(4);
    expect(res.state.players[1].lanes.ground2.front!.hp).toBe(4);
  });

  it('allows both refs to name the SAME body', () => {
    // "Deal 5 to an enemy, twice" may legitimately be aimed twice at one target for 10;
    // refusing that would invent a rule the card does not state.
    const { s } = setup();
    const a = s.players[1].lanes.ground1.front!;
    const res = applyAction(registry, s, {
      type: 'playSpell', iid: 'h1',
      targets: [{ kind: 'unit', iid: a.iid }, { kind: 'unit', iid: a.iid }],
    });
    if ('error' in res) throw new Error(String(res.error));
    // 9 HP, hit for 5 twice — dead, so the slot is empty.
    expect(res.state.players[1].lanes.ground1.front).toBeUndefined();
  });
});
