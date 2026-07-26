/**
 * Adventure economy: coin rewards, store pricing, and store stock.
 *
 * All tunables live in ECON (mirrors the engine's RULES style) so balance passes
 * are one-line edits. Prices derive from a card's cost (generic energy + element
 * pips), discounted when the card matches the run leader's element.
 */
import type { Card, Element } from '@cards/schema';
import type { Registry } from '@cards/registry';
import type { OwnedCard } from '@adventure/schema';
import type { AggregateMods } from '@adventure/relics';
import { makeRoller, subSeed } from '@adventure/seed';

/** The price-relevant slice of a run's aggregated relic mods. */
export type EconMods = Pick<AggregateMods, 'storeBuyMult' | 'storeSellMult' | 'enhanceDiscount' | 'extraStoreSlots'>;

export const ECON = {
  /** Coins a fresh run starts with. */
  STARTING_COINS: 60,
  /** Store pricing: base + per generic energy + per element pip. */
  PRICE_BASE: 25,
  PRICE_PER_ENERGY: 15,
  PRICE_PER_PIP: 10,
  /** Discount multiplier when the card's element matches the leader's. */
  ELEMENT_DISCOUNT: 0.8,
  PRICE_MIN: 15,
  /** Selling returns this share of the buy price (plus a bonus per enhancement). */
  SELL_RATIO: 0.4,
  SELL_PER_ENHANCEMENT: 15,
  SELL_MIN: 5,
  /** Cards on offer per store visit. */
  STORE_SLOTS: 6,
  /** Combat rewards: base + per map layer + per act. */
  COMBAT_BASE: 35,
  COMBAT_PER_LAYER: 8,
  COMBAT_PER_ACT: 15,
  /** Coin multipliers by battle kind. Trial and Elite both pay 2x: a Trial trades its
   *  card pick for a relic + double coins; an Elite is the beefier fight with 5 cards. */
  TRIAL_MULTIPLIER: 2,
  ELITE_MULTIPLIER: 2,
  BOSS_BASE: 150,
  BOSS_PER_ACT: 50,
  /** Enhancement pricing (see enhance.ts for the premium modifiers). */
  ENHANCE_BASE: 50,
  ENHANCE_PER_ACT: 25,
  /**
   * Rest Site recovery. Free (the visit itself is the cost) and expressed as a
   * fraction of max HP so it scales with any leader. Even-rounded to keep the
   * Signature threshold readable.
   */
  REST_HEAL_FRACTION: 0.3,
  /** Kindle: burns 2 owned cards for a bigger, still-free heal than plain Rest. */
  KINDLE_HEAL_FRACTION: 0.5,
  KINDLE_BURN_COUNT: 2,
  /** Rest Site attunement: base + per attune already owned. */
  TRAIN_BASE: 60,
  TRAIN_PER_LEVEL: 40,
} as const;

/** HP a Rest Site heal restores, rounded up to an even number (min 2). */
export const restHealAmount = (maxHp: number): number =>
  Math.max(2, 2 * Math.ceil((maxHp * ECON.REST_HEAL_FRACTION) / 2));

/** HP a Kindle service restores — bigger than plain Rest, paid in cards not coins. */
export const kindleHealAmount = (maxHp: number): number =>
  Math.max(2, 2 * Math.ceil((maxHp * ECON.KINDLE_HEAL_FRACTION) / 2));

/** Coin cost to attune, rising with how many attunes are already owned. */
export const attuneCost = (ownedAttunes: number): number => ECON.TRAIN_BASE + ECON.TRAIN_PER_LEVEL * ownedAttunes;

export const round5 = (n: number): number => Math.round(n / 5) * 5;

const totalPips = (card: Card): number => (card.cost.elements ?? []).reduce((sum, e) => sum + e.amount, 0);

/** Coin price to buy `card` from a store, for a run led by a `leaderElement` leader. */
export const buyPrice = (card: Card, leaderElement: Element, mods?: EconMods): number => {
  let price = ECON.PRICE_BASE + ECON.PRICE_PER_ENERGY * card.cost.energy + ECON.PRICE_PER_PIP * totalPips(card);
  if (card.element === leaderElement) price *= ECON.ELEMENT_DISCOUNT;
  price *= mods?.storeBuyMult ?? 1;
  return Math.max(ECON.PRICE_MIN, round5(price));
};

/** Coin value received when selling an owned copy (enhancements add value). */
export const sellPrice = (card: Card, owned: OwnedCard, leaderElement: Element, mods?: EconMods): number => {
  const raw = round5(ECON.SELL_RATIO * buyPrice(card, leaderElement)) + ECON.SELL_PER_ENHANCEMENT * owned.enhancements.length;
  return Math.max(ECON.SELL_MIN, round5(raw * (mods?.storeSellMult ?? 1)));
};

/** Cards a store never stocks: system cards, signatures, unfinished mechanics. */
const storeStockable = (card: Card): boolean =>
  !card.id.startsWith('__') && !card.id.startsWith('sig-') && !card.id.endsWith('-token') && !card.tags.includes('signature') && !card.wip;

/**
 * Roll a store's stock: STORE_SLOTS distinct card ids, half biased to the leader's
 * element. Fixed by the node's seed, so reloading can't reroll the shop.
 */
export const rollStoreOffer = (registry: Registry, seed: number, leaderElement: Element, extraSlots = 0): string[] => {
  const roll = makeRoller(seed);
  const slots = ECON.STORE_SLOTS + extraSlots;
  const pool = [...registry.cards.values()].filter(storeStockable);
  const matched = roll.shuffle(pool.filter((c) => c.element === leaderElement));
  const anyPool = roll.shuffle(pool);
  const picks: string[] = [];
  const take = (from: Card[], n: number): void => {
    for (const c of from) {
      if (picks.length >= n) break;
      if (!picks.includes(c.id)) picks.push(c.id);
    }
  };
  take(matched, Math.floor(slots / 2));
  take(anyPool, slots);
  return picks;
};

/**
 * Roll the card a Reforge service turns `card` into: a different card in a similar
 * total-cost band, seeded. Same stockable pool as the store.
 */
export const rollReforge = (registry: Registry, seed: number, fromCardId: string): string => {
  const roll = makeRoller(subSeed(seed, 'reforge', fromCardId));
  const cost = (c: Card): number => c.cost.energy + (c.cost.elements ?? []).reduce((s, e) => s + e.amount, 0);
  const from = registry.cards.get(fromCardId);
  const target = from ? cost(from) : 3;
  const pool = [...registry.cards.values()].filter((c) => storeStockable(c) && c.id !== fromCardId);
  const band = pool.filter((c) => Math.abs(cost(c) - target) <= 1);
  return roll.pick(band.length > 0 ? band : pool).id;
};

/**
 * Roll a single free card awarded for winning a fight — biased to the leader's
 * element, same stock pool as the store. Fixed by the node's seed.
 */
export const rollRewardCard = (registry: Registry, seed: number, leaderElement: Element): string => {
  const roll = makeRoller(subSeed(seed, 'reward'));
  const pool = [...registry.cards.values()].filter(storeStockable);
  const matched = pool.filter((c) => c.element === leaderElement);
  const from = matched.length > 0 && roll.chance(0.65) ? matched : pool;
  return roll.pick(from).id;
};

/**
 * Roll `n` distinct card choices for a combat reward — half biased to the leader's
 * element, same stockable pool. Fixed by the node's seed.
 */
export const rollRewardChoices = (registry: Registry, seed: number, leaderElement: Element, n = 3): string[] => {
  const roll = makeRoller(subSeed(seed, 'rewardchoices'));
  const pool = [...registry.cards.values()].filter(storeStockable);
  const matched = roll.shuffle(pool.filter((c) => c.element === leaderElement));
  const anyPool = roll.shuffle(pool);
  const picks: string[] = [];
  const take = (from: Card[]): void => {
    for (const c of from) {
      if (picks.length >= n) break;
      if (!picks.includes(c.id)) picks.push(c.id);
    }
  };
  take(matched.slice(0, Math.ceil(n / 2)));
  take(anyPool);
  return picks;
};

/** Coin reward for winning the fight at a map node. */
export const combatReward = (kind: 'combat' | 'trial' | 'elite' | 'boss', layer: number, act: number): number => {
  if (kind === 'boss') return ECON.BOSS_BASE + ECON.BOSS_PER_ACT * (act - 1);
  const base = ECON.COMBAT_BASE + ECON.COMBAT_PER_LAYER * layer + ECON.COMBAT_PER_ACT * (act - 1);
  const mult = kind === 'elite' ? ECON.ELITE_MULTIPLIER : kind === 'trial' ? ECON.TRIAL_MULTIPLIER : 1;
  return round5(base * mult);
};
