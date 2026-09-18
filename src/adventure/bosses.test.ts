import { describe, expect, it } from 'vitest';
import { buildRegistry } from '@cards/registry';
import { starterCards, starterLeaders, starterDecks } from '@cards/data/starter';
import { RULES } from '@engine/constants';
import { BOSSES, bossForAct, bossById, type Boss } from '@adventure/data/bosses';
import { encounterHp, rollEncounter } from '@adventure/encounters';
import type { MapNode } from '@adventure/schema';

const base = buildRegistry(starterCards, starterLeaders);
const bossNode = (over: Partial<MapNode> = {}): MapNode => ({
  id: 'n7-0', kind: 'boss', layer: 7, col: 0, next: [], seed: 999, visited: false, ...over,
});

describe('boss table', () => {
  it('has unique ids and valid archetypes', () => {
    const ids = BOSSES.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(BOSSES.length).toBe(13); // one per leader
    for (const b of BOSSES) {
      expect(bossById(b.id)).toBe(b);
      expect(starterDecks.some((d) => d.leaderId === b.leaderId), `${b.id} leader`).toBe(true);
    }
  });

  it('covers every leader exactly once', () => {
    const leaderIds = BOSSES.map((b) => b.leaderId).sort();
    const allLeaders = starterDecks.map((d) => d.leaderId).sort();
    expect(leaderIds).toEqual(allLeaders);
  });
});

describe('one signature per boss', () => {
  it('every boss has exactly one rule — the only signature channel left', () => {
    for (const b of BOSSES) expect(b.rule, b.id).toBeTruthy();
  });

  it('every boss rule bites on ROUND ONE — no wind-ups', () => {
    // The rule that cut "your Signature never arrives" (most fights never reach half HP)
    // and "from round 3 a lane closes" (most fights are over). Every mechanism below is
    // either already resolved at battle start or fires on the first turn of the fight.
    const roundOne = (r: NonNullable<Boss['rule']>): boolean =>
      r.seal !== undefined ||
      r.mirror !== undefined ||
      r.execute !== undefined ||
      r.recursion !== undefined ||
      r.dampen !== undefined ||
      // A re-laid board is standing before the first card is played, by construction.
      r.laneLayout !== undefined ||
      // CHARGE fires inside the FIRST Declare Attack of the fight; METASTASIS pays out
      // off the FIRST unit played; BEHIND THE MASK steals before the first card is even
      // chosen from hand.
      r.doubleCombat !== undefined ||
      r.feedOnPlay !== undefined ||
      r.steal !== undefined ||
      // THE CAULDRON and DISCIPLINE are gates on the normal status/buff/heal machinery —
      // they are simply already active from the moment the fight starts.
      r.cauldron !== undefined ||
      r.disciplined !== undefined ||
      // A placement is round-one iff it is the opening board (0) or fires on odd rounds.
      (r.placements ?? []).some((p) => p.everyRounds === 0 || p.everyRounds % 2 === 0);
    for (const b of BOSSES) if (b.rule) expect(roundOne(b.rule), b.id).toBe(true);
  });

  it('every placement names a real card the registry can build', () => {
    for (const b of BOSSES) {
      for (const p of b.rule?.placements ?? []) {
        const def = base.cards.get(p.cardId);
        expect(def, `${b.id} -> ${p.cardId}`).toBeTruthy();
        expect(def!.type === 'unit' || def!.type === 'foundation', p.cardId).toBe(true);
      }
    }
  });

  it('boss rules are aimed at the player seat (0), except those that act for the boss', () => {
    // Adventure seats the player at 0 and the boss at 1. A rule that PUNISHES reads
    // `player: 0`; a rule that gives the boss something reads 1. Getting this backwards is
    // the single easiest authoring mistake here and is silent at runtime.
    expect(bossById('screyera-all-seeing')!.rule!.seal).toBe(0);
    expect(bossById('ringleader-executioner')!.rule!.execute).toBe(0);
    expect(bossById('autopus-overflow')!.rule!.mirror).toBe(0);
    expect(bossById('eksana-nice')!.rule!.dampen!.player).toBe(0);
    expect(bossById('noctua-death-artificer')!.rule!.recursion).toBe(1);
    for (const b of BOSSES) for (const p of b.rule?.placements ?? []) expect(p.side, b.id).toBe(1);
  });
});

describe('minAct gating', () => {
  it('never seats a gated boss earlier than its minAct', () => {
    for (let seed = 0; seed < 60; seed++) {
      for (let act = 1; act <= BOSSES.length; act++) {
        const b = bossForAct(seed, act);
        expect(b.minAct ?? 1, `${b.id} @ act ${act} (seed ${seed})`).toBeLessThanOrEqual(act);
      }
    }
  });

<<<<<<< Updated upstream
  it("Cleath's Fortify also grants +1 attack alongside its HP", () => {
    const boss = bossById('cleath-architect')!;
    const baseLeader = base.leaders.get('cleath')!;
    const overridden = boss.heroPowerOverride!(structuredClone(baseLeader.heroPower));
    const buffEffect = overridden.effects.find((e) => e.kind === 'buff')!;
    expect(buffEffect.stat).toEqual({ attack: 1, hp: 1 });
    expect(baseLeader.heroPower.effects.find((e) => e.kind === 'buff')!.stat).toEqual({ hp: 1 }); // untouched
=======
  it('still shows every boss exactly once per cycle', () => {
    for (let seed = 0; seed < 20; seed++) {
      const ids = Array.from({ length: BOSSES.length }, (_, i) => bossForAct(seed, i + 1).id);
      expect(new Set(ids).size, `seed ${seed}`).toBe(BOSSES.length);
    }
>>>>>>> Stashed changes
  });

  it('leaves act 1 with real choices rather than one forced boss', () => {
    const seen = new Set(Array.from({ length: 60 }, (_, s) => bossForAct(s, 1).id));
    expect(seen.size).toBeGreaterThan(1);
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
  it('play the boss archetype at full deck with its bonus HP', () => {
    const enc = rollEncounter(base, bossNode(), 1);
    const boss = bossForAct(999, 1);
    expect(enc.boss).toEqual(boss);
    expect(enc.enemyLeaderId).toBe(boss.leaderId);
    expect(enc.enemyDeck.cards.reduce((s, c) => s + c.count, 0)).toBe(RULES.DECK_SIZE);
    // HP is purely the curve times the boss multiplier — no private per-boss top-up, so
    // the 2x ratio holds exactly.
    const plain = rollEncounter(base, bossNode(), 1).enemyHp;
    expect(plain).toBe(encounterHp('boss', bossNode().layer, 1));
  });

  it('withholds the boss rule in act 1 and applies it from act 2 on', () => {
    // Act 1 is the introduction: a boss rule breaks a rule of the whole game, and meeting
    // one on a 15-card starter deck was measured as the run's single largest spike.
    expect(rollEncounter(base, bossNode(), 1).bossRules).toBeUndefined();
    const later = rollEncounter(base, bossNode({ layer: 8 }), 2, 1, 999);
    const boss2 = bossForAct(999, 2);
    expect(later.bossRules).toEqual(boss2.rule);
  });

  it('scales boss HP by act and still applies the relic enemy-HP multiplier', () => {
    const act1 = rollEncounter(base, bossNode(), 1).enemyHp;
    const enc = rollEncounter(base, bossNode({ layer: 8 }), 2);
    expect(enc.enemyHp).toBeGreaterThan(act1);
    // Proportional, so the cut is worth the same share of the fight at every act.
    const softer = rollEncounter(base, bossNode({ layer: 8 }), 2, 0.5);
    expect(softer.enemyHp).toBeLessThan(enc.enemyHp);
    expect(softer.enemyHp / enc.enemyHp).toBeCloseTo(0.5, 1);
  });
});
