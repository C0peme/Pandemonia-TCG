import { describe, expect, it } from 'vitest';

// These assert PLUMBING and determinism, not balance, so they opt out of the planning AI
// (sim.ts defaults to it) explicitly — planTurn is ~50x slower per game and would make this
// file take minutes for assertions the policy cannot affect.
import { buildRegistry } from '@cards/registry';
import { starterCards, starterLeaders, deckAggro, deckControl } from '@cards/data/starter';
import { simulateGame, runBatch, runField, runMeta } from '@engine/sim';

const registry = buildRegistry(starterCards, starterLeaders);

describe('sim', () => {
  it('plays an AI-vs-AI game to a decisive result', () => {
    const r = simulateGame(registry, [deckAggro, deckControl], 1, false);
    expect(r.winner === 0 || r.winner === 1).toBe(true);
    expect(r.turns).toBeGreaterThan(0);
    // At least one side should have played some cards.
    const played = Object.keys(r.played[0]).length + Object.keys(r.played[1]).length;
    expect(played).toBeGreaterThan(0);
    // Combat happened, so at least one side dealt some attack damage.
    const dmg = Object.values(r.damageByCard[0]).reduce((s, n) => s + n, 0) + Object.values(r.damageByCard[1]).reduce((s, n) => s + n, 0);
    expect(dmg).toBeGreaterThan(0);
    expect(r.heroPowers[0]).toBeGreaterThanOrEqual(0);
  });

  it('is deterministic for a fixed seed', () => {
    const a = simulateGame(registry, [deckAggro, deckControl], 7, false);
    const b = simulateGame(registry, [deckAggro, deckControl], 7, false);
    expect(b).toEqual(a);
  });

  it('aggregates a batch with win counts summing to the game count', () => {
    const res = runBatch(registry, [deckAggro, deckControl], 12, 1, false);
    expect(res.wins[0] + res.wins[1]).toBe(12);
    expect(res.cards[0].length).toBe(deckAggro.cards.length);
    // Every aggregate's games-played never exceeds the batch size.
    for (const side of [0, 1] as const) for (const c of res.cards[side]) expect(c.gamesPlayedIn).toBeLessThanOrEqual(12);
  }, 30000);

  it('runs a deck against a small field with matchups + aggregated cards', () => {
    const res = runField(registry, deckAggro, [{ deck: deckControl, name: 'Control' }], 6, 1, false);
    expect(res.totalGames).toBe(6);
    expect(res.matchups).toHaveLength(1);
    expect(res.matchups[0]!.wins).toBeLessThanOrEqual(6);
    expect(res.cards.length).toBe(deckAggro.cards.length);
    for (const c of res.cards) expect(c.gamesPlayedIn).toBeLessThanOrEqual(6);
  }, 30000);

  it('round-robins a meta matrix with symmetric, complementary cells', () => {
    const field = [
      { deck: deckAggro, name: 'Aggro' },
      { deck: deckControl, name: 'Control' },
    ];
    const res = runMeta(registry, field, 6, 1, false);
    expect(res.decks).toEqual(['Aggro', 'Control']);
    // Alternating sides => i-wins + j-wins == gamesPer.
    expect(res.matrix[0]![1]! + res.matrix[1]![0]!).toBe(6);
    expect(res.matrix[0]![0]).toBe(0); // diagonal unused
    expect(res.overall[0]).toBeCloseTo(res.matrix[0]![1]! / 6);
  }, 30000);
});
