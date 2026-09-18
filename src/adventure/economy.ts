/**
 * Adventure economy: coin rewards, store pricing, and store stock.
 *
 * All tunables live in ECON (mirrors the engine's RULES style) so balance passes
 * are one-line edits. Prices derive from a card's cost (generic energy + element
 * pips), discounted when the card matches the run leader's element.
 */
import type { Card, Element } from '@cards/schema';
import type { Registry } from '@cards/registry';
import type { Enhancement, OwnedCard } from '@adventure/schema';
import type { AggregateMods } from '@adventure/relics';
import type { RelicRarity } from '@adventure/data/relics';
import { makeRoller, subSeed } from '@adventure/seed';
import { rollShopEnhancement } from '@adventure/enhance';

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
  /**
   * ORDINARY relics on a store's shelf, on top of the one cursed relic every store
   * stocks (see `rollStoreRelics`). Relics used to be unbuyable, which left coins with
   * only two sinks — cards and rerolls — and made a late-run purse largely decorative.
   */
  STORE_RELIC_SLOTS: 2,
  /**
   * Relic prices by band. A cursed relic is the CHEAPEST thing on the shelf and the
   * strongest: that inversion is the whole pitch — the price you actually pay for it is
   * written on the relic, not on the tag.
   */
  RELIC_PRICE: { common: 140, rare: 300, boss: 600, cursed: 110 },
  /**
   * Cost to UNBIND a relic — the run's only relic-removal mechanism.
   *
   * Relics were previously permanent, which is fine while every relic is an upgrade and
   * badly wrong the moment one can be an anti-synergy: a draw engine in a deliberately
   * thin deck mills its owner out faster every turn, and nothing in the run could undo
   * that. Removal exists so a relic that stops fitting the run is a decision rather than
   * a sentence.
   *
   * It COSTS rather than pays, and the price rises with the band, which is what keeps
   * the rest of the table honest:
   *  - a common or rare that no longer fits is cheap to shed, because you are already
   *    losing whatever it was worth;
   *  - a boss relic is dear, because throwing away what a boss fight paid for should
   *    feel like it;
   *  - a CURSED relic is dearest of all. A curse is a bargain you agreed to, and buying
   *    your way out of one has to be a real act — otherwise every curse becomes "take
   *    the benefit, pay a small fee, keep the benefit", which is not a trade at all.
   */
  RELIC_UNBIND_PRICE: { common: 80, rare: 150, boss: 300, cursed: 400 },
  /**
   * Shop rerolls. Unlike the enhance altar's first-is-free reroll, the shop charges from
   * the first: an altar hands you one working and the reroll is how you make it relevant,
   * whereas a shop already gave you six choices.
   */
  STORE_REROLL_BASE: 50,
  STORE_REROLL_STEP: 25,
  /** Per-visit price cuts: how often a slot is discounted, and by how much. */
  STORE_DISCOUNT_CHANCE: 0.25,
  STORE_DISCOUNT_STEPS: [0.75, 0.6, 0.5],
  /** Odds a slot arrives pre-enhanced, by act, and the premium such a copy costs. */
  STORE_ENHANCED_BASE: 0.07,
  STORE_ENHANCED_PER_ACT: 0.07,
  STORE_ENHANCED_MAX: 0.4,
  STORE_ENHANCED_PREMIUM: 1.6,
  /**
   * How deep a worked shop copy can go, and how fast it gets there. The shop's axis is
   * BREADTH (several commons on one body) against the altar's DEPTH (rare workings that
   * deepen every act) — see `StoreSlot.enhancements`.
   */
  STORE_ENHANCED_DEPTH_MAX: 4,
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
  /**
   * Enhancement nodes. The upgrade itself is FREE — coins buy SELECTION instead: the
   * first reroll is free, each one after escalates. `ENHANCE_BASE`/`ENHANCE_PER_ACT`
   * are gone with the per-upgrade price they set.
   */
  ENHANCE_OFFERS: 3,
  ENHANCE_REROLL_BASE: 40,
  ENHANCE_REROLL_STEP: 30,
  /** Odds one offer slot rolls RARE, by act. Near-zero in act 1 by design. */
  ENHANCE_RARE_BASE: 0.06,
  ENHANCE_RARE_PER_ACT: 0.09,
  ENHANCE_RARE_MAX: 0.45,
  /**
   * How the rare tier splits: a keyword PAIR at common magnitudes (wide), a SINGLE
   * keyword at high magnitude (deep), and the remainder the fixed stat/cost/copy rares.
   */
  ENHANCE_RARE_PAIR_SHARE: 0.5,
  ENHANCE_RARE_HIGH_SHARE: 0.25,
  /**
   * Rest Site recovery. Free (the visit itself is the cost) and expressed as a
   * fraction of max HP so it scales with any leader. Even-rounded to keep the
   * Signature threshold readable.
   */
  REST_HEAL_FRACTION: 0.3,
  /** Kindle: burns 2 owned cards for a bigger, still-free heal than plain Rest. */
  KINDLE_HEAL_FRACTION: 0.5,
  KINDLE_BURN_COUNT: 2,
  /**
   * Post-battle recovery. Every won battle heals this much, before any Mend upgrades.
   * Adventure is an attrition run and always will be — this doesn't remove the attrition,
   * it sets the rate, so a clean win is no longer indistinguishable from a pyrrhic one and
   * chip damage from an early fight can't quietly end the run six nodes later.
   *
   * Capped at `maxHp` (see `resolveCombat`) — it tops up a wound, it does not overheal.
   * TEMPORARY HP stays Rest's payoff, not a side effect of winning: only
   * `restHeal`/`restKindle` can push `hp` above `maxHp`, which is what makes Rest worth
   * visiting even at full health instead of being dominated by the next win.
   *
   * Raised 5 -> 10. At 5 the run was a one-way bleed between Rest nodes: measured HP lost
   * per fight ran 6-8 in the early acts, so a clean win still left the player worse off
   * and attrition, not any single fight, was ending runs. Winning should now roughly
   * break even on an ordinary fight and the damage should come from the hard ones.
   */
  VICTORY_HEAL_BASE: 10,
  /** Each Mend taken at a Rest Site raises the per-battle heal by this much, permanently. */
  MEND_HEAL_STEP: 5,
  /**
   * Overheal ceiling as a multiple of max HP. Healing past max is kept as TEMPORARY HP —
   * real HP that simply sits above the maximum and is never topped back up once spent (the
   * engine's in-fight `healLeader` still clamps at max). Capped so a long clean streak
   * can't compound into an unloseable buffer. Only Rest/Kindle can reach this ceiling —
   * the post-battle heal clamps at `maxHp` instead (see `VICTORY_HEAL_BASE`).
   */
  OVERHEAL_MULT: 1.5,
  /**
   * Max HP gained on clearing an act (and healed by the same amount, so the player does
   * not start the new act wounded). Deliberately also raises the SIGNATURE THRESHOLD,
   * which is half of max HP computed live — the comeback valve stays proportional to the
   * pool rather than becoming trivial to reach as HP grows.
   */
  ACT_MAX_HP_GAIN: 10,
  /**
   * Floor on deck size when selling. Selling is unlimited per shop visit (the shop IS
   * Adventure's card-removal mechanism), so without a real floor a run could sell itself
   * down to a single card and become unplayable.
   */
  MIN_DECK_SIZE: 5,
  /**
   * Copper Mech damage milestones, as PERCENTAGES of its HP. Each pays a boss-tier relic
   * once per run. Deliberately starting at 20% rather than 25% so a first, underprepared
   * probe can still bank something — which is what makes attempting it early a real play
   * rather than a wasted trip.
   */
  COPPER_TIERS: [20, 40, 60, 80],
  /**
   * Coins charged per Copper Mech attempt. Losing already rerolls the current act, so this
   * is a modest toll rather than the real price — enough that infinite free probing is not
   * simply optimal.
   */
  COPPER_ATTEMPT_COST: 40,
  /** Rest Site attunement: base + per attune already owned. */
  TRAIN_BASE: 60,
  TRAIN_PER_LEVEL: 40,
  /** Attune price multiplier per point of existing cap. See `attuneCost`. */
  ATTUNE_GROWTH: 1.7,
} as const;

/** HP a Rest Site heal restores, rounded up to an even number (min 2). */
export const restHealAmount = (maxHp: number): number =>
  Math.max(2, 2 * Math.ceil((maxHp * ECON.REST_HEAL_FRACTION) / 2));

/** HP a Kindle service restores — bigger than plain Rest, paid in cards not coins. */
export const kindleHealAmount = (maxHp: number): number =>
  Math.max(2, 2 * Math.ceil((maxHp * ECON.KINDLE_HEAL_FRACTION) / 2));

/** HP a battle win restores, given how many Mend upgrades the run has taken. */
export const victoryHealAmount = (mendLevel: number): number =>
  ECON.VICTORY_HEAL_BASE + ECON.MEND_HEAL_STEP * Math.max(0, mendLevel);

/**
 * The absolute HP ceiling for a run — max HP plus the temporary-HP headroom above it.
 * `maxHp` remains the leader's real total (the Signature threshold is half of THAT, and
 * must not drift), so this is a run-layer cap only.
 */
export const hpCeiling = (maxHp: number): number => Math.floor(maxHp * ECON.OVERHEAL_MULT);

/** Coin cost to attune, rising with how many attunes are already owned. */
/** What the NEXT shop reroll costs. Escalates, so restocking repeatedly is a real drain. */
export const storeRerollCost = (rerollsUsed: number): number =>
  ECON.STORE_REROLL_BASE + ECON.STORE_REROLL_STEP * Math.max(0, rerollsUsed);

/**
 * Price of raising ONE element's banking cap by 1, from its CURRENT cap.
 *
 * Priced off the cap itself rather than a count of attunes bought, and unlimited: with
 * enhancements now free, a single +1 cap gated behind a whole node visit was the weakest
 * thing an Enhance node could offer. Attuning no longer consumes the visit — it is a pure
 * coin sink, and the escalating price is the only limit. Growth is steep on purpose: a
 * deep cap is a run-defining engine, so the fifth point should cost many fights' takings.
 */
export const attuneCost = (currentCap: number): number =>
  round5(ECON.TRAIN_BASE * Math.pow(ECON.ATTUNE_GROWTH, Math.max(0, currentCap)));

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
 * One slot of a store's stock. This used to be a bare card id, which left the shop as
 * the one node whose offer never varied: the same six cards at the same six prices every
 * visit, all run long. A slot now carries its own per-visit price multiplier and, in
 * later acts, an enhancement already worked into the copy — so two stores stocking the
 * same card are no longer the same offer.
 */
export interface StoreSlot {
  cardId: string;
  /** Per-visit multiplier on this slot's price. 1 = ordinary stock. */
  discount: number;
  /**
   * Workings already applied to this copy. Each costs a premium, and how MANY a slot can
   * carry rises with the act (`storeEnhancedDepth`).
   *
   * This is the shop's half of the "both curves scale" split: a shop sells BREADTH —
   * two or three common workings already on one body, for real coins — while the altar
   * sells DEPTH, rare workings that get deeper every act, for free. Neither overtakes the
   * other, and the shop can hand you a half-built God Unit without ever being the cheaper
   * route to a rare, which is the rule the commons-only pool has always enforced.
   */
  enhancements?: Enhancement[];
}

export interface StoreOfferOpts {
  /** Extra slots from relics (`extraStoreSlots`). */
  extraSlots?: number;
  /** Current act — drives how often stock arrives pre-enhanced. */
  act?: number;
  /** Rerolls bought at this node; folded into the seed so each redraw is fresh. */
  rerolls?: number;
}

/** Odds one slot arrives pre-enhanced. Near-zero in act 1, like the enhance altar's rares. */
export const storeEnhancedChance = (act: number): number =>
  Math.min(ECON.STORE_ENHANCED_MAX, ECON.STORE_ENHANCED_BASE + ECON.STORE_ENHANCED_PER_ACT * (act - 1));

/**
 * The MOST workings one worked slot may carry at this act — 1 in act 1, one more EVERY
 * act, up to `STORE_ENHANCED_DEPTH_MAX`. A slot rolls uniformly in `[1, this]`, so the
 * shelf holds a spread rather than every enhanced copy being maxed out.
 *
 * Per-act rather than per-few-acts so that reaching a new act visibly changes what is on
 * the shelf. The shop saturates early by design — its ceiling is what keeps it the
 * BREADTH node — and the altar (`masterworkStep`) is the curve that carries the late run.
 */
export const storeEnhancedDepth = (act: number): number =>
  Math.min(ECON.STORE_ENHANCED_DEPTH_MAX, act);

/**
 * Roll a store's stock: STORE_SLOTS distinct cards, half biased to the leader's element.
 *
 * Fixed by `(seed, opts)` and derived rather than stored — the same guarantee the
 * enhance altar has. `rerolls` is the only input the player can move, so reloading can
 * never reroll the shop but paying for a reroll can.
 */
export const rollStoreOffer = (
  registry: Registry,
  seed: number,
  leaderElement: Element,
  opts: StoreOfferOpts = {},
): StoreSlot[] => {
  const { extraSlots = 0, act = 1, rerolls = 0 } = opts;
  const roll = makeRoller(seed + rerolls * 6151);
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

  const enhancedChance = storeEnhancedChance(act);
  return picks.map((cardId) => {
    const card = registry.cards.get(cardId);
    const slot: StoreSlot = { cardId, discount: 1 };
    if (roll.chance(ECON.STORE_DISCOUNT_CHANCE)) {
      // Round to a readable step so the sticker says "-40%", not "-37.2%".
      const steps = ECON.STORE_DISCOUNT_STEPS;
      slot.discount = steps[roll.int(steps.length)]!;
    }
    // Only units and foundations have stats or grantable keywords to enhance, and the
    // enhancement is rolled from the same common pool the altar sells — a shop must not
    // become a second, cheaper source of rare workings.
    if ((card?.type === 'unit' || card?.type === 'foundation') && roll.chance(enhancedChance)) {
      // How deep a worked copy goes is its own roll, so a late-act shelf holds a mix of
      // one-, two- and three-working bodies rather than every enhanced slot being maxed.
      const depth = 1 + roll.int(storeEnhancedDepth(act));
      slot.enhancements = Array.from({ length: depth }, () => rollShopEnhancement(roll));
    }
    return slot;
  });
};

/** Coin price of a relic on a store's shelf, after any store-price relic mods. */
export const relicPrice = (rarity: RelicRarity, mods?: EconMods): number =>
  Math.max(ECON.PRICE_MIN, round5(ECON.RELIC_PRICE[rarity] * (mods?.storeBuyMult ?? 1)));

/** Coin cost to unbind (permanently discard) an owned relic. See `RELIC_UNBIND_PRICE`. */
export const relicUnbindCost = (rarity: RelicRarity, mods?: EconMods): number =>
  Math.max(ECON.PRICE_MIN, round5(ECON.RELIC_UNBIND_PRICE[rarity] * (mods?.storeBuyMult ?? 1)));

/** Price of one store slot, including its per-visit discount and enhanced premium. */
export const slotPrice = (card: Card, slot: StoreSlot, leaderElement: Element, mods?: EconMods): number => {
  const base = buyPrice(card, leaderElement, mods) * slot.discount;
  // The premium COMPOUNDS per working, so a three-working body is priced as the three
  // separate upgrades it is rather than as one flat "enhanced" sticker — which is what
  // keeps a deep shop copy from being strictly better value than a shallow one.
  const premium = ECON.STORE_ENHANCED_PREMIUM ** (slot.enhancements?.length ?? 0);
  return Math.max(ECON.PRICE_MIN, round5(base * premium));
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
