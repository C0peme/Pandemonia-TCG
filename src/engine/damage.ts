/**
 * Shared damage mitigation, used by both combat and ability/spell effects.
 *
 * Immunity does NOT block damage (combat or ability) — it protects against status
 * effects, displacement (expel/move) and offensive abilities (Lethal, Undershot's
 * defense-pierce). `ignoreDefenses` is Undershot and is itself stopped by Immunity.
 */
import { LANES, RULES } from '@engine/constants';
import { NULL_CARD_ID, NULL_HOLD_DAMAGE, NULL_KAMIKAZE_DAMAGE } from '@cards/special';
import type { GameEvent } from '@engine/events';
import { grantSignatureIfRoom, unlockSignature } from '@engine/signature';
import type { GameState, PlayerId, PlayerState, UnitInstance } from '@engine/types';
import type { Registry } from '@cards/registry';

/**
 * Polish-on-damage trigger, wired by effects.ts at load time. damage.ts owns the leader HP
 * and Signature bookkeeping; effects.ts owns the trigger machinery (applyTriggeredEffects),
 * so this hook lets a leader-unit's damage fire Polish without a static import cycle.
 */
type DamageTrigger = (s: GameState, u: UnitInstance, events: GameEvent[], registry?: Registry) => void;
let firePolishHook: DamageTrigger = () => {};
export const setDamageTriggerHook = (fn: DamageTrigger): void => {
  firePolishHook = fn;
};

/** Find a player's leader-unit (Riku), if one is on the board. */
export const findLeaderUnit = (s: GameState, player: PlayerId): UnitInstance | undefined => {
  for (const lane of LANES) {
    for (const slot of ['front', 'back'] as const) {
      const u = s.players[player].lanes[lane][slot];
      if (u?.isLeaderUnit) return u;
    }
  }
  return undefined;
};

/**
 * The Signature unlocks at HALF a leader's own maximum HP — not a fixed number — so
 * the rule scales correctly for any leader's starting HP (today that's uniformly
 * RULES.LEADER_HP=30, so the threshold is 15 exactly as before; Adventure's scaled-HP
 * enemies and any future non-30-HP leader both get a proportionally correct threshold
 * "for free"). `leaderMaxHp` is only absent in hand-built test fixtures, where it
 * falls back to the standard leader HP.
 */
export const signatureThreshold = (pl: PlayerState): number =>
  Math.floor((pl.leaderMaxHp ?? RULES.LEADER_HP) / 2);

/** Unlock + deliver a player's Signature if their leader HP is at/below the threshold. */
const checkSignature = (s: GameState, player: PlayerId, events: GameEvent[]): void => {
  const pl = s.players[player];
  if (!pl.signatureUnlocked && pl.leaderHp <= signatureThreshold(pl)) {
    unlockSignature(s, player, events);
    grantSignatureIfRoom(s, player, events);
  }
};

/**
 * Keep `leaderHp` in sync with a leader-unit's HP (the unit is the source of truth) and
 * fire the Signature unlock. No-op for leaders without a leader-unit. Called from the
 * game-over chokepoints so combat/burn/ability damage to the unit drives leaderHp.
 */
export const reconcileLeaderUnit = (s: GameState, events: GameEvent[]): void => {
  for (const player of [0, 1] as PlayerId[]) {
    const lu = findLeaderUnit(s, player);
    if (!lu) continue;
    s.players[player].leaderHp = lu.hp;
    checkSignature(s, player, events);
  }
};

export interface DamageOpts {
  /** Undershot: skip Shield/Tough (still stopped by True Shield / Immunity). */
  ignoreDefenses?: boolean;
  /**
   * True damage: bypass EVERY defense (Shield / Tough / True Shield / Immunity). Used by
   * damage-over-time and self-damage that never interacts with defenses — Burn, Poison,
   * Spike, Smelt, Foundation retaliation.
   */
  raw?: boolean;
}

/** Apply `amount` to a unit through its defenses. Returns the damage that landed. */
export const mitigate = (
  target: UnitInstance,
  amount: number,
  opts: DamageOpts,
  events: GameEvent[],
): number => {
  // Raw / true damage ignores all defenses and lands in full.
  if (opts.raw) {
    target.hp -= amount;
    return amount;
  }
  // Undershot (ignoreDefenses) pierces ALL defensive abilities — including True Shield
  // and Shield — and is only stopped by Immunity.
  const ignore = Boolean(opts.ignoreDefenses) && !target.keywords.immunity;
  if (!ignore && target.keywords.trueShield) {
    events.push({ t: 'blocked', iid: target.iid, source: 'trueShield' });
    return 0;
  }

  let landed: number;
  if (!ignore && target.shield && target.shield > 0) {
    target.shield -= 1;
    if (target.shield === 0) delete target.keywords.shield;
    events.push({ t: 'blocked', iid: target.iid, source: 'shield' });
    landed = 0;
  } else {
    let amt = amount;
    if (!ignore && target.keywords.tough) amt = Math.max(0, amt - target.keywords.tough);
    target.hp -= amt;
    landed = amt;
  }

  // Polish now fires from a dedicated trigger (see effects.firePolish) at every damage
  // site, so it is no longer applied here.
  return landed;
};

/**
 * Bleed a player for shedding a Null — the single implementation for every way one can leave
 * (destroyed in play, forgotten, expelled or drawn into a full hand), so no route is cheaper
 * than another.
 */
export const nullBleed = (s: GameState, player: PlayerId, events: GameEvent[]): void =>
  damageLeader(s, player, NULL_KAMIKAZE_DAMAGE, events);

/**
 * Charge the per-turn tax for Nulls sitting in hand — `NULL_HOLD_DAMAGE` each, so the cost
 * compounds with the number held. See `NULL_HOLD_DAMAGE` for why holding had to stop being
 * free. Charged at the holder's start of turn, AFTER the draw step, so a Null starts costing
 * the turn it arrives.
 */
export const nullHoldTax = (s: GameState, player: PlayerId, events: GameEvent[]): void => {
  const held = s.players[player].hand.filter((c) => c.cardId === NULL_CARD_ID).length;
  if (held <= 0) return;
  // `AD_HOLD` lets a balance harness sweep this rate without editing data between runs; it is
  // read per call so it can never be baked into a build. Unset everywhere except .tuning.
  const override = typeof process !== 'undefined' ? process.env?.AD_HOLD : undefined;
  const rate = Number(override ?? NULL_HOLD_DAMAGE);
  if (rate <= 0) return;
  events.push({ t: 'nullHold', player, held });
  damageLeader(s, player, rate * held, events);
};

/** Damage a leader, unlocking its Signature ability at the HP threshold. */
export const damageLeader = (
  s: GameState,
  player: PlayerId,
  amount: number,
  events: GameEvent[],
  registry?: Registry,
): void => {
  const pl = s.players[player];
  // Riku: "leader damage" lands on the leader-unit (the leader itself is never hit). The
  // leader-unit is a real board unit, so it takes damage through its defenses (Tough /
  // Shield / True Shield) and fires Polish, exactly like any other unit.
  const lu = findLeaderUnit(s, player);
  if (lu) {
    const landed = mitigate(lu, amount, {}, events);
    if (landed > 0) {
      events.push({ t: 'damageUnit', iid: lu.iid, amount: landed, hpAfter: lu.hp, victim: lu.owner });
      firePolishHook(s, lu, events, registry);
    }
    pl.leaderHp = lu.hp;
  } else {
    pl.leaderHp -= amount;
    events.push({ t: 'damageLeader', player, amount, hpAfter: pl.leaderHp });
  }
  checkSignature(s, player, events);
};

/** Heal a leader, capped at the maximum leader HP. */
export const healLeader = (
  s: GameState,
  player: PlayerId,
  amount: number,
  events: GameEvent[],
): void => {
  const pl = s.players[player];
  // Riku: healing the leader heals the leader-unit (capped at its max HP).
  const lu = findLeaderUnit(s, player);
  if (lu) {
    if (lu.status.poisoned || s.bossRules?.disciplined === player) return; // Poison / Discipline blocks healing
    lu.hp = Math.min(lu.maxHp, lu.hp + amount);
    pl.leaderHp = lu.hp;
    events.push({ t: 'heal', iid: lu.iid, amount, victim: lu.owner });
    return;
  }
  pl.leaderHp = Math.min(pl.leaderMaxHp ?? RULES.LEADER_HP, pl.leaderHp + amount);
  events.push({ t: 'heal', player, amount });
};

/** Heal a unit, capped at its max HP. Poison blocks healing entirely (returns false). */
export const healUnit = (u: UnitInstance, amount: number, events: GameEvent[], disciplined = false): boolean => {
  // Poison blocks healing; Aleph's Discipline boss rule generalises the same gate to a
  // whole side (see `BossRules.disciplined`).
  if (u.status.poisoned || disciplined) return false;
  u.hp = Math.min(u.maxHp, u.hp + amount);
  events.push({ t: 'heal', iid: u.iid, amount, victim: u.owner });
  return true;
};

