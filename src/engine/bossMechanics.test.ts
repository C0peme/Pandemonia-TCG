import { describe, expect, it } from 'vitest';
import { beginTurn } from '@engine/turn';
import { millCards } from '@engine/hand';
import { blankState, testRegistry, makeDeck, tenVanilla } from '@engine/testkit';
import { initGame } from '@engine/setup';

describe('GameState.energyOverride', () => {
  it('fixes energy to the override regardless of round', () => {
    const s = blankState({ round: 1, energyOverride: 10 });
    expect(beginTurn(s, 0, testRegistry).state.players[0].energy).toBe(10);
    const s5 = blankState({ round: 5, energyOverride: 10 });
    expect(beginTurn(s5, 0, testRegistry).state.players[0].energy).toBe(10);
  });

  it('falls back to the round number when unset', () => {
    const s = blankState({ round: 3 });
    expect(beginTurn(s, 0, testRegistry).state.players[0].energy).toBe(3);
  });

  // Regression: `initGame` runs round 1's `beginTurn` internally, BEFORE Adventure's
  // CombatView gets a chance to set `energyOverride` on the returned state — so the
  // opening player's energy must also be patched directly, not just the field.
  it("patching energyOverride after initGame still needs the opening player's energy fixed up directly", () => {
    const deck = makeDeck(tenVanilla);
    const state = initGame({ registry: testRegistry, decks: [deck, deck], seed: 1 });
    expect(state.players[state.active].energy).toBe(1); // round 1, no override applied yet

    // The exact patch CombatView.tsx applies after buildEncounterState.
    state.energyOverride = 10;
    state.players[state.active].energy = 10;
    expect(state.players[state.active].energy).toBe(10);

    // Every subsequent turn reads the override live, no further patching needed.
    const next = beginTurn(state, state.active === 0 ? 1 : 0, testRegistry).state;
    expect(next.players[next.active].energy).toBe(10);
  });
});

describe('PlayerState.turnCardMod', () => {
  it('extraDraws draws additional cards beyond the normal one-per-turn', () => {
    const s = blankState();
    s.players[0].deck = Array.from({ length: 5 }, (_, i) => ({ iid: `c${i}`, cardId: 'v0' }));
    s.players[0].turnCardMod = { extraDraws: 2 };
    const res = beginTurn(s, 0, testRegistry);
    // 1 normal + 2 extra = 3 drawn, 2 left in library.
    expect(res.state.players[0].deck.length).toBe(2);
    expect(res.state.players[0].hand.length).toBe(3);
  });

  it('millSelf mills from the top of the deck without adding to hand', () => {
    const s = blankState();
    s.players[0].deck = Array.from({ length: 5 }, (_, i) => ({ iid: `c${i}`, cardId: 'v0' }));
    s.players[0].turnCardMod = { millSelf: 1 };
    const res = beginTurn(s, 0, testRegistry);
    // 1 normal draw + 1 milled = 3 left in library; hand grows by 1 only (the draw).
    // Milled cards are removed from the deck entirely, same as the `forget` effect
    // (they don't land in discard) — matches the existing engine convention.
    expect(res.state.players[0].deck.length).toBe(3);
    expect(res.state.players[0].hand.length).toBe(1);
    expect(res.events.some((e) => e.t === 'forget' && e.player === 0)).toBe(true);
  });

  it('only applies to the player whose turn is beginning', () => {
    const s = blankState();
    s.players[1].deck = Array.from({ length: 5 }, (_, i) => ({ iid: `c${i}`, cardId: 'v0' }));
    s.players[1].turnCardMod = { extraDraws: 3 };
    const res = beginTurn(s, 0, testRegistry); // player 0's turn, not player 1's
    expect(res.state.players[1].deck.length).toBe(5); // untouched
  });
});

describe('millCards', () => {
  it('clamps to the deck length and emits one forget event per card', () => {
    const s = blankState();
    s.players[0].deck = [{ iid: 'a', cardId: 'v0' }, { iid: 'b', cardId: 'v1' }];
    const events: import('@engine/events').GameEvent[] = [];
    millCards(s, 0, 5, events); // ask for more than available
    expect(s.players[0].deck.length).toBe(0);
    expect(events.filter((e) => e.t === 'forget').length).toBe(2);
  });
});
