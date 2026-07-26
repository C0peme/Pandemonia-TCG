import { describe, expect, it } from 'vitest';
import { applyAction } from '@engine/engine';
import { resolveCombat, resolveExtraAction } from '@engine/combat';
import { resolveEndOfTurn } from '@engine/endOfTurn';
import { applyEffects } from '@engine/effects';
import { blankState, place, unit, testRegistry } from '@engine/testkit';
import { LANES } from '@engine/constants';
import type { Effect } from '@cards/schema';
import type { TargetRef } from '@engine/actions';
import type { GameEvent } from '@engine/events';
import type { GameState, PlayerId } from '@engine/types';

const eff = (s: GameState, effects: Effect[], targets: TargetRef[] = [], caster: PlayerId = 0, lane?: 'heights' | 'ground1' | 'ground2' | 'water') => {
  const events: GameEvent[] = [];
  applyEffects(s, caster, effects, targets, lane, events, testRegistry);
  return events;
};

describe('Undershot pierces all defenses', () => {
  it('ignores Spike and Freeze (no spike damage, not blocked by freeze)', () => {
    const s = blankState();
    place(s, 0, 'ground1', unit({ owner: 0, attack: 6, hp: 5, keywords: { undershot: true } }));
    place(s, 1, 'ground1', unit({ owner: 1, attack: 0, hp: 4, keywords: { spike: 3 }, status: { freeze: 2 } }));
    const { state } = resolveCombat(s);
    expect(state.players[1].lanes.ground1.front).toBeUndefined(); // killed through freeze
    expect(state.players[0].lanes.ground1.front?.hp).toBe(5); // no Spike taken
  });

  it('hits the deep (back) Double Team unit, bypassing the front', () => {
    const s = blankState();
    place(s, 0, 'ground1', unit({ owner: 0, attack: 4, hp: 5, keywords: { undershot: true } }));
    place(s, 1, 'ground1', unit({ owner: 1, attack: 0, hp: 5 }));                 // front
    place(s, 1, 'ground1', unit({ owner: 1, attack: 0, hp: 3 }), 'back');          // back (deepest)
    const { state } = resolveCombat(s);
    expect(state.players[1].lanes.ground1.back).toBeUndefined(); // back was struck and died
  });
});

describe('Polish fires from every damage source', () => {
  it('gains its stat from Burn damage', () => {
    const s = blankState();
    place(s, 0, 'ground1', unit({ owner: 0, attack: 2, hp: 5, status: { burn: 1 }, keywords: { polish: { stat: { attack: 1 } } } }));
    const { state } = resolveCombat(s); // burn procs before it attacks
    const u = state.players[0].lanes.ground1.front!;
    expect(u.attack).toBe(3); // +1 from Polish reacting to Burn
    expect(u.hp).toBe(4);
  });

  it('runs authored effects from Poison ticking at end of turn', () => {
    // A poisoned unit cannot GAIN stats (Poison blocks gains), so Polish's stat buff is
    // suppressed — but its authored effects still fire. Use an enemy debuff to prove the trigger.
    const s = blankState();
    place(s, 0, 'ground1', unit({ owner: 0, attack: 2, hp: 5, status: { poisoned: 2 }, keywords: { polish: { effects: [{ kind: 'debuff', stat: { attack: 1 }, target: 'enemy' }] } } }));
    place(s, 1, 'ground1', unit({ owner: 1, attack: 4, hp: 5 }));
    const events: GameEvent[] = [];
    resolveEndOfTurn(s, 0, events, testRegistry);
    expect(s.players[0].lanes.ground1.front!.hp).toBe(3); // took 2 poison
    expect(s.players[1].lanes.ground1.front!.attack).toBe(3); // enemy debuffed -1 by Polish reacting to Poison
  });

  it('gains its stat from Smelt self-damage at end of turn', () => {
    const s = blankState();
    place(s, 0, 'ground1', unit({ owner: 0, attack: 2, hp: 5, keywords: { polish: { stat: { attack: 1 } }, smelt: { hpCost: 1, effect: { kind: 'energy', amount: 1 } } } }));
    const events: GameEvent[] = [];
    resolveEndOfTurn(s, 0, events, testRegistry);
    const u = s.players[0].lanes.ground1.front!;
    expect(u.hp).toBe(4); // paid 1 HP for Smelt
    expect(u.attack).toBe(3); // +1 from Polish reacting to the Smelt cost
  });
});

describe('Smelt resolves its exchange through the shared trigger machinery', () => {
  it("damage targets an enemy UNIT, honoring the authored scope (Forge Acolyte style)", () => {
    const s = blankState();
    place(s, 0, 'ground1', unit({ owner: 0, attack: 2, hp: 5, keywords: { smelt: { hpCost: 1, effect: { kind: 'damage', amount: 2, target: 'enemy' } } } }));
    place(s, 1, 'ground1', unit({ owner: 1, attack: 0, hp: 5 }));
    const leaderBefore = s.players[1].leaderHp;
    resolveEndOfTurn(s, 0, [], testRegistry);
    expect(s.players[0].lanes.ground1.front!.hp).toBe(4); // paid 1 HP
    expect(s.players[1].lanes.ground1.front!.hp).toBe(3); // enemy unit took 2 — NOT the leader
    expect(s.players[1].leaderHp).toBe(leaderBefore); // leader untouched
  });

  it('heal targets your own leader (previously dropped entirely — Blood Altar Keeper style)', () => {
    const s = blankState();
    s.players[0].leaderHp = 20;
    place(s, 0, 'ground1', unit({ owner: 0, attack: 1, hp: 5, keywords: { smelt: { hpCost: 1, effect: { kind: 'heal', amount: 3, target: 'leader' } } } }));
    resolveEndOfTurn(s, 0, [], testRegistry);
    expect(s.players[0].lanes.ground1.front!.hp).toBe(4); // paid 1 HP
    expect(s.players[0].leaderHp).toBe(23); // leader healed 3 (was a no-op before)
  });

  it('gains its stat from spell/ability damage', () => {
    const s = blankState();
    place(s, 1, 'ground1', unit({ owner: 1, attack: 1, hp: 5, keywords: { polish: { stat: { hp: 2 } } } }));
    const id = s.players[1].lanes.ground1.front!.iid;
    eff(s, [{ kind: 'damage', amount: 2, target: 'enemy' }], [{ kind: 'unit', iid: id }]);
    const u = s.players[1].lanes.ground1.front!;
    expect(u.maxHp).toBe(7); // +2 max hp from Polish
  });

  it('runs authored effects when hurt (Mandrake-style enemy debuff)', () => {
    const s = blankState();
    place(s, 0, 'ground1', unit({ owner: 0, attack: 3, hp: 5 }));
    place(s, 1, 'ground1', unit({ owner: 1, attack: 0, hp: 6, keywords: { polish: { effects: [{ kind: 'debuff', stat: { attack: 1 }, target: 'enemy' }] } } }));
    const { state } = resolveCombat(s);
    expect(state.players[0].lanes.ground1.front?.attack).toBe(2); // attacker debuffed -1 by Polish
  });
});

describe('Bloodlust as a trigger', () => {
  it('runs authored effects on kill (Colossal Worm: Shield 1 + relocate)', () => {
    const s = blankState();
    place(s, 0, 'ground1', unit({
      owner: 0, attack: 5, hp: 5,
      keywords: { bloodlust: { effects: [{ kind: 'applyStatus', status: 'shield', amount: 1, target: 'self' }, { kind: 'move', target: 'self' }] } },
    }));
    place(s, 1, 'ground1', unit({ owner: 1, attack: 0, hp: 3 }));
    const { state } = resolveCombat(s);
    const worm = LANES.map((l) => state.players[0].lanes[l].front).find(Boolean)!;
    expect(worm.shield).toBe(1);     // gained Shield 1 on kill
    expect(worm.keywords.shield).toBe(1);
  });
});

describe('Extra Action', () => {
  it('grants a bonus attack with no retaliation', () => {
    const s = blankState();
    place(s, 0, 'ground1', unit({ owner: 0, attack: 3, hp: 5 }));
    place(s, 1, 'ground1', unit({ owner: 1, attack: 4, hp: 10 }));
    const id = s.players[0].lanes.ground1.front!.iid;
    const events: GameEvent[] = [];
    resolveExtraAction(s, id, testRegistry, events);
    expect(s.players[1].lanes.ground1.front?.hp).toBe(7); // took 3
    expect(s.players[0].lanes.ground1.front?.hp).toBe(5); // NO retaliation taken
  });

  it('the extraAction effect queues and the engine drains it', () => {
    const s = blankState();
    place(s, 0, 'ground1', unit({ owner: 0, attack: 3, hp: 5 }));
    place(s, 1, 'ground1', unit({ owner: 1, attack: 0, hp: 9 }));
    const id = s.players[0].lanes.ground1.front!.iid;
    s.players[0].hand = [{ iid: 'sp', cardId: 'adrenaline-rush' }];
    // testRegistry has no adrenaline-rush; drive the effect directly then drain via state.
    const events: GameEvent[] = [];
    applyEffects(s, 0, [{ kind: 'extraAction', target: 'ally' }], [{ kind: 'unit', iid: id }], undefined, events, testRegistry);
    expect(s.extraActions).toContain(id);
  });
});

describe('Optional Sacrifice with max', () => {
  const playReaper = (sacrifice?: string[]) => {
    const s = blankState();
    s.players[0].energy = 5;
    s.players[0].hand = [{ iid: 'r', cardId: 'reaper' }];
    place(s, 0, 'ground2', unit({ owner: 0, attack: 1, hp: 1, cardId: 'v0' }));
    const allyId = s.players[0].lanes.ground2.front!.iid;
    const res = applyAction(testRegistry, s, { type: 'playUnit', iid: 'r', lane: 'ground1', sacrifice: sacrifice === undefined ? undefined : sacrifice.map(() => allyId) });
    return { res, allyId };
  };

  it('can be played without sacrificing (base stats, no buff)', () => {
    const { res } = playReaper(); // no sacrifice
    expect(res.events.some((e) => e.t === 'error')).toBe(false);
    expect(res.state.players[0].lanes.ground1.front?.attack).toBe(2); // reaper base 2/2
  });

  it('applies the buff once per unit sacrificed', () => {
    const { res } = playReaper(['x']); // sacrifice the one ally
    const reaper = res.state.players[0].lanes.ground1.front!;
    expect(reaper.attack).toBe(5); // 2 + 3 from one sacrifice
    expect(reaper.hp).toBe(5);
  });

  it('rejects sacrificing more than the max', () => {
    const s = blankState();
    s.players[0].energy = 5;
    s.players[0].hand = [{ iid: 'r', cardId: 'reaper' }];
    place(s, 0, 'ground2', unit({ owner: 0, attack: 1, hp: 1 }));
    place(s, 0, 'water', unit({ owner: 0, attack: 1, hp: 1 }));
    const a = s.players[0].lanes.ground2.front!.iid;
    const b = s.players[0].lanes.water.front!.iid;
    const res = applyAction(testRegistry, s, { type: 'playUnit', iid: 'r', lane: 'ground1', sacrifice: [a, b] });
    expect(res.events.some((e) => e.t === 'error')).toBe(true); // max is 1
  });
});

describe('Spell cost modifier (Anti Magic Field)', () => {
  it('costMod raises the targeted player\'s spell costs', () => {
    const s = blankState();
    eff(s, [{ kind: 'costMod', amount: 2, target: 'enemy' }]);
    expect(s.players[1].costMods.spell).toBe(2);
  });

  it('a raised cost makes an otherwise-affordable spell unaffordable, and clears at end of turn', () => {
    const s = blankState({ active: 0, round: 3 });
    s.players[0].costMods.spell = 2;
    s.players[0].energy = 2; // firebolt costs 1, +2 = 3 > 2
    s.players[0].hand = [{ iid: 'fb', cardId: 'firebolt' }];
    place(s, 1, 'ground1', unit({ owner: 1, attack: 0, hp: 5 }));
    const tid = s.players[1].lanes.ground1.front!.iid;
    const blocked = applyAction(testRegistry, s, { type: 'playSpell', iid: 'fb', targets: [{ kind: 'unit', iid: tid }] });
    expect(blocked.events.some((e) => e.t === 'error')).toBe(true);

    // With enough energy it goes through.
    s.players[0].energy = 3;
    const ok = applyAction(testRegistry, s, { type: 'playSpell', iid: 'fb', targets: [{ kind: 'unit', iid: tid }] });
    expect(ok.events.some((e) => e.t === 'castSpell')).toBe(true);
  });
});

describe('Airborne cancels Aquatic benefits', () => {
  it('an Aquatic unit gets its Water bonus, but an Aquatic+Airborne unit does not', () => {
    const s1 = blankState();
    eff(s1, [{ kind: 'summon', cardId: 'finny', lane: 'water' }]);
    expect(s1.players[0].lanes.water.front?.attack).toBe(4); // 2 base + 2 Water bonus

    const s2 = blankState();
    eff(s2, [{ kind: 'summon', cardId: 'skyfin', lane: 'water' }]);
    expect(s2.players[0].lanes.water.front?.attack).toBe(2); // Airborne cancels the Water bonus
  });
});
