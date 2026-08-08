/**
 * Per-turn DECK RAID — the mechanic behind Adventure's endgame boss (the Copper Mech).
 *
 * Each of the raider's turns, one `DeckRaidPool` is chosen at random and plundered:
 * `count` cards are pulled from it straight into hand, and the pool's signature (if it
 * has one) REPLACES the raider's current signature and is re-armed for delivery, so a
 * fresh signature arrives every single round.
 *
 * The engine stays content-agnostic: a pool is just a labelled list of card ids plus an
 * optional signature id. It never learns what a "leader archetype" is — the Adventure
 * layer builds the pools (see `data/copperMech.ts`). That keeps this reusable for any
 * future "draws from someone else's deck" boss.
 *
 * Determinism: every random choice advances `state.rng`, exactly like the rest of the
 * engine, so the same seed + same actions still reproduces the same game.
 */
import { RULES } from '@engine/constants';
import { nextInt } from '@engine/rng';
import { addCardToHand, forgetCard } from '@engine/hand';
import type { GameEvent } from '@engine/events';
import type { GameState, PlayerId } from '@engine/types';

/**
 * Run one turn's raid for `player` (no-op when they have no `turnDeckRaid`).
 *
 * Cards are sampled WITH replacement: a pool is a card POOL, not a shuffled library, so
 * the same card can be pulled twice in a turn and the pool is never exhausted. Raided
 * cards go through `addCardToHand`, so the hand cap applies normally — an overflowing
 * raid forgets the excess rather than growing the hand past the cap.
 */
export const resolveDeckRaid = (s: GameState, player: PlayerId, events: GameEvent[]): void => {
  const raid = s.players[player].turnDeckRaid;
  if (!raid || raid.pools.length === 0 || raid.count <= 0) return;

  const choice = nextInt(s.rng, raid.pools.length);
  s.rng = choice.rng;
  const pool = raid.pools[choice.value]!;

  // The signature is delivered FIRST, and is guaranteed. Order matters: a raid normally
  // fills the hand to the cap, and the ordinary `grantSignatureIfRoom` politely declines
  // to deliver into a full hand — which silently reduced "a new signature every round"
  // to "one signature, ever". Taking the signature before the bulk cards, and evicting
  // the oldest held card when the hand is already full, is what makes the mechanic real.
  // The plundered cards below stay overflow-able; the signature does not.
  if (pool.signatureCardId !== undefined) {
    const p = s.players[player];
    p.signatureCardId = pool.signatureCardId;
    p.signatureUnlocked = true;
    p.signatureGranted = false;
    p.signaturePending = false;
    if (p.hand.length >= RULES.HAND_CAP) {
      const [oldest, ...rest] = p.hand;
      p.hand = rest;
      if (oldest) forgetCard(s, player, oldest, events);
    }
    p.hand = [...p.hand, { iid: `sig${s.iidSeq++}`, cardId: pool.signatureCardId }];
    p.signatureGranted = true;
    events.push({ t: 'signatureGranted', player, cardId: pool.signatureCardId });
  }

  const taken: string[] = [];
  for (let i = 0; i < raid.count && pool.cardIds.length > 0; i++) {
    const pick = nextInt(s.rng, pool.cardIds.length);
    s.rng = pick.rng;
    const cardId = pool.cardIds[pick.value]!;
    taken.push(cardId);
    addCardToHand(s, player, { iid: `raid${s.iidSeq++}`, cardId }, events);
  }

  events.push({ t: 'deckRaid', player, source: pool.name, cardIds: taken });
};
