/**
 * End-of-turn resolution, in order: Burn EXPIRY → Smelt → Growth → Sleep healing → Poison,
 * then card-authored "At end of turn" effects (which include Producer / Healer / Mover,
 * folded into trigger arrays by expandKeywordEffects).
 *
 * Note the first step is expiry, NOT damage: Burn deals its damage in combat, right before a
 * unit attacks or retaliates (`procBurn` in combat.ts), so a Burned unit that never acts takes
 * none. That is deliberate — Burn punishes aggression — but it makes Burn and Poison behave
 * very differently despite reading alike, so don't assume symmetry when authoring.
 *
 * Damage-over-time timings across the engine, none of which line up (each was added at a
 * different point; they are listed here so the divergence is at least visible in one place):
 *   - Burn     — in combat, per act, owner's units, expires at owner's end of turn
 *   - Poison   — end of EVERY turn, BOTH players' units, persists until cleansed
 *   - Drowning — start of the owner's turn, persists while the unit is stuck in Water
 *
 * Decision: except where noted (Poison), these resolve for the ACTIVE (ending) player's units
 * only — they belong to that player and fire once per round at their own turn end. Freeze
 * duration also ticks here.
 */
import { LANES, RULES, type LaneId } from '@engine/constants';
import { buffUnit, laneUnits } from '@engine/board';
import { applyFoundation } from '@engine/foundation';
import { reconcileDrowning } from '@engine/drowning';
import { applyTriggeredEffects, processDeaths, dealUnitDamage } from '@engine/effects';
import type { Registry } from '@cards/registry';
import type { GameEvent } from '@engine/events';
import { type GameState, type PlayerId, type UnitInstance } from '@engine/types';

/**
 * Transform a unit into its Metamorphosis form, preserving damage taken.
 *
 * Metamorphosis changes the UNIT, not the ground it stands on: a Foundation beneath it
 * survives and keeps granting to the new form. Rebuilding the unit from the new card wipes
 * `keywords`/`onHit`/trigger arrays wholesale, so the Foundation's grants have to be
 * re-applied on top afterwards — otherwise they vanish while the FoundationInstance still
 * claims (via `appliedKeywordKeys`/`appliedTriggers`) that they are present, and a later
 * revert would splice effects off the NEW form and delete keywords it owns.
 */
const metamorphose = (registry: Registry, u: UnitInstance, lane: LaneId, events: GameEvent[]): void => {
  const meta = u.keywords.metamorphosis;
  if (!meta?.into) return;
  const into = registry.cards.get(meta.into);
  if (!into || into.type !== 'unit') return;
  const deficit = u.maxHp - u.hp; // damage carries over
  const f = u.foundation;
  u.cardId = into.id;
  u.attack = Math.max(0, into.attack + (meta.gains?.attack ?? 0));
  u.maxHp = into.hp + (meta.gains?.hp ?? 0);
  u.hp = Math.max(1, u.maxHp - deficit);
  u.keywords = { ...into.keywords };
  u.onHit = into.onHit ? { ...into.onHit } : undefined;
  u.onAttack = into.onAttack ? structuredClone(into.onAttack) : undefined;
  u.endOfTurn = into.endOfTurn ? structuredClone(into.endOfTurn) : undefined;
  u.startOfTurn = into.startOfTurn ? structuredClone(into.startOfTurn) : undefined;
  u.shield = into.keywords.shield;
  u.turnsInPlay = 0;

  // Re-bond the surviving Foundation to the new form, regenerating its bookkeeping against
  // the new base. Its own accumulated damage (`hp`) and identity (`iid`) carry over.
  if (f) {
    const fCard = registry.cards.get(f.cardId);
    if (fCard && fCard.type === 'foundation') {
      u.foundation = applyFoundation(u, fCard, f.iid, lane);
      u.foundation.hp = f.hp;
    }
  }
  // The new form may swim or fly where the old one did not (or vice versa).
  reconcileDrowning(u, lane);
  events.push({ t: 'transform', iid: u.iid, into: into.id });
};

// Includes standalone Foundations — they are full units, so burn/growth/sleep/poison/freeze,
// aging, and summoning-sickness clearing all apply to them through this one loop.
const activeUnits = (s: GameState, player: PlayerId): UnitInstance[] =>
  LANES.flatMap((lane) => laneUnits(s.players[player].lanes[lane]));

/** As `activeUnits`, but keeping each unit's lane (Metamorphosis needs it to re-bond/re-drown). */
const activeUnitsWithLane = (s: GameState, player: PlayerId): { unit: UnitInstance; lane: LaneId }[] =>
  LANES.flatMap((lane) => laneUnits(s.players[player].lanes[lane]).map((unit) => ({ unit, lane })));

export const resolveEndOfTurn = (
  s: GameState,
  player: PlayerId,
  events: GameEvent[],
  registry?: Registry,
): void => {
  // Burn expiry (owner-only). Burn dealt its damage during combat, right before the unit
  // attacked or retaliated (see combat.ts `procBurn`); here its one-turn lifespan simply ends.
  for (const u of activeUnits(s, player)) {
    if (u.status.burn) delete u.status.burn;
  }

  // Smelt — only fires if the unit has strictly more HP than the cost (leaves ≥ 1 HP).
  for (const u of activeUnits(s, player)) {
    if (u.keywords.smelt && u.hp > u.keywords.smelt.hpCost) {
      dealUnitDamage(s, u, u.keywords.smelt.hpCost, { raw: true }, events, registry, (amount) =>
        events.push({ t: 'damageUnit', iid: u.iid, amount, hpAfter: u.hp, victim: u.owner }),
      );
      // Run the Smelt exchange through the shared trigger machinery, so it honors the
      // authored target scope and supports every effect kind (heal, summon, conjure, …).
      applyTriggeredEffects(s, u, [u.keywords.smelt.effect], events, undefined, registry);
    }
  }
  processDeaths(s, events, undefined, registry);

  // 3. Growth
  for (const u of activeUnits(s, player)) {
    if (u.keywords.growth) {
      const before = { a: u.attack, h: u.maxHp };
      buffUnit(u, u.keywords.growth, events);
      events.push({ t: 'growth', iid: u.iid, attack: u.attack - before.a, hp: u.maxHp - before.h });
    }
  }

  // 4. Sleep healing + duration tick
  for (const u of activeUnits(s, player)) {
    if (u.status.sleep) {
      const heal = u.status.sleepHeal ?? 0;
      if (heal > 0) {
        u.hp = Math.min(u.maxHp, u.hp + heal);
        events.push({ t: 'heal', iid: u.iid, amount: heal, victim: u.owner, source: 'sleep' });
      }
      u.status.sleep -= 1;
      if (u.status.sleep <= 0) {
        u.status.sleep = 0;
        delete u.status.sleepHeal;
        events.push({ t: 'wake', iid: u.iid, from: 'sleep' });
      }
    }
  }

  // Poison ticks at the end of EVERY turn, for BOTH players' units (not just the active side),
  // and persists until cleansed.
  for (const pid of [0, 1] as PlayerId[]) {
    for (const u of activeUnits(s, pid)) {
      if (u.status.poisoned) {
        dealUnitDamage(s, u, u.status.poisoned, { raw: true }, events, registry, (amount) =>
          events.push({ t: 'poisonTick', iid: u.iid, amount, hpAfter: u.hp, victim: u.owner }),
        );
      }
    }
  }
  processDeaths(s, events, undefined, registry);

  // "At end of turn" effects (Producer / Healer / Mover are folded in by expandKeywordEffects)
  // fire for the ENDING player's units only — once per round, at the owner's own turn end.
  for (const u of activeUnits(s, player)) {
    if (u.endOfTurn?.length) applyTriggeredEffects(s, u, u.endOfTurn, events, undefined, registry);
  }

  // Freeze duration tick (not damage-related; kept out of the ordered list above).
  for (const u of activeUnits(s, player)) {
    if (u.status.freeze) {
      u.status.freeze -= 1;
      if (u.status.freeze <= 0) {
        u.status.freeze = 0;
        events.push({ t: 'wake', iid: u.iid, from: 'freeze' });
      }
    }
  }

  // Clear summoning sickness (a unit played this turn can attack from next turn on).
  // `activeUnits` includes standalone Foundations, so their sickness clears here too.
  for (const u of activeUnits(s, player)) {
    u.justPlaced = false;
  }

  // Age units and resolve Metamorphosis.
  for (const { unit: u, lane } of activeUnitsWithLane(s, player)) {
    u.turnsInPlay += 1;
    if (registry && u.keywords.metamorphosis && u.turnsInPlay >= u.keywords.metamorphosis.everyTurns) {
      metamorphose(registry, u, lane, events);
    }
  }
};

/**
 * Start-of-turn resolution for the player whose turn is beginning:
 *   - True Shield expires (it blocked through the opponent's turn).
 *   - Drowning units take RULES.DROWN_DAMAGE (they are on a clock, not dead weight).
 *   - "At start of turn" effects fire (Healer / Mover with a startOfTurn trigger are folded
 *     into this array by expandKeywordEffects), auto-targeted, for this player's units only.
 */
export const resolveStartOfTurn = (
  s: GameState,
  player: PlayerId,
  events: GameEvent[],
  registry?: Registry,
): void => {
  for (const u of activeUnits(s, player)) {
    if (u.keywords.trueShield) {
      delete u.keywords.trueShield;
      events.push({ t: 'statusExpired', iid: u.iid, status: 'trueShield', victim: u.owner });
    }
  }

  // Drowning: raw damage (like Burn/Poison) so a drowning unit slowly succumbs. It keeps
  // 0 attack but can still body-block an Aquatic attacker until it goes under.
  for (const u of activeUnits(s, player)) {
    if (!u.status.drowning) continue;
    dealUnitDamage(s, u, RULES.DROWN_DAMAGE, { raw: true }, events, registry, (amount) =>
      events.push({ t: 'drownTick', iid: u.iid, amount, hpAfter: u.hp, victim: u.owner }),
    );
  }
  processDeaths(s, events, undefined, registry);

  for (const u of activeUnits(s, player)) {
    if (u.startOfTurn?.length) applyTriggeredEffects(s, u, u.startOfTurn, events, undefined, registry);
  }
};
