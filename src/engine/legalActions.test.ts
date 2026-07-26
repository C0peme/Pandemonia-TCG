import { describe, expect, it } from 'vitest';
import { applyAction, legalActions } from '@engine/engine';
import { blankState, place, testRegistry, unit } from '@engine/testkit';
import type { Action } from '@engine/actions';
import type { GameState } from '@engine/types';

/** Active player (0) with some energy and a hand of the given card ids. */
const withHand = (energy: number, cardIds: string[]): GameState => {
  const s = blankState();
  s.players[0].energy = energy;
  s.players[0].hand = cardIds.map((cardId, i) => ({ iid: `h${i}`, cardId }));
  return s;
};

const ofType = (acts: Action[], type: Action['type']): Action[] => acts.filter((a) => a.type === type);

describe('legalActions — invariant', () => {
  it('every enumerated action applies without producing an error event', () => {
    const s = withHand(9, ['v0', 'twins', 'firebolt', 'mend', 'rally', 'footing', 'scorched-field', 'eel']);
    // Populate both boards so spells/hero power have real targets.
    place(s, 0, 'ground2', unit({ owner: 0, hp: 1 }));
    place(s, 1, 'ground1', unit({ owner: 1 }));
    place(s, 1, 'heights', unit({ owner: 1, hp: 4 }));

    const acts = legalActions(testRegistry, s);
    expect(acts.length).toBeGreaterThan(0);
    for (const a of acts) {
      if (a.type === 'endTurn') continue;
      const { events } = applyAction(testRegistry, s, a);
      expect(events.some((e) => e.t === 'error'), `action errored: ${JSON.stringify(a)}`).toBe(false);
    }
  });

  it('always offers a bare endTurn', () => {
    expect(ofType(legalActions(testRegistry, withHand(0, [])), 'endTurn')).toHaveLength(1);
  });
});

describe('legalActions — affordability', () => {
  it('omits cards the player cannot pay for', () => {
    // Titan costs 5 energy + 2 banked fire; with 1 energy and no bank it is unplayable.
    const acts = legalActions(testRegistry, withHand(1, ['titan', 'v0']));
    expect(ofType(acts, 'playUnit').some((a) => a.type === 'playUnit' && a.iid === 'h0')).toBe(false);
    expect(ofType(acts, 'playUnit').some((a) => a.type === 'playUnit' && a.iid === 'h1')).toBe(true);
  });
});

describe('legalActions — foundations & environments', () => {
  it('offers a foundation only in empty lanes', () => {
    const s = withHand(2, ['footing']);
    place(s, 0, 'ground1', unit({ owner: 0 })); // ground1 occupied
    const lanes = ofType(legalActions(testRegistry, s), 'playFoundation').map((a) =>
      a.type === 'playFoundation' ? a.lane : null,
    );
    expect(lanes).not.toContain('ground1');
    expect(lanes).toContain('heights');
    expect(lanes).toContain('water');
  });

  it('restricts an environment to its allowed lanes', () => {
    // Scorched Field is ground-only.
    const lanes = ofType(legalActions(testRegistry, withHand(2, ['scorched-field'])), 'playEnvironment').map((a) =>
      a.type === 'playEnvironment' ? a.lane : null,
    );
    expect(new Set(lanes)).toEqual(new Set(['ground1', 'ground2']));
  });
});

describe('legalActions — spells', () => {
  it('fans a damage spell over every enemy unit and the enemy leader', () => {
    const s = withHand(1, ['firebolt']);
    const e1 = unit({ owner: 1 });
    const e2 = unit({ owner: 1 });
    place(s, 1, 'ground1', e1);
    place(s, 1, 'water', e2);
    const targets = ofType(legalActions(testRegistry, s), 'playSpell').map((a) =>
      a.type === 'playSpell' ? a.targets?.[0] : undefined,
    );
    expect(targets).toContainEqual({ kind: 'unit', iid: e1.iid });
    expect(targets).toContainEqual({ kind: 'unit', iid: e2.iid });
    expect(targets).toContainEqual({ kind: 'leader', player: 1 });
  });

  it('drops a unit-only buff spell when there is no ally to target', () => {
    // Rally buffs an ally unit (no leader ref); with no allies it has no legal play.
    const noAlly = ofType(legalActions(testRegistry, withHand(1, ['rally'])), 'playSpell');
    expect(noAlly).toHaveLength(0);
    // With an ally present it becomes castable.
    const s = withHand(1, ['rally']);
    place(s, 0, 'ground1', unit({ owner: 0 }));
    expect(ofType(legalActions(testRegistry, s), 'playSpell').length).toBeGreaterThan(0);
  });
});

describe('legalActions — Double Team positions', () => {
  it('offers both the back slot and the front swap when a Double-Team unit fronts the lane', () => {
    const s = withHand(1, ['v0']);
    place(s, 0, 'ground1', unit({ owner: 0, cardId: 'twins', keywords: { doubleTeam: true } }));
    const g1 = ofType(legalActions(testRegistry, s), 'playUnit').filter(
      (a) => a.type === 'playUnit' && a.lane === 'ground1',
    );
    const positions = g1.map((a) => (a.type === 'playUnit' ? a.position : undefined));
    expect(positions).toContain(undefined); // default → back slot
    expect(positions).toContain('front'); // explicit swap to front
  });
});

describe('legalActions — hero power', () => {
  it('enumerates Spark against each enemy unit and the enemy leader, and not after it is used', () => {
    const s = withHand(1, []);
    place(s, 1, 'ground1', unit({ owner: 1 }));
    const hp = ofType(legalActions(testRegistry, s), 'heroPower');
    expect(hp.length).toBeGreaterThan(0);

    s.players[0].heroPowerUsed = true;
    expect(ofType(legalActions(testRegistry, s), 'heroPower')).toHaveLength(0);
  });
});

describe('legalActions — pending choices gate everything', () => {
  it('returns only resolvePending options (skip + each legal target) while a choice is queued', () => {
    const s = blankState();
    s.players[0].energy = 5;
    s.players[0].hand = [{ iid: 'h0', cardId: 'v0' }];
    const enemy = unit({ owner: 1 });
    place(s, 1, 'ground1', enemy);
    s.pending = [{ player: 0, sourceIid: 'src', kind: 'move', scope: 'enemy' }];

    const acts = legalActions(testRegistry, s);
    expect(acts.every((a) => a.type === 'resolvePending')).toBe(true);
    // The skip option is always present.
    expect(acts.some((a) => a.type === 'resolvePending' && a.targetIid === undefined)).toBe(true);
    // At least one concrete relocation of the queued enemy.
    expect(acts.some((a) => a.type === 'resolvePending' && a.targetIid === enemy.iid && Boolean(a.toLane))).toBe(true);
  });
});
