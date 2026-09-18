import { describe, expect, it } from 'vitest';
import { parseCard, EVASIVE_HP_CAP } from '@cards/schema';

/**
 * A unit sitting in Water or Heights with no same-domain answer in the opposing lane cannot
 * be traded with in combat at all — only Airborne/Aquatic itself or a removal spell can touch
 * it. High HP on top of that evasion is capped rather than priced, per design: the current
 * pool's tallest ordinary evasive body (Emerald Drake) is 5 HP, which sets `EVASIVE_HP_CAP`.
 */
describe('EVASIVE_HP_CAP', () => {
  const draft = (overrides: any) => ({
    id: 'x', name: 'x', element: 'water', text: '', tags: [], wip: false,
    type: 'unit', cost: { energy: 1 }, attack: 1, ...overrides,
  });

  it('rejects an Airborne unit above the cap', () => {
    expect(() => parseCard(draft({ hp: EVASIVE_HP_CAP + 1, keywords: { airborne: true } }))).toThrow();
  });

  it('rejects an Aquatic unit above the cap (aquatic: true)', () => {
    expect(() => parseCard(draft({ hp: EVASIVE_HP_CAP + 1, keywords: { aquatic: true } }))).toThrow();
  });

  it('rejects Aquatic as an effect list too — an empty array is still truthy', () => {
    expect(() => parseCard(draft({ hp: EVASIVE_HP_CAP + 1, keywords: { aquatic: [] } }))).toThrow();
  });

  it('allows an Airborne/Aquatic unit AT the cap', () => {
    expect(() => parseCard(draft({ hp: EVASIVE_HP_CAP, keywords: { airborne: true } }))).not.toThrow();
  });

  it('allows a non-evasive unit above the cap', () => {
    expect(() => parseCard(draft({ hp: EVASIVE_HP_CAP + 10, keywords: {} }))).not.toThrow();
  });

  it('exempts a card explicitly flagged leaderUnit', () => {
    expect(() => parseCard(draft({ hp: 30, keywords: { airborne: true }, leaderUnit: true }))).not.toThrow();
  });

  it('applies the same cap to Foundations', () => {
    expect(() =>
      parseCard({ id: 'y', name: 'y', element: 'water', text: '', tags: [], wip: false,
        type: 'foundation', cost: { energy: 1 }, hp: EVASIVE_HP_CAP + 1, keywords: { aquatic: true } }),
    ).toThrow();
  });
});
