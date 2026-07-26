import { describe, it, expect } from 'vitest';
import { applyFoundation, revertFoundation } from '@engine/foundation';
import { unit } from '@engine/testkit';
import { parseCard, type FoundationCard } from '@cards/schema';

const found = (grants: FoundationCard['grants'], id = 'test-found'): FoundationCard =>
  parseCard({ id, name: id, type: 'foundation', element: 'earth', cost: { energy: 2 }, attack: 1, hp: 2, grants }) as FoundationCard;

describe('foundation grants: onHit + per-turn effects', () => {
  it('grants onHit to a host that has none, and clears it on revert', () => {
    const host = unit({ owner: 0, attack: 2, hp: 3 });
    expect(host.onHit).toBeUndefined();
    host.foundation = applyFoundation(host, found({ onHit: { burn: 1 } }), 'f1');
    expect(host.onHit).toEqual({ burn: 1 });
    revertFoundation(host, host.foundation!);
    expect(host.onHit).toBeUndefined();
  });

  it('does not overwrite a host that already has onHit', () => {
    const host = unit({ owner: 0, attack: 2, hp: 3, onHit: { poison: true } });
    host.foundation = applyFoundation(host, found({ onHit: { burn: 1 } }), 'f1');
    expect(host.onHit).toEqual({ poison: true }); // untouched
    revertFoundation(host, host.foundation!);
    expect(host.onHit).toEqual({ poison: true }); // still there
  });

  it('appends per-turn effects and splices exactly them off on revert', () => {
    const host = unit({ owner: 0, attack: 2, hp: 3 });
    expect(host.endOfTurn).toBeUndefined();
    host.foundation = applyFoundation(host, found({ endOfTurn: [{ kind: 'energy', amount: 1, element: 'nature' }] }), 'f1');
    expect(host.endOfTurn).toHaveLength(1);
    expect(host.endOfTurn![0]).toMatchObject({ kind: 'energy', amount: 1 });
    revertFoundation(host, host.foundation!);
    expect(host.endOfTurn).toHaveLength(0);
  });

  it('preserves the host\'s own per-turn effects when reverting a grant', () => {
    const host = unit({ owner: 0, attack: 2, hp: 3 });
    host.endOfTurn = [{ kind: 'heal', amount: 2, target: 'self' }]; // intrinsic trigger
    host.foundation = applyFoundation(host, found({ endOfTurn: [{ kind: 'energy', amount: 1, element: 'nature' }] }), 'f1');
    expect(host.endOfTurn).toHaveLength(2);
    revertFoundation(host, host.foundation!);
    expect(host.endOfTurn).toEqual([{ kind: 'heal', amount: 2, target: 'self' }]); // only the grant removed
  });
});
