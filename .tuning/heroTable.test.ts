import { it } from 'vitest';
import { heroTable, correlate } from './heroField';

it('hero power disparity table', () => {
  const rows = heroTable();
  const f = (n: number, w = 6) => n.toFixed(2).padStart(w);
  console.log('\n| Leader      | Deck         | Power              | Cost |  Value | Val/Cost |  WR |');
  console.log('|-------------|--------------|--------------------|------|--------|----------|-----|');
  for (const r of rows) {
    console.log(
      `| ${r.leader.padEnd(11)} | ${r.deck.padEnd(12)} | ${r.power.padEnd(18)} |` +
      ` ${f(r.cost, 4)} | ${f(r.value)} | ${f(r.ratio, 8)} | ${String(r.winRate).padStart(3)} |`,
    );
  }
  console.log(`\ncorrelation(val/cost, win rate) = ${correlate(rows, 'ratio').toFixed(3)}`);
  console.log(`correlation(raw value, win rate) = ${correlate(rows, 'value').toFixed(3)}`);
}, 120_000);
