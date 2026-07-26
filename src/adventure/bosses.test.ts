import { describe, expect, it } from 'vitest';
import { buildRegistry } from '@cards/registry';
import { starterCards, starterLeaders, starterDecks } from '@cards/data/starter';
import { RULES } from '@engine/constants';
import { BOSSES, bossForAct, bossById } from '@adventure/data/bosses';
import { trialById } from '@adventure/trials';
import { rollEncounter } from '@adventure/encounters';
import { buildRunRegistry, ENEMY_LEADER_ID } from '@adventure/runRegistry';
import type { MapNode } from '@adventure/schema';

const base = buildRegistry(starterCards, starterLeaders);
const bossNode = (over: Partial<MapNode> = {}): MapNode => ({
  id: 'n7-0', kind: 'boss', layer: 7, col: 0, next: [], seed: 999, visited: false, ...over,
});

describe('boss table', () => {
  it('has unique ids, valid archetypes, and valid twists (where present)', () => {
    const ids = BOSSES.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(BOSSES.length).toBe(13); // one per leader
    for (const b of BOSSES) {
      expect(bossById(b.id)).toBe(b);
      expect(starterDecks.some((d) => d.leaderId === b.leaderId), `${b.id} leader`).toBe(true);
      if (b.twistId) expect(trialById(b.twistId), `${b.id} twist`).toBeTruthy();
    }
  });

  it('covers every leader exactly once', () => {
    const leaderIds = BOSSES.map((b) => b.leaderId).sort();
    const allLeaders = starterDecks.map((d) => d.leaderId).sort();
    expect(leaderIds).toEqual(allLeaders);
  });
});

describe('boss curses (energyOverride / turnCardMod)', () => {
  it("Corpselock fixes energy at 10 regardless of round", () => {
    const corpselock = bossById('overgrowth')!;
    expect(corpselock.energyOverride).toBe(10);
  });

  it("Screyera's curse mills the player and draws extra for the boss, with no twist", () => {
    const screyera = bossById('screyera-all-seeing')!;
    expect(screyera.twistId).toBeUndefined();
    expect(screyera.curse).toEqual({ playerMillPerTurn: 1, bossExtraDrawPerTurn: 1 });
  });
});

describe('boss heroPowerOverride', () => {
  it("Ring Leader's Modification also relocates the leader-unit, without mutating the base leader", () => {
    const boss = bossById('ringleader-executioner')!;
    const baseLeader = base.leaders.get('ringleader')!;
    const before = JSON.stringify(baseLeader.heroPower);
    const overridden = boss.heroPowerOverride!(structuredClone(baseLeader.heroPower));
    expect(overridden.effects.some((e) => e.kind === 'move' && e.target === 'leaderUnit')).toBe(true);
    expect(overridden.effects).toHaveLength(baseLeader.heroPower.effects.length + 1);
    expect(JSON.stringify(baseLeader.heroPower)).toBe(before); // untouched
  });

  it("Cleath's Fortify also grants +1 attack alongside its HP", () => {
    const boss = bossById('cleath-architect')!;
    const baseLeader = base.leaders.get('cleath')!;
    const overridden = boss.heroPowerOverride!(structuredClone(baseLeader.heroPower));
    const buffEffect = overridden.effects.find((e) => e.kind === 'buff')!;
    expect(buffEffect.stat).toEqual({ attack: 1, hp: 1 });
    expect(baseLeader.heroPower.effects.find((e) => e.kind === 'buff')!.stat).toEqual({ hp: 1 }); // untouched
  });

  it("Autopus's Fallback Code summons a Techtacle instead of a Mechanical Failure", () => {
    const boss = bossById('autopus-overflow')!;
    const baseLeader = base.leaders.get('autopus')!;
    const overridden = boss.heroPowerOverride!(structuredClone(baseLeader.heroPower));
    const summonEffect = overridden.effects.find((e) => e.kind === 'summon')!;
    expect(summonEffect.cardId).toBe('critter-elite');
    expect(baseLeader.heroPower.effects.find((e) => e.kind === 'summon')!.cardId).toBe('critter-token'); // untouched
  });

  it('applies cleanly through buildRunRegistry as the ENEMY leader, never leaking to the player copy', () => {
    const boss = bossById('ringleader-executioner')!;
    const reg = buildRunRegistry(base, {
      deck: [], enemyLeaderId: boss.leaderId, enemyLeaderHp: 20, enemyHeroPowerOverride: boss.heroPowerOverride,
    });
    const enemy = reg.leaders.get(ENEMY_LEADER_ID)!;
    expect(enemy.heroPower.effects.some((e) => e.kind === 'move' && e.target === 'leaderUnit')).toBe(true);
    // The player's own copy of the same leader (if they picked Ring Leader) keeps the base power.
    const playerCopy = reg.leaders.get('ringleader')!;
    expect(playerCopy.heroPower.effects.some((e) => e.kind === 'move')).toBe(false);
  });
});

describe('bossForAct', () => {
  it('is deterministic and cycles across acts without immediate repeats', () => {
    expect(bossForAct(42, 1)).toBe(bossForAct(42, 1));
    for (let act = 1; act < 5; act++) {
      expect(bossForAct(42, act).id).not.toBe(bossForAct(42, act + 1).id);
    }
  });

  it('varies the act-1 boss across run seeds (not a constant)', () => {
    const seen = new Set(Array.from({ length: 40 }, (_, s) => bossForAct(s, 1).id));
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe('boss encounters', () => {
  it('play the boss archetype at full deck with its gimmick twist and bonus HP', () => {
    const enc = rollEncounter(base, bossNode(), 1);
    const boss = bossForAct(999, 1);
    expect(enc.boss).toEqual(boss);
    expect(enc.enemyLeaderId).toBe(boss.leaderId);
    expect(enc.enemyDeck.cards.reduce((s, c) => s + c.count, 0)).toBe(RULES.DECK_SIZE);
    expect(enc.twist?.id).toBe(boss.twistId);
    expect(enc.enemyHp).toBe(RULES.LEADER_HP + boss.bonusHp);
  });

  it('scales boss HP by act and still applies relic enemyHp deltas', () => {
    const boss2 = bossForAct(999, 2);
    const enc = rollEncounter(base, bossNode({ layer: 8 }), 2);
    expect(enc.enemyHp).toBe(RULES.LEADER_HP + 6 + boss2.bonusHp);
    const softer = rollEncounter(base, bossNode({ layer: 8 }), 2, -6);
    expect(softer.enemyHp).toBe(enc.enemyHp - 6);
  });
});
