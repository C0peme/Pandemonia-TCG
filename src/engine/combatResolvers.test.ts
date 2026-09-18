import { describe, expect, it } from 'vitest';
import { resolveCombat, resolveCombatByLane } from '@engine/combat';
import { blankState, place, unit, testRegistry } from '@engine/testkit';
import type { GameState } from '@engine/types';

/**
 * There are two combat entry points: `resolveCombat` (flat, used by the reducer and by the
 * AI's beam search) and `resolveCombatByLane` (sliced per lane so the UI can animate it).
 * Their doc comment claims they are mechanically identical, and they must be — but they are
 * two separate loops, and nothing checked that they still agree.
 *
 * They are kept apart on purpose: the per-lane version snapshots the board after every lane,
 * which is exactly the cost the AI cannot pay inside its search. So this asserts the
 * equivalence instead of merging them.
 */
const boards: Array<[string, () => GameState]> = [
  ['a plain trade in one lane', () => {
    const s = blankState();
    place(s, 0, 'ground1', unit({ owner: 0, attack: 3, hp: 3 }));
    place(s, 1, 'ground1', unit({ owner: 1, attack: 2, hp: 4 }));
    return s;
  }],
  ['attackers in every lane, some unopposed', () => {
    const s = blankState();
    place(s, 0, 'heights', unit({ owner: 0, attack: 2, hp: 2, keywords: { airborne: true } }));
    place(s, 0, 'ground1', unit({ owner: 0, attack: 3, hp: 3 }));
    place(s, 0, 'ground2', unit({ owner: 0, attack: 1, hp: 5 }));
    place(s, 0, 'heights2', unit({ owner: 0, attack: 4, hp: 1, keywords: { airborne: true } }));
    place(s, 1, 'ground1', unit({ owner: 1, attack: 2, hp: 4 }));
    place(s, 1, 'heights2', unit({ owner: 1, attack: 1, hp: 6, keywords: { airborne: true } }));
    return s;
  }],
  ['a lethal swing that ends the game mid-order', () => {
    const s = blankState();
    s.players[1].leaderHp = 3;
    place(s, 0, 'ground1', unit({ owner: 0, attack: 9, hp: 9 }));
    place(s, 0, 'ground2', unit({ owner: 0, attack: 9, hp: 9 }));
    return s;
  }],
  ['retaliation shared across attackers in one lane', () => {
    const s = blankState();
    place(s, 0, 'ground1', unit({ owner: 0, attack: 2, hp: 6, keywords: { doubleTeam: true } }));
    s.players[0].lanes.ground1.back = unit({ owner: 0, attack: 2, hp: 6 });
    place(s, 1, 'ground1', unit({ owner: 1, attack: 3, hp: 9 }));
    return s;
  }],
  ['a standalone Foundation attacking alongside units', () => {
    const s = blankState();
    place(s, 0, 'ground1', unit({ owner: 0, attack: 2, hp: 4 }));
    s.players[0].lanes.ground2.standaloneFoundation = unit({ owner: 0, attack: 3, hp: 5 });
    place(s, 1, 'ground2', unit({ owner: 1, attack: 1, hp: 7 }));
    return s;
  }],
];

describe('the two combat resolvers agree', () => {
  for (const [name, build] of boards) {
    it(`produces the same state and events for ${name}`, () => {
      // ONE board for both: `unit()` mints a fresh iid per call, so building twice would
      // differ by identity alone. Both resolvers clone their input, so sharing it is safe.
      const board = build();
      const flat = resolveCombat(board, undefined, testRegistry);
      const sliced = resolveCombatByLane(board, undefined, testRegistry);
      expect(sliced.state).toEqual(flat.state);
      expect(sliced.events).toEqual(flat.events);
    });
  }

  it('the sliced run concatenates to exactly the flat event stream', () => {
    const sliced = resolveCombatByLane(boards[1]![1](), undefined, testRegistry);
    expect(sliced.steps.flatMap((s) => s.events)).toEqual(sliced.events);
  });
});
