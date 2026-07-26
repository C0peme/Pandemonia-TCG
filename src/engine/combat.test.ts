import { describe, expect, it } from 'vitest';
import { resolveCombat } from '@engine/combat';
import { blankState, place, unit } from '@engine/testkit';
import { RULES } from '@engine/constants';

describe('resolveCombat (minimal)', () => {
  it('exchanges damage between units in the same lane (simultaneous retaliation)', () => {
    const s = blankState();
    place(s, 0, 'ground1', unit({ owner: 0, attack: 3, hp: 3 }));
    place(s, 1, 'ground1', unit({ owner: 1, attack: 2, hp: 5 }));
    const { state } = resolveCombat(s);
    expect(state.players[1].lanes.ground1.front?.hp).toBe(2); // 5 - 3
    expect(state.players[0].lanes.ground1.front?.hp).toBe(1); // 3 - 2
  });

  it('hits the leader when the lane is empty (no retaliation)', () => {
    const s = blankState();
    place(s, 0, 'ground1', unit({ owner: 0, attack: 4, hp: 4 }));
    const { state } = resolveCombat(s);
    expect(state.players[1].leaderHp).toBe(RULES.LEADER_HP - 4);
    expect(state.players[0].lanes.ground1.front?.hp).toBe(4); // untouched
  });

  it('declares a winner when a leader reaches 0', () => {
    const s = blankState();
    s.players[1].leaderHp = 3;
    place(s, 0, 'ground1', unit({ owner: 0, attack: 5, hp: 5 }));
    const { state, events } = resolveCombat(s);
    expect(state.phase).toBe('ended');
    expect(state.winner).toBe(0);
    expect(events.some((e) => e.t === 'gameOver')).toBe(true);
  });

  it('removes a destroyed unit', () => {
    const s = blankState();
    place(s, 0, 'ground1', unit({ owner: 0, attack: 5, hp: 5 }));
    place(s, 1, 'ground1', unit({ owner: 1, attack: 1, hp: 2 }));
    const { state } = resolveCombat(s);
    expect(state.players[1].lanes.ground1.front).toBeUndefined();
    expect(state.players[0].lanes.ground1.front?.hp).toBe(4); // 5 - 1 retaliation
  });

  it('a drowning unit deals no retaliation', () => {
    const s = blankState();
    place(s, 0, 'water', unit({ owner: 0, attack: 3, hp: 3 }));
    place(s, 1, 'water', unit({ owner: 1, attack: 4, hp: 5, status: { drowning: true } }));
    const { state } = resolveCombat(s);
    expect(state.players[0].lanes.water.front?.hp).toBe(3); // no retaliation taken
    expect(state.players[1].lanes.water.front?.hp).toBe(2); // 5 - 3
  });

  it('a sleeping unit cannot attack', () => {
    const s = blankState();
    place(s, 0, 'ground1', unit({ owner: 0, attack: 3, hp: 3, status: { sleep: 1 } }));
    place(s, 1, 'ground1', unit({ owner: 1, attack: 0, hp: 5 }));
    const { state } = resolveCombat(s);
    expect(state.players[1].lanes.ground1.front?.hp).toBe(5); // untouched
  });

  it('unlocks the Signature ability when the leader drops to the threshold', () => {
    const s = blankState();
    s.players[1].leaderHp = RULES.SIGNATURE_HP_THRESHOLD + 2;
    place(s, 0, 'ground2', unit({ owner: 0, attack: 2, hp: 2 }));
    const { state, events } = resolveCombat(s);
    expect(state.players[1].leaderHp).toBe(RULES.SIGNATURE_HP_THRESHOLD);
    expect(state.players[1].signatureUnlocked).toBe(true);
    expect(events.some((e) => e.t === 'signatureUnlocked')).toBe(true);
  });
});
