/**
 * Content snapshot: a plain, serializable bundle of the host's effective card content
 * (cards, leaders, deck pool). It is the unit of content transfer for multiplayer — the
 * host serializes its live content once and the server hands it to joining clients so
 * everyone builds an identical {@link Registry}.
 *
 * This module is deliberately free of localStorage / React so the Node server can import
 * it. The live editable store (`@cards/store`) produces snapshots via `snapshotContent`.
 */
import { type Registry, expandKeywordEffects } from '@cards/registry';
import { SPECIAL_CARDS } from '@cards/special';
import { cardSchema, deckSchema, leaderSchema, type Card, type Deck, type Leader } from '@cards/schema';

/** A fully-resolved, transport-ready view of a player's card content. */
export interface ContentSnapshot {
  /** Effective card definitions (base + custom + overrides, already resolved). */
  cards: Card[];
  /** Effective leader definitions. */
  leaders: Leader[];
  /** The deck pool available to select from / build against. */
  decks: Deck[];
}

/**
 * Build a Registry from a content snapshot. Special system cards (e.g. Null) are always
 * included. `expandKeywordEffects` is idempotent, so re-running it on already-migrated
 * cards is a no-op — safe whether the snapshot came from a live store or the wire.
 */
export const registryFromSnapshot = (snap: ContentSnapshot): Registry => {
  const cards = new Map<string, Card>();
  for (const c of SPECIAL_CARDS) cards.set(c.id, expandKeywordEffects(c));
  for (const c of snap.cards) cards.set(c.id, expandKeywordEffects(c));
  const leaders = new Map<string, Leader>();
  for (const l of snap.leaders) leaders.set(l.id, l);
  return { cards, leaders };
};

/**
 * Validate an untrusted snapshot received over the wire (defensive: never throws). Any
 * card/leader/deck that fails its schema is dropped rather than poisoning the registry.
 */
export const parseSnapshot = (data: unknown): ContentSnapshot => {
  const src = (data ?? {}) as Partial<ContentSnapshot>;
  const cards = Array.isArray(src.cards)
    ? src.cards.filter((c): c is Card => cardSchema.safeParse(c).success)
    : [];
  const leaders = Array.isArray(src.leaders)
    ? src.leaders.filter((l): l is Leader => leaderSchema.safeParse(l).success)
    : [];
  const decks = Array.isArray(src.decks)
    ? src.decks.filter((d): d is Deck => deckSchema.safeParse(d).success)
    : [];
  return { cards, leaders, decks };
};
