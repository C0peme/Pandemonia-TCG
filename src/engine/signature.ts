/**
 * Signature delivery.
 *
 * When a leader's HP first drops to the threshold, the Signature is marked unlocked
 * and pending. The Signature card is then delivered to the player's hand as soon as
 * there is room (hand below the cap) — if the hand is full it waits and is retried
 * at the start of each of that player's turns.
 */
import { RULES } from '@engine/constants';
import type { GameEvent } from '@engine/events';
import type { GameState, PlayerId } from '@engine/types';

/** Mark the Signature unlocked + pending (idempotent). */
export const unlockSignature = (s: GameState, player: PlayerId, events: GameEvent[]): void => {
  const p = s.players[player];
  if (p.signatureUnlocked) return;
  p.signatureUnlocked = true;
  if (!p.signatureGranted) p.signaturePending = true;
  events.push({ t: 'signatureUnlocked', player });
};

/** Deliver the pending Signature card if the hand has room. */
export const grantSignatureIfRoom = (s: GameState, player: PlayerId, events: GameEvent[]): void => {
  const p = s.players[player];
  if (!p.signaturePending || p.signatureGranted) return;
  if (p.hand.length >= RULES.HAND_CAP) return;
  const iid = `sig${s.iidSeq++}`;
  p.hand = [...p.hand, { iid, cardId: p.signatureCardId }];
  p.signaturePending = false;
  p.signatureGranted = true;
  events.push({ t: 'signatureGranted', player, cardId: p.signatureCardId });
};
