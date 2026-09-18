import { describe, expect, it } from 'vitest';
import { TRIAL_TWIST_CHOICES, trialById } from '@adventure/trials';
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
      // Every guaranteed kind appears on EVERY map. Rest and event were added to this
      // guarantee after measurement showed 22.6% of act-1 maps had no Rest Site on any
      // route (and 32.2% no event) — in an attrition run where Rest is the only source of
      // temporary HP, a quarter of runs had no access to the healing system at all.
      for (const kind of ['store', 'enhance', 'rest', 'event'] as const) {
        expect(ids.some((id) => map.nodes[id]!.kind === kind), `no ${kind} (seed ${seed})`).toBe(true);
      }
      // A Trial carries a SHORTLIST of twists to choose between, and no twist yet — the
      // condition is the player's decision, made on entering the node. Elites still carry
      // none on the node at all (their own twist, if any, comes from `data/elites.ts`).
      for (const id of ids) {
        const n = map.nodes[id]!;
        if (n.kind === 'trial') {
          expect(n.twistChoices, `${id} missing twist shortlist`).toBeTruthy();
          expect(n.twistChoices!.length, `${id} shortlist too short`).toBe(TRIAL_TWIST_CHOICES);
          expect(new Set(n.twistChoices).size, `${id} shortlist repeats a twist`).toBe(n.twistChoices!.length);
          for (const t of n.twistChoices!) {
            const twist = trialById(t);
            expect(twist, `${id} offers unknown twist ${t}`).toBeTruthy();
            // A Trial must never offer a boss signature.
            expect(twist!.bossOnly, `${id} offers boss-only ${t}`).toBeFalsy();
          }
          expect(n.twistId, `${id} should have no twist until one is chosen`).toBeUndefined();
        }
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
