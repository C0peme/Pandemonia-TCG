import { describe, expect, it } from 'vitest';
import { buildRegistry, expandDeck } from '@cards/registry';
import { starterCards, starterLeaders, starterDecks } from '@cards/data/starter';
import { RULES } from '@engine/constants';
import { simulateGame } from '@engine/sim';
import { signatureThreshold } from '@engine/damage';
import { rollEncounter, encounterHp, playerDeck, buildEncounterState, buildCopperMechState } from '@adventure/encounters';
import { buildRunRegistry, ENEMY_LEADER_ID } from '@adventure/runRegistry';
import { ADVENTURE_STARTERS } from '@adventure/data/starters';
import { copperMechLeader } from '@adventure/data/copperMech';
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
    // Asserted as a RELATION rather than two magic numbers, so a difficulty-curve retune
    // does not require editing the test that guards the curve's shape.
    expect(size(early)).toBeLessThan(size(later));
    expect(size(early)).toBeGreaterThanOrEqual(4);
    expect(size(later)).toBeLessThanOrEqual(RULES.DECK_SIZE);
    // Every trimmed card exists in the source archetype.
    const archetype = starterDecks.find((d) => d.leaderId === early.enemyLeaderId)!;
    const pool = new Set(archetype.cards.map((c) => c.cardId));
    for (const c of early.enemyDeck.cards) expect(pool.has(c.cardId), c.cardId).toBe(true);
  });

  it('bosses play the full archetype deck, and their HP grows with the act', () => {
    const boss1 = rollEncounter(base, node({ kind: 'boss', layer: 7 }), 1);
    expect(boss1.enemyDeck.cards.reduce((s, c) => s + c.count, 0)).toBe(RULES.DECK_SIZE);
    expect(boss1.boss).toBeTruthy();
    // The act-1 boss sits BELOW a full leader's HP on purpose: it used to arrive at the
    // player's own maximum while the player reached it around half, which made act 1 the
    // deadliest act in the game by far (measured with .tuning/advRun.ts).
    expect(boss1.enemyHp).toBeLessThan(RULES.LEADER_HP);
    const boss2 = rollEncounter(base, node({ kind: 'boss', layer: 8 }), 2);
    expect(boss2.enemyHp).toBeGreaterThan(boss1.enemyHp);
  });

  it('scales enemy HP EXPONENTIALLY, gently — rising and accelerating', () => {
    // Gentle, but still compounding: a flattening (logarithmic) curve was tried and
    // rejected, because the player compounds too — deck, enhancements, relics, leader
    // upgrades, +max HP per act — so a curve that plateaus means late acts stop being
    // fights at all, and an endless run needs its acts to keep meaning something.
    //
    // Measured on a PLAIN combat node, not a boss: `bossForAct` walks a per-run
    // permutation and different bosses carry different `bonusHp`, so a boss's total HP
    // is not monotonic across acts even when the curve underneath it is.
    const hpAt = (act: number): number => rollEncounter(base, node({ layer: 3 }), act).enemyHp;

    // Monotonic.
    for (let act = 1; act <= 9; act++) {
      expect(hpAt(act + 1), `act ${act + 1} vs ${act}`).toBeGreaterThanOrEqual(hpAt(act));
    }
    expect(hpAt(8)).toBeGreaterThan(hpAt(2));

    // Accelerating, measured over SPANS rather than single steps: HP is rounded to an
    // even number, so consecutive acts can tie and a per-step comparison would be
    // testing the rounding rather than the curve.
    const span = (from: number, to: number): number => hpAt(to) - hpAt(from);
    expect(span(5, 8), 'later growth must outpace earlier growth').toBeGreaterThanOrEqual(span(2, 5));

    // ...and GENTLY: act 2 must not cost anything like the 30% premium it used to, or
    // the on-ramp that clearing act 2 depends on is gone.
    // (Compared loosely: HP rounds to an even number, which inflates the apparent ratio
    // at the small totals act 1 uses. The point is that act 2 is nowhere near the 1.3x
    // premium it used to carry.)
    expect(hpAt(2) / hpAt(1)).toBeLessThanOrEqual(1.2);
  });

  it('fights the act-1 boss without its signature condition', () => {
    // Act 1 is the introduction. Its boss no longer needs a hand-set HP discount — the
    // shared curve at scale 1.0 is already the gentlest point on it — so the twist is the
    // one act-1-only rule left. 26 of 39 simulated deaths were in act 1, 23 at a boss.
    const boss1 = rollEncounter(base, node({ kind: 'boss', layer: 8 }), 1);
    const boss2 = rollEncounter(base, node({ kind: 'boss', layer: 8 }), 2);
    // Non-strict: HP rounds to an even number, so two adjacent acts can land on the same
    // total at a given layer.
    expect(boss1.enemyHp).toBeLessThanOrEqual(boss2.enemyHp);
    // A boss twist rewrites the whole board; meeting one on a 15-card starter deck, with
    // no relic or enhancement yet to answer it, was the run's single biggest spike.
    expect(boss1.twist).toBeUndefined();
    // ...but the boss keeps its identity and its FULL archetype deck. Softening act 1
    // through deck size was tried and measured worse (the trim is cheapest-first, so a
    // smaller deck is a concentrated one), so HP is the only lever that may move here.
    expect(boss1.boss).toBeTruthy();
    expect(expandDeck(boss1.enemyDeck).length).toBe(RULES.DECK_SIZE);
  });

  it('still gives later-act bosses their signature condition', () => {
    // Guard against the act-1 exemption quietly swallowing every boss signature — a boss's
    // signature is EITHER a Trial twist or a boss rule (see bosses.ts), so both channels
    // count as "has its condition" here.
    const withSignature = [2, 3, 4, 5, 6].some((act) => {
      for (let seed = 0; seed < 40; seed++) {
        const enc = rollEncounter(base, node({ kind: 'boss', layer: 8, seed }), act, 1, seed);
        if (enc.twist || enc.bossRules) return true;
      }
      return false;
    });
    expect(withSignature).toBe(true);
  });

  it('keeps every enemy HP total EVEN so the Signature threshold is a clean integer', () => {
    for (let act = 1; act <= 8; act++) {
      for (const kind of ['combat', 'elite', 'trial', 'boss'] as const) {
        for (let layer = 0; layer < 8; layer++) {
          const hp = rollEncounter(base, node({ kind, layer, seed: layer * 3 + act }), act).enemyHp;
          expect(hp % 2, `${kind} act${act} layer${layer} -> ${hp}`).toBe(0);
        }
      }
    }
  });

  it('holds the HP ratio: Trial = Normal, Elite = 1.5x, Boss = 2x', () => {
    // One curve with two multipliers, so the ordering is true by construction rather
    // than something a cap has to enforce afterwards.
    for (let act = 1; act <= 6; act++) {
      for (const layer of [0, 3, 6]) {
        const at = (kind: MapNode['kind']): number =>
          rollEncounter(base, node({ kind, layer, seed: 5 }), act, 1, 5).enemyHp;
        const normal = encounterHp('combat', layer, act);
        expect(at('combat'), `combat act${act} layer${layer}`).toBe(normal);
        // A Trial's difficulty is its twist, never a bigger body.
        expect(at('trial'), `trial act${act} layer${layer}`).toBe(normal);
        // Even-rounding means these are approximate; assert the band, not the exact value.
        // Compared on the CURVE, before a named Boss/Elite's own `bonusHp` — that bonus
        // is per-encounter character, not part of the ratio being specified here.
        const elite = encounterHp('elite', layer, act);
        const boss = encounterHp('boss', layer, act);
        expect(elite / normal, `elite ratio act${act} layer${layer}`).toBeGreaterThanOrEqual(1.2);
        expect(elite / normal).toBeLessThanOrEqual(1.8);
        expect(boss / normal, `boss ratio act${act} layer${layer}`).toBeGreaterThanOrEqual(1.7);
        expect(boss / normal).toBeLessThanOrEqual(2.3);
        expect(boss).toBeGreaterThan(elite);
      }
    }
  });

  it('never lets an Elite out-tank the boss even with its named bonus HP', () => {
    // `encounterHp` capped the CURVE at the boss's, but the named Elite's own `bonusHp`
    // was added after that cap — so a beefy Elite could out-tank the boss it precedes,
    // in violation of the rule the cap exists to state.
    for (let act = 1; act <= 4; act++) {
      const boss = rollEncounter(base, node({ kind: 'boss', layer: 8, seed: 7 }), act, 1, 7).enemyHp;
      for (let seed = 0; seed < 30; seed++) {
        for (let layer = 0; layer < 8; layer++) {
          const elite = rollEncounter(base, node({ kind: 'elite', layer, seed }), act, 1, 7).enemyHp;
          expect(elite, `elite seed ${seed} layer ${layer} act ${act}`).toBeLessThanOrEqual(boss);
        }
      }
    }
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

  it('elites spike deck size + HP, and arrive NAMED', () => {
    const regular = rollEncounter(base, node({ kind: 'combat', layer: 2, seed: 5 }), 1);
    const elite = rollEncounter(base, node({ kind: 'elite', layer: 2, seed: 5 }), 1);
    const size = (e: typeof elite): number => e.enemyDeck.cards.reduce((s, c) => s + c.count, 0);
    expect(size(elite)).toBeGreaterThan(size(regular));
    expect(elite.enemyHp).toBeGreaterThan(regular.enemyHp);
    expect(elite.coinReward).toBeGreaterThan(regular.coinReward);
    // Elites used to be anonymous stat spikes. They now carry a named identity from the
    // ELITES table, and play THAT champion's archetype rather than a random one.
    expect(elite.elite).toBeTruthy();
    expect(elite.enemyLeaderId).toBe(elite.elite!.leaderId);
    expect(regular.elite).toBeUndefined();
  });

  it('an elite may carry its own mild twist — but never one rolled onto the NODE', () => {
    // The distinction matters: `node.twistId` is mapgen's channel and stays a Trial-only
    // thing (mapgen.test asserts elites never get one). An Elite's twist comes from its
    // own authored data instead, so the two systems cannot collide.
    for (let seed = 0; seed < 30; seed++) {
      const n = node({ kind: 'elite', layer: 2, seed });
      expect(n.twistId).toBeUndefined();
      const enc = rollEncounter(base, n, 1);
      if (enc.twist) expect(enc.twist.id).toBe(enc.elite!.twistId);
    }
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

  it('applies the enemyHp relic multiplier but never below the minimal safety floor', () => {
    const enc = rollEncounter(base, node({ layer: 6, seed: 8 }), 4);
    const softer = rollEncounter(base, node({ layer: 6, seed: 8 }), 4, 0.75);
    expect(softer.enemyHp).toBeLessThan(enc.enemyHp);
    // Proportional: the same relic is worth the same SHARE of any fight, so re-tuning the
    // HP curve can never turn a discount into a delete button.
    expect(softer.enemyHp / enc.enemyHp).toBeCloseTo(0.75, 1);
    const floored = rollEncounter(base, node({ layer: 0, seed: 8 }), 1, 0.01);
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
    const result = simulateGame(registry, [player, { ...enc.enemyDeck, leaderId: ENEMY_LEADER_ID }], 5);
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
    // Temporary HP from the post-battle overheal is seated as-is — above max is legal.
    const over = buildEncounterState(registry, player, enc, 9, full + 8);
    expect(over.players[0].leaderHp).toBe(full + 8);
    expect(over.players[0].leaderMaxHp).toBe(full);
    expect(signatureThreshold(over.players[0])).toBe(full / 2); // the line does not move
    // Still clamps nonsense rather than trusting the caller.
    expect(buildEncounterState(registry, player, enc, 9, 999).players[0].leaderHp).toBe(2 * full);
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

describe('seedRunMaxHp: leaderMaxHp tracks the RUN maximum, not the printed leader HP', () => {
  const leader = base.leaders.get('orsyric')!;
  const player = playerDeck('orsyric', ADVENTURE_STARTERS['orsyric']!.map((cardId, i) => ({ uid: `u${i}`, cardId, enhancements: [] })));

  it('buildEncounterState seats a boosted run.maxHp as the in-battle leaderMaxHp', () => {
    const enc = rollEncounter(base, node({ layer: 0 }), 1);
    const registry = buildRunRegistry(base, { deck: [], enemyLeaderId: enc.enemyLeaderId, enemyLeaderHp: enc.enemyHp });
    const state = buildEncounterState(registry, player, enc, 9, 45, 50);
    expect(state.players[0].leaderMaxHp).toBe(50);
    // The Signature line moves with it -- half of the REAL max, not the printed 30.
    expect(signatureThreshold(state.players[0])).toBe(25);
  });

  it("without it, a heal effect would have silently clamped a boosted player back to the leader's printed HP", () => {
    // Regression proof: omitting runMaxHp reproduces the exact bug this fixes --
    // leaderMaxHp pinned at the printed leader.hp (30) however high the run's real
    // ceiling has grown, which is what engine/damage.ts's healLeader clamps against.
    const enc = rollEncounter(base, node({ layer: 0 }), 1);
    const registry = buildRunRegistry(base, { deck: [], enemyLeaderId: enc.enemyLeaderId, enemyLeaderHp: enc.enemyHp });
    const unfixed = buildEncounterState(registry, player, enc, 9, 45);
    expect(unfixed.players[0].leaderMaxHp).toBe(leader.hp);
    const fixed = buildEncounterState(registry, player, enc, 9, 45, 50);
    expect(fixed.players[0].leaderMaxHp).toBe(50);
  });

  it('buildCopperMechState applies the raised MAX but always seats FULL current HP', () => {
    const registry = buildRunRegistry(base, { deck: [], extraLeaders: [copperMechLeader(base)] });
    const state = buildCopperMechState(registry, player, 1, 50);
    expect(state.players[0].leaderMaxHp).toBe(50);
    expect(state.players[0].leaderHp).toBe(50); // full at the raised max, not the printed 30
  });

  it('buildCopperMechState with no run max still seats full HP at the printed default', () => {
    const registry = buildRunRegistry(base, { deck: [], extraLeaders: [copperMechLeader(base)] });
    const state = buildCopperMechState(registry, player, 1);
    expect(state.players[0].leaderMaxHp).toBe(leader.hp);
    expect(state.players[0].leaderHp).toBe(leader.hp);
  });

  it("also raises the leader-unit avatar's own maxHp (Ring Leader)", () => {
    const rlEnc = rollEncounter(base, node({ layer: 0 }), 1);
    const registry = buildRunRegistry(base, { deck: [], enemyLeaderId: rlEnc.enemyLeaderId, enemyLeaderHp: rlEnc.enemyHp });
    const rlPlayer = playerDeck('ringleader', ADVENTURE_STARTERS['ringleader']!.map((cardId, i) => ({ uid: `u${i}`, cardId, enhancements: [] })));
    const state = buildEncounterState(registry, rlPlayer, rlEnc, 9, 40, 50);
    const lu = Object.values(state.players[0].lanes).map((l) => l.front).find((u) => u?.isLeaderUnit);
    expect(lu, 'ring leader should seat a leader-unit avatar').toBeTruthy();
    expect(lu!.maxHp).toBe(50);
    expect(lu!.hp).toBe(40);
  });
});

describe("a relic's enemy-HP multiplier is never rounded away", () => {
  // Enemy HP must stay EVEN (the Signature threshold is half of it), and the normal pool
  // is deliberately small — 8-16 HP in the early acts. Rounding to nearest therefore
  // swallowed relics whole: a 10 HP enemy under a 10% cut is 9, which rounds straight back
  // to 10, so Ember Cache did literally nothing in exactly the fights a common relic is
  // most likely to be found in.
  const hpAt = (mult: number, layer = 1, act = 1): number =>
    rollEncounter(base, node({ layer }), act, mult).enemyHp;

  it('a discount always lowers the pool, and a surcharge always raises it', () => {
    for (const layer of [0, 1, 2, 4, 6]) {
      for (const act of [1, 2, 4]) {
        const plain = hpAt(1, layer, act);
        if (plain <= 2) continue; // already at the floor; nothing left to cut
        expect(hpAt(0.9, layer, act), `cut at layer ${layer} act ${act}`).toBeLessThan(plain);
        expect(hpAt(1.25, layer, act), `surcharge at layer ${layer} act ${act}`).toBeGreaterThan(plain);
      }
    }
  });

  it('stays even, and stays close to the intended proportion', () => {
    // Nudging only when the result WOULD be a no-op keeps the number as near the intended
    // proportion as evenness allows — flooring instead would turn a 25% cut on 10 HP into
    // a 40% one.
    for (const mult of [0.75, 0.85, 0.9, 1.25]) {
      for (const layer of [0, 2, 5]) {
        const plain = hpAt(1, layer, 3);
        const scaled = hpAt(mult, layer, 3);
        expect(scaled % 2, `${mult} @ layer ${layer} is odd`).toBe(0);
        expect(Math.abs(scaled - plain * mult), `${mult} @ layer ${layer} drifted`).toBeLessThanOrEqual(2);
      }
    }
  });

  it('leaves the pool alone at a multiplier of exactly 1', () => {
    for (const layer of [0, 3, 6]) expect(hpAt(1, layer, 2)).toBe(encounterHp('combat', layer, 2));
  });
});
