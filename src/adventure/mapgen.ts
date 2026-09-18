/**
 * Branching act-map generator (Slay-the-Spire-lite).
 *
 * Deterministic: the same (seed, act) always produces the same map. Layout is a
 * layered DAG — every node connects only into the next layer, every node is
 * reachable from layer 0, and every path ends at the single boss node.
 */
import { subSeed, makeRoller } from '@adventure/seed';
import type { MapNode, NodeKind, RunMap } from '@adventure/schema';
import { TRIAL_TWISTS } from '@adventure/trials';

/** Non-boss layers per act: 7 in act 1, +1 per act, capped at 10. */
const layerCount = (act: number): number => Math.min(10, 6 + act);

const nodeId = (layer: number, col: number): string => `n${layer}-${col}`;

export const generateMap = (seed: number, act: number): RunMap => {
  const roll = makeRoller(subSeed(seed, act, 'map'));
  const L = layerCount(act);

  // Layer widths: 2-3 entries at the start, 2-4 in the middle, 1 boss on top.
  const widths: number[] = [];
  for (let l = 0; l < L; l++) widths.push(l === 0 ? 2 + roll.int(2) : 2 + roll.int(3));
  widths.push(1); // boss layer

  // --- Kinds ---------------------------------------------------------------
  // Layer 0 is always combat; the boss layer is the boss. Elsewhere we roll,
  // keeping at least one combat per layer and biasing the pre-boss layer toward
  // shopping/upgrading (a "rest stop" before the fight).
  // Rest is deliberately the second-widest band. Adventure is an attrition run whose
  // ONLY repeatable HP source is a camp: a path through act 1 is ~5.3 battles costing
  // ~9.8 HP each against a 30 HP pool, and max HP grows only via two rare relics. At
  // the old 10% a rest-seeking route met just 0.68 camps an act, so the run was asked
  // for ~52 HP and handed ~36 — it could not be routed around, only lost to. 18% puts
  // a path at ~1.4 camps an act. If this drops, raise ECON.REST_HEAL_FRACTION to match
  // or runs go back to dying on arithmetic rather than on play.
  const rollKind = (r: number): NodeKind =>
    r < 0.38 ? 'combat' : r < 0.52 ? 'trial' : r < 0.65 ? 'store' : r < 0.76 ? 'enhance' : r < 0.94 ? 'rest' : 'event';

  const kinds: NodeKind[][] = widths.map((w, l) => {
    if (l === 0) return Array<NodeKind>(w).fill('combat');
    if (l === L) return ['boss'];
    const row: NodeKind[] = [];
    let nonCombat = 0;
    for (let c = 0; c < w; c++) {
      const preBoss = l === L - 1;
      let kind = preBoss && roll.chance(0.5) ? (roll.chance(0.5) ? 'store' : 'enhance') : rollKind(roll.float());
      if (kind !== 'combat' && nonCombat >= w - 1) kind = 'combat';
      if (kind !== 'combat') nonCombat++;
      row.push(kind);
    }
    return row;
  });

  // Guarantee at least one store, one enhance and one rest somewhere in the middle
  // layers: swap a combat node in a seeded middle layer if a kind is missing entirely.
  // Rest is in this list for the same reason it has a wide band above — a map with no
  // camp on it is a map the attrition math cannot be survived on.
  for (const wanted of ['store', 'enhance', 'rest'] as const) {
    if (kinds.some((row) => row.includes(wanted))) continue;
    // Convert a middle-layer combat node, preferring layers that keep a spare combat.
    const candidates: { l: number; c: number; spare: boolean }[] = [];
    for (let l = 1; l < L; l++) {
      const combats = kinds[l]!.filter((k) => k === 'combat').length;
      kinds[l]!.forEach((k, c) => {
        if (k === 'combat') candidates.push({ l, c, spare: combats > 1 });
      });
    }
    if (candidates.length === 0) continue;
    const spares = candidates.filter((x) => x.spare);
    const pool = spares.length > 0 ? spares : candidates;
    const chosen = pool[roll.int(pool.length)]!;
    kinds[chosen.l]![chosen.c] = wanted;
  }

  // Elite nodes: convert a few combat nodes in the mid/late layers (never layer 0 or
  // the pre-boss layer) into Elites — the beefier, better-rewarded fights. Count grows
  // with the act. Trials remain what `rollKind` rolls (~15%); Elite is its own pass so a
  // few of the tougher fights are guaranteed per act rather than left to chance.
  const eliteCount = Math.min(3, 1 + Math.floor(act / 2));
  const eliteSpots: { l: number; c: number }[] = [];
  for (let l = 2; l < L - 1; l++) kinds[l]!.forEach((k, c) => { if (k === 'combat') eliteSpots.push({ l, c }); });
  for (const spot of roll.shuffle(eliteSpots).slice(0, eliteCount)) kinds[spot.l]![spot.c] = 'elite';

  // --- Edges ---------------------------------------------------------------
  // Each node connects to the "scaled" node in the next layer, plus (sometimes)
  // an adjacent one; a repair pass guarantees no orphans.
  const nodes: Record<string, MapNode> = {};
  const layers: string[][] = [];
  for (let l = 0; l <= L; l++) {
    const row: string[] = [];
    for (let c = 0; c < widths[l]!; c++) {
      const id = nodeId(l, c);
      row.push(id);
      const kind = kinds[l]![c]!;
      nodes[id] = {
        id,
        kind,
        layer: l,
        col: c,
        next: [],
        seed: subSeed(seed, act, 'node', id),
        visited: false,
        ...(kind === 'trial' ? { twistId: TRIAL_TWISTS[roll.int(TRIAL_TWISTS.length)]!.id } : {}),
      };
    }
    layers.push(row);
  }

  for (let l = 0; l < L; l++) {
    const w = widths[l]!;
    const nextW = widths[l + 1]!;
    for (let c = 0; c < w; c++) {
      const targets = new Set<number>();
      const scaled = Math.min(nextW - 1, Math.floor((c * nextW) / w));
      targets.add(scaled);
      if (roll.chance(0.5)) {
        const adj = scaled + (roll.chance(0.5) ? 1 : -1);
        if (adj >= 0 && adj < nextW) targets.add(adj);
      }
      nodes[nodeId(l, c)]!.next = [...targets].sort((a, b) => a - b).map((t) => nodeId(l + 1, t));
    }
    // Repair: every next-layer node needs an inbound edge from its nearest source.
    for (let t = 0; t < nextW; t++) {
      const tid = nodeId(l + 1, t);
      if (layers[l]!.some((id) => nodes[id]!.next.includes(tid))) continue;
      const nearest = Math.min(w - 1, Math.max(0, Math.round((t * w) / nextW)));
      const src = nodes[nodeId(l, nearest)]!;
      src.next = [...new Set([...src.next, tid])].sort();
    }
  }

  return { nodes, layers, bossId: nodeId(L, 0) };
};
