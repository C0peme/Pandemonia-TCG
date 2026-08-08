/**
 * Energy & banking — the revised cost model (see docs/build-plan.md).
 *
 * - The turn's universal `energy` pays a card's generic `cost.energy` and counts as
 *   any element for the generic portion.
 * - A card's optional element-specific cost is paid from BANKED element energy FIRST, and
 *   any shortfall falls back to the turn's generic `energy` at 1:1. So element costs are a
 *   DISCOUNT, never a gate: an ability card is cheaper when you have committed to its
 *   element, and simply costs its full face value when you have not. Nothing in a hand is
 *   ever uncastable for want of the right bank.
 * - Banking has no global cap; each element is capped individually by the player's
 *   per-element caps (`player.elementCaps`), which come from their leader.
 */
import type { Cost } from '@cards/schema';
import type { Element } from '@engine/constants';
import { RULES } from '@engine/constants';
import type { PlayerState } from '@engine/types';

export const bankTotal = (bank: Record<Element, number>): number =>
  bank.fire + bank.water + bank.nature + bank.earth;

export interface AffordResult {
  ok: boolean;
  reason?: string;
}

/**
 * How a cost actually gets paid: each element requirement draws from that element's bank
 * first, and whatever the bank cannot cover is topped up from generic `energy` at 1:1.
 * Shared by `canAfford` and `payCost` so the check and the charge can never disagree.
 */
export const settleCost = (
  player: PlayerState,
  cost: Cost,
): { energy: number; bank: Record<Element, number> } => {
  const bank = { ...player.bank };
  let energy = player.energy - cost.energy;
  for (const req of cost.elements ?? []) {
    const fromBank = Math.min(bank[req.type], req.amount);
    bank[req.type] -= fromBank;
    energy -= req.amount - fromBank; // shortfall paid in generic energy
  }
  return { energy, bank };
};

export const canAfford = (player: PlayerState, cost: Cost): AffordResult => {
  const { energy } = settleCost(player, cost);
  if (energy < 0) {
    // Report the FULL generic requirement, since the bank shortfall is payable in energy.
    const total = (cost.elements ?? []).reduce(
      (s, req) => s + Math.max(0, req.amount - player.bank[req.type]),
      cost.energy,
    );
    return { ok: false, reason: `Need ${total} energy, have ${player.energy}` };
  }
  return { ok: true };
};

/** Returns a new PlayerState with the cost deducted. Caller must check canAfford first. */
export const payCost = (player: PlayerState, cost: Cost): PlayerState => {
  const { energy, bank } = settleCost(player, cost);
  return { ...player, energy, bank };
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
 * Clamping (rather than rejecting) matters because an over-cap request must not become a
 * turn-ending error: that leaves the turn un-ended and makes the AI driver re-loop forever.
 * (Producers used to bank into these elements during end-of-turn resolution, which runs
 * BEFORE banking, and were the original source of such overflows; they now add generic
 * energy instead. Any other end-of-turn `energy` effect with a fixed element still can.)
 */
export const applyBanking = (
  player: PlayerState,
  choice: Partial<Record<Element, number>>,
): BankResult => {
  const applied: Partial<Record<Element, number>> = {};
  const bank = { ...player.bank };
  let budget = player.energy; // can't bank more than the energy left over this turn
  if (RULES.PER_TURN_BANK_LIMIT !== null) budget = Math.min(budget, RULES.PER_TURN_BANK_LIMIT);
  for (const el of ['fire', 'water', 'nature', 'earth'] as const) {
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
