import { it } from 'vitest';
import { starterCards, starterDecks } from '@cards/data/starter';

const ELS = ['fire', 'water', 'nature', 'earth'] as const;
const real = (starterCards as any[]).filter((c) => {
  const t: string[] = c.tags ?? []; return !t.includes('token') && !t.includes('signature');
});
const KW = ['lethal','overshot','pierce','sniper','branchShot','splashDamage','strikeThrough',
  'doubleStrike','airborne','battleReady','taunt','trueShield','immunity','spike','tough',
  'zombified','brittle','growth','bloodlust','shield','doubleTeam','polish','kamikaze',
  'metamorphosis','aquatic','sacrifice','smelt','healer','producer','debuff','mover','expel'];

const kwOf = (c: any): string[] => {
  const out = new Set<string>();
  for (const k of Object.keys(c.keywords ?? {})) out.add(k);
  for (const k of Object.keys(c.grants?.keywords ?? {})) out.add(k);
  for (const k of Object.keys(c.grantKeywords ?? {})) out.add(k);
  return [...out];
};

it('gaps round 2', () => {
  console.log('\n=== KEYWORD SUPPORT (cards carrying it; elements that can access it) ===');
  const rows = KW.map((k) => {
    const cs = real.filter((c) => kwOf(c).includes(k));
    const els = ELS.filter((e) => cs.some((c) => c.element === e));
    return { k, n: cs.length, els };
  }).sort((a, b) => a.n - b.n);
  for (const r of rows) {
    const flag = r.n === 0 ? '  *** UNUSED' : r.n <= 2 ? '  ** thin' : r.els.length === 1 ? '  * single-element' : '';
    console.log(`  ${r.k.padEnd(14)} ${String(r.n).padStart(2)} cards  [${r.els.join(',') || '-'}]${flag}`);
  }

  console.log('\n=== ORPHANS: real cards in NO starter deck ===');
  const inDeck = new Set<string>();
  for (const d of starterDecks as any[]) for (const e of d.cards) inDeck.add(e.cardId);
  const orphans = real.filter((c) => !inDeck.has(c.id));
  console.log(`  ${orphans.length} of ${real.length} cards are unplayed:`);
  for (const e of ELS) {
    const os = orphans.filter((c) => c.element === e);
    if (os.length) console.log(`  ${e}: ${os.map((c) => c.id).join(', ')}`);
  }

  console.log('\n=== FOUNDATIONS / ENVIRONMENTS per element ===');
  for (const e of ELS) {
    const f = real.filter((c) => c.element === e && c.type === 'foundation');
    const v = real.filter((c) => c.element === e && c.type === 'environment');
    console.log(`  ${e.padEnd(7)} foundations ${String(f.length).padStart(2)} (${f.filter((c) => inDeck.has(c.id)).length} played)   environments ${String(v.length).padStart(2)} (${v.filter((c) => inDeck.has(c.id)).length} played)`);
  }
}, 120_000);
