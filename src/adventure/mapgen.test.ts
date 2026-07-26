import { describe, expect, it } from 'vitest';
import { generateMap } from '@adventure/mapgen';
import type { RunMap } from '@adventure/schema';

const allIds = (map: RunMap): string[] => map.layers.flat();

/** BFS from layer 0 following `next` edges. */
const reachableFromStart = (map: RunMap): Set<string> => {
  const seen = new Set<string>(map.layers[0]);
  const queue = [...(map.layers[0] ?? [])];
  while (queue.length) {
    const id = queue.shift()!;
    for (const n of map.nodes[id]!.next) if (!seen.has(n)) { seen.add(n); queue.push(n); }
  }
  return seen;
};

/** Nodes from which the boss is reachable. */
const reachesBoss = (map: RunMap): Set<string> => {
  const ok = new Set<string>([map.bossId]);
  for (let l = map.layers.length - 2; l >= 0; l--) {
    for (const id of map.layers[l]!) {
      if (map.nodes[id]!.next.some((n) => ok.has(n))) ok.add(id);
    }
  }
  return ok;
};

describe('generateMap', () => {
  it('is deterministic per (seed, act) and varies across seeds', () => {
    expect(generateMap(42, 1)).toEqual(generateMap(42, 1));
    expect(JSON.stringify(generateMap(42, 1))).not.toEqual(JSON.stringify(generateMap(43, 1)));
  });

  it('produces a fully-connected DAG with the right structure (100 seeds)', () => {
    for (let seed = 0; seed < 100; seed++) {
      const map = generateMap(seed, 1 + (seed % 3));
      const ids = allIds(map);
      // Exactly one boss, at the end.
      const bosses = ids.filter((id) => map.nodes[id]!.kind === 'boss');
      expect(bosses).toEqual([map.bossId]);
      expect(map.layers[map.layers.length - 1]).toEqual([map.bossId]);
      // Layer 0 is all combat.
      for (const id of map.layers[0]!) expect(map.nodes[id]!.kind).toBe('combat');
      // Every node is reachable from the start and reaches the boss.
      const fromStart = reachableFromStart(map);
      const toBoss = reachesBoss(map);
      for (const id of ids) {
        expect(fromStart.has(id), `${id} unreachable (seed ${seed})`).toBe(true);
        expect(toBoss.has(id), `${id} cannot reach boss (seed ${seed})`).toBe(true);
      }
      // Edges only go to the next layer.
      for (const id of ids) {
        const n = map.nodes[id]!;
        for (const t of n.next) expect(map.nodes[t]!.layer).toBe(n.layer + 1);
      }
      // At least one store and one enhance per map.
      expect(ids.some((id) => map.nodes[id]!.kind === 'store'), `no store (seed ${seed})`).toBe(true);
      expect(ids.some((id) => map.nodes[id]!.kind === 'enhance'), `no enhance (seed ${seed})`).toBe(true);
      // Trials always carry a twist id; Elites never do (their edge is HP/deck, not a twist).
      for (const id of ids) {
        const n = map.nodes[id]!;
        if (n.kind === 'trial') expect(n.twistId, `${id} missing twist`).toBeTruthy();
        if (n.kind === 'elite') expect(n.twistId, `${id} elite should have no twist`).toBeUndefined();
      }
      // Elites never appear on layer 0 or the pre-boss/boss layers.
      for (const id of ids) {
        const n = map.nodes[id]!;
        if (n.kind === 'elite') {
          expect(n.layer).toBeGreaterThanOrEqual(2);
          expect(n.layer).toBeLessThan(map.layers.length - 2);
        }
      }
    }
  });

  it('produces elite, trial, rest, and event nodes across a spread of seeds', () => {
    const kinds = new Set<string>();
    for (let seed = 0; seed < 60; seed++) {
      for (const id of allIds(generateMap(seed, 2))) kinds.add(generateMap(seed, 2).nodes[id]!.kind);
    }
    for (const k of ['elite', 'trial', 'rest', 'event']) expect(kinds.has(k), `no ${k} node in 60 seeds`).toBe(true);
  });

  it('adds layers in later acts', () => {
    expect(generateMap(7, 2).layers.length).toBe(generateMap(7, 1).layers.length + 1);
  });
});
