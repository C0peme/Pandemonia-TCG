/**
 * Turn-begin logic, shared by game setup and end-of-turn handoff.
 * Sets the turn's universal energy, resets per-turn flags, runs conditions, and draws.
 */
import { RULES } from '@engine/constants';
import { drawCard } from '@engine/draw';
import { millCards } from '@engine/hand';
import { resolveStartOfTurn } from '@engine/endOfTurn';
import type { GameEvent } from '@engine/events';
import { grantSignatureIfRoom } from '@engine/signature';
import { resolveDeckRaid } from '@engine/raid';
import type { GameState, PlayerId } from '@engine/types';
import type { Registry } from '@cards/registry';

/**
 * Set energy for the round, reset per-turn flags, resolve start-of-turn effects, and
 * draw for the active player. (Persistent end-of-turn effects — Burn, Poison, Sleep,
 * Growth, etc. — resolve at the END of the active player's turn, in `endTurn`, so a
 * status applied to a unit survives until after that unit's own Declare Attack.)
 */
export const beginTurn = (state: GameState, player: PlayerId, registry?: Registry): { state: GameState; events: GameEvent[] } => {
  const events: GameEvent[] = [{ t: 'turnStart', player, round: state.round }];
  const p = state.players[player];

  // Universal energy for the turn equals the current round number, unless a boss curse
  // (Adventure only) fixes it to a constant. `energyNext` (queued by Producers and
  // Cancerous Growth) is added on top and consumed here — it is a one-turn carry, so it
  // must be cleared in the same breath or it would repeat every round.
  const updated = {
    ...p,
    // Clamped: `energyNext` can be NEGATIVE (Cancerous Growth borrows against next round),
    // and a stacked debt must never drive the turn's energy below zero.
    energy: Math.max(0, (state.energyOverride ?? state.round) + (p.energyNext ?? 0)),
    energyNext: 0,
    heroPowerUsed: false,
    deck: [...p.deck],
    hand: [...p.hand],
    lanes: structuredClone(p.lanes),
  };
  let next: GameState = { ...state, players: { ...state.players, [player]: updated } };

  // Start-of-turn effects: expire True Shield (it held through the opponent's turn) and
  // fire any `startOfTurn` healers.
  resolveStartOfTurn(next, player, events, registry);

  // Draw step (Null on deck-out).
  for (let i = 0; i < RULES.DRAW_PER_TURN; i++) drawCard(next, player, events);

  // Boss-curse per-turn card modifiers (Adventure only): extra draws, then a self-mill.
  if (updated.turnCardMod?.extraDraws) {
    for (let i = 0; i < updated.turnCardMod.extraDraws; i++) drawCard(next, player, events);
  }
  if (updated.turnCardMod?.millSelf) {
    millCards(next, player, updated.turnCardMod.millSelf, events);
  }

  // Per-turn deck raid (Adventure endgame): plunder a random pool for cards AND a fresh
  // signature. Runs BEFORE the delivery below so the new signature is the one granted.
  resolveDeckRaid(next, player, events);

  // Deliver a pending Signature card if the hand now has room.
  grantSignatureIfRoom(next, player, events);
  return { state: next, events };
};
