/**
 * Player actions the engine accepts. Each action is plain, serializable data so it
 * can be sent over a network later and replayed deterministically.
 */
import type { Element, LaneId } from '@engine/constants';
import type { PlayerId } from '@engine/types';

export type LanePosition = 'front' | 'back';

/** A concrete target for an effect. */
export type TargetRef =
  | { kind: 'unit'; iid: string }
  | { kind: 'leader'; player: PlayerId }
  | { kind: 'element'; element: Element };

export type Action =
  /** `sacrifice` lists own unit iids to destroy for a Sacrifice unit's buff. */
  | { type: 'playUnit'; iid: string; lane: LaneId; position?: LanePosition; sacrifice?: string[] }
  | { type: 'playFoundation'; iid: string; lane: LaneId; position?: LanePosition }
  | { type: 'playEnvironment'; iid: string; lane: LaneId }
  /** `targets` are consumed in order by the effects that need one; `lane` is a Move destination. */
  | { type: 'playSpell'; iid: string; targets?: TargetRef[]; lane?: LaneId }
  | { type: 'heroPower'; targets?: TargetRef[]; lane?: LaneId }
  /**
   * Ends the turn. Per the combat model this also DECLARES THE ATTACK: the active
   * player's units resolve combat before the turn passes. `bank` optionally overflows
   * leftover energy into banked elements.
   */
  | { type: 'endTurn'; bank?: Partial<Record<Element, number>>; sniperChoices?: Partial<Record<string, LaneId>> }
  /** Move any unit on the board to a different lane (used by Mover-keyword on-play effect). */
  | { type: 'moveUnit'; targetIid: string; toLane: LaneId }
  /**
   * Resolve the first queued interactive move/expel choice (`state.pending`).
   * `targetIid` is the chosen unit (and `toLane` its destination for a move);
   * omit `targetIid` to skip this activation (e.g. no legal target).
   */
  | { type: 'resolvePending'; targetIid?: string; toLane?: LaneId }
  /**
   * Resolve the first queued bonus attack (`state.extraActions`) that needed the player to
   * aim it — a Sniper eligible to redirect (Heights or Airborne). `lane` is the enemy lane it
   * strikes. Non-Sniper (or otherwise ineligible) bonus attacks resolve immediately without
   * ever reaching this action; see `extraActionNeedsAim` in `combat.ts`.
   */
  | { type: 'resolveExtraAction'; lane: LaneId }
  /** Debug only — add a card directly to the active player's hand. */
  | { type: 'debugAddCard'; cardId: string }
  /** Debug only — set the active player's energy to a large amount. */
  | { type: 'debugMaxEnergy' }
  /** Sandbox only — place a unit card directly onto either player's board (ready to act). */
  | { type: 'debugPlaceUnit'; cardId: string; player: PlayerId; lane: LaneId; position?: LanePosition }
  /** Sandbox only — apply (or clear) a status on a unit anywhere on the board. */
  | { type: 'debugApplyStatus'; iid: string; status: 'burn' | 'poison' | 'sleep' | 'freeze' | 'drowning' | 'clear' }
  /** Sandbox only — remove a single unit from the board. */
  | { type: 'debugRemoveUnit'; iid: string }
  /** Sandbox only — remove every unit from both boards. */
  | { type: 'debugClearBoard' };
