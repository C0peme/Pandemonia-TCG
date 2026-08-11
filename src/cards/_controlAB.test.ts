import { it } from 'vitest';
import { starterRegistry, starterDecks } from '@cards/data/starter';
import { runField } from '@engine/sim';
import { parseDeck, type Deck } from '@cards/schema';

/**
 * PHASE A+B COMBINED — the Control rebuild measured as a PAIRED A/B, at three seed bases.
 *
 * Two questions from one job:
 *   1. Does the rebuild work?  -> the delta.
 *   2. Can we trust ANY A/B number we produce?  -> the STABILITY of that delta across seeds.
 *
 * Both arms share a seedBase, so they see the same shuffles (common random numbers). The
 * cross-seed spread measured in Phase B (6.2pp mean, 10pp worst) is an upper bound on the
 * noise of a PAIRED difference, not the right band for it — this measures the real one.
 *
 * Caveat: this compares the two LISTS on the CURRENT engine. The hit-resolution change (card
 * damage is a hit, Freeze absorbs it) applies to both arms, so it is not isolated here — the
 * old list is handicapped by its own freezes blocking its own damage, exactly as it would be
 * if we shipped the engine change and kept the old list. That is the decision this answers.
 */
const stamp = () => new Date().toTimeString().slice(0, 8);

/** The pre-rebuild Control list, reconstructed (every card still exists in the pool). */
const oldControl = parseDeck({
  name: 'Control (old)', leaderId: 'phantom', cards: [
    { cardId: 'river-minnow', count: 1 }, { cardId: 'target-spell', count: 2 },
    { cardId: 'cold-spell', count: 3 }, { cardId: 'hypnotic-patterns', count: 1 }, { cardId: 'peel-back', count: 2 },
    { cardId: 'river-turtle', count: 2 }, { cardId: 'current-rider', count: 2 }, { cardId: 'tide-serpent', count: 2 }, { cardId: 'sleep-walker', count: 2 },
    { cardId: 'frost-wall', count: 2 }, { cardId: 'dream-eater', count: 2 }, { cardId: 'crag-hawk', count: 2 },
    { cardId: 'lull', count: 1 }, { cardId: 'frost-king', count: 2 }, { cardId: 'abyss-warden', count: 1 },
    { cardId: 'glacial-ray', count: 3 },
  ],
});

// OPT-IN ONLY (see meta_sim.test.ts): ~3.5h under the planning AI.
const RUN_BALANCE = process.env.RUN_BALANCE === '1';

it.skipIf(!RUN_BALANCE)('Control rebuild: paired A/B across three seeds', { timeout: 8 * 3_600_000 }, () => {
  const newControl = (starterDecks as any[]).find((d) => d.name === 'Control') as Deck;
  const opponents = (starterDecks as any[])
    .filter((d) => d.name !== 'Control')
    .map((d) => ({ deck: d as Deck, name: d.name }));
  const SEEDS = [1, 5000, 9000];
  const GAMES = 12;

  console.log(`\n=== Control rebuild A/B · ${GAMES} games/matchup · PLANNING · start ${stamp()} ===`);
  console.log(`old list: ${oldControl.cards.length} entries | new list: ${newControl.cards.length} entries`);
  console.log('\n| seed | old  | new  | delta |');
  console.log('|------|------|------|-------|');

  const deltas: number[] = [];
  for (const seed of SEEDS) {
    const o = runField(starterRegistry, oldControl, opponents, GAMES, seed, true);
    const n = runField(starterRegistry, newControl, opponents, GAMES, seed, true);
    const rate = (r: any) => (r.totalWins / r.totalGames) * 100;
    const d = rate(n) - rate(o);
    deltas.push(d);
    console.log(`| ${String(seed).padStart(4)} | ${rate(o).toFixed(1).padStart(4)} | ${rate(n).toFixed(1).padStart(4)} |` +
      ` ${(d >= 0 ? '+' : '') + d.toFixed(1)} |   [${stamp()}]`);
  }

  const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  const spread = Math.max(...deltas) - Math.min(...deltas);
  console.log(`\nmean delta ${mean >= 0 ? '+' : ''}${mean.toFixed(1)}pp`);
  console.log(`DELTA SPREAD ACROSS SEEDS: ${spread.toFixed(1)}pp   (absolute cross-seed spread was 6.2 mean / 10 worst)`);
  console.log(spread < 3
    ? '=> paired A/B is TIGHT: past A/B probes (Scry -3.6, Corpselock -2.6) are trustworthy.'
    : spread < 6
      ? '=> paired A/B is MODERATE: only deltas larger than the spread are readable.'
      : '=> paired A/B is NOT much better than unpaired: A/B probes detect large effects only.');
  console.log('\n########## CONTROL A/B COMPLETE ##########');
});
