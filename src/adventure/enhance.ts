/**
 * Enhancement nodes: permanently upgrade one owned copy — or duplicate one.
 *
 * The old node was a single take-it-or-leave-it offer, sold for coins. That made the
 * node's value a coin-flip on the roll: a Cost −1 in a deck of cheap units was dead
 * money, and there was no way to convert the visit into anything else. The node now
 * shows THREE offers and the working itself is FREE — the decision is which of three
 * upgrades your deck wants, not whether you can afford the one you were handed.
 *
 * The price moved to the REROLL: the first is free (so a wholly irrelevant board is
 * never a dead node), and each one after that costs more (so rerolling toward a
 * specific rare is a real, escalating expense). Coins keep their sink; it just buys
 * selection rather than the upgrade.
 *
 * OFFERS ARE DERIVED, NOT STORED. `rollEnhanceOffers(seed, act, rerolls)` is pure in
 * its three inputs, and `rerolls` is the only one the player can move — so the offers
 * survive a reload exactly as they were, and rerolling is the ONLY way to change them.
 * That is the same guarantee the single-offer version had, extended to cover rerolls.
 */
import type { Card, EffectGrantKeywords } from '@cards/schema';
import { ABILITY_INFO } from '@cards/abilities';
import type { Enhancement, OwnedCard } from '@adventure/schema';
import { ECON } from '@adventure/economy';
import { makeRoller } from '@adventure/seed';

/**
 * Rare offers are the reason to spend on a reroll: strictly bigger than any common,
 * and impossible to reach reliably in act 1 (see `rareChance`).
 */
export type EnhanceRarity = 'common' | 'rare';

interface OfferBase {
  /** Stable identity — used to keep the three offers on a node distinct. */
  id: string;
  rarity: EnhanceRarity;
  /** Short display label, e.g. "+1/+1" or "Grant Taunt". */
  label: string;
  /** One line of what it does, shown under the label. */
  blurb: string;
}

/**
 * `duplicate` is not an `Enhancement` — it adds a card to the deck rather than
 * modifying one — so the offer type is a union rather than a wrapper around
 * `Enhancement`. Anything reading an offer must branch on `sort`.
 */
export type EnhanceOffer =
  | (OfferBase & { sort: 'enhance'; enhancement: Enhancement })
  /** `full` copies the target's existing enhancements too; the common form copies the base card. */
  | (OfferBase & { sort: 'duplicate'; full: boolean });

// --- Offer pools ------------------------------------------------------------------

const stat = (id: string, attack: number, hp: number, rarity: EnhanceRarity): EnhanceOffer => ({
  sort: 'enhance', id, rarity,
  label: `+${attack}/+${hp}`,
  blurb: rarity === 'rare' ? 'A decisive stat swing on one copy.' : 'Permanent stat increase on one copy.',
  enhancement: { kind: 'stat', attack, hp },
});

const cost = (id: string, energy: number, rarity: EnhanceRarity): EnhanceOffer => ({
  sort: 'enhance', id, rarity,
  label: `Cost −${energy} energy`,
  blurb: 'Cheaper to play, every draw, for the rest of the run.',
  enhancement: { kind: 'cost', energy },
});

const kw = (
  id: string,
  label: string,
  blurb: string,
  keywords: Extract<Enhancement, { kind: 'keyword' }>['keywords'],
  rarity: EnhanceRarity,
): EnhanceOffer => ({ sort: 'enhance', id, rarity, label, blurb, enhancement: { kind: 'keyword', keywords } });

/**
 * EVERY grantable keyword, with its common (single-keyword) and rare (paired) magnitude.
 *
 * This is the one list both tiers draw from — the common tier used to be a hand-written
 * subset of nine, so half the game's abilities (Sniper, Immunity, Strike Through, True
 * Shield, Splash, Branch Shot, Overshot, Zombified, Bloodlust) could never be bought at
 * an altar at all. Labels and descriptions come from `ABILITY_INFO`, the same table the
 * card tooltips read, so an altar can never describe an ability differently from the
 * rest of the game.
 *
 * `brittle` is deliberately ABSENT. It is grantable, but "attacks once, then destroys
 * itself" is a drawback — an altar sells upgrades, and a downside dressed as one is a
 * trap, not a choice. `aquatic` is absent because the engine special-cases it (see the
 * grantable-keyword notes in `cards/schema.ts`).
 */
const GRANTABLE: { key: keyof EffectGrantKeywords; common: unknown; high?: unknown }[] = [
  { key: 'lethal', common: true },
  { key: 'overshot', common: true },
  { key: 'pierce', common: true },
  { key: 'sniper', common: true },
  { key: 'branchShot', common: true },
  { key: 'splashDamage', common: true },
  { key: 'strikeThrough', common: true },
  { key: 'doubleStrike', common: true },
  { key: 'airborne', common: true },
  { key: 'battleReady', common: true },
  { key: 'taunt', common: true },
  { key: 'trueShield', common: true },
  { key: 'immunity', common: true },
  { key: 'zombified', common: true },
  { key: 'tough', common: 1, high: 3 },
  { key: 'spike', common: 1, high: 3 },
  { key: 'growth', common: { attack: 1, hp: 1 }, high: { attack: 3, hp: 3 } },
  { key: 'bloodlust', common: { buff: { attack: 1, hp: 1 } }, high: { buff: { attack: 3, hp: 3 } } },
];

/**
 * The scalable keywords — the only ones a "high magnitude" rare can exist for. A flag
 * keyword is either present or it is not; there is no bigger Lethal, so those reach the
 * rare tier only through the PAIR route.
 */
const HIGH_MAGNITUDE = GRANTABLE.filter((g) => g.high !== undefined);
/** "Tough 2", "Growth +2/+2" — the magnitude a bare ability name would not convey. */
export const keywordLabel = (key: string, value: unknown): string => {
  const name = ABILITY_INFO[key as keyof typeof ABILITY_INFO]?.name ?? key;
  if (typeof value === 'number') return `${name} ${value}`;
  const stat = key === 'bloodlust' ? (value as { buff?: { attack?: number; hp?: number } }).buff : value;
  if (stat && typeof stat === 'object') {
    const { attack = 0, hp = 0 } = stat as { attack?: number; hp?: number };
    return `${name} +${attack}/+${hp}`;
  }
  return name;
};

const keywordBlurb = (key: string, value: unknown): string =>
  ABILITY_INFO[key as keyof typeof ABILITY_INFO]?.describe(value) ?? '';

const COMMON_OFFERS: EnhanceOffer[] = [
  stat('stat-11', 1, 1, 'common'),
  stat('stat-20', 2, 0, 'common'),
  stat('stat-02', 0, 2, 'common'),
  cost('cost-1', 1, 'common'),
  ...GRANTABLE.map((g) =>
    kw(
      `kw-${g.key}`,
      `Grant ${keywordLabel(g.key, g.common)}`,
      keywordBlurb(g.key, g.common),
      { [g.key]: g.common } as Extract<Enhancement, { kind: 'keyword' }>['keywords'],
      'common',
    ),
  ),
  { sort: 'duplicate', id: 'dup', rarity: 'common', label: 'Duplicate a card', full: false,
    blurb: 'Add a second, unenhanced copy of any card you own.' },
];

/**
 * The rare tier's headline is a PAIR of keywords — no common offer can hand a card two
 * abilities at once, so a rare reads as different in kind rather than just in size.
 *
 * The pairs are ROLLED, not authored. A fixed list of blessed combinations makes the
 * rare tier feel like a short menu you learn once; drawing two keywords from the pool
 * means a rare can surprise you, and the odd unglamorous pairing is the price of that.
 */

/**
 * Pairs where the second keyword is simply DEAD next to the first — not merely weak
 * together, but unable to fire at all. Random assortment is the point of this tier;
 * paying a rare's odds for an ability that can never trigger is not.
 *
 * Overshot sends the shot past the lane's units to the leader, so Lethal has nothing to
 * kill, Pierce no excess to carry, and Strike Through no blocker to strike through (see
 * the attack-type dispatch in `combat.ts`). Branch Shot + Splash Damage is NOT here:
 * those two compose — Splash adds its own lane's shot plus collateral, Branch adds a
 * full shot into each neighbour.
 */
const DEAD_PAIRS: [string, string][] = [
  ['overshot', 'lethal'],
  ['overshot', 'pierce'],
  ['overshot', 'strikeThrough'],
];

const isDeadPair = (a: string, b: string): boolean =>
  DEAD_PAIRS.some(([x, y]) => (a === x && b === y) || (a === y && b === x));

/**
 * Non-keyword rares: the doubled commons and the enhancement-carrying copy.
 *
 * The stat offers scale with `masterworkStep` for the same reason the keyword rares do —
 * see there. Cost and Perfect Copy do not: cost already floors at 0 (a bigger number buys
 * nothing past the second step) and Perfect Copy's value is the stack it duplicates, which
 * grows on its own as the run does.
 */
const rareFixed = (act: number): EnhanceOffer[] => {
  const s = masterworkStep(act);
  return [
    stat('rstat-33', 3 + s, 3 + s, 'rare'),
    stat('rstat-50', 5 + s, 0, 'rare'),
    stat('rstat-06', 0, 6 + s, 'rare'),
    cost('rcost-2', 2, 'rare'),
    { sort: 'duplicate', id: 'rdup', rarity: 'rare', label: 'Perfect Copy', full: true,
      blurb: 'Copy any card you own — including every enhancement already on it.' },
  ];
};

/**
 * Roll one rare keyword PAIR — both at their COMMON magnitude.
 *
 * The pair's value is breadth, not size: two abilities on one body is something no
 * common working can do, and stacking two HIGH magnitudes on top of that made a single
 * rare outweigh several commons at once. Depth is the other rare's job
 * (`rollRareHigh`), so the tier offers a real choice between wide and deep rather than
 * one offer that is simply more of everything.
 *
 * `id` is order-independent, so a row can't show the same pair twice.
 */
const rollRarePair = (roll: ReturnType<typeof makeRoller>, act = 1): EnhanceOffer => {
  // From `MASTERWORK_ACT` the pair becomes a TRIPLE — the breadth counterpart to the
  // magnitude growth on the other two rare shapes, so both halves of the tier deepen
  // together and the altar keeps pace with the enemy's Foundry.
  // Capped at a TRIPLE. Breadth is the bundle's whole value, so it does have to grow —
  // but a four-keyword working is most of a God Unit handed over in one visit, and the
  // altar is supposed to be a step on that road rather than the whole of it. Past the cap
  // the tier keeps growing through its other two shapes (magnitudes and stats).
  const want = Math.min(GRANTABLE.length, 2 + Math.min(1, masterworkStep(act)));
  const chosen: typeof GRANTABLE = [];
  let guard = 0;
  while (chosen.length < want && guard++ < 200) {
    const c = roll.pick(GRANTABLE);
    if (chosen.some((k) => k.key === c.key || isDeadPair(k.key, c.key))) continue;
    chosen.push(c);
  }
  // Exhausted the retries (practically impossible) — fall back to a combination known good.
  if (chosen.length < 2) chosen.push(GRANTABLE[0]!, GRANTABLE[2]!);
  const keys = chosen.sort((p, q) => (p.key < q.key ? -1 : 1));
  return {
    sort: 'enhance',
    id: `rkw:${keys.map((k) => k.key).join('+')}`,
    rarity: 'rare',
    label: keys.map((k) => keywordLabel(k.key, k.common)).join(' + '),
    blurb: `${keys.length} abilities at once — nothing a common working can do.`,
    enhancement: {
      kind: 'keyword',
      keywords: Object.fromEntries(keys.map((k) => [k.key, k.common])) as Extract<Enhancement, { kind: 'keyword' }>['keywords'],
    },
  };
};

/**
 * Roll one rare SINGLE keyword at high magnitude — Tough 3, Growth +3/+3.
 *
 * The depth counterpart to the pair: one ability, but at a size no common sells. Only
 * the scalable keywords can appear here (see `HIGH_MAGNITUDE`).
 */
const rollRareHigh = (roll: ReturnType<typeof makeRoller>, act = 1): EnhanceOffer => {
  const g = roll.pick(HIGH_MAGNITUDE);
  const value = scaleKeywordValue(g.high, masterworkStep(act));
  return {
    sort: 'enhance',
    id: `rkwhi:${g.key}`,
    rarity: 'rare',
    label: `Grant ${keywordLabel(g.key, value)}`,
    blurb: `${keywordBlurb(g.key, value)} At a magnitude no ordinary working reaches.`,
    enhancement: {
      kind: 'keyword',
      keywords: { [g.key]: value } as Extract<Enhancement, { kind: 'keyword' }>['keywords'],
    },
  };
};

/**
 * How far past the printed rare magnitude this act's altar reaches.
 *
 * The rare tier used to be frozen — Tough 3, Growth +3/+3, +3/+3, two-keyword pairs, at
 * act 1 and at act 12 alike — so the one node whose entire job is making your deck better
 * stopped mattering exactly when the enemy's Foundry started compounding. The altar now
 * deepens with the run: it is always the best working available, and a shop selling three
 * commons on one body (breadth, for coins) never overtakes it (depth, free).
 *
 * Steps EVERY act from `MASTERWORK_ACT`, so clearing an act is itself the upgrade — the
 * altar you walk into next act is visibly better than the one you left. A slower cadence
 * (this was every three acts) meant two acts out of every three changed nothing here, and
 * an act that changes nothing is an act that does not feel like progress.
 *
 * It opens one act BEFORE the enemy's Foundry does (`FOUNDRY_START_ACT`, 4), so the player
 * gets the first move on the curve and the enemy then out-accelerates them.
 */
export const MASTERWORK_ACT = 3;
export const masterworkStep = (act: number): number => Math.max(0, act - MASTERWORK_ACT + 1);

/** Grow a keyword payload by `step` — a magnitude, a StatMod, or Bloodlust's buff. */
const scaleKeywordValue = (value: unknown, step: number): unknown => {
  if (step <= 0) return value;
  if (typeof value === 'number') return value + step;
  if (value && typeof value === 'object') {
    const v = value as { attack?: number; hp?: number; buff?: { attack?: number; hp?: number } };
    if (v.buff) return { buff: { attack: (v.buff.attack ?? 0) + step, hp: (v.buff.hp ?? 0) + step } };
    return { attack: (v.attack ?? 0) + step, hp: (v.hp ?? 0) + step };
  }
  return value;
};

/**
 * One rare offer, of three kinds: a keyword PAIR at common magnitudes (wide), a SINGLE
 * keyword at high magnitude (deep), or one of the fixed rares (stat/cost/Perfect Copy).
 */
const rollRare = (roll: ReturnType<typeof makeRoller>, act = 1): EnhanceOffer => {
  const r = roll.float();
  if (r < ECON.ENHANCE_RARE_PAIR_SHARE) return rollRarePair(roll, act);
  if (r < ECON.ENHANCE_RARE_PAIR_SHARE + ECON.ENHANCE_RARE_HIGH_SHARE) return rollRareHigh(roll, act);
  return roll.pick(rareFixed(act));
};

/**
 * One COMMON enhancement, for stock that arrives at a shop already worked on.
 *
 * Deliberately drawn from the common pool only: a shop must not become a second, cheaper
 * source of rare workings, which are the enhance altar's reason to exist. Duplicate is
 * excluded too — it is an action on a card you own, not a property a shop copy can have.
 */
/**
 * One enhancement, in the player's words — "+2/+2", "Cost −1", "Taunt".
 *
 * Shared so the shop sticker, the altar row and the card's own text all name an
 * enhancement identically; they had begun to drift into three private spellings.
 */
export const enhancementLabel = (e: Enhancement): string => {
  if (e.kind === 'stat') return `+${e.attack}/+${e.hp}`;
  if (e.kind === 'cost') return `Cost −${e.energy}`;
  return Object.entries(e.keywords).map(([k, v]) => keywordLabel(k, v)).join(' + ');
};

export const rollShopEnhancement = (roll: ReturnType<typeof makeRoller>): Enhancement => {
  const pool = COMMON_OFFERS.filter((o): o is Extract<EnhanceOffer, { sort: 'enhance' }> => o.sort === 'enhance');
  return roll.pick(pool).enhancement;
};

/**
 * One working for the enemy's Foundry, rare with probability `rareChance`.
 *
 * Draws from the same two pools the altar sells from — the enemy is running the player's
 * machinery, not a private table, which is the point of the whole system — minus the
 * `duplicate` offers, which are an action on a deck rather than a property of a card.
 */
export const rollFoundryEnhancement = (
  roll: ReturnType<typeof makeRoller>,
  rareChanceNow: number,
  act = 1,
): Enhancement => {
  // The act is threaded through so the enemy's rares scale on the same `masterworkStep`
  // curve the altar's do. Without it the Foundry drew base-magnitude rares forever while
  // the player's altar deepened every act, which is the opposite of the intended race.
  const offer = roll.chance(rareChanceNow) ? rollRare(roll, act) : roll.pick(COMMON_OFFERS);
  if (offer.sort === 'enhance') return offer.enhancement;
  // A `duplicate` came up: fall back to a plain stat working rather than re-rolling, so
  // the draw count stays exactly one per call and `foundryStack`'s prefix property holds.
  return { kind: 'stat', attack: 1, hp: 1 };
};

/**
 * Odds any one of the three slots rolls rare. Deliberately near-zero in act 1: the
 * early game is supposed to be the easy, ordinary part of the run (see `encounters.ts`),
 * and a turn-1 Perfect Copy of a bomb would flatten exactly the curve that was retuned.
 */
export const rareChance = (act: number): number =>
  Math.min(ECON.ENHANCE_RARE_MAX, ECON.ENHANCE_RARE_BASE + ECON.ENHANCE_RARE_PER_ACT * (act - 1));

/**
 * The three offers shown at a node. Distinct by `id`, so a reroll never shows the same
 * upgrade twice in one row.
 */
export const rollEnhanceOffers = (seed: number, act: number, rerolls = 0): EnhanceOffer[] => {
  // The reroll count is folded into the seed, so each reroll is a genuinely fresh draw
  // that is still reproducible from stored state alone.
  const roll = makeRoller(seed + rerolls * 7919);
  const p = rareChance(act);
  const out: EnhanceOffer[] = [];
  let guard = 0;
  while (out.length < ECON.ENHANCE_OFFERS && guard++ < 200) {
    const pick = roll.chance(p) ? rollRare(roll, act) : roll.pick(COMMON_OFFERS);
    if (!out.some((o) => o.id === pick.id)) out.push(pick);
  }
  return out;
};

/**
 * What the NEXT reroll costs. The first is free — a row of three irrelevant offers
 * should never be a dead node just because the run is broke — and every one after that
 * escalates, so chasing a specific rare has a real price.
 */
export const rerollCost = (rerollsUsed: number): number =>
  rerollsUsed <= 0 ? 0 : ECON.ENHANCE_REROLL_BASE + ECON.ENHANCE_REROLL_STEP * (rerollsUsed - 1);

/** Can this offer be applied to this card definition? */
export const canApply = (offer: EnhanceOffer, card: Card): boolean => {
  // Any owned card can be copied, spells and environments included.
  if (offer.sort === 'duplicate') return true;
  const e = offer.enhancement;
  switch (e.kind) {
    case 'cost':
      return card.cost.energy > 0;
    case 'stat':
      return card.type === 'unit' || card.type === 'foundation';
    case 'keyword': {
      if (card.type !== 'unit' && card.type !== 'foundation') return false;
      // Don't sell a keyword the card already has. For a rare PAIR this means every
      // keyword in the pair must be new — half a rare is not what was advertised.
      return Object.keys(e.keywords).every((k) => (card.keywords as Record<string, unknown>)[k] === undefined);
    }
  }
};

export const applyEnhance = (owned: OwnedCard, enhancement: Enhancement): OwnedCard => ({
  ...owned,
  enhancements: [...owned.enhancements, enhancement],
});
