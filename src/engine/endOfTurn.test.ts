import { describe, expect, it } from 'vitest';
import { resolveEndOfTurn } from '@engine/endOfTurn';
import { blankState, place, unit } from '@engine/testkit';
import { RULES } from '@engine/constants';
import type { GameEvent } from '@engine/events';
import type { GameState } from '@engine/types';

const eot = (s: GameState, player: 0 | 1 = 0): GameEvent[] => {
  const events: GameEvent[] = [];
  resolveEndOfTurn(s, player, events);
  return events;
};

describe('end-of-turn effects', () => {
  it('Burn does not damage at end of turn — it expires there (it procs in combat)', () => {
    const s = blankState();
    place(s, 0, 'ground1', unit({ owner: 0, attack: 2, hp: 5, status: { burn: 2 } }));
    eot(s);
    const u = s.players[0].lanes.ground1.front!;
    expect(u.hp).toBe(5);           // no end-of-turn burn damage
    expect(u.status.burn).toBeUndefined(); // burn's one-turn lifespan ends here
  });

  it('Growth increases stats', () => {
    const s = blankState();
    place(s, 0, 'ground1', unit({ owner: 0, attack: 2, hp: 3, keywords: { growth: { attack: 1, hp: 1 } } }));
    eot(s);
    const u = s.players[0].lanes.ground1.front!;
    expect(u.attack).toBe(3);
    expect(u.maxHp).toBe(4);
    expect(u.hp).toBe(4);
  });

  it('Producer banks element energy, capped at the per-element cap', () => {
    const s = blankState(); // default fire cap is 2
    place(s, 0, 'ground1', unit({ owner: 0, keywords: { producer: { amount: 2, element: 'fire' } } }));
    s.players[0].bank.fire = 1; // cap 2, room for only 1 more
    eot(s);
    expect(s.players[0].bank.fire).toBe(2); // filled to cap, not 3
  });

  it('Poison deals constant damage each turn and blocks stat gains', () => {
    const s = blankState();
    place(
      s,
      0,
      'ground1',
      unit({ owner: 0, attack: 2, hp: 5, status: { poisoned: 1 }, keywords: { growth: { attack: 2 } } }),
    );
    eot(s);
    const u = s.players[0].lanes.ground1.front!;
    expect(u.attack).toBe(2); // Growth blocked by Poison; attack unchanged
    expect(u.hp).toBe(5 - RULES.POISON_DAMAGE); // constant damage applied
  });

  it('Poison ticks on BOTH players at end of turn, not just the active side', () => {
    const s = blankState();
    place(s, 0, 'ground1', unit({ owner: 0, attack: 0, hp: 5, status: { poisoned: 1 } }));
    place(s, 1, 'ground1', unit({ owner: 1, attack: 0, hp: 5, status: { poisoned: 1 } }));
    eot(s, 0); // active = 0
    expect(s.players[0].lanes.ground1.front?.hp).toBe(5 - RULES.POISON_DAMAGE); // active side
    expect(s.players[1].lanes.ground1.front?.hp).toBe(5 - RULES.POISON_DAMAGE); // opponent too
  });

  it('Sleep heals, ticks down, and wakes', () => {
    const s = blankState();
    place(s, 0, 'ground1', unit({ owner: 0, attack: 3, hp: 2, status: { sleep: 2, sleepHeal: 2 } }));
    s.players[0].lanes.ground1.front!.maxHp = 5;
    eot(s);
    expect(s.players[0].lanes.ground1.front?.hp).toBe(4);
    expect(s.players[0].lanes.ground1.front?.status.sleep).toBe(1);
    eot(s);
    expect(s.players[0].lanes.ground1.front?.status.sleep).toBe(0);
  });

  it('only resolves the active player units', () => {
    const s = blankState();
    place(s, 1, 'ground1', unit({ owner: 1, attack: 2, hp: 5, status: { burn: 2 } }));
    eot(s, 0); // active = 0
    expect(s.players[1].lanes.ground1.front?.hp).toBe(5); // untouched
  });
});
