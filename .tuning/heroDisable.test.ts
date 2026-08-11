import { it } from 'vitest';
import { starterLeaders } from '@cards/data/starter';
import { probeHeroDisable, type HeroDisableRow } from './heroDisable';

it('hero power contribution (disable probe)', () => {
  const rows: HeroDisableRow[] = [];
  console.log('\n| Leader      | Deck         | Power              | base | off  | delta | acts/g |');
  console.log('|-------------|--------------|--------------------|------|------|-------|--------|');
  for (const l of starterLeaders as any[]) {
    const r = probeHeroDisable(l.id);
    rows.push(r);
    console.log(
      `| ${r.leader.padEnd(11)} | ${r.deck.padEnd(12)} | ${r.power.padEnd(18)} |` +
      ` ${r.control.toFixed(0).padStart(4)} | ${r.disabled.toFixed(0).padStart(4)} |` +
      ` ${r.delta >= 0 ? '+' : ''}${r.delta.toFixed(1).padStart(4)} | ${r.actsPerGame.toFixed(2).padStart(6)} |`,
    );
  }
  console.log(`\ngames per row: ${(rows[0]?.games ?? 0) * 2}`);
  const sorted = [...rows].sort((a, b) => a.delta - b.delta);
  console.log('\nBiggest losses when disabled (= most load-bearing powers):');
  for (const r of sorted.slice(0, 5)) console.log(`  ${r.power.padEnd(18)} ${r.delta.toFixed(1)}`);
}, 3_600_000);
