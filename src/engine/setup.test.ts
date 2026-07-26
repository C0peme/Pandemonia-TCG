import { describe, expect, it } from 'vitest';
import { initGame } from '@engine/setup';
import { RULES } from '@engine/constants';
import { makeDeck, tenVanilla, testRegistry } from '@engine/testkit';

const decks = (): [ReturnType<typeof makeDeck>, ReturnType<typeof makeDeck>] => [
  makeDeck(tenVanilla, 'A'),
  makeDeck(tenVanilla, 'B'),
];

describe('initGame', () => {
  it('deals opening hands and draws for the first player', () => {
    const s = initGame({ registry: testRegistry, decks: decks(), seed: 42 });
    // First player drew 1 on turn start (5 + 1), opponent still at 5.
    expect(s.players[0].hand).toHaveLength(RULES.STARTING_HAND + 1);
    expect(s.players[1].hand).toHaveLength(RULES.STARTING_HAND);
    expect(s.players[0].deck).toHaveLength(RULES.DECK_SIZE - RULES.STARTING_HAND - 1);
    expect(s.players[1].deck).toHaveLength(RULES.DECK_SIZE - RULES.STARTING_HAND);
  });

  it('gives the active player round-1 energy', () => {
    const s = initGame({ registry: testRegistry, decks: decks(), seed: 42 });
    expect(s.round).toBe(1);
    expect(s.players[s.active].energy).toBe(1);
  });

  it('is deterministic for a given seed', () => {
    const a = initGame({ registry: testRegistry, decks: decks(), seed: 7 });
    const b = initGame({ registry: testRegistry, decks: decks(), seed: 7 });
    expect(a.players[0].hand).toEqual(b.players[0].hand);
    expect(a.players[1].deck).toEqual(b.players[1].deck);
  });

  it('produces different hands for different seeds', () => {
    const a = initGame({ registry: testRegistry, decks: decks(), seed: 1 });
    const b = initGame({ registry: testRegistry, decks: decks(), seed: 2 });
    expect(a.players[0].hand).not.toEqual(b.players[0].hand);
  });
});
