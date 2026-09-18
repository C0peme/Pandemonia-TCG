import { describe, expect, it } from 'vitest';
import { Match } from '@net/match';
import { starterCards, starterLeaders, starterDecks } from '@cards/data/starter';
import type { ContentSnapshot } from '@cards/snapshot';
import type { Action } from '@engine/actions';

const snapshot: ContentSnapshot = { cards: starterCards, leaders: starterLeaders, decks: starterDecks };

/** Get a Match into `phase: 'playing'` with both seats ready, deck picked, match started. */
const playingMatch = (): Match => {
  const m = new Match();
  m.join('host', 'Host');
  m.join('player', 'Player');
  m.setContent(snapshot);
  const deck = starterDecks[0]!;
  m.chooseDeck(0, deck);
  m.chooseDeck(1, deck);
  const started = m.start(1);
  if (!started.ok) throw new Error(`setup failed: ${started.error}`);
  return m;
};

/**
 * `apply` is the one call in the match that runs on network input the type system cannot
 * actually vouch for — `parseMsg` (protocol.ts) is a JSON.parse plus a type ASSERTION, so
 * an `Action` object reaching here is only as well-formed as whatever the client sent.
 * `applyAction` handles a wholly unrecognized `action.type` gracefully (its own exhaustive
 * `default` case), but a KNOWN action type with a garbage field value can still reach a
 * bare property read on `undefined` a few calls deep and throw — e.g. `playUnit` with a
 * `lane` that isn't a real lane id reaches `player.lanes[lane].front` inside
 * `resolvePosition`, and `player.lanes['not-a-real-lane']` is `undefined`.
 *
 * Uncaught, that exception propagates out of the WebSocket `message` handler in
 * server/index.ts, which has no handler for it — taking down the whole process, and with
 * it the match for BOTH players, over one malformed message from either one.
 */
describe('Match.apply — untrusted action input must never crash the process', () => {
  it('a known action type with a garbage lane value is refused, not thrown', () => {
    const m = playingMatch();
    const active = m.state!.active;
    const iid = m.state!.players[active].hand[0]?.iid;
    expect(iid).toBeTruthy();
    // Guarantee the affordability check passes, so the bad `lane` is actually what gets hit
    // (round-1 energy may be lower than the cheapest hand card's cost, which would reject
    // the action for being unaffordable before ever reaching the lane lookup).
    m.state!.players[active].energy = 99;

    const badAction = { type: 'playUnit', iid, lane: 'not-a-real-lane' } as unknown as Action;
    let threw = false;
    let res;
    try {
      res = m.apply(active, badAction);
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
    expect(res!.ok).toBe(false);
    // The match must still be alive and playable after the bad action — a crash-turned-fail
    // means nothing mutated, so the SAME hand card can still be legally played afterward.
    expect(m.phase).toBe('playing');
    expect(m.state!.active).toBe(active);
  });

  it('a completely unrecognized action type is refused cleanly (already handled by applyAction itself)', () => {
    const m = playingMatch();
    const active = m.state!.active;
    const res = m.apply(active, { type: 'notARealActionType' } as unknown as Action);
    expect(res.ok).toBe(false);
  });

  it('a legal action still applies normally after the try/catch was added', () => {
    const m = playingMatch();
    const active = m.state!.active;
    const before = m.state!;
    const res = m.apply(active, { type: 'endTurn' });
    expect(res.ok).toBe(true);
    expect(m.state).not.toBe(before);
  });
});
