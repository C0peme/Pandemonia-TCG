import { describe, expect, it } from 'vitest';
import { applyAction } from '@engine/engine';
import { resolveCombat } from '@engine/combat';
import { resolveEndOfTurn } from '@engine/endOfTurn';
import { applyEffects } from '@engine/effects';
import { beginTurn } from '@engine/turn';
import { LANES, RULES } from '@engine/constants';
import { NULL_CARD_ID } from '@cards/special';
import { blankState, place, testRegistry, unit, foundationUnit } from '@engine/testkit';

const nullUnit = (owner: 0 | 1) =>
  unit({
    owner,
    cardId: NULL_CARD_ID,
    attack: 4,
    hp: 4,
    keywords: { airborne: true, taunt: true, mover: { scope: 'self', trigger: 'endOfTurn' }, kamikaze: { kind: 'damage', amount: 4, target: 'ally' } },
  });

describe('deck-out / Null', () => {
  it('draws a Null card when the deck is empty', () => {
    const s = blankState();
    s.players[0].deck = [];
    const { state, events } = beginTurn(s, 0);
    expect(state.players[0].hand.some((c) => c.cardId === NULL_CARD_ID)).toBe(true);
    expect(events.some((e) => e.t === 'drawNull')).toBe(true);
  });

  it('Null deals 4 to its OWN leader when destroyed (Kamikaze)', () => {
    const s = blankState({ active: 1 });
    place(s, 0, 'ground1', nullUnit(0));
    place(s, 1, 'ground1', unit({ owner: 1, attack: 4, hp: 10 }));
    const { state } = resolveCombat(s);
    expect(state.players[0].lanes.ground1.front).toBeUndefined();
    expect(state.players[0].leaderHp).toBe(RULES.LEADER_HP - 4);
  });

  it('Null wanders to another lane at end of turn (self-Mover)', () => {
    const s = blankState();
    place(s, 0, 'ground1', nullUnit(0));
    resolveEndOfTurn(s, 0, []);
    expect(s.players[0].lanes.ground1.front).toBeUndefined();
    const elsewhere = LANES.filter((l) => l !== 'ground1').some((l) => s.players[0].lanes[l].front);
    expect(elsewhere).toBe(true);
  });
});

describe('Foundation', () => {
  /**
   * Foundations are placed FIRST in an empty lane (standalone), then a unit is placed
   * on top — which auto-bonds the Foundation and receives its stat/keyword grants.
   */

  // Helper: state with a standalone Foundation placed in ground1 (no unit yet).
  const withStandaloneFoundation = () => {
    const s = blankState();
    s.players[0].energy = 10;
    s.players[0].hand = [{ iid: 'f1', cardId: 'footing' }];
    return applyAction(testRegistry, s, { type: 'playFoundation', iid: 'f1', lane: 'ground1' }).state;
  };

  // Helper: state with a unit already bonded to a Foundation (direct state mutation).
  const withBondedFoundation = (unitHp = 5, unitAtk = 0) => {
    const s = blankState();
    const u = unit({ owner: 0, attack: unitAtk, hp: unitHp + 3 });
    u.maxHp = unitHp + 3;
    u.keywords.tough = 1;
    u.foundation = { iid: 'f1', cardId: 'footing', hp: 3, appliedStat: { attack: 0, hp: 3 }, appliedKeywordKeys: ['tough'] };
    place(s, 0, 'ground1', u);
    return s;
  };

  it('can be placed standalone in an empty lane (no unit required)', () => {
    const s = blankState();
    s.players[0].energy = 10;
    s.players[0].hand = [{ iid: 'f1', cardId: 'footing' }];
    const { state, events } = applyAction(testRegistry, s, { type: 'playFoundation', iid: 'f1', lane: 'ground1' });
    expect(state.players[0].lanes.ground1.standaloneFoundation?.cardId).toBe('footing');
    expect(state.players[0].lanes.ground1.front).toBeUndefined();
    expect(events.some((e) => e.t === 'foundationPlaced')).toBe(true);
  });

  it('errors when placed in a lane that already has a unit', () => {
    const s = blankState();
    s.players[0].energy = 10;
    s.players[0].hand = [{ iid: 'f1', cardId: 'footing' }];
    place(s, 0, 'ground1', unit({ owner: 0, attack: 1, hp: 5 }));
    const { events } = applyAction(testRegistry, s, { type: 'playFoundation', iid: 'f1', lane: 'ground1' });
    expect(events.some((e) => e.t === 'error')).toBe(true);
  });

  it('auto-bonds with a unit placed on top and grants its stats and keywords', () => {
    const s2 = withStandaloneFoundation();
    s2.players[0].hand = [{ iid: 'u1', cardId: 'v0' }];
    const { state, events } = applyAction(testRegistry, s2, { type: 'playUnit', iid: 'u1', lane: 'ground1' });
    const host = state.players[0].lanes.ground1.front!;
    // v0 has base hp=1; Footing is 0/3 so the universal half-stat rule grants +0/+1 → maxHp 2
    expect(host.maxHp).toBe(2);
    expect(host.keywords.tough).toBe(1);
    expect(host.foundation?.cardId).toBe('footing');
    expect(state.players[0].lanes.ground1.standaloneFoundation).toBeUndefined();
    expect(events.some((e) => e.t === 'foundationBonded')).toBe(true);
  });

  it('a unit bonding onto a pre-placed Foundation deploys ready to fight (free Battle Ready)', () => {
    const s2 = withStandaloneFoundation();
    s2.players[0].lanes.ground1.standaloneFoundation!.justPlaced = false; // ground set a prior turn
    s2.players[0].hand = [{ iid: 'u1', cardId: 'v0' }];
    const { state } = applyAction(testRegistry, s2, { type: 'playUnit', iid: 'u1', lane: 'ground1' });
    expect(state.players[0].lanes.ground1.front!.justPlaced).toBe(false); // can act this turn
  });

  it('a same-turn Foundation+unit drop does NOT skip summoning sickness', () => {
    const s2 = withStandaloneFoundation(); // foundation placed this turn → justPlaced true
    s2.players[0].hand = [{ iid: 'u1', cardId: 'v0' }];
    const { state } = applyAction(testRegistry, s2, { type: 'playUnit', iid: 'u1', lane: 'ground1' });
    expect(state.players[0].lanes.ground1.front!.justPlaced).toBe(true); // still summoning-sick
  });

  it('Pierce destroys the Foundation and the host loses the grant', () => {
    const s = withBondedFoundation(5);
    // Attacker with Pierce 3 hits the Foundation (hp 3) first — bypasses Tough.
    place(s, 1, 'ground1', unit({ owner: 1, attack: 3, hp: 5, keywords: { pierce: true } }));
    s.active = 1;
    const { state } = resolveCombat(s);
    const host = state.players[0].lanes.ground1.front!;
    expect(host.foundation).toBeUndefined();
    expect(host.keywords.tough).toBeUndefined();
    expect(host.maxHp).toBe(5); // grant reverted
  });

  // --- Standalone Foundations are full units: status, heal, buff, and movement all apply. ---

  it('a standalone Foundation can be poisoned, and the poison ticks each turn end', () => {
    const s = blankState();
    const sf = foundationUnit({ owner: 0, cardId: 'footing', hp: 5 });
    place(s, 0, 'ground1', sf, 'foundation');
    applyEffects(s, 0, [{ kind: 'applyStatus', target: 'any', status: 'poison' }], [{ kind: 'unit', iid: sf.iid }], undefined, [], testRegistry);
    expect(s.players[0].lanes.ground1.standaloneFoundation!.status.poisoned).toBeGreaterThan(0);
    resolveEndOfTurn(s, 0, [], testRegistry);
    expect(s.players[0].lanes.ground1.standaloneFoundation!.hp).toBeLessThan(5); // poison bit it
  });

  it('a standalone Foundation can be healed by a spell', () => {
    const s = blankState();
    const sf = foundationUnit({ owner: 0, cardId: 'footing', hp: 5 });
    sf.hp = 2;
    place(s, 0, 'ground1', sf, 'foundation');
    applyEffects(s, 0, [{ kind: 'heal', amount: 3, target: 'any' }], [{ kind: 'unit', iid: sf.iid }], undefined, [], testRegistry);
    expect(s.players[0].lanes.ground1.standaloneFoundation!.hp).toBe(5); // 2 + 3, capped at maxHp
  });

  it('a standalone Foundation can be buffed by a spell', () => {
    const s = blankState();
    const sf = foundationUnit({ owner: 0, cardId: 'footing', attack: 1, hp: 5 });
    place(s, 0, 'ground1', sf, 'foundation');
    applyEffects(s, 0, [{ kind: 'buff', stat: { attack: 2 }, target: 'any' }], [{ kind: 'unit', iid: sf.iid }], undefined, [], testRegistry);
    expect(s.players[0].lanes.ground1.standaloneFoundation!.attack).toBe(3);
  });

  it('a standalone Foundation can be relocated, staying in the Foundation slot', () => {
    const s = blankState();
    const sf = foundationUnit({ owner: 0, cardId: 'footing', hp: 5 });
    place(s, 0, 'ground1', sf, 'foundation');
    const moved = applyAction(testRegistry, s, { type: 'moveUnit', targetIid: sf.iid, toLane: 'ground2' }).state;
    expect(moved.players[0].lanes.ground1.standaloneFoundation).toBeUndefined();
    expect(moved.players[0].lanes.ground2.standaloneFoundation?.iid).toBe(sf.iid);
  });

  it('a spell can destroy a standalone Foundation (cleared via processDeaths)', () => {
    const s = blankState();
    const sf = foundationUnit({ owner: 1, cardId: 'footing', hp: 3 });
    place(s, 1, 'ground1', sf, 'foundation');
    const events: import('@engine/events').GameEvent[] = [];
    applyEffects(s, 0, [{ kind: 'damage', amount: 9, target: 'any' }], [{ kind: 'unit', iid: sf.iid }], undefined, events, testRegistry);
    expect(s.players[1].lanes.ground1.standaloneFoundation).toBeUndefined();
    expect(events.some((e) => e.t === 'foundationDestroyed')).toBe(true);
  });

  it('counts as two kills for Bloodlust when the stack is destroyed', () => {
    const s = withBondedFoundation(5);
    // Host is 8 HP with Tough 1. A 10-attack Bloodlust unit does 10−1=9 ≥ 8 → kills it.
    place(
      s,
      1,
      'ground1',
      unit({ owner: 1, attack: 10, hp: 12, keywords: { bloodlust: { buff: { attack: 1 } } } }),
    );
    s.active = 1;
    const { state } = resolveCombat(s);
    const killer = state.players[1].lanes.ground1.front!;
    expect(killer.attack).toBe(12); // 10 + 1 + 1 (two kills for Bloodlust)
  });
});

describe('Environment', () => {
  it('activates each combat, applying its status to units in the lane (not once on entry)', () => {
    const s = blankState();
    s.players[0].energy = 4;
    s.players[0].hand = [
      { iid: 'env', cardId: 'scorched-field' },
      { iid: 'u', cardId: 'v0' },
    ];
    let state = applyAction(testRegistry, s, { type: 'playEnvironment', iid: 'env', lane: 'ground1' }).state;
    state = applyAction(testRegistry, state, { type: 'playUnit', iid: 'u', lane: 'ground1' }).state;
    expect(state.players[0].lanes.ground1.front?.status.burn).toBeUndefined(); // not applied on entry
    const { state: after } = resolveCombat(state, undefined, testRegistry);
    // The Environment activates the lane during combat and applies Burn 1 to the unit.
    expect(after.players[0].lanes.ground1.front?.status.burn).toBe(1);
  });

  it('grants its keywords to BOTH players\' units in its lane at combat time', () => {
    // A shared lane Environment applies to both sides; grants land during combat
    // (not at placement / start of turn).
    const s = blankState();
    s.round = 2; // first player may attack from round 2 on
    place(s, 0, 'ground1', unit({ owner: 0, cardId: 'v0' }));
    place(s, 1, 'ground1', unit({ owner: 1, cardId: 'v0' }));
    s.environments.ground1 = { iid: 'env', cardId: 'overshot-field', owner: 0 };
    // Before combat the grant is not yet applied.
    expect(s.players[0].lanes.ground1.front?.keywords.overshot).toBeUndefined();
    const { state } = resolveCombat(s, undefined, testRegistry);
    expect(state.players[0].lanes.ground1.front?.keywords.overshot).toBe(true);
    expect(state.players[1].lanes.ground1.front?.keywords.overshot).toBe(true);
  });

  it('does not grant keywords to units in lanes without that environment', () => {
    const s = blankState();
    s.round = 2;
    place(s, 0, 'ground1', unit({ owner: 0, cardId: 'v0' }));
    place(s, 0, 'ground2', unit({ owner: 0, cardId: 'v0' }));
    s.environments.ground1 = { iid: 'env', cardId: 'overshot-field', owner: 0 };
    const { state } = resolveCombat(s, undefined, testRegistry);
    expect(state.players[0].lanes.ground2.front?.keywords.overshot).toBeUndefined();
  });

  it('a unit loses an Environment-granted keyword when it moves out of that lane', () => {
    const s = blankState();
    place(s, 0, 'ground2', unit({ owner: 0, cardId: 'v0' }));
    s.environments.ground1 = { iid: 'env', cardId: 'overshot-field', owner: 0 };
    const iid = s.players[0].lanes.ground2.front!.iid;
    // Moving INTO the environment lane applies the grant…
    const inEnv = applyAction(testRegistry, s, { type: 'moveUnit', targetIid: iid, toLane: 'ground1' }).state;
    expect(inEnv.players[0].lanes.ground1.front?.keywords.overshot).toBe(true);
    // …and moving back OUT strips it again.
    const outEnv = applyAction(testRegistry, inEnv, { type: 'moveUnit', targetIid: iid, toLane: 'ground2' }).state;
    expect(outEnv.players[0].lanes.ground2.front?.keywords.overshot).toBeUndefined();
  });
});

describe('Burn (combat-time)', () => {
  it('procs on the attacker right before it attacks', () => {
    const s = blankState();
    s.round = 2;
    // Attacker is burned; defender is an empty lane so it strikes the leader.
    place(s, 0, 'ground1', unit({ owner: 0, attack: 2, hp: 5, status: { burn: 2 } }));
    const { state, events } = resolveCombat(s);
    expect(state.players[0].lanes.ground1.front?.hp).toBe(3); // 5 - 2 burn
    expect(events.some((e) => e.t === 'burnTick')).toBe(true);
    expect(state.players[1].leaderHp).toBe(28); // attack still landed (2)
  });

  it('a unit that burns to death never attacks', () => {
    const s = blankState();
    s.round = 2;
    place(s, 0, 'ground1', unit({ owner: 0, attack: 3, hp: 2, status: { burn: 3 } }));
    const before = s.players[1].leaderHp;
    const { state } = resolveCombat(s);
    expect(state.players[0].lanes.ground1.front).toBeUndefined(); // died to burn
    expect(state.players[1].leaderHp).toBe(before); // no damage dealt
  });

  it('a Burn-on-hit attacker applies Burn that bites on the NEXT combat, not this one', () => {
    const s = blankState();
    s.round = 2;
    // P0 attacker inflicts Burn 2 on hit. The Burn is applied during the strike, AFTER the
    // lane's Burn already resolved, so it does not proc this combat — only next time.
    place(s, 0, 'ground1', unit({ owner: 0, attack: 1, hp: 10, onHit: { burn: 2 } }));
    place(s, 1, 'ground1', unit({ owner: 1, attack: 3, hp: 6 }));
    const { state } = resolveCombat(s);
    const defender = state.players[1].lanes.ground1.front!;
    expect(defender.hp).toBe(5); // 1 attack damage only (the fresh Burn has not procced yet)
    expect(defender.status.burn).toBe(2); // Burn applied, waiting for the next combat
    expect(state.players[0].lanes.ground1.front?.hp).toBe(7); // took the 3 retaliation
  });

  it('a burn-killed defender cannot retaliate (it burns before being struck)', () => {
    const s = blankState();
    s.round = 2;
    // Attacker (P0) hits the burned defender (P1) in the same lane.
    place(s, 0, 'ground1', unit({ owner: 0, attack: 1, hp: 10 }));
    place(s, 1, 'ground1', unit({ owner: 1, attack: 4, hp: 5, status: { burn: 5 } }));
    const { state } = resolveCombat(s);
    // Defender takes 5 burn (→0) before it can retaliate, so the attacker is untouched.
    expect(state.players[1].lanes.ground1.front).toBeUndefined();
    expect(state.players[0].lanes.ground1.front?.hp).toBe(10);
  });

  it('a 1-HP burned defender dies to Burn first, so the attacker hits the leader unimpeded', () => {
    const s = blankState();
    s.round = 2;
    // The classic scenario: a Burn 1 / 1-HP enemy should die to Burn before our unit strikes,
    // so the strike carries through to the leader and takes no retaliation.
    place(s, 0, 'ground1', unit({ owner: 0, attack: 2, hp: 5 }));
    place(s, 1, 'ground1', unit({ owner: 1, attack: 3, hp: 1, status: { burn: 1 } }));
    const before = s.players[1].leaderHp;
    const { state } = resolveCombat(s);
    expect(state.players[1].lanes.ground1.front).toBeUndefined(); // burned to death before the strike
    expect(state.players[0].lanes.ground1.front?.hp).toBe(5); // no retaliation taken
    expect(state.players[1].leaderHp).toBe(before - 2); // the attacker hit the leader instead
  });
});
