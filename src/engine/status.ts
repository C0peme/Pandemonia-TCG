/**
 * The single source of truth for STATUSES.
 *
 * Why this module exists
 * ----------------------
 * Statuses grew in two waves and ended up in two different places on `UnitInstance`:
 *   - `unit.status` (StatusState): burn, poisoned, sleep/sleepHeal, freeze, drowning
 *   - `unit.keywords`:             shield, zombified, trueShield, taunt
 * Nothing described which was which, so every caller re-derived it by hand — and got it
 * wrong. Two shipped bugs came from exactly that: `cleanse` did `status = {}` (missing the
 * keyword-backed ones, and clobbering positional `drowning`), and the Immunity gate had
 * Zombified — a REVIVE, i.e. a buff — listed as harmful, so you could not Zombify your own
 * Immune unit.
 *
 * The fix is not to move the live state (combat, mitigate, the AI, the UI and serialization
 * all read those fields directly). It is to make the CLASSIFICATION and the apply/clear paths
 * live in one table, so adding a status means adding a row here rather than remembering to
 * update a scattered set of `if` chains.
 *
 * Adding a status: add a row to STATUS_SPECS, then handle its payload in `applyStatus`.
 * `harmful` and `cleansable` are then automatically correct everywhere.
 */
import { RULES } from '@engine/constants';
import type { GameEvent } from '@engine/events';
import type { UnitInstance } from '@engine/types';

/** Every status an effect can name (mirrors the `status` enum in the card schema). */
export type StatusKind = 'burn' | 'poison' | 'sleep' | 'freeze' | 'shield' | 'zombified' | 'trueShield' | 'taunt';

/** Statuses stored in `unit.status` that this module owns. Excludes `drowning` — see below. */
export type StateBackedStatus = 'burn' | 'poison' | 'sleep' | 'freeze';

interface StatusSpec {
  /** Where the live value lives. Determines how apply/clear must touch the unit. */
  backing: 'state' | 'keyword';
  /**
   * Harmful statuses are blocked by Immunity. Beneficial ones pass through — including onto
   * your own Immune units, which is the whole point of e.g. shielding an immune leader-unit.
   */
  harmful: boolean;
  /**
   * Removable by `cleanse`. Only afflictions qualify:
   *  - Beneficial statuses are excluded because cleanse is cast on your OWN unit; stripping
   *    its Shield or Zombified revive would be perverse.
   *  - `drowning` is excluded because it is POSITIONAL, not an affliction — it is owned by
   *    `drowning.ts` (paired with `predrownAttack`) and only lane changes or gaining
   *    Aquatic/Airborne may clear it. You cannot purify being underwater.
   */
  cleansable: boolean;
}

export const STATUS_SPECS: Readonly<Record<StatusKind, StatusSpec>> = {
  burn: { backing: 'state', harmful: true, cleansable: true },
  poison: { backing: 'state', harmful: true, cleansable: true },
  sleep: { backing: 'state', harmful: true, cleansable: true },
  freeze: { backing: 'state', harmful: true, cleansable: true },
  // Beneficial, keyword-backed. Zombified revives the unit once at 1 HP when destroyed
  // (see ABILITY_INFO) — a buff, despite once being grouped with the afflictions.
  shield: { backing: 'keyword', harmful: false, cleansable: false },
  zombified: { backing: 'keyword', harmful: false, cleansable: false },
  trueShield: { backing: 'keyword', harmful: false, cleansable: false },
  taunt: { backing: 'keyword', harmful: false, cleansable: false },
};

export const isHarmfulStatus = (status: StatusKind): boolean => STATUS_SPECS[status].harmful;
export const isCleansableStatus = (status: StatusKind): boolean => STATUS_SPECS[status].cleansable;

export interface StatusParams {
  /** Burn damage per proc. */
  burn?: number;
  /** Poison damage per tick (stacks additively with any existing poison). */
  poison?: number;
  /** HP healed per turn while asleep. */
  sleepHeal?: number;
  /** Shield instances to add. */
  shield?: number;
}

/**
 * Apply a status of any backing. Returns nothing; pushes a `statusApplied` event.
 *
 * State-backed statuses are mutually exclusive with each other (Sleep and Freeze being the
 * one permitted pairing), so applying one clears the rest. Poison is the exception that
 * accumulates rather than replaces. Keyword-backed statuses are independent and simply layer
 * on — they never disturb the exclusive group.
 */
export const applyStatus = (
  u: UnitInstance,
  status: StatusKind,
  params: StatusParams,
  events: GameEvent[],
): void => {
  if (STATUS_SPECS[status].backing === 'keyword') {
    switch (status) {
      case 'shield': {
        const add = params.shield ?? 1;
        u.keywords.shield = (u.keywords.shield ?? 0) + add;
        u.shield = (u.shield ?? 0) + add;
        break;
      }
      case 'zombified':
        u.keywords.zombified = true;
        break;
      case 'trueShield':
        u.keywords.trueShield = true;
        break;
      case 'taunt':
        u.keywords.taunt = true;
        break;
    }
    events.push({ t: 'statusApplied', iid: u.iid, status, victim: u.owner });
    return;
  }

  // --- State-backed: the mutually-exclusive affliction group -----------------------
  // Poison stacks, so capture it before the clear so re-application accumulates.
  const prevPoison = u.status.poisoned ?? 0;
  const keepSleep = status === 'freeze';
  const keepFreeze = status === 'sleep';
  delete u.status.burn;
  delete u.status.poisoned;
  if (!keepSleep) {
    delete u.status.sleep;
    delete u.status.sleepHeal;
  }
  if (!keepFreeze) delete u.status.freeze;

  switch (status) {
    case 'burn':
      u.status.burn = params.burn ?? 1;
      break;
    case 'poison':
      u.status.poisoned = prevPoison + (params.poison ?? RULES.POISON_DAMAGE);
      break;
    case 'sleep':
      u.status.sleep = RULES.SLEEP_DURATION;
      u.status.sleepHeal = params.sleepHeal ?? 0;
      break;
    case 'freeze':
      u.status.freeze = RULES.FREEZE_DURATION;
      break;
  }
  events.push({ t: 'statusApplied', iid: u.iid, status, victim: u.owner });
};

/**
 * Remove every cleansable status, across BOTH backing stores.
 *
 * Deliberately preserves `drowning` (positional — see StatusSpec.cleansable) and every
 * beneficial status. This is the one function `cleanse` should call: it cannot miss a
 * keyword-backed status the way a bare `unit.status = {}` did.
 */
export const clearCleansableStatuses = (u: UnitInstance): void => {
  const { drowning } = u.status;
  u.status = drowning ? { drowning } : {};
  for (const status of Object.keys(STATUS_SPECS) as StatusKind[]) {
    if (STATUS_SPECS[status].backing === 'keyword' && STATUS_SPECS[status].cleansable) {
      delete u.keywords[status as 'zombified' | 'trueShield' | 'taunt'];
    }
  }
};

/**
 * Wake a unit that is HIT, clearing Sleep/Freeze, and report whether Freeze absorbed the blow.
 *
 * "Hit" means a unit attack OR damage dealt by a card effect — a spell is a hit from a card, so
 * both route through here. Freeze normally blocks one hit; pass `pierce = true` to skip the
 * block. That is the shared meaning of piercing: the `pierce` KEYWORD supplies it on a unit
 * (which also makes it strike the deepest target), and the `pierce` FLAG supplies it on a damage
 * effect (where the target is already chosen explicitly, so only the defence-piercing half
 * applies).
 *
 * Freeze protecting its victim is deliberate — it is why a deck that freezes needs a piercing
 * answer to follow up, rather than freeze being a strict upgrade over doing nothing.
 */
export const wakeOnHit = (
  target: UnitInstance,
  pierce: boolean,
  events: GameEvent[],
  incoming = 0,
): boolean => {
  let frozenBlock = false;
  if (target.status.freeze) {
    target.status.freeze = 0;
    if (!pierce) {
      frozenBlock = true;
      events.push({ t: 'blocked', iid: target.iid, source: 'freeze', amount: incoming, victim: target.owner });
    }
    events.push({ t: 'wake', iid: target.iid, from: 'freeze' });
  }
  if (target.status.sleep) {
    target.status.sleep = 0;
    delete target.status.sleepHeal;
    events.push({ t: 'wake', iid: target.iid, from: 'sleep' });
  }
  return frozenBlock;
};
