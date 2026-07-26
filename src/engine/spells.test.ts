import { describe, expect, it } from 'vitest';
import { applyAction } from '@engine/engine';
import { blankState, place, testRegistry, unit } from '@engine/testkit';
import type { GameState } from '@engine/types';

const withActiveHand = (energy: number, hand: { iid: string; cardId: string }[]): GameState => {
  const s = blankState();
  s.players[0].energy = energy;
  s.players[0].hand = hand;
  return s;
};

describe('playSpell', () => {
  it('casts a damage spell at an enemy unit and discards it', () => {
    const s = withActiveHand(1, [{ iid: 'fb', cardId: 'firebolt' }]);
    place(s, 1, 'ground1', unit({ owner: 1, attack: 0, hp: 5 }));
    const target = s.players[1].lanes.ground1.front!;
    const { state } = applyAction(testRegistry, s, {
      type: 'playSpell',
      iid: 'fb',
      targets: [{ kind: 'unit', iid: target.iid }],
    });
    expect(state.players[1].lanes.ground1.front?.hp).toBe(2);
    expect(state.players[0].hand).toHaveLength(0);
    expect(state.players[0].discard.some((c) => c.iid === 'fb')).toBe(true);
    expect(state.players[0].energy).toBe(0);
  });

  it('casts a damage spell at the leader', () => {
    const s = withActiveHand(1, [{ iid: 'fb', cardId: 'firebolt' }]);
    const { state } = applyAction(testRegistry, s, {
      type: 'playSpell',
      iid: 'fb',
      targets: [{ kind: 'leader', player: 1 }],
    });
    expect(state.players[1].leaderHp).toBe(27);
  });

  it('rejects an unaffordable spell without changing state', () => {
    const s = withActiveHand(0, [{ iid: 'fb', cardId: 'firebolt' }]);
    const { state, events } = applyAction(testRegistry, s, {
      type: 'playSpell',
      iid: 'fb',
      targets: [{ kind: 'leader', player: 1 }],
    });
    expect(events[0]?.t).toBe('error');
    expect(state.players[0].hand).toHaveLength(1); // untouched
  });

  it('rejects a spell with a missing target and leaves the card in hand', () => {
    const s = withActiveHand(1, [{ iid: 'fb', cardId: 'firebolt' }]);
    const { state, events } = applyAction(testRegistry, s, { type: 'playSpell', iid: 'fb' });
    expect(events.some((e) => e.t === 'error')).toBe(true);
    expect(state.players[0].hand).toHaveLength(1);
    expect(state.players[0].energy).toBe(1);
  });
});

describe('heroPower', () => {
  it("uses the leader's hero power once per turn", () => {
    const s = withActiveHand(2, []);
    const first = applyAction(testRegistry, s, {
      type: 'heroPower',
      targets: [{ kind: 'leader', player: 1 }],
    });
    expect(first.state.players[1].leaderHp).toBe(29); // Spark: 1 damage
    expect(first.state.players[0].heroPowerUsed).toBe(true);

    const second = applyAction(testRegistry, first.state, {
      type: 'heroPower',
      targets: [{ kind: 'leader', player: 1 }],
    });
    expect(second.events.some((e) => e.t === 'error')).toBe(true);
  });
});

describe('playEnvironment', () => {
  it('places an environment in an allowed lane', () => {
    const s = withActiveHand(2, [{ iid: 'sf', cardId: 'scorched-field' }]);
    const { state } = applyAction(testRegistry, s, {
      type: 'playEnvironment',
      iid: 'sf',
      lane: 'ground1',
    });
    expect(state.environments.ground1?.cardId).toBe('scorched-field');
    expect(state.players[0].hand).toHaveLength(0);
  });

  it('rejects placement in a disallowed lane', () => {
    const s = withActiveHand(2, [{ iid: 'sf', cardId: 'scorched-field' }]);
    const { events } = applyAction(testRegistry, s, {
      type: 'playEnvironment',
      iid: 'sf',
      lane: 'heights',
    });
    expect(events[0]?.t).toBe('error');
  });
});
