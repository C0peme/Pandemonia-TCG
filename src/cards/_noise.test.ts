import { it } from 'vitest';
import { starterRegistry, starterDecks } from '@cards/data/starter';
import { runMeta } from '@engine/sim';
import type { Deck } from '@cards/schema';

/**
 * PHASE B — measure the REAL noise band.
 *
 * Control read 36% in a meta and 43.8% in a runField under identical conditions. Games within
 * a matchup are correlated (same two decks, similar lines), so effective sample size is well
 * below nominal and the binomial SE understates the truth. Tuning at lower precision than the
 * effect size is how three iterations in a row produced null results.
 *
 * Method: run the SAME 13-deck planning meta at three different seed bases and report each
 * deck's spread. The spread across seeds IS the noise band — no theory required.
 */
const stamp = () => new Date().toTimeString().slice(0, 8);

// OPT-IN ONLY. This is a manual balance harness, not a unit test: it is minutes-to-HOURS long
// under the planning AI (the shipped policy, now the sim default). Leaving it in the default
// suite turned `npm test` into a ~9.5h job. Run it deliberately:
//   RUN_BALANCE=1 npx vitest run <this file> --reporter=verbose --disable-console-intercept
const RUN_BALANCE = process.env.RUN_BALANCE === '1';

it.skipIf(!RUN_BALANCE)('noise band: same config, three seeds', { timeout: 6 * 3_600_000 }, () => {
  const decks = (starterDecks as any[]).map((d) => ({ deck: d as Deck, name: d.name }));
  const names = decks.map((d) => d.name);
  const SEEDS = [1, 5000, 9000];
  const runs: number[][] = [];

  for (const seed of SEEDS) {
    console.log(`\n=== seed ${seed} · 12 games/matchup · PLANNING · start ${stamp()} ===`);
    const res = runMeta(starterRegistry, decks, 12, seed, true, (i, matrix) => {
      let wins = 0;
      for (let j = 0; j < names.length; j++) if (i !== j) wins += matrix[i]![j]!;
      console.log(`  ${names[i]!.padEnd(14)} ${Math.round((wins / ((names.length - 1) * 12)) * 100)}%   [${stamp()}]`);
    });
    runs.push(res.overall.map((v) => Math.round(v * 100)));
  }

  console.log('\n=== NOISE BAND (same config, three seeds) ===');
  console.log('| deck           | s1 | s2 | s3 | mean | spread |');
  console.log('|----------------|----|----|----|------|--------|');
  const spreads: number[] = [];
  names.forEach((name, i) => {
    const v = runs.map((r) => r[i]!);
    const mean = v.reduce((a, b) => a + b, 0) / v.length;
    const spread = Math.max(...v) - Math.min(...v);
    spreads.push(spread);
    console.log(`| ${name.padEnd(14) } |${String(v[0]).padStart(3)} |${String(v[1]).padStart(3)} |` +
      `${String(v[2]).padStart(3)} | ${mean.toFixed(1).padStart(4)} | ${String(spread).padStart(6)} |`);
  });
  const mean = spreads.reduce((a, b) => a + b, 0) / spreads.length;
  console.log(`\nmean spread ${mean.toFixed(1)}pp · worst ${Math.max(...spreads)}pp`);
  console.log(`=> treat any change smaller than ~${Math.ceil(mean)}pp as unmeasurable at 12 games/matchup.`);
  console.log('\n########## NOISE SUITE COMPLETE ##########');
});
