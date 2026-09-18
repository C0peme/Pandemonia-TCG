import { describe, expect, it } from 'vitest';
import { buildRegistry } from '@cards/registry';
import { starterCards, starterLeaders } from '@cards/data/starter';
import type { Card } from '@cards/schema';
<<<<<<< Updated upstream
import { buyPrice, sellPrice, rollStoreOffer, rollReforge, combatReward, ECON } from '@adventure/economy';
import { canApply, rollEnhanceOffer } from '@adventure/enhance';
=======
import { buyPrice, sellPrice, rollStoreOffer, slotPrice, storeRerollCost, combatReward, ECON } from '@adventure/economy';
import { canApply, rollEnhanceOffers, rerollCost, masterworkStep, MASTERWORK_ACT } from '@adventure/enhance';
>>>>>>> Stashed changes

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
  const ids = (slots: { cardId: string }[]): string[] => slots.map((s) => s.cardId);

  it('is deterministic per seed and excludes system/signature/token cards', () => {
    const a = rollStoreOffer(registry, 123, 'fire');
    expect(a).toEqual(rollStoreOffer(registry, 123, 'fire'));
    expect(a).toHaveLength(ECON.STORE_SLOTS);
    expect(new Set(ids(a)).size).toBe(a.length);
    for (const id of ids(a)) {
      expect(id.startsWith('__')).toBe(false);
      expect(id.startsWith('sig-')).toBe(false);
      expect(id.endsWith('-token')).toBe(false);
      expect(registry.cards.get(id)!.wip).toBe(false);
    }
  });

  it('biases half the stock to the leader element', () => {
    const offer = rollStoreOffer(registry, 5, 'water');
    const matched = ids(offer).filter((id) => registry.cards.get(id)!.element === 'water');
    expect(matched.length).toBeGreaterThanOrEqual(Math.floor(ECON.STORE_SLOTS / 2));
  });

  it('adds extra slots from relics', () => {
    expect(rollStoreOffer(registry, 5, 'water', { extraSlots: 2 })).toHaveLength(ECON.STORE_SLOTS + 2);
  });
});

<<<<<<< Updated upstream
describe('rollReforge', () => {
  it('is deterministic, differs from the source, and stays in a similar cost band', () => {
    const from = 'coal-runner';
    const out = rollReforge(registry, 42, from);
    expect(out).toEqual(rollReforge(registry, 42, from));
    expect(out).not.toBe(from);
    const cost = (id: string): number => {
      const c = registry.cards.get(id)!;
      return c.cost.energy + (c.cost.elements ?? []).reduce((s, e) => s + e.amount, 0);
    };
    expect(Math.abs(cost(out) - cost(from))).toBeLessThanOrEqual(1);
=======
  // Regression: these three carry `tags: ['token']` but no id pattern the old filter
  // caught, so a boss's self-sacrificing Follower and a 6-energy 1/1 summon payload
  // were both purchasable — and reachable through reward picks and Rest offers too,
  // since every "give the player a card" path shares this pool.
  it('never stocks tokens, across many seeds', () => {
    const tokens = ['critter-elite', 'cult-follower', 'dead-weight'];
    for (const el of ['fire', 'water', 'nature', 'earth'] as const) {
      for (let seed = 0; seed < 200; seed++) {
        for (const id of ids(rollStoreOffer(registry, seed, el))) expect(tokens).not.toContain(id);
      }
    }
  });

  it('every token-tagged card in the registry is excluded from the stock pool', () => {
    const tagged = [...registry.cards.values()].filter((c) => c.tags.includes('token'));
    expect(tagged.length).toBeGreaterThan(0); // guard: the tag must actually be in use
    const seen = new Set<string>();
    for (let seed = 0; seed < 300; seed++) for (const id of ids(rollStoreOffer(registry, seed, 'fire'))) seen.add(id);
    for (const c of tagged) expect(seen.has(c.id)).toBe(false);
>>>>>>> Stashed changes
  });
});

/**
 * Per-visit variety. The shop shipped as the one node whose offer never varied: the same
 * six cards at the same six prices, every visit, all run long.
 */
describe('store slots: discounts, pre-enhanced stock, restock', () => {
  it('discounts some slots and leaves most at full price', () => {
    let discounted = 0, total = 0;
    for (let seed = 0; seed < 400; seed++) {
      for (const slot of rollStoreOffer(registry, seed, 'fire')) {
        total++;
        if (slot.discount < 1) { discounted++; expect(ECON.STORE_DISCOUNT_STEPS).toContain(slot.discount); }
      }
    }
    const rate = discounted / total;
    expect(rate).toBeGreaterThan(0.1);
    expect(rate).toBeLessThan(0.45);
  });

  it('a discount actually lowers the price, and never below the floor', () => {
    const card = registry.cards.get('magma-brute')!;
    const full = slotPrice(card, { cardId: card.id, discount: 1 }, 'fire');
    const half = slotPrice(card, { cardId: card.id, discount: 0.5 }, 'fire');
    expect(half).toBeLessThan(full);
    expect(half).toBeGreaterThanOrEqual(ECON.PRICE_MIN);
  });

  it('pre-enhanced stock is rare early, commoner later, and never a spell', () => {
    const rate = (act: number): number => {
      let enh = 0, total = 0;
      for (let seed = 0; seed < 400; seed++) {
        for (const slot of rollStoreOffer(registry, seed, 'fire', { act })) {
          total++;
          if (!slot.enhancements?.length) continue;
          enh++;
          // Only units/foundations have stats or grantable keywords.
          const type = registry.cards.get(slot.cardId)!.type;
          expect(type === 'unit' || type === 'foundation', slot.cardId).toBe(true);
        }
      }
      return enh / total;
    };
    expect(rate(1)).toBeLessThan(0.12);
    expect(rate(5)).toBeGreaterThan(rate(1));
  });

  it('an enhanced copy costs a premium over the same card plain', () => {
    const card = registry.cards.get('magma-brute')!;
    const plain = slotPrice(card, { cardId: card.id, discount: 1 }, 'fire');
    const one = slotPrice(card, { cardId: card.id, discount: 1, enhancements: [{ kind: 'stat', attack: 1, hp: 1 }] }, 'fire');
    expect(one).toBeGreaterThan(plain);
    // The premium COMPOUNDS: a three-working body is priced as the three upgrades it is,
    // so a deep copy is never better value per working than a shallow one.
    const three = slotPrice(card, { cardId: card.id, discount: 1, enhancements: [
      { kind: 'stat', attack: 1, hp: 1 }, { kind: 'stat', attack: 1, hp: 1 }, { kind: 'stat', attack: 1, hp: 1 },
    ] }, 'fire');
    expect(three).toBeGreaterThan(one);
    expect(three / plain).toBeGreaterThan(one / plain);
  });

  it('shop stock never arrives carrying a RARE working', () => {
    // The altar's rares are its reason to exist; a shop must not undercut it. Every
    // shop enhancement is a single common — never a rare pair or a doubled stat.
    for (let seed = 0; seed < 600; seed++) {
      for (const slot of rollStoreOffer(registry, seed, 'fire', { act: 6 })) {
        for (const e of slot.enhancements ?? []) {
          // Depth is the shop's axis and is allowed to grow; the RARITY of each individual
          // working is not — that is still the altar's alone.
          if (e.kind === 'keyword') expect(Object.keys(e.keywords).length, JSON.stringify(e)).toBe(1);
          if (e.kind === 'stat') expect(e.attack + e.hp).toBeLessThanOrEqual(2);
          if (e.kind === 'cost') expect(e.energy).toBe(1);
        }
      }
    }
  });

  it('a restock genuinely changes the stock, and is reproducible', () => {
    const before = rollStoreOffer(registry, 77, 'fire', { rerolls: 0 }).map((s) => s.cardId).join();
    const after = rollStoreOffer(registry, 77, 'fire', { rerolls: 1 }).map((s) => s.cardId).join();
    expect(after).not.toBe(before);
    expect(rollStoreOffer(registry, 77, 'fire', { rerolls: 1 }).map((s) => s.cardId).join()).toBe(after);
  });

  it('restock prices escalate, and cost from the very first one', () => {
    // Unlike the enhance altar (first reroll free), a shop already gave six choices.
    expect(storeRerollCost(0)).toBeGreaterThan(0);
    expect(storeRerollCost(1)).toBeGreaterThan(storeRerollCost(0));
    expect(storeRerollCost(2)).toBeGreaterThan(storeRerollCost(1));
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

describe('rollEnhanceOffers / rerollCost / canApply', () => {
  it('shows three distinct offers, deterministic per (seed, act, rerolls)', () => {
    const a = rollEnhanceOffers(9, 1);
    expect(a).toHaveLength(ECON.ENHANCE_OFFERS);
    expect(a).toEqual(rollEnhanceOffers(9, 1));
    expect(new Set(a.map((o) => o.id)).size).toBe(a.length);
  });

  it('a reroll actually changes the row, and stays reproducible', () => {
    const before = rollEnhanceOffers(9, 3, 0).map((o) => o.id).join();
    const after = rollEnhanceOffers(9, 3, 1).map((o) => o.id).join();
    expect(after).not.toBe(before);
    expect(rollEnhanceOffers(9, 3, 1).map((o) => o.id).join()).toBe(after);
  });

  it('makes the first reroll free and escalates from there', () => {
    expect(rerollCost(0)).toBe(0);
    expect(rerollCost(1)).toBeGreaterThan(0);
    expect(rerollCost(2)).toBeGreaterThan(rerollCost(1));
  });

  it('keeps rares rare early and more common later', () => {
    const rareRate = (act: number): number => {
      let rare = 0, total = 0;
      for (let seed = 0; seed < 300; seed++) {
        for (const o of rollEnhanceOffers(seed, act)) { total++; if (o.rarity === 'rare') rare++; }
      }
      return rare / total;
    };
    expect(rareRate(1)).toBeLessThan(0.15);
    expect(rareRate(4)).toBeGreaterThan(rareRate(1));
  });

  it('offers EVERY grantable ability at common, not a hand-picked nine', () => {
    // The common tier shipped as a hand-written subset, so Sniper, Immunity, Strike
    // Through, True Shield, Splash, Branch Shot, Overshot, Zombified and Bloodlust could
    // never be bought at an altar at all.
    const labels = new Set<string>();
    for (let seed = 0; seed < 4000; seed++) {
      for (const o of rollEnhanceOffers(seed, 1)) if (o.rarity === 'common') labels.add(o.label);
    }
    const expected = [
      'Lethal', 'Overshot', 'Pierce', 'Sniper', 'Branch Shot', 'Splash DMG', 'Strike Through',
      'Double Strike', 'Airborne', 'Battle Ready', 'Taunt', 'True Shield', 'Immunity',
      'Zombified', 'Tough 1', 'Spike 1', 'Growth +1/+1', 'Bloodlust +1/+1',
    ];
    for (const name of expected) expect(labels.has(`Grant ${name}`), name).toBe(true);
  });

  it('never sells a drawback as an upgrade', () => {
    // Brittle is grantable, but "attacks once, then destroys itself" is a downside — an
    // altar that sold it would be a trap wearing an upgrade's clothes.
    for (let seed = 0; seed < 2000; seed++) {
      for (const o of rollEnhanceOffers(seed, 5)) {
        if (o.sort !== 'enhance' || o.enhancement.kind !== 'keyword') continue;
        expect(Object.keys(o.enhancement.keywords), o.label).not.toContain('brittle');
      }
    }
  });

  it('rolls rare keyword pairs rather than serving a fixed short menu', () => {
    const labels = new Set<string>();
    for (let seed = 0; seed < 2000; seed++) {
      for (const o of rollEnhanceOffers(seed, 5)) if (o.rarity === 'rare') labels.add(o.label);
    }
    // A hand-authored list was ~12 rares; drawing two keywords from a pool is what makes
    // the tier worth rerolling toward more than once.
    expect(labels.size).toBeGreaterThan(60);
  });

  it('rare keyword BUNDLES use common magnitudes; high magnitudes come as SINGLES', () => {
    // Two abilities at once is the bundle's value — stacking two high magnitudes on top of
    // that made one rare outweigh several commons. Depth is the single's job instead, so
    // the tier offers a genuine wide-vs-deep choice.
    for (const act of [1, 5, 8, 11]) {
      let bundles = 0, highs = 0;
      // Capped at a triple: breadth grows, but not to the point of handing over most
      // of a God Unit in a single altar visit.
      const width = 2 + Math.min(1, masterworkStep(act));
      for (let seed = 0; seed < 3000; seed++) {
        for (const o of rollEnhanceOffers(seed, act)) {
          if (o.sort !== 'enhance' || o.enhancement.kind !== 'keyword' || o.rarity !== 'rare') continue;
          const kws = Object.entries(o.enhancement.keywords);
          if (kws.length > 1) {
            // The altar deepens with the act: a bundle is a pair early and a triple from
            // MASTERWORK_ACT, and stops there — past the cap the tier keeps growing
            // through its magnitudes and stats instead.
            expect(kws.length, `${o.label} @ act ${act}`).toBe(width);
            bundles++;
            for (const [, v] of kws) {
              if (typeof v === 'number') expect(v, o.label).toBe(1);
              if (v && typeof v === 'object') {
                const stat = 'buff' in v ? (v as { buff: { attack: number } }).buff : (v as { attack: number });
                expect(stat.attack, o.label).toBe(1);
              }
            }
          } else {
            highs++;
            const [, v] = kws[0]!;
            // A high-magnitude single is only possible for a scalable keyword.
            if (typeof v === 'number') expect(v, o.label).toBeGreaterThan(1);
            else if (v && typeof v === 'object') {
              const stat = 'buff' in v ? (v as { buff: { attack: number } }).buff : (v as { attack: number });
              expect(stat.attack, o.label).toBeGreaterThan(1);
            } else throw new Error(`flag keyword ${o.label} has no high magnitude to sell`);
          }
        }
      }
      expect(bundles, `act ${act}`).toBeGreaterThan(0);
      expect(highs, `act ${act}`).toBeGreaterThan(0);
    }
  });

  it('the altar gets DEEPER every few acts, so it never stops being worth the visit', () => {
    // Its counterpart is the shop, which sells BREADTH (several commons on one body, for
    // coins). Neither overtakes the other, and both curves rise — which is the whole
    // answer to "enhancement stops mattering late". The magnitudes below are what the
    // enemy's Foundry is racing, and it is deliberately allowed to win (see foundry.ts).
    // EVERY act, not every few: clearing an act is itself the upgrade, so the altar you
    // walk into next act is visibly better than the one you left.
    expect(masterworkStep(MASTERWORK_ACT - 1)).toBe(0);
    expect(masterworkStep(MASTERWORK_ACT)).toBe(1);
    for (let act = MASTERWORK_ACT; act < 14; act++) {
      expect(masterworkStep(act + 1) - masterworkStep(act), `act ${act}`).toBe(1);
    }

    const biggestStat = (act: number): number => {
      let best = 0;
      for (let seed = 0; seed < 2000; seed++) {
        for (const o of rollEnhanceOffers(seed, act)) {
          if (o.sort === 'enhance' && o.enhancement.kind === 'stat') {
            best = Math.max(best, o.enhancement.attack + o.enhancement.hp);
          }
        }
      }
      return best;
    };
    expect(biggestStat(8)).toBeGreaterThan(biggestStat(1));
    expect(biggestStat(12)).toBeGreaterThan(biggestStat(8));
  });

  it('never rolls a pair whose second keyword cannot fire', () => {
    // Overshot sends the shot past the lane's units to the leader, so Lethal has nothing
    // to kill and Pierce no excess to carry. Branch Shot + Splash is NOT excluded — those
    // two compose (see combat.keywords.test.ts).
    const dead = [
      /Overshot \+ (Lethal|Pierce|Strike Through)/, /(Lethal|Pierce|Strike Through) \+ Overshot/,
    ];
    for (let seed = 0; seed < 3000; seed++) {
      for (const o of rollEnhanceOffers(seed, 5)) {
        for (const re of dead) expect(re.test(o.label), `${o.label} @ seed ${seed}`).toBe(false);
      }
    }
  });

  it('gives a rolled pair an order-independent id, so a row cannot show it twice', () => {
    for (let seed = 0; seed < 500; seed++) {
      const row = rollEnhanceOffers(seed, 5);
      expect(new Set(row.map((o) => o.id)).size).toBe(row.length);
      for (const o of row) {
        if (o.sort !== 'enhance' || o.enhancement.kind !== 'keyword') continue;
        const keys = Object.keys(o.enhancement.keywords);
        if (keys.length !== 2) continue;
        expect(o.id).toBe(`rkw:${[...keys].sort().join('+')}`);
      }
    }
  });

  it('gates eligibility per card', () => {
<<<<<<< Updated upstream
    const stat = { enhancement: { kind: 'stat', attack: 1, hp: 1 }, price: 50, label: '+1/+1' } as const;
    const cost = { enhancement: { kind: 'cost', energy: 1 }, price: 60, label: 'Cost −1' } as const;
    const taunt = { enhancement: { kind: 'keyword', keywords: { taunt: true } }, price: 70, label: 'Taunt' } as const;
    const spell = registry.cards.get('firebolt')!;
=======
    const stat = { sort: 'enhance', id: 's', rarity: 'common', label: '+1/+1', blurb: '', enhancement: { kind: 'stat', attack: 1, hp: 1 } } as const;
    const cost = { sort: 'enhance', id: 'c', rarity: 'common', label: 'Cost -1', blurb: '', enhancement: { kind: 'cost', energy: 1 } } as const;
    const taunt = { sort: 'enhance', id: 't', rarity: 'common', label: 'Taunt', blurb: '', enhancement: { kind: 'keyword', keywords: { taunt: true } } } as const;
    const dup = { sort: 'duplicate', id: 'd', rarity: 'common', label: 'Duplicate', blurb: '', full: false } as const;
    // Must be a spell that still costs generic energy: ability-dense cards can now price
    // down to 0 energy + pips, and a 0-cost card has nothing for 'Cost -1' to reduce.
    const spell = registry.cards.get('wildfire-spread')!;
>>>>>>> Stashed changes
    const freebie = unit({ cost: { energy: 0 } });
    const taunter = unit({ keywords: { taunt: true } });
    expect(canApply(stat, spell)).toBe(false);
    expect(canApply(stat, unit({}))).toBe(true);
    expect(canApply(cost, freebie)).toBe(false);
    expect(canApply(cost, spell)).toBe(true);
    expect(canApply(taunt, taunter)).toBe(false); // already has it
    expect(canApply(taunt, unit({}))).toBe(true);
    // Duplication is the universal fallback — it applies to anything, spells included.
    expect(canApply(dup, spell)).toBe(true);
  });

  it('never offers half a rare pair on a card that already has one half', () => {
    const pair = { sort: 'enhance', id: 'p', rarity: 'rare', label: 'Immunity + Pierce', blurb: '', enhancement: { kind: 'keyword', keywords: { immunity: true, pierce: true } } } as const;
    expect(canApply(pair, unit({ keywords: { pierce: true } }))).toBe(false);
    expect(canApply(pair, unit({}))).toBe(true);
  });
});
