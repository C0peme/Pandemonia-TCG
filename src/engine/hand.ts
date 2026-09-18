/**
 * Hand management: adding cards to a hand under the hand cap, and permanently removing
 * ("forgetting") cards from play.
 *
 * The Forget pile and the hand cap are merged into one mechanic: a card that cannot be
 * held — because the hand is already full — is forgotten instead of held. A forgotten
 * Null still bleeds its owner's leader, exactly as if it had died in play (see special.ts).
 */
import { RULES } from '@engine/constants';
import { NULL_CARD_ID } from '@cards/special';
import { nullBleed } from '@engine/damage';
import type { GameEvent } from '@engine/events';
import type { CardInstance, GameState, PlayerId } from '@engine/types';

/**
 * Permanently remove a card from play (it goes to the discard pile and is never drawn
 * again). A forgotten Null deals its Kamikaze damage to its owner's leader.
 */
export const forgetCard = (
  s: GameState,
  player: PlayerId,
  card: CardInstance,
  events: GameEvent[],
): void => {
  s.players[player].discard.push(card);
  events.push({ t: 'forget', player, iid: card.iid, cardId: card.cardId });
  if (card.cardId === NULL_CARD_ID) nullBleed(s, player, events);
};

/**
 * Permanently remove `n` cards from the TOP of a player's deck (mill), discarding each
 * without ever drawing it. Shared by the `forget` effect and Adventure boss curses
 * (Screyera's "you mill 1 per turn"). Clamped to the deck's current length.
 */
export const millCards = (
  s: GameState,
  player: PlayerId,
  n: number,
  events: GameEvent[],
): void => {
  const p = s.players[player];
  const count = Math.max(0, Math.min(n, p.deck.length));
  for (let i = 0; i < count; i++) {
    const [card, ...rest] = p.deck;
    p.deck = rest;
    events.push({ t: 'forget', player, cardId: card!.cardId });
  }
};

/**
 * Add a card to a player's hand, honoring the hand cap. A full hand forgets the incoming
 * card instead of holding it. Returns true if it entered the hand.
 *
 * The cap is `player.handCap` when set, else `RULES.HAND_CAP` — relics may raise it.
 */
export const addCardToHand = (
  s: GameState,
  player: PlayerId,
  card: CardInstance,
  events: GameEvent[],
): boolean => {
  if (s.players[player].hand.length >= (s.players[player].handCap ?? RULES.HAND_CAP)) {
    forgetCard(s, player, card, events);
    return false;
  }
  s.players[player].hand = [...s.players[player].hand, card];
  return true;
};
