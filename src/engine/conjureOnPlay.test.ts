/**
 * Corpselock's Signature machinery: the per-play conjure trigger and the per-copy hand
 * discount.
 *
 * The bound is the point of most of these. "Playing a card conjures a card" plus "the
 * cards in your hand cost 0" is a genuine infinite loop — the 10-card hand cap limits what
 * you HOLD, not how many times the cycle runs, so an unbounded trigger never terminates
 * and the AI's search would ride it forever.
 */
import { describe, expect, it } from 'vitest';
import { applyAction, legalActions, costModFor } from '@engine/engine';
import { blankState, testRegistry, makeDeck, tenVanilla } from '@engine/testkit';
import { initGame } from '@engine/setup';
import { beginTurn } from '@engine/turn';
import { RULES } from '@engine/constants';
import { applyEffects } from '@engine/effects';
import type { GameEvent } from '@engine/events';
import type { GameState } from '@engine/types';

const armed = (perTurn?: number): GameState => {
  const s = blankState();
  const events: GameEvent[] = [];
  const err = applyEffects(
    s, 0,
    [{ kind: 'conjureOnPlay', ...(perTurn === undefined ? {} : { amount: perTurn }) }],
    [], undefined, events, testRegistry,
  );
  expect(err).toBeNull();
  return s;
};

describe('conjureOnPlay', () => {
  it('arms a bounded trigger with a non-empty pool', () => {
    const t = armed().players[0].conjureOnPlay!;
    expect(t.cardIds.length).toBeGreaterThan(0);
    expect(t.perTurn).toBe(RULES.CONJURE_ON_PLAY_PER_TURN);
    expect(t.usedThisTurn).toBe(0);
  });

  it('never puts a token, signature or system card into the pool', () => {
    const t = armed().players[0].conjureOnPlay!;
    for (const id of t.cardIds) {
      const card = testRegistry.cards.get(id)!;
      expect(id.startsWith('__')).toBe(false);
      expect(card.tags.includes('token')).toBe(false);
      expect(card.tags.includes('signature')).toBe(false);
    }
  });

  it('conjures on each card played, then STOPS at the per-turn cap', () => {
    // A real game so cards are actually playable; cheap vanillas keep the turn simple.
    let state = initGame({
      registry: testRegistry,
      decks: [makeDeck(tenVanilla), makeDeck(tenVanilla)],
      seed: 7,
      first: 0,
    });
    const events: GameEvent[] = [];
    applyEffects(state, 0, [{ kind: 'conjureOnPlay', amount: 2 }], [], undefined, events, testRegistry);
    // Free everything so the cap, not energy, is what stops the cascade.
    state.players[0].energy = 99;
    for (const c of state.players[0].hand) c.costDelta = -99;

    let conjured = 0;
    for (let i = 0; i < 6; i++) {
      const play = legalActions(testRegistry, state).find((a) => a.type === 'playUnit');
      if (!play) break;
      const res = applyAction(testRegistry, state, play);
      if ('error' in res) break;
      state = res.state;
      conjured += res.events.filter((e) => e.t === 'conjure').length;
      // Newly conjured cards are NOT discounted — the discount is per-copy, so the
      // cascade cannot make itself free.
      state.players[0].energy = 99;
    }
    expect(conjured).toBe(2);
    expect(state.players[0].conjureOnPlay!.usedThisTurn).toBe(2);
  });

  it('refills the per-turn budget at the start of the turn, keeping the trigger itself', () => {
    const s = armed(2);
    s.players[0].conjureOnPlay!.usedThisTurn = 2;
    const { state: after } = beginTurn(s, 0, testRegistry);
    expect(after.players[0].conjureOnPlay).toBeTruthy();
    expect(after.players[0].conjureOnPlay!.usedThisTurn).toBe(0);
    expect(after.players[0].conjureOnPlay!.perTurn).toBe(2);
  });

  it('advances the serializable RNG so the same seed replays identically', () => {
    const a = armed(4);
    const b = structuredClone(a);
    const evA: GameEvent[] = [];
    const evB: GameEvent[] = [];
    // Same starting state + same trigger => same conjured card and same resulting rng.
    applyEffects(a, 0, [{ kind: 'draw', amount: 0 }], [], undefined, evA, testRegistry);
    applyEffects(b, 0, [{ kind: 'draw', amount: 0 }], [], undefined, evB, testRegistry);
    expect(a.rng).toEqual(b.rng);
  });
});

describe('discountHand', () => {
  it('discounts only the copies held at the moment it resolves', () => {
    const s = blankState();
    s.players[0].hand = [
      { iid: 'h1', cardId: 'v0' },
      { iid: 'h2', cardId: 'v1' },
    ];
    const events: GameEvent[] = [];
    applyEffects(s, 0, [{ kind: 'discountHand', amount: -99 }], [], undefined, events, testRegistry);
    expect(s.players[0].hand.every((c) => c.costDelta === -99)).toBe(true);

    // A card drawn afterwards is untouched — this is exactly what a player-level
    // `costMod`/`costBase` could NOT express.
    s.players[0].hand.push({ iid: 'h3', cardId: 'v2' });
    expect(s.players[0].hand[2]!.costDelta).toBeUndefined();
  });

  it('feeds costModFor, stacking with the player-level stores', () => {
    const s = blankState();
    const player = s.players[0];
    player.costMods.spell = 1;
    player.costBase = { unit: 0, spell: -2, foundation: 0, environment: 0 };
    expect(costModFor(player, 'spell')).toBe(-1);
    expect(costModFor(player, 'spell', { costDelta: -5 })).toBe(-6);
  });

  it('leaves the opponent alone', () => {
    const s = blankState();
    s.players[0].hand = [{ iid: 'a', cardId: 'v0' }];
    s.players[1].hand = [{ iid: 'b', cardId: 'v0' }];
    const events: GameEvent[] = [];
    applyEffects(s, 0, [{ kind: 'discountHand', amount: -99 }], [], undefined, events, testRegistry);
    expect(s.players[0].hand[0]!.costDelta).toBe(-99);
    expect(s.players[1].hand[0]!.costDelta).toBeUndefined();
  });
});
