import { describe, expect, it } from 'vitest';
import { blankState } from '@engine/testkit';
import type { GameEvent } from '@engine/events';
import type { CardInstance } from '@engine/types';
import { redactEventsFor, redactStateFor } from '@net/redact';

const inst = (iid: string, cardId: string): CardInstance => ({ iid, cardId });

describe('redactStateFor', () => {
  const base = () => {
    const s = blankState();
    s.players[0].hand = [inst('a0', 'firebolt'), inst('a1', 'titan')];
    s.players[0].deck = [inst('a2', 'eel'), inst('a3', 'twins'), inst('a4', 'medic')];
    s.players[1].hand = [inst('b0', 'mend'), inst('b1', 'reaper')];
    s.players[1].deck = [inst('b2', 'kiln'), inst('b3', 'larva')];
    s.rng = { s: 123456 };
    return s;
  };

  it('hides the opponent hand and deck card ids for seat 0', () => {
    const r = redactStateFor(base(), 0);
    // Own (seat 0) hand + deck are untouched.
    expect(r.players[0].hand.map((c) => c.cardId)).toEqual(['firebolt', 'titan']);
    expect(r.players[0].deck.map((c) => c.cardId)).toEqual(['eel', 'twins', 'medic']);
    // Opponent (seat 1) hand + deck identities blanked, counts preserved.
    expect(r.players[1].hand).toHaveLength(2);
    expect(r.players[1].deck).toHaveLength(2);
    expect(r.players[1].hand.every((c) => c.cardId === '')).toBe(true);
    expect(r.players[1].deck.every((c) => c.cardId === '')).toBe(true);
  });

  it('hides seat 0 info when redacting for seat 1', () => {
    const r = redactStateFor(base(), 1);
    expect(r.players[1].hand.map((c) => c.cardId)).toEqual(['mend', 'reaper']);
    expect(r.players[0].hand.every((c) => c.cardId === '')).toBe(true);
    expect(r.players[0].deck.every((c) => c.cardId === '')).toBe(true);
  });

  it('strips the rng seed and does not mutate the source', () => {
    const src = base();
    const r = redactStateFor(src, 0);
    expect(r.rng).toEqual({ s: 0 });
    expect(src.rng).toEqual({ s: 123456 }); // original untouched
    expect(src.players[1].hand[0]!.cardId).toBe('mend'); // original untouched
  });

  it('leaks no opponent card id anywhere in the serialized payload', () => {
    const secret = ['mend', 'reaper', 'kiln', 'larva'];
    const json = JSON.stringify(redactStateFor(base(), 0));
    for (const id of secret) expect(json).not.toContain(id);
  });
});

describe('redactEventsFor', () => {
  const events: GameEvent[] = [
    { t: 'draw', player: 0, iid: 'a2', cardId: 'eel' },
    { t: 'draw', player: 1, iid: 'b2', cardId: 'kiln' },
    { t: 'drawNull', player: 1 },
    { t: 'playUnit', player: 1, cardId: 'reaper', lane: 'ground1', position: 'front' },
  ];

  it('drops opponent draw events but keeps own draws and public events', () => {
    const forSeat0 = redactEventsFor(events, 0);
    expect(forSeat0).toContainEqual({ t: 'draw', player: 0, iid: 'a2', cardId: 'eel' });
    expect(forSeat0.some((e) => e.t === 'draw' && e.player === 1)).toBe(false);
    // Deck-out (no identity) and played cards (public) survive.
    expect(forSeat0).toContainEqual({ t: 'drawNull', player: 1 });
    expect(forSeat0.some((e) => e.t === 'playUnit')).toBe(true);
  });

  it('does not leak the opponent drawn cardId', () => {
    const json = JSON.stringify(redactEventsFor(events, 0));
    expect(json).not.toContain('kiln');
  });

  /**
   * `conjure` is structurally identical to `draw` — it carries a `cardId` and puts a card
   * directly into a hand (`conjureOnKill`, the `conjure` effect targeting `self`, and
   * Corpselock's `conjureOnPlay` engine trigger can all target the CASTER's own hand) — but
   * only `draw` was ever filtered. A player running any of those leaked the identity of a
   * card that had just entered their own hidden hand to their opponent, over the event
   * stream, even though the (separately redacted) GameState correctly hid it as facedown.
   */
  const conjureEvents: GameEvent[] = [
    { t: 'conjure', player: 0, cardId: 'firebolt' }, // seat 0 conjures for itself
    { t: 'conjure', player: 1, cardId: 'reaper' },   // seat 1 conjures for itself — the leak
  ];

  it('drops the opponent conjure event, same as draw', () => {
    const forSeat0 = redactEventsFor(conjureEvents, 0);
    expect(forSeat0).toContainEqual({ t: 'conjure', player: 0, cardId: 'firebolt' });
    expect(forSeat0.some((e) => e.t === 'conjure' && e.player === 1)).toBe(false);
  });

  it('does not leak the opponent conjured cardId', () => {
    const json = JSON.stringify(redactEventsFor(conjureEvents, 0));
    expect(json).not.toContain('reaper');
  });

  /**
   * `forget` fires for BOTH a card discarded from a hand (hand-cap overflow) and a card
   * milled off the top of a deck (`millCards` — the `forget` effect's `target: 'enemy'`
   * case, an ordinary competitive mill/removal spell cast AGAINST the opponent). Either
   * way it reveals a card that was sitting in a hidden zone. This was the most exploitable
   * of the three leaks this file fixes at once: casting a ordinary "mill 2" spell on your
   * opponent handed you their deck order in plain text over the event stream.
   */
  const forgetEvents: GameEvent[] = [
    { t: 'forget', player: 0, cardId: 'firebolt', iid: 'a9' }, // my own hand overflow
    { t: 'forget', player: 1, cardId: 'kiln' },                // I milled THEIR deck — the leak
  ];

  it('drops the opponent forget event (hand overflow or a deck mill), same as draw', () => {
    const forSeat0 = redactEventsFor(forgetEvents, 0);
    expect(forSeat0).toContainEqual({ t: 'forget', player: 0, cardId: 'firebolt', iid: 'a9' });
    expect(forSeat0.some((e) => e.t === 'forget' && e.player === 1)).toBe(false);
  });

  it('does not leak a card milled off the opponent deck', () => {
    const json = JSON.stringify(redactEventsFor(forgetEvents, 0));
    expect(json).not.toContain('kiln');
  });
});
