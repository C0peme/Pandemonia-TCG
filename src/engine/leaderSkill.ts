/**
 * Leader Skill (hero power) usage rules — the single source of truth for "can this player
 * cast their skill right now?", shared by the reducer, `legalActions`, the AI and the UI.
 *
 * Two kinds of skill, decided purely by the shape of the cost:
 *
 *  - ELEMENTAL (the cost has element pips): REPEATABLE. Cast it as many times per turn as
 *    you can pay for. The pips are paid from the element BANK ONLY — unlike a card's pips
 *    (energy.ts `settleCost`), a skill's shortfall does NOT fall back to generic energy.
 *    That gate is what bounds repetition: the bank only fills from leftover energy at
 *    end of turn and is capped per element by the leader's `elementCaps`, so a skill
 *    costing N pips of element E fires at most floor(cap[E] / N) times a turn, and every
 *    cast was paid for by energy a previous turn chose not to spend.
 *  - REGULAR (energy only, no pips): ONCE PER TURN, as skills always were. Orsyric's
 *    rushdown Mind Whip is the one standard leader kept on this model — it wants energy
 *    on curve from round 1, not a bank it has to wait for.
 *
 * Every pip has amount >= 1 (schema), so a repeatable skill always consumes something
 * finite: no skill can be cast unboundedly, and no AI/driver loop can spin on one.
 */
import type { Leader } from '@cards/schema';
import type { Element } from '@engine/constants';
import { canAfford, type AffordResult } from '@engine/energy';
import type { PlayerState } from '@engine/types';

type HeroPower = Leader['heroPower'];

/** Elemental skills repeat; energy-only skills are once per turn. */
export const isRepeatableSkill = (hp: HeroPower): boolean => (hp.cost.elements?.length ?? 0) > 0;

/** The skill's element pips summed per element (an author may list one element twice). */
export const skillPips = (hp: HeroPower): Partial<Record<Element, number>> => {
  const out: Partial<Record<Element, number>> = {};
  for (const req of hp.cost.elements ?? []) out[req.type] = (out[req.type] ?? 0) + req.amount;
  return out;
};

/** Whether the active player may cast `hp` right now (once-per-turn, bank gate, energy, HP). */
export const canUseSkill = (player: PlayerState, hp: HeroPower): AffordResult => {
  if (!isRepeatableSkill(hp) && player.heroPowerUsed) return { ok: false, reason: 'Leader Skill already used this turn' };
  for (const [el, amount] of Object.entries(skillPips(hp)) as Array<[Element, number]>) {
    if (player.bank[el] < amount) return { ok: false, reason: `Need ${amount} banked ${el} (have ${player.bank[el]})` };
  }
  // With every pip covered by the bank, `canAfford` only has the generic part left to check.
  const afford = canAfford(player, hp.cost);
  if (!afford.ok) return afford;
  // The HP cost cannot be self-lethal: the leader must have strictly more HP than it.
  const hpCost = hp.hpCost ?? 0;
  if (hpCost > 0 && player.leaderHp <= hpCost) return { ok: false, reason: 'Not enough HP to pay the Leader Skill' };
  return { ok: true };
};

/**
 * How many more times this turn the player could cast `hp` on resources alone (ignoring
 * targets). 0 or 1 for a regular skill; bounded by bank, energy and HP for an elemental one.
 */
export const skillCastsAvailable = (player: PlayerState, hp: HeroPower): number => {
  if (!canUseSkill(player, hp).ok) return 0;
  if (!isRepeatableSkill(hp)) return 1;
  let n = Infinity;
  for (const [el, amount] of Object.entries(skillPips(hp)) as Array<[Element, number]>) n = Math.min(n, Math.floor(player.bank[el] / amount));
  if (hp.cost.energy > 0) n = Math.min(n, Math.floor(player.energy / hp.cost.energy));
  if (hp.hpCost) n = Math.min(n, Math.floor((player.leaderHp - 1) / hp.hpCost));
  return Math.max(0, n);
};
