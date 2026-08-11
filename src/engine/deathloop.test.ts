import { describe, expect, it } from 'vitest';
import { buildRegistry } from '@cards/registry';
import { starterCards, starterLeaders, deckDoT, deckStall } from '@cards/data/starter';
import { playHeroGame } from '@engine/sim';

const registry = buildRegistry(starterCards, starterLeaders);

// Regression: Kamikaze (death-trigger damage) and Polish (on-damage trigger) used to recurse
// forever — processDeaths fired a dying unit's Kamikaze while it was still on the board, the
// damage re-triggered Polish, whose nested processDeaths re-found the same 0-HP unit and fired
// its Kamikaze again. The `dying` guard breaks the cycle. This DoT-vs-Stall game hit it.
describe('death-trigger recursion', () => {
  it('resolves Kamikaze + Polish chains without a stack overflow', () => {
    for (let seed = 70; seed <= 80; seed++) {
      // usePlan:false — this guards death-trigger RECURSION, which the AI policy cannot affect,
      // and the planning search (sim.ts's default) is ~50x slower per game.
      expect(() => playHeroGame(registry, deckDoT, deckStall, (seed % 2) as 0 | 1, seed, false)).not.toThrow();
    }
  }, 30000);
});
