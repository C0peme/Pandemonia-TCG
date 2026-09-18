import { describe, expect, it } from 'vitest';
import { blankState, testRegistry, unit, place } from '@engine/testkit';
import { relocateUnit, locateUnit } from '@engine/board';
import type { GameEvent } from '@engine/events';

/**
 * Aquatic cards now read "+N in Water" and are printed with weaker base stats, so the bonus
 * is what makes them playable at all. The engine fires an `aquatic` EFFECT LIST in exactly two
 * places — playing a unit into Water, and summoning into Water — with no revert on leaving and
 * no trigger on relocating in. These tests pin down what the engine actually does, so the gap
 * between "in Water" and "on entering Water by one specific route" is visible rather than
 * folklore.
 */
describe('aquatic bonus: what the engine actually does', () => {
  it('a unit RELOCATED into Water does not gain its aquatic bonus', () => {
    const s = blankState();
    const u = unit({ owner: 0, attack: 1, hp: 2, keywords: { aquatic: [{ kind: 'buff', target: 'self', stat: { attack: 2 } }] } as any });
    place(s, 0, 'ground1', u);
    const before = s.players[0].lanes.ground1.front!.attack;
    const ev: GameEvent[] = [];
    relocateUnit(testRegistry, s, locateUnit(s, u.iid)!, 'water', ev);
    const after = s.players[0].lanes.water.front ?? s.players[0].lanes.water.back;
    // Documents the CURRENT behaviour: movement is not a water entry as far as the bonus goes.
    expect(before).toBe(1);
    expect(after?.attack).toBe(1);
  });

  it('the bonus, once gained, PERSISTS after the unit leaves Water', () => {
    const s = blankState();
    const u = unit({ owner: 0, attack: 1, hp: 2, keywords: { aquatic: [{ kind: 'buff', target: 'self', stat: { attack: 2 } }] } as any });
    place(s, 0, 'water', u);
    // Simulate the on-entry grant the play path performs.
    const boosted = s.players[0].lanes.water.front!;
    boosted.attack += 2;
    const ev: GameEvent[] = [];
    relocateUnit(testRegistry, s, locateUnit(s, u.iid)!, 'heights', ev);
    const moved = s.players[0].lanes.heights.front;
    expect(moved?.attack).toBe(3); // still carrying a Water bonus while in the Heights
  });
});
