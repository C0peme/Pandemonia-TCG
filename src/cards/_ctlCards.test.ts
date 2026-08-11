import { it } from 'vitest';
import { starterRegistry, starterDecks } from '@cards/data/starter';
import { runField, type CardAgg } from '@engine/sim';
import type { Deck } from '@cards/schema';

/**
 * Card-level field report on the REBUILT Control list, to find which cards carry its 80.3%.
 * The rebuild measured +44.7pp — right diagnosis, badly overshot — so this is about locating
 * the dials, not re-confirming the gain.
 *
 * Two seeds, because Phase B showed a single run's per-card numbers are as noisy as its field
 * number. A card that tops both lists is a real suspect; one that tops only one is not.
 */
// OPT-IN ONLY (see meta_sim.test.ts).
const RUN_BALANCE = process.env.RUN_BALANCE === '1';
const stamp = () => new Date().toTimeString().slice(0, 8);

it.skipIf(!RUN_BALANCE)('Control (rebuilt): which cards carry it', { timeout: 8 * 3_600_000 }, () => {
  const deck = (starterDecks as any[]).find((d) => d.name === 'Control') as Deck;
  const opponents = (starterDecks as any[])
    .filter((d) => d.name !== 'Control').map((d) => ({ deck: d as Deck, name: d.name }));
  const NEW = new Set(['abyssal-verdict', 'frostbite-harpoon', 'riptide-executioner',
    'tidecaller-adept', 'brackish-warden']);

  const perSeed: Record<string, number>[] = [];
  for (const seed of [1, 5000]) {
    console.log(`\n=== seed ${seed} · 12 games/matchup · PLANNING · start ${stamp()} ===`);
    const r = runField(starterRegistry, deck, opponents, 12, seed, true);
    console.log(`  field ${((r.totalWins / r.totalGames) * 100).toFixed(1)}%  (${r.totalGames} games)`);
    console.log('  | card                  | n | played | win% played | dmg/game |');
    console.log('  |-----------------------|---|--------|-------------|----------|');
    const win: Record<string, number> = {};
    for (const c of [...r.cards].sort((a: CardAgg, b: CardAgg) =>
      (b.winsWhenPlayed / Math.max(1, b.gamesPlayedIn)) - (a.winsWhenPlayed / Math.max(1, a.gamesPlayedIn)))) {
      const wr = c.gamesPlayedIn ? (c.winsWhenPlayed / c.gamesPlayedIn) * 100 : NaN;
      win[c.cardId] = wr;
      console.log(`  | ${(NEW.has(c.cardId) ? '* ' : '  ') + c.cardId.padEnd(19)} | ${c.inDeck} |` +
        ` ${((c.gamesPlayedIn / r.totalGames) * 100).toFixed(0).padStart(5)}% |` +
        ` ${(Number.isNaN(wr) ? '  —' : wr.toFixed(0)).padStart(10)}% |` +
        ` ${(c.attackOut / r.totalGames).toFixed(1).padStart(8)} |`);
    }
    perSeed.push(win);
  }

  console.log('\n=== STABLE ACROSS BOTH SEEDS (mean win% when played, * = new card) ===');
  const ids = Object.keys(perSeed[0]!);
  const rows = ids.map((id) => ({ id, mean: (perSeed[0]![id]! + (perSeed[1]![id] ?? perSeed[0]![id]!)) / 2,
    gap: Math.abs(perSeed[0]![id]! - (perSeed[1]![id] ?? perSeed[0]![id]!)) }))
    .sort((a, b) => b.mean - a.mean);
  for (const r of rows) {
    console.log(`  ${(NEW.has(r.id) ? '* ' : '  ') + r.id.padEnd(21)} ${r.mean.toFixed(1).padStart(5)}%   (seed gap ${r.gap.toFixed(0)})`);
  }
  console.log('\n########## CONTROL CARD REPORT COMPLETE ##########');
});
