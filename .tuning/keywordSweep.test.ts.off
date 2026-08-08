import { describe, it } from 'vitest';
import { probeKeywordField } from '../../.tuning/keywordField';

// Marginal value of each keyword against the REAL 12-deck field, at its formula price.
// delta ~0 = correctly priced; positive = underpriced; negative = overpriced.
describe('keyword field sweep', () => {
  it('measures marginal value', { timeout: 3000000 }, () => {
    const probes: [string, any][] = [
      ['NO-OP', {}],
      ['taunt', { taunt: true }],
      ['sniper', { sniper: true }],
      ['airborne', { airborne: true }],
      ['overshot', { overshot: true }],
      ['doubleStrike', { doubleStrike: true }],
      ['strikeThrough', { strikeThrough: true }],
      ['branchShot', { branchShot: true }],
      ['splashDamage', { splashDamage: true }],
      ['lethal', { lethal: true }],
      ['immunity', { immunity: true }],
      ['trueShield', { trueShield: true }],
      ['tough 1', { tough: 1 }],
      ['spike 1', { spike: 1 }],
      ['shield 1', { shield: 1 }],
      ['zombified', { zombified: true }],
      ['battleReady', { battleReady: true }],
      ['doubleTeam', { doubleTeam: true }],
      ['undershot', { undershot: true }],
      ['growth +1/+1', { growth: { attack: 1, hp: 1 } }],
      ['bloodlust +1/+1', { bloodlust: { buff: { attack: 1, hp: 1 } } }],
    ];
    console.log('KWF_START');
    console.log('keyword            control  variant   delta   read');
    for (const [label, kw] of probes) {
      const r = probeKeywordField(label, kw, 'Midrange', 24);
      const d = r.delta * 100;
      const read = d >= 6 ? 'UNDERPRICED' : d <= -6 ? 'OVERPRICED' : '';
      console.log(`  ${label.padEnd(17)} ${(r.control*100).toFixed(0).padStart(4)}%  ${(r.variant*100).toFixed(0).padStart(5)}%  ${(d>=0?'+':'')+d.toFixed(1).padStart(5)}   ${read}`);
    }
    console.log('KWF_END');
  });
});
