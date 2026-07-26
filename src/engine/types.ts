/**
 * Engine state model.
 *
 * Design rules:
 * - State is plain data (serializable: no class instances, no functions, no Maps).
 * - Card *definitions* live in the registry (static content) and are passed to the
 *   engine alongside the state — they are NOT stored here. State holds only instances.
 * - The active player attacks at the end of their own turn ("Declare Attack ends the turn").
 */
import type { Element, LaneId } from '@engine/constants';
import type { Effect, Keywords, OnHit, TargetScope } from '@cards/schema';
import type { Rng } from '@engine/rng';

export type PlayerId = 0 | 1;
export const opponentOf = (p: PlayerId): PlayerId => (p === 0 ? 1 : 0);

/** A card sitting in a hand, deck, or discard pile. */
export interface CardInstance {
  iid: string;
  cardId: string;
}

/** Status effects currently on a unit. */
export interface StatusState {
  /** Burn damage applied at end of each turn. */
  burn?: number;
  /** Constant damage dealt at the end of each of the owner's turns; persists until removed. */
  poisoned?: number;
  /** Turns of Sleep remaining. */
  sleep?: number;
  /** HP healed each turn while asleep. */
  sleepHeal?: number;
  /** Turns of Freeze remaining. */
  freeze?: number;
  /** A unit placed in Water without water-compatibility: 0 attack, body only. */
  drowning?: boolean;
}

/** A Foundation card stacked beneath a unit. */
export interface FoundationInstance {
  iid: string;
  cardId: string;
  hp: number;
  /** Stat bonus this Foundation granted to the host (for reversion if destroyed). */
  appliedStat: { attack?: number; hp?: number };
  /** Keyword keys this Foundation added to the host (so they can be removed). */
  appliedKeywordKeys: string[];
  /** Shield count this Foundation granted (subtracted, not zeroed, on reversion). */
  appliedShield?: number;
  /** True if this Foundation set the host's onHit (cleared on reversion). */
  appliedOnHit?: boolean;
  /** Counts of triggered effects this Foundation appended to the host (spliced off on revert). */
  appliedTriggers?: { onAttack: number; endOfTurn: number; startOfTurn: number };
}

/** A unit in play. Current stats are denormalized here; recompute on changes. */
export interface UnitInstance {
  iid: string;
  cardId: string;
  owner: PlayerId;
  attack: number;
  hp: number;
  maxHp: number;
  /** Effective keywords (base ∪ foundation grants ∪ buffs). */
  keywords: Keywords;
  /** Status effects applied to whatever this unit hits. */
  onHit?: OnHit;
  /** Card-authored effects that fire just before this unit attacks ("Before attacking"). */
  onAttack?: Effect[];
  /** Card-authored effects that fire at the end of this unit's owner's turn. */
  endOfTurn?: Effect[];
  /** Card-authored effects that fire at the start of this unit's owner's turn. */
  startOfTurn?: Effect[];
  status: StatusState;
  foundation?: FoundationInstance;
  /** Remaining Shield instances (from the `shield` keyword). */
  shield?: number;
  /** Shield count granted by the lane's Environment (subtracted, not zeroed, on revert). */
  envShield?: number;
  /** Attack to restore if a drowning unit ever leaves Water (Water zeroes its attack). */
  predrownAttack?: number;
  /** Turns this unit has spent in play (drives Metamorphosis). */
  turnsInPlay: number;
  /** True on the turn a unit is placed — it cannot attack until next turn. */
  justPlaced: boolean;
  /** Keyword keys granted by the lane's Environment (so they can be cleanly reverted). */
  envKeywordKeys?: string[];
  /** Riku: this unit IS the leader. Its HP mirrors leaderHp; its death loses the game. */
  isLeaderUnit?: boolean;
  /** True while this unit is a standalone Foundation (a base layer awaiting a unit to bond).
   *  It lives in `Lane.standaloneFoundation` and fights as a full unit until a unit is placed
   *  on top, at which point it folds into that unit's `foundation` (see engine `playUnit`). */
  isFoundation?: boolean;
  /** Transient guard: set while its death trigger (Kamikaze) is resolving so a nested
   *  processDeaths (e.g. via Polish reacting to Kamikaze damage) can't re-fire it. The unit is
   *  removed from the board immediately after, so this never persists into stored state. */
  dying?: boolean;
}

export interface EnvironmentInstance {
  iid: string;
  cardId: string;
  owner: PlayerId;
}

/** A single lane. `front` is nearest the front; `back` exists only via Double Team. */
export interface Lane {
  front?: UnitInstance;
  back?: UnitInstance;
  /**
   * A Foundation placed in an empty lane before any unit arrives. It is a full `UnitInstance`
   * (flagged `isFoundation`) so it fights, takes damage/status, and is targeted through the
   * shared unit machinery. When a unit is placed on top it auto-bonds — the Foundation folds
   * into that unit's `foundation` (see engine `playUnit`) and this slot clears.
   */
  standaloneFoundation?: UnitInstance;
}

export type Lanes = Record<LaneId, Lane>;

export interface PlayerState {
  id: PlayerId;
  leaderId: string;
  leaderHp: number;
  /** This leader's maximum HP (the heal cap for a non-leader-unit leader). */
  leaderMaxHp?: number;
  /** True once the leader has dropped to the Signature HP threshold. */
  signatureUnlocked: boolean;
  /** The card to deliver to hand when the Signature unlocks. */
  signatureCardId: string;
  /** Unlocked but not yet delivered (e.g. the hand was full). */
  signaturePending: boolean;
  /** The Signature card has been delivered to hand (delivered at most once). */
  signatureGranted: boolean;
  /** Universal energy available this turn. */
  energy: number;
  /** Banked element energy. Each element is capped individually by `elementCaps`. */
  bank: Record<Element, number>;
  /** Per-element banking caps, copied from the leader at setup. */
  elementCaps: Record<Element, number>;
  hand: CardInstance[];
  deck: CardInstance[];
  discard: CardInstance[];
  lanes: Lanes;
  heroPowerUsed: boolean;
  /**
   * TEMPORARY additive modifiers to this player's card energy costs, by type. Positive
   * = more expensive, negative = discount. Cleared at the end of this player's own turn
   * (e.g. Anti Magic Field). For run-long discounts, use `costBase` instead.
   */
  costMods: { unit: number; spell: number; foundation: number; environment: number };
  /**
   * PERSISTENT additive cost modifiers, same shape as `costMods` but NEVER auto-cleared.
   * Set once at encounter build (Adventure leader uniques like Naife's Environment
   * discount, and cost-reduction relics) and read alongside `costMods` everywhere a
   * card's effective cost is computed. Optional for back-compat with states built before
   * it existed; absent is treated as all-zero.
   */
  costBase?: { unit: number; spell: number; foundation: number; environment: number };
  /**
   * Boss-curse per-turn card modifiers (Adventure only — set once at encounter build
   * time, never by ordinary gameplay). Applied in `beginTurn` after the normal draw.
   */
  turnCardMod?: { extraDraws?: number; millSelf?: number };
}

/**
 * A move/expel triggered effect awaiting a player's target choice (interactive
 * resolution — "per target per activation"). Queued FIFO; drained by `resolvePending`.
 */
export interface PendingChoice {
  /** The player who chooses (and the reference side for ally/enemy scope). */
  player: PlayerId;
  /** The unit whose effect this is (for UI labelling and `self` scope). */
  sourceIid: string;
  kind: 'move' | 'expel' | 'forget';
  scope: TargetScope;
}

export interface GameState {
  rng: Rng;
  round: number;
  /** Total turns taken (0-based count). */
  turn: number;
  active: PlayerId;
  first: PlayerId;
  players: Record<PlayerId, PlayerState>;
  phase: 'main' | 'ended';
  winner: PlayerId | null;
  /**
   * Lane Environments are shared, one per lane column (not per player). The Environment
   * sits "in the middle" between the two players and its effect applies to BOTH players'
   * units in that lane. Placing a new Environment in a lane replaces any existing one.
   */
  environments: Partial<Record<LaneId, EnvironmentInstance>>;
  /** Monotonic counter for minting instance ids. */
  iidSeq: number;
  /** Interactive move/expel choices awaiting player input (drained before play continues). */
  pending?: PendingChoice[];
  /**
   * Units owed a bonus attack (from an `extraAction` effect). Drained by the engine after
   * the triggering action resolves; each bonus attack incurs no retaliation.
   */
  extraActions?: string[];
  /**
   * Boss curse (Adventure only): fixes both players' turn energy to this value instead
   * of the round number. Set once at encounter build time.
   */
  energyOverride?: number;
}

export const emptyBank = (): Record<Element, number> => ({
  fire: 0,
  water: 0,
  nature: 0,
  earth: 0,
});
