/**
 * Redaction: strip hidden information from the authoritative game state before sending it to
 * a client, so a player can never learn the opponent's hand, deck order, or RNG seed.
 *
 * What is public (kept): the board, both leaders' HP/energy/bank, discard piles, hand and deck
 * COUNTS, and every event except the opponent's private draws. What is hidden (redacted):
 *  - the OTHER seat's hand card ids  → blanked (count + facedown placeholders preserved)
 *  - the OTHER seat's deck contents  → blanked to same-length placeholders (count is public)
 *  - the RNG seed                    → replaced with a dummy (removes the deck-order oracle)
 *  - `draw` events for the OTHER seat → dropped (they carry the drawn cardId)
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
 * Redact an event list for a recipient seat: drop the opponent's `draw` events (which reveal a
 * cardId). Deck-out `drawNull` events carry no card identity, so they stay. All other events are
 * public (played/cast cards are visible to everyone).
 */
export const redactEventsFor = (events: GameEvent[], seat: PlayerId): GameEvent[] =>
  events.filter((e) => !(e.t === 'draw' && e.player !== seat));
