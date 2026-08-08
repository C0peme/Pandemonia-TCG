import { describe, expect, it } from 'vitest';
import { blankState, testRegistry, unit, place } from '@engine/testkit';
import { beginTurn } from '@engine/turn';
import { applyAction } from '@engine/engine';
import { applyEffects } from '@engine/effects';
import type { GameEvent } from '@engine/events';

// `energyNext` queues energy onto the recipient's NEXT turn only. It exists because
// beginTurn OVERWRITES `energy` with the round number, so end-of-turn energy added to the
// current pool is silently discarded.
describe('energyNext', () => {
  const grant = (s: ReturnType<typeof blankState>, amount: number) => {
    const events: GameEvent[] = [];
    applyEffects(s, 0, [{ kind: 'energyNext', amount }], [], undefined, events, testRegistry);
    return events;
  };

  it('does not change the energy already in hand this turn', () => {
    const s = blankState({ round: 3 });
    s.players[0].energy = 5;
    grant(s, 1);
    expect(s.players[0].energy).toBe(5);
    expect(s.players[0].energyNext).toBe(1);
  });

  it('is added on top of the round number next turn', () => {
    const s = blankState({ round: 4 });
    grant(s, 1);
    const { state } = beginTurn(s, 0, testRegistry);
    expect(state.players[0].energy).toBe(5); // round 4 + 1
  });

  it('is consumed, not permanent — the turn after is back to normal', () => {
    const s = blankState({ round: 4 });
    grant(s, 1);
    const first = beginTurn(s, 0, testRegistry).state;
    expect(first.players[0].energy).toBe(5);
    expect(first.players[0].energyNext).toBe(0); // cleared as it was spent
    const second = beginTurn({ ...first, round: 5 }, 0, testRegistry).state;
    expect(second.players[0].energy).toBe(5); // round 5 + 0, no lingering bonus
  });

  it('stacks within a single turn (Metastasis queues a second point)', () => {
    const s = blankState({ round: 2 });
    grant(s, 1);
    grant(s, 1);
    expect(s.players[0].energyNext).toBe(2);
    expect(beginTurn(s, 0, testRegistry).state.players[0].energy).toBe(4);
  });

  it('is per-player — the opponent does not inherit it', () => {
    const s = blankState({ round: 3 });
    grant(s, 1);
    expect(beginTurn(s, 1, testRegistry).state.players[1].energy).toBe(3);
  });

  it('reports the running total on the event', () => {
    const s = blankState({ round: 1 });
    grant(s, 1);
    const e = grant(s, 1).find((x) => x.t === 'energyNext');
    expect(e).toMatchObject({ t: 'energyNext', player: 0, amount: 1, total: 2 });
  });

  // The regression this whole mechanism fixes: a Producer's output used to be added to the
  // CURRENT pool at end of turn and then wiped by the next beginTurn reset, so a generic
  // (non-element) Producer produced nothing at all.
  it('a Producer actually delivers its energy on the owner next turn', () => {
    let s = blankState({ round: 3 });
    place(s, 0, 'ground1', unit({ owner: 0, attack: 0, hp: 3, keywords: { producer: { amount: 2 } } }));
    s.players[0].energy = 0;
    const afterMine = applyAction(testRegistry, s, { type: 'endTurn' }).state;
    const afterTheirs = applyAction(testRegistry, afterMine, { type: 'endTurn' }).state;
    expect(afterTheirs.round).toBe(4);
    expect(afterTheirs.players[0].energy).toBe(6); // round 4 + 2 produced, not 4
  });
});
