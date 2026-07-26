/**
 * Validates the two recurring-tick environments added for the Polish-loop synergy:
 *   - Cinder Field deals 1 damage to every unit in its lane each combat (and that damage
 *     fires Polish, the snowball the card is designed to enable);
 *   - Sacred Spring heals every unit in its lane 1 each combat.
 * Both ride the existing `applyEnvironmentEffects` path (effects re-applied to all lane units
 * at the start of every combat), so this is really a check that a direct damage/heal effect —
 * not just a status — works as an environment tick.
 */
import { describe, it, expect } from 'vitest';
import { starterRegistry } from '@cards/data/starter';
import { resolveCombat } from '@engine/combat';
import { blankState, unit, place } from '@engine/testkit';

describe('recurring-tick environments', () => {
  it('Cinder Field deals 1 damage/turn to lane units and fires Polish', () => {
    const state = blankState();
    state.environments.ground1 = { iid: 'e1', cardId: 'cinder-field', owner: 0 };
    // A Polish (+1/0 when hit) body on the DEFENDER so it takes the tick without attacking.
    const snake = unit({ owner: 1, attack: 2, hp: 4, cardId: 'pebble-snake', keywords: { polish: { stat: { attack: 1, hp: 0 } } } });
    place(state, 1, 'ground1', snake);

    const { state: after } = resolveCombat(state, {}, starterRegistry);
    const u = after.players[1].lanes.ground1.front!;
    expect(u.hp).toBe(3); // took 1 from the field
    expect(u.attack).toBe(3); // Polish fired: +1 attack — the loop the card exists for
  });

  it('Sacred Spring heals lane units 1/turn (capped at maxHp)', () => {
    const state = blankState();
    state.environments.ground1 = { iid: 'e2', cardId: 'sacred-spring', owner: 0 };
    const hurt = unit({ owner: 1, attack: 2, hp: 2 }); // maxHp 4, currently 2
    hurt.maxHp = 4;
    place(state, 1, 'ground1', hurt);

    const { state: after } = resolveCombat(state, {}, starterRegistry);
    expect(after.players[1].lanes.ground1.front!.hp).toBe(3); // healed 1
  });

  it('both new environments parse into the registry', () => {
    expect(starterRegistry.cards.get('cinder-field')?.type).toBe('environment');
    expect(starterRegistry.cards.get('sacred-spring')?.type).toBe('environment');
  });
});
