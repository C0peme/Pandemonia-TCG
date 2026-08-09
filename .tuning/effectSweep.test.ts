import { describe, it } from 'vitest';
import { probeEffectField } from '../../.tuning/effectField';
import type { Effect } from '@cards/schema';

// Baseline: swapping the vanilla unit for an identically-priced vanilla unit must read ~0.
// Then each effect, at the price effectCostBase currently assigns it.
describe('effect price sweep', () => {
  it('measures marginal value of each effect', { timeout: 3000000 }, () => {
    const probes: [string, Effect[]][] = [
      ['damage 2 enemy',    [{ kind: 'damage', amount: 2, target: 'enemy' }]],
      ['damage 4 enemy',    [{ kind: 'damage', amount: 4, target: 'enemy' }]],
      ['damage 3 leader',   [{ kind: 'damage', amount: 3, target: 'leader' }]],
      ['damage 2 ALL-enemy',[{ kind: 'damage', amount: 2, target: 'all-enemy' }]],
      ['heal 3 ally',       [{ kind: 'heal', amount: 3, target: 'ally' }]],
      ['draw 2',            [{ kind: 'draw', amount: 2 }]],
      ['burn 2 enemy',      [{ kind: 'applyStatus', amount: 2, target: 'enemy', status: 'burn' }]],
      ['freeze any',        [{ kind: 'applyStatus', target: 'any', status: 'freeze' }]],
      ['sleep any',         [{ kind: 'applyStatus', amount: 2, target: 'any', status: 'sleep' }]],
      ['taunt any',         [{ kind: 'applyStatus', target: 'any', status: 'taunt' }]],
      ['shield ally',       [{ kind: 'applyStatus', amount: 1, target: 'ally', status: 'shield' }]],
      ['debuff -2/-2',      [{ kind: 'debuff', target: 'enemy', stat: { attack: 2, hp: 2 } }]],
      ['expel enemy',       [{ kind: 'expel', target: 'enemy' }]],
      ['move enemy',        [{ kind: 'move', target: 'enemy' }]],
      ['forget 2',          [{ kind: 'forget', amount: 2, target: 'enemy' }]],
      ['cleanse ally',      [{ kind: 'cleanse', target: 'ally' }]],
      ['buff +2/+2 ally',   [{ kind: 'buff', target: 'ally', stat: { attack: 2, hp: 2 } }]],
    ];
    console.log('FX_START');
    console.log('effect                cost     control  variant   delta   read');
    for (const [label, fx] of probes) {
      const r = probeEffectField(label, fx);
      const d = r.delta * 100;
      const read = d >= 6 ? 'UNDERPRICED' : d <= -6 ? 'OVERPRICED' : '';
      console.log(`  ${label.padEnd(20)} ${r.cost.padEnd(7)} ${(r.control*100).toFixed(0).padStart(5)}%  ${(r.variant*100).toFixed(0).padStart(5)}%  ${(d>=0?'+':'')+d.toFixed(1).padStart(5)}   ${read}`);
    }
    console.log('FX_END');
  });
});
