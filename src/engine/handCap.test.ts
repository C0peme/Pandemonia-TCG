/**
 * The hand cap is a rule with many doors: draw, conjure, expel, deck raid, the Signature,
 * and the debug injector all put cards into a hand. Every one of them must go through
 * `addCardToHand`, which discards the overflow instead of holding it. The injector was the
 * one that didn't, and it could carry a player past HAND_CAP.
 */
import { describe, expect, it } from 'vitest';
import { applyAction } from '@engine/engine';
import { applyEffects } from '@engine/effects';
import { RULES } from '@engine/constants';
import { blankState, place, testRegistry, unit } from '@engine/testkit';
import { starterRegistry } from '@cards/data/starter';
import type { Effect } from '@cards/schema';
import type { GameEvent } from '@engine/events';

const fillHand = (s: ReturnType<typeof blankState>, player: 0 | 1, n: number = RULES.HAND_CAP): void => {
  for (let i = 0; i < n; i++) s.players[player].hand.push({ iid: `fill${player}-${i}`, cardId: 'v0' });
};

describe('hand cap', () => {
  it('conjure into a full hand discards instead of holding', () => {
    const s = blankState();
    fillHand(s, 0);
    const events: GameEvent[] = [];
    applyEffects(s, 0, [{ kind: 'conjure', cardId: 'v1' } as Effect], [], undefined, events);
    expect(s.players[0].hand).toHaveLength(RULES.HAND_CAP);
    expect(s.players[0].discard.map((c) => c.cardId)).toContain('v1');
  });

  it('expel into a full hand discards the returned unit', () => {
    const s = blankState();
    fillHand(s, 1);
    const u = unit({ owner: 1 });
    place(s, 1, 'ground1', u);
    const events: GameEvent[] = [];
    applyEffects(s, 0, [{ kind: 'expel', target: 'enemy' } as Effect], [{ kind: 'unit', iid: u.iid }], undefined, events, testRegistry);
    expect(s.players[1].hand).toHaveLength(RULES.HAND_CAP);
    expect(s.players[1].discard.map((c) => c.iid)).toContain(u.iid);
    expect(s.players[1].lanes.ground1.front).toBeUndefined();
  });

  it('a multi-conjure spell cast at a full hand never overfills it', () => {
    const s = blankState();
    s.players[0].energy = 20;
    s.players[0].hand = [{ iid: 'spell', cardId: 'call-in-markers' }];
    fillHand(s, 0, RULES.HAND_CAP - 1);
    const res = applyAction(starterRegistry, s, { type: 'playSpell', iid: 'spell', targets: [] });
    expect(res.state.players[0].hand.length).toBeLessThanOrEqual(RULES.HAND_CAP);
  });

  it('the debug injector obeys the cap too', () => {
    const s = blankState();
    fillHand(s, 0);
    const res = applyAction(testRegistry, s, { type: 'debugAddCard', cardId: 'v1' });
    expect(res.state.players[0].hand).toHaveLength(RULES.HAND_CAP);
    expect(res.state.players[0].discard.map((c) => c.cardId)).toContain('v1');
  });
});
