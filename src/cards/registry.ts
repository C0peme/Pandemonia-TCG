/**
 * Card registry: indexes card/leader data by id and validates deck lists against it
 * (existence, copy limits, deck size). The schema validates a deck in isolation;
 * the registry validates it against the actual card pool.
 */
import { type Card, type Deck, type Effect, type Keywords, type Leader, type TargetScope, parseDeck } from '@cards/schema';
import { SPECIAL_CARDS } from '@cards/special';
import { RULES } from '@engine/constants';

export interface Registry {
  cards: ReadonlyMap<string, Card>;
  leaders: ReadonlyMap<string, Leader>;
}

const mapMoverScope = (scope: string): TargetScope => (scope === 'either' ? 'any' : (scope as TargetScope));

const TRIGGER_SECTIONS = ['onPlay', 'onAttack', 'endOfTurn', 'startOfTurn'] as const;
type TriggerSection = (typeof TRIGGER_SECTIONS)[number];
const intoSection = (trigger: unknown, fallback: TriggerSection): TriggerSection =>
  (TRIGGER_SECTIONS as readonly string[]).includes(trigger as string) ? (trigger as TriggerSection) : fallback;

/**
 * Expand the data-driven "effect" keywords — `healer`, `producer`, `debuff`, `mover` (every
 * scope, including self), and `expel` — into the card's trigger effect arrays so the engine
 * runs them through the normal effect machinery rather than via per-keyword handlers. This is
 * the single source of truth; CardStudio performs the same migration when authoring custom
 * cards, so it is a no-op for already-migrated cards. A keyword with no explicit trigger
 * defaults to `onPlay`; `producer` always adds energy at end of turn. Triggered effects fire at the
 * OWNER's trigger only (see resolveEndOfTurn / resolveStartOfTurn).
 */
export const expandKeywordEffects = (card: Card): Card => {
  // FOUNDATION STAT CARRYOVER — a universal rule, not per-card authoring. Every Foundation
  // grants HALF its own printed stats (rounded down) to the unit bonded on top. Deriving it
  // here rather than hand-authoring `grants.stat` means custom foundations from the Card
  // Studio inherit it automatically, and it can never drift card by card.
  //
  // It is deliberately FREE in the budget (see budget.ts): you are sacrificing the body to
  // pass its abilities on, and only half the stats survive that trade — a downside being
  // partially refunded, not a bonus to charge for. A Foundation is therefore priced like a
  // regular unit carrying the same body and keywords.
  if (card.type === 'foundation') {
    const attack = Math.floor((card.attack ?? 0) / 2);
    const hp = Math.floor((card.hp ?? 0) / 2);
    return (attack > 0 || hp > 0)
      ? { ...card, grants: { ...card.grants, stat: { attack, hp } } }
      : card;
  }
  if (card.type !== 'unit') return card;
  const kw = card.keywords;
  if (!kw.healer && !kw.producer && !kw.debuff && !kw.mover && !kw.expel) return card;

  const nextKw = { ...kw } as Record<string, unknown>;
  const sections: Record<TriggerSection, Effect[]> = {
    onPlay: [...(card.onPlay ?? [])],
    onAttack: [...(card.onAttack ?? [])],
    endOfTurn: [...(card.endOfTurn ?? [])],
    startOfTurn: [...(card.startOfTurn ?? [])],
  };

  if (kw.healer) {
    sections[intoSection(kw.healer.trigger, 'onPlay')].push({ kind: 'heal', amount: kw.healer.amount, target: kw.healer.target });
    delete nextKw.healer;
  }
  if (kw.producer) {
    // `energyNext`, not `energy`: end-of-turn energy added to the current pool would be
    // wiped by beginTurn's reset, so a Producer must queue onto the owner's next turn.
    sections.endOfTurn.push({ kind: 'energyNext', amount: kw.producer.amount });
    delete nextKw.producer;
  }
  if (kw.debuff) {
    sections.onPlay.push({ kind: 'debuff', stat: { attack: kw.debuff.attack ?? 0, hp: kw.debuff.hp ?? 0 }, target: kw.debuff.target ?? 'enemy' });
    delete nextKw.debuff;
  }
  if (kw.mover) {
    sections[intoSection(kw.mover.trigger, 'onPlay')].push({ kind: 'move', target: mapMoverScope(kw.mover.scope) });
    delete nextKw.mover;
  }
  if (kw.expel) {
    sections.onPlay.push({ kind: 'expel', target: mapMoverScope(kw.expel.scope) });
    delete nextKw.expel;
  }
  return { ...card, ...sections, keywords: nextKw as Keywords };
};

export const buildRegistry = (cards: Card[], leaders: Leader[]): Registry => {
  const cardMap = new Map<string, Card>();
  // Special system cards (e.g. Null) are always available, even if not in any deck.
  for (const card of SPECIAL_CARDS) cardMap.set(card.id, expandKeywordEffects(card));
  for (const card of cards) {
    if (cardMap.has(card.id)) throw new Error(`Duplicate card id: ${card.id}`);
    cardMap.set(card.id, expandKeywordEffects(card));
  }
  const leaderMap = new Map<string, Leader>();
  for (const leader of leaders) {
    if (leaderMap.has(leader.id)) throw new Error(`Duplicate leader id: ${leader.id}`);
    leaderMap.set(leader.id, leader);
  }
  return { cards: cardMap, leaders: leaderMap };
};

export interface DeckValidationResult {
  ok: boolean;
  errors: string[];
}

/** Validate a deck against a registry. Returns all problems rather than throwing. */
export const validateDeck = (registry: Registry, data: unknown): DeckValidationResult => {
  const errors: string[] = [];

  let deck: Deck;
  try {
    deck = parseDeck(data);
  } catch (e) {
    return { ok: false, errors: [e instanceof Error ? e.message : String(e)] };
  }

  if (!registry.leaders.has(deck.leaderId)) {
    errors.push(`Unknown leader id: ${deck.leaderId}`);
  }

  const seen = new Set<string>();
  for (const entry of deck.cards) {
    if (seen.has(entry.cardId)) {
      errors.push(`Card listed more than once: ${entry.cardId}`);
    }
    seen.add(entry.cardId);

    if (!registry.cards.has(entry.cardId)) {
      errors.push(`Unknown card id: ${entry.cardId}`);
    }
    if (entry.count > RULES.MAX_COPIES) {
      errors.push(`Too many copies of ${entry.cardId} (${entry.count} > ${RULES.MAX_COPIES})`);
    }
  }

  return { ok: errors.length === 0, errors };
};

/** Expand a validated deck into a flat list of card ids (one per physical card). */
export const expandDeck = (deck: Deck): string[] =>
  deck.cards.flatMap((entry) => Array<string>(entry.count).fill(entry.cardId));
