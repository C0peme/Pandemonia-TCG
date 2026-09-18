#!/usr/bin/env node
/**
 * Merge the JSON files written by `src/cards/meta_shard.test.ts` into one meta report.
 *
 * Every shard computes a disjoint set of pairings from the same fixed pairing order, with
 * per-game seeds derived from the pairing index, so merging is a plain sum — there is no
 * overlap to de-duplicate and no order dependence to correct for. A missing pairing means a
 * shard did not finish; it is reported rather than silently averaged over, because a matrix
 * with holes in it is not a meta.
 *
 * Usage: node scripts/meta-combine.mjs <dir-of-shard-json> [--json out.json]
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] ?? 'meta-out';
const jsonFlag = process.argv.indexOf('--json');
const jsonOut = jsonFlag > 0 ? process.argv[jsonFlag + 1] : null;

const files = readdirSync(dir).filter((f) => f.startsWith('meta-shard-') && f.endsWith('.json'));
if (files.length === 0) {
  console.error(`no shard files in ${dir}`);
  process.exit(1);
}
const shards = files.map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));
shards.sort((a, b) => a.shard - b.shard);

const { decks: names, leaders, games: gamesPer, usePlan } = shards[0];
const n = names.length;
const matrix = Array.from({ length: n }, () => Array(n).fill(null));
const cards = {};
const deckGames = {};
const deckWins = {};
const heroPowers = {};
const turns = {};
// The denominator for the per-card aggregates: games in which this deck's plays were actually
// observed. Current shards credit BOTH sides of every game and report it as `cardGames`, so it
// is just every game the deck played. Shard files written before that change credited only the
// LOWER-INDEXED deck of each pairing, so a deck was observed in just its j>i pairings — deck 0
// in all 12, the last deck in none. Dividing those by `deckGames` deflated every play rate by a
// factor that depended purely on the deck's position in the list and reported the last deck's
// whole list as never played, so for those files the denominator is derived from the pairs
// instead. Either way it is the honest one, and old artifacts need no re-run.
const cardGames = {};
const haveCardGames = shards.some((s) => s.cardGames);
for (const name of names) {
  cards[name] = {};
  deckGames[name] = 0;
  deckWins[name] = 0;
  heroPowers[name] = 0;
  turns[name] = 0;
  cardGames[name] = 0;
}

let elapsed = 0;
for (const s of shards) {
  elapsed = Math.max(elapsed, s.elapsedSec ?? 0);
  for (const { i, j, iWins, games } of s.pairs) {
    matrix[i][j] = iWins;
    matrix[j][i] = games - iWins; // sides alternate within a pairing, so the pair is symmetric
    // Pre-`cardGames` shards: deck i is the hero in this pairing, deck j contributes nothing.
    if (!haveCardGames) cardGames[names[i]] += games;
  }
  for (const [name, agg] of Object.entries(s.cards)) {
    for (const [cardId, a] of Object.entries(agg)) {
      const t = (cards[name][cardId] ??= { inDeck: a.inDeck, gamesPlayedIn: 0, totalCopies: 0, winsWhenPlayed: 0, attackOut: 0 });
      t.inDeck = a.inDeck || t.inDeck;
      t.gamesPlayedIn += a.gamesPlayedIn;
      t.totalCopies += a.totalCopies;
      t.winsWhenPlayed += a.winsWhenPlayed;
      t.attackOut += a.attackOut;
    }
  }
  for (const name of names) {
    deckGames[name] += s.deckGames?.[name] ?? 0;
    deckWins[name] += s.deckWins?.[name] ?? 0;
    heroPowers[name] += s.heroPowers?.[name] ?? 0;
    turns[name] += s.turns?.[name] ?? 0;
    if (haveCardGames) cardGames[name] += s.cardGames?.[name] ?? 0;
  }
}

const missing = [];
for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (matrix[i][j] === null) missing.push(`${names[i]} vs ${names[j]}`);

const short = (s) => s.slice(0, 6).padStart(6);
console.log(`\n=== Meta Matrix · ${gamesPer} games/matchup · ${shards.length} shards${usePlan ? ' · PLANNING' : ' · GREEDY'} ===`);
if (missing.length) console.log(`INCOMPLETE: ${missing.length} pairing(s) missing — ${missing.join('; ')}`);
let header = 'Deck'.padEnd(14);
for (const name of names) header += short(name) + ' ';
header += '  Field';
console.log(header);

const field = [];
for (let i = 0; i < n; i++) {
  let row = names[i].padEnd(14);
  let wins = 0;
  let played = 0;
  for (let j = 0; j < n; j++) {
    if (i === j) { row += '     — '; continue; }
    const w = matrix[i][j];
    if (w === null) { row += '     ? '; continue; }
    wins += w;
    played += gamesPer;
    row += String(((100 * w) / gamesPer).toFixed(0)).padStart(6) + ' ';
  }
  const pct = played ? (100 * wins) / played : 0;
  field.push({ deck: names[i], leader: leaders?.[i], pct, games: played });
  console.log(row + '  ' + pct.toFixed(1).padStart(5));
}

console.log('\n--- Field win rate, sorted ---');
for (const f of [...field].sort((a, b) => b.pct - a.pct)) {
  console.log(`${f.deck.padEnd(14)} ${f.leader?.padEnd(12) ?? ''} ${f.pct.toFixed(1).padStart(5)}%  (${f.games} games)`);
}
const pcts = field.map((f) => f.pct);
const spread = Math.max(...pcts) - Math.min(...pcts);
console.log(`\nSpread: ${spread.toFixed(1)}pp   (min ${Math.min(...pcts).toFixed(1)}, max ${Math.max(...pcts).toFixed(1)})`);

console.log('\n--- Per-card: play rate and win rate when played ---');
console.log('Deck'.padEnd(14) + 'Card'.padEnd(26) + 'copies  play%   win%   dmg/game');
for (const name of names) {
  const gp = cardGames[name] || 1;
  const rows = Object.entries(cards[name])
    .map(([cardId, a]) => ({
      cardId,
      inDeck: a.inDeck,
      playRate: (100 * a.gamesPlayedIn) / gp,
      winRate: a.gamesPlayedIn ? (100 * a.winsWhenPlayed) / a.gamesPlayedIn : 0,
      dmg: a.attackOut / gp,
      gamesPlayedIn: a.gamesPlayedIn,
    }))
    .sort((a, b) => a.playRate - b.playRate);
  for (const r of rows) {
    console.log(
      name.padEnd(14) +
        r.cardId.padEnd(26) +
        String(r.inDeck).padStart(6) +
        r.playRate.toFixed(0).padStart(7) +
        (r.gamesPlayedIn ? r.winRate.toFixed(0).padStart(7) : '      —') +
        r.dmg.toFixed(1).padStart(11),
    );
  }
}

// A deck with no hero games has no card data at all; that is a hole in the measurement, not a
// pool of dead cards, so it is reported as such rather than listed card-by-card as unplayed.
const never = [];
const unmeasured = names.filter((nm) => !cardGames[nm]);
for (const name of names) {
  if (!cardGames[name]) continue;
  for (const [cardId, a] of Object.entries(cards[name])) if (a.gamesPlayedIn === 0) never.push(`${name}/${cardId}`);
}
console.log(`\nNever played across the field: ${never.length ? never.join(', ') : 'none'}`);
if (unmeasured.length) console.log(`No per-card data (never the hero side): ${unmeasured.join(', ')}`);
console.log(`\nPer-card denominator (games observed${haveCardGames ? '' : ', hero side only — pre-both-sides shards'}): ` + names.map((nm) => `${nm} ${cardGames[nm]}`).join(', '));
console.log(`\nHero power casts per game: ` + names.map((nm) => `${nm} ${(heroPowers[nm] / (cardGames[nm] || 1)).toFixed(2)}`).join(', '));

if (jsonOut) {
  writeFileSync(jsonOut, JSON.stringify({ names, leaders, gamesPer, usePlan, matrix, field, cards, deckGames, cardGames, deckWins, heroPowers, turns, missing }, null, 1));
  console.log(`\nwrote ${jsonOut}`);
}
