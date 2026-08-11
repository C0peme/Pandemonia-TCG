import { it } from 'vitest';
import { starterCards } from '@cards/data/starter';

// NOTE: reads RAW card data, so keyword-expanded functions are invisible to it — a unit with
// the `healer`/`producer`/`mover` KEYWORD does not match the effect regexes (registry.ts folds
// those into trigger effects only at build time). Under-counts heal/ramp/bounce accordingly.

const ELS = ['fire', 'water', 'nature', 'earth'] as const;
const real = (starterCards as any[]).filter((c) => {
  const t: string[] = c.tags ?? []; return !t.includes('token') && !t.includes('signature');
});

const json = (c: any) => JSON.stringify([c.effects, c.onPlay, c.onAttack, c.endOfTurn, c.startOfTurn, c.keywords, c.grants, c.grantKeywords]);
const has = (c: any, re: RegExp) => re.test(json(c));

const FUNCTIONS: Record<string, (c: any) => boolean> = {
  'removal(dmg)':  (c) => has(c, /"kind":"damage"/),
  'AOE':           (c) => /"target":"all-enemy"/.test(json(c)),
  'draw':          (c) => has(c, /"kind":"draw"/),
  'heal':          (c) => has(c, /"kind":"heal"/),
  'buff':          (c) => has(c, /"kind":"buff"/),
  'debuff':        (c) => has(c, /"kind":"debuff"|"debuff":/),
  'cleanse':       (c) => has(c, /"kind":"cleanse"/),
  'bounce/move':   (c) => has(c, /"kind":"expel"|"kind":"move"|"mover":|"expel":/),
  'disable(frz/slp)': (c) => has(c, /"status":"freeze"|"status":"sleep"|freeze":|sleep":/),
  'dot(brn/psn)':  (c) => has(c, /"status":"burn"|"status":"poison"|burn":|poison":/),
  'ramp(energy)':  (c) => has(c, /"kind":"energy"|"kind":"energyNext"|producer":/),
  'mill':          (c) => has(c, /"kind":"forget"|"kind":"mill"/),
  'summon':        (c) => has(c, /"kind":"summon"/),
  'protect(shld)': (c) => has(c, /shield":|trueShield":|immunity":/),
};

it('pool audit: element x function', () => {
  console.log('\n=== COUNTS BY ELEMENT x TYPE ===');
  console.log('| element | unit | spell | found | env | total |');
  console.log('|---------|------|-------|-------|-----|-------|');
  for (const e of ELS) {
    const es = real.filter((c) => c.element === e);
    const n = (t: string) => es.filter((c) => c.type === t).length;
    console.log(`| ${e.padEnd(7)} | ${String(n('unit')).padStart(4)} | ${String(n('spell')).padStart(5)} |` +
      ` ${String(n('foundation')).padStart(5)} | ${String(n('environment')).padStart(3)} | ${String(es.length).padStart(5)} |`);
  }

  console.log('\n=== FUNCTION COVERAGE (count of cards, "." = NONE) ===');
  const w = Math.max(...Object.keys(FUNCTIONS).map((k) => k.length));
  console.log(`| ${'function'.padEnd(w)} | fire | water | nature | earth |`);
  console.log(`|${'-'.repeat(w + 2)}|------|-------|--------|-------|`);
  for (const [name, fn] of Object.entries(FUNCTIONS)) {
    const cells = ELS.map((e) => real.filter((c) => c.element === e && fn(c)).length);
    console.log(`| ${name.padEnd(w)} |` + cells.map((n, i) =>
      ` ${(n === 0 ? '.' : String(n)).padStart([4, 5, 6, 5][i]!)} |`).join(''));
  }

  console.log('\n=== CURVE BY ELEMENT (printed energy+pips) ===');
  for (const e of ELS) {
    const es = real.filter((c) => c.element === e);
    const tot = (c: any) => c.cost.energy + (c.cost.elements ?? []).reduce((s: number, x: any) => s + x.amount, 0);
    const b: number[] = [0, 0, 0, 0, 0, 0];
    for (const c of es) b[Math.min(5, tot(c))]!++;
    console.log(`  ${e.padEnd(7)} 0-1:${(b[0]! + b[1]!).toString().padStart(3)}  2:${b[2]!.toString().padStart(3)}  3:${b[3]!.toString().padStart(3)}  4:${b[4]!.toString().padStart(3)}  5+:${b[5]!.toString().padStart(3)}`);
  }
}, 120_000);
