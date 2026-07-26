import { describe, expect, it } from 'vitest';
import { applyAction, legalActions } from '@engine/engine';
import { blankState, place, testRegistry, unit } from '@engine/testkit';
import type { GameState } from '@engine/types';

/** Convenience: give the active player some energy and a hand. */
const withHand = (energy: number, hand: { iid: string; cardId: string }[]): GameState => {
  const s = blankState();
  s.players[0].energy = energy;
  s.players[0].hand = hand;
  return s;
};

describe('playUnit', () => {
  it('places a unit, pays its cost, and removes it from hand', () => {
    const s = withHand(1, [{ iid: 'h1', cardId: 'v0' }]);
    const { state } = applyAction(testRegistry, s, { type: 'playUnit', iid: 'h1', lane: 'ground1' });
    expect(state.players[0].lanes.ground1.front?.cardId).toBe('v0');
    expect(state.players[0].hand).toHaveLength(0);
    expect(state.players[0].energy).toBe(0);
  });

  it('rejects a unit the player cannot afford', () => {
    const s = withHand(0, [{ iid: 'h1', cardId: 'v0' }]);
    const { state, events } = applyAction(testRegistry, s, {
      type: 'playUnit',
      iid: 'h1',
      lane: 'ground1',
    });
    expect(events[0]?.t).toBe('error');
    expect(state.players[0].lanes.ground1.front).toBeUndefined();
  });

  it('drowns a non-aquatic unit placed in Water', () => {
    const s = withHand(1, [{ iid: 'h1', cardId: 'v0' }]);
    const { state, events } = applyAction(testRegistry, s, {
      type: 'playUnit',
      iid: 'h1',
      lane: 'water',
    });
    const u = state.players[0].lanes.water.front;
    expect(u?.status.drowning).toBe(true);
    expect(u?.attack).toBe(0);
    expect(events.some((e) => e.t === 'drowning')).toBe(true);
  });

  it('does not drown an Aquatic unit in Water', () => {
    const s = withHand(1, [{ iid: 'h1', cardId: 'eel' }]);
    const { state } = applyAction(testRegistry, s, { type: 'playUnit', iid: 'h1', lane: 'water' });
    expect(state.players[0].lanes.water.front?.status.drowning).toBeUndefined();
    expect(state.players[0].lanes.water.front?.attack).toBe(2);
  });

  it('blocks a second unit in a lane without Double Team', () => {
    let s = withHand(2, [
      { iid: 'a', cardId: 'v0' },
      { iid: 'b', cardId: 'v0' },
    ]);
    s = applyAction(testRegistry, s, { type: 'playUnit', iid: 'a', lane: 'ground1' }).state;
    const second = applyAction(testRegistry, s, { type: 'playUnit', iid: 'b', lane: 'ground1' });
    expect(second.events[0]?.t).toBe('error');
  });

  it('allows a second unit when Double Team is present', () => {
    let s = withHand(4, [
      { iid: 'twins', cardId: 'twins' },
      { iid: 'v', cardId: 'v0' },
    ]);
    s = applyAction(testRegistry, s, { type: 'playUnit', iid: 'twins', lane: 'ground1' }).state;
    const second = applyAction(testRegistry, s, { type: 'playUnit', iid: 'v', lane: 'ground1' });
    expect(second.events.some((e) => e.t === 'error')).toBe(false);
    expect(second.state.players[0].lanes.ground1.back?.cardId).toBe('v0');
  });

  it('places in back by default with Double Team when front is occupied', () => {
    let s = withHand(4, [
      { iid: 'twins', cardId: 'twins' },
      { iid: 'v', cardId: 'v0' },
    ]);
    s = applyAction(testRegistry, s, { type: 'playUnit', iid: 'twins', lane: 'ground1' }).state;
    const r = applyAction(testRegistry, s, { type: 'playUnit', iid: 'v', lane: 'ground1' });
    const lane = r.state.players[0].lanes.ground1;
    expect(lane.front?.cardId).toBe('twins');
    expect(lane.back?.cardId).toBe('v0');
  });

  it('swaps front when position "front" is requested on a Double Team lane', () => {
    let s = withHand(4, [
      { iid: 'twins', cardId: 'twins' },
      { iid: 'v', cardId: 'v0' },
    ]);
    s = applyAction(testRegistry, s, { type: 'playUnit', iid: 'twins', lane: 'ground1' }).state;
    const r = applyAction(testRegistry, s, { type: 'playUnit', iid: 'v', lane: 'ground1', position: 'front' });
    const lane = r.state.players[0].lanes.ground1;
    // v0 pushed to front, original twins moved to back
    expect(lane.front?.cardId).toBe('v0');
    expect(lane.back?.cardId).toBe('twins');
  });

  it('pays an element cost from the bank', () => {
    const s = withHand(5, [{ iid: 'h1', cardId: 'titan' }]);
    s.players[0].bank.fire = 2;
    const ok = applyAction(testRegistry, s, { type: 'playUnit', iid: 'h1', lane: 'ground1' });
    expect(ok.state.players[0].lanes.ground1.front?.cardId).toBe('titan');
    expect(ok.state.players[0].bank.fire).toBe(0);

    const s2 = withHand(5, [{ iid: 'h1', cardId: 'titan' }]);
    s2.players[0].bank.fire = 1; // not enough banked fire
    const bad = applyAction(testRegistry, s2, { type: 'playUnit', iid: 'h1', lane: 'ground1' });
    expect(bad.events[0]?.t).toBe('error');
  });
});

describe('onPlay effects', () => {
  it('lane-aware freeze: freezes the same-lane enemy only, not units in other lanes', () => {
    const s = withHand(2, [{ iid: 'h1', cardId: 'icebreaker' }]);
    s.players[1].lanes.ground1.front = { iid: 'e1', cardId: 'v0', owner: 1, attack: 1, hp: 2, maxHp: 2, keywords: {}, status: {}, turnsInPlay: 0, justPlaced: false };
    s.players[1].lanes.ground2.front = { iid: 'e2', cardId: 'v0', owner: 1, attack: 1, hp: 2, maxHp: 2, keywords: {}, status: {}, turnsInPlay: 0, justPlaced: false };
    const { state } = applyAction(testRegistry, s, { type: 'playUnit', iid: 'h1', lane: 'ground1' });
    expect(state.players[1].lanes.ground1.front!.status.freeze).toBeGreaterThan(0); // same lane — frozen
    expect(state.players[1].lanes.ground2.front!.status.freeze).toBeUndefined();    // other lane — untouched
  });

  it('self sleep: puts the played unit to sleep', () => {
    const s = withHand(2, [{ iid: 'h1', cardId: 'sleeper' }]);
    const { state } = applyAction(testRegistry, s, { type: 'playUnit', iid: 'h1', lane: 'ground1' });
    expect(state.players[0].lanes.ground1.front!.status.sleep).toBeGreaterThan(0);
    expect(state.players[0].lanes.ground1.front!.status.sleepHeal).toBe(1);
  });

  it('any-target damage: auto-hits weakest enemy unit on entry', () => {
    const s = withHand(2, [{ iid: 'h1', cardId: 'sniper-entry' }]);
    s.players[1].lanes.ground1.front = { iid: 'e1', cardId: 'v0', owner: 1, attack: 1, hp: 3, maxHp: 3, keywords: {}, status: {}, turnsInPlay: 0, justPlaced: false };
    const { state } = applyAction(testRegistry, s, { type: 'playUnit', iid: 'h1', lane: 'ground1' });
    expect(state.players[1].lanes.ground1.front!.hp).toBe(1); // 3 − 2 = 1
  });

  it('any-target damage does nothing when no enemy units exist (no leader fallback)', () => {
    const s = withHand(2, [{ iid: 'h1', cardId: 'sniper-entry' }]);
    const { state } = applyAction(testRegistry, s, { type: 'playUnit', iid: 'h1', lane: 'ground1' });
    expect(state.players[1].leaderHp).toBe(30); // no targets — effect is skipped
  });
});

describe('endTurn', () => {
  it('passes the turn and draws for the next player', () => {
    const s = blankState();
    s.players[1].deck = [{ iid: 'd1', cardId: 'v0' }];
    const { state } = applyAction(testRegistry, s, { type: 'endTurn' });
    expect(state.active).toBe(1);
    expect(state.players[1].energy).toBe(1);
    expect(state.players[1].hand).toHaveLength(1); // drew d1
    expect(state.turn).toBe(1);
  });

  it('does not let the first player attack on round 1', () => {
    const s = blankState(); // active 0, first 0, round 1
    s.players[1].leaderHp = 30;
    // A would-be attacker in an empty lane; combat is skipped this turn.
    s.players[0].lanes.ground1.front = {
      iid: 'x',
      cardId: 'v0',
      owner: 0,
      attack: 5,
      hp: 5,
      maxHp: 5,
      keywords: {},
      status: {},
      turnsInPlay: 0,
      justPlaced: false,
    };
    const { state } = applyAction(testRegistry, s, { type: 'endTurn' });
    expect(state.players[1].leaderHp).toBe(30); // untouched
  });

  it('increments the round when the turn returns to the first player', () => {
    const s = blankState({ active: 1, first: 0, round: 1 });
    const { state } = applyAction(testRegistry, s, { type: 'endTurn' });
    expect(state.active).toBe(0);
    expect(state.round).toBe(2);
    expect(state.players[0].energy).toBe(2);
  });

  it('banks leftover energy on end of turn', () => {
    const s = blankState(); // first player, round 1 -> no combat
    s.players[0].energy = 3;
    const { state } = applyAction(testRegistry, s, { type: 'endTurn', bank: { fire: 2 } });
    expect(state.players[0].bank.fire).toBe(2);
  });

  it('a Sleep applied to a unit costs it its NEXT attack, not zero turns', () => {
    // P1 has a slept attacker facing P0's leader. End-of-turn effects must resolve at the
    // END of P1's turn (after Declare Attack), so the unit is still asleep when it would act.
    const s = blankState({ active: 0, round: 2 });
    place(s, 1, 'ground1', unit({ owner: 1, attack: 5, hp: 5, status: { sleep: 1 } }));

    // P0 ends its turn → hand off to P1. The sleep must NOT tick away at P1's turn start.
    const afterP0 = applyAction(testRegistry, s, { type: 'endTurn' }).state;
    expect(afterP0.players[1].lanes.ground1.front!.status.sleep).toBe(1); // still asleep

    // P1 ends its turn → its slept unit cannot Declare Attack, so P0's leader is untouched.
    const afterP1 = applyAction(testRegistry, afterP0, { type: 'endTurn' }).state;
    expect(afterP1.players[0].leaderHp).toBe(30); // attack missed
    expect(afterP1.players[1].lanes.ground1.front!.status.sleep).toBe(0); // ticked at P1's end-of-turn
  });
});

describe('legalActions', () => {
  it('always offers endTurn and lists affordable unit plays', () => {
    const s = withHand(1, [{ iid: 'h1', cardId: 'v0' }]);
    const actions = legalActions(testRegistry, s);
    expect(actions.some((a) => a.type === 'endTurn')).toBe(true);
    expect(actions.filter((a) => a.type === 'playUnit').length).toBeGreaterThan(0);
  });
});

describe('endTurn banking + Producer', () => {
  it('clamps banking instead of erroring when a Producer fills the element to its cap', () => {
    // Regression: a Producer banks during resolveEndOfTurn, which runs BEFORE banking. If the
    // banking choice plus the producer output exceeded the cap, endTurn used to ERROR — which
    // left the turn un-ended and made the AI driver re-loop combat forever.
    const s = blankState();
    s.players[0].energy = 2;
    s.players[0].bank.fire = 1; // fire cap is 2 (default 2/2/2/2) → one slot left
    place(s, 0, 'ground1', unit({ owner: 0, cardId: 'kiln', attack: 0, hp: 3, keywords: { producer: { amount: 1, element: 'fire' } } }));

    // Round-1 first player → combat is skipped, but resolveEndOfTurn still fires the Producer
    // (fire 1 → 2, the cap), then banking {fire:1} would overflow. It must clamp, not error.
    const { state, events } = applyAction(testRegistry, s, { type: 'endTurn', bank: { fire: 1 } });
    expect(events.some((e) => e.t === 'error')).toBe(false);
    expect(state.active).toBe(1); // the turn actually handed off
    expect(state.players[0].bank.fire).toBe(2); // producer filled to cap; the banking added nothing
  });
});
