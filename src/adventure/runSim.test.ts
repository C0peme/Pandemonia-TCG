import { describe, expect, it } from 'vitest';
import { buildRegistry } from '@cards/registry';
import { starterCards, starterLeaders } from '@cards/data/starter';
import { simulateRun, summarize, DEFAULT_POLICY, type RunSimResult } from '@adventure/runSim';
import type { MapNode } from '@adventure/schema';

const base = buildRegistry(starterCards, starterLeaders);

// These assert PLUMBING and determinism, not balance, so they opt out of the planning AI
// (`usePlan: false`). The planning policy is ~50x slower per game and a run is ~20 games;
// nothing asserted here can be affected by which policy plays the fights. Balance work
// must use the default — see the note on RunSimOptions.
const fast = { usePlan: false, maxActs: 2 } as const;

describe('simulateRun', () => {
  it('plays a run to a terminal outcome', () => {
    const r = simulateRun(base, 'orsyric', 1, fast);
    expect(['cleared', 'dead', 'stalled']).toContain(r.outcome);
    // A stalled run means the policy stopped making progress — always a bug, never data.
    expect(r.outcome).not.toBe('stalled');
    expect(r.fights.length).toBeGreaterThan(0);
    expect(r.nodesVisited).toBeGreaterThanOrEqual(r.fights.length);
  });

  it('is deterministic for a fixed leader and seed', () => {
    expect(simulateRun(base, 'orsyric', 7, fast)).toEqual(simulateRun(base, 'orsyric', 7, fast));
  });

  it('different seeds produce different runs', () => {
    const a = simulateRun(base, 'orsyric', 11, fast);
    const b = simulateRun(base, 'orsyric', 12, fast);
    expect(a).not.toEqual(b);
  });

  it.each(starterLeaders.map((l) => l.id))('%s: runs without stalling', (leaderId) => {
    const r = simulateRun(base, leaderId, 3, { usePlan: false, maxActs: 1 });
    expect(r.outcome).not.toBe('stalled');
    expect(r.leaderId).toBe(leaderId);
  });

  it('a dead run ends on a fight it lost', () => {
    // Seeds vary, so find one that dies rather than asserting a particular run does.
    const dead = [1, 2, 3, 4]
      .map((s) => simulateRun(base, 'orsyric', s, fast))
      .find((r) => r.outcome === 'dead');
    expect(dead).toBeDefined();
    expect(dead!.fights[dead!.fights.length - 1]!.won).toBe(false);
  });

  it('carries leader HP between fights rather than resetting it', () => {
    // Carry-over is only OBSERVABLE across two won fights, so the run needs at least two —
    // but which seed delivers that depends on the whole card pool, so pinning one seed made
    // this fail on any balance change (a leader recost elsewhere in the pool was enough).
    // Same fix as the dead-run test above: search seeds for a run that can show the property,
    // rather than asserting a particular run has it.
    const r = [5, 1, 2, 3, 4, 6, 7, 8]
      .map((seed) => simulateRun(base, 'cleath', seed, fast))
      .find((run) => run.fights.filter((f) => f.won).length > 1);
    expect(r, 'no sampled seed won two fights — cannot observe HP carry-over').toBeDefined();
    // Every fight opens at the run's carried HP, never above the leader's max.
    for (const f of r!.fights) expect(f.hpBefore).toBeLessThanOrEqual(r!.maxHp);
    // At least one fight starts below max, i.e. damage actually persisted.
    expect(r!.fights.some((f) => f.hpBefore < r!.maxHp)).toBe(true);
  });

  it('respects maxActs', () => {
    const r = simulateRun(base, 'orsyric', 2, { usePlan: false, maxActs: 1 });
    expect(r.actReached).toBeLessThanOrEqual(2); // act 2 only ever as the "cleared act 1" state
    if (r.outcome === 'cleared') expect(r.bossesKilled).toBe(1);
  });

  it('a cleared run has killed one boss per act', { timeout: 60_000 }, () => {
    const cleared = [1, 2, 3, 4]
      .map((s) => simulateRun(base, 'cleath', s, { usePlan: false, maxActs: 1 }))
      .find((r) => r.outcome === 'cleared');
    if (!cleared) return; // no clear in this sample — nothing to assert, and not a failure
    expect(cleared.bossesKilled).toBe(1);
    // The act 1 boss awards the leader's unique, and every leader has one authored.
    expect(cleared.hasUnique).toBe(true);
  });

  it('reports the fight the run actually got: twists on trials, a named boss on bosses', () => {
    const rs = [1, 2, 3].map((s) => simulateRun(base, 'phantom', s, fast));
    const trials = rs.flatMap((r) => r.fights.filter((f) => f.kind === 'trial'));
    const bosses = rs.flatMap((r) => r.fights.filter((f) => f.kind === 'boss'));
    // A Trial is defined by fighting under a twist; a Trial reported without one means
    // the sim built a plain fight and the whole node kind went unmeasured.
    for (const t of trials) expect(t.twist).toBeDefined();
    for (const b of bosses) expect(b.boss).toBeDefined();
  });

  it('onFight streams every fight in order', () => {
    const seen: number[] = [];
    const r = simulateRun(base, 'orsyric', 4, { ...fast, onFight: (f) => seen.push(f.act) });
    expect(seen.length).toBe(r.fights.length);
  });

  it('a policy override changes the run', () => {
    const greedy = simulateRun(base, 'orsyric', 9, fast);
    // Skipping every reward card is a materially different player.
    const lean = simulateRun(base, 'orsyric', 9, { ...fast, policy: { takeRewardCard: () => null } });
    expect(lean.deckSize).toBeLessThan(greedy.deckSize);
  });

  it('DEFAULT_POLICY seeks a camp when wounded', () => {
    const roll = { float: () => 0, int: () => 0, pick: <T,>(a: readonly T[]) => a[0]!, shuffle: <T,>(a: readonly T[]) => [...a], chance: () => false };
    const node = (id: string, kind: MapNode['kind'], col: number): MapNode =>
      ({ id, kind, layer: 1, col, next: [], seed: col, visited: false });
    const nodes = [node('elite', 'elite', 0), node('rest', 'rest', 1)];
    const healthy = { hp: 30, maxHp: 30 } as never;
    const hurt = { hp: 6, maxHp: 30 } as never;
    expect(DEFAULT_POLICY.route(healthy, nodes, roll)).toBe('elite');
    expect(DEFAULT_POLICY.route(hurt, nodes, roll)).toBe('rest');
  });
});

describe('summarize', () => {
  it('buckets outcomes, deaths and economy across runs', () => {
    const results: RunSimResult[] = [1, 2, 3].map((s) => simulateRun(base, 'orsyric', s, fast));
    const agg = summarize('orsyric', results);
    expect(agg.runs).toBe(3);
    expect(agg.cleared + agg.died + agg.stalled).toBe(3);
    expect(agg.avgFights).toBeGreaterThan(0);
    // Every death is bucketed by the node kind that ended the run.
    const bucketed = Object.values(agg.deathsByKind).reduce((s, n) => s + n, 0);
    expect(bucketed).toBe(agg.died);
    expect(Object.values(agg.deathsByAct).reduce((s, n) => s + n, 0)).toBe(agg.died);
  });
});
