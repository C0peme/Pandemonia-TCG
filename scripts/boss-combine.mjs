#!/usr/bin/env node
/**
 * Merge the per-(kind, boss) JSON rows written by `src/adventure/boss_balance.test.ts`
 * into one report. `win` is always the PLAYER's win rate — low means a hard boss.
 *
 * Besides the per-kind tables it prints, when both are present, the seat table
 * (bare vs bare-bossfirst: how much going first is worth against each archetype) and a
 * per-matchup matrix, plus a noise check: the spread a perfectly balanced roster would
 * still show at this sample size, so a measured spread can be read against it.
 *
 * Usage: node scripts/boss-combine.mjs <dir> [--json out.json]
 */
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';

const dir = process.argv[2] ?? 'out';
const jsonFlag = process.argv.indexOf('--json');
const jsonOut = jsonFlag > 0 ? process.argv[jsonFlag + 1] : null;

// Artifact downloads can nest the files a level down (upload-artifact roots at the
// common ancestor of its paths), so walk the tree rather than reading one directory.
const walk = (d) => readdirSync(d).flatMap((f) => {
  const p = join(d, f);
  return statSync(p).isDirectory() ? walk(p) : [p];
});
const rows = walk(dir)
  .filter((p) => basename(p).endsWith('.json'))
  .map((p) => JSON.parse(readFileSync(p, 'utf8')))
  .filter((r) => r && r.kind && r.id);
if (rows.length === 0) {
  console.error(`no boss rows in ${dir}`);
  process.exit(1);
}

const byKind = {};
for (const r of rows) (byKind[r.kind] ??= {})[r.id] = r;
const pct = (x) => `${x.toFixed(1).padStart(5)}%`;
const ci = (p, n) => 196 * Math.sqrt((p / 100) * (1 - p / 100) / n);

// Expected max-min range of k independent draws from N(0, sd), by simulation, so the
// noise floor is honest about how wide pure chance spreads 13 bosses.
const noiseRange = (k, sd) => {
  let s = 0;
  const T = 4000;
  for (let t = 0; t < T; t++) {
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < k; i++) {
      const u = 1 - Math.random(), v = Math.random();
      const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
      lo = Math.min(lo, z); hi = Math.max(hi, z);
    }
    s += (hi - lo) * sd;
  }
  return s / T;
};

const summary = {};
for (const kind of ['full', 'bare', 'bare-bossfirst']) {
  const list = Object.values(byKind[kind] ?? {});
  if (!list.length) continue;
  list.sort((a, b) => a.win - b.win);
  console.log(`\n=== ${kind} — player win rate (low = hard boss) ===`);
  console.log(`  ${'boss'.padEnd(28)}   win     ±95%    n  stalls  turns`);
  for (const r of list) {
    console.log(`  ${r.id.padEnd(28)} ${pct(r.win)}  ±${ci(r.win, r.n).toFixed(1).padStart(4)}  ${String(r.n).padStart(4)}  ${String(r.stalls).padStart(5)}  ${r.avgTurns.toFixed(1).padStart(5)}`);
  }
  const wins = list.map((r) => r.win);
  const mean = wins.reduce((s, w) => s + w, 0) / wins.length;
  const spread = Math.max(...wins) - Math.min(...wins);
  const n = Math.round(list.reduce((s, r) => s + r.n, 0) / list.length);
  const sd = 100 * Math.sqrt((mean / 100) * (1 - mean / 100) / n);
  const floor = noiseRange(list.length, sd);
  console.log(`  mean ${mean.toFixed(1)}%  spread ${spread.toFixed(1)}pp  (a perfectly equal roster would still show ~${floor.toFixed(1)}pp at n=${n})`);
  summary[kind] = { mean, spread, noiseFloor: floor, n };
}

const bare = byKind['bare'], swap = byKind['bare-bossfirst'];
if (bare && swap) {
  console.log('\n=== Seat order (bare archetype) — player win% when the player vs the boss goes first ===');
  console.log(`  ${'boss'.padEnd(28)}  player1st  boss1st  first-move worth  seat-avg`);
  const ids = Object.keys(bare).filter((id) => swap[id]).sort((a, b) => (bare[a].win + swap[a].win) - (bare[b].win + swap[b].win));
  for (const id of ids) {
    const a = bare[id].win, b = swap[id].win;
    console.log(`  ${id.padEnd(28)}  ${pct(a)}   ${pct(b)}       ${((a - b) / 2).toFixed(1).padStart(6)}pp     ${pct((a + b) / 2)}`);
  }
  const avgEdge = ids.reduce((s, id) => s + (bare[id].win - swap[id].win) / 2, 0) / ids.length;
  console.log(`  mean first-move worth: ${avgEdge.toFixed(1)}pp of win rate (half the player1st-boss1st gap)`);
}

const matrixKind = bare ? 'bare' : 'full';
const mk = byKind[matrixKind];
if (mk) {
  const bossIds = Object.keys(mk).sort();
  const leaders = Object.keys(mk[bossIds[0]].vs).sort();
  console.log(`\n=== Per-matchup player win% (${matrixKind}) — rows: player leader, cols: boss ===`);
  console.log('  ' + ''.padEnd(12) + bossIds.map((b) => b.slice(0, 7).padStart(8)).join(''));
  for (const l of leaders) {
    console.log('  ' + l.padEnd(12) + bossIds.map((b) => {
      const c = mk[b].vs[l];
      return (c && c.n ? String(Math.round((100 * c.w) / c.n)) : '-').padStart(8);
    }).join(''));
  }
}

if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ summary, rows }, null, 2));
