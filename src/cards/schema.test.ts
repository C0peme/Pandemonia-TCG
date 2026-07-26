import { describe, expect, it } from 'vitest';
import { parseCard, parseDeck, cardSchema } from '@cards/schema';
import { starterCards as exampleCards, starterLeaders as exampleLeaders } from '@cards/data/starter';
import { RULES } from '@engine/constants';

describe('card schema', () => {
  it('parses every example card and leader', () => {
    expect(exampleCards.length).toBeGreaterThan(0);
    expect(exampleLeaders.length).toBeGreaterThan(0);
  });

  it('applies the default empty keywords on a vanilla unit', () => {
    const card = parseCard({
      id: 'x',
      name: 'X',
      type: 'unit',
      element: 'fire',
      cost: { energy: 1 },
      attack: 1,
      hp: 1,
    });
    expect(card.type === 'unit' && card.keywords).toEqual({});
  });

  it('rejects an unknown field (strict)', () => {
    const result = cardSchema.safeParse({
      id: 'x',
      name: 'X',
      type: 'unit',
      element: 'fire',
      cost: { energy: 1 },
      attack: 1,
      hp: 1,
      bogus: true,
    });
    expect(result.success).toBe(false);
  });

  it('rejects an element cost above MAX_ELEMENT_COST', () => {
    const result = cardSchema.safeParse({
      id: 'x',
      name: 'X',
      type: 'unit',
      element: 'fire',
      cost: { energy: 5, element: { type: 'fire', amount: RULES.MAX_ELEMENT_COST + 1 } },
      attack: 1,
      hp: 1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid element', () => {
    const result = cardSchema.safeParse({
      id: 'x',
      name: 'X',
      type: 'unit',
      element: 'plasma',
      cost: { energy: 1 },
      attack: 1,
      hp: 1,
    });
    expect(result.success).toBe(false);
  });
});

describe('deck schema', () => {
  const validEntries = Array.from({ length: 10 }, (_, i) => ({
    cardId: `card-${i}`,
    count: 3,
  })); // 10 * 3 = 30 (RULES.DECK_SIZE)

  it('accepts an exactly-DECK_SIZE deck', () => {
    const deck = parseDeck({ name: 'D', leaderId: 'kedou', cards: validEntries });
    expect(deck.cards).toHaveLength(10);
  });

  it('rejects a deck that is not exactly DECK_SIZE cards', () => {
    const short = validEntries.slice(0, 9); // 27
    const result = parseDeckSafe({ name: 'D', leaderId: 'kedou', cards: short });
    expect(result.success).toBe(false);
  });

  it('rejects more than MAX_COPIES of a card', () => {
    const result = parseDeckSafe({
      name: 'D',
      leaderId: 'kedou',
      cards: [{ cardId: 'a', count: RULES.MAX_COPIES + 1 }],
    });
    expect(result.success).toBe(false);
  });
});

describe('buff-grant keyword contract', () => {
  // Grantability is a blocklist: every passive keyword the engine reads straight off
  // unit.keywords is grantable via a `buff` effect; only keywords needing build-time or
  // creation-time wiring are excluded.
  it('accepts passive keywords as grants', () => {
    for (const kw of [
      { strikeThrough: true },
      { spike: 2 },
      { tough: 1 },
      { immunity: true },
      { trueShield: true },
      { zombified: true },
      { growth: { attack: 1, hp: 1 } },
      { bloodlust: { buff: { attack: 1 } } },
    ]) {
      expect(effectGrantKeywordsSchema.safeParse(kw).success).toBe(true);
    }
  });

  it('rejects keywords that a bare keyword merge cannot wire up', () => {
    for (const kw of [
      { producer: { amount: 1, element: 'nature' } }, // build-time expanded
      { healer: { amount: 1, target: 'ally', trigger: 'endOfTurn' } }, // build-time expanded
      { mover: { scope: 'enemy' } }, // build-time expanded
      { shield: 1 }, // live counter is unit.shield, seeded at creation
      { doubleTeam: true }, // lane-capacity structural flag
      { metamorphosis: { everyTurns: 2 } }, // needs creation-time scheduling
      { bloodlust: { effects: [{ kind: 'damage', amount: 1 }] } }, // Effect[] form is authoring-only
    ]) {
      expect(effectGrantKeywordsSchema.safeParse(kw).success).toBe(false);
    }
  });

  it('lets a buff effect grant a passive keyword end-to-end', () => {
    const ok = cardSchema.safeParse({
      id: 'g', name: 'G', type: 'spell', element: 'nature', cost: { energy: 1 },
      effects: [{ kind: 'buff', target: 'ally', keywords: { spike: 2 } }],
    });
    expect(ok.success).toBe(true);
    const bad = cardSchema.safeParse({
      id: 'g', name: 'G', type: 'spell', element: 'nature', cost: { energy: 1 },
      effects: [{ kind: 'buff', target: 'ally', keywords: { producer: { amount: 1, element: 'nature' } } }],
    });
    expect(bad.success).toBe(false);
  });
});

// local helper to avoid importing the schema object just for safeParse
import { deckSchema, effectGrantKeywordsSchema } from '@cards/schema';
function parseDeckSafe(data: unknown) {
  return deckSchema.safeParse(data);
}
