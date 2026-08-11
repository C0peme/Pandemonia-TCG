/**
 * COUNTDOWN — a timer the OWNER sets. The distinction from the game's other delayed mechanics
 * is who controls the clock: Kamikaze fires on death (the opponent picks the moment by choosing
 * whether to kill it), Metamorphosis is a timer that upgrades, Countdown is a threat that must
 * be answered EARLY or played around.
 */
import { describe, expect, it } from 'vitest';
import { resolveEndOfTurn } from '@engine/endOfTurn';
import { blankState, unit, place, testRegistry } from '@engine/testkit';
import type { GameEvent } from '@engine/events';

const tick = (s: ReturnType<typeof blankState>, times: number) => {
  for (let i = 0; i < times; i++) {
    const events: GameEvent[] = [];
    resolveEndOfTurn(s, 0, events, testRegistry);
  }
};

describe('countdown', () => {
  it('does not fire before its turn count', () => {
    const s = blankState();
    place(s, 0, 'ground1', unit({ owner: 0, attack: 1, hp: 5,
      keywords: { countdown: { turns: 3, effects: [{ kind: 'damage', amount: 2, target: 'enemy' }] } } }));
    place(s, 1, 'ground1', unit({ owner: 1, attack: 0, hp: 9 }));
    tick(s, 2);
    expect(s.players[1].lanes.ground1.front!.hp).toBe(9);
  });

  it('fires exactly on its turn — and only ONCE without repeat', () => {
    const s = blankState();
    place(s, 0, 'ground1', unit({ owner: 0, attack: 1, hp: 5,
      keywords: { countdown: { turns: 2, effects: [{ kind: 'damage', amount: 2, target: 'enemy' }] } } }));
    place(s, 1, 'ground1', unit({ owner: 1, attack: 0, hp: 9 }));
    tick(s, 2);
    expect(s.players[1].lanes.ground1.front!.hp).toBe(7);
    tick(s, 4); // well past the timer
    expect(s.players[1].lanes.ground1.front!.hp).toBe(7); // still one hit only
  });

  it('repeat fires every N turns', () => {
    const s = blankState();
    place(s, 0, 'ground1', unit({ owner: 0, attack: 1, hp: 5,
      keywords: { countdown: { turns: 2, effects: [{ kind: 'damage', amount: 2, target: 'enemy' }], repeat: true } } }));
    place(s, 1, 'ground1', unit({ owner: 1, attack: 0, hp: 20 }));
    tick(s, 6); // fires at 2, 4, 6
    expect(s.players[1].lanes.ground1.front!.hp).toBe(14);
  });

  it('consume destroys the carrier AFTER its effects resolve', () => {
    const s = blankState();
    place(s, 0, 'ground1', unit({ owner: 0, attack: 1, hp: 5,
      keywords: { countdown: { turns: 1, effects: [{ kind: 'damage', amount: 3, target: 'all-enemy' }], consume: true } } }));
    place(s, 1, 'ground1', unit({ owner: 1, attack: 0, hp: 9 }));
    tick(s, 1);
    expect(s.players[1].lanes.ground1.front!.hp).toBe(6); // the bomb went off...
    expect(s.players[0].lanes.ground1.front).toBeUndefined(); // ...and took itself with it
  });

  it('carries an arbitrary effect, not just damage', () => {
    const s = blankState();
    s.players[0].leaderHp = 20;
    place(s, 0, 'ground1', unit({ owner: 0, attack: 1, hp: 5,
      keywords: { countdown: { turns: 1, effects: [{ kind: 'heal', amount: 4, target: 'leader' }] } } }));
    tick(s, 1);
    expect(s.players[0].leaderHp).toBe(24);
  });
});
