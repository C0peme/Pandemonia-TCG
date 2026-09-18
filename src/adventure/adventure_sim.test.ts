import { describe, it } from 'vitest';
import { buildRegistry } from '@cards/registry';
import { starterCards, starterLeaders } from '@cards/data/starter';
import { runBatchForLeader, type RunBatchResult } from '@adventure/runSim';

/**
 * Headless Adventure-run report — the run-level counterpart to `cards/meta_sim.test.ts`.
 *
 * OPT-IN ONLY. This is a manual balance harness, not a unit test: under the planning AI
 * (the shipped policy, and the only one balance work may use) a run is ~20 fights at
 * ~15 s each, so one run is minutes and a full 13-leader sweep is HOURS. Run it
 * deliberately:
 *
 *   RUN_BALANCE=1 npx vitest run src/adventure/adventure_sim.test.ts \
 *     --reporter=verbose --disable-console-intercept
 *
 * Knobs: ADV_RUNS (runs per leader), ADV_ACTS (acts before a run counts as cleared),
 * ADV_LEADERS (comma-separated leader ids, default all 13), USE_PLAN=0 for the fast
 * greedy AI — which measures a DIFFERENT game and must never be used for balance.
 */
const RUNS = Number(process.env.ADV_RUNS ?? 10);
const ACTS = Number(process.env.ADV_ACTS ?? 3);
const USE_PLAN = process.env.USE_PLAN !== '0';
const RUN_BALANCE = process.env.RUN_BALANCE === '1';
const ONLY = (process.env.ADV_LEADERS ?? '').split(',').map((s) => s.trim()).filter(Boolean);

const base = buildRegistry(starterCards, starterLeaders);

const pad = (s: string | number, n: number): string => String(s).padStart(n);
const pct = (n: number, d: number): string => (d ? `${((100 * n) / d).toFixed(0)}%` : '—');

describe.skipIf(!RUN_BALANCE)('adventure run sim', () => {
  it('prints a per-leader run report', { timeout: 36_000_000 }, () => {
    const leaders = (ONLY.length ? starterLeaders.filter((l) => ONLY.includes(l.id)) : starterLeaders).map((l) => l.id);
    console.log(
      `\n=== Adventure Runs · ${RUNS} runs/leader · ${ACTS} acts` + (USE_PLAN ? ' · PLANNING' : ' · GREEDY') + ' ===',
    );
    console.log(
      'Leader'.padEnd(12) +
        ['Clear', 'Act', 'Fights', 'Won', 'HP/win', 'Earned', 'Spent', 'Left', 'Deck', 'Relics']
          .map((h) => pad(h, 8))
          .join('') +
        '  Deaths',
    );
    // Stream a row per leader as it finishes, so an interrupted sweep still yields rows.
    const rows: RunBatchResult[] = [];
    for (const leaderId of leaders) {
      const r = runBatchForLeader(base, leaderId, RUNS, 1, { maxActs: ACTS, usePlan: USE_PLAN });
      rows.push(r);
      const deaths = Object.entries(r.deathsByKind)
        .sort((a, b) => b[1] - a[1])
        .map(([k, n]) => `${k} ${n}`)
        .join(', ');
      console.log(
        leaderId.padEnd(12) +
          [
            pct(r.cleared, r.runs),
            r.avgActReached.toFixed(1),
            r.avgFights.toFixed(1),
            r.avgFightsWon.toFixed(1),
            r.avgHpLostPerWin.toFixed(1),
            r.avgCoinsEarned.toFixed(0),
            r.avgCoinsSpent.toFixed(0),
            r.avgCoinsLeft.toFixed(0),
            r.avgDeckSize.toFixed(0),
            r.avgRelics.toFixed(1),
          ]
            .map((v) => pad(v, 8))
            .join('') +
          '  ' +
          (deaths || '—'),
      );
    }

    // Field summary: the numbers a balance pass actually acts on.
    const runs = rows.reduce((s, r) => s + r.runs, 0);
    const cleared = rows.reduce((s, r) => s + r.cleared, 0);
    const stalled = rows.reduce((s, r) => s + r.stalled, 0);
    const byAct: Record<string, number> = {};
    for (const r of rows) for (const [act, n] of Object.entries(r.deathsByAct)) byAct[act] = (byAct[act] ?? 0) + n;
    console.log(`\nField: ${cleared}/${runs} cleared (${pct(cleared, runs)}), deaths by act: ` +
      Object.entries(byAct).sort().map(([a, n]) => `act ${a}: ${n}`).join(', '));
    if (stalled > 0) console.log(`WARNING: ${stalled} run(s) stalled — the policy stopped making progress.`);
  });
});
