/**
 * `amountFrom: 'targetAttack'` — Earth's counter-punch removal. Answers threats, dead against
 * chaff. Differentiated by CONDITION rather than price (energy is uncapped, so price is a weak
 * restraint after the early game).
 */
import { describe, expect, it } from 'vitest';
import { applyEffects } from '@engine/effects';
import { blankState, unit, place, testRegistry } from '@engine/testkit';
import type { GameEvent } from '@engine/events';
import type { Effect } from '@cards/schema';

const hitFor = (attack: number, hp: number) => {
  const s = blankState();
  const u = unit({ owner: 1, attack, hp });
  place(s, 1, 'ground1', u);
  const events: GameEvent[] = [];
  applyEffects(s, 0, [{ kind: 'damage', target: 'enemy', amountFrom: 'targetAttack' } as Effect],
    [{ kind: 'unit', iid: u.iid }], undefined, events, testRegistry);
  return u;
};

describe('damage scaled to the target', () => {
  it('deals the target its own attack', () => {
    expect(hitFor(5, 9).hp).toBe(4);
  });

  it('kills a big threat outright', () => {
    expect(hitFor(5, 5).hp).toBeLessThanOrEqual(0);
  });

  it('is DEAD against a 0-attack wall — the condition that balances it', () => {
    expect(hitFor(0, 5).hp).toBe(5);
  });

  it('scales down against chaff', () => {
    expect(hitFor(1, 4).hp).toBe(3);
  });
});
