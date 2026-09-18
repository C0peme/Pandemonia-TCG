import { describe, it, expect } from 'vitest';
import { cardBudgetValue, recommendedEnergy } from '@cards/budget';
import { starterCards } from '@cards/data/starter';

const byId = new Map(starterCards.map((c) => [c.id, c]));
const lookup = (id: string) => byId.get(id);
const card = (id: string) => byId.get(id)!;

describe('cardBudgetValue', () => {
<<<<<<< Updated upstream
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
=======
  it('prices a vanilla early unit on the geometric stat curve', () => {
    // Ember Pup 1/2. The cheap-end reprute lifts the FIRST point of stat (STAT_BASE 0.29 ->
    // 0.34), which is what stopped the bottom of the pool rounding to free.
    expect(cardBudgetValue(card('ember-pup'))).toBeCloseTo(1.190, 2);
  });

  it('prices a big body via the geometric curve', () => {
    // A 5/4 barely moves: the flatter ratios (1.26/1.35 -> 1.21/1.28) hand back almost exactly
    // what the higher STAT_BASE takes. That is the point of moving both together — the curve
    // pivots rather than shifting, so the pool's average body keeps its price.
    expect(cardBudgetValue(card('inferno-ox'))).toBeCloseTo(4.935, 2);
  });

  it('prices a simple damage spell with no ability discount', () => {
    // Firebolt: 2 damage x 0.5 = 1.0, x VALUE_SCALE. Damage was not repriced, so this is the
    // control case — it moves only by the scale correction that holds the pool's mean.
    expect(cardBudgetValue(card('firebolt'))).toBeCloseTo(1.067, 2);
  });

  it('applies the all-units AOE multiplier to an on-play effect', () => {
    // Frost King 2/2 + freeze all enemies. Freeze was repriced down (2.5 -> 1.4, field -11.1),
    // which outweighs the AOE multiplier rising 2.5 -> 3.5.
    expect(cardBudgetValue(card('frost-king'))).toBeCloseTo(6.703, 2);
  });

  it('prices an AOE spell (Wildfire Spread: Burn 2 all-enemy)', () => {
    // burn (repriced 1.0 -> 1.1) x AOE_MULT, which came down 3.5 -> 2.9 in the same pass: an
    // AOE sweep is exactly the expensive end the reprice exists to bring back inside a game.
    expect(cardBudgetValue(card('wildfire-spread'))).toBeCloseTo(7.302, 2);
  });

  it('prices a foundation as a full body plus its grant at FULL value', () => {
    // Stone Footing 2/4: body + Tough grant + the derived half-stat carryover (+1/+2), all at
    // full value. Both discounts that once applied here are gone — the 1.5 "delayed upside"
    // rebate and the brief period where the stat carryover was free (foundation count then
    // correlated 0.86 with win-rate change, so it plainly was not free).
    expect(cardBudgetValue(card('stone-footing'))).toBeCloseTo(7.486, 2);
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
    // growth + bloodlust, plus 1 more for the stat buff Bloodlust itself grants on a kill.
    expect(abilityCount(card('apex-predator'), lookup)).toBe(3);
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
    // Shinero: 3 abilities -> 3 pips, and the rest in energy.
    expect(recommendedPips(card('shinero'), lookup)).toBe(3);
    expect(recommendedEnergy(card('shinero'), lookup)).toBe(6);
    // Apex Predator: 3 abilities (growth, bloodlust, and the buff Bloodlust itself grants).
    // Growth AND Bloodlust are both compound keywords, so this card took the COMPOUND_TICKS
    // 3 -> 2 cut twice over — it is the clearest example of what that constant was inflating.
    expect(recommendedPips(card('apex-predator'), lookup)).toBe(3);
    expect(recommendedEnergy(card('apex-predator'), lookup)).toBe(5);
  });

  it('lets an ability card convert its whole cost away to 0 energy + pips', () => {
    // Ash Cloud: Burn is a FIRE ability, so its whole cost converts into a pip. (Hypnotic
    // Patterns used to stand here; the curve-compression retune lifted the cheap end, so its
    // value now rounds to 2 and it keeps one energy after converting its pip. A 0-energy card
    // still exists — it just has to be cheaper than it used to be to qualify.)
    expect(recommendedEnergy(card('ash-cloud'), lookup)).toBe(0);
    expect(recommendedPips(card('ash-cloud'), lookup)).toBe(1);
    // ...but Firebolt is plain damage, which has NO element, so it converts nothing and is
    // priced entirely in energy. This is the neutral case: a colourless ability earns no pip.
    expect(recommendedPips(card('firebolt'), lookup)).toBe(0);
    expect(recommendedEnergy(card('firebolt'), lookup)).toBe(1);
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
>>>>>>> Stashed changes
  });
});
