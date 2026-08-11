/**
 * Every shipped deck must pass the game's OWN deck validation — the same check the deck
 * builder runs on a player's deck. `parseDeck` only bounds a single entry's count, so a deck
 * listing the same card in two entries slips through it while `validateDeck` rejects it.
 * Midrange shipped in exactly that state (briar-colt and reef-darter listed twice each).
 */
import { describe, expect, it } from 'vitest';
import { starterRegistry, starterDecks } from '@cards/data/starter';
import { validateDeck } from '@cards/registry';
import { RULES } from '@engine/constants';

describe('starter decks are legal decks', () => {
  it('passes validateDeck — no duplicate entries, no over-limit copies, known ids', () => {
    for (const d of starterDecks as any[]) {
      const res = validateDeck(starterRegistry, d);
      expect(res.errors, `${d.name}: ${res.errors.join('; ')}`).toEqual([]);
      expect(res.ok, d.name).toBe(true);
    }
  });

  it('is exactly the required size and within the copy limit', () => {
    for (const d of starterDecks as any[]) {
      const total = d.cards.reduce((s: number, e: any) => s + e.count, 0);
      expect(total, `${d.name} size`).toBe(RULES.DECK_SIZE);
      for (const e of d.cards) expect(e.count, `${d.name}/${e.cardId}`).toBeLessThanOrEqual(RULES.MAX_COPIES);
    }
  });
});
