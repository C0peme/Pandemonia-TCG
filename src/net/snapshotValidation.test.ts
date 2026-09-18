import { describe, expect, it } from 'vitest';
import { parseSnapshot, registryFromSnapshot, type ContentSnapshot } from '@cards/snapshot';
import { starterCards, starterLeaders, starterDecks } from '@cards/data/starter';
import { buildRegistry } from '@cards/registry';

/**
 * `parseSnapshot` is the defensive parse for content arriving over the wire. It is only
 * safe to put on that boundary if a LEGITIMATE snapshot survives it unchanged — a filter
 * that silently drops valid cards would turn a robustness fix into a blank card pool.
 *
 * The subtlety it has to clear: a snapshot is taken from a built Registry, so its cards
 * have already been through `expandKeywordEffects`. Those expanded cards must still satisfy
 * `cardSchema`, which is strict in places.
 */
describe('wire snapshot validation', () => {
  const registry = buildRegistry(starterCards, starterLeaders);
  const live: ContentSnapshot = {
    cards: [...registry.cards.values()],
    leaders: [...registry.leaders.values()],
    decks: starterDecks,
  };

  it('passes a real, already-expanded snapshot through without dropping anything', () => {
    const parsed = parseSnapshot(live);
    expect(parsed.cards.length).toBe(live.cards.length);
    expect(parsed.leaders.length).toBe(live.leaders.length);
    expect(parsed.decks.length).toBe(live.decks.length);
  });

  it('drops only the malformed entries, keeping the rest', () => {
    const parsed = parseSnapshot({
      cards: [...live.cards, { id: 'junk', nonsense: true }, null, 'not a card'],
      leaders: [...live.leaders, { id: 'junk' }],
      decks: [...live.decks, { name: 'bad' }],
    });
    expect(parsed.cards.length).toBe(live.cards.length);
    expect(parsed.leaders.length).toBe(live.leaders.length);
    expect(parsed.decks.length).toBe(live.decks.length);
  });

  it('never throws on hostile shapes, and yields a registry that is merely empty', () => {
    for (const hostile of [null, undefined, 42, 'x', [], { cards: 'no' }, { cards: [1, 2] }]) {
      expect(() => parseSnapshot(hostile)).not.toThrow();
      const snap = parseSnapshot(hostile);
      expect(() => registryFromSnapshot(snap)).not.toThrow();
    }
  });

  it('is what stands between a hostile snapshot and registryFromSnapshot', () => {
    // Unvalidated, a non-object card reaches `expandKeywordEffects` and throws — which is
    // what the wire boundary used to hand straight to the registry builder.
    const raw = { cards: [null], leaders: [], decks: [] } as unknown as ContentSnapshot;
    expect(() => registryFromSnapshot(raw)).toThrow();
    expect(() => registryFromSnapshot(parseSnapshot(raw))).not.toThrow();
  });
});
