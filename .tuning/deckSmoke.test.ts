import { describe, expect, it } from 'vitest';
import { starterRegistry, starterDecks } from '@cards/data/starter';
import { simulateGame } from '@engine/sim';
import type { Deck } from '@cards/schema';

/**
 * PRE-FLIGHT. The new mechanics (Countdown, Metamorphosis, amountFrom, Neutral cards, the
 * hit-resolution rework) are covered in isolation but had never been played in a full game
 * inside a real deck. Greedy so it is seconds, not hours — this is looking for CRASHES and
 * DEAD CARDS, not win rates.
 */
// OPT-IN: ~2 min even on greedy (78 pairings x several seeds). Run before a long meta:
//   RUN_BALANCE=1 npx vitest run .tuning/deckSmoke.test.ts (copy into src/ first — vitest
//   only includes src/**). Kept out of the default suite for its runtime.
const RUN_BALANCE = process.env.RUN_BALANCE === '1';

describe.skipIf(!RUN_BALANCE)('deck smoke test', () => {
  it('every deck pairing plays to completion without error', () => {
    const decks = starterDecks as unknown as Deck[];
    for (let i = 0; i < decks.length; i++) {
      for (let j = i + 1; j < decks.length; j++) {
        for (const seed of [1, 77]) {
          const r = simulateGame(starterRegistry, [decks[i]!, decks[j]!], seed, false);
          expect([0, 1], `${decks[i]!.name} vs ${decks[j]!.name}`).toContain(r.winner);
          expect(r.turns).toBeGreaterThan(0);
        }
      }
    }
  }, 600_000);

  it('reports cards that NEVER get played across the whole field', () => {
    const decks = starterDecks as unknown as Deck[];
    const played = new Set<string>();
    const owned = new Map<string, string>();
    for (const d of decks) for (const e of d.cards) owned.set(e.cardId, d.name);
    for (let i = 0; i < decks.length; i++) {
      for (let j = i + 1; j < decks.length; j++) {
        for (const seed of [1, 77, 500]) {
          const r = simulateGame(starterRegistry, [decks[i]!, decks[j]!], seed, false);
          for (const side of [0, 1] as const) for (const id of Object.keys(r.played[side])) played.add(id);
        }
      }
    }
    const dead = [...owned.entries()].filter(([id]) => !played.has(id));
    if (dead.length) {
      console.log(`\n${dead.length} deck cards NEVER played in any game:`);
      for (const [id, deck] of dead) console.log(`  ${id.padEnd(22)} (${deck})`);
    } else {
      console.log('\nevery card in every deck got played at least once');
    }
  }, 900_000);
});
