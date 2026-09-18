/**
 * Persistent Environment keyword grants. A lane's (shared) Environment grants its
 * `grantKeywords` to every unit in that lane column — BOTH players' units — for as long
 * as it stays in play. Grants are (re)applied at combat time and on unit entry.
 *
 * Like Foundation grants (see foundation.ts), a grant only takes effect if the unit does
 * not already carry that keyword — a unit's own/foundation keywords are never clobbered.
 * The keys actually added are tracked on the unit so they can be cleanly reverted.
 */
import { LANES, isWater, type LaneId } from '@engine/constants';
import type { Keywords } from '@cards/schema';
import type { Registry } from '@cards/registry';
import type { GameState, UnitInstance } from '@engine/types';
import { reconcileDrowning } from '@engine/drowning';

type KwRecord = Record<string, unknown>;

/** Remove any keywords this unit previously received from a lane Environment. */
const revertEnvKeywords = (unit: UnitInstance): void => {
  const unitKw = unit.keywords as KwRecord;
  for (const key of unit.envKeywordKeys ?? []) {
    if (key === 'shield') {
      // Subtract only what the Environment granted, preserving shields from other sources.
      const remaining = (unit.shield ?? 0) - (unit.envShield ?? 0);
      if (remaining > 0) { unit.shield = remaining; unitKw.shield = remaining; }
      else { unit.shield = undefined; delete unitKw.shield; }
    } else {
      delete unitKw[key];
    }
  }
  unit.envKeywordKeys = undefined;
  unit.envShield = undefined;
};

/** Add an Environment's granted keywords to a unit (without overwriting existing ones). */
const applyEnvKeywords = (unit: UnitInstance, grants: Keywords): void => {
  const grantKw = grants as KwRecord;
  const unitKw = unit.keywords as KwRecord;
  const keys: string[] = [];
  for (const key of Object.keys(grantKw)) {
    if (unitKw[key] === undefined) {
      unitKw[key] = grantKw[key];
      keys.push(key);
      if (key === 'shield') {
        unit.envShield = (grantKw.shield as number) ?? 0;
        unit.shield = (unit.shield ?? 0) + unit.envShield;
      }
    }
  }
  unit.envKeywordKeys = keys.length ? keys : undefined;
};

/** Both players' units in the given lane column. */
const unitsInLaneColumn = (state: GameState, laneId: LaneId): UnitInstance[] =>
  ([0, 1] as const).flatMap((pid) =>
    [state.players[pid].lanes[laneId].front, state.players[pid].lanes[laneId].back].filter(
      (u): u is UnitInstance => Boolean(u),
    ),
  );

/**
 * Reconcile one lane column with its (shared) Environment grant: strip any previously
 * granted keywords from both sides' units, then re-apply the current Environment's grants
 * to all of them (if any). Idempotent.
 */
export const refreshLaneEnvironment = (registry: Registry, state: GameState, laneId: LaneId): void => {
  const units = unitsInLaneColumn(state, laneId);
  const env = state.environments[laneId];
  // Skip lanes with no work: no units, or no environment and no leftover grants to strip.
  if (units.length === 0) return;
  if (!env && !units.some((u) => u.envKeywordKeys)) return;

  for (const unit of units) revertEnvKeywords(unit);
  const def = env ? registry.cards.get(env.cardId) : undefined;
  if (def?.type === 'environment' && def.grantKeywords) {
    for (const unit of units) applyEnvKeywords(unit, def.grantKeywords);
  }
  // Grants can add or remove Aquatic, which decides who drowns in Water — so the
  // drowning state has to be reconciled whenever they change, not just on entry.
  if (isWater(laneId, state.laneTypes)) for (const unit of units) reconcileDrowning(unit, laneId, state.laneTypes);
};

/** Reconcile every lane column on the board with its Environment grants. */
export const refreshEnvironmentGrants = (registry: Registry, state: GameState): void => {
  for (const laneId of LANES) refreshLaneEnvironment(registry, state, laneId);
};
