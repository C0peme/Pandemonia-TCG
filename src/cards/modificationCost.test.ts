import { describe, expect, it } from 'vitest';
import { starterCards, starterLeaders } from '@cards/data/starter';
import { buildRegistry } from '@cards/registry';
import { blankState } from '@engine/testkit';
import { applyAction } from '@engine/engine';

/**
 * Ring Leader's Modification grants +1 attack PERMANENTLY, so activation k adds attack to
 * every remaining turn — total value is quadratic in game length while a flat HP price is
 * linear. Probed at -55.2pp vs a mid-pack leader's -35.4pp (`.tuning/heroDisable.ts`), and
 * Guardian measured 61.6-66.3% across every meta run this session — the one leader whose
 * power itself, not its card suite, is the outlier. Fix: escalating HP cost (1,2,3...) makes
 * cost quadratic too, and the energy cost moved 1->2 so it can no longer act on turn 1.
 */
describe('Modification escalating HP cost', () => {
  it('costs 1, 2, 3... HP on successive activations THIS GAME', () => {
    const registry = buildRegistry(starterCards as any[], starterLeaders as any[]);
    let s = blankState({ active: 0 });
    s.players[0].leaderId = 'ringleader';
    s.players[0].energy = 20;
    s.players[0].leaderHp = 30;
    const hpAfter = (): number => s.players[0].leaderHp;
    const before1 = hpAfter();
    s = applyAction(registry, s, { type: 'heroPower' }).state;
    expect(before1 - hpAfter()).toBe(1); // 1st use: base hpCost, step*0
    s.players[0].heroPowerUsed = false; // bypass the once-per-turn gate to isolate the cost curve
    const before2 = hpAfter();
    s = applyAction(registry, s, { type: 'heroPower' }).state;
    expect(before2 - hpAfter()).toBe(2); // 2nd use: 1 + step*1
    s.players[0].heroPowerUsed = false;
    const before3 = hpAfter();
    s = applyAction(registry, s, { type: 'heroPower' }).state;
    expect(before3 - hpAfter()).toBe(3); // 3rd use: 1 + step*2
  });

  it('costs 2 energy, not the old 1 (was live turn 1 at 1e)', () => {
    const leader = (starterLeaders as any[]).find((l) => l.id === 'ringleader');
    expect(leader.heroPower.cost.energy).toBe(2);
  });
});
