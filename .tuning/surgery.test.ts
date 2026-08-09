import { describe, it } from 'vitest';
import { deckSurgery } from '../../.tuning/deckSurgery';
describe('deck surgery', () => {
  it('can deck edits rescue the spell-heavy decks?', { timeout: 3000000 }, () => {
    console.log('SURG_START');
    for (const d of ['Deck Out', 'Control', 'DoT', 'Guardian', 'Lane Control']) {
      const r = deckSurgery(d, 8, 30);
      console.log(`  ${r.deck.padEnd(14)} swapped ${r.swapped}  ${(r.before*100).toFixed(0)}% -> ${(r.after*100).toFixed(0)}%  delta ${(r.delta*100>=0?'+':'')}${(r.delta*100).toFixed(1)}`);
      for (const s of r.swaps) console.log(`      ${s}`);
    }
    console.log('SURG_END');
  });
});
