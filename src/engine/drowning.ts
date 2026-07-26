/**
 * Water drowning: the single rule for who can stand in the Water lane.
 *
 * Lives in its own module because BOTH `board.ts` (unit relocation) and
 * `environment.ts` (lane grants that can add/remove Aquatic) must reconcile it, and
 * board.ts already imports environment.ts — importing back would be a cycle.
 */
import type { LaneId } from '@engine/constants';
import type { UnitInstance } from '@engine/types';

/** A unit may stand in Water if it swims or flies. */
export const waterCompatible = (unit: UnitInstance): boolean =>
  Boolean(unit.keywords.aquatic) || Boolean(unit.keywords.airborne);

/**
 * Add to a unit's attack in a way that survives drowning.
 *
 * While drowning, `attack` is pinned at 0 and the unit's REAL attack lives in
 * `predrownAttack`. That makes `predrownAttack` a shadow copy every attack-writing path has
 * to know about — and none did, so buffs and Foundation grants applied to a drowning unit
 * either vanished on surfacing or (worse) pushed `attack` above 0 while still drowning,
 * breaking the invariant the whole model rests on. Route attack changes through here instead
 * of touching `attack` directly.
 */
export const addAttack = (unit: UnitInstance, delta: number): void => {
  if (unit.status.drowning) unit.predrownAttack = Math.max(0, (unit.predrownAttack ?? 0) + delta);
  else unit.attack = Math.max(0, unit.attack + delta);
};

/**
 * Reconcile a unit's Water `drowning` state against its current lane and keywords.
 * A non-water-walker in Water drowns (attack zeroed, remembered in `predrownAttack`);
 * gaining Aquatic/Airborne — or leaving Water — restores it, including anything gained
 * while it was under (see `addAttack`).
 *
 * Idempotent, so it is safe to call on every lane refresh.
 */
export const reconcileDrowning = (unit: UnitInstance, lane: LaneId): void => {
  const shouldDrown = lane === 'water' && !waterCompatible(unit);
  if (shouldDrown && !unit.status.drowning) {
    unit.status.drowning = true;
    unit.predrownAttack = unit.attack;
    unit.attack = 0;
  } else if (!shouldDrown && unit.status.drowning) {
    delete unit.status.drowning;
    unit.attack = unit.predrownAttack ?? unit.attack;
    unit.predrownAttack = undefined;
  }
};
