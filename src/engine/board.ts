/**
 * Board helpers shared by combat and effects: locating units by id and clearing
 * destroyed units (promoting a Double Team back card to the front).
 */
import { LANES, type LaneId } from '@engine/constants';
import { refreshLaneEnvironment } from '@engine/environment';
import { reconcileDrowning, addAttack } from '@engine/drowning';
import { applyStatus } from '@engine/status';
import type { GameEvent } from '@engine/events';
import type { CardInstance, GameState, Lane, PlayerId, UnitInstance } from '@engine/types';
import type { Registry } from '@cards/registry';
import type { FoundationCard, OnHit, UnitCard } from '@cards/schema';

/**
 * Build a fresh in-play unit from its card definition. Shared by hand-played units
 * (engine.ts) and units created directly on the board by a `summon` effect.
 * `drowning` zeroes attack and flags the unit (a non-water-walker placed in Water).
 */
export const createUnitInstance = (
  card: UnitCard,
  instance: CardInstance,
  owner: PlayerId,
  drowning: boolean,
): UnitInstance => ({
  iid: instance.iid,
  cardId: card.id,
  owner,
  attack: drowning ? 0 : card.attack,
  hp: card.hp,
  maxHp: card.hp,
  keywords: { ...card.keywords },
  onHit: card.onHit ? { ...card.onHit } : undefined,
  onAttack: card.onAttack ? structuredClone(card.onAttack) : undefined,
  endOfTurn: card.endOfTurn ? structuredClone(card.endOfTurn) : undefined,
  startOfTurn: card.startOfTurn ? structuredClone(card.startOfTurn) : undefined,
  status: drowning ? { drowning: true } : {},
  shield: card.keywords.shield,
  // A unit that enters Water drowning keeps its base attack here so it can be restored
  // if it later leaves Water (see applyLaneEntry / relocateUnit).
  predrownAttack: drowning ? card.attack : undefined,
  turnsInPlay: 0,
  justPlaced: true,
});

/** The three body slots a unit can occupy in a lane. `foundation` is a standalone Foundation
 *  (base layer awaiting a bond); it fights as a full unit but lives outside front/back. */
export type Slot = 'front' | 'back' | 'foundation';

/** Map a body slot to its Lane field (the foundation slot uses a different key). */
const laneField = (slot: Slot): 'front' | 'back' | 'standaloneFoundation' =>
  slot === 'foundation' ? 'standaloneFoundation' : slot;

export interface UnitLocation {
  owner: PlayerId;
  lane: LaneId;
  slot: Slot;
  unit: UnitInstance;
}

export const locateUnit = (s: GameState, iid: string): UnitLocation | undefined => {
  for (const owner of [0, 1] as PlayerId[]) {
    for (const lane of LANES) {
      for (const slot of ['front', 'back', 'foundation'] as const) {
        const unit = s.players[owner].lanes[lane][laneField(slot)];
        if (unit && unit.iid === iid) return { owner, lane, slot, unit };
      }
    }
  }
  return undefined;
};

/** Every body in a lane — front, back, and a standalone Foundation — as full units.
 *  A lane never holds both a Foundation and front/back units, but including all is harmless. */
export const laneUnits = (lane: Lane): UnitInstance[] =>
  [lane.front, lane.back, lane.standaloneFoundation].filter((u): u is UnitInstance => u !== undefined);

/**
 * Remove the unit in `slot`, promoting a Double Team back-row unit to the front so the
 * lane never ends up with an occupied `back` and an empty `front` (combat reads `front`).
 */
export const vacateSlot = (lane: Lane, slot: Slot): void => {
  lane[laneField(slot)] = undefined;
  // Back-promotion only applies to the front/back ranks; the Foundation slot is independent.
  if (!lane.front && lane.back) {
    lane.front = lane.back;
    lane.back = undefined;
  }
};

/** First open slot for an incoming unit, respecting Double Team; null if the lane is full. */
const openSlotForUnit = (lane: Lane, incoming: UnitInstance): 'front' | 'back' | null => {
  if (!lane.front) return 'front';
  const doubleTeam =
    Boolean(incoming.keywords.doubleTeam) ||
    Boolean(lane.front.keywords.doubleTeam) ||
    Boolean(lane.back?.keywords.doubleTeam);
  if (!lane.back && doubleTeam) return 'back';
  return null;
};

/** Recompute Water `drowning` when a unit's lane changes (see drowning.ts). */
const applyLaneEntry = (unit: UnitInstance, destLane: LaneId): void => reconcileDrowning(unit, destLane);

/**
 * Move an in-play unit to another lane. The single shared relocation routine for the
 * `moveUnit` action, the interactive Mover (`resolvePending`), and the `move` effect: it
 * enforces Double Team capacity, promotes the vacated lane's back row, recomputes Water
 * drowning, and refreshes Environment keyword grants for both lanes. Returns an error
 * string if the destination is full, else null.
 */
export const relocateUnit = (
  registry: Registry | undefined,
  s: GameState,
  loc: UnitLocation,
  destLane: LaneId,
  events: GameEvent[],
): string | null => {
  if (destLane === loc.lane) return null; // no-op move
  const destLaneObj = s.players[loc.owner].lanes[destLane];
  // A standalone Foundation relocates as a Foundation: it can only land in the destination's
  // Foundation slot, and only if that slot is free (it stays a base layer, never a front/back body).
  if (loc.slot === 'foundation') {
    if (destLaneObj.standaloneFoundation) return `Lane ${destLane} is full`;
    vacateSlot(s.players[loc.owner].lanes[loc.lane], loc.slot);
    destLaneObj.standaloneFoundation = loc.unit;
    applyLaneEntry(loc.unit, destLane);
    events.push({ t: 'moved', iid: loc.unit.iid, lane: destLane });
    if (registry) {
      refreshLaneEnvironment(registry, s, loc.lane);
      refreshLaneEnvironment(registry, s, destLane);
    }
    return null;
  }
  const slot = openSlotForUnit(destLaneObj, loc.unit);
  if (!slot) return `Lane ${destLane} is full`;
  vacateSlot(s.players[loc.owner].lanes[loc.lane], loc.slot);
  destLaneObj[slot] = loc.unit;
  applyLaneEntry(loc.unit, destLane);
  events.push({ t: 'moved', iid: loc.unit.iid, lane: destLane });
  if (registry) {
    refreshLaneEnvironment(registry, s, loc.lane);
    refreshLaneEnvironment(registry, s, destLane);
  }
  return null;
};

/**
 * Apply a stat gain to a unit. Poison blocks all stat GAINS (Bloodbath, Growth, buff
 * spells); it does not block losses. Returns whether anything was applied.
 */
export const buffUnit = (
  u: UnitInstance,
  stat: { attack?: number; hp?: number },
  events: GameEvent[],
): boolean => {
  const dA = stat.attack ?? 0;
  const dH = stat.hp ?? 0;
  const isGain = dA > 0 || dH > 0;
  if (isGain && u.status.poisoned) return false;
  // Drowning-aware: while under, the real attack lives in `predrownAttack` (see drowning.ts).
  addAttack(u, dA);
  u.maxHp = Math.max(1, u.maxHp + dH);
  u.hp = Math.min(u.maxHp, u.hp + dH);
  events.push({ t: 'buff', iid: u.iid, attack: dA, hp: dH });
  return true;
};

/**
 * Status application lives in `status.ts` — the single table covering BOTH backing stores
 * (`unit.status` and keyword-backed). Re-exported here so existing importers keep working.
 */
export { applyStatus as applyStatusEffect, type StatusKind } from '@engine/status';

/** Apply the StatusState-backed onHit effects (burn/poison/sleep/freeze) of a strike. */
export const applyOnHitStatuses = (u: UnitInstance, oh: OnHit, events: GameEvent[]): void => {
  if (oh.burn) applyStatus(u, 'burn', { burn: oh.burn }, events);
  if (oh.poison) applyStatus(u, 'poison', { poison: typeof oh.poison === 'number' ? oh.poison : undefined }, events);
  if (oh.sleep !== undefined) applyStatus(u, 'sleep', { sleepHeal: oh.sleep }, events);
  if (oh.freeze) applyStatus(u, 'freeze', {}, events);
};

/**
 * Build a standalone Foundation as a full `UnitInstance` (flagged `isFoundation`). It occupies
 * `Lane.standaloneFoundation` and fights, takes damage/status, and is targeted through the same
 * machinery as any unit — no transient view. When a unit is later placed on top it folds into
 * that unit's `foundation` (see engine `playUnit`).
 */
export const makeFoundationUnit = (
  card: FoundationCard,
  instance: CardInstance,
  owner: PlayerId,
): UnitInstance => ({
  iid: instance.iid,
  cardId: card.id,
  owner,
  attack: card.attack,
  hp: card.hp,
  maxHp: card.hp,
  keywords: { ...card.keywords },
  onHit: card.onHit ? { ...card.onHit } : undefined,
  // A Foundation's per-turn `grants` (Producer/Healer) transfer to the unit bonded on top
  // (see applyFoundation) — a standalone Foundation carries no self-triggers, matching prior
  // behavior. Status ticks, growth, aging, etc. flow through the shared unit loops.
  status: {},
  shield: typeof card.keywords.shield === 'number' ? card.keywords.shield : undefined,
  turnsInPlay: 0,
  justPlaced: true,
  isFoundation: true,
});
