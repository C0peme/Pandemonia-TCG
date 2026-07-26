/**
 * The unified status table. These lock in the CLASSIFICATION (which caused two shipped
 * bugs when it was duplicated by hand) rather than re-testing each status's behaviour.
 */
import { describe, expect, it } from 'vitest';
import { blankState, unit, testRegistry } from '@engine/testkit';
import { STATUS_SPECS, applyStatus, isHarmfulStatus, isCleansableStatus, clearCleansableStatuses, type StatusKind } from '@engine/status';
import { applyEffects } from '@engine/effects';
import type { GameEvent } from '@engine/events';
import type { TargetRef } from '@engine/actions';

const ALL = Object.keys(STATUS_SPECS) as StatusKind[];

describe('status classification', () => {
  it('treats Zombified as beneficial — it is a revive, not an affliction', () => {
    expect(isHarmfulStatus('zombified')).toBe(false);
    expect(isCleansableStatus('zombified')).toBe(false);
  });

  it('marks exactly the four afflictions harmful and cleansable', () => {
    const harmful = ALL.filter(isHarmfulStatus).sort();
    expect(harmful).toEqual(['burn', 'freeze', 'poison', 'sleep']);
    expect(ALL.filter(isCleansableStatus).sort()).toEqual(harmful);
  });

  it('never marks a beneficial status cleansable (cleanse hits your own unit)', () => {
    for (const s of ALL) if (!isHarmfulStatus(s)) expect(isCleansableStatus(s)).toBe(false);
  });
});

describe('Immunity gate follows the table', () => {
  const applyTo = (u: ReturnType<typeof unit>, status: StatusKind) => {
    const s = blankState();
    s.players[0].lanes.ground1.front = u;
    const events: GameEvent[] = [];
    applyEffects(s, 0, [{ kind: 'applyStatus', status, target: 'any', amount: 1 }], [{ kind: 'unit', iid: u.iid }] as TargetRef[], undefined, events, testRegistry);
    return events;
  };

  it('blocks harmful statuses on an Immune unit', () => {
    for (const status of ALL.filter(isHarmfulStatus)) {
      const u = unit({ owner: 0, attack: 2, hp: 4, keywords: { immunity: true } });
      expect(applyTo(u, status).some((e) => e.t === 'blocked'), status).toBe(true);
    }
  });

  it('lets beneficial statuses through onto an Immune unit', () => {
    // Regression: Zombified was mis-listed as harmful, so you could not Zombify your own
    // Immune unit — the buff was silently swallowed by the Immunity gate.
    for (const status of ALL.filter((s) => !isHarmfulStatus(s))) {
      const u = unit({ owner: 0, attack: 2, hp: 4, keywords: { immunity: true } });
      const events = applyTo(u, status);
      expect(events.some((e) => e.t === 'blocked'), status).toBe(false);
      expect(events.some((e) => e.t === 'statusApplied'), status).toBe(true);
    }
    const z = unit({ owner: 0, attack: 2, hp: 4, keywords: { immunity: true } });
    applyTo(z, 'zombified');
    expect(z.keywords.zombified).toBe(true);
  });
});

describe('applyStatus exclusivity', () => {
  it('Sleep and Freeze coexist; anything else replaces the group', () => {
    const events: GameEvent[] = [];
    const u = unit({ owner: 0, attack: 2, hp: 4 });
    applyStatus(u, 'sleep', { sleepHeal: 1 }, events);
    applyStatus(u, 'freeze', {}, events);
    expect(u.status.sleep).toBeGreaterThan(0);
    expect(u.status.freeze).toBeGreaterThan(0);
    applyStatus(u, 'burn', { burn: 2 }, events);
    expect(u.status.sleep).toBeUndefined();
    expect(u.status.freeze).toBeUndefined();
    expect(u.status.burn).toBe(2);
  });

  it('Poison accumulates instead of replacing itself', () => {
    const events: GameEvent[] = [];
    const u = unit({ owner: 0, attack: 2, hp: 9 });
    applyStatus(u, 'poison', { poison: 2 }, events);
    applyStatus(u, 'poison', { poison: 3 }, events);
    expect(u.status.poisoned).toBe(5);
  });

  it('keyword-backed statuses layer on without disturbing the affliction group', () => {
    const events: GameEvent[] = [];
    const u = unit({ owner: 0, attack: 2, hp: 4 });
    applyStatus(u, 'poison', { poison: 2 }, events);
    applyStatus(u, 'shield', { shield: 2 }, events);
    applyStatus(u, 'taunt', {}, events);
    expect(u.status.poisoned).toBe(2); // untouched
    expect(u.shield).toBe(2);
    expect(u.keywords.shield).toBe(2);
    expect(u.keywords.taunt).toBe(true);
  });
});

describe('clearCleansableStatuses', () => {
  it('clears afflictions across both stores but preserves drowning and buffs', () => {
    const u = unit({
      owner: 0, attack: 3, hp: 5,
      status: { poisoned: 2, burn: 1, drowning: true },
      keywords: { zombified: true, taunt: true },
    });
    u.predrownAttack = 3;
    clearCleansableStatuses(u);
    expect(u.status.poisoned).toBeUndefined();
    expect(u.status.burn).toBeUndefined();
    expect(u.status.drowning).toBe(true); // positional — not an affliction
    expect(u.keywords.zombified).toBe(true);
    expect(u.keywords.taunt).toBe(true);
  });
});
