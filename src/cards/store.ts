/**
 * Live, persistent content store for Pandemonia.
 *
 * The starter set (`@cards/data/starter`) is the immutable BASE. On top of it the
 * player can:
 *   - create brand-new cards,
 *   - edit (override) existing cards to rebalance them,
 *   - hide base cards,
 *   - build and save custom decks,
 *   - choose which two decks the hotseat game uses.
 *
 * All of that is kept in localStorage and merged with the base into an *effective*
 * Registry. The module is a tiny vanilla store (subscribe / getSnapshot) so React can
 * bind to it with `useSyncExternalStore` and re-render whenever content changes.
 */
import { type Registry, expandKeywordEffects } from '@cards/registry';
import { cardSchema, deckSchema, leaderSchema, type Card, type Deck, type Leader } from '@cards/schema';
import type { ContentSnapshot as WireSnapshot } from '@cards/snapshot';
import { SPECIAL_CARDS } from '@cards/special';
import {
  starterCards,
  starterLeaders,
  deckAggro,
  deckControl,
  deckDoT,
  deckStall,
  deckCombo,
  deckTempo,
  deckRamp,
  deckAttrition,
  deckSnowball,
  deckDeckOut,
  deckLaneControl,
  deckMidrange,
  deckSwarm,
} from '@cards/data/starter';

const LS_KEY = 'pandemonia.content.v1';

/** Decks that ship with the game. They can be edited (cloned into custom) but not deleted. */
const BASE_DECKS: Deck[] = [
  deckAggro, deckDoT, deckControl, deckCombo, deckTempo, deckRamp,
  deckStall, deckAttrition, deckSnowball, deckDeckOut, deckLaneControl, deckMidrange, deckSwarm,
];

const BASE_CARD_IDS = new Set<string>([
  ...SPECIAL_CARDS.map((c) => c.id),
  ...starterCards.map((c) => c.id),
]);
const BASE_LEADER_IDS = new Set<string>(starterLeaders.map((l) => l.id));
const BASE_DECK_NAMES = new Set<string>(BASE_DECKS.map((d) => d.name));

/** What we persist to localStorage. */
interface PersistShape {
  /** New cards AND edited base cards (full card objects, keyed by id). */
  cards: Card[];
  /** Edited base leaders (full leader objects, keyed by id). */
  leaders: Leader[];
  /** Custom decks AND edited base decks (full deck objects, keyed by name). */
  decks: Deck[];
  /** Base card ids the player has hidden. */
  hiddenBaseCardIds: string[];
  /** Names of the two decks the hotseat game uses (P1, P2). */
  selected: [string, string];
}

/** The derived snapshot React consumes (stable reference until a mutation). */
export interface ContentSnapshot {
  registry: Registry;
  /** Effective deck list (base, overridden by same-named custom, then custom-only). */
  decks: Deck[];
  selected: [string, string];
  /** The two Deck objects selected for play (resolved, with fallbacks). */
  playDecks: [Deck, Deck];
}

// --- localStorage I/O (defensive: never throw out of here) ---------------------

const emptyPersist = (): PersistShape => ({
  cards: [],
  leaders: [],
  decks: [],
  hiddenBaseCardIds: [],
  selected: [deckAggro.name, deckControl.name],
});

const loadPersist = (): PersistShape => {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return emptyPersist();
    const parsed = JSON.parse(raw) as Partial<PersistShape>;
    const base = emptyPersist();
    // Validate stored cards/decks individually; drop anything that no longer parses.
    const cards = Array.isArray(parsed.cards)
      ? parsed.cards.filter((c): c is Card => cardSchema.safeParse(c).success)
      : base.cards;
    const leaders = Array.isArray(parsed.leaders)
      ? parsed.leaders.filter((l): l is Leader => leaderSchema.safeParse(l).success)
      : base.leaders;
    const decks = Array.isArray(parsed.decks)
      ? parsed.decks.filter((d): d is Deck => deckSchema.safeParse(d).success)
      : base.decks;
    return {
      cards,
      leaders,
      decks,
      hiddenBaseCardIds: Array.isArray(parsed.hiddenBaseCardIds) ? parsed.hiddenBaseCardIds : base.hiddenBaseCardIds,
      selected:
        Array.isArray(parsed.selected) && parsed.selected.length === 2
          ? [String(parsed.selected[0]), String(parsed.selected[1])]
          : base.selected,
    };
  } catch {
    return emptyPersist();
  }
};

const savePersist = (p: PersistShape): void => {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(p));
  } catch {
    /* storage full / unavailable — keep working in-memory */
  }
};

// --- Derivation: persist -> snapshot ------------------------------------------

const buildRegistryFrom = (p: PersistShape): Registry => {
  const cards = new Map<string, Card>();
  for (const c of SPECIAL_CARDS) cards.set(c.id, expandKeywordEffects(c));
  for (const c of starterCards) cards.set(c.id, expandKeywordEffects(c));
  for (const id of p.hiddenBaseCardIds) cards.delete(id);
  for (const c of p.cards) cards.set(c.id, expandKeywordEffects(c)); // custom overrides base (already migrated → no-op)
  const leaders = new Map<string, Leader>();
  for (const l of starterLeaders) leaders.set(l.id, l);
  for (const l of p.leaders) leaders.set(l.id, l); // edited leaders override base
  return { cards, leaders };
};

const effectiveDecks = (p: PersistShape): Deck[] => {
  const byName = new Map<string, Deck>();
  for (const d of BASE_DECKS) byName.set(d.name, d);
  for (const d of p.decks) byName.set(d.name, d); // custom overrides base by name
  return [...byName.values()];
};

const resolvePlayDecks = (decks: Deck[], selected: [string, string]): [Deck, Deck] => {
  const find = (name: string, fallbackIdx: number): Deck =>
    decks.find((d) => d.name === name) ?? decks[fallbackIdx] ?? decks[0] ?? deckAggro;
  return [find(selected[0], 0), find(selected[1], 1)];
};

const derive = (p: PersistShape): ContentSnapshot => {
  const registry = buildRegistryFrom(p);
  const decks = effectiveDecks(p);
  return { registry, decks, selected: p.selected, playDecks: resolvePlayDecks(decks, p.selected) };
};

// --- Vanilla store ------------------------------------------------------------

let persist: PersistShape = loadPersist();
let snapshot: ContentSnapshot = derive(persist);
const listeners = new Set<() => void>();

const commit = (next: PersistShape): void => {
  persist = next;
  savePersist(persist);
  snapshot = derive(persist);
  for (const l of listeners) l();
};

export const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const getSnapshot = (): ContentSnapshot => snapshot;

/**
 * Serialize the host's live content into a transport-ready {@link ContentSnapshot} for
 * multiplayer. Emits fully-resolved effective cards/leaders (including special cards, which
 * `registryFromSnapshot` dedups) plus the current deck pool.
 */
export const snapshotContent = (): WireSnapshot => ({
  cards: [...snapshot.registry.cards.values()],
  leaders: [...snapshot.registry.leaders.values()],
  decks: snapshot.decks,
});

// --- Queries ------------------------------------------------------------------

export const isBaseCard = (id: string): boolean => BASE_CARD_IDS.has(id);
export const isOverridden = (id: string): boolean => BASE_CARD_IDS.has(id) && persist.cards.some((c) => c.id === id);
export const isCustomCard = (id: string): boolean => !BASE_CARD_IDS.has(id) && persist.cards.some((c) => c.id === id);
export const isHidden = (id: string): boolean => persist.hiddenBaseCardIds.includes(id);
export const isBaseDeck = (name: string): boolean => BASE_DECK_NAMES.has(name);
export const isCustomDeck = (name: string): boolean => persist.decks.some((d) => d.name === name);

/** Slugify a name into a candidate id, then make it unique against the registry. */
export const makeCardId = (name: string): string => {
  const slug =
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'card';
  let id = slug;
  let n = 2;
  while (snapshot.registry.cards.has(id)) id = `${slug}-${n++}`;
  return id;
};

// --- Mutations (each validates, persists, and notifies) -----------------------

/** Create or update a card. Throws (with a readable message) if it fails validation. */
export const saveCard = (data: unknown): Card => {
  const card = cardSchema.parse(data); // throws ZodError on bad shape
  const cards = persist.cards.filter((c) => c.id !== card.id);
  cards.push(card);
  // Editing a base card un-hides it.
  const hiddenBaseCardIds = persist.hiddenBaseCardIds.filter((id) => id !== card.id);
  commit({ ...persist, cards, hiddenBaseCardIds });
  return card;
};

/**
 * Delete a card. A custom card is removed outright; a base card is hidden (and any
 * override dropped) so it stops appearing in the collection / deck pool.
 */
export const deleteCard = (id: string): void => {
  const cards = persist.cards.filter((c) => c.id !== id);
  const hiddenBaseCardIds = BASE_CARD_IDS.has(id)
    ? [...new Set([...persist.hiddenBaseCardIds, id])]
    : persist.hiddenBaseCardIds;
  commit({ ...persist, cards, hiddenBaseCardIds });
};

/** Revert a base card to its shipped definition (drops override and un-hides it). */
export const resetCard = (id: string): void => {
  commit({
    ...persist,
    cards: persist.cards.filter((c) => c.id !== id),
    hiddenBaseCardIds: persist.hiddenBaseCardIds.filter((h) => h !== id),
  });
};

/** Create or update a deck. Throws if it doesn't satisfy the deck schema (incl. 40-card rule). */
export const saveDeck = (data: unknown): Deck => {
  const deck = deckSchema.parse(data);
  const decks = persist.decks.filter((d) => d.name !== deck.name);
  decks.push(deck);
  commit({ ...persist, decks });
  return deck;
};

/**
 * Remove a deck. A custom deck is deleted outright; an *edited base deck* has its
 * override dropped, reverting it to the shipped version (the deck itself still exists).
 */
export const deleteDeck = (name: string): void => {
  const decks = persist.decks.filter((d) => d.name !== name);
  // Only clear selection when the deck disappears entirely (i.e. it wasn't a base deck).
  const gone = !BASE_DECK_NAMES.has(name);
  const selected: [string, string] = gone
    ? [
        persist.selected[0] === name ? deckAggro.name : persist.selected[0],
        persist.selected[1] === name ? deckControl.name : persist.selected[1],
      ]
    : persist.selected;
  commit({ ...persist, decks, selected });
};

/** Choose which deck a side plays. */
export const setSelectedDeck = (side: 0 | 1, name: string): void => {
  const selected: [string, string] = [...persist.selected];
  selected[side] = name;
  commit({ ...persist, selected });
};

/** Revert all overridden base cards to their shipped definitions (custom cards are kept). */
export const revertAllOverrides = (): void => {
  const cards = persist.cards.filter((c) => !BASE_CARD_IDS.has(c.id));
  const hiddenBaseCardIds = persist.hiddenBaseCardIds.filter(
    (id) => !BASE_CARD_IDS.has(id),
  );
  commit({ ...persist, cards, hiddenBaseCardIds });
};

/** Wipe all custom content (cards, decks, selections). */
export const resetAll = (): void => commit(emptyPersist());

// --- Leader queries & mutations -----------------------------------------------

export const isBaseLeader = (id: string): boolean => BASE_LEADER_IDS.has(id);
export const isOverriddenLeader = (id: string): boolean =>
  BASE_LEADER_IDS.has(id) && persist.leaders.some((l) => l.id === id);

/** Save an edited leader override. Throws if it fails validation. */
export const saveLeader = (data: unknown): Leader => {
  const leader = leaderSchema.parse(data);
  const leaders = persist.leaders.filter((l) => l.id !== leader.id);
  leaders.push(leader);
  commit({ ...persist, leaders });
  return leader;
};

/** Revert a base leader to its shipped definition. */
export const resetLeader = (id: string): void => {
  commit({ ...persist, leaders: persist.leaders.filter((l) => l.id !== id) });
};
