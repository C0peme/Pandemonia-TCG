#!/usr/bin/env node
/**
 * Compare two meta reports — the measurement that says whether a balance change did what it
 * was meant to do.
 *
 * Both runs must use the same META_SEED (the default, 1) and the same games-per-matchup, because
 * a shard's per-game seeds derive from its pairing index plus that base. With those held, every
 * game in the "after" run is the same deal of the same decks as in "before", so a moved win rate
 * is the CHANGE and not a different shuffle. The script refuses to diff runs that do not match on
 * both, rather than quietly reporting noise as an effect.
 *
 * A per-deck delta is still a sample: each is (n-1)*gamesPer games, so the standard error on a
 * 24-game/matchup field rate is ~2.9pp and the error on a DIFFERENCE is larger again. Paired
 * seeds remove most of that, but a move smaller than a couple of points is not a result.
 *
 * Usage: node scripts/meta-diff.mjs before.json after.json
 */
import { readFileSync } from 'node:fs';

const [beforePath, afterPath] = process.argv.slice(2);
if (!beforePath || !afterPath) {
  console.error('usage: node scripts/meta-diff.mjs before.json after.json');
  process.exit(1);
}
const A = JSON.parse(readFileSync(beforePath, 'utf8'));
const B = JSON.parse(readFileSync(afterPath, 'utf8'));

if (A.gamesPer !== B.gamesPer) {
  console.error(`refusing to diff: games/matchup differ (${A.gamesPer} vs ${B.gamesPer})`);
  process.exit(1);
}
if (A.usePlan !== B.usePlan) {
  console.error('refusing to diff: one run used the planning AI and the other did not');
  process.exit(1);
}
for (const [label, r] of [['before', A], ['after', B]]) {
  if (r.missing?.length) console.error(`WARNING: ${label} is missing ${r.missing.length} pairing(s) — deltas over those cells are meaningless`);
}

const before = Object.fromEntries(A.field.map((f) => [f.deck, f]));
const after = Object.fromEntries(B.field.map((f) => [f.deck, f]));
const decks = A.names.filter((n) => n in after);

console.log(`\n=== ${beforePath} -> ${afterPath} · ${A.gamesPer} games/matchup ===\n`);
console.log('deck'.padEnd(14) + 'leader'.padEnd(12) + 'before'.padStart(7) + 'after'.padStart(8) + 'delta'.padStart(8));
const rows = decks.map((d) => ({
  deck: d,
  leader: before[d]?.leader ?? '',
  a: before[d]?.pct ?? 0,
  b: after[d]?.pct ?? 0,
})).map((r) => ({ ...r, d: r.b - r.a }));
for (const r of [...rows].sort((x, y) => y.d - x.d)) {
  const sign = r.d > 0 ? '+' : '';
  console.log(r.deck.padEnd(14) + r.leader.padEnd(12) + r.a.toFixed(1).padStart(7) + r.b.toFixed(1).padStart(8) + (sign + r.d.toFixed(1)).padStart(8));
}

const dev = (xs) => Math.sqrt(xs.reduce((s, p) => s + (p - 50) ** 2, 0) / xs.length);
const pa = rows.map((r) => r.a);
const pb = rows.map((r) => r.b);
console.log(`\nspread   ${(Math.max(...pa) - Math.min(...pa)).toFixed(1)}pp -> ${(Math.max(...pb) - Math.min(...pb)).toFixed(1)}pp`);
console.log(`rms off 50   ${dev(pa).toFixed(2)}pp -> ${dev(pb).toFixed(2)}pp`);
console.log(`worst deck   ${Math.min(...pa).toFixed(1)} -> ${Math.min(...pb).toFixed(1)}   best deck ${Math.max(...pa).toFixed(1)} -> ${Math.max(...pb).toFixed(1)}`);

// The field average can improve while individual matchups get worse, so show the cells that
// moved most as well.
console.log('\n--- Matchup cells that moved most (>= 20pp) ---');
const moves = [];
for (let i = 0; i < A.names.length; i++) {
  for (let j = i + 1; j < A.names.length; j++) {
    const wa = A.matrix[i]?.[j];
    const wb = B.matrix[i]?.[j];
    if (wa === null || wb === null || wa === undefined || wb === undefined) continue;
    const d = (100 * (wb - wa)) / A.gamesPer;
    if (Math.abs(d) >= 20) moves.push({ a: A.names[i], b: A.names[j], from: (100 * wa) / A.gamesPer, to: (100 * wb) / A.gamesPer, d });
  }
}
moves.sort((x, y) => Math.abs(y.d) - Math.abs(x.d));
for (const m of moves) console.log(`  ${m.a.padEnd(14)} vs ${m.b.padEnd(14)} ${m.from.toFixed(0).padStart(3)}% -> ${m.to.toFixed(0).padStart(3)}%  (${m.d > 0 ? '+' : ''}${m.d.toFixed(0)})`);
if (!moves.length) console.log('  none');
