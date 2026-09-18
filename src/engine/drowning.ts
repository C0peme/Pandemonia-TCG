/**
 * Water drowning: the single rule for who can stand in the Water lane.
 *
 * Lives in its own module because BOTH `board.ts` (unit relocation) and
 * `environment.ts` (lane grants that can add/remove Aquatic) must reconcile it, and
 * board.ts already imports environment.ts — importing back would be a cycle.
 */
import { isWater, type LaneId, type LaneLayout } from '@engine/constants';
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
 * Read a unit's REAL attack — what it hits for now, or would hit for if it surfaced.
 *
 * The counterpart to `addAttack` for the read side: any caller deriving a NEW attack value
 * from the current one (`setStats`, Metamorphosis) must start from the live store, or it
 * silently computes off the pinned 0 while the unit is under.
 */
export const liveAttack = (unit: UnitInstance): number =>
  unit.status.drowning ? (unit.predrownAttack ?? 0) : unit.attack;

/**
 * Overwrite a unit's attack in a way that survives drowning.
 *
 * Same shadow-store rule as `addAttack`, for the paths that assign an absolute value rather
 * than a delta (`setStats`, Metamorphosis). Writing `attack` directly on a submerged unit
 * both breaks the "0 attack while under" invariant AND loses the write, because surfacing
 * restores the stale `predrownAttack` over the top of it.
 */
export const setAttack = (unit: UnitInstance, value: number): void => {
  const next = Math.max(0, value);
  if (unit.status.drowning) unit.predrownAttack = next;
  else unit.attack = next;
};

/**
 * Reconcile a unit's Water `drowning` state against its current lane and keywords.
 * A non-water-walker in Water drowns (attack zeroed, remembered in `predrownAttack`);
 * gaining Aquatic/Airborne — or leaving Water — restores it, including anything gained
 * while it was under (see `addAttack`).
 *
 * Idempotent, so it is safe to call on every lane refresh.
 *
 * `layout` is the fight's lane layout (`GameState.laneTypes`) — a re-laid board can make a
 * column Water that normally is not, and vice versa, so every caller that has a state in
 * hand must pass it or a relocated unit will drown (or surface) against the printed board
 * instead of the one being played.
 */
export const reconcileDrowning = (unit: UnitInstance, lane: LaneId, layout?: LaneLayout): void => {
  const shouldDrown = isWater(lane, layout) && !waterCompatible(unit);
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
