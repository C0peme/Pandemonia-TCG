import { describe, it } from 'vitest';
import { starterRegistry, starterDecks } from '@cards/data/starter';
import { starterRegistry as baseRegistry, starterDecks as baseDecks } from '@cards/data/_baseline';
import { runMeta } from '@engine/sim';

// Baseline-vs-current meta comparison, both runs in ONE process so nothing has to swap
// files in the working tree. `_baseline.ts` is the current card pool with the ORIGINAL
// authored element costs restored, so the only variable is the pip rule.
//   npx vitest run src/cards/_metacmp.test.ts --reporter=verbose --disable-console-intercept
const GAMES = Number(process.env.META_GAMES ?? 30);

function runOne(label: string, registry: any, decks: any[]) {
  const entries = decks.map((d) => ({ deck: d, name: d.name }));
  const names = entries.map((d) => d.name);
  const n = names.length;
  const short = (s: string) => s.slice(0, 6).padStart(6);
  let header = 'Deck'.padEnd(14);
  for (const name of names) header += short(name) + ' ';
  header += '  Field';
  console.log(`\n=== ${label} · ${GAMES} games/matchup ===`);
  console.log(header);
  const printRow = (i: number, matrix: number[][]): void => {
    let row = names[i]!.padEnd(14);
    let wins = 0, games = 0;
    for (let j = 0; j < n; j++) {
      if (i === j) { row += '     — '; continue; }
      row += (Math.round((matrix[i]![j]! / GAMES) * 100) + '%').padStart(6) + ' ';
      wins += matrix[i]![j]!; games += GAMES;
    }
    row += (Math.round((games ? wins / games : 0) * 100) + '%').padStart(7);
    console.log(row);
  };
  const res = runMeta(registry, entries, GAMES, 1, false, printRow);
  const standings = res.decks
    .map((name: string, i: number) => ({ name, field: res.overall[i]! }))
    .sort((a, b) => b.field - a.field);
  console.log(`\n--- ${label} standings ---`);
  for (const s of standings) console.log(s.name.padEnd(14) + (Math.round(s.field * 100) + '%').padStart(5));
  return new Map(standings.map((s) => [s.name, s.field]));
}

describe('meta comparison', () => {
  it('baseline vs formula-derived pips', { timeout: 36_000_000 }, () => {
    const before = runOne('BEFORE (original pips, elemental Producers, Cultivate)', baseRegistry, baseDecks as any[]);
    const after = runOne('IT7 (effect table repriced from field data)', starterRegistry, starterDecks as any[]);

    console.log('\n=== FIELD WIN-RATE DELTA (sorted by new standing) ===');
    console.log('Leader/Deck        before   after   delta');
    const rows = [...after.entries()]
      .map(([name, a]) => ({ name, a, b: before.get(name) ?? 0 }))
      .sort((x, y) => y.a - x.a);
    for (const r of rows) {
      const pct = (v: number) => (Math.round(v * 100) + '%').padStart(5);
      const d = Math.round((r.a - r.b) * 100);
      console.log(r.name.padEnd(18) + pct(r.b) + '   ' + pct(r.a) + '   ' + (d > 0 ? '+' : '') + d);
    }
    const spread = (m: Map<string, number>) => {
      const v = [...m.values()];
      return `${Math.round(Math.min(...v) * 100)}%–${Math.round(Math.max(...v) * 100)}%`;
    };
    console.log(`\nspread before: ${spread(before)}   after: ${spread(after)}`);
  });
});
