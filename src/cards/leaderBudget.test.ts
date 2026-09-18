import { describe, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { starterCards, starterLeaders, starterDecks } from '@cards/data/starter';
import { cardBudgetValue, heroPowerValue, heroPowerCost, heroPowerRatio } from '@cards/budget';

/**
 * Dumps the per-leader half of the balance worksheet (`scripts/meta-analyze.mjs` joins it to the
 * measured field). A leader owns exactly two pieces of power, and neither is priced by the card
 * cost formula the rest of the pool is converged to:
 *
 *   - the HERO POWER, recurring and unconditional — `heroPowerRatio` is value per point of cost;
 *   - the SIGNATURE, a free card delivered once the leader drops to half HP, whose printed cost
 *     is 0 by design, so nothing constrains how much it is worth.
 *
 * Both are hand-authored, so the spread between leaders is whatever it happened to be. Writing
 * them next to each other is what makes that spread visible.
 *
 * Emits leader-budget.json; harmless and instant, so it is not behind RUN_BALANCE.
 */
const lookup = (id: string) => starterCards.find((c) => c.id === id) as never;

describe('leader budget', () => {
  it('writes the per-leader worksheet inputs', () => {
    const deckFor: Record<string, string> = {};
    for (const d of starterDecks) deckFor[d.leaderId] = d.name;

    const out: Record<string, unknown> = {};
    for (const l of starterLeaders) {
      const sig = starterCards.find((c) => c.id === l.signatureCardId);
      const caps = l.elementCaps as Record<string, number>;
      out[l.id] = {
        deck: deckFor[l.id] ?? '?',
        power: l.heroPower?.name ?? '-',
        value: +heroPowerValue(l, lookup).toFixed(2),
        cost: +heroPowerCost(l).toFixed(2),
        ratio: +heroPowerRatio(l, lookup).toFixed(2),
        sig: sig?.name ?? l.signatureCardId,
        sigId: l.signatureCardId,
        sigValue: sig ? +cardBudgetValue(sig, lookup).toFixed(2) : null,
        caps: `f${caps.fire}/w${caps.water}/n${caps.nature}/e${caps.earth}`,
      };
    }
    writeFileSync('leader-budget.json', JSON.stringify(out, null, 1));

    const rows = Object.entries(out).map(([id, v]) => ({ id, ...(v as Record<string, never>) }));
    rows.sort((a, b) => Number(b.ratio) - Number(a.ratio));
    console.log('\nleader'.padEnd(13) + 'deck'.padEnd(13) + 'power'.padEnd(20) + 'val  cost ratio   sig'.padEnd(30) + 'sigval');
    for (const r of rows) {
      console.log(String(r.id).padEnd(13) + String(r.deck).padEnd(13) + String(r.power).padEnd(20) +
        String(r.value).padStart(4) + String(r.cost).padStart(6) + String(r.ratio).padStart(6) + '   ' +
        String(r.sig).padEnd(27) + String(r.sigValue).padStart(6));
    }
  });
});
