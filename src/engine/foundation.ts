/**
 * Foundation stacking: a Foundation card sits beneath a unit and grants it stats and
 * keywords. If the Foundation is destroyed (e.g. by Undershot) the host immediately
 * loses what the Foundation provided. If the host dies, the Foundation goes with it.
 */
import type { FoundationCard } from '@cards/schema';
import type { LaneId } from '@engine/constants';
import { addAttack, reconcileDrowning } from '@engine/drowning';
import type { FoundationInstance, UnitInstance } from '@engine/types';

type KwRecord = Record<string, unknown>;

/** Append granted triggered effects to a host array, returning how many were added. */
const appendTriggers = (host: UnitInstance, key: 'onAttack' | 'endOfTurn' | 'startOfTurn', granted?: unknown[]): number => {
  if (!granted?.length) return 0;
  const existing = host[key] ?? [];
  host[key] = [...existing, ...structuredClone(granted) as never[]];
  return granted.length;
};

/**
 * Attach a Foundation's grants to a host unit; returns the FoundationInstance.
 *
 * Pass `lane` so Water compatibility is re-reconciled: Foundations like Tidal Dock and
 * Fred's Boat grant Aquatic (Roost Nest grants Airborne), and without this the host kept
 * drowning at 0 attack while visibly holding the keyword that should have saved it — the
 * grant did nothing in the one lane it exists for.
 */
export const applyFoundation = (
  host: UnitInstance,
  card: FoundationCard,
  iid: string,
  lane?: LaneId,
): FoundationInstance => {
  const stat = card.grants.stat ?? {};
  const kw = (card.grants.keywords ?? {}) as KwRecord;

  // Drowning-aware: a granted attack bonus must not push a submerged unit above 0.
  addAttack(host, stat.attack ?? 0);
  host.maxHp += stat.hp ?? 0;
  host.hp += stat.hp ?? 0;

  const appliedKeywordKeys: string[] = [];
  const hostKw = host.keywords as KwRecord;
  let appliedShield = 0;
  for (const key of Object.keys(kw)) {
    if (hostKw[key] === undefined) {
      hostKw[key] = kw[key];
      appliedKeywordKeys.push(key);
      if (key === 'shield') {
        appliedShield = card.grants.keywords?.shield ?? 0;
        host.shield = (host.shield ?? 0) + appliedShield;
      }
    }
  }

  // Grant an on-hit status package only if the host has none of its own.
  let appliedOnHit = false;
  if (card.grants.onHit && !host.onHit) {
    host.onHit = { ...card.grants.onHit };
    appliedOnHit = true;
  }

  // Append granted triggered effects onto the host's live arrays (they fire through the
  // normal trigger machinery). Counts are stored so reversion can splice exactly these off.
  const appliedTriggers = {
    onAttack: appendTriggers(host, 'onAttack', card.grants.onAttack),
    endOfTurn: appendTriggers(host, 'endOfTurn', card.grants.endOfTurn),
    startOfTurn: appendTriggers(host, 'startOfTurn', card.grants.startOfTurn),
  };

  // Aquatic/Airborne may have just been granted — re-decide whether the host still drowns.
  if (lane) reconcileDrowning(host, lane);

  return {
    iid,
    cardId: card.id,
    hp: card.hp,
    appliedStat: { attack: stat.attack ?? 0, hp: stat.hp ?? 0 },
    appliedKeywordKeys,
    appliedShield,
    appliedOnHit,
    appliedTriggers,
  };
};

/**
 * Remove a Foundation's grants from its host (Foundation destroyed but host alive).
 * Pass `lane` so a host that was only staying afloat on a granted Aquatic/Airborne starts
 * drowning the moment the Foundation beneath it is destroyed.
 */
export const revertFoundation = (host: UnitInstance, f: FoundationInstance, lane?: LaneId): void => {
  addAttack(host, -(f.appliedStat.attack ?? 0));
  host.maxHp = Math.max(1, host.maxHp - (f.appliedStat.hp ?? 0));
  host.hp = Math.min(host.hp, host.maxHp);
  const hostKw = host.keywords as KwRecord;
  for (const key of f.appliedKeywordKeys) {
    if (key === 'shield') {
      // Subtract only what this Foundation granted, preserving shields from other sources.
      const remaining = (host.shield ?? 0) - (f.appliedShield ?? 0);
      if (remaining > 0) { host.shield = remaining; hostKw.shield = remaining; }
      else { host.shield = undefined; delete hostKw.shield; }
    } else {
      delete hostKw[key];
    }
  }
  if (f.appliedOnHit) host.onHit = undefined;
  // Splice the granted triggered effects off the END of each array (foundations are the only
  // runtime appender, so the granted effects remain the last N entries).
  const at = f.appliedTriggers;
  if (at) {
    if (at.onAttack && host.onAttack) host.onAttack.splice(host.onAttack.length - at.onAttack, at.onAttack);
    if (at.endOfTurn && host.endOfTurn) host.endOfTurn.splice(host.endOfTurn.length - at.endOfTurn, at.endOfTurn);
    if (at.startOfTurn && host.startOfTurn) host.startOfTurn.splice(host.startOfTurn.length - at.startOfTurn, at.startOfTurn);
  }
  host.foundation = undefined;
  // The host may have just lost the Aquatic/Airborne that was keeping it afloat.
  if (lane) reconcileDrowning(host, lane);
};
