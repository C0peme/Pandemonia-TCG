/**
 * Centralized card draw. On an empty deck the player draws a Null card (deck-out)
 * instead — see cards/special.ts. Used by the turn's Draw step and by draw effects.
 */
import { NULL_CARD_ID } from '@cards/special';
import { addCardToHand } from '@engine/hand';
import type { GameEvent } from '@engine/events';
import type { GameState, PlayerId } from '@engine/types';

export const drawCard = (s: GameState, player: PlayerId, events: GameEvent[]): void => {
  const p = s.players[player];
  if (p.deck.length > 0) {
    const [card, ...rest] = p.deck;
    p.deck = rest;
    events.push({ t: 'draw', player, iid: card!.iid, cardId: card!.cardId });
    // A full hand forgets the drawn card permanently (see hand.ts).
    addCardToHand(s, player, card!, events);
  } else {
    const iid = `null${s.iidSeq++}`;
    events.push({ t: 'drawNull', player });
    // Drawing a Null into a full hand forgets it — which bleeds the leader for 4.
    addCardToHand(s, player, { iid, cardId: NULL_CARD_ID }, events);
  }
};
