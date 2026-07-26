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

  it('checks banked element energy for single element costs', () => {
    const p = player(5, { fire: 2 });
    expect(canAfford(p, { energy: 5, elements: [{ type: 'fire', amount: 2 }] }).ok).toBe(true);
    expect(canAfford(p, { energy: 5, elements: [{ type: 'fire', amount: 3 }] }).ok).toBe(false);
    expect(canAfford(p, { energy: 5, elements: [{ type: 'water', amount: 1 }] }).ok).toBe(false);
  });

  it('checks banked element energy for multi-element costs', () => {
    const p = player(5, { fire: 1, nature: 1 });
    expect(canAfford(p, { energy: 2, elements: [{ type: 'fire', amount: 1 }, { type: 'nature', amount: 1 }] }).ok).toBe(true);
    expect(canAfford(p, { energy: 2, elements: [{ type: 'fire', amount: 1 }, { type: 'nature', amount: 2 }] }).ok).toBe(false);
    expect(canAfford(p, { energy: 2, elements: [{ type: 'fire', amount: 2 }, { type: 'nature', amount: 1 }] }).ok).toBe(false);
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
