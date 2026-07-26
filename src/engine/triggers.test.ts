import { describe, expect, it } from 'vitest';
import { applyAction } from '@engine/engine';
import { resolveCombat } from '@engine/combat';
import { resolveEndOfTurn, resolveStartOfTurn } from '@engine/endOfTurn';
import { blankState, place, testRegistry, unit } from '@engine/testkit';

describe('triggered effects (At entry / Before attacking / At end / At start of turn)', () => {
  it('"At end of turn" heal targets the owner leader (beneficial polarity)', () => {
    const s = blankState();
    s.players[0].leaderHp = 20;
    const u = unit({ owner: 0, attack: 1, hp: 3 });
    u.endOfTurn = [{ kind: 'heal', amount: 2, target: 'leader' }];
    place(s, 0, 'ground1', u);
    resolveEndOfTurn(s, 0, []);
    expect(s.players[0].leaderHp).toBe(22); // healed own leader, not the enemy
  });

  it('"At start of turn" energy with an element banks that element (Producer)', () => {
    const s = blankState();
    const u = unit({ owner: 0, attack: 1, hp: 3 });
    u.startOfTurn = [{ kind: 'energy', amount: 1, element: 'fire' }];
    place(s, 0, 'ground1', u);
    resolveStartOfTurn(s, 0, []);
    expect(s.players[0].bank.fire).toBe(1);
  });

  it('"Before attacking" effects fire ahead of the strike', () => {
    const s = blankState({ active: 0, round: 2 });
    const attacker = unit({ owner: 0, attack: 2, hp: 3 });
    attacker.onAttack = [{ kind: 'damage', amount: 2, target: 'any' }];
    place(s, 0, 'ground1', attacker);
    place(s, 1, 'ground1', unit({ owner: 1, attack: 0, hp: 5 }));
    const { state } = resolveCombat(s);
    // 2 from the onAttack effect + 2 from the attack itself = 4 → 5 HP becomes 1.
    expect(state.players[1].lanes.ground1.front?.hp).toBe(1);
  });

  it('an on-play move queues an interactive choice instead of auto-targeting', () => {
    const s = blankState();
    s.players[0].energy = 2;
    s.players[0].hand = [{ iid: 'sh', cardId: 'shover' }];
    place(s, 1, 'ground1', unit({ owner: 1, attack: 1, hp: 2 }));
    const enemyIid = s.players[1].lanes.ground1.front!.iid;

    const played = applyAction(testRegistry, s, { type: 'playUnit', iid: 'sh', lane: 'ground2' });
    expect(played.state.pending).toHaveLength(1);
    expect(played.state.pending?.[0]).toMatchObject({ kind: 'move', scope: 'enemy', player: 0 });
    // enemy not auto-moved yet
    expect(played.state.players[1].lanes.ground1.front?.iid).toBe(enemyIid);

    const resolved = applyAction(testRegistry, played.state, { type: 'resolvePending', targetIid: enemyIid, toLane: 'water' });
    expect(resolved.state.pending).toBeUndefined();
    expect(resolved.state.players[1].lanes.ground1.front).toBeUndefined();
    expect(resolved.state.players[1].lanes.water.front?.iid).toBe(enemyIid);
  });

  it('a pending choice rejects an out-of-scope target and can be skipped', () => {
    const s = blankState();
    s.players[0].energy = 2;
    s.players[0].hand = [{ iid: 'sh', cardId: 'shover' }];
    place(s, 0, 'ground1', unit({ owner: 0, attack: 1, hp: 2 })); // only an ally on board
    const played = applyAction(testRegistry, s, { type: 'playUnit', iid: 'sh', lane: 'ground2' });
    const allyIid = played.state.players[0].lanes.ground1.front!.iid;

    const bad = applyAction(testRegistry, played.state, { type: 'resolvePending', targetIid: allyIid, toLane: 'water' });
    expect(bad.events.some((e) => e.t === 'error')).toBe(true); // ally isn't a legal 'enemy' target

    const skipped = applyAction(testRegistry, played.state, { type: 'resolvePending' });
    expect(skipped.state.pending).toBeUndefined();
  });

  it('"At end of turn" effects fire only at the OWNER\'s turn end (once per round)', () => {
    const s = blankState();
    s.players[1].leaderHp = 20;
    const u = unit({ owner: 1, attack: 1, hp: 3 });
    u.endOfTurn = [{ kind: 'heal', amount: 3, target: 'leader' }];
    place(s, 1, 'ground1', u);
    // Player 0's turn ends — player 1's unit does NOT fire (not its owner's turn).
    resolveEndOfTurn(s, 0, []);
    expect(s.players[1].leaderHp).toBe(20);
    // Player 1's own turn ends — now it fires.
    resolveEndOfTurn(s, 1, []);
    expect(s.players[1].leaderHp).toBe(23);
  });
});
