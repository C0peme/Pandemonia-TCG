/**
 * Headless self-play simulation for balancing. Pure: runs full AI-vs-AI games on the engine
 * (no React, no animation) and reports which cards each side played and who won. Aggregating
 * many games gives statistically meaningful per-card signal (play rate, win rate when played)
 * that a single match can't.
 */
import { initGame } from '@engine/setup';
import { applyAction } from '@engine/engine';
import { greedyAction, planTurn } from '@engine/ai';
import { LANES } from '@engine/constants';
import type { Registry } from '@cards/registry';
import type { Deck } from '@cards/schema';
import type { Action } from '@engine/actions';
import type { GameState, PlayerId } from '@engine/types';

/** Per-card play counts for one game (cardId -> copies played), one map per side. */
export interface GameResult {
  winner: PlayerId;
  turns: number;
  played: [Record<string, number>, Record<string, number>];
  /** Combat damage dealt by each card (cardId -> total attack damage), one map per side. */
  damageByCard: [Record<string, number>, Record<string, number>];
  /** Leader (hero) powers used by each side. */
  heroPowers: [number, number];
  /** Leader HP remaining at game end for each player. */
  finalHp: [number, number];
  /** Cards in hand at game end for each player. */
  finalHandSize: [number, number];
  /** Sum of all element bank values at game end for each player. */
  finalBanked: [number, number];
}

/**
 * Play one AI-vs-AI game to completion and report plays + winner. Deterministic per seed.
 * `usePlan` selects the AI policy and DEFAULTS TO TRUE — the full `planTurn` search (beam +
 * lethal + opponent reply), which is the policy a real player faces (useGame.ts -> chooseAction
 * -> planTurn). planTurn is planned once per turn and its action sequence is applied
 * move-by-move (so event accounting is unchanged), then replanned for the next turn.
 *
 * Pass `false` for the fast 1-ply `greedyAction` ONLY where the AI policy is irrelevant to what
 * is being measured (plumbing/determinism tests). It must never be used for balance work: the
 * default was previously false, and a full session of meta tuning was measured against a policy
 * no player faces. The two metas correlate at only 0.545 — greedy cannot order attacks or see
 * multi-body lethal, so it systematically misplays wide aggressive decks (Swarm 47 -> 65,
 * Aggro 49 -> 63) and flatters decks that just play the biggest thing each turn.
 * Cost: ~15 s/game vs ~0.3 s/game.
 */
export function simulateGame(registry: Registry, decks: [Deck, Deck], seed: number, usePlan = true): GameResult {
  let state: GameState = initGame({ registry, decks, seed });
  const played: [Record<string, number>, Record<string, number>] = [{}, {}];
  const damageByCard: [Record<string, number>, Record<string, number>] = [{}, {}];
  const heroPowers: [number, number] = [0, 0];
  const idToCard = new Map<string, string>(); // iid -> cardId, so attack events can be credited
  let turns = 0;
  let guard = 0;
  let queue: Action[] = []; // planTurn mode: remaining actions of the current planned turn
  while (state.phase !== 'ended' && guard++ < 4000) {
    // Refresh the iid->cardId map from units currently on board (attackers are present pre-combat).
    for (const p of [0, 1] as PlayerId[]) for (const lane of LANES) for (const slot of ['front', 'back'] as const) {
      const u = state.players[p].lanes[lane][slot];
      if (u) idToCard.set(u.iid, u.cardId);
    }
    const actor = state.active; // whoever is acting owns the damage their attacker deals
    let action: Action;
    if (usePlan) {
      if (queue.length === 0) queue = planTurn(registry, state); // plan the whole turn, then drain it
      action = queue.shift() ?? { type: 'endTurn' };
    } else {
      action = greedyAction(registry, state);
    }
    const res = applyAction(registry, state, action);
    for (const e of res.events) {
      if (e.t === 'turnStart') turns += 1;
      else if (e.t === 'heroPower') heroPowers[e.player] += 1;
      else if (e.t === 'playUnit' || e.t === 'castSpell' || e.t === 'foundationPlaced' || e.t === 'playEnvironment') {
        const m = played[e.player];
        m[e.cardId] = (m[e.cardId] ?? 0) + 1;
      } else if (e.t === 'attack') {
        const cid = idToCard.get(e.attacker);
        if (cid) { const d = damageByCard[actor]; d[cid] = (d[cid] ?? 0) + e.amount; }
      }
    }
    state = res.state;
  }
  return {
    winner: state.winner ?? 0, turns, played, damageByCard, heroPowers,
    finalHp: [state.players[0].leaderHp, state.players[1].leaderHp],
    finalHandSize: [state.players[0].hand.length, state.players[1].hand.length],
    finalBanked: [
      Object.values(state.players[0].bank).reduce((s, v) => s + v, 0),
      Object.values(state.players[1].bank).reduce((s, v) => s + v, 0),
    ],
  };
}

/** Play one game with `hero` on `heroSide`; report whether hero won and what hero played. */
export function playHeroGame(
  registry: Registry,
  hero: Deck,
  opp: Deck,
  heroSide: PlayerId,
  seed: number,
  usePlan = true,
): { heroWon: boolean; heroPlayed: Record<string, number>; heroDamage: Record<string, number>; heroPowers: number; turns: number; finalHp: [number, number]; finalHandSize: [number, number]; finalBanked: [number, number] } {
  const decks: [Deck, Deck] = heroSide === 0 ? [hero, opp] : [opp, hero];
  const r = simulateGame(registry, decks, seed, usePlan);
  return {
    heroWon: r.winner === heroSide,
    heroPlayed: r.played[heroSide],
    heroDamage: r.damageByCard[heroSide],
    heroPowers: r.heroPowers[heroSide],
    turns: r.turns,
    finalHp: r.finalHp,
    finalHandSize: r.finalHandSize,
    finalBanked: r.finalBanked,
  };
}

/** Aggregated per-card stats over a batch, for one deck. */
export interface CardAgg {
  cardId: string;
  inDeck: number; // copies in the decklist
  gamesPlayedIn: number; // games where ≥1 copy was played
  totalCopies: number; // total copies played across all games
  winsWhenPlayed: number; // games won among those it was played in
  attackOut: number; // total combat damage dealt by this card across all games
}

export interface BatchResult {
  games: number;
  wins: [number, number]; // games won by each side
  avgTurns: number;
  heroPowers: [number, number]; // total leader skills used by each side
  cards: [CardAgg[], CardAgg[]]; // per-deck per-card aggregates
}

/** Initialise a per-card aggregate map from a decklist. */
const aggFromDeck = (deck: Deck): Map<string, CardAgg> => {
  const m = new Map<string, CardAgg>();
  for (const e of deck.cards) m.set(e.cardId, { cardId: e.cardId, inDeck: e.count, gamesPlayedIn: 0, totalCopies: 0, winsWhenPlayed: 0, attackOut: 0 });
  return m;
};

/**
 * Run `games` AI-vs-AI matches between two decks and aggregate per-card stats. `onProgress`
 * (if given) is called after each game so a UI can yield and show progress; callers that want a
 * responsive UI should run this in chunks (see BalanceLab) rather than all at once.
 */
export function runBatch(
  registry: Registry,
  decks: [Deck, Deck],
  games: number,
  seedBase = 1,
  usePlan = true,
): BatchResult {
  const aggs: [Map<string, CardAgg>, Map<string, CardAgg>] = [aggFromDeck(decks[0]), aggFromDeck(decks[1])];
  const wins: [number, number] = [0, 0];
  const heroPowers: [number, number] = [0, 0];
  let totalTurns = 0;
  for (let i = 0; i < games; i++) {
    const r = simulateGame(registry, decks, seedBase + i, usePlan);
    wins[r.winner] += 1;
    totalTurns += r.turns;
    heroPowers[0] += r.heroPowers[0];
    heroPowers[1] += r.heroPowers[1];
    for (const side of [0, 1] as PlayerId[]) {
      accHeroPlays(aggs[side], r.winner === side, r.played[side], r.damageByCard[side]);
    }
  }
  return {
    games,
    wins,
    avgTurns: games ? totalTurns / games : 0,
    heroPowers,
    cards: [[...aggs[0].values()], [...aggs[1].values()]],
  };
}

/** Fold one hero game's plays + combat damage into a per-card aggregate. */
export const accHeroPlays = (agg: Map<string, CardAgg>, heroWon: boolean, played: Record<string, number>, damage: Record<string, number> = {}): void => {
  for (const [cardId, copies] of Object.entries(played)) {
    const a = agg.get(cardId);
    if (!a) continue;
    a.gamesPlayedIn += 1;
    a.totalCopies += copies;
    if (heroWon) a.winsWhenPlayed += 1;
  }
  // Damage can be credited even for cards summoned (not "played" from hand) but in the decklist.
  for (const [cardId, dmg] of Object.entries(damage)) {
    const a = agg.get(cardId);
    if (a) a.attackOut += dmg;
  }
};

export interface MatchupResult { opponent: string; games: number; wins: number }
export interface FieldResult {
  hero: string;
  totalGames: number;
  totalWins: number;
  heroPowers: number; // total leader skills the hero used across the field
  matchups: MatchupResult[]; // one per opponent deck
  cards: CardAgg[]; // hero's cards aggregated across ALL field games (robust, matchup-averaged)
}

/** Sim `hero` against every deck in `opponents` (gamesPer each, sides alternated), aggregating
 *  hero's per-card stats across the WHOLE field — far less matchup-noise than a single pairing. */
export function runField(registry: Registry, hero: Deck, opponents: { deck: Deck; name: string }[], gamesPer: number, seedBase = 1, usePlan = true): FieldResult {
  const agg = aggFromDeck(hero);
  const matchups: MatchupResult[] = [];
  let totalGames = 0;
  let totalWins = 0;
  let totalHeroPowers = 0;
  for (const opp of opponents) {
    let wins = 0;
    for (let i = 0; i < gamesPer; i++) {
      const heroSide: PlayerId = i % 2 === 0 ? 0 : 1;
      const { heroWon, heroPlayed, heroDamage, heroPowers } = playHeroGame(registry, hero, opp.deck, heroSide, seedBase + totalGames + i, usePlan);
      if (heroWon) { wins += 1; totalWins += 1; }
      totalHeroPowers += heroPowers;
      accHeroPlays(agg, heroWon, heroPlayed, heroDamage);
    }
    totalGames += gamesPer;
    matchups.push({ opponent: opp.name, games: gamesPer, wins });
  }
  return { hero: hero.name, totalGames, totalWins, heroPowers: totalHeroPowers, matchups, cards: [...agg.values()] };
}

/** Round-robin every deck against every other (sides alternated), reporting a win-rate matrix.
 *  `matrix[i][j]` = games deck i won against deck j (out of `gamesPer`). */
export interface MetaResult {
  decks: string[];
  gamesPer: number;
  matrix: number[][]; // wins of row-deck vs col-deck (diagonal is 0/unused)
  overall: number[]; // each deck's win rate across the whole field
}

export function runMeta(
  registry: Registry,
  decks: { deck: Deck; name: string }[],
  gamesPer: number,
  seedBase = 1,
  usePlan = true,
  // Fired after outer iteration `i` completes, at which point row `i` of the matrix is fully
  // known (its j<i cells were filled by earlier iterations, its j>i cells just now). Lets a
  // caller stream partial results so a long run that is interrupted still yields finished rows.
  onRow?: (i: number, matrix: number[][]) => void,
): MetaResult {
  const n = decks.length;
  const matrix = Array.from({ length: n }, () => Array<number>(n).fill(0));
  let seed = seedBase;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      let iWins = 0;
      for (let g = 0; g < gamesPer; g++) {
        const heroSide: PlayerId = g % 2 === 0 ? 0 : 1;
        const { heroWon } = playHeroGame(registry, decks[i]!.deck, decks[j]!.deck, heroSide, seed++, usePlan);
        if (heroWon) iWins += 1;
      }
      matrix[i]![j] = iWins;
      matrix[j]![i] = gamesPer - iWins; // alternating sides => the pair is symmetric
    }
    onRow?.(i, matrix);
  }
  const overall = matrix.map((row, i) => {
    let w = 0; let g = 0;
    for (let j = 0; j < n; j++) { if (j === i) continue; w += row[j]!; g += gamesPer; }
    return g ? w / g : 0;
  });
  return { decks: decks.map((d) => d.name), gamesPer, matrix, overall };
}
