/**
 * Deck-out attribution harness: how much of each side's leader damage is SELF-inflicted.
 *
 * OPT-IN ONLY (RUN_DIAG=1), like the other balance harnesses — it plays real fights under
 * the planning AI, so it is minutes, not a unit test.
 *
 *   RUN_DIAG=1 DIAG_LEADERS=aleph,autopus npx vitest run \
 *     src/adventure/deckout_sim.test.ts --reporter=verbose --disable-console-intercept
 *
 * WHY THIS EXISTS. A side that empties its deck mid-fight draws Nulls, and a Null bleeds
 * its OWN leader for 4 when it dies or is discarded (cards/special.ts). That damage looks
 * exactly like enemy pressure in every other report — `hpAfter` just goes down — so a run
 * report alone cannot tell "the fights are too hard" apart from "both decks are too small
 * for the fights". Splitting each side's leader damage at the turn it decked out is what
 * distinguishes them, and it is the measurement that found the starter/DECK_FLOOR sizes
 * were the thing killing Adventure runs rather than any card or leader being mistuned.
 *
 * Re-run it after any change to starter size, `DECK_FLOOR`, draw rate or fight length: a
 * post-deck-out share creeping back up means deck-out is deciding fights again.
 */
import { describe, it } from 'vitest';
import { buildRegistry } from '@cards/registry';
import { starterCards, starterLeaders } from '@cards/data/starter';
import { startRun } from '@adventure/run';
import { buildFight } from '@adventure/encounters';
import { applyAction } from '@engine/engine';
import { planTurn } from '@engine/ai';
import type { Action } from '@engine/actions';
import type { GameState } from '@engine/types';

const RUN_DIAG = process.env.RUN_DIAG === '1';
const ONLY = (process.env.DIAG_LEADERS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const base = buildRegistry(starterCards, starterLeaders);

const trace = (leaderId: string, seed: number) => {
  const run = startRun(leaderId, seed, base);
  const nodeId = Object.values(run.map.nodes).find((n) => n.layer === 0 && n.kind === 'combat')!.id;
  const { registry, initial } = buildFight(base, run, nodeId, seed * 7 + 1);
  let state: GameState = initial;
  let queue: Action[] = [];
  let guard = 0, turn = 0;
  const pre = [0, 0], post = [0, 0], nulls = [0, 0], deckOut = [0, 0];
  const decked = [false, false];
  while (state.phase !== 'ended' && guard++ < 4000) {
    if (queue.length === 0) queue = planTurn(registry, state);
    const action = queue.shift() ?? { type: 'endTurn' };
    const res = applyAction(registry, state, action);
    for (const e of res.events) {
      if (e.t === 'turnStart') turn++;
      if (e.t === 'drawNull') { nulls[e.player] = (nulls[e.player] ?? 0) + 1; if (!decked[e.player]) { decked[e.player] = true; deckOut[e.player] = turn; } }
      if (e.t === 'damageLeader') { if (decked[e.player]) post[e.player] = (post[e.player] ?? 0) + e.amount; else pre[e.player] = (pre[e.player] ?? 0) + e.amount; }
    }
    state = res.state;
  }
  return { won: state.winner === 0, turn, deckOut, nulls, pre, post, hp: [state.players[0].leaderHp, state.players[1].leaderHp] };
};

describe.skipIf(!RUN_DIAG)('fight trace', () => {
  it('measures pre/post deck-out damage for both sides', { timeout: 3_600_000 }, () => {
    const leaders = (ONLY.length ? starterLeaders.filter((l) => ONLY.includes(l.id)) : starterLeaders).map((l) => l.id);
    console.log('\nleader      seed won turns | P0 dOut nulls pre post | P1 dOut nulls pre post');
    const T = [{ pre: 0, post: 0 }, { pre: 0, post: 0 }];
    for (const leaderId of leaders) {
      for (const seed of [1000, 1001, 1002]) {
        const r = trace(leaderId, seed);
        for (const p of [0, 1]) { T[p]!.pre += r.pre[p]!; T[p]!.post += r.post[p]!; }
        console.log(
          leaderId.padEnd(12) + String(seed).padStart(4) + (r.won ? '  Y' : '  N') + String(r.turn).padStart(6) +
          ' |' + String(r.deckOut[0] || '-').padStart(5) + String(r.nulls[0]).padStart(6) + String(r.pre[0]).padStart(4) + String(r.post[0]).padStart(5) +
          ' |' + String(r.deckOut[1] || '-').padStart(5) + String(r.nulls[1]).padStart(6) + String(r.pre[1]).padStart(4) + String(r.post[1]).padStart(5),
        );
      }
    }
    for (const p of [0, 1]) {
      const { pre, post } = T[p]!;
      console.log(`P${p} leader damage: pre-deckout ${pre}, post-deckout ${post} (${(100 * post / (pre + post)).toFixed(0)}% after deck-out)`);
    }
  });
});
