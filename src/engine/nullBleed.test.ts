import { describe, expect, it } from 'vitest';
import { blankState } from '@engine/testkit';
import { nullBleed, nullHoldTax } from '@engine/damage';
import { forgetCard } from '@engine/hand';
import { NULL_CARD_ID, NULL_HOLD_DAMAGE, NULL_KAMIKAZE_DAMAGE } from '@cards/special';
import type { GameEvent } from '@engine/events';

const nulls = (n: number) => Array.from({ length: n }, (_, i) => ({ iid: `n${i}`, cardId: NULL_CARD_ID }));

/**
 * Deck-out has to be a bill you cannot dodge. The shed bleed alone was dodgeable: holding a
 * Null cost nothing, so a player with hand room simply never paid (Guardian shed 0.3 of the
 * 2.7 it drew). The per-turn hold tax is what closes that exit.
 */
describe('Nulls in hand bill their holder every turn', () => {
  it('charges per Null held, so the cost compounds', () => {
    const s = blankState();
    const ev: GameEvent[] = [];
    s.players[0].hand = nulls(3);
    const start = s.players[0].leaderHp;
    nullHoldTax(s, 0, ev);
    expect(start - s.players[0].leaderHp).toBe(NULL_HOLD_DAMAGE * 3);
  });

  it('charges nothing with no Nulls in hand', () => {
    const s = blankState();
    const ev: GameEvent[] = [];
    s.players[0].hand = [{ iid: 'a', cardId: 'v1' }];
    const start = s.players[0].leaderHp;
    nullHoldTax(s, 0, ev);
    expect(s.players[0].leaderHp).toBe(start);
    expect(ev).toHaveLength(0);
  });

  it('bills only the holder', () => {
    const s = blankState();
    const ev: GameEvent[] = [];
    s.players[0].hand = nulls(2);
    const before = s.players[1].leaderHp;
    nullHoldTax(s, 0, ev);
    expect(s.players[1].leaderHp).toBe(before);
  });

  it('shedding a Null is a flat hit — no escalation', () => {
    const s = blankState();
    const ev: GameEvent[] = [];
    const start = s.players[0].leaderHp;
    nullBleed(s, 0, ev);
    nullBleed(s, 0, ev);
    expect(start - s.players[0].leaderHp).toBe(NULL_KAMIKAZE_DAMAGE * 2);
  });

  it('discarding a Null bleeds the same as one dying in play', () => {
    const s = blankState();
    const ev: GameEvent[] = [];
    const start = s.players[0].leaderHp;
    forgetCard(s, 0, { iid: 'n1', cardId: NULL_CARD_ID }, ev);
    expect(start - s.players[0].leaderHp).toBe(NULL_KAMIKAZE_DAMAGE);
  });
});
