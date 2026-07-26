/**
 * Deck import/export codec. A deck is portable as either a JSON file or a compact one-line
 * "code" string, so players can save decks outside their own localStorage and share them —
 * useful in multiplayer, where a joiner builds against the host's pool but keeps decks locally.
 *
 * Code format: `PANDECK1.<base64(utf8(json))>` — a single, paste-safe token. Decoding also
 * accepts raw JSON (a pasted `{ ... }`) so either form round-trips.
 */
import { deckSchema, type Deck } from '@cards/schema';

const PREFIX = 'PANDECK1.';

const toBase64 = (s: string): string => {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
};

const fromBase64 = (b64: string): string => {
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

/** Encode a deck as a compact, shareable code string. */
export const encodeDeck = (deck: Deck): string => PREFIX + toBase64(JSON.stringify(deck));

/** Pretty JSON form of a deck, for file download. */
export const deckToJson = (deck: Deck): string => JSON.stringify(deck, null, 2);

/**
 * Decode a deck from a code string OR raw JSON (validated against the deck schema — shape,
 * size, and copy limits, but NOT card existence; the caller validates against a registry).
 * Throws a readable error on malformed input.
 */
export const decodeDeck = (input: string): Deck => {
  const trimmed = input.trim();
  const json = trimmed.startsWith('{')
    ? trimmed
    : fromBase64(trimmed.startsWith(PREFIX) ? trimmed.slice(PREFIX.length) : trimmed);
  return deckSchema.parse(JSON.parse(json));
};
