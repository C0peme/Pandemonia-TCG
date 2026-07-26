import { describe, expect, it } from 'vitest';
import { refreshLaneEnvironment } from '@engine/environment';
import { applyAction, laneAllowed } from '@engine/engine';
import { beginTurn } from '@engine/turn';
import { RULES } from '@engine/constants';
import { blankState, place, unit, testRegistry } from '@engine/testkit';

/**
 * An Environment that grants Aquatic only means anything if the drowning state is
 * recomputed when grants change — merging the keyword alone would leave the unit
 * flagged drowning at 0 attack.
 */
describe('Environment-granted Aquatic vs Water drowning', () => {
  const drowningUnit = () => unit({ owner: 0, attack: 3, hp: 3, status: { drowning: true } });

  it('un-drowns a unit and restores its attack when the lane grants Aquatic', () => {
    const s = blankState();
    const u = drowningUnit();
    u.attack = 0;
    u.predrownAttack = 3;
    place(s, 0, 'water', u);
    s.environments.water = { iid: 'e1', cardId: 'shallow-field', owner: 0 };

    refreshLaneEnvironment(testRegistry, s, 'water');

    expect(u.keywords.aquatic).toBe(true);
    expect(u.status.drowning).toBeUndefined();
    expect(u.attack).toBe(3);
  });

  it('re-drowns the unit when the granting Environment goes away', () => {
    const s = blankState();
    const u = drowningUnit();
    u.attack = 0;
    u.predrownAttack = 3;
    place(s, 0, 'water', u);
    s.environments.water = { iid: 'e1', cardId: 'shallow-field', owner: 0 };
    refreshLaneEnvironment(testRegistry, s, 'water');
    expect(u.status.drowning).toBeUndefined();

    // Environment removed — the granted Aquatic is stripped, so it drowns again.
    delete s.environments.water;
    refreshLaneEnvironment(testRegistry, s, 'water');

    expect(u.keywords.aquatic).toBeUndefined();
    expect(u.status.drowning).toBe(true);
    expect(u.attack).toBe(0);
  });

  it('leaves a natural swimmer alone (its own Aquatic is never stripped)', () => {
    const s = blankState();
    const u = unit({ owner: 0, attack: 3, hp: 3, keywords: { aquatic: true } });
    place(s, 0, 'water', u);
    s.environments.water = { iid: 'e1', cardId: 'shallow-field', owner: 0 };
    refreshLaneEnvironment(testRegistry, s, 'water');
    delete s.environments.water;
    refreshLaneEnvironment(testRegistry, s, 'water');

    expect(u.keywords.aquatic).toBe(true);
    expect(u.status.drowning).toBeUndefined();
    expect(u.attack).toBe(3);
  });

  it('grants to BOTH players in the column — the lane is shared', () => {
    const s = blankState();
    const mine = drowningUnit();
    mine.attack = 0; mine.predrownAttack = 3;
    const theirs = unit({ owner: 1, attack: 2, hp: 2, status: { drowning: true } });
    theirs.attack = 0; theirs.predrownAttack = 2;
    place(s, 0, 'water', mine);
    place(s, 1, 'water', theirs);
    s.environments.water = { iid: 'e1', cardId: 'shallow-field', owner: 0 };

    refreshLaneEnvironment(testRegistry, s, 'water');

    expect(mine.status.drowning).toBeUndefined();
    expect(theirs.status.drowning).toBeUndefined();
    expect(theirs.attack).toBe(2);
  });

  it('is idempotent — repeated refreshes never double-restore attack', () => {
    const s = blankState();
    const u = drowningUnit();
    u.attack = 0; u.predrownAttack = 3;
    place(s, 0, 'water', u);
    s.environments.water = { iid: 'e1', cardId: 'shallow-field', owner: 0 };
    refreshLaneEnvironment(testRegistry, s, 'water');
    refreshLaneEnvironment(testRegistry, s, 'water');
    refreshLaneEnvironment(testRegistry, s, 'water');
    expect(u.attack).toBe(3);
    expect(u.status.drowning).toBeUndefined();
  });
});

/** The path a real player takes: play a non-swimmer into Water while Shallows is up. */
describe('playing into a Shallows lane', () => {
  it('does not drown a non-aquatic unit, and reports no drowning event', () => {
    const s = blankState();
    s.players[0].energy = 5;
    s.players[0].hand = [{ iid: 'h1', cardId: 'v1' }]; // Vanilla 1: no aquatic/airborne
    s.environments.water = { iid: 'e1', cardId: 'shallow-field', owner: 0 };

    const res = applyAction(testRegistry, s, { type: 'playUnit', iid: 'h1', lane: 'water' });
    expect(res.events.some((e) => e.t === 'error')).toBe(false);

    const placed = res.state.players[0].lanes.water.front!;
    expect(placed.status.drowning).toBeUndefined();
    expect(placed.attack).toBeGreaterThan(0);
    expect(res.events.some((e) => e.t === 'drowning')).toBe(false);
  });

  it('still drowns a non-aquatic unit when the Water lane is open', () => {
    const s = blankState();
    s.players[0].energy = 5;
    s.players[0].hand = [{ iid: 'h1', cardId: 'v1' }];

    const res = applyAction(testRegistry, s, { type: 'playUnit', iid: 'h1', lane: 'water' });
    const placed = res.state.players[0].lanes.water.front!;
    expect(placed.status.drowning).toBe(true);
    expect(placed.attack).toBe(0);
    expect(res.events.some((e) => e.t === 'drowning')).toBe(true);
  });
});

/**
 * Drowning is a clock, not a coffin: 0 attack, but it keeps taking damage each of its
 * owner's turns, so it works as a temporary body-block against Aquatic attackers.
 */
describe('drown tick at the start of the owner\'s turn', () => {
  const drowned = (hp: number) => {
    const u = unit({ owner: 0, attack: 3, hp, status: { drowning: true } });
    u.attack = 0;
    u.predrownAttack = 3;
    return u;
  };

  it('deals DROWN_DAMAGE to a drowning unit when its owner\'s turn begins', () => {
    const s = blankState();
    const u = drowned(3);
    place(s, 0, 'water', u);

    const res = beginTurn(s, 0, testRegistry);

    const after = res.state.players[0].lanes.water.front!;
    expect(after.hp).toBe(3 - RULES.DROWN_DAMAGE);
    expect(res.events.some((e) => e.t === 'drownTick' && e.iid === u.iid && e.amount === RULES.DROWN_DAMAGE)).toBe(true);
  });

  it('eventually drowns the unit for good, firing a destroy', () => {
    const s = blankState();
    place(s, 0, 'water', drowned(1)); // one tick from death

    const res = beginTurn(s, 0, testRegistry);

    expect(res.state.players[0].lanes.water.front).toBeUndefined();
    expect(res.events.some((e) => e.t === 'unitDestroyed')).toBe(true);
  });

  it('does not tick on the OPPONENT\'s turn — only the owner\'s', () => {
    const s = blankState();
    const u = drowned(3);
    place(s, 0, 'water', u);

    const res = beginTurn(s, 1, testRegistry); // player 1's turn begins

    expect(res.state.players[0].lanes.water.front!.hp).toBe(3);
    expect(res.events.some((e) => e.t === 'drownTick')).toBe(false);
  });

  it('spares a unit that is no longer drowning (e.g. Shallows granted Aquatic)', () => {
    const s = blankState();
    const u = drowned(3);
    place(s, 0, 'water', u);
    s.environments.water = { iid: 'e1', cardId: 'shallow-field', owner: 0 };
    refreshLaneEnvironment(testRegistry, s, 'water'); // un-drowns it

    const res = beginTurn(s, 0, testRegistry);

    expect(res.state.players[0].lanes.water.front!.hp).toBe(3);
    expect(res.events.some((e) => e.t === 'drownTick')).toBe(false);
  });

  it('leaves units in other lanes alone', () => {
    const s = blankState();
    place(s, 0, 'ground1', unit({ owner: 0, attack: 2, hp: 3 }));

    const res = beginTurn(s, 0, testRegistry);

    expect(res.state.players[0].lanes.ground1.front!.hp).toBe(3);
    expect(res.events.some((e) => e.t === 'drownTick')).toBe(false);
  });
});

describe('laneAllowed (the one lane rule)', () => {
  it('defaults an unrestricted Environment to Ground only', () => {
    expect(laneAllowed([], 'ground1')).toBe(true);
    expect(laneAllowed([], 'ground2')).toBe(true);
    expect(laneAllowed([], 'water')).toBe(false);
    expect(laneAllowed([], 'heights')).toBe(false);
  });

  it('honours explicit opt-ins', () => {
    expect(laneAllowed(['water'], 'water')).toBe(true);
    expect(laneAllowed(['water'], 'ground1')).toBe(false);
    expect(laneAllowed(['heights'], 'heights')).toBe(true);
    expect(laneAllowed(['ground'], 'ground2')).toBe(true);
    expect(laneAllowed(['ground'], 'water')).toBe(false);
  });

  it('the Shallows opts into Water and nowhere else', () => {
    const shallows = testRegistry.cards.get('shallow-field')!;
    if (shallows.type !== 'environment') throw new Error('expected environment');
    expect(laneAllowed(shallows.lanes, 'water')).toBe(true);
    expect(laneAllowed(shallows.lanes, 'ground1')).toBe(false);
    expect(laneAllowed(shallows.lanes, 'heights')).toBe(false);
  });
});
