import { describe, expect, it } from 'vitest';
import { decodeDeck, deckToJson, encodeDeck } from '@cards/deckCodec';
import type { Deck } from '@cards/schema';
import { makeDeck, tenVanilla } from '@engine/testkit';

describe('deckCodec', () => {
  const deck: Deck = makeDeck(tenVanilla, 'Röyal Flush ♠'); // unicode name exercises utf8 path

  it('round-trips a deck through the code string', () => {
    const code = encodeDeck(deck);
    expect(code.startsWith('PANDECK1.')).toBe(true);
    expect(decodeDeck(code)).toEqual(deck);
  });

  it('round-trips through pretty JSON', () => {
    expect(decodeDeck(deckToJson(deck))).toEqual(deck);
  });

  it('accepts raw pasted JSON (no prefix)', () => {
    expect(decodeDeck(JSON.stringify(deck))).toEqual(deck);
  });

  it('rejects malformed input', () => {
    expect(() => decodeDeck('not a deck')).toThrow();
    expect(() => decodeDeck('{"name":"x"}')).toThrow(); // fails deck schema
  });
});
