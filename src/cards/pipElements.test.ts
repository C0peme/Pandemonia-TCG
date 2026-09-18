/**
 * Ability-derived pips: a pip is charged in the element of the ABILITY that earns it, not the
 * element printed on the card. See the ability->element map in docs/card-creation-guide.txt.
 */
import { describe, expect, it } from 'vitest';
import { starterCards } from '@cards/data/starter';
import { abilityCount, pipBreakdown, recommendedElements, recommendedPips, ABILITY_ELEMENT } from '@cards/budget';
import { RULES } from '@engine/constants';

const lookup = (id: string) => (starterCards as any[]).find((c) => c.id === id);
const card = (id: string) => lookup(id) as any;
const sum = (t: Record<string, number | undefined>) => Object.values(t).reduce<number>((a, n) => a + (n ?? 0), 0);

describe('ability-derived pips', () => {
  it('the breakdown never exceeds abilityCount — colourless abilities earn no pip', () => {
    for (const c of starterCards as any[]) {
      expect(sum(pipBreakdown(c, lookup)), c.id).toBeLessThanOrEqual(abilityCount(c, lookup));
    }
  });

  it('every keyword in the schema has an element', () => {
    const missing = (starterCards as any[]).flatMap((c) =>
      Object.entries(c.keywords ?? {})
        .filter(([k]) => !ABILITY_ELEMENT[k])
        .map(([k]) => k));
    expect([...new Set(missing)]).toEqual([]);
  });

  it('charges an OFF-element pip for an off-element ability', () => {
    // Frost Imp is a WATER card whose only ability is Overshot — a FIRE ability.
    const els = recommendedElements(card('frost-imp'), lookup);
    expect(els).toEqual([{ type: 'fire', amount: 1 }]);
  });

  it('splits a card across elements when its abilities do', () => {
    // Revolving Sun (fire) carries Sniper (water) + an on-hit Burn (fire).
    const els = recommendedElements(card('revolving-sun'), lookup);
    expect(els.length).toBeGreaterThan(1);
    expect(els.map((e) => e.type).sort()).toEqual(['fire', 'water']);
  });

  it('never exceeds MAX_ELEMENT_COST in total, and matches recommendedPips', () => {
    for (const c of starterCards as any[]) {
      const els = recommendedElements(c, lookup);
      const total = els.reduce((s, e) => s + e.amount, 0);
      expect(total, c.id).toBeLessThanOrEqual(RULES.MAX_ELEMENT_COST);
      expect(total, c.id).toBe(recommendedPips(c, lookup));
      for (const e of els) expect(e.amount).toBeGreaterThan(0);
    }
  });

  it('a vanilla body has no pips at all', () => {
    expect(recommendedElements(card('quarry-hand'), lookup)).toEqual([]);
  });

  it('a colourless ability earns NO pip — plain damage stays energy', () => {
    // Firebolt is a Fire card, but `damage` has no element, so it converts nothing.
    expect(recommendedElements(card('firebolt'), lookup)).toEqual([]);
    // ...whereas the same card's freeze cousin converts fully.
    expect(recommendedElements(card('hypnotic-patterns'), lookup)).toEqual([{ type: 'water', amount: 1 }]);
  });

  it('`pierce` on a damage effect colours it Water even though damage is colourless', () => {
    expect(recommendedElements(card('abyssal-verdict'), lookup)).toEqual([{ type: 'water', amount: 1 }]);
  });

  it('NEUTRAL cards carry no pips and no element-bearing ability', () => {
    const neutrals = (starterCards as any[]).filter((c) => c.element === 'neutral');
    expect(neutrals.length).toBeGreaterThan(0);
    for (const c of neutrals) {
      expect(pipBreakdown(c, lookup), c.id).toEqual({});
      expect(recommendedElements(c, lookup), c.id).toEqual([]);
      expect(c.cost.elements, c.id).toBeUndefined();
    }
  });
});
