import { describe, it } from 'vitest';
import { starterRegistry, starterDecks } from '@cards/data/starter';
import { simulateGame } from '@engine/sim';
import type { PlayerId } from '@engine/types';

// One-off diagnostic: how does Combo actually lose? Run with:
//   npx vitest run src/cards/combo_diag.test.ts --reporter=verbose
const GAMES = Number(process.env.DIAG_GAMES ?? 10);
const USE_PLAN = process.env.USE_PLAN !== '0'; // planning AI (the shipped policy) unless USE_PLAN=0

// OPT-IN ONLY. This is a manual balance harness, not a unit test: it is minutes-to-HOURS long
// under the planning AI (the shipped policy, now the sim default). Leaving it in the default
// suite turned `npm test` into a ~9.5h job. Run it deliberately:
//   RUN_BALANCE=1 npx vitest run <this file> --reporter=verbose --disable-console-intercept
const RUN_BALANCE = process.env.RUN_BALANCE === '1';

describe.skipIf(!RUN_BALANCE)('combo diag', () => {
  it('profiles Combo across the field', { timeout: 3_600_000 }, () => {
    const combo = starterDecks.find((d) => d.name === 'Combo')!;
    const opps = starterDecks.filter((d) => d.name !== 'Combo');

    let wins = 0, games = 0;
    let turnsWin = 0, turnsLoss = 0, nWin = 0, nLoss = 0;
    let ownHpLoss = 0, oppHpLoss = 0;       // HP at end of games we LOST
    let ownHpWin = 0, oppHpWin = 0;         // HP at end of games we WON
    let handStuck = 0, banked = 0;
    const dmg: Record<string, number> = {};
    const plays: Record<string, number> = {};

    for (const opp of opps) {
      for (let i = 0; i < GAMES; i++) {
        const heroSide: PlayerId = i % 2 === 0 ? 0 : 1;
        const decks: [typeof combo, typeof opp] = heroSide === 0 ? [combo, opp] : [opp, combo];
        const r = simulateGame(starterRegistry, decks, 1000 + games, USE_PLAN);
        const won = r.winner === heroSide;
        games += 1;
        if (won) {
          wins += 1; turnsWin += r.turns; nWin += 1;
          ownHpWin += r.finalHp[heroSide]; oppHpWin += r.finalHp[(1 - heroSide) as PlayerId];
        } else {
          turnsLoss += r.turns; nLoss += 1;
          ownHpLoss += r.finalHp[heroSide]; oppHpLoss += r.finalHp[(1 - heroSide) as PlayerId];
        }
        handStuck += r.finalHandSize[heroSide];
        banked += r.finalBanked[heroSide];
        for (const [c, d] of Object.entries(r.damageByCard[heroSide])) dmg[c] = (dmg[c] ?? 0) + d;
        for (const [c, n] of Object.entries(r.played[heroSide])) plays[c] = (plays[c] ?? 0) + n;
      }
    }

    console.log(`\n=== Combo diagnostic (${USE_PLAN ? 'PLAN' : 'greedy'}, ${games} games) ===`);
    console.log(`Win rate: ${Math.round((wins / games) * 100)}% (${wins}/${games})`);
    console.log(`Avg turns — wins: ${(turnsWin / Math.max(1, nWin)).toFixed(1)}, losses: ${(turnsLoss / Math.max(1, nLoss)).toFixed(1)}`);
    console.log(`In LOSSES — own leader HP left: ${(ownHpLoss / Math.max(1, nLoss)).toFixed(1)}, opp leader HP left: ${(oppHpLoss / Math.max(1, nLoss)).toFixed(1)}`);
    console.log(`In WINS   — own leader HP left: ${(ownHpWin / Math.max(1, nWin)).toFixed(1)}, opp leader HP left: ${(oppHpWin / Math.max(1, nWin)).toFixed(1)}`);
    console.log(`Avg cards stuck in hand at end: ${(handStuck / games).toFixed(1)}`);
    console.log(`Avg banked energy unspent at end: ${(banked / games).toFixed(1)}`);

    console.log(`\n--- Combat damage by card (the clock) ---`);
    for (const [c, d] of Object.entries(dmg).sort((a, b) => b[1] - a[1])) {
      console.log(`${c.padEnd(20)} ${(d / games).toFixed(2)} dmg/game  (${((plays[c] ?? 0) / games).toFixed(2)} played/game)`);
    }
    console.log(`\n--- Cards played but dealt 0 combat damage ---`);
    for (const [c, n] of Object.entries(plays).sort((a, b) => b[1] - a[1])) {
      if (!dmg[c]) console.log(`${c.padEnd(20)} ${(n / games).toFixed(2)} played/game`);
    }
  });
});
