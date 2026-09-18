/**
 * Redaction: strip hidden information from the authoritative game state before sending it to
 * a client, so a player can never learn the opponent's hand, deck order, or RNG seed.
 *
 * What is public (kept): the board, both leaders' HP/energy/bank, discard piles, hand and deck
 * COUNTS, and every event except the opponent's private hidden-zone reveals. What is hidden
 * (redacted):
 *  - the OTHER seat's hand card ids  → blanked (count + facedown placeholders preserved)
 *  - the OTHER seat's deck contents  → blanked to same-length placeholders (count is public)
 *  - the RNG seed                    → replaced with a dummy (removes the deck-order oracle)
 *  - hidden-zone-revealing events for the OTHER seat → dropped (see `HAND_REVEAL_EVENTS`)
 *
 * The recipient's OWN hand/deck/draws are sent in full so they can see and play their cards.
 */
import type { GameEvent } from '@engine/events';
import { opponentOf, type CardInstance, type GameState, type PlayerId } from '@engine/types';

/** A card whose identity is hidden — keeps a stable-ish iid for React keys but no cardId. */
const facedown = (inst: CardInstance): CardInstance => ({ iid: inst.iid, cardId: '' });

/** Redact `state` for the given recipient seat. Returns a new, safe-to-send GameState. */
export const redactStateFor = (state: GameState, seat: PlayerId): GameState => {
  const clone: GameState = structuredClone(state);
  const foe = opponentOf(seat);
  const foePlayer = clone.players[foe];
  // Hide the opponent's hand identities and deck order/contents; counts stay intact.
  foePlayer.hand = foePlayer.hand.map(facedown);
  foePlayer.deck = foePlayer.deck.map(facedown);
  // Remove the RNG oracle. The client never advances RNG (it only animates); this keeps the
  // GameState type intact while denying any future-draw prediction.
  clone.rng = { s: 0 };
  return clone;
};

/**
 * Event types that reveal the identity of a card sitting in a HIDDEN zone (a hand or a
 * deck) in plaintext `cardId`, the same leak shape as `draw`:
 *  - `draw`    — a card leaves the deck into a hand.
 *  - `conjure` — a card is created directly in a hand (`conjureOnKill`, the `conjure`
 *    effect, Corpselock's `conjureOnPlay` engine trigger). Every one of these can target
 *    the CASTER's own hand, so a player conjuring for themselves used to broadcast the
 *    identity straight to their opponent over the event stream — even though the
 *    (separately redacted) GameState correctly hid the resulting card as facedown.
 *  - `forget`  — a card is removed from a hand OR milled off the top of a deck
 *    (`hand.ts`'s `forgetCard`/`millCards`). The `forget` EFFECT's most ordinary use is
 *    `target: 'enemy'` — milling the OPPONENT's deck is the whole point of the card — so
 *    this was the most exploitable of the three: casting a completely normal removal/
 *    mill spell against your opponent handed you their deck order for free.
 *
 * Deck-out `drawNull` carries no card identity and is deliberately excluded. Every other
 * `cardId`-bearing event (`playUnit`, `castSpell`, `summon`, `expel`, …) is about a card
 * already PUBLIC on the board, so revealing it again is not a new leak.
 */
const HAND_REVEAL_EVENTS = new Set<GameEvent['t']>(['draw', 'conjure', 'forget']);

/**
 * Redact an event list for a recipient seat: drop the opponent's hand-revealing events
 * (see `HAND_REVEAL_EVENTS`). All other events are public (played/cast cards are visible
 * to everyone).
 */
export const redactEventsFor = (events: GameEvent[], seat: PlayerId): GameEvent[] =>
  events.filter((e) => !(HAND_REVEAL_EVENTS.has(e.t) && 'player' in e && e.player !== seat));
