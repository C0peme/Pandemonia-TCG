import { describe, it } from 'vitest';
import { starterRegistry, starterDecks } from '@cards/data/starter';
import { runMeta } from '@engine/sim';

// Headless meta matrix — mirrors the Balance Lab "Meta Matrix" output so deck
// changes can be measured from the CLI. Run with:
//   npx vitest run src/cards/meta_sim.test.ts --reporter=verbose
const GAMES = Number(process.env.META_GAMES ?? 30);
const USE_PLAN = process.env.USE_PLAN !== '0'; // planning AI (the shipped policy) unless USE_PLAN=0

describe('meta sim', () => {
  it('prints win-rate matrix', { timeout: 36_000_000 }, () => {
    const decks = starterDecks.map((d) => ({ deck: d, name: d.name }));
    const names = decks.map((d) => d.name);
    const n = names.length;
    const short = (s: string) => s.slice(0, 6).padStart(6);
    // Header (printed up-front so streamed rows have context).
    let header = 'Deck'.padEnd(14);
    for (const name of names) header += short(name) + ' ';
    header += '  Field';
    console.log('\n=== Meta Matrix · ' + GAMES + ' games/matchup' + (USE_PLAN ? ' · PLANNING' : '') + ' ===');
    console.log(header);
    // Stream each row as it completes, so an interrupted run still yields finished rows.
    const printRow = (i: number, matrix: number[][]): void => {
      let row = names[i]!.padEnd(14);
      let wins = 0;
      let games = 0;
      for (let j = 0; j < n; j++) {
        if (i === j) { row += '     — '; continue; }
        row += (Math.round((matrix[i]![j]! / GAMES) * 100) + '%').padStart(6) + ' ';
        wins += matrix[i]![j]!;
        games += GAMES;
      }
      row += (Math.round((games ? wins / games : 0) * 100) + '%').padStart(7);
      console.log(row);
    };
    const res = runMeta(starterRegistry, decks, GAMES, 1, USE_PLAN, printRow);
    // Sorted field standings (needs the full matrix, so only prints on completion).
    console.log('\n=== Field standings (sorted) ===');
    const standings = res.decks
      .map((name, i) => ({ name, field: res.overall[i]! }))
      .sort((a, b) => b.field - a.field);
    for (const s of standings) {
      console.log(s.name.padEnd(14) + (Math.round(s.field * 100) + '%').padStart(5));
    }
  });
});
