import { describe, it, expect } from 'vitest';
import { cardBudgetValue, recommendedEnergy, recommendedPips, abilityCount } from '@cards/budget';
import { starterCards } from '@cards/data/starter';

const byId = new Map(starterCards.map((c) => [c.id, c]));
const lookup = (id: string) => byId.get(id);
const card = (id: string) => byId.get(id)!;

// Values are measured straight — no STAT_BASE tax on stats, no ABILITY_FACTOR discount on
// abilities — then multiplied by VALUE_SCALE (1.20), which only pins the pool's absolute
// price level. Abilities earn their edge in `recommendedPips` instead, by converting energy
// into pips 1:1.
describe('cardBudgetValue', () => {
  it('prices a vanilla early unit on the geometric stat curve', () => {
    // Ember Pup 1/2 on the softened curve (0.30 base, 1.08/1.12 ratios), x1.30 scale.
    expect(cardBudgetValue(card('ember-pup'))).toBeCloseTo(1.059, 2);
  });

  it('prices a big body via the geometric curve', () => {
    // Big bodies got materially cheaper: the softened curve is the whole point of the change.
    expect(cardBudgetValue(card('inferno-ox'))).toBeCloseTo(4.742, 2);
  });

  it('prices a simple damage spell with no ability discount', () => {
    // Firebolt: 2 damage x 0.5 = 1.0, x 1.30 scale = 1.3 (ABILITY_FACTOR is 1.0)
    expect(cardBudgetValue(card('firebolt'))).toBeCloseTo(1.090, 2);
  });

  it('applies the all-units ×2.5 multiplier to AOE on-play', () => {
    // Frost King 2/2 + freeze all enemies. Freeze was repriced down (2.5 -> 1.4, field -11.1),
    // which outweighs the AOE multiplier rising 2.5 -> 3.5.
    expect(cardBudgetValue(card('frost-king'))).toBeCloseTo(6.798, 2);
  });

  it('prices an AOE spell (Wildfire Spread: Burn 2 all-enemy)', () => {
    // burn 2.0 x AOE 3.5 (was 2.5 — measured +9.2 underpriced) x 1.09 scale.
    expect(cardBudgetValue(card('wildfire-spread'))).toBeCloseTo(7.630, 2);
  });

  it('prices a foundation as a full body plus its grant at FULL value', () => {
    // Stone Footing 2/4: body + Tough grant + the derived half-stat carryover (+1/+2), all at
    // full value. Both discounts that once applied here are gone — the 1.5 "delayed upside"
    // rebate and the brief period where the stat carryover was free (foundation count then
    // correlated 0.86 with win-rate change, so it plainly was not free).
    expect(cardBudgetValue(card('stone-footing'))).toBeCloseTo(7.771, 2);
  });
});

// One pip per ability: an ability moves a full point of cost out of generic energy and into
// an element requirement. Nominally the same total, but cheaper in play — a pip is paid from
// end-of-turn overflow that would otherwise be lost.
describe('abilityCount', () => {
  it('counts nothing for a vanilla body', () => {
    expect(abilityCount(card('ember-pup'), lookup)).toBe(0);
    expect(abilityCount(card('field-mouse'), lookup)).toBe(0);
  });

  it('does not count a pure downside as an ability', () => {
    // Magma Brute's only keyword is Brittle (negative value) — it must not earn a pip.
    expect(abilityCount(card('magma-brute'), lookup)).toBe(0);
    expect(recommendedPips(card('magma-brute'), lookup)).toBe(0);
  });

  it('counts each distinct ability', () => {
    expect(abilityCount(card('apex-predator'), lookup)).toBe(2);
    expect(abilityCount(card('shinero'), lookup)).toBe(3);
  });

  it('counts spell effects too — spells get the discount like everything else', () => {
    expect(abilityCount(card('firebolt'), lookup)).toBe(1);
    expect(abilityCount(card('tidal-wave'), lookup)).toBe(2);
  });
});

describe('recommendedPips / recommendedEnergy', () => {
  it('leaves vanilla bodies entirely pip-free', () => {
    expect(recommendedPips(card('ember-pup'), lookup)).toBe(0);
    expect(recommendedEnergy(card('ember-pup'), lookup)).toBe(1);
    expect(recommendedPips(card('inferno-ox'), lookup)).toBe(0);
    expect(recommendedEnergy(card('inferno-ox'), lookup)).toBe(5);
  });

  it('converts one energy into one pip per ability', () => {
    // Shinero value 8.64 -> round 9, 3 abilities -> 3 pips, 9 - 3 = 6 energy.
    expect(recommendedPips(card('shinero'), lookup)).toBe(3);
    expect(recommendedEnergy(card('shinero'), lookup)).toBe(6);
    // Apex Predator value 11.91 -> round 12, 2 abilities -> 2 pips, 12 - 2 = 10 energy.
    expect(recommendedPips(card('apex-predator'), lookup)).toBe(2);
    expect(recommendedEnergy(card('apex-predator'), lookup)).toBe(10);
  });

  it('lets an ability card convert its whole cost away to 0 energy + pips', () => {
    // Firebolt: value 1.2 -> 1 energy, 1 ability -> 1 pip, leaving 0 generic.
    expect(recommendedEnergy(card('firebolt'), lookup)).toBe(0);
    expect(recommendedPips(card('firebolt'), lookup)).toBe(1);
    // Never negative, and a 0-energy card always carries at least one pip to pay instead.
    for (const c of starterCards) {
      const tags: string[] = (c as any).tags ?? [];
      if (tags.includes('token') || tags.includes('signature')) continue;
      const e = recommendedEnergy(c, lookup);
      expect(e).toBeGreaterThanOrEqual(0);
      if (e === 0 && Math.round(cardBudgetValue(c, lookup)) > 0) {
        expect(recommendedPips(c, lookup)).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('never exceeds MAX_ELEMENT_COST', () => {
    for (const c of starterCards) expect(recommendedPips(c, lookup)).toBeLessThanOrEqual(4);
  });
});
