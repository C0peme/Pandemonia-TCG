import { describe, expect, it } from 'vitest';
import { applyAction, costModFor } from '@engine/engine';
import { blankState, place, unit, testRegistry } from '@engine/testkit';

/**
 * `costBase` is the PERSISTENT cost-discount lane (Adventure leader uniques like Naife's
 * Environment discount, and cost-reduction relics). Unlike the temporary `costMods`, it
 * must survive turn-end — the bug this guards against was a run-long discount silently
 * lasting only turn 1 because it was written to `costMods`, which is wiped every turn.
 */
describe('costBase (persistent cost modifier)', () => {
  it('costModFor sums the temporary costMods and the persistent costBase', () => {
    const s = blankState();
    s.players[0].costMods.spell = 2;
    s.players[0].costBase = { unit: 0, spell: -1, foundation: 0, environment: 0 };
    expect(costModFor(s.players[0], 'spell')).toBe(1); // 2 + (-1)
    expect(costModFor(s.players[0], 'unit')).toBe(0);
  });

  it('treats an absent costBase as all-zero (back-compat with older states)', () => {
    const s = blankState();
    expect(s.players[0].costBase).toBeUndefined();
    expect(costModFor(s.players[0], 'environment')).toBe(0);
  });

  it('survives the owner\'s turn-end while costMods is cleared', () => {
    // Round 3 so the active player may attack/end freely; give a dummy enemy body so
    // endTurn has a well-formed board to resolve.
    const s = blankState({ active: 0, round: 3 });
    s.players[0].costMods.environment = 3; // temporary
    s.players[0].costBase = { unit: 0, spell: 0, foundation: 0, environment: -1 }; // persistent
    place(s, 1, 'ground1', unit({ owner: 1, attack: 0, hp: 5 }));

    const after = applyAction(testRegistry, s, { type: 'endTurn' }).state;
    // The player who just ended is now seat that had its costMods wiped.
    expect(after.players[0].costMods.environment).toBe(0); // temporary cleared
    expect(after.players[0].costBase?.environment).toBe(-1); // persistent preserved
    expect(costModFor(after.players[0], 'environment')).toBe(-1);
  });

  it('a persistent -1 unit discount actually lowers what a unit costs to play', () => {
    const s = blankState({ active: 0, round: 3 });
    s.players[0].energy = 1;
    s.players[0].hand = [{ iid: 't', cardId: 'twins' }]; // twins = 2-cost unit in testkit
    // Without the discount, a 2-cost unit is unaffordable at energy 1.
    expect(applyAction(testRegistry, s, { type: 'playUnit', iid: 't', lane: 'ground1' }).events.some((e) => e.t === 'error')).toBe(true);
    // With costBase -1, it costs 1 and goes down.
    s.players[0].costBase = { unit: -1, spell: 0, foundation: 0, environment: 0 };
    expect(applyAction(testRegistry, s, { type: 'playUnit', iid: 't', lane: 'ground1' }).events.some((e) => e.t === 'playUnit')).toBe(true);
  });
});
