/**
 * Enhancement nodes: pay coins to permanently upgrade one owned copy.
 *
 * The offer (what buff is for sale) is rolled from the node's seed — fixed at map
 * generation, so reloading can't reroll it. The player then picks which owned copy
 * to apply it to; `canApply` gates eligibility per card.
 */
import type { Card } from '@cards/schema';
import type { Enhancement, OwnedCard } from '@adventure/schema';
import { ECON } from '@adventure/economy';
import { makeRoller } from '@adventure/seed';

export interface EnhanceOffer {
  enhancement: Enhancement;
  price: number;
  /** Short display label, e.g. "+1/+1" or "Grant Taunt". */
  label: string;
}

/** Keyword grants an enhancement node can offer (subset of the grantable keywords). */
const KEYWORD_ROLLS: { label: string; premium: number; keywords: Enhancement & { kind: 'keyword' } }[] = [
  { label: 'Grant Taunt', premium: 20, keywords: { kind: 'keyword', keywords: { taunt: true } } },
  { label: 'Grant Airborne', premium: 20, keywords: { kind: 'keyword', keywords: { airborne: true } } },
  { label: 'Grant Battle Ready', premium: 20, keywords: { kind: 'keyword', keywords: { battleReady: true } } },
  { label: 'Grant Tough 1', premium: 20, keywords: { kind: 'keyword', keywords: { tough: 1 } } },
  { label: 'Grant Spike 1', premium: 20, keywords: { kind: 'keyword', keywords: { spike: 1 } } },
  { label: 'Grant Growth +1/+1', premium: 20, keywords: { kind: 'keyword', keywords: { growth: { attack: 1, hp: 1 } } } },
  { label: 'Grant Lethal', premium: 30, keywords: { kind: 'keyword', keywords: { lethal: true } } },
  { label: 'Grant Double Strike', premium: 30, keywords: { kind: 'keyword', keywords: { doubleStrike: true } } },
];

const STAT_ROLLS: { attack: number; hp: number }[] = [
  { attack: 1, hp: 1 },
  { attack: 2, hp: 0 },
  { attack: 0, hp: 2 },
];

export const rollEnhanceOffer = (seed: number, act: number): EnhanceOffer => {
  const roll = makeRoller(seed);
  const price = ECON.ENHANCE_BASE + ECON.ENHANCE_PER_ACT * (act - 1);
  const r = roll.float();
  if (r < 0.45) {
    const stats = act >= 2 && roll.chance(0.25) ? { attack: 2, hp: 2 } : roll.pick(STAT_ROLLS);
    return {
      enhancement: { kind: 'stat', ...stats },
      price,
      label: `+${stats.attack}/+${stats.hp}`,
    };
  }
  if (r < 0.65) {
    return { enhancement: { kind: 'cost', energy: 1 }, price: price + 10, label: 'Cost −1 energy' };
  }
  const kw = roll.pick(KEYWORD_ROLLS);
  return { enhancement: kw.keywords, price: price + kw.premium, label: kw.label };
};

/** Can this offer be applied to this card definition? */
export const canApply = (offer: EnhanceOffer, card: Card): boolean => {
  const e = offer.enhancement;
  switch (e.kind) {
    case 'cost':
      return card.cost.energy > 0;
    case 'stat':
      return card.type === 'unit' || card.type === 'foundation';
    case 'keyword': {
      if (card.type !== 'unit' && card.type !== 'foundation') return false;
      // Don't sell a keyword the card already has.
      return Object.keys(e.keywords).every((k) => (card.keywords as Record<string, unknown>)[k] === undefined);
    }
  }
};

export const applyEnhance = (owned: OwnedCard, offer: EnhanceOffer): OwnedCard => ({
  ...owned,
  enhancements: [...owned.enhancements, offer.enhancement],
});
