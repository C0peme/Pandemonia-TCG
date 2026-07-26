import { describe, it, expect } from 'vitest';
import { cardBudgetValue, recommendedEnergy } from '@cards/budget';
import { starterCards } from '@cards/data/starter';

const byId = new Map(starterCards.map((c) => [c.id, c]));
const lookup = (id: string) => byId.get(id);
const card = (id: string) => byId.get(id)!;

describe('cardBudgetValue', () => {
  it('prices a vanilla early unit (geometric stats, base 0.38)', () => {
    // Ember Pup 1/2: attackCost(1)=0.38 + hpCost(2)=0.912 = 1.292
    expect(cardBudgetValue(card('ember-pup'))).toBeCloseTo(1.292);
  });

  it('prices a big body via the geometric curve', () => {
    // Inferno Ox 5/4: attackCost(5)=3.436 + hpCost(4)=2.700 = 6.136. Big vanilla bodies pay
    // a steep premium — raw stats are deliberately less efficient than abilities.
    expect(cardBudgetValue(card('inferno-ox'))).toBeCloseTo(6.136);
  });

  it('prices a simple damage spell (abilities discounted ×0.8)', () => {
    // Firebolt: 2 damage × 0.5 = 1.0, × ABILITY_FACTOR 0.8 = 0.8
    expect(cardBudgetValue(card('firebolt'))).toBeCloseTo(0.8);
  });

  it('applies the all-units ×2.5 multiplier (and ability ×0.8) to AOE on-play', () => {
    // Frost King 2/2, freeze all enemies: stat(0.874+0.912) + (2.5 × 2.5 × 0.8) = 1.786 + 5.0 = 6.786
    expect(cardBudgetValue(card('frost-king'))).toBeCloseTo(6.786);
  });

  it('prices an AOE spell (Wildfire Spread: Burn 2 all-enemy)', () => {
    // burn 2.0 × 2.5 × 0.8 = 4.0
    expect(cardBudgetValue(card('wildfire-spread'))).toBeCloseTo(4.0);
  });

  it('prices a foundation as a full body plus a discounted grant premium', () => {
    // Stone Footing: body 1/3 (0.38+1.657=2.037) + grant premium max(0.5, [+0/+1 0.5 + Tough
    // (2.0×0.8=1.6)] − 1.5 discount) = 0.6 → 2.637
    expect(cardBudgetValue(card('stone-footing'))).toBeCloseTo(2.637);
  });

  it('recommends an energy cost net of element pips', () => {
    // Frost King value 6.786, 3 Water pips (−1.5) → round(5.286) = 5
    expect(recommendedEnergy(card('frost-king'), lookup)).toBe(5);
  });
});
