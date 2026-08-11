import { describe, expect, it } from 'vitest';
import { buildRegistry, validateDeck, expandDeck } from '@cards/registry';
import { starterCards as exampleCards, starterLeaders as exampleLeaders } from '@cards/data/starter';
import { parseDeck } from '@cards/schema';
import { RULES } from '@engine/constants';

const registry = buildRegistry(exampleCards, exampleLeaders);

// A 40-card deck built only from example card ids (4 copies of 7 cards = 28, pad to 40
// by repeating — but copy limit is 4, so we need >=10 distinct ids). The example pool
// has fewer than 10 cards, so deck-vs-registry tests use a mix of real + unknown ids
// to exercise validation messaging.

describe('registry', () => {
  it('indexes all example cards and leaders (plus the special Null card)', () => {
    for (const c of exampleCards) expect(registry.cards.has(c.id)).toBe(true);
    expect(registry.cards.has('__null__')).toBe(true);
    expect(registry.leaders.has('kedou')).toBe(true);
  });

  it('throws on duplicate card ids', () => {
    expect(() => buildRegistry([...exampleCards, exampleCards[0]!], exampleLeaders)).toThrow(
      /Duplicate card id/,
    );
  });

  it('flags unknown leader and card ids in a deck', () => {
    const result = validateDeck(registry, {
      name: 'Bad',
      leaderId: 'nobody',
      cards: Array.from({ length: 10 }, (_, i) => ({ cardId: `ghost-${i}`, count: 3 })),
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => /Unknown leader/.test(e))).toBe(true);
    expect(result.errors.some((e) => /Unknown card/.test(e))).toBe(true);
  });

  it('flags a card listed more than once', () => {
    const result = validateDeck(registry, {
      name: 'Dup',
      leaderId: 'kedou',
      cards: [
        { cardId: 'ember-pup', count: 3 },
        { cardId: 'ember-pup', count: 3 },
        ...Array.from({ length: 8 }, (_, i) => ({ cardId: `filler-${i}`, count: 3 })),
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => /more than once/.test(e))).toBe(true);
  });

  it('expands a deck into one id per physical card', () => {
    const deck = parseDeck({
      name: 'Expand',
      leaderId: 'kedou',
      cards: [
        // Reads MAX_COPIES rather than hardcoding it — this fixture broke when the limit moved
        // from 4 to 3, which is the only reason anyone noticed it was hardcoded.
        { cardId: 'ember-pup', count: RULES.MAX_COPIES },
        { cardId: 'cinder-archer', count: 3 },
        ...Array.from({ length: 8 }, (_, i) => ({ cardId: `f-${i}`, count: 3 })),
      ],
    });
    expect(expandDeck(deck)).toHaveLength(RULES.DECK_SIZE);
    expect(expandDeck(deck).filter((id) => id === 'ember-pup')).toHaveLength(RULES.MAX_COPIES);
  });
});
