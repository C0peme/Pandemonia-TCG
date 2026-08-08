import { describe, expect, it } from 'vitest';
import { buildRegistry } from '@cards/registry';
import { starterCards, starterLeaders } from '@cards/data/starter';
import type { Card } from '@cards/schema';
import { buyPrice, sellPrice, rollStoreOffer, combatReward, ECON } from '@adventure/economy';
import { canApply, rollEnhanceOffer } from '@adventure/enhance';

const registry = buildRegistry(starterCards, starterLeaders);

const unit = (over: Partial<Card & { type: 'unit' }>): Card => ({
  id: 'x', name: 'X', element: 'fire', tags: [], wip: false, type: 'unit',
  cost: { energy: 2 }, attack: 2, hp: 2, keywords: {},
  ...over,
} as Card);

describe('store pricing', () => {
  it('prices from energy + pips, rounded to 5', () => {
    // 25 + 15*2 = 55, off-element
    expect(buyPrice(unit({ element: 'water' }), 'fire')).toBe(55);
    // with 2 pips: 55 + 20 = 75
    expect(buyPrice(unit({ element: 'water', cost: { energy: 2, elements: [{ type: 'water', amount: 2 }] } }), 'fire')).toBe(75);
  });

  it('discounts leader-element cards 20%', () => {
    expect(buyPrice(unit({}), 'fire')).toBe(round5check(55 * 0.8));
  });

  it('never prices below the minimum', () => {
    expect(buyPrice(unit({ cost: { energy: 0 } }), 'fire')).toBeGreaterThanOrEqual(ECON.PRICE_MIN);
  });

  it('sell pays a share plus enhancement bonus', () => {
    const card = unit({ element: 'water' }); // buy 55
    expect(sellPrice(card, { uid: 'u1', cardId: 'x', enhancements: [] }, 'fire')).toBe(20);
    expect(sellPrice(card, { uid: 'u1', cardId: 'x', enhancements: [{ kind: 'cost', energy: 1 }, { kind: 'stat', attack: 1, hp: 1 }] }, 'fire')).toBe(50);
  });

  it('applies relic buy/sell multipliers', () => {
    const card = unit({ element: 'water' }); // base buy 55
    const cheaper = buyPrice(card, 'fire', { storeBuyMult: 0.75, storeSellMult: 1, enhanceDiscount: 1, extraStoreSlots: 0 });
    expect(cheaper).toBe(round5check(55 * 0.75));
    const richer = sellPrice(card, { uid: 'u1', cardId: 'x', enhancements: [] }, 'fire', { storeBuyMult: 1, storeSellMult: 1.25, enhanceDiscount: 1, extraStoreSlots: 0 });
    expect(richer).toBe(round5check(20 * 1.25));
  });
});

const round5check = (n: number): number => Math.round(n / 5) * 5;

describe('rollStoreOffer', () => {
  it('is deterministic per seed and excludes system/signature/token cards', () => {
    const a = rollStoreOffer(registry, 123, 'fire');
    expect(a).toEqual(rollStoreOffer(registry, 123, 'fire'));
    expect(a).toHaveLength(ECON.STORE_SLOTS);
    expect(new Set(a).size).toBe(a.length);
    for (const id of a) {
      expect(id.startsWith('__')).toBe(false);
      expect(id.startsWith('sig-')).toBe(false);
      expect(id.endsWith('-token')).toBe(false);
      expect(registry.cards.get(id)!.wip).toBe(false);
    }
  });

  it('biases half the stock to the leader element', () => {
    const offer = rollStoreOffer(registry, 5, 'water');
    const matched = offer.filter((id) => registry.cards.get(id)!.element === 'water');
    expect(matched.length).toBeGreaterThanOrEqual(Math.floor(ECON.STORE_SLOTS / 2));
  });

  it('adds extra slots from relics', () => {
    expect(rollStoreOffer(registry, 5, 'water', 2)).toHaveLength(ECON.STORE_SLOTS + 2);
  });

  // Regression: these three carry `tags: ['token']` but no id pattern the old filter
  // caught, so a boss's self-sacrificing Follower and a 6-energy 1/1 summon payload
  // were both purchasable — and reachable through reward picks and Rest offers too,
  // since every "give the player a card" path shares this pool.
  it('never stocks tokens, across many seeds', () => {
    const tokens = ['critter-elite', 'cult-follower', 'dead-weight'];
    for (const el of ['fire', 'water', 'nature', 'earth'] as const) {
      for (let seed = 0; seed < 200; seed++) {
        for (const id of rollStoreOffer(registry, seed, el)) expect(tokens).not.toContain(id);
      }
    }
  });

  it('every token-tagged card in the registry is excluded from the stock pool', () => {
    const tagged = [...registry.cards.values()].filter((c) => c.tags.includes('token'));
    expect(tagged.length).toBeGreaterThan(0); // guard: the tag must actually be in use
    const seen = new Set<string>();
    for (let seed = 0; seed < 300; seed++) for (const id of rollStoreOffer(registry, seed, 'fire')) seen.add(id);
    for (const c of tagged) expect(seen.has(c.id)).toBe(false);
  });
});

describe('combatReward', () => {
  it('scales with depth and act; trials/elites pay 2x, bosses pay a flat top rate', () => {
    expect(combatReward('combat', 0, 1)).toBe(ECON.COMBAT_BASE);
    expect(combatReward('combat', 3, 1)).toBeGreaterThan(combatReward('combat', 0, 1));
    // Trial and Elite both pay 2x — more than a plain battle, and equal to each other.
    expect(combatReward('trial', 3, 1)).toBeGreaterThan(combatReward('combat', 3, 1));
    expect(combatReward('elite', 3, 1)).toBe(combatReward('trial', 3, 1));
    expect(combatReward('boss', 7, 1)).toBe(ECON.BOSS_BASE);
    expect(combatReward('boss', 8, 2)).toBe(ECON.BOSS_BASE + ECON.BOSS_PER_ACT);
  });
});

describe('rollEnhanceOffer / canApply', () => {
  it('is deterministic per seed and priced from the act', () => {
    const a = rollEnhanceOffer(9, 1);
    expect(a).toEqual(rollEnhanceOffer(9, 1));
    expect(a.price).toBeGreaterThanOrEqual(ECON.ENHANCE_BASE);
    expect(rollEnhanceOffer(9, 3).price).toBeGreaterThan(a.price);
  });

  it('gates eligibility per card', () => {
    const stat = { enhancement: { kind: 'stat', attack: 1, hp: 1 }, price: 50, label: '+1/+1' } as const;
    const cost = { enhancement: { kind: 'cost', energy: 1 }, price: 60, label: 'Cost −1' } as const;
    const taunt = { enhancement: { kind: 'keyword', keywords: { taunt: true } }, price: 70, label: 'Taunt' } as const;
    // Must be a spell that still costs generic energy: ability-dense cards can now price
    // down to 0 energy + pips, and a 0-cost card has nothing for 'Cost -1' to reduce.
    const spell = registry.cards.get('wildfire-spread')!;
    const freebie = unit({ cost: { energy: 0 } });
    const taunter = unit({ keywords: { taunt: true } });
    expect(canApply(stat, spell)).toBe(false);
    expect(canApply(stat, unit({}))).toBe(true);
    expect(canApply(cost, freebie)).toBe(false);
    expect(canApply(cost, spell)).toBe(true);
    expect(canApply(taunt, taunter)).toBe(false); // already has it
    expect(canApply(taunt, unit({}))).toBe(true);
  });
});
