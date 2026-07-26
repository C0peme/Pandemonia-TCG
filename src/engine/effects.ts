/**
 * Effect resolution for spells, environments, hero powers, and signatures.
 *
 * Effects are authored as data (see cards/schema `Effect`). Here we interpret them
 * against concrete targets supplied by the action. Targeted effects consume the
 * action's `targets` in order. Immunity blocks only HARMFUL control effects — status
 * effects, debuff, setStats, and displacement (move/expel) — plus offensive abilities
 * (Lethal, Undershot's pierce). It does NOT block damage or beneficial effects.
 *
 * Wave 3 covers: damage, heal, draw, buff, debuff, applyStatus, energy, move, expel,
 * forget, summon (a unit onto the board), conjure (a card into a hand). `custom` is a
 * placeholder for hand-coded effects.
 */
import { LANES, type LaneId } from '@engine/constants';
import type { PlayerId, Lane } from '@engine/types';
import type { Effect, UnitCard } from '@cards/schema';
import type { Registry } from '@cards/registry';
import type { TargetRef } from '@engine/actions';
import { buffUnit, createUnitInstance, locateUnit, laneUnits, relocateUnit, vacateSlot } from '@engine/board';
import { applyStatus, clearCleansableStatuses, isHarmfulStatus } from '@engine/status';
import { damageLeader, findLeaderUnit, healLeader, healUnit, mitigate, setDamageTriggerHook, type DamageOpts } from '@engine/damage';
import { addCardToHand, millCards } from '@engine/hand';
import { drawCard } from '@engine/draw';
import type { GameEvent } from '@engine/events';
import { opponentOf, type GameState, type UnitInstance } from '@engine/types';

const TARGETED: ReadonlySet<Effect['kind']> = new Set([
  'damage',
  'heal',
  'buff',
  'debuff',
  'applyStatus',
  'move',
  'expel',
  'extraAction',
  'setStats',
  // `cleanse` picks a unit like any other targeted effect. It was omitted here when it
  // was added as a kamikaze-only effect (runKamikaze does its own auto-targeting), which
  // left every card-cast cleanse — e.g. Purify — failing with "Effect requires a target".
  'cleanse',
]);

/** Scopes that auto-apply to all units on a side — no target ref consumed from the array. */
const AOE_SCOPES: ReadonlySet<Effect['target']> = new Set(['all-enemy', 'all-ally']);

/** First open slot in a lane for an incoming unit, respecting Double Team. */
const openSlot = (laneObj: Lane, def: UnitCard): 'front' | 'back' | null => {
  // A lane with a Foundation waiting to bond is not a valid summon target — summoning
  // does not bond, so it would orphan the Foundation. Treat the lane as unavailable.
  if (laneObj.standaloneFoundation) return null;
  if (!laneObj.front) return 'front';
  const doubleTeam = Boolean(laneObj.front.keywords.doubleTeam) || Boolean(def.keywords.doubleTeam);
  if (!laneObj.back && doubleTeam) return 'back';
  return null;
};

interface EffectError {
  error: string;
}

/** Validate a unit target against the effect's scope. Returns the unit or an error. */
const resolveUnitTarget = (
  s: GameState,
  caster: PlayerId,
  scope: Effect['target'],
  ref: TargetRef | undefined,
): UnitInstance | EffectError => {
  if (!ref) return { error: 'Effect requires a target' };
  if (ref.kind !== 'unit') return { error: 'Effect requires a unit target' };
  const loc = locateUnit(s, ref.iid);
  if (!loc) return { error: `No such unit: ${ref.iid}` };
  if ((scope === 'ally' || scope === 'lane-ally') && loc.owner !== caster) return { error: 'Target must be an ally' };
  if ((scope === 'enemy' || scope === 'lane-enemy') && loc.owner !== opponentOf(caster)) return { error: 'Target must be an enemy' };
  if (scope === 'self' && loc.owner !== caster) return { error: 'Target must be your own' };
  return loc.unit;
};

const isImmune = (u: UnitInstance): boolean => Boolean(u.keywords.immunity);

const applyOne = (
  s: GameState,
  caster: PlayerId,
  effect: Effect,
  ref: TargetRef | undefined,
  lane: LaneId | undefined,
  events: GameEvent[],
  registry?: Registry,
): EffectError | void => {
  const amount = effect.amount ?? 0;

  switch (effect.kind) {
    case 'damage': {
      if (ref?.kind === 'leader') {
        damageLeader(s, ref.player, amount, events, registry);
        return;
      }
      // A standalone Foundation is a full unit (in the foundation slot): `locateUnit` finds it and
      // `dealUnitDamage` mutates it in place, so damage/mitigation/death flow through the shared
      // path with no special case. `processDeaths` clears the slot afterwards.
      const target = resolveUnitTarget(s, caster, effect.target, ref);
      if ('error' in target) return target;
      // Wakeup Shock: sleeping units take bonus damage equal to their sleepHeal, then wake.
      const wakeupBonus = target.status.sleep ? (target.status.sleepHeal ?? 0) : 0;
      if (wakeupBonus > 0) {
        target.status.sleep = 0;
        delete target.status.sleepHeal;
        events.push({ t: 'wake', iid: target.iid, from: 'sleep' });
      }
      dealUnitDamage(s, target, amount + wakeupBonus, {}, events, registry, (landed) =>
        events.push({ t: 'damageUnit', iid: target.iid, amount: landed, hpAfter: target.hp, victim: target.owner }),
      );
      // Chain: if this hit destroyed the target, splash to the weakest OTHER enemy unit.
      if (effect.chain && target.hp <= 0) {
        const opp = opponentOf(caster);
        const others = LANES.flatMap((l) => laneUnits(s.players[opp].lanes[l])).filter(
          (u) => u.iid !== target.iid && u.hp > 0,
        );
        if (others.length > 0) {
          const weakest = others.reduce((a, b) => (a.hp <= b.hp ? a : b));
          const chainShock = weakest.status.sleep ? (weakest.status.sleepHeal ?? 0) : 0;
          if (chainShock > 0) {
            weakest.status.sleep = 0;
            delete weakest.status.sleepHeal;
            events.push({ t: 'wake', iid: weakest.iid, from: 'sleep' });
          }
          dealUnitDamage(s, weakest, effect.chain + chainShock, {}, events, registry, (chained) =>
            events.push({ t: 'damageUnit', iid: weakest.iid, amount: chained, hpAfter: weakest.hp, victim: weakest.owner }),
          );
        }
      }
      // Diminishing chain: keep bouncing to the next-weakest enemy for amount-1, amount-2,
      // … as long as each hit kills and the damage is still positive.
      if (effect.chainDiminish && target.hp <= 0) {
        const opp = opponentOf(caster);
        const hit = new Set<string>([target.iid]);
        let next = amount - 1;
        while (next > 0) {
          const living = LANES.flatMap((l) => laneUnits(s.players[opp].lanes[l])).filter(
            (u) => !hit.has(u.iid) && u.hp > 0,
          );
          if (living.length === 0) break;
          const weakest = living.reduce((a, b) => (a.hp <= b.hp ? a : b));
          hit.add(weakest.iid);
          const diminishShock = weakest.status.sleep ? (weakest.status.sleepHeal ?? 0) : 0;
          if (diminishShock > 0) {
            weakest.status.sleep = 0;
            delete weakest.status.sleepHeal;
            events.push({ t: 'wake', iid: weakest.iid, from: 'sleep' });
          }
          dealUnitDamage(s, weakest, next + diminishShock, {}, events, registry, (dealt) =>
            events.push({ t: 'damageUnit', iid: weakest.iid, amount: dealt, hpAfter: weakest.hp, victim: weakest.owner }),
          );
          if (weakest.hp > 0) break; // a hit that doesn't kill ends the chain
          next -= 1;
        }
      }
      return;
    }
    case 'heal': {
      if (ref?.kind === 'leader') {
        healLeader(s, ref.player, amount, events);
        return;
      }
      const target = resolveUnitTarget(s, caster, effect.target, ref);
      if ('error' in target) return target;
      healUnit(target, amount, events);
      return;
    }
    case 'buff': {
      const target = resolveUnitTarget(s, caster, effect.target, ref);
      if ('error' in target) return target;
      buffUnit(target, effect.stat ?? {}, events); // Poison blocks gains internally
      // Grant keywords (e.g. Immunity, Undershot) when the buff carries them.
      if (effect.keywords) {
        Object.assign(target.keywords, effect.keywords);
        events.push({ t: 'buff', iid: target.iid, attack: 0, hp: 0 });
      }
      return;
    }
    case 'debuff': {
      const target = resolveUnitTarget(s, caster, effect.target, ref);
      if ('error' in target) return target;
      if (isImmune(target)) {
        events.push({ t: 'blocked', iid: target.iid, source: 'immunity' });
        return;
      }
      const dA = effect.stat?.attack ?? 0;
      const dH = effect.stat?.hp ?? 0;
      target.attack = Math.max(0, target.attack - dA);
      target.maxHp = Math.max(1, target.maxHp - dH);
      target.hp = Math.min(target.hp, target.maxHp);
      events.push({ t: 'buff', iid: target.iid, attack: -dA, hp: -dH });
      return;
    }
    case 'applyStatus': {
      const target = resolveUnitTarget(s, caster, effect.target, ref);
      if ('error' in target) return target;
      const status = effect.status;
      if (!status) return { error: 'applyStatus requires a status' };
      // Immunity blocks only HARMFUL statuses; beneficial ones (Shield / True Shield / Taunt /
      // Zombified) pass through — e.g. Riku's Signature shields its own immune leader-unit.
      // Classification lives in STATUS_SPECS so this gate can't drift from the apply logic
      // (it previously listed Zombified — a revive, i.e. a buff — as harmful, which made it
      // impossible to Zombify your own Immune unit).
      if (isHarmfulStatus(status) && isImmune(target)) {
        events.push({ t: 'blocked', iid: target.iid, source: 'immunity' });
        return;
      }
      applyStatus(target, status, {
        burn: amount || 1,
        poison: amount || undefined,
        sleepHeal: amount,
        shield: amount || 1,
      }, events);
      return;
    }
    case 'costMod': {
      const who = effect.target === 'enemy' ? opponentOf(caster) : caster;
      const cm = s.players[who].costMods;
      const type = effect.cardType ?? 'spell';
      if (type === 'all') { cm.unit += amount; cm.spell += amount; cm.foundation += amount; cm.environment += amount; }
      else cm[type] += amount;
      events.push({ t: 'costMod', player: who, amount });
      return;
    }
    case 'extraAction': {
      // Grant a unit a bonus attack (resolved by the engine after this action, no retaliation).
      const target = resolveUnitTarget(s, caster, effect.target, ref);
      if ('error' in target) return target;
      (s.extraActions ??= []).push(target.iid);
      events.push({ t: 'extraAction', iid: target.iid });
      return;
    }
    case 'energy': {
      const recipient = effect.target === 'enemy' ? opponentOf(caster) : caster;
      // chooseElement: bank the element the player picked (an `element` ref); otherwise
      // fall back to the effect's fixed element.
      const element =
        effect.chooseElement && ref?.kind === 'element' ? ref.element : effect.element;
      if (effect.chooseElement && !element) return { error: 'Cultivate requires an element choice' };
      if (element) {
        const p = s.players[recipient];
        const room = p.elementCaps[element] - p.bank[element];
        const add = Math.max(0, Math.min(amount, room));
        if (add > 0) {
          p.bank[element] += add;
          events.push({ t: 'produce', player: recipient, element, amount: add });
        }
      } else {
        s.players[recipient].energy += amount;
      }
      return;
    }
    case 'draw': {
      const recipient = effect.target === 'enemy' ? opponentOf(caster) : caster;
      for (let i = 0; i < amount; i++) drawCard(s, recipient, events);
      return;
    }
    case 'move': {
      const target = resolveUnitTarget(s, caster, effect.target, ref);
      if ('error' in target) return target;
      if (isImmune(target)) {
        events.push({ t: 'blocked', iid: target.iid, source: 'immunity' });
        return;
      }
      if (!lane) return { error: 'Move requires a destination lane' };
      const loc = locateUnit(s, target.iid)!;
      // Shared relocation: Double Team capacity, back-row promotion, Water drowning, and
      // Environment grant refresh for both lanes.
      const moveError = relocateUnit(registry, s, loc, lane, events);
      if (moveError) return { error: moveError };
      return;
    }
    case 'expel': {
      const target = resolveUnitTarget(s, caster, effect.target, ref);
      if ('error' in target) return target;
      if (isImmune(target)) {
        events.push({ t: 'blocked', iid: target.iid, source: 'immunity' });
        return;
      }
      const loc = locateUnit(s, target.iid)!;
      vacateSlot(s.players[loc.owner].lanes[loc.lane], loc.slot);
      events.push({ t: 'expel', iid: target.iid, cardId: target.cardId, victim: target.owner });
      // A full hand can't hold the returned card — it is forgotten instead (and a Null bleeds).
      addCardToHand(s, loc.owner, { iid: target.iid, cardId: target.cardId }, events);
      return;
    }
    case 'forget': {
      // Remove `amount` cards from the top of a deck (the opponent's with target:'enemy').
      // Shrinking the deck pushes that player toward deck-out (Null draws bleed their leader).
      const who = effect.target === 'enemy' ? opponentOf(caster) : caster;
      millCards(s, who, amount, events);
      return;
    }
    case 'conjure': {
      // Create a card directly in a hand (caster's by default; the enemy's with target:'enemy').
      if (!effect.cardId) return { error: 'conjure requires a cardId' };
      const recipient = effect.target === 'enemy' ? opponentOf(caster) : caster;
      const iid = `c${++s.iidSeq}`;
      events.push({ t: 'conjure', player: recipient, cardId: effect.cardId });
      addCardToHand(s, recipient, { iid, cardId: effect.cardId }, events);
      return;
    }
    case 'summon': {
      // Create a unit directly on the board (caster's side by default; the enemy's with
      // target:'enemy'). Lane is fixed by the card (`effect.lane`) or the action's lane,
      // else the first lane with an open slot. Summoned units have summoning sickness.
      if (!effect.cardId) return { error: 'summon requires a cardId' };
      if (!registry) return { error: 'summon requires a registry' };
      const def = registry.cards.get(effect.cardId);
      if (!def || def.type !== 'unit') return { error: `summon: ${effect.cardId} is not a unit` };
      const owner = effect.target === 'enemy' ? opponentOf(caster) : caster;
      const lanes = s.players[owner].lanes;
      const preferred = effect.lane ?? lane;
      const destLane =
        preferred && openSlot(lanes[preferred], def) ? preferred : LANES.find((l) => openSlot(lanes[l], def));
      if (!destLane) return { error: 'No open lane to summon into' };
      const slot = openSlot(lanes[destLane], def)!;
      const waterCompatible = Boolean(def.keywords.aquatic) || Boolean(def.keywords.airborne);
      const drowning = destLane === 'water' && !waterCompatible;
      const iid = `s${++s.iidSeq}`;
      const created = createUnitInstance(def, { iid, cardId: def.id }, owner, drowning);
      if (slot === 'front' && lanes[destLane].front) lanes[destLane].back = lanes[destLane].front;
      lanes[destLane][slot] = created;
      // Airborne units act as if in the Heights, so they forfeit Aquatic's Water-entry effects.
      const aquaticEffects = Array.isArray(def.keywords.aquatic) ? def.keywords.aquatic : null;
      if (destLane === 'water' && !drowning && aquaticEffects && !def.keywords.airborne) {
        applyTriggeredEffects(s, created, aquaticEffects, events, undefined, registry);
      }
      events.push({ t: 'summon', player: owner, cardId: def.id, lane: destLane });
      return;
    }
    case 'setStats': {
      // Overwrite the target's base attack / max HP to fixed values (e.g. "becomes 1/1").
      const target = resolveUnitTarget(s, caster, effect.target, ref);
      if ('error' in target) return target;
      if (isImmune(target)) {
        events.push({ t: 'blocked', iid: target.iid, source: 'immunity' });
        return;
      }
      const newAtk = effect.stat?.attack ?? target.attack;
      const newHp = effect.stat?.hp ?? target.maxHp;
      target.attack = Math.max(0, newAtk);
      target.maxHp = Math.max(1, newHp);
      target.hp = Math.min(target.hp, target.maxHp);
      events.push({ t: 'buff', iid: target.iid, attack: target.attack, hp: target.hp });
      return;
    }
    case 'cleanse': {
      // Strip the cleansable (harmful) statuses across both backing stores. `status.ts` owns
      // what qualifies — notably it preserves POSITIONAL drowning (owned by drowning.ts and
      // paired with `predrownAttack`; a blanket `status = {}` used to drop the flag while
      // leaving attack at 0, so the next lane refresh re-drowned the unit and overwrote
      // `predrownAttack` with 0, permanently destroying its attack) and every beneficial
      // status, since cleanse is cast on your OWN unit.
      const target = resolveUnitTarget(s, caster, effect.target, ref);
      if ('error' in target) return target;
      clearCleansableStatuses(target);
      events.push({ t: 'cleanse', iid: target.iid });
      return;
    }
    case 'custom':
      return; // placeholder for hand-coded effects
  }
};

/**
 * Run a dying unit's Kamikaze effect.
 *
 * Auto-targeting by scope:
 *  - 'self'   → the dying unit itself (used for 'cleanse')
 *  - 'enemy'  → ALL enemies in the unit's own lane (AOE); no leader fallback
 *  - 'killer' → the unit that dealt the killing blow (passed as killerIid)
 *  - default  → enemy leader for damage/debuff, own leader for heal/buff
 */
const runKamikaze = (
  s: GameState,
  u: UnitInstance,
  lane: LaneId,
  events: GameEvent[],
  killerIid?: string,
  registry?: Registry,
): void => {
  const eff = u.keywords.kamikaze;
  if (!eff) return;

  // Self-targeted: ref is always the dying unit itself.
  if (eff.target === 'self') {
    applyOne(s, u.owner, eff, { kind: 'unit', iid: u.iid }, undefined, events, registry);
    return;
  }

  // Lane-scoped AOE: hit every enemy unit in the dying unit's lane. No leader fallback.
  if (eff.target === 'enemy') {
    const opp = opponentOf(u.owner);
    const enemies = laneUnits(s.players[opp].lanes[lane]);
    for (const e of enemies) applyOne(s, u.owner, eff, { kind: 'unit', iid: e.iid }, undefined, events, registry);
    return;
  }

  // Killer buff: target the unit that killed this one.
  if (eff.target === 'killer') {
    if (killerIid) {
      const killerLoc = locateUnit(s, killerIid);
      if (killerLoc) applyOne(s, u.owner, eff, { kind: 'unit', iid: killerIid }, undefined, events, registry);
    }
    return;
  }

  // Default: ally/leader/undefined targets → own leader for beneficial effects, enemy leader otherwise.
  let ref: TargetRef | undefined;
  if (TARGETED.has(eff.kind)) {
    const toSelf = eff.target === 'ally';
    ref = { kind: 'leader', player: toSelf ? u.owner : opponentOf(u.owner) };
  }
  applyOne(s, u.owner, eff, ref, undefined, events, registry);
};

/**
 * Remove units at 0 HP, honoring death triggers: Zombified revives at 1 HP instead of
 * dying (a cleanse-type Kamikaze fires during revival so the unit returns with no
 * statuses); other Kamikaze effects fire before removal. Loops so chain reactions fully
 * resolve.
 *
 * @param killerIid - iid of the unit that dealt the killing blow (from combat); used by
 *   Wrapper Bats' `target: 'killer'` Kamikaze to buff the attacker on death.
 */
export const processDeaths = (s: GameState, events: GameEvent[], killerIid?: string, registry?: Registry): void => {
  let changed = true;
  while (changed) {
    changed = false;
    for (const owner of [0, 1] as PlayerId[]) {
      for (const lane of LANES) {
        const laneObj = s.players[owner].lanes[lane];
        for (const slot of ['front', 'back'] as const) {
          const u = laneObj[slot];
          if (!u || u.hp > 0) continue;
          // Already resolving its death higher up the stack (Kamikaze damage → Polish →
          // nested processDeaths): don't re-fire its trigger, or it recurses forever.
          if (u.dying) continue;
          // The leader-unit (Riku) is never removed here — its death ends the game,
          // handled by reconcileLeaderUnit + checkGameOver. Leave it on the board.
          if (u.isLeaderUnit) continue;
          if (u.keywords.zombified) {
            // Fire any cleanse-type Kamikaze during revive so the unit rises with clean status.
            if (u.keywords.kamikaze?.kind === 'cleanse') runKamikaze(s, u, lane, events, undefined, registry);
            u.hp = 1;
            delete u.keywords.zombified;
            events.push({ t: 'zombieRevive', iid: u.iid });
            continue;
          }
          u.dying = true; // guard against nested re-entry while the death trigger resolves
          if (u.keywords.kamikaze) runKamikaze(s, u, lane, events, killerIid, registry);
          events.push({ t: 'unitDestroyed', iid: u.iid, cardId: u.cardId });
          laneObj[slot] = undefined;
          changed = true;
        }
        if (!laneObj.front && laneObj.back) {
          laneObj.front = laneObj.back;
          laneObj.back = undefined;
        }
        // A standalone Foundation is a full unit and dies through the same triggers, but it
        // lives in its own slot (no back-promotion) and emits `foundationDestroyed` so combat
        // and the UI treat it as a Foundation loss.
        const sf = laneObj.standaloneFoundation;
        if (sf && sf.hp <= 0 && !sf.dying) {
          if (sf.keywords.zombified) {
            if (sf.keywords.kamikaze?.kind === 'cleanse') runKamikaze(s, sf, lane, events, undefined, registry);
            sf.hp = 1;
            delete sf.keywords.zombified;
            events.push({ t: 'zombieRevive', iid: sf.iid });
          } else {
            sf.dying = true;
            if (sf.keywords.kamikaze) runKamikaze(s, sf, lane, events, killerIid, registry);
            events.push({ t: 'foundationDestroyed', iid: sf.iid, hostIid: '' });
            laneObj.standaloneFoundation = undefined;
            changed = true;
          }
        }
      }
    }
  }
};

/** Effects that help their target (so 'leader'/'any' default to the caster's own side). */
const BENEFICIAL: ReadonlySet<Effect['kind']> = new Set(['heal', 'buff', 'energy', 'draw', 'cleanse']);

const unitsOf = (s: GameState, player: PlayerId): UnitInstance[] =>
  LANES.flatMap((l) => laneUnits(s.players[player].lanes[l]));

/** First lane (in order) with an open slot on `player`'s side, excluding `exceptLane`. */
const firstOpenLane = (s: GameState, player: PlayerId, exceptLane?: LaneId): LaneId | undefined =>
  LANES.find((l) => l !== exceptLane && (!s.players[player].lanes[l].front || !s.players[player].lanes[l].back));

/**
 * Resolve a unit's triggered effects (At entry / Before attacking / At end of turn /
 * At start of turn) with automatic targeting — no player input required.
 *
 * Targeting by scope, made polarity-aware so beneficial effects default to your own side:
 *  - 'self'   → the unit itself
 *  - 'enemy'  → every enemy unit (AOE); else the enemy leader
 *  - 'ally'   → most-hurt ally (excluding self); else your own leader
 *  - 'leader' → your own leader for beneficial effects, otherwise the enemy leader
 *  - 'any'/—  → beneficial: most-hurt ally (else own leader); harmful: weakest enemy (else enemy leader)
 *
 * `move` and `expel` act on a single auto-picked unit; `move` sends it to the first open lane.
 */
export const applyTriggeredEffects = (
  s: GameState,
  source: UnitInstance,
  effects: Effect[],
  events: GameEvent[],
  opts?: { interactive?: boolean },
  registry?: Registry,
): void => {
  const owner = source.owner;
  const opp = opponentOf(owner);

  // Lane-aware targeting: prefer units in the same lane column before falling back to the
  // full board. Source may not be on the board (e.g. Kamikaze after death), so loc is optional.
  const sourceLoc = locateUnit(s, source.iid);
  const srcLane = sourceLoc?.lane;

  /** Enemy units in the source's lane (both slots), in front→back order. */
  const laneEnemies = (): UnitInstance[] =>
    srcLane ? laneUnits(s.players[opp].lanes[srcLane]) : [];

  /** Ally units in the source's lane, excluding source itself. */
  const laneAllies = (): UnitInstance[] =>
    srcLane ? laneUnits(s.players[owner].lanes[srcLane]).filter((u) => u.iid !== source.iid) : [];

  for (const effect of effects) {
    const scope = effect.target;
    const beneficial = BENEFICIAL.has(effect.kind);

    // Player-scoped effects fire unconditionally — no unit target needed.
    if (effect.kind === 'draw' || effect.kind === 'energy' || effect.kind === 'forget') {
      applyOne(s, owner, effect, undefined, undefined, events, registry);
      continue;
    }

    // Creation / side-scoped effects fire once, reading their own `target` for the side.
    if (effect.kind === 'summon' || effect.kind === 'conjure' || effect.kind === 'costMod') {
      applyOne(s, owner, effect, undefined, undefined, events, registry);
      continue;
    }

    // Relocation / removal effects act on one unit at a time (and need a destination for `move`).
    if (effect.kind === 'move' || effect.kind === 'expel') {
      // Interactive: queue a per-activation choice for the player to resolve.
      if (opts?.interactive) {
        (s.pending ??= []).push({ player: owner, sourceIid: source.iid, kind: effect.kind, scope: scope ?? 'any' });
        continue;
      }
      // Lane-aware pool: prefer same-lane units; fall back to full board.
      const pool =
        scope === 'self' ? [source]
        : scope === 'ally'
          ? (laneAllies().length ? laneAllies() : unitsOf(s, owner).filter((u) => u.iid !== source.iid))
          : (laneEnemies().length ? laneEnemies() : unitsOf(s, opp)); // 'enemy' / 'any' / undefined
      const pick = pool[0];
      if (!pick) continue;
      if (effect.kind === 'move') {
        const pickLoc = locateUnit(s, pick.iid);
        const dest = pickLoc ? firstOpenLane(s, pickLoc.owner, pickLoc.lane) : undefined;
        if (dest) applyOne(s, owner, effect, { kind: 'unit', iid: pick.iid }, dest, events, registry);
      } else {
        applyOne(s, owner, effect, { kind: 'unit', iid: pick.iid }, undefined, events, registry);
      }
      continue;
    }

    if (scope === 'self') {
      applyOne(s, owner, effect, { kind: 'unit', iid: source.iid }, undefined, events, registry);
    } else if (scope === 'all-enemy') {
      // AOE: every enemy unit. No fallback — does nothing if board is empty.
      for (const e of unitsOf(s, opp))
        applyOne(s, owner, effect, { kind: 'unit', iid: e.iid }, undefined, events, registry);
    } else if (scope === 'all-ally') {
      // AOE: every allied unit excluding self. No fallback.
      for (const a of unitsOf(s, owner).filter((u) => u.iid !== source.iid))
        applyOne(s, owner, effect, { kind: 'unit', iid: a.iid }, undefined, events, registry);
    } else if (scope === 'lane-enemy') {
      // Same-lane enemies only. No cross-lane or leader fallback.
      const pick = laneEnemies()[0];
      if (pick) applyOne(s, owner, effect, { kind: 'unit', iid: pick.iid }, undefined, events, registry);
    } else if (scope === 'lane-ally') {
      // Same-lane allies only (most-hurt). No cross-lane or leader fallback.
      const candidates = laneAllies().filter((u) => u.hp < u.maxHp);
      const pick = candidates.length
        ? candidates.reduce((a, b) => (a.maxHp - a.hp >= b.maxHp - b.hp ? a : b))
        : laneAllies()[0];
      if (pick) applyOne(s, owner, effect, { kind: 'unit', iid: pick.iid }, undefined, events, registry);
    } else if (scope === 'enemy') {
      // Lane-aware single enemy (same-lane first, then any enemy). No leader fallback.
      const pick = laneEnemies()[0] ?? unitsOf(s, opp)[0];
      if (pick) applyOne(s, owner, effect, { kind: 'unit', iid: pick.iid }, undefined, events, registry);
    } else if (scope === 'ally') {
      // Lane-aware single ally (most-hurt same-lane first, then board-wide). No leader fallback.
      const laneHurt = laneAllies().filter((u) => u.hp < u.maxHp);
      const boardHurt = unitsOf(s, owner).filter((u) => u.iid !== source.iid && u.hp < u.maxHp);
      const candidates = laneHurt.length ? laneHurt : boardHurt;
      if (candidates.length > 0) {
        const most = candidates.reduce((a, b) => (a.maxHp - a.hp >= b.maxHp - b.hp ? a : b));
        applyOne(s, owner, effect, { kind: 'unit', iid: most.iid }, undefined, events, registry);
      }
    } else if (scope === 'leader') {
      applyOne(s, owner, effect, { kind: 'leader', player: beneficial ? owner : opp }, undefined, events, registry);
    } else if (beneficial) {
      // 'any'/undefined, beneficial: most-hurt same-lane ally → board-wide most-hurt ally. No leader fallback.
      const laneHurt = laneAllies().filter((u) => u.hp < u.maxHp);
      const boardHurt = unitsOf(s, owner).filter((u) => u.hp < u.maxHp);
      const candidates = laneHurt.length ? laneHurt : boardHurt;
      if (candidates.length > 0) {
        const most = candidates.reduce((a, b) => (a.maxHp - a.hp >= b.maxHp - b.hp ? a : b));
        applyOne(s, owner, effect, { kind: 'unit', iid: most.iid }, undefined, events, registry);
      }
    } else {
      // 'any'/undefined, harmful: same-lane enemy → weakest enemy anywhere. No leader fallback.
      const primary = laneEnemies();
      const enemies = unitsOf(s, opp);
      if (primary.length > 0) {
        applyOne(s, owner, effect, { kind: 'unit', iid: primary[0]!.iid }, undefined, events, registry);
      } else if (enemies.length > 0) {
        const weakest = enemies.reduce((a, b) => (a.hp <= b.hp ? a : b));
        applyOne(s, owner, effect, { kind: 'unit', iid: weakest.iid }, undefined, events, registry);
      }
    }
  }
  processDeaths(s, events, undefined, registry);
};

/** Back-compat alias: on-play (At entry) effects use the shared auto-targeting resolver. */
export const applyOnPlayEffects = applyTriggeredEffects;

/**
 * Polish trigger — fires every time the unit takes damage of any kind. Applies the stat
 * gain and/or runs the authored effects (self-/auto-targeted). Call this at every damage
 * site (combat, retaliation, Spike, Burn, Poison, Smelt, spells, leader abilities).
 */
export const firePolish = (
  s: GameState,
  u: UnitInstance,
  events: GameEvent[],
  registry?: Registry,
): void => {
  const p = u.keywords.polish;
  if (!p) return;
  if (p.stat) buffUnit(u, p.stat, events);
  if (p.effects?.length) applyTriggeredEffects(s, u, p.effects, events, undefined, registry);
};

/**
 * THE single chokepoint for dealing damage to a unit. Applies `amount` through mitigation
 * (or as raw true damage via `opts.raw`), then fires Polish whenever damage actually lands.
 * EVERY unit-damage source — combat, retaliation, Spike, Burn, Poison, Smelt, spells,
 * abilities — routes through here, so Polish reacts to all damage automatically; no damage
 * site ever wires up `firePolish` itself.
 *
 * `emit` runs once, after HP has changed and before Polish, so the caller can log its own
 * source-specific event (damageUnit / burnTick / poisonTick / spike / retaliate / …) with
 * the correct post-damage HP. Returns the damage that landed.
 */
export const dealUnitDamage = (
  s: GameState,
  target: UnitInstance,
  amount: number,
  opts: DamageOpts,
  events: GameEvent[],
  registry: Registry | undefined,
  emit?: (landed: number) => void,
): number => {
  const landed = mitigate(target, amount, opts, events);
  // Record absorbed damage for match stats (Tough/Shield/True Shield/Freeze). Raw damage
  // (Burn/Poison/Spike/Smelt) bypasses mitigation, so nothing is "blocked" there.
  const blocked = opts.raw ? 0 : amount - landed;
  if (blocked > 0) events.push({ t: 'mitigated', victim: target.owner, amount: blocked });
  if (landed > 0) {
    emit?.(landed);
    firePolish(s, target, events, registry);
  }
  return landed;
};

// Wire Polish into damage.ts so leader-unit damage (handled there for the HP/Signature
// bookkeeping) fires Polish without a static import cycle. See `setDamageTriggerHook`.
setDamageTriggerHook(firePolish);

/**
 * Bloodlust trigger — fires when `killer` destroys `victim`. Applies the stat buff and/or
 * runs the authored effects. A Foundation stack counts as two kills for the stat buff.
 */
export const fireBloodlust = (
  s: GameState,
  killer: UnitInstance,
  victim: UnitInstance,
  events: GameEvent[],
  registry?: Registry,
): void => {
  const bl = killer.keywords.bloodlust;
  if (!bl) return;
  const times = victim.foundation ? 2 : 1;
  if (bl.buff) for (let i = 0; i < times; i++) buffUnit(killer, bl.buff, events);
  if (bl.effects?.length) applyTriggeredEffects(s, killer, bl.effects, events, undefined, registry);
};

/**
 * Resolve a list of effects from one caster. Returns an error string if any effect
 * is invalid (the caller should treat the whole action as rejected before mutating
 * shared state — so callers pass a draft and discard it on error).
 */
export const applyEffects = (
  s: GameState,
  caster: PlayerId,
  effects: Effect[],
  targets: TargetRef[],
  lane: LaneId | undefined,
  events: GameEvent[],
  registry?: Registry,
): string | null => {
  let cursor = 0;
  for (const effect of effects) {
    // AOE scopes fan out to every unit on the side without consuming a target ref.
    if (AOE_SCOPES.has(effect.target)) {
      const side: PlayerId = effect.target === 'all-enemy' ? opponentOf(caster) : caster;
      const pool = LANES.flatMap((l) => laneUnits(s.players[side].lanes[l]));
      if (pool.length > 0) {
        for (const u of pool) {
          const r = applyOne(s, caster, effect, { kind: 'unit', iid: u.iid }, lane, events, registry);
          if (r && 'error' in r) return r.error;
        }
      } else {
        const fallback: TargetRef = { kind: 'leader', player: side };
        const r = applyOne(s, caster, effect, fallback, lane, events, registry);
        if (r && 'error' in r) return r.error;
      }
      continue;
    }
    // `leaderUnit` scope auto-resolves to the caster's own leader-unit — no ref consumed.
    if (effect.target === 'leaderUnit') {
      const lu = findLeaderUnit(s, caster);
      if (lu) {
        const r = applyOne(s, caster, effect, { kind: 'unit', iid: lu.iid }, lane, events, registry);
        if (r && 'error' in r) return r.error;
      }
      continue;
    }
    const needsRef = TARGETED.has(effect.kind) || (effect.kind === 'energy' && effect.chooseElement);
    const ref = needsRef ? targets[cursor++] : undefined;
    const result = applyOne(s, caster, effect, ref, lane, events, registry);
    if (result && 'error' in result) return result.error;
  }
  processDeaths(s, events, undefined, registry);
  return null;
};
