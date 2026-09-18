/**
 * Energy & banking — the revised cost model (see docs/build-plan.md).
 *
 * - The turn's universal `energy` pays a card's generic `cost.energy` and counts as
 *   any element for the generic portion.
 * - A card's optional element-specific cost is paid ONLY from BANKED element energy
 *   (Option A): banking is the "heavy investment" route to element-specialized cards.
 * - Banking has no global cap; each element is capped individually by the player's
 *   per-element caps (`player.elementCaps`), which come from their leader.
 */
import type { Cost } from '@cards/schema';
import type { Element } from '@engine/constants';
import { ELEMENTS, RULES } from '@engine/constants';
import type { PlayerState } from '@engine/types';

export const bankTotal = (bank: Record<Element, number>): number =>
  ELEMENTS.reduce((sum, el) => sum + bank[el], 0);

export interface AffordResult {
  ok: boolean;
  reason?: string;
}

export const canAfford = (player: PlayerState, cost: Cost): AffordResult => {
  if (player.energy < cost.energy) {
    return { ok: false, reason: `Need ${cost.energy} energy, have ${player.energy}` };
  }
  for (const req of cost.elements ?? []) {
    const have = player.bank[req.type];
    if (have < req.amount) {
      return {
        ok: false,
        reason: `Need ${req.amount} banked ${req.type}, have ${have}`,
      };
    }
  }
  return { ok: true };
};

/** Returns a new PlayerState with the cost deducted. Caller must check canAfford first. */
export const payCost = (player: PlayerState, cost: Cost): PlayerState => {
  const bank = { ...player.bank };
  for (const req of cost.elements ?? []) {
    bank[req.type] -= req.amount;
  }
  return { ...player, energy: player.energy - cost.energy, bank };
};

export interface BankResult {
  bank: Record<Element, number>;
  applied: Partial<Record<Element, number>>;
}

/**
 * Apply an end-of-turn banking choice, overflowing leftover energy into the chosen
 * elements. Each request is CLAMPED to what actually fits — per element it can't exceed the
 * player's cap (`elementCaps`), and the running total can't exceed leftover `energy` (nor
 * `PER_TURN_BANK_LIMIT` when set). Banking never fails: anything that doesn't fit is dropped
 * (the leftover energy would be lost at end of turn anyway).
 *
 * Clamping (rather than rejecting) matters because Producers bank into these same elements
 * during end-of-turn resolution, which runs BEFORE banking — so a near-cap element must not
 * turn "producer output + a banking choice" into a turn-ending error.
 */
export const applyBanking = (
  player: PlayerState,
  choice: Partial<Record<Element, number>>,
): BankResult => {
  const applied: Partial<Record<Element, number>> = {};
  const bank = { ...player.bank };
  let budget = player.energy; // can't bank more than the energy left over this turn
  if (RULES.PER_TURN_BANK_LIMIT !== null) budget = Math.min(budget, RULES.PER_TURN_BANK_LIMIT);
  for (const el of ELEMENTS) {
    if (budget <= 0) break;
    const want = choice[el] ?? 0;
    if (want <= 0) continue; // zero / negative requests contribute nothing
    const room = player.elementCaps[el] - bank[el];
    const add = Math.min(want, room, budget);
    if (add > 0) {
      bank[el] += add;
      applied[el] = add;
      budget -= add;
    }
  }
  return { bank, applied };
};
