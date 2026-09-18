#!/usr/bin/env node
/**
 * Turn a meta report into a balance worksheet.
 *
 * `meta-combine.mjs` says WHAT the field looks like. This says WHICH KNOB to turn, by joining
 * each deck's measured field win rate to the two things a leader actually owns: the hero power
 * (recurring, unconditional, priced by `heroPowerRatio`) and the signature card (one-shot, free,
 * fires at half HP). A deck that is off the 50% line and whose leader also sits at an extreme of
 * one of those tables has an obvious lever; a deck that is off with a fairly-priced leader is a
 * DECK problem, and recosting its leader would only paper over it.
 *
 * Usage: node scripts/meta-analyze.mjs meta-report.json
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { register } from 'node:module';

const reportPath = process.argv[2] ?? 'meta-report.json';
const report = JSON.parse(readFileSync(reportPath, 'utf8'));

// The budget module is TypeScript with path aliases, so it is loaded through vitest instead of
// imported here; `npm run meta:worksheet` wires that up. When the numbers are unavailable the
// worksheet still prints the measured half, which is the half that decides anything.
let budget = null;
try { budget = JSON.parse(readFileSync(process.argv[3] ?? 'leader-budget.json', 'utf8')); } catch { /* optional */ }

const { names, leaders, field, matrix, gamesPer, cards, cardGames } = report;
const byDeck = Object.fromEntries(field.map((f) => [f.deck, f]));

// Binomial standard error on the field win rate, so a gap gets read against its noise rather
// than as a fact. Each deck plays (n-1)*gamesPer games.
const se = (pct, n) => (n ? 100 * Math.sqrt((pct / 100) * (1 - pct / 100) / n) : 0);

console.log(`\n=== Balance worksheet · ${gamesPer} games/matchup ===\n`);
console.log('deck'.padEnd(14) + 'leader'.padEnd(12) + 'field%'.padStart(7) + '±se'.padStart(6) +
  '  power'.padEnd(20) + 'ratio'.padStart(6) + '  sig'.padEnd(22) + 'sigval'.padStart(7) + '  casts/g'.padStart(8));
const rows = [...field].sort((a, b) => b.pct - a.pct);
for (const f of rows) {
  const b = budget?.[f.leader] ?? {};
  const n = f.games;
  console.log(
    f.deck.padEnd(14) + (f.leader ?? '').padEnd(12) +
    f.pct.toFixed(1).padStart(7) + se(f.pct, n).toFixed(1).padStart(6) +
    ('  ' + (b.power ?? '?')).padEnd(20) + String(b.ratio ?? '?').padStart(6) +
    ('  ' + (b.sig ?? '?')).padEnd(22) + String(b.sigValue ?? '?').padStart(7) +
    String(b.casts ?? (report.heroPowers?.[f.deck] / (cardGames?.[f.deck] || 1)).toFixed(2) ?? '?').padStart(8),
  );
}

const pcts = field.map((f) => f.pct);
console.log(`\nSpread ${(Math.max(...pcts) - Math.min(...pcts)).toFixed(1)}pp · ` +
  `sd ${Math.sqrt(pcts.reduce((s, p) => s + (p - 50) ** 2, 0) / pcts.length).toFixed(1)}pp from 50`);

// Worst matchups: the lopsided cells are where a "balanced on average" deck is actually
// unplayable, and averaging them away is how a meta stays broken at 50% field.
console.log('\n--- Most lopsided matchups (|win%-50| >= 25) ---');
const lop = [];
for (let i = 0; i < names.length; i++) {
  for (let j = i + 1; j < names.length; j++) {
    const w = matrix[i][j];
    if (w === null) continue;
    const pct = (100 * w) / gamesPer;
    if (Math.abs(pct - 50) >= 25) lop.push({ a: names[i], b: names[j], pct });
  }
}
lop.sort((x, y) => Math.abs(y.pct - 50) - Math.abs(x.pct - 50));
for (const l of lop) console.log(`  ${l.a.padEnd(14)} beats ${l.b.padEnd(14)} ${l.pct.toFixed(0).padStart(3)}%`);
if (!lop.length) console.log('  none');

// Cards that never get cast, or that lose when cast, are the recost candidates the formula
// cannot see: the formula prices what a card DOES, not whether the deck ever reaches it.
console.log('\n--- Dead weight: play rate < 25% (denominator = games observed) ---');
for (const name of names) {
  const gp = cardGames?.[name] || 0;
  if (!gp) continue;
  const dead = Object.entries(cards[name] ?? {})
    .map(([id, a]) => ({ id, play: (100 * a.gamesPlayedIn) / gp, win: a.gamesPlayedIn ? (100 * a.winsWhenPlayed) / a.gamesPlayedIn : null, n: a.gamesPlayedIn }))
    .filter((r) => r.play < 25)
    .sort((a, b) => a.play - b.play);
  if (dead.length) console.log(`  ${name}: ` + dead.map((d) => `${d.id} ${d.play.toFixed(0)}%`).join(', '));
}

// A card played often that still loses is a TRAP — it passes the play-rate screen and fails the
// only test that matters. Read against its own deck's field rate, not against 50.
console.log('\n--- Traps: played in >60% of games, win rate >=8pp below the deck itself ---');
for (const name of names) {
  const gp = cardGames?.[name] || 0;
  if (!gp) continue;
  const base = byDeck[name]?.pct ?? 50;
  const traps = Object.entries(cards[name] ?? {})
    .map(([id, a]) => ({ id, play: (100 * a.gamesPlayedIn) / gp, win: a.gamesPlayedIn ? (100 * a.winsWhenPlayed) / a.gamesPlayedIn : 0, n: a.gamesPlayedIn }))
    .filter((r) => r.play > 60 && base - r.win >= 8)
    .sort((a, b) => (a.win - base) - (b.win - base));
  if (traps.length) console.log(`  ${name} (deck ${base.toFixed(0)}%): ` + traps.map((t) => `${t.id} ${t.win.toFixed(0)}% @${t.play.toFixed(0)}% play`).join(', '));
}
