/**
 * EVERY DRAFTABLE CARD SITS EXACTLY ON THE BUDGET FORMULA.
 *
 * `budget.ts` computes what a card should cost — `recommendedEnergy` for the generic half and
 * `recommendedElements` for the pips. Nothing had ever asserted that the shipped pool agreed
 * with it, so the two drifted quietly: 21 cards were off by the time this file was written,
 * mostly by one energy and one pip, because a pricing change repriced the FORMULA without
 * repricing the CARDS. That is the worst shape for this kind of drift — each card looks fine
 * on its own, and the pool stops being internally comparable a card at a time.
 *
 * `cost_diff.test.ts` prints the same comparison but asserts nothing, so it only helps someone
 * who happens to read the log. This one fails.
 *
 * WHEN THIS TEST FAILS after a deliberate change to `budget.ts`, the fix is to reprice the
 * cards it names — not to loosen the test. The formula is the single source of truth for what
 * a card costs; a card that disagrees with it is a card whose price no longer means anything
 * relative to its neighbours. (`VALUE_SCALE` is the knob for moving the whole pool's price
 * level at once; see its comment. It is deliberately not a balance knob.)
 */
import { describe, expect, it } from 'vitest';
import { starterCards } from '@cards/data/starter';
import { recommendedEnergy, recommendedElements } from '@cards/budget';
import type { Card } from '@cards/schema';

const lookup = (id: string) => (starterCards as Card[]).find((c) => c.id === id);

/**
 * The two exempt classes, and why each is exempt rather than merely inconvenient:
 *
 *  - SIGNATURES are delivered free to hand when a leader drops to half HP. Their power is
 *    paid for in the 15 leader HP it took to unlock them, which is a currency the budget
 *    formula does not model at all — so their printed 0 is correct and their `recommended`
 *    value (up to 44 for 8Bits) is meaningless. The same goes for the leader-unit avatars.
 *  - TOKENS are created by other cards, never drafted or bought. Their printed cost is a
 *    deliberate design lever on the card that MAKES them: Hired Blade is 0 so Call in Markers
 *    hands you two live bodies, and Dead Weight is priced at one pip of every element
 *    precisely so it is expensive to clear out of the hand it was forced into. Repricing
 *    either to its "fair" cost would silently retune the card that creates it.
 */
const exempt = (c: Card): boolean => c.tags.includes('signature') || c.tags.includes('token');
const draftable = (starterCards as Card[]).filter((c) => !exempt(c));

const pipString = (els: readonly { type: string; amount: number }[] | undefined): string =>
  [...(els ?? [])].map((e) => `${e.type}${e.amount}`).sort().join('+') || '-';

describe('the shipped pool is priced by the formula', () => {
  it('has cards to check, and the exempt set is only signatures and tokens', () => {
    expect(draftable.length).toBeGreaterThan(150);
    const exemptIds = (starterCards as Card[]).filter(exempt).map((c) => c.id);
    // A guard on the guard: if a future card is exempted, it must earn it by carrying one of
    // the two tags, not by being quietly special-cased in this file.
    for (const id of exemptIds) {
      const c = lookup(id)!;
      expect(c.tags.includes('signature') || c.tags.includes('token'), id).toBe(true);
    }
  });

  it.each(draftable.map((c) => [c.id, c] as const))('%s', (_id, card) => {
    const c = card as Card & { cost: { energy: number; elements?: { type: string; amount: number }[] } };
    expect(c.cost.energy, `${c.id} energy`).toBe(recommendedEnergy(c, lookup));
    expect(pipString(c.cost.elements), `${c.id} pips`).toBe(pipString(recommendedElements(c, lookup)));
  });
});
