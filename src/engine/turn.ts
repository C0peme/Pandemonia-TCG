/**
 * Turn-begin logic, shared by game setup and end-of-turn handoff.
 * Sets the turn's universal energy, resets per-turn flags, runs conditions, and draws.
 */
import { RULES } from '@engine/constants';
import { drawCard } from '@engine/draw';
import { nullHoldTax } from '@engine/damage';
import { millCards } from '@engine/hand';
import { resolveStartOfTurn } from '@engine/endOfTurn';
import type { GameEvent } from '@engine/events';
import { grantSignatureIfRoom } from '@engine/signature';
<<<<<<< Updated upstream
=======
import { resolveDeckRaid } from '@engine/raid';
import { resolveRoundStartRules, resolveSeal, resolveSteal } from '@engine/bossRules';
>>>>>>> Stashed changes
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
  // (Adventure only) fixes it to a constant.
  const updated = {
    ...p,
<<<<<<< Updated upstream
    energy: state.energyOverride ?? state.round,
=======
    // Clamped: `energyNext` can be NEGATIVE (Cancerous Growth borrows against next round),
    // and a stacked debt must never drive the turn's energy below zero.
    // `energyPerTurn` is a permanent per-turn bonus (Adventure relics) and is added on
    // top of whichever base applies — including a boss's `energyOverride`, so a fixed-energy
    // boss cannot silently cancel a relic the player paid a permanent price for.
    energy: Math.max(0, (state.energyOverride ?? state.round) + (p.energyNext ?? 0) + (p.energyPerTurn ?? 0)),
    energyNext: 0,
>>>>>>> Stashed changes
    heroPowerUsed: false,
    // Refill the per-turn budget for the `conjureOnPlay` trigger (Corpselock's Signature).
    // The trigger persists for the rest of the fight; only its per-turn allowance resets.
    ...(p.conjureOnPlay ? { conjureOnPlay: { ...p.conjureOnPlay, usedThisTurn: 0 } } : {}),
    deck: [...p.deck],
    hand: [...p.hand],
    lanes: structuredClone(p.lanes),
  };
  let next: GameState = { ...state, players: { ...state.players, [player]: updated } };

  // Boss rules (Adventure). Recurring placements fire at the start of a ROUND — i.e. for
  // the round's opening seat — so a rule that fills the boss's lanes has done so before
  // the player's attack step, which is the entire point of the rule.
  //
  // The INACTIVE player's lanes have to be cloned first. `updated` above only private-copies
  // the active player, on the reasonable assumption that a turn touches its own board — but
  // a placement writes to the OTHER side, and without this it writes straight through into
  // the caller's state. That aliasing made round 2 look like it had already been placed on.
  if (registry && next.active === next.first && player === next.first && next.bossRules?.placements?.length) {
    const other: PlayerId = player === 0 ? 1 : 0;
    next = {
      ...next,
      players: { ...next.players, [other]: { ...next.players[other], lanes: structuredClone(next.players[other].lanes) } },
    };
    resolveRoundStartRules(registry, next, events);
  }

  // Start-of-turn effects: expire True Shield (it held through the opponent's turn) and
  // fire any `startOfTurn` healers.
  resolveStartOfTurn(next, player, events, registry);

  // Draw step (Null on deck-out).
  for (let i = 0; i < RULES.DRAW_PER_TURN; i++) drawCard(next, player, events);

  // Nulls in hand bill their holder every turn, charged after the draw so one starts costing
  // the turn it arrives. Holding used to be free, which is why deck-out did not close games.
  nullHoldTax(next, player, events);

  // Boss-curse per-turn card modifiers (Adventure only): extra draws, then a self-mill.
  if (updated.turnCardMod?.extraDraws) {
    for (let i = 0; i < updated.turnCardMod.extraDraws; i++) drawCard(next, player, events);
  }
  if (updated.turnCardMod?.millSelf) {
    millCards(next, player, updated.turnCardMod.millSelf, events);
  }

  // Deliver a pending Signature card if the hand now has room.
  grantSignatureIfRoom(next, player, events);

  // BEHIND THE MASK, before the seal: the theft has to see the hand the player is about to
  // play from, same as the seal does, and either order is fine since they never target the
  // same card twice in one authored boss (one signature per boss).
  //
  // The RECEIVING side's PlayerState has to be private-copied first: `addCardToHand`
  // reassigns `s.players[recipient].hand` in place on the object it is given, and unless
  // the placements branch above already cloned it, that object is still the caller's own
  // — the exact aliasing bug fixed there, one level over.
  if (registry && next.bossRules?.steal === player) {
    const other: PlayerId = player === 0 ? 1 : 0;
    if (next.players[other] === state.players[other]) {
      next = { ...next, players: { ...next.players, [other]: { ...next.players[other] } } };
    }
    resolveSteal(registry, next, player, events);
  }

  // Seal LAST, against the final hand — after the draw, the curse draws, the raid and the
  // Signature delivery. Sealing before them would let the card you most wanted arrive
  // after the rule had already looked away.
  if (registry) resolveSeal(registry, next, player);
  return { state: next, events };
};
