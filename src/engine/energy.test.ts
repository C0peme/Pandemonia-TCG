import { describe, expect, it } from 'vitest';
import { applyBanking, bankTotal, canAfford, payCost } from '@engine/energy';
import { blankState } from '@engine/testkit';

const player = (energy: number, bank: Partial<Record<'fire' | 'water' | 'nature' | 'earth', number>> = {}) => {
  const p = blankState().players[0];
  return { ...p, energy, bank: { fire: 0, water: 0, nature: 0, earth: 0, ...bank } };
};

describe('canAfford', () => {
  it('checks generic energy', () => {
    expect(canAfford(player(3), { energy: 3 }).ok).toBe(true);
    expect(canAfford(player(2), { energy: 3 }).ok).toBe(false);
  });

  // The bank pays element costs first; any shortfall is charged to generic energy, so these
  // are affordability checks on the COMBINED pool, not on the bank alone.
  it('checks single element costs against bank plus energy', () => {
    const p = player(5, { fire: 2 });
    expect(canAfford(p, { energy: 5, elements: [{ type: 'fire', amount: 2 }] }).ok).toBe(true);
    // 5 energy fully spent by the generic half, so a 1-pip shortfall has nothing left to draw on.
    expect(canAfford(p, { energy: 5, elements: [{ type: 'fire', amount: 3 }] }).ok).toBe(false);
    expect(canAfford(p, { energy: 5, elements: [{ type: 'water', amount: 1 }] }).ok).toBe(false);
    // Same unbanked requirement, but with energy spare to cover it.
    expect(canAfford(p, { energy: 3, elements: [{ type: 'water', amount: 1 }] }).ok).toBe(true);
  });

  it('checks multi-element costs against bank plus energy', () => {
    const p = player(5, { fire: 1, nature: 1 });
    expect(canAfford(p, { energy: 2, elements: [{ type: 'fire', amount: 1 }, { type: 'nature', amount: 1 }] }).ok).toBe(true);
    // 1 nature short, but 3 energy remain after the generic half — payable.
    expect(canAfford(p, { energy: 2, elements: [{ type: 'fire', amount: 1 }, { type: 'nature', amount: 2 }] }).ok).toBe(true);
    expect(canAfford(p, { energy: 2, elements: [{ type: 'fire', amount: 2 }, { type: 'nature', amount: 1 }] }).ok).toBe(true);
    // 4 pips against a 2-card bank and 1 spare energy: 1 short overall.
    expect(canAfford(p, { energy: 4, elements: [{ type: 'fire', amount: 2 }, { type: 'nature', amount: 2 }] }).ok).toBe(false);
  });
});

describe('payCost', () => {
  it('deducts generic and banked element energy', () => {
    const p = player(5, { fire: 2 });
    const after = payCost(p, { energy: 4, elements: [{ type: 'fire', amount: 2 }] });
    expect(after.energy).toBe(1);
    expect(after.bank.fire).toBe(0);
  });

  it('deducts multi-element costs from the correct banks', () => {
    const p = player(5, { fire: 1, nature: 2 });
    const after = payCost(p, { energy: 2, elements: [{ type: 'fire', amount: 1 }, { type: 'nature', amount: 2 }] });
    expect(after.energy).toBe(3);
    expect(after.bank.fire).toBe(0);
    expect(after.bank.nature).toBe(0);
  });
});

describe('applyBanking', () => {
  it('banks leftover energy into chosen elements', () => {
    const result = applyBanking(player(3), { fire: 2 });
    expect(result.bank.fire).toBe(2);
    expect(result.applied.fire).toBe(2);
  });

  it('clamps a request to the energy left rather than failing', () => {
    const result = applyBanking(player(1), { fire: 2 }); // only 1 energy available
    expect(result.applied.fire).toBe(1);
    expect(result.bank.fire).toBe(1);
  });

  it('clamps a request to the per-element cap rather than failing', () => {
    const p = player(5, { water: 1 }); // water cap is 2 (default 2/2/2/2), so only 1 fits
    const result = applyBanking(p, { water: 2 });
    expect(result.applied.water).toBe(1);
    expect(result.bank.water).toBe(2);
  });

  it('clamps an already-full element to bank nothing (the Producer + banking case)', () => {
    const p = player(3, { fire: 2 }); // fire already at its cap of 2
    const result = applyBanking(p, { fire: 1 });
    expect(result.applied.fire ?? 0).toBe(0);
    expect(result.bank.fire).toBe(2);
  });

  it('caps each element independently (no global cap)', () => {
    const p = player(8); // all banks 0, every cap 2 → 8 total fits despite no global cap
    const result = applyBanking(p, { fire: 2, water: 2, nature: 2, earth: 2 });
    expect(result.bank).toEqual({ fire: 2, water: 2, nature: 2, earth: 2 });
  });

  it('caps the total banked at the energy left across elements', () => {
    const result = applyBanking(player(3), { fire: 2, water: 2 }); // wants 4, only 3 energy
    expect((result.applied.fire ?? 0) + (result.applied.water ?? 0)).toBe(3);
  });

  it('bankTotal sums all elements', () => {
    expect(bankTotal({ fire: 1, water: 1, nature: 0, earth: 1 })).toBe(3);
  });
});

// Element costs are a DISCOUNT, not a gate: the bank pays first, and any shortfall is
// covered by generic energy at 1:1. Nothing is ever uncastable for want of the right bank.
describe('generic energy covers element costs', () => {
  const cost = { energy: 2, elements: [{ type: 'fire' as const, amount: 2 }] };

  it('pays entirely from the bank when it can, leaving energy untouched', () => {
    const p = player(2, { fire: 2 });
    expect(canAfford(p, cost).ok).toBe(true);
    const after = payCost(p, cost);
    expect(after.energy).toBe(0);
    expect(after.bank.fire).toBe(0);
  });

  it('falls back to generic energy when the bank is empty', () => {
    const p = player(4);                       // no fire banked at all
    expect(canAfford(p, cost).ok).toBe(true);  // would have been false before
    const after = payCost(p, cost);
    expect(after.energy).toBe(0);              // 2 generic + 2 covering the pips
    expect(after.bank.fire).toBe(0);           // never driven negative
  });

  it('splits the difference on a partial bank', () => {
    const p = player(3, { fire: 1 });
    expect(canAfford(p, cost).ok).toBe(true);
    const after = payCost(p, cost);
    expect(after.bank.fire).toBe(0);           // the 1 banked fire is spent first
    expect(after.energy).toBe(0);              // 2 generic + 1 for the shortfall
  });

  it('still refuses when the total exceeds everything available', () => {
    const p = player(3);                       // needs 4 generic without any bank
    const res = canAfford(p, cost);
    expect(res.ok).toBe(false);
    expect(res.reason).toContain('Need 4 energy');
  });

  it('banking the element is what makes the card cheaper', () => {
    const broke = player(3);                   // cannot afford on generic alone
    const invested = player(3, { fire: 2 });   // same energy, element committed
    expect(canAfford(broke, cost).ok).toBe(false);
    expect(canAfford(invested, cost).ok).toBe(true);
    expect(payCost(invested, cost).energy).toBe(1); // and leaves energy to spare
  });
});
