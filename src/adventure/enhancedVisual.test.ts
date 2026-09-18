/**
 * Enhanced copies must be TELLABLE from the printed card.
 *
 * `ownedCardDef` folds an enhancement into the numbers and appends a "+" to the name, so
 * on a shop shelf or in a fanned hand an enhanced card looked exactly like the base one.
 * The UI marks them from `isEnhancedCardId`, so the guarantee under test is that the
 * derived id is a reliable, exclusive signal.
 */
import { describe, expect, it } from 'vitest';
import { buildRegistry } from '@cards/registry';
import { starterCards, starterLeaders } from '@cards/data/starter';
import { ownedCardDef, isEnhancedCardId, advCardId } from '@adventure/runRegistry';
import type { OwnedCard } from '@adventure/schema';

const base = buildRegistry(starterCards, starterLeaders);
const owned = (enhancements: OwnedCard['enhancements']): OwnedCard =>
  ({ uid: 'u7', cardId: 'magma-brute', enhancements });

describe('isEnhancedCardId', () => {
  it('flags a materialized enhanced copy', () => {
    const def = ownedCardDef(base, owned([{ kind: 'stat', attack: 1, hp: 1 }]))!;
    expect(def.id).toBe(advCardId('u7'));
    expect(isEnhancedCardId(def.id)).toBe(true);
  });

  it('does NOT flag an unenhanced copy — that def is the printed card itself', () => {
    const def = ownedCardDef(base, owned([]))!;
    expect(def.id).toBe('magma-brute');
    expect(isEnhancedCardId(def.id)).toBe(false);
  });

  it('never flags an authored card, so the marker cannot appear outside a run', () => {
    for (const card of base.cards.values()) {
      expect(isEnhancedCardId(card.id), card.id).toBe(false);
    }
  });

  it('keeps the name suffix in step with the enhancement count the badge reads', () => {
    // The badge derives its number from the "+" run in the name, so the two must agree.
    for (const n of [1, 2, 3]) {
      const def = ownedCardDef(base, owned(Array.from({ length: n }, () => ({ kind: 'stat' as const, attack: 1, hp: 0 }))))!;
      expect((def.name.match(/\+/g) ?? []).length, `${n} enhancements`).toBe(n);
    }
  });
});
