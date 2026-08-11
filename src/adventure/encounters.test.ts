import { describe, expect, it } from 'vitest';
import { buildRegistry } from '@cards/registry';
import { starterCards, starterLeaders, starterDecks } from '@cards/data/starter';
import { RULES } from '@engine/constants';
import { simulateGame } from '@engine/sim';
import { signatureThreshold } from '@engine/damage';
import { rollEncounter, playerDeck, buildEncounterState } from '@adventure/encounters';
import { buildRunRegistry, ENEMY_LEADER_ID } from '@adventure/runRegistry';
import { ADVENTURE_STARTERS } from '@adventure/data/starters';
import type { MapNode } from '@adventure/schema';

const base = buildRegistry(starterCards, starterLeaders);

const node = (over: Partial<MapNode>): MapNode => ({
  id: 'n1-0', kind: 'combat', layer: 1, col: 0, next: [], seed: 77, visited: false, ...over,
});

describe('rollEncounter', () => {
  it('is deterministic per node seed', () => {
    expect(rollEncounter(base, node({}), 1)).toEqual(rollEncounter(base, node({}), 1));
  });

  it('trims early decks toward cheap cards and scales size with depth/act', () => {
    const early = rollEncounter(base, node({ layer: 0 }), 1);
    const later = rollEncounter(base, node({ layer: 4, seed: 77 }), 1);
    const size = (e: typeof early): number => e.enemyDeck.cards.reduce((s, c) => s + c.count, 0);
    expect(size(early)).toBe(12);
    expect(size(later)).toBe(24);
    // Every trimmed card exists in the source archetype.
    const archetype = starterDecks.find((d) => d.leaderId === early.enemyLeaderId)!;
    const pool = new Set(archetype.cards.map((c) => c.cardId));
    for (const c of early.enemyDeck.cards) expect(pool.has(c.cardId), c.cardId).toBe(true);
  });

  it('bosses play the full archetype deck at boss HP plus their bonus', () => {
    const boss1 = rollEncounter(base, node({ kind: 'boss', layer: 7 }), 1);
    expect(boss1.enemyDeck.cards.reduce((s, c) => s + c.count, 0)).toBe(RULES.DECK_SIZE);
    expect(boss1.boss).toBeTruthy();
    expect(boss1.enemyHp).toBe(RULES.LEADER_HP + boss1.boss!.bonusHp);
    // Bosses scale by the same +6/act step as regular enemies (was +5, which also
    // broke the "HP is always even" invariant on even acts).
    const boss2 = rollEncounter(base, node({ kind: 'boss', layer: 8 }), 2);
    expect(boss2.enemyHp).toBe(RULES.LEADER_HP + 6 + boss2.boss!.bonusHp);
  });

  it('never lets a regular/elite fight out-tank the act boss', () => {
    for (let act = 1; act <= 3; act++) {
      const boss = rollEncounter(base, node({ kind: 'boss', layer: 8 }), act).enemyHp;
      for (let layer = 0; layer < 8; layer++) {
        expect(rollEncounter(base, node({ layer }), act).enemyHp).toBeLessThanOrEqual(boss);
        expect(rollEncounter(base, node({ kind: 'elite', layer }), act).enemyHp).toBeLessThanOrEqual(boss);
      }
    }
  });

  it('enemy HP is always an even number, at every kind/layer/act combination', () => {
    for (const kind of ['combat', 'trial', 'elite', 'boss'] as const) {
      for (let act = 1; act <= 4; act++) {
        for (let layer = 0; layer < 10; layer++) {
          const enc = rollEncounter(base, node({ kind, layer, seed: layer * 7 + act }), act);
          expect(enc.enemyHp % 2, `${kind} layer${layer} act${act} = ${enc.enemyHp}`).toBe(0);
        }
      }
    }
  });

  it("a fresh early enemy's Signature threshold scales with their own (now lower) HP", () => {
    // Regression for the fixed rule: this used to require an inflated HP floor so a
    // fixed 15-HP threshold couldn't be an instant unlock. Now the threshold is HALF
    // of the enemy's own HP, so even a low-HP enemy has a proportionally safe margin.
    const enc = rollEncounter(base, node({ layer: 0 }), 1);
    const pl = { leaderMaxHp: enc.enemyHp } as Parameters<typeof signatureThreshold>[0];
    expect(signatureThreshold(pl)).toBe(enc.enemyHp / 2);
    expect(enc.enemyHp - signatureThreshold(pl)).toBeGreaterThanOrEqual(enc.enemyHp / 2);
  });

  it('elites spike deck size + HP (but carry no twist)', () => {
    const regular = rollEncounter(base, node({ kind: 'combat', layer: 2, seed: 5 }), 1);
    const elite = rollEncounter(base, node({ kind: 'elite', layer: 2, seed: 5 }), 1);
    const size = (e: typeof elite): number => e.enemyDeck.cards.reduce((s, c) => s + c.count, 0);
    expect(size(elite)).toBeGreaterThan(size(regular));
    expect(elite.enemyHp).toBeGreaterThan(regular.enemyHp);
    expect(elite.coinReward).toBeGreaterThan(regular.coinReward);
    expect(elite.twist).toBeUndefined();
  });

  it('trials fight at normal HP/deck size but always carry a twist', () => {
    const regular = rollEncounter(base, node({ kind: 'combat', layer: 2, seed: 5 }), 1);
    const trial = rollEncounter(base, node({ kind: 'trial', layer: 2, seed: 5 }), 1);
    const size = (e: typeof trial): number => e.enemyDeck.cards.reduce((s, c) => s + c.count, 0);
    // No HP/deck spike — a trial's difficulty is the twist, not stats.
    expect(trial.enemyHp).toBe(regular.enemyHp);
    expect(size(trial)).toBe(size(regular));
    expect(trial.twist).toBeTruthy();
    // Still pays a small coin bump for the added condition.
    expect(trial.coinReward).toBeGreaterThan(regular.coinReward);
  });

  it('applies an enemyHp relic delta but never below the minimal safety floor', () => {
    const enc = rollEncounter(base, node({ layer: 3, seed: 8 }), 1);
    const softer = rollEncounter(base, node({ layer: 3, seed: 8 }), 1, -4);
    expect(softer.enemyHp).toBe(enc.enemyHp - 4);
    const floored = rollEncounter(base, node({ layer: 0, seed: 8 }), 1, -999);
    expect(floored.enemyHp).toBeGreaterThan(0);
    expect(floored.enemyHp % 2).toBe(0);
  });
});

describe('encounter smoke test', () => {
  it('an 11-card run deck vs a trimmed enemy plays to completion headlessly', () => {
    const enc = rollEncounter(base, node({ layer: 0 }), 1);
    const registry = buildRunRegistry(base, {
      deck: [],
      enemyLeaderId: enc.enemyLeaderId,
      enemyLeaderHp: enc.enemyHp,
    });
    const player = playerDeck('orsyric', ADVENTURE_STARTERS['orsyric']!.map((cardId, i) => ({ uid: `u${i}`, cardId, enhancements: [] })));
    const result = simulateGame(registry, [player, { ...enc.enemyDeck, leaderId: ENEMY_LEADER_ID }], 5, false);
    expect([0, 1]).toContain(result.winner);
    expect(result.turns).toBeGreaterThan(0);
  });

  it('seats the player at their carried run HP, leaving max (and the Signature line) alone', () => {
    const enc = rollEncounter(base, node({ layer: 0 }), 1);
    const registry = buildRunRegistry(base, { deck: [], enemyLeaderId: enc.enemyLeaderId, enemyLeaderHp: enc.enemyHp });
    const player = playerDeck('orsyric', ADVENTURE_STARTERS['orsyric']!.map((cardId, i) => ({ uid: `u${i}`, cardId, enhancements: [] })));
    const full = base.leaders.get('orsyric')!.hp;
    const state = buildEncounterState(registry, player, enc, 9, 14);
    expect(state.players[0].leaderHp).toBe(14);
    // Max is untouched, so the Signature still unlocks at half of FULL health --
    // a wounded player starts nearer it, which is the intended comeback valve.
    expect(state.players[0].leaderMaxHp).toBe(full);
    expect(signatureThreshold(state.players[0])).toBe(full / 2);
    // Clamps rather than trusting the caller.
    expect(buildEncounterState(registry, player, enc, 9, 999).players[0].leaderHp).toBe(full);
    expect(buildEncounterState(registry, player, enc, 9, 0).players[0].leaderHp).toBe(1);
    // Omitted => untouched full health (back-compat).
    expect(buildEncounterState(registry, player, enc, 9).players[0].leaderHp).toBe(full);
  });

  it('buildEncounterState seats the player first with the enemy at reduced HP', () => {
    const enc = rollEncounter(base, node({ layer: 0 }), 1);
    const registry = buildRunRegistry(base, { deck: [], enemyLeaderId: enc.enemyLeaderId, enemyLeaderHp: enc.enemyHp });
    const player = playerDeck('orsyric', ADVENTURE_STARTERS['orsyric']!.map((cardId, i) => ({ uid: `u${i}`, cardId, enhancements: [] })));
    const state = buildEncounterState(registry, player, enc, 9);
    expect(state.active).toBe(0);
    expect(state.players[0].leaderHp).toBe(base.leaders.get('orsyric')!.hp);
    expect(state.players[1].leaderHp).toBe(enc.enemyHp);
    expect(state.players[1].leaderId).toBe(ENEMY_LEADER_ID);
  });
});

describe('adventure starters', () => {
  it('covers every leader with existing card ids', () => {
    for (const leader of starterLeaders) {
      const starter = ADVENTURE_STARTERS[leader.id];
      expect(starter, `missing starter for ${leader.id}`).toBeTruthy();
      expect(starter!.length).toBeGreaterThanOrEqual(10);
      for (const id of starter!) expect(base.cards.has(id), `${leader.id}: unknown card ${id}`).toBe(true);
    }
  });
});
