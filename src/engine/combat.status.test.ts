import { describe, expect, it } from 'vitest';
import { resolveCombat } from '@engine/combat';
import { blankState, place, unit, testRegistry } from '@engine/testkit';
import { RULES } from '@engine/constants';
import type { GameState } from '@engine/types';

const run = (s: GameState) => resolveCombat(s).state;

describe('conditional & status keywords in combat', () => {
  it('Bloodlust buffs the attacker when it destroys a unit', () => {
    const s = blankState();
    place(
      s,
      0,
      'ground1',
      unit({ owner: 0, attack: 5, hp: 5, keywords: { bloodlust: { buff: { attack: 1, hp: 1 } } } }),
    );
    place(s, 1, 'ground1', unit({ owner: 1, attack: 0, hp: 3 }));
    const r = run(s);
    const killer = r.players[0].lanes.ground1.front!;
    expect(killer.attack).toBe(6);
    expect(killer.maxHp).toBe(6);
  });

  it('Bloodlust runs authored effects (summon) when it destroys a unit', () => {
    const s = blankState();
    place(
      s,
      0,
      'ground1',
      unit({
        owner: 0,
        attack: 5,
        hp: 5,
        keywords: { bloodlust: { effects: [{ kind: 'summon', cardId: 'titan', target: 'self' }] } },
      }),
    );
    place(s, 1, 'ground1', unit({ owner: 1, attack: 0, hp: 3 }));
    // The summon effect needs the registry to look up the card definition.
    const r = resolveCombat(s, undefined, testRegistry).state;
    const allUnits = (['heights', 'ground1', 'ground2', 'water'] as const).flatMap((l) => [
      r.players[0].lanes[l].front,
      r.players[0].lanes[l].back,
    ]);
    expect(allUnits.some((u) => u?.cardId === 'titan')).toBe(true);
  });

  it('Zombified revives at 1 HP and loses the keyword (keeping statuses)', () => {
    const s = blankState();
    place(
      s,
      1,
      'ground1',
      unit({ owner: 1, attack: 0, hp: 3, keywords: { zombified: true }, status: { burn: 1 } }),
    );
    place(s, 0, 'ground1', unit({ owner: 0, attack: 5, hp: 5 }));
    const r = run(s);
    const revived = r.players[1].lanes.ground1.front!;
    expect(revived.hp).toBe(1);
    expect(revived.keywords.zombified).toBeUndefined();
    expect(revived.status.burn).toBe(1); // Burn preserved
  });

  it('Kamikaze (enemy) hits in-lane enemy units on death, with no leader fallback', () => {
    const s = blankState();
    place(
      s,
      1,
      'ground1',
      unit({
        owner: 1,
        attack: 0,
        hp: 3,
        keywords: { kamikaze: { kind: 'damage', amount: 3, target: 'enemy' } },
      }),
    );
    place(s, 0, 'ground1', unit({ owner: 0, attack: 5, hp: 5 }));
    const r = run(s);
    expect(r.players[1].lanes.ground1.front).toBeUndefined();
    // The dying unit's lane AOE hits the in-lane enemy (the killer), not the leader.
    expect(r.players[0].lanes.ground1.front!.hp).toBe(2); // 5 − 3
    expect(r.players[0].leaderHp).toBe(RULES.LEADER_HP); // no leader fallback
  });

  it('onHit: burn is applied to the target on a successful hit', () => {
    const s = blankState();
    place(s, 0, 'ground1', unit({ owner: 0, attack: 2, hp: 5, onHit: { burn: 1 } }));
    place(s, 1, 'ground1', unit({ owner: 1, attack: 0, hp: 5 }));
    const r = run(s);
    expect(r.players[1].lanes.ground1.front!.status.burn).toBe(1);
  });

  it('onHit: poison is applied to the target on a successful hit', () => {
    const s = blankState();
    place(s, 0, 'ground1', unit({ owner: 0, attack: 2, hp: 5, onHit: { poison: true } }));
    place(s, 1, 'ground1', unit({ owner: 1, attack: 0, hp: 5 }));
    const r = run(s);
    expect(r.players[1].lanes.ground1.front!.status.poisoned).toBeGreaterThan(0);
  });

  it('onHit: freeze is applied to the target on a successful hit', () => {
    const s = blankState();
    place(s, 0, 'ground1', unit({ owner: 0, attack: 2, hp: 5, onHit: { freeze: true } }));
    place(s, 1, 'ground1', unit({ owner: 1, attack: 0, hp: 5 }));
    const r = run(s);
    expect(r.players[1].lanes.ground1.front!.status.freeze).toBeGreaterThan(0);
  });

  it('onHit: sleep is applied to the target on a successful hit', () => {
    const s = blankState();
    place(s, 0, 'ground1', unit({ owner: 0, attack: 2, hp: 5, onHit: { sleep: 0 } }));
    place(s, 1, 'ground1', unit({ owner: 1, attack: 0, hp: 5 }));
    const r = run(s);
    expect(r.players[1].lanes.ground1.front!.status.sleep).toBeGreaterThan(0);
  });

  it('onHit: immunity blocks all onHit effects', () => {
    const s = blankState();
    place(s, 0, 'ground1', unit({ owner: 0, attack: 2, hp: 5, onHit: { burn: 2, poison: true } }));
    place(s, 1, 'ground1', unit({ owner: 1, attack: 0, hp: 5, keywords: { immunity: true } }));
    const r = run(s);
    const target = r.players[1].lanes.ground1.front!;
    expect(target.status.burn).toBeUndefined();
    expect(target.status.poisoned).toBeUndefined();
  });

  it('onHit: no effect applied if the hit was blocked (shield)', () => {
    const s = blankState();
    place(s, 0, 'ground1', unit({ owner: 0, attack: 2, hp: 5, onHit: { burn: 1 } }));
    place(s, 1, 'ground1', unit({ owner: 1, attack: 0, hp: 5, keywords: { shield: 1 }, shield: 1 }));
    const r = run(s);
    const target = r.players[1].lanes.ground1.front!;
    expect(target.status.burn).toBeUndefined(); // blocked — no damage landed
  });

  it('a sleeping unit wakes when attacked and takes wakeup shock bonus', () => {
    const s = blankState();
    place(s, 0, 'ground1', unit({ owner: 0, attack: 2, hp: 5 }));
    place(s, 1, 'ground1', unit({ owner: 1, attack: 3, hp: 5, status: { sleep: 1, sleepHeal: 1 } }));
    const r = run(s);
    const woken = r.players[1].lanes.ground1.front!;
    expect(woken.status.sleep).toBe(0);
    expect(woken.hp).toBe(2); // 5 - 2 attack - 1 sleepHeal wakeup shock
  });

  it('a frozen unit blocks the first hit and wakes', () => {
    const s = blankState();
    place(s, 0, 'ground1', unit({ owner: 0, attack: 4, hp: 5 }));
    place(s, 1, 'ground1', unit({ owner: 1, attack: 0, hp: 5, status: { freeze: 2 } }));
    const r = run(s);
    const thawed = r.players[1].lanes.ground1.front!;
    expect(thawed.hp).toBe(5); // first instance blocked
    expect(thawed.status.freeze).toBe(0);
  });
});
