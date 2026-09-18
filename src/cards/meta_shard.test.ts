import { describe, it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { starterRegistry, starterDecks } from '@cards/data/starter';
import { expandDeck } from '@cards/registry';
import { simulateGame } from '@engine/sim';
import type { Deck } from '@cards/schema';
import type { PlayerId } from '@engine/types';

/**
 * SHARDABLE meta matrix — the CI counterpart to `meta_sim.test.ts`.
 *
 * `runMeta` computes the whole 78-pairing matrix in one call, drawing seeds from a single
 * running counter, so its results depend on the order pairings are visited and it cannot be
 * split across machines. This file enumerates the same pairings in a fixed order, derives
 * each game's seed from its PAIRING INDEX rather than a counter, and computes only the
 * pairings belonging to this shard. Every shard is therefore independent and reproducible,
 * and N shards on N runners produce exactly the results one machine would.
 *
 * It also collects what `runMeta` throws away: per-deck per-card play/win/damage
 * aggregates, which is the signal a balance pass acts on. `scripts/meta-combine.mjs`
 * merges the shard files into one report.
 *
 * BOTH sides of every game are credited. `playHeroGame` reports only the hero's plays, so
 * crediting through it gave card data to the lower-indexed deck of a pairing alone — deck 0 was
 * the hero in all 12 of its pairings, the last deck in none, and its whole list read as never
 * played. `simulateGame` already returns `played`/`damageByCard` for both players, so taking
 * both costs no extra simulation and gives every deck the same full-field denominator.
 * The seeds and pairing order are unchanged, so the MATRIX is identical either way.
 *
 * OPT-IN ONLY, same gate as meta_sim.test.ts — hours of work under the planning AI:
 *
 *   RUN_BALANCE=1 META_SHARD=0 META_SHARDS=20 META_GAMES=24 \
 *     npx vitest run src/cards/meta_shard.test.ts --reporter=verbose --disable-console-intercept
 */
const GAMES = Number(process.env.META_GAMES ?? 24);
const SHARD = Number(process.env.META_SHARD ?? 0);
const SHARDS = Number(process.env.META_SHARDS ?? 1);
const SEED_BASE = Number(process.env.META_SEED ?? 1);
// The planning AI is the shipped policy and the only one balance work may use; greedy
// correlates with it at only 0.545 (see the note on `simulateGame`).
const USE_PLAN = process.env.USE_PLAN !== '0';
const OUT_DIR = process.env.META_OUT ?? 'meta-out';
const RUN_BALANCE = process.env.RUN_BALANCE === '1';

interface CardAggJson {
  inDeck: number;
  gamesPlayedIn: number;
  totalCopies: number;
  winsWhenPlayed: number;
  attackOut: number;
}

describe.skipIf(!RUN_BALANCE)('meta shard', () => {
  it('computes this shard of the meta matrix', { timeout: 36_000_000 }, () => {
    const decks = starterDecks;
    const names = decks.map((d) => d.name);
    const n = decks.length;

    // Fixed pairing order, independent of which shard is running.
    const pairs: [number, number][] = [];
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) pairs.push([i, j]);
    const mine = pairs.map((p, idx) => ({ p, idx })).filter(({ idx }) => idx % SHARDS === SHARD);

    const cards: Record<string, Record<string, CardAggJson>> = {};
    const deckGames: Record<string, number> = {};
    const deckWins: Record<string, number> = {};
    const heroPowers: Record<string, number> = {};
    const turns: Record<string, number> = {};
    // Games in which this deck's cards were observed — the honest denominator for the card
    // aggregates, and now simply every game the deck played.
    const cardGames: Record<string, number> = {};
    for (const d of decks) {
      const counts: Record<string, number> = {};
      for (const e of d.cards) counts[e.cardId] = e.count;
      cards[d.name] = Object.fromEntries(
        expandDeck(d)
          .filter((id, i, a) => a.indexOf(id) === i)
          .map((id) => [id, { inDeck: counts[id] ?? 0, gamesPlayedIn: 0, totalCopies: 0, winsWhenPlayed: 0, attackOut: 0 }]),
      );
      deckGames[d.name] = 0;
      deckWins[d.name] = 0;
      heroPowers[d.name] = 0;
      turns[d.name] = 0;
      cardGames[d.name] = 0;
    }

    const credit = (deckName: string, won: boolean, played: Record<string, number>, damage: Record<string, number>): void => {
      const agg = cards[deckName]!;
      for (const [cardId, copies] of Object.entries(played)) {
        const a = (agg[cardId] ??= { inDeck: 0, gamesPlayedIn: 0, totalCopies: 0, winsWhenPlayed: 0, attackOut: 0 });
        a.gamesPlayedIn += 1;
        a.totalCopies += copies;
        if (won) a.winsWhenPlayed += 1;
      }
      for (const [cardId, dmg] of Object.entries(damage)) {
        const a = (agg[cardId] ??= { inDeck: 0, gamesPlayedIn: 0, totalCopies: 0, winsWhenPlayed: 0, attackOut: 0 });
        a.attackOut += dmg;
      }
    };

    console.log(`=== meta shard ${SHARD}/${SHARDS} · ${mine.length} pairings · ${GAMES} games each${USE_PLAN ? ' · PLANNING' : ' · GREEDY'} ===`);
    const results: { i: number; j: number; iWins: number; games: number }[] = [];
    const t0 = Date.now();
    for (const { p: [i, j], idx } of mine) {
      const a = decks[i]!;
      const b = decks[j]!;
      let iWins = 0;
      for (let g = 0; g < GAMES; g++) {
        // Seed derives from the PAIRING INDEX, so a shard's results never depend on which
        // other pairings ran before it on the same machine.
        const seed = SEED_BASE + idx * GAMES + g;
        // `a` alternates sides so neither deck keeps the first-player advantage. Seating is
        // identical to the `playHeroGame(a, b, heroSide, ...)` this used to call, so the
        // matrix is unchanged; only the discarded second side is now kept.
        const aSide: PlayerId = g % 2 === 0 ? 0 : 1;
        const seated: [Deck, Deck] = aSide === 0 ? [a, b] : [b, a];
        const r = simulateGame(starterRegistry, seated, seed, USE_PLAN);
        const aWon = r.winner === aSide;
        const bSide: PlayerId = aSide === 0 ? 1 : 0;
        if (aWon) iWins += 1;
        credit(a.name, aWon, r.played[aSide]!, r.damageByCard[aSide]!);
        credit(b.name, !aWon, r.played[bSide]!, r.damageByCard[bSide]!);
        cardGames[a.name]! += 1;
        cardGames[b.name]! += 1;
        deckGames[a.name]! += 1;
        deckGames[b.name]! += 1;
        if (aWon) deckWins[a.name]! += 1;
        else deckWins[b.name]! += 1;
        heroPowers[a.name]! += r.heroPowers[aSide]!;
        heroPowers[b.name]! += r.heroPowers[bSide]!;
        turns[a.name]! += r.turns;
        turns[b.name]! += r.turns;
      }
      results.push({ i, j, iWins, games: GAMES });
      console.log(`  ${a.name} vs ${b.name}: ${iWins}/${GAMES}  (${((Date.now() - t0) / 1000).toFixed(0)}s elapsed)`);
    }

    mkdirSync(OUT_DIR, { recursive: true });
    const out = {
      shard: SHARD,
      shards: SHARDS,
      games: GAMES,
      seedBase: SEED_BASE,
      usePlan: USE_PLAN,
      decks: names,
      leaders: decks.map((d) => d.leaderId),
      pairs: results,
      cards,
      deckGames,
      cardGames,
      deckWins,
      heroPowers,
      turns,
      elapsedSec: Math.round((Date.now() - t0) / 1000),
    };
    const file = `${OUT_DIR}/meta-shard-${SHARD}.json`;
    writeFileSync(file, JSON.stringify(out, null, 1));
    console.log(`wrote ${file} (${results.length} pairings, ${out.elapsedSec}s)`);
  });
});
