/**
 * Combat resolution — keyword-aware (Phase 1, wave 2).
 *
 * The active player's units resolve attacks left-to-right (lane order, front then
 * back). Each unit's targeting and the defender's mitigation are shaped by keywords:
 *
 *   Targeting:  Overshot, Undershot, Sniper, Branch Shot, Splash, Strike Through,
 *               Double Strike, Airborne (intercept).
 *   Defense:    Shield, True Shield, Taunt, Spike, Tough, Immunity, Lethal.
 *
 * Retaliation is a full counter-attack by ALL acting defenders in the struck lane
 * (their keywords apply), happening once per attacker even under Double Strike. A
 * unit only provokes retaliation when it strikes a unit in its OWN lane.
 *
 * Modeling notes (documented decisions, refined in later waves):
 * - Sniper auto-targets the first enemy lane with a unit (manual targeting arrives
 *   with the UI). Foundation-layer Undershot priority arrives with the stacking wave;
 *   for now Undershot hits the back (deepest) unit, else the front.
 * - True Shield is treated as "block all damage" while present on a unit.
 * - Lane retaliation is a single combined damage instance (one Shield blocks it).
 */
import { LANES, type LaneId } from '@engine/constants';
import { applyOnHitStatuses } from '@engine/board';
import { damageLeader, reconcileLeaderUnit } from '@engine/damage';
import { applyTriggeredEffects, applyEffects, processDeaths, dealUnitDamage, fireBloodlust } from '@engine/effects';
import { refreshEnvironmentGrants } from '@engine/environment';
import { revertFoundation } from '@engine/foundation';
import type { GameEvent } from '@engine/events';
import type { Registry } from '@cards/registry';
import { opponentOf, type GameState, type PlayerId, type UnitInstance } from '@engine/types';

/**
 * Burn procs right before a unit attacks or retaliates, dealing its full value each
 * time (no decay). A unit that acts repeatedly — Double Strike, retaliation — burns each
 * time. A unit that never acts takes no Burn. Burn does not expire here; its one-turn
 * lifespan ends at the owner's end of turn.
 */
const procBurn = (s: GameState, u: UnitInstance, events: GameEvent[], registry?: Registry): void => {
  if (!u.status.burn) return;
  dealUnitDamage(s, u, u.status.burn, { raw: true }, events, registry, (amount) =>
    events.push({ t: 'burnTick', iid: u.iid, amount, hpAfter: u.hp, victim: u.owner }),
  );
};

/**
 * Apply onHit status effects from the attacker onto the target.
 * Immunity blocks all onHit effects. Effects only fire when damage actually landed.
 */
const applyOnHit = (source: UnitInstance, target: UnitInstance, events: GameEvent[]): void => {
  const oh = source.onHit;
  if (!oh) return;
  if (target.keywords.immunity) return; // immunity blocks ability-sourced effects
  applyOnHitStatuses(target, oh, events);
};


/** Undershot strikes the Foundation beneath a unit (direct, defense-ignoring). */
const damageFoundation = (host: UnitInstance, source: UnitInstance, events: GameEvent[], lane?: LaneId): void => {
  const f = host.foundation;
  if (!f) return;
  f.hp -= source.attack;
  events.push({ t: 'damageUnit', iid: f.iid, amount: source.attack, hpAfter: f.hp, victim: host.owner });
  if (f.hp <= 0) {
    revertFoundation(host, f, lane); // host immediately loses the granted stats/abilities (and may start drowning)
    events.push({ t: 'foundationDestroyed', iid: f.iid, hostIid: host.iid });
  }
};

const canAct = (u: UnitInstance): boolean =>
  // Battle Ready ignores summoning sickness (the just-placed cooldown), so it may attack now.
  !u.status.sleep && !u.status.freeze && !u.status.drowning && (!u.justPlaced || Boolean(u.keywords.battleReady));

const adjacentLanes = (lane: LaneId): LaneId[] => {
  const i = LANES.indexOf(lane);
  const out: LaneId[] = [];
  if (i > 0) out.push(LANES[i - 1]!);
  if (i < LANES.length - 1) out.push(LANES[i + 1]!);
  return out;
};

const frontOf = (s: GameState, p: PlayerId, lane: LaneId): UnitInstance | undefined =>
  s.players[p].lanes[lane].front;
const backOf = (s: GameState, p: PlayerId, lane: LaneId): UnitInstance | undefined =>
  s.players[p].lanes[lane].back;
const unitsInLane = (s: GameState, p: PlayerId, lane: LaneId): UnitInstance[] =>
  [frontOf(s, p, lane), backOf(s, p, lane)].filter((u): u is UnitInstance => Boolean(u));

const findUnit = (s: GameState, p: PlayerId, iid: string): UnitInstance | undefined => {
  for (const lane of LANES) {
    for (const u of unitsInLane(s, p, lane)) if (u.iid === iid) return u;
  }
  return undefined;
};

const findAirborneInLane = (s: GameState, p: PlayerId, lane: LaneId): UnitInstance | undefined =>
  unitsInLane(s, p, lane).find((u) => u.keywords.airborne && canAct(u));

const findTaunt = (s: GameState, p: PlayerId, requireAirborne: boolean): UnitInstance | undefined => {
  for (const lane of LANES) {
    for (const u of unitsInLane(s, p, lane)) {
      if (u.keywords.taunt && canAct(u) && (!requireAirborne || u.keywords.airborne)) return u;
    }
  }
  return undefined;
};

const chooseSniperLane = (s: GameState, defender: PlayerId, fallback: LaneId, override?: LaneId): LaneId => {
  if (override) return override;
  for (const lane of LANES) if (frontOf(s, defender, lane)) return lane;
  return fallback;
};

/**
 * Wake a unit that is attacked, clearing Sleep/Freeze.
 * Freeze normally blocks one hit; pass `bypassFreeze=true` (Undershot) to skip the block.
 * Returns true if the hit is blocked by Freeze.
 */
const wakeOnAttack = (target: UnitInstance, bypassFreeze: boolean, events: GameEvent[], incoming = 0): boolean => {
  let frozenBlock = false;
  if (target.status.freeze) {
    target.status.freeze = 0;
    if (!bypassFreeze) {
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

/** A single strike against one unit: defenses, on-hit, Spike, Lethal. */
const dealSingleHit = (
  s: GameState,
  source: UnitInstance,
  target: UnitInstance,
  opts: { ignoreDefenses?: boolean },
  events: GameEvent[],
  registry?: Registry,
): void => {
  const ignore = Boolean(opts.ignoreDefenses) && !target.keywords.immunity;
  // Wakeup Shock: sleeping units take bonus damage equal to their sleepHeal before waking.
  const wakeupBonus = target.status.sleep ? (target.status.sleepHeal ?? 0) : 0;
  // Undershot (ignoreDefenses) bypasses Freeze protection but still wakes the unit.
  const frozenBlock = wakeOnAttack(target, Boolean(opts.ignoreDefenses), events, source.attack);
  const landed = frozenBlock
    ? 0
    : dealUnitDamage(s, target, source.attack + wakeupBonus, { ignoreDefenses: opts.ignoreDefenses }, events, registry, (amount) =>
        events.push({ t: 'damageUnit', iid: target.iid, amount, hpAfter: target.hp, victim: target.owner }),
      );
  if (landed > 0) {
    // onHit — apply status effects from the attacker to the target.
    applyOnHit(source, target, events);
    // Lethal — destroys the target instantly. Persists for the whole turn (like True Shield).
    // Immunity blocks the instant-kill.
    if (source.keywords.lethal && !target.keywords.immunity) {
      target.hp = 0;
      events.push({ t: 'lethal', source: source.iid, target: target.iid });
    }
  }
  // Spike fires whenever the unit is struck — even when the hit deals no damage (absorbed by
  // Shield / Tough / True Shield / Freeze) — but an effective Undershot (ignoreDefenses) bypasses it.
  if (!ignore && target.keywords.spike) {
    const spike = target.keywords.spike;
    dealUnitDamage(s, source, spike, { raw: true }, events, registry, () =>
      events.push({ t: 'spike', attacker: source.iid, defender: target.iid, amount: spike }),
    );
  }
};

/**
 * One attacker strikes one target. Double Strike resolves HERE, at the hit stage: the
 * attacker strikes the SAME target a second time (stopping if the target or the attacker
 * has already fallen) instead of re-running target selection. This is why a Double Strike
 * never spills its second hit onto the unit behind or the leader just because its first
 * hit was lethal. Bloodlust fires once, after the target is destroyed.
 */
const dealAttack = (
  s: GameState,
  source: UnitInstance,
  target: UnitInstance,
  opts: { ignoreDefenses?: boolean },
  events: GameEvent[],
  registry?: Registry,
): void => {
  if (target.hp <= 0) return; // already dead — nothing to strike
  const strikes = source.keywords.doubleStrike ? 2 : 1;
  for (let i = 0; i < strikes; i++) {
    if (source.hp <= 0 || target.hp <= 0) break;
    dealSingleHit(s, source, target, opts, events, registry);
  }
  // Bloodlust — the attacker triggers when it destroys a unit.
  if (target.hp <= 0 && source.hp > 0) fireBloodlust(s, source, target, events, registry);
};

/** A leader-targeting strike. Double Strike doubles the leader damage (two hits). */
const hitLeader = (s: GameState, source: UnitInstance, defender: PlayerId, events: GameEvent[], registry?: Registry): void => {
  const strikes = source.keywords.doubleStrike ? 2 : 1;
  for (let i = 0; i < strikes; i++) {
    if (source.hp <= 0) break;
    damageLeader(s, defender, source.attack, events, registry);
  }
};

/** A leader-targeting attack, redirected to a Taunt unit when one is eligible. */
const hitLeaderOrTaunt = (
  s: GameState,
  source: UnitInstance,
  defender: PlayerId,
  overshot: boolean,
  events: GameEvent[],
  registry?: Registry,
): void => {
  const taunt = findTaunt(s, defender, overshot);
  if (taunt) {
    events.push({ t: 'intercept', by: taunt.iid, kind: 'taunt' });
    dealAttack(s, source, taunt, {}, events, registry); // cross-lane interception => no retaliation
  } else {
    hitLeader(s, source, defender, events, registry);
  }
};

/** Combined retaliation from a set of defenders against the attacker. */
const retaliateFrom = (
  s: GameState,
  source: UnitInstance,
  retaliators: UnitInstance[],
  events: GameEvent[],
  registry?: Registry,
  noRetaliateIids?: Set<string>,
): void => {
  if (source.hp <= 0) return;
  // Burn already resolved as the lane activated (a unit that died to Burn is gone before this).
  // A unit slain by the attack itself still retaliates — combat is simultaneous.
  // Units that were asleep when struck cannot retaliate (they just woke up).
  const able = retaliators.filter(u => canAct(u) && !noRetaliateIids?.has(u.iid));
  const total = able.reduce((sum, u) => sum + u.attack, 0);
  if (total <= 0) return;
  const landed = dealUnitDamage(s, source, total, {}, events, registry, (amount) => {
    events.push({ t: 'retaliate', unit: able[0]!.iid, target: source.iid, amount });
    events.push({ t: 'damageUnit', iid: source.iid, amount, hpAfter: source.hp, victim: source.owner });
  });
  if (landed > 0) {
    for (const u of able) {
      if (u.keywords.lethal && !source.keywords.immunity) {
        source.hp = 0;
        events.push({ t: 'lethal', source: u.iid, target: source.iid });
      }
    }
  }
  // Bloodlust — a retaliator that destroys the attacker triggers.
  if (source.hp <= 0) {
    for (const u of able) fireBloodlust(s, u, source, events, registry);
  }
};

const retaliateFromLane = (
  s: GameState,
  source: UnitInstance,
  defender: PlayerId,
  lane: LaneId,
  events: GameEvent[],
  registry?: Registry,
  noRetaliateIids?: Set<string>,
): void => retaliateFrom(s, source, unitsInLane(s, defender, lane), events, registry, noRetaliateIids);

/** Which lane (on `p`'s side) the given unit iid currently occupies, if any. */
const laneOfUnit = (s: GameState, p: PlayerId, iid: string): LaneId | undefined =>
  LANES.find((l) => unitsInLane(s, p, l).some((u) => u.iid === iid));

/**
 * Burn resolves on a lane the moment it is engaged in combat — before the strike. The
 * defending units there are about to retaliate, so their Burn procs first; one that dies to
 * Burn is removed before being targeted, letting the attacker hit past it (a back unit, or the
 * leader) and take no retaliation from the dead unit. Only used for "across" strikes (the
 * lane that actually retaliates).
 */
const procDefendingLaneBurn = (s: GameState, defender: PlayerId, lane: LaneId, events: GameEvent[], registry?: Registry): void => {
  // Only units that CAN act burn — a frozen/asleep/summoning-sick unit won't retaliate, so
  // (per the Burn rule) it takes no Burn until it can act.
  for (const u of unitsInLane(s, defender, lane)) if (canAct(u)) procBurn(s, u, events, registry);
  // A standalone Foundation defends as a full unit, so it burns before retaliating too.
  const sf = s.players[defender].lanes[lane].standaloneFoundation;
  if (sf && canAct(sf)) procBurn(s, sf, events, registry);
  processDeaths(s, events, undefined, registry);
};

const resolveAttacker = (
  s: GameState,
  source: UnitInstance,
  lane: LaneId,
  defender: PlayerId,
  events: GameEvent[],
  sniperChoice?: LaneId,
  opts?: { noRetaliation?: boolean },
  registry?: Registry,
): void => {
  const strikes = source.keywords.doubleStrike ? 2 : 1;
  // Extra Action attacks (and other bonus actions) take no retaliation.
  // noRetaliateIids: units that were asleep when struck this sequence — they cannot retaliate.
  const retaliate = (s2: GameState, src: UnitInstance, def: PlayerId, ln: LaneId, ev: GameEvent[], noRet?: Set<string>): void => {
    if (!opts?.noRetaliation) retaliateFromLane(s2, src, def, ln, ev, registry, noRet);
  };

  // Retaliation rule (unified): a lane strikes back only when the attacker is directly
  // across from it — i.e. the attacker's own lane equals the lane it struck. When that
  // holds, the WHOLE defending lane retaliates (both Double Team slots), even if only one
  // of them was personally hit. Cross-lane attacks (Sniper, Branch Shot, Splash's wings,
  // Taunt redirects to another lane) never provoke retaliation.

  // Sniper lane re-selection — resolved FIRST so all pattern keywords (Branch Shot, Splash,
  // Overshot, Undershot, Strike Through) aim at the chosen lane. Requires the Heights lane
  // or the Airborne keyword; a grounded Sniper outside Heights just strikes straight across.
  let targetLane = lane;
  if (source.keywords.sniper && (lane === 'heights' || source.keywords.airborne)) {
    targetLane = chooseSniperLane(s, defender, lane, sniperChoice);
  }
  // ── Per-shot primitive ─────────────────────────────────────────────────────────────────────
  // A single shot from `source` at one lane. Attack TYPES (Branch, Splash, plain) decide WHICH
  // lanes get shot; the per-shot ATTRIBUTES (Overshot, Undershot, Strike Through, on-hit, Lethal,
  // Double Strike) are honored here, uniformly, for every shot. Retaliation fires from the struck
  // lane only when that lane is directly across from the attacker (`tl === lane`).
  const resolveShotAtLane = (tl: LaneId): void => {
    const across = tl === lane;

    // Overshot — the shot bypasses the lane's units to the leader, intercepted by an Airborne
    // unit in that lane, else by an Airborne + Taunt unit anywhere.
    if (source.keywords.overshot) {
      const air = findAirborneInLane(s, defender, tl);
      if (air) {
        events.push({ t: 'intercept', by: air.iid, kind: 'airborne' });
        const wasAsleep = Boolean(air.status.sleep);
        dealAttack(s, source, air, {}, events, registry);
        // Retaliation only when the interceptor's lane is directly across from the attacker.
        if (across) retaliate(s, source, defender, tl, events, wasAsleep ? new Set([air.iid]) : undefined);
        return;
      }
      const tauntAir = findTaunt(s, defender, true);
      if (tauntAir) {
        events.push({ t: 'intercept', by: tauntAir.iid, kind: 'taunt' });
        const wasAsleep = Boolean(tauntAir.status.sleep);
        dealAttack(s, source, tauntAir, {}, events, registry);
        // A Taunt redirect can pull the shot across lanes; retaliate only if the interceptor
        // happens to be the lane directly across from the attacker.
        if (laneOfUnit(s, defender, tauntAir.iid) === lane) {
          retaliate(s, source, defender, lane, events, wasAsleep ? new Set([tauntAir.iid]) : undefined);
        }
        return;
      }
      hitLeader(s, source, defender, events, registry);
      return;
    }

    // Non-Overshot shots engage the lane directly. A burned defender there burns FIRST (it is
    // about to retaliate); one that dies to Burn is cleared before the strike, so the attacker
    // hits past it to the leader.
    if (across) procDefendingLaneBurn(s, defender, tl, events, registry);

    const front = frontOf(s, defender, tl);
    const sfOnly = !front ? s.players[defender].lanes[tl].standaloneFoundation : undefined;

    if (!front && !sfOnly) {
      hitLeaderOrTaunt(s, source, defender, false, events, registry);
      return;
    }

    if (!front && sfOnly) {
      // A standalone Foundation IS a full unit (in the foundation slot): it takes damage through
      // the shared dealAttack/mitigate path directly, honoring Tough, True Shield, Immunity,
      // Shield, the attacker's Lethal/on-hit, Spike, and Double Strike uniformly.
      const sfLane = s.players[defender].lanes[tl];
      const sf = sfOnly;
      dealAttack(s, source, sf, {}, events, registry);
      if (sf.hp <= 0) {
        sfLane.standaloneFoundation = undefined;
        events.push({ t: 'foundationDestroyed', iid: sf.iid, hostIid: '' });
      }
      // Foundation retaliates once with its own attack and on-hit effects — only if it
      // survived and the attacker is directly across (not for a cross-lane Sniper/wing shot).
      const survivor = sfLane.standaloneFoundation;
      if (survivor && survivor.attack > 0 && across && source.hp > 0) {
        dealUnitDamage(s, source, survivor.attack, { raw: true }, events, registry, (amount) =>
          events.push({ t: 'damageUnit', iid: source.iid, amount, hpAfter: source.hp, victim: source.owner }),
        );
        if (survivor.onHit && !source.keywords.immunity) {
          applyOnHitStatuses(source, survivor.onHit, events);
        }
      }
      return;
    }

    if (!front) return; // unreachable guard for TypeScript narrowing

    // Undershot — strike the deepest target (front Foundation → back Foundation → back unit →
    // front unit), piercing defenses.
    if (source.keywords.undershot) {
      const back = backOf(s, defender, tl);
      if (front.foundation) {
        for (let i = 0; i < strikes; i++) if (front.foundation) damageFoundation(front, source, events, tl);
      } else if (back?.foundation) {
        for (let i = 0; i < strikes; i++) if (back.foundation) damageFoundation(back, source, events, tl);
      } else {
        const deepest = back ?? front;
        const wasAsleep = Boolean(deepest.status.sleep);
        dealAttack(s, source, deepest, { ignoreDefenses: true }, events, registry);
        if (across) retaliate(s, source, defender, tl, events, wasAsleep ? new Set([deepest.iid]) : undefined);
        return;
      }
      if (across) retaliate(s, source, defender, tl, events);
      return;
    }

    // Plain shot (+ Strike Through, which adds a second shot at the back unit, else the leader).
    const laneSleepingIids = new Set(
      unitsInLane(s, defender, tl).filter((u) => Boolean(u.status.sleep)).map((u) => u.iid),
    );
    dealAttack(s, source, front, {}, events, registry);
    if (source.keywords.strikeThrough) {
      const back = backOf(s, defender, tl);
      if (back) dealAttack(s, source, back, {}, events, registry); // back card absorbs the leader portion
      else hitLeader(s, source, defender, events, registry);
    }
    if (across) retaliate(s, source, defender, tl, events, laneSleepingIids.size > 0 ? laneSleepingIids : undefined);
  };

  // ── Attack-type dispatch ───────────────────────────────────────────────────────────────────
  // Branch Shot — one shot into each lane adjacent to the target lane (never the target lane
  // itself). Each wing is a full shot carrying the unit's attributes, so Branch composes with
  // Overshot, Undershot, Strike Through, on-hit, etc. Wings are cross-lane, so they retaliate only
  // in the rare case a wing lands on the attacker's own lane (a Sniper-redirected target).
  if (source.keywords.branchShot) {
    for (const adjLane of adjacentLanes(targetLane)) resolveShotAtLane(adjLane);
    return;
  }

  // Splash — a full shot at the target lane (which retaliates when across) plus collateral on the
  // adjacent lanes' front units. The collateral is cross-lane (no retaliation) and lands only on
  // units that are actually there — it is what distinguishes Splash from Branch, so it is not a
  // full shot (an empty adjacent lane is skipped rather than reaching the leader).
  if (source.keywords.splashDamage) {
    const collateral = adjacentLanes(targetLane)
      .map((l) => frontOf(s, defender, l))
      .filter((u): u is UnitInstance => Boolean(u));
    for (const t of collateral) dealAttack(s, source, t, {}, events, registry);
    resolveShotAtLane(targetLane);
    return;
  }

  // Plain attack type — a single shot at the target lane. This also covers a Sniper-redirected
  // shot and a lone Overshot / Undershot / Strike Through unit, since those are per-shot attributes.
  resolveShotAtLane(targetLane);
};

/** End the game in `draft` with the given winner, recording the event. */
const declareWinner = (draft: GameState, winner: PlayerId, events: GameEvent[]): void => {
  draft.phase = 'ended';
  draft.winner = winner;
  events.push({ t: 'gameOver', winner });
};

/**
 * End the game if EITHER leader has died, using the same tiebreak as `checkGameOver`
 * (player 1 dead → player 0 wins). Combat can kill the attacker's own leader-unit (Spike,
 * Lethal retaliation, a self-damaging onAttack), so checking only the defender would let a
 * player keep attacking — and even win — after their own leader is already dead.
 */
const endIfLeaderDead = (draft: GameState, events: GameEvent[]): boolean => {
  const p0 = draft.players[0].leaderHp;
  const p1 = draft.players[1].leaderHp;
  if (p0 > 0 && p1 > 0) return false;
  declareWinner(draft, p1 <= 0 ? 0 : 1, events);
  return true;
};

/**
 * Resolve a single attacker (identified by iid) against `defender`, mutating `draft`.
 * Shared by the atomic `resolveCombat` and the lane-stepped `resolveCombatByLane`.
 * Returns 'ended' if the defender's leader has died (game over), else 'continue'.
 */
/**
 * Resolve a standalone Foundation's attack. A Foundation is a full unit: it swings through the
 * shared `resolveAttacker` path via a transient unit-view (so its keywords, on-hit, Sniper, etc.
 * all work), then we sync the post-combat HP/Shield back onto the Foundation and clear it if it
 * died. It is subject to summoning sickness and Water drowning exactly like a unit, and takes no
 * attack if it has 0 ATK.
 */
const resolveFoundationAttacker = (
  draft: GameState,
  attacker: PlayerId,
  defender: PlayerId,
  lane: LaneId,
  events: GameEvent[],
  sniperChoice: LaneId | undefined,
  registry: Registry | undefined,
): 'continue' | 'ended' => {
  const laneObj = draft.players[attacker].lanes[lane];
  const sf = laneObj.standaloneFoundation;
  if (!sf) return 'continue';
  if (sf.justPlaced || sf.attack <= 0) return 'continue'; // summoning-sick or non-combatant
  const waterCompatible = Boolean(sf.keywords.aquatic) || Boolean(sf.keywords.airborne);
  if (lane === 'water' && !waterCompatible) return 'continue'; // drowning — 0 attack

  // Burn procs before it attacks, exactly like a unit — a Foundation that burns to death never swings.
  procBurn(draft, sf, events, registry);
  if (sf.hp <= 0) { processDeaths(draft, events, undefined, registry); return 'continue'; }

  // The Foundation IS a full unit — it swings through the shared `resolveAttacker` path directly.
  events.push({ t: 'attack', attacker: sf.iid, lane, amount: sf.attack });
  resolveAttacker(draft, sf, lane, defender, events, sniperChoice, undefined, registry);
  if (sf.hp <= 0) {
    laneObj.standaloneFoundation = undefined;
    events.push({ t: 'foundationDestroyed', iid: sf.iid, hostIid: '' });
  }
  processDeaths(draft, events, sf.iid, registry);
  reconcileLeaderUnit(draft, events);
  if (endIfLeaderDead(draft, events)) return 'ended';
  return 'continue';
};

const resolveOneAttacker = (
  draft: GameState,
  attacker: PlayerId,
  defender: PlayerId,
  iid: string,
  lane: LaneId,
  events: GameEvent[],
  sniperChoice?: LaneId,
  registry?: Registry,
): 'continue' | 'ended' => {
  const source = findUnit(draft, attacker, iid);
  if (!source) {
    // Not a front/back unit — it may be a standalone Foundation attacking as a full unit.
    const sf = draft.players[attacker].lanes[lane].standaloneFoundation;
    if (sf && sf.iid === iid) return resolveFoundationAttacker(draft, attacker, defender, lane, events, sniperChoice, registry);
    return 'continue';
  }
  if (!canAct(source)) return 'continue';
  if (source.attack <= 0) return 'continue'; // 0-ATK units do not attack or provoke retaliation

  // "Before attacking" triggered effects fire now, before the strike resolves.
  if (source.onAttack?.length) {
    applyTriggeredEffects(draft, source, source.onAttack, events, undefined, registry);
    const stillThere = findUnit(draft, attacker, iid);
    if (!stillThere || !canAct(stillThere) || stillThere.attack <= 0) {
      reconcileLeaderUnit(draft, events);
      if (endIfLeaderDead(draft, events)) return 'ended';
      return 'continue'; // the effect removed/disabled the attacker
    }
  }

  // Burn procs before this unit attacks; a unit that burns to death never strikes.
  procBurn(draft, source, events, registry);
  if (source.hp <= 0) { processDeaths(draft, events, undefined, registry); return 'continue'; }

  events.push({ t: 'attack', attacker: source.iid, lane, amount: source.attack });
  resolveAttacker(draft, source, lane, defender, events, sniperChoice, undefined, registry);

  // Brittle: the unit destroys itself after it attacks.
  if (source.keywords.brittle && source.hp > 0) {
    source.hp = 0;
    events.push({ t: 'brittle', iid: source.iid });
  }

  // Pass the attacker's iid so Wrapper Bats-style "buff the killer" Kamikaze can find it.
  processDeaths(draft, events, source.iid, registry);

  reconcileLeaderUnit(draft, events);
  if (endIfLeaderDead(draft, events)) return 'ended';
  return 'continue';
};

/**
 * Snapshot the attacking units (by iid, in lane order) so promotions/deaths during
 * resolution don't double-process or skip a unit. Environment grants take effect now —
 * at combat time, not at start of turn (see environment.ts) — so keywords like Vent's
 * Overshot or Perfect Fortress's True Shield shape this combat.
 */
const setupCombat = (
  draft: GameState,
  registry: Registry | undefined,
): { attacker: PlayerId; defender: PlayerId; order: { iid: string; lane: LaneId }[] } => {
  if (registry) refreshEnvironmentGrants(registry, draft);
  const attacker = draft.active;
  const defender = opponentOf(attacker);
  const order: { iid: string; lane: LaneId }[] = [];
  for (const lane of LANES) {
    for (const u of unitsInLane(draft, attacker, lane)) order.push({ iid: u.iid, lane });
    // A standalone Foundation is a full unit and attacks like one (a lane never holds both a
    // Foundation and units, so this never interleaves with the front/back entries above).
    const sf = draft.players[attacker].lanes[lane].standaloneFoundation;
    if (sf) order.push({ iid: sf.iid, lane });
  }
  return { attacker, defender, order };
};

/**
 * Environments are neutral lane fixtures that activate every combat: each lane's Environment
 * applies its effects to all units in that lane column (both players) at the start of combat.
 * This only SETS statuses (e.g. Molten Floor applies Burn) — it does not deal damage. Burn
 * still only bites a unit that goes on to attack or retaliate (see `procBurn`).
 */
const applyEnvironmentEffects = (draft: GameState, registry: Registry | undefined, events: GameEvent[]): void => {
  if (!registry) return;
  for (const lane of LANES) {
    const env = draft.environments[lane];
    if (!env) continue;
    const def = registry.cards.get(env.cardId);
    if (!def || def.type !== 'environment' || !def.effects?.length) continue;
    const units = [...unitsInLane(draft, 0, lane), ...unitsInLane(draft, 1, lane)];
    for (const u of units) {
      applyEffects(draft, env.owner, def.effects, def.effects.map(() => ({ kind: 'unit' as const, iid: u.iid })), lane, events, registry);
    }
  }
};

export const resolveCombat = (
  state: GameState,
  sniperChoices?: Partial<Record<string, LaneId>>,
  registry?: Registry,
): { state: GameState; events: GameEvent[] } => {
  const draft: GameState = structuredClone(state);
  const events: GameEvent[] = [];
  const { attacker, defender, order } = setupCombat(draft, registry);
  applyEnvironmentEffects(draft, registry, events); // environments activate the lane each combat

  for (const { iid, lane } of order) {
    const result = resolveOneAttacker(draft, attacker, defender, iid, lane, events, sniperChoices?.[iid] as LaneId | undefined, registry);
    if (result === 'ended') break;
  }

  return { state: draft, events };
};

/**
 * Resolve a single bonus attack for one unit (from an `extraAction` effect), mutating
 * `draft`. The unit strikes the lane across from it exactly as in normal combat, but takes
 * NO retaliation. Deaths are processed afterwards. Safe to call mid-action.
 */
export const resolveExtraAction = (
  draft: GameState,
  unitIid: string,
  registry: Registry | undefined,
  events: GameEvent[],
): void => {
  let owner: PlayerId | undefined;
  let lane: LaneId | undefined;
  let source: UnitInstance | undefined;
  for (const p of [0, 1] as PlayerId[]) {
    for (const l of LANES) {
      const u = unitsInLane(draft, p, l).find((x) => x.iid === unitIid);
      if (u) { owner = p; lane = l; source = u; break; }
    }
    if (source) break;
  }
  if (!source || owner === undefined || !lane) return;
  // A granted bonus action ignores summoning sickness, but a unit that physically cannot
  // act (asleep / frozen / drowning) or has no attack still does nothing.
  if (source.status.sleep || source.status.freeze || source.status.drowning || source.attack <= 0) return;
  // Emit the attack event so the UI's buildAttackFx can find this strike and animate it.
  events.push({ t: 'attack', attacker: source.iid, lane, amount: source.attack });
  resolveAttacker(draft, source, lane, opponentOf(owner), events, undefined, { noRetaliation: true }, registry);
  processDeaths(draft, events, source.iid, registry);
};

/** A single lane's worth of combat, with a state snapshot for UI animation. */
export interface LaneCombatStep {
  lane: LaneId;
  /** True if at least one ally unit in this lane actually attacked. */
  acted: boolean;
  /** Events produced while resolving this lane. */
  events: GameEvent[];
  /** Board state after this lane finished resolving (for the UI to render). */
  state: GameState;
}

/**
 * Resolve combat one lane at a time (left to right), returning a snapshot after each
 * lane so the UI can animate the combat phase. Mechanically identical to `resolveCombat`
 * (combat is deterministic — it consumes no RNG), just sliced by lane.
 */
export const resolveCombatByLane = (
  state: GameState,
  sniperChoices: Partial<Record<string, LaneId>> | undefined,
  registry: Registry | undefined,
): { steps: LaneCombatStep[]; state: GameState; events: GameEvent[] } => {
  const draft: GameState = structuredClone(state);
  const events: GameEvent[] = [];
  const { attacker, defender, order } = setupCombat(draft, registry);
  applyEnvironmentEffects(draft, registry, events); // environments activate the lane each combat

  const steps: LaneCombatStep[] = [];
  let ended = false;
  for (const lane of LANES) {
    const laneEvents: GameEvent[] = [];
    let acted = false;
    if (!ended) {
      for (const entry of order.filter((o) => o.lane === lane)) {
        const before = laneEvents.length;
        const result = resolveOneAttacker(draft, attacker, defender, entry.iid, lane, laneEvents, sniperChoices?.[entry.iid] as LaneId | undefined, registry);
        if (laneEvents.some((e, i) => i >= before && e.t === 'attack')) acted = true;
        if (result === 'ended') { ended = true; break; }
      }
    }
    events.push(...laneEvents);
    steps.push({ lane, acted, events: laneEvents, state: structuredClone(draft) });
  }

  return { steps, state: draft, events };
};
