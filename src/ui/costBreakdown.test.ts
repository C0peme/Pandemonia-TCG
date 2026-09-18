/**
 * The displayed price must match what the engine actually charges. `costModFor` is documented
 * as "the single source of truth for effective cost — every play/afford path routes through
 * it", but the DISPLAY path used to bypass it, so a card under Anti Magic Field (or an
 * Adventure discount) showed its printed cost while the engine charged a different one.
 */
import { describe, it, expect } from 'vitest';
import { costBreakdown } from '@ui/App';
import type { Card } from '@cards/schema';
import type { Element } from '@engine/constants';

const card = (energy: number, elements: { type: Element; amount: number }[] = []): Card =>
  ({ id: 'x', name: 'X', type: 'unit', element: 'fire', cost: { energy, elements }, attack: 1, hp: 1, keywords: {} } as unknown as Card);

const bank = (b: Partial<Record<Element, number>> = {}): Record<Element, number> =>
  ({ fire: 0, water: 0, nature: 0, earth: 0, ...b });

describe('costBreakdown — bank coverage', () => {
  it('charges the printed energy when there are no pips', () => {
    expect(costBreakdown(card(3), bank()).effective).toBe(3);
  });

  it('charges unbanked pips as generic energy', () => {
    // 2 energy + 2 fire pips, none banked -> 2 + 2 = 4
    expect(costBreakdown(card(2, [{ type: 'fire', amount: 2 }]), bank()).effective).toBe(4);
  });

  it('does not charge pips the bank covers', () => {
    expect(costBreakdown(card(2, [{ type: 'fire', amount: 2 }]), bank({ fire: 2 })).effective).toBe(2);
  });

  it('marks each pip covered or short in render order', () => {
    const r = costBreakdown(card(0, [{ type: 'fire', amount: 3 }]), bank({ fire: 2 }));
    expect(r.pips.map((p) => p.covered)).toEqual([true, true, false]);
    expect(r.shortfall).toBe(1);
  });
});

describe('costBreakdown — cost modifiers', () => {
  it('adds a positive modifier (Anti Magic Field)', () => {
    expect(costBreakdown(card(3), bank(), +2).effective).toBe(5);
  });

  it('subtracts a discount', () => {
    expect(costBreakdown(card(3), bank(), -2).effective).toBe(1);
  });

  it('clamps the base at 0 before pips, matching the engine', () => {
    // base 1 with a -3 discount clamps to 0; the unbanked pip still costs 1
    expect(costBreakdown(card(1, [{ type: 'fire', amount: 1 }]), bank(), -3).effective).toBe(1);
  });

  it('never returns a negative price', () => {
    expect(costBreakdown(card(2), bank(), -9).effective).toBe(0);
  });

  it('defaults to no modifier when none is supplied', () => {
    expect(costBreakdown(card(4), bank()).effective).toBe(costBreakdown(card(4), bank(), 0).effective);
  });
});
