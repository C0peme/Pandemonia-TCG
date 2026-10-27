import { describe, it } from 'vitest';
import { buildRegistry } from '@cards/registry';
import { starterCards, starterLeaders } from '@cards/data/starter';
import { startRun } from '@adventure/run';
import { buildFight } from '@adventure/encounters';
import { playOutGame } from '@engine/sim';
import type { MapNode, RunState } from '@adventure/schema';

/**
 * Single-fight odds: each leader's fresh starter, at full HP, against the act-1 fights a
 * run actually meets. The run report (adventure_sim.test.ts) folds routing, rewards and
 * carried HP into one clear rate; this isolates the fight itself, so "runs die in act 1"
 * can be split into "the fights are lost" vs "the fights are won but cost too much".
 *
 * OPT-IN ONLY (RUN_BALANCE=1), planning AI:
 *
 *   RUN_BALANCE=1 ADV_LEADERS=phantom npx vitest run src/adventure/fight_odds.test.ts \
 *     --reporter=verbose --disable-console-intercept
 *
 * Knobs: ADV_LEADERS, FIGHT_SEEDS (fights per cell, default 8).
 */
const RUN_BALANCE = process.env.RUN_BALANCE === '1';
const SEEDS = Number(process.env.FIGHT_SEEDS ?? 8);
const ONLY = (process.env.ADV_LEADERS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const base = buildRegistry(starterCards, starterLeaders);

const CELLS: { label: string; kind: MapNode['kind']; layer: number }[] = [
  { label: 'combat L0', kind: 'combat', layer: 0 },
  { label: 'combat L2', kind: 'combat', layer: 2 },
  { label: 'combat L4', kind: 'combat', layer: 4 },
  { label: 'elite L2', kind: 'elite', layer: 2 },
];

/** A copy of `run` whose first node is rewritten into the cell's fight. */
const at = (run: RunState, kind: MapNode['kind'], layer: number): { run: RunState; nodeId: string } => {
  const next = structuredClone(run);
  const nodeId = Object.keys(next.map.nodes)[0]!;
  const node = next.map.nodes[nodeId]!;
  node.kind = kind;
  node.layer = layer;
  delete node.twistId;
  return { run: next, nodeId };
};

describe.skipIf(!RUN_BALANCE)('adventure fight odds', () => {
  it('prints win rate and HP cost per act-1 fight', { timeout: 36_000_000 }, () => {
    const leaders = (ONLY.length ? starterLeaders.filter((l) => ONLY.includes(l.id)) : starterLeaders).map((l) => l.id);
    console.log(`\n=== Adventure fight odds · ${SEEDS} fights/cell · full HP · PLANNING ===`);
    console.log('Leader'.padEnd(12) + CELLS.map((c) => c.label.padStart(22)).join(''));
    for (const leaderId of leaders) {
      const cells = CELLS.map(({ kind, layer }) => {
        let won = 0, lost = 0, turns = 0;
        for (let s = 0; s < SEEDS; s++) {
          const fresh = startRun(leaderId, 5000 + s, base);
          const { run, nodeId } = at(fresh, kind, layer);
          const { registry, initial } = buildFight(base, run, nodeId, 9000 + 31 * s);
          const r = playOutGame(registry, initial, true);
          turns += r.turns;
          if (r.winner === 0) { won++; lost += run.hp - r.finalHp[0]; }
        }
        return `${Math.round((100 * won) / SEEDS)}% -${won ? (lost / won).toFixed(1) : '—'}hp ${(turns / SEEDS).toFixed(0)}t`;
      });
      console.log(leaderId.padEnd(12) + cells.map((c) => c.padStart(22)).join(''));
    }
  });
});
