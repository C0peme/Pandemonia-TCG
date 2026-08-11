import { describe, expect, it } from 'vitest';
import { initGame } from '@engine/setup';
import { reconcileLeaderUnit, findLeaderUnit } from '@engine/damage';
import { applyEffects, processDeaths } from '@engine/effects';
import { blankState, place, unit } from '@engine/testkit';
import { RULES } from '@engine/constants';
import { starterRegistry, deckTempo, deckAggro } from '@cards/data/starter';
import type { GameEvent } from '@engine/events';

const leaderUnit = (owner: 0 | 1, hp: number) => {
  const u = unit({ owner, attack: 0, hp, cardId: 'ringleader-avatar', keywords: { immunity: true, taunt: true, airborne: true, doubleStrike: true } });
  u.isLeaderUnit = true;
  return u;
};

describe('Riku leader-unit', () => {
  it('spawns on the board at game start with HP mirroring the leader', () => {
    const s = initGame({ registry: starterRegistry, decks: [deckTempo, deckAggro], seed: 5 });
    const lu = findLeaderUnit(s, 0);
    expect(lu).toBeDefined();
    expect(s.players[0].lanes.ground1.front?.isLeaderUnit).toBe(true);
    expect(lu!.hp).toBe(s.players[0].leaderHp);
    expect(lu!.keywords.immunity).toBe(true);
    expect(lu!.keywords.doubleStrike).toBeUndefined();
    expect(lu!.keywords.taunt).toBe(true);
    // The opponent (Aggro) has no leader-unit.
    expect(findLeaderUnit(s, 1)).toBeUndefined();
  });

  it('reconcile syncs leaderHp from the unit and unlocks the Signature at the threshold', () => {
    const s = blankState();
    const lu = leaderUnit(0, RULES.LEADER_HP);
    place(s, 0, 'ground1', lu);
    lu.hp = RULES.SIGNATURE_HP_THRESHOLD - 1;
    const events: GameEvent[] = [];
    reconcileLeaderUnit(s, events);
    expect(s.players[0].leaderHp).toBe(RULES.SIGNATURE_HP_THRESHOLD - 1);
    expect(s.players[0].signatureUnlocked).toBe(true);
  });

  it('takes leader damage through its defenses (Tough) and fires Polish', () => {
    const s = blankState();
    const lu = unit({ owner: 0, attack: 1, hp: RULES.LEADER_HP, cardId: 'ringleader-avatar', keywords: { tough: 2, polish: { stat: { attack: 1 } } } });
    lu.isLeaderUnit = true;
    place(s, 0, 'ground1', lu);
    s.players[0].leaderHp = RULES.LEADER_HP;
    const events: GameEvent[] = [];
    // A 5-damage "leader" hit on a Tough-2 leader-unit should land 3.
    applyEffects(s, 1, [{ kind: 'damage', amount: 5, target: 'leader' }], [{ kind: 'leader', player: 0 }], undefined, events);
    const after = s.players[0].lanes.ground1.front!;
    expect(after.hp).toBe(RULES.LEADER_HP - 3); // 5 − Tough 2 = 3
    expect(s.players[0].leaderHp).toBe(RULES.LEADER_HP - 3); // leaderHp stays in sync
    expect(after.attack).toBe(2); // Polish reacted to the leader-unit taking damage
  });

  it('a leader-unit Shield blocks leader damage entirely', () => {
    const s = blankState();
    const lu = unit({ owner: 0, attack: 0, hp: RULES.LEADER_HP, cardId: 'ringleader-avatar', keywords: { shield: 1 } });
    lu.isLeaderUnit = true;
    place(s, 0, 'ground1', lu);
    s.players[0].leaderHp = RULES.LEADER_HP;
    const events: GameEvent[] = [];
    applyEffects(s, 1, [{ kind: 'damage', amount: 8, target: 'leader' }], [{ kind: 'leader', player: 0 }], undefined, events);
    expect(s.players[0].leaderHp).toBe(RULES.LEADER_HP); // Shield absorbed the leader hit
    expect(s.players[0].lanes.ground1.front!.keywords.shield).toBeUndefined(); // …consumed
  });

  it('is never removed by processDeaths even at 0 HP (its death ends the game elsewhere)', () => {
    const s = blankState();
    const lu = leaderUnit(0, RULES.LEADER_HP);
    place(s, 0, 'ground1', lu);
    lu.hp = 0;
    processDeaths(s, []);
    expect(s.players[0].lanes.ground1.front?.isLeaderUnit).toBe(true);
  });

  it('the Signature shields the immune leader-unit (beneficial status bypasses Immunity)', () => {
    const s = blankState();
    const lu = leaderUnit(0, RULES.LEADER_HP);
    place(s, 0, 'ground1', lu);
    applyEffects(
      s,
      0,
      [
        { kind: 'applyStatus', amount: 2, target: 'leaderUnit', status: 'shield' },
        { kind: 'buff', target: 'leaderUnit', keywords: { pierce: true, bloodlust: { buff: { attack: 0, hp: 2 } } } },
      ],
      [],
      undefined,
      [],
      starterRegistry,
    );
    const after = s.players[0].lanes.ground1.front!;
    expect(after.shield).toBe(2);
    expect(after.keywords.pierce).toBe(true);
    expect(after.keywords.bloodlust?.buff?.hp).toBe(2);
  });
});
