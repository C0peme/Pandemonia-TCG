import { describe, expect, it } from 'vitest';
import { applyAction } from '@engine/engine';
import { resolveCombat } from '@engine/combat';
import { resolveEndOfTurn } from '@engine/endOfTurn';
import { blankState, place, testRegistry, unit } from '@engine/testkit';

describe('Sacrifice (choose at play time)', () => {
  it('destroys the chosen unit and buffs the played card', () => {
    const s = blankState();
    s.players[0].energy = 2;
    s.players[0].hand = [{ iid: 'r', cardId: 'reaper' }];
    place(s, 0, 'ground2', unit({ owner: 0, attack: 1, hp: 1 }));
    const sacIid = s.players[0].lanes.ground2.front!.iid;

    const { state } = applyAction(testRegistry, s, {
      type: 'playUnit',
      iid: 'r',
      lane: 'ground1',
      sacrifice: [sacIid],
    });
    expect(state.players[0].lanes.ground2.front).toBeUndefined(); // sacrificed
    const reaper = state.players[0].lanes.ground1.front!;
    expect(reaper.attack).toBe(5); // 2 + 3
    expect(reaper.maxHp).toBe(5); // 2 + 3
  });

  it('rejects a sacrifice with the wrong count', () => {
    const s = blankState();
    s.players[0].energy = 2;
    s.players[0].hand = [{ iid: 'r', cardId: 'reaper' }];
    const { events } = applyAction(testRegistry, s, {
      type: 'playUnit',
      iid: 'r',
      lane: 'ground1',
      sacrifice: [],
    });
    // empty sacrifice list = play without the buff (allowed)
    expect(events.some((e) => e.t === 'error')).toBe(false);

    const s2 = blankState();
    s2.players[0].energy = 2;
    s2.players[0].hand = [{ iid: 'r', cardId: 'reaper' }];
    const bad = applyAction(testRegistry, s2, {
      type: 'playUnit',
      iid: 'r',
      lane: 'ground1',
      sacrifice: ['no-such-unit'],
    });
    expect(bad.events.some((e) => e.t === 'error')).toBe(true);
  });
});

describe('Metamorphosis (transform into another card)', () => {
  it('transforms after the set turns, carrying damage over', () => {
    const s = blankState();
    place(
      s,
      0,
      'ground1',
      unit({ owner: 0, cardId: 'larva', attack: 1, hp: 1, keywords: { metamorphosis: { everyTurns: 1, into: 'dragon' } } }),
    );
    s.players[0].lanes.ground1.front!.maxHp = 2; // 1 damage taken
    resolveEndOfTurn(s, 0, [], testRegistry);
    const evolved = s.players[0].lanes.ground1.front!;
    expect(evolved.cardId).toBe('dragon');
    expect(evolved.attack).toBe(5);
    expect(evolved.maxHp).toBe(5);
    expect(evolved.hp).toBe(4); // 5 - 1 carried-over damage
  });
});

describe('Polish (gain on damage)', () => {
  it('buffs the unit whenever it takes damage', () => {
    const s = blankState();
    place(s, 0, 'ground1', unit({ owner: 0, attack: 2, hp: 5 }));
    place(s, 1, 'ground1', unit({ owner: 1, attack: 0, hp: 5, keywords: { polish: { stat: { attack: 1 } } } }));
    const { state } = resolveCombat(s);
    const polished = state.players[1].lanes.ground1.front!;
    expect(polished.hp).toBe(3); // took 2
    expect(polished.attack).toBe(1); // gained +1 attack
  });

  it('does not trigger when damage is fully blocked', () => {
    const s = blankState();
    place(s, 0, 'ground1', unit({ owner: 0, attack: 2, hp: 5 }));
    place(s, 1, 'ground1', unit({ owner: 1, attack: 0, hp: 5, keywords: { polish: { stat: { attack: 1 } }, shield: 1 } }));
    const { state } = resolveCombat(s);
    expect(state.players[1].lanes.ground1.front?.attack).toBe(0); // blocked, no Polish
  });
});

describe('Healer (onPlay trigger)', () => {
  it('heals the leader when played', () => {
    const s = blankState();
    s.players[0].energy = 2;
    s.players[0].leaderHp = 20;
    s.players[0].hand = [{ iid: 'm', cardId: 'medic' }];
    const { state } = applyAction(testRegistry, s, { type: 'playUnit', iid: 'm', lane: 'ground1' });
    expect(state.players[0].leaderHp).toBe(22);
  });
});
