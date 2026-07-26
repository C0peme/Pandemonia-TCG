import { describe, it } from 'vitest';
import { starterCards } from '@cards/data/starter';
import { recommendedEnergy, cardBudgetValue } from '@cards/budget';

// Use the parsed-but-pre-expanded cards for lookup to avoid circular summon references
const lookup = (id: string) => starterCards.find((c: any) => c.id === id) as any;

describe('cost diff', () => {
  it('prints diffs', () => {
    const rows: any[] = [];
    for (const card of starterCards as any[]) {
      let rec = 0, budget = 0;
      try {
        budget = +cardBudgetValue(card, lookup).toFixed(2);
        rec = recommendedEnergy(card, lookup);
      } catch { rec = -99; }
      const cur = card.cost?.energy ?? 0;
      const pips = (card.cost?.elements ?? []).reduce((s: number, e: any) => s + e.amount, 0);
      rows.push({ id: card.id, type: card.type, cur, rec, pips, budget, diff: rec - cur });
    }
    rows.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
    const changed = rows.filter(r => r.diff !== 0);
    console.log('\nCHANGED (' + changed.length + ' of ' + rows.length + '):\n');
    for (const r of changed) {
      const flag = r.diff > 3 || r.diff < -3 ? ' !!!' : r.diff >= 2 || r.diff <= -2 ? ' !!' : '';
      console.log(r.id.padEnd(32) + r.type.padEnd(12) + 'cur:'+r.cur+'\trec:'+r.rec+'\tpips:'+r.pips+'\tbudget:'+r.budget+'\tdiff:'+(r.diff>0?'+':'')+r.diff+flag);
    }
    console.log('\nUNCHANGED (' + (rows.length - changed.length) + '):\n');
    for (const r of rows.filter(r => r.diff === 0)) {
      console.log(r.id.padEnd(32) + r.type.padEnd(12) + 'cost:'+r.cur+'\tpips:'+r.pips+'\tbudget:'+r.budget);
    }
  });
});
