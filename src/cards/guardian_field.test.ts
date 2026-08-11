import { describe, it } from 'vitest';
import { starterRegistry, starterDecks } from '@cards/data/starter';
import { runField } from '@engine/sim';

// Fast single-deck probe: run one HERO deck against every other deck (sides alternated)
// and print per-matchup + overall win rate. Much cheaper than the full meta matrix.
//   HERO=Guardian META_GAMES=30 npx vitest run src/cards/guardian_field.test.ts --reporter=verbose
const GAMES = Number(process.env.META_GAMES ?? 30);
const HERO = process.env.HERO ?? 'Guardian';
const USE_PLAN = process.env.USE_PLAN !== '0'; // planning AI (the shipped policy) unless USE_PLAN=0

// OPT-IN ONLY. This is a manual balance harness, not a unit test: it is minutes-to-HOURS long
// under the planning AI (the shipped policy, now the sim default). Leaving it in the default
// suite turned `npm test` into a ~9.5h job. Run it deliberately:
//   RUN_BALANCE=1 npx vitest run <this file> --reporter=verbose --disable-console-intercept
const RUN_BALANCE = process.env.RUN_BALANCE === '1';

describe.skipIf(!RUN_BALANCE)('field probe', () => {
  it('hero vs field', { timeout: 1_800_000 }, () => {
    const hero = starterDecks.find((d) => d.name === HERO)!;
    const opponents = starterDecks.filter((d) => d.name !== HERO).map((d) => ({ deck: d, name: d.name }));
    const res = runField(starterRegistry, hero, opponents, GAMES, 1, USE_PLAN);
    console.log('\n=== ' + HERO + ' vs field' + (USE_PLAN ? ' [planTurn]' : '') + ' · ' + GAMES + ' games/matchup ===');
    for (const m of res.matchups.sort((a, b) => a.wins / a.games - b.wins / b.games)) {
      console.log(m.opponent.padEnd(14) + (Math.round((m.wins / m.games) * 100) + '%').padStart(5) + '  (' + m.wins + '/' + m.games + ')');
    }
    console.log('-'.repeat(28));
    console.log('FIELD'.padEnd(14) + (Math.round((res.totalWins / res.totalGames) * 100) + '%').padStart(5) + '  (' + res.totalWins + '/' + res.totalGames + ')');
  });
});
