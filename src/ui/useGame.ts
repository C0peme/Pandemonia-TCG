import { useEffect, useRef, useState } from 'react';
import { initGame } from '@engine/setup';
import { affordableCard, applyAction } from '@engine/engine';
import { chooseAction } from '@engine/ai';
import { resolveCombatByLane, type LaneCombatStep } from '@engine/combat';
import { resolveEndOfTurn } from '@engine/endOfTurn';
<<<<<<< Updated upstream
import type { Action, LanePosition, TargetRef } from '@engine/actions';
import { LANES, type Element, type LaneId } from '@engine/constants';
import { canAfford } from '@engine/energy';
=======
import type { Action, DebugKeyword, LanePosition, TargetRef } from '@engine/actions';
import { LANES, isHeights, type Element, type LaneId } from '@engine/constants';
>>>>>>> Stashed changes
import type { GameEvent } from '@engine/events';
import { autopilotActive, opponentOf, type GameState, type PlayerId, type UnitInstance } from '@engine/types';
import type { Card, Effect } from '@cards/schema';
import type { Registry } from '@cards/registry';
import { targetRefsNeeded, TARGETED, SELF_RESOLVING_SCOPES } from '@engine/effects';
import { getSnapshot } from '@cards/store';
import { useContent } from '@ui/useContent';
import type { Transport } from '@ui/net/NetClient';
import type { Role, ServerMsg } from '@net/protocol';
import {
  playAttackFx,
  playEventFlourishes,
  playExpelFx,
  playForgetFx,
  playKamikazeFx,
  playDeathFx,
  playPlayFx,
  playRevealFx,
  metaFadeOut,
  metaFadeIn,
  type AttackFx,
} from '@ui/combatFx';
import { ELEMENT_SYMBOL } from '@ui/ElementRune';
import { ELEMENT_NAME } from '@cards/abilities';
import { playSound, unlockAudio, preloadAll, playMusic } from '@ui/audio';
import { soundForEvent, soundForAttack, SOUND_NAMES } from '@ui/soundMap';

/**
 * Interaction model:
 * - Most cards are PLAYED BY DRAGGING from hand onto a lane (units/foundation/environment)
 *   or onto a target unit/leader (spells).
 * - Sacrifice units use a click ritual first: arm the card, click ally units (a dagger
 *   marks them), Confirm, and only then can the card be dragged onto the board.
 * - Hero Power is a button, then click a target.
 * - Move spells need a destination lane: after dropping on the target, a lane picker appears.
 * - Sniper units in Heights ask the player to pick a target lane before End Turn resolves.
 */
export type Selection =
  | { kind: 'none' }
  | { kind: 'card'; iid: string; card: Card }
  | { kind: 'sacrifice'; iid: string; card: Card; sacNeed: number; sac: string[]; confirmed: boolean }
  | { kind: 'hero' }
  /** Waiting for the player to pick a destination lane for a hero power that summons/moves
   *  into a lane the caster chooses (e.g. Autopus's Fallback Code). `target` is set when the
   *  power also needed a unit/leader click first (e.g. Naife's Misdirect). */
  | { kind: 'heroLane'; target?: TargetRef }
  /** Waiting for the player to pick a destination lane for a move spell. */
  | { kind: 'spellMove'; iid: string; card: Card; target: TargetRef }
  /**
   * Collecting targets for a spell that needs MORE THAN ONE. The first is supplied by the
   * drag-drop; the rest are clicked. Without this the UI always sent exactly one ref, so a
   * card with two targeted effects (Eksana's upgraded Swift Kill) failed on a full board.
   */
  | { kind: 'spellTargets'; iid: string; card: Card; refs: TargetRef[]; need: number }
  // The hero-power twin of `spellTargets`. Every power in the pool needed 0 or 1 target refs,
  // so the single-ref dispatch below was never wrong — until Noctua's Cocoon, which applies two
  // statuses and so consumes two. Without this the second effect reads `undefined`, the whole
  // activation is abandoned and even the first status is rolled back: the exact silent failure
  // multi-target spells were already fixed for (see CLAUDE.md, "Multi-target spells").
  | { kind: 'heroTargets'; refs: TargetRef[]; need: number }
  /** Waiting for the player to assign target lanes to each sniper before combat resolves. */
  | { kind: 'sniperPhase'; pending: Array<{ iid: string; lane: LaneId; name: string }>; choices: Partial<Record<string, LaneId>>; bank?: Partial<Record<Element, number>> }
  /** Resolving a queued interactive move/expel effect (`game.pending`). For a move, pick a unit then a lane. */
  | { kind: 'pending'; pickedUnit?: string }
  /** Waiting for the player to pick a lane for a Sniper's bonus attack (`game.extraActions`,
   *  from Adrenaline Rush, a signature like Overexert, etc.) — the same aim step as the
   *  End Turn sniper phase, just triggered mid-turn instead of at Declare Attack. */
  | { kind: 'extraActionAim'; iid: string; name: string };

export interface DragPayload {
  iid: string;
  card: Card;
  sacrifice?: string[];
}

/** Sub-steps the combat-phase animation walks through within a single lane. */
export type CombatPhase = 'skip' | 'effects' | 'attack' | 'retaliate' | 'onhit';
/** The lane currently highlighted during the combat-phase animation, and which sub-step. */
export interface CombatAnim { lane: LaneId; phase: CombatPhase }

/** Sandbox "brush": clicking a board unit applies this status (or removes the unit). */
export type SandboxBrush = 'burn' | 'poison' | 'sleep' | 'freeze' | 'drowning' | 'clear' | 'remove';
/** Sandbox tool state — where injected units are placed, and which brush is armed. */
export interface SandboxState {
  /** Which side new units are placed on, relative to the player in control. */
  target: 'me' | 'foe';
  lane: LaneId;
  pos: 'front' | 'back';
  /** When true, clicking a card in the injector places it on the board instead of the hand. */
  placeMode: boolean;
  /** When set, clicking a board unit applies this status (or removes it). */
  brush: SandboxBrush | null;
}

/** Ordered sub-steps shown for a lane that has an attacking ally. */
const COMBAT_PHASES: CombatPhase[] = ['effects', 'attack', 'retaliate', 'onhit'];
/** Each combat sub-step is held this long — slow enough to read what happened. */
const COMBAT_STEP_MS = 500;
/** Empty lanes (no ally to attack) flash by quickly. */
const COMBAT_SKIP_MS = 120;
/** After the attack lunges land, hold the resolved board briefly before the next sub-step. */
const COMBAT_SETTLE_MS = 220;
/** "Declare" beat: every lane about to clash lights up together before the left→right
 *  resolution begins, so the player reads which fights are coming (LoR-style). */
const COMBAT_DECLARE_MS = 480;
/** Hold while end-of-turn flourishes (Growth pop, Burn sparks, Poison) play, pre-handoff. */
const EOT_FX_MS = 700;
/** Pause between an AI player's actions so a human can watch the turn unfold. */
const AI_STEP_MS = 650;
/**
 * How long an enemy spell is held on screen BEFORE its effects land, so the card is read
 * first and the board change has a visible cause. It was 850ms — enough to notice a card had
 * appeared, not enough to READ one, and the card was gone before you could look for what it
 * had done. Timed to land partway through the reveal's centre-stage hold (see SPELL_MS in
 * combatFx): the card is still fully up when the board updates underneath it, so cause and
 * effect read together, and it then finishes its hold and fades — it no longer needs to
 * double as a persistent record, since the Spells Cast area (App.tsx) is that now.
 */
const SPELL_BEAT_MS = 2000;
/** End-of-turn event types worth pausing to animate before the turn hands off. */
const EOT_FLOURISH_EVENTS = new Set(['growth', 'burnTick', 'poisonTick', 'buff', 'heal', 'damageUnit', 'transform', 'unitDestroyed', 'moved']);
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Find a unit anywhere on the board by instance id (used to read attacker keywords). */
const unitInState = (state: GameState, iid: string): UnitInstance | undefined => {
  for (const p of [0, 1] as const) {
    for (const lane of LANES) {
      for (const slot of ['front', 'back'] as const) {
        const u = state.players[p].lanes[lane][slot];
        if (u?.iid === iid) return u;
      }
    }
  }
  return undefined;
};

/** Which player owns the unit with this iid (used to send an Expelled card to its hand). */
const ownerPlayerOf = (state: GameState, iid: string): PlayerId | undefined => {
  for (const p of [0, 1] as const) {
    for (const lane of LANES) {
      for (const slot of ['front', 'back'] as const) {
        if (state.players[p].lanes[lane][slot]?.iid === iid) return p;
      }
    }
  }
  return undefined;
};

/**
 * Group a lane's combat events into one AttackFx per attacker, in strike order. Targets are
 * the units/leader struck by that attacker's outgoing hits — collection stops at `retaliate`
 * so the defender's counter-strike (which damages the attacker) isn't mistaken for a target.
 */
const buildAttackFx = (events: GameEvent[], preCombat: GameState): AttackFx[] => {
  const groups: AttackFx[] = [];
  let cur: AttackFx | null = null;
  let collecting = false;
  for (const e of events) {
    switch (e.t) {
      case 'attack': {
        const kw = unitInState(preCombat, e.attacker)?.keywords;
        cur = { attackerIid: e.attacker, targetIids: [], sniper: Boolean(kw?.sniper), lethal: Boolean(kw?.lethal) };
        groups.push(cur);
        collecting = true;
        break;
      }
      case 'intercept':
        if (cur && collecting) cur.targetIids.push(e.by);
        break;
      case 'damageUnit':
        if (cur && collecting && e.iid !== cur.attackerIid) cur.targetIids.push(e.iid);
        break;
      case 'lethal':
        // Only add if not already recorded via damageUnit — avoids a double-lunge for a
        // one-shot kill, while still letting doubleStrike add the same iid twice (two real hits).
        if (cur && collecting && e.target !== cur.attackerIid && !cur.targetIids.includes(e.target))
          cur.targetIids.push(e.target);
        break;
      case 'damageLeader':
        if (cur && collecting) cur.leaderTarget = e.player;
        break;
      case 'retaliate':
        collecting = false;
        break;
    }
  }
  // No global dedup — doubleStrike legitimately produces two entries for the same target.
  // The lethal case above already avoids the lethal+damageUnit double-count.
  return groups;
};

/**
 * Which combat sub-steps actually apply to this lane, in order. Stages that produced no
 * effect are skipped so the animation only dwells on what happened:
 *  - effects: a pre-attack Burn proc (a burnTick before the strike) or a lane Environment.
 *  - attack: the ally struck (always present once `acted`).
 *  - retaliate: the defender struck back.
 *  - onhit: the strike applied an on-hit status (Burn, Poison, …).
 */
const phasesForStep = (step: LaneCombatStep): CombatPhase[] => {
  const ev = step.events;
  const attackIdx = ev.findIndex((e) => e.t === 'attack');
  const burnBeforeAttack = ev.some((e, i) => e.t === 'burnTick' && (attackIdx < 0 || i < attackIdx));
  const laneEnv = step.state.environments[step.lane];
  const applies: Record<CombatPhase, boolean> = {
    skip: false,
    effects: burnBeforeAttack || Boolean(laneEnv),
    attack: ev.some((e) => e.t === 'attack'),
    retaliate: ev.some((e) => e.t === 'retaliate'),
    onhit: ev.some((e) => e.t === 'statusApplied'),
  };
  return COMBAT_PHASES.filter((p) => applies[p]);
};

/** Idle delay before hints auto-activate. */
const HINT_IDLE_MS = 10_000;

/** Build a fresh game from whatever decks are currently selected in the content store. */
const newGame = (): GameState => {
  const snap = getSnapshot();
  return initGame({
    registry: snap.registry,
    decks: snap.playDecks,
    seed: (Date.now() & 0xffff) >>> 0,
  });
};


/** Collect sniper units that can act and will need to pick a target lane. A standalone
 *  Foundation fights as a full unit (see `foundations-are-full-units`) and can itself carry
 *  Sniper (e.g. via an Adventure enhancement), so it's scanned alongside front/back units —
 *  omitting it let an unbonded Sniper Foundation auto-fire with no aim prompt. */
const findActiveSnipers = (game: GameState, registry: ReturnType<typeof getSnapshot>['registry']): Array<{ iid: string; lane: LaneId; name: string }> => {
  const p = game.players[game.active];
  const result: Array<{ iid: string; lane: LaneId; name: string }> = [];
  const consider = (u: UnitInstance | undefined, lane: LaneId): void => {
    if (!u) return;
    if ((u.justPlaced && !u.keywords.battleReady) || (u.status.sleep ?? 0) > 0 || (u.status.freeze ?? 0) > 0) return;
    if (u.keywords.sniper && (isHeights(lane) || u.keywords.airborne)) {
      const name = registry.cards.get(u.cardId)?.name ?? u.cardId;
      result.push({ iid: u.iid, lane, name });
    }
  };
  for (const lane of LANES) {
    consider(p.lanes[lane].front, lane);
    consider(p.lanes[lane].back, lane);
    consider(p.lanes[lane].standaloneFoundation, lane);
  }
  return result;
};

/** Returns true if the spell's effects include at least one `move`. */
const hasMoveEffect = (effects: Effect[]): boolean => effects.some((e) => e.kind === 'move');

/** Mirrors engine.ts `usesLane`: does this effect list let the caster pick a lane? A `summon`
 *  that hard-codes its own `lane` is excluded — the card's lane wins. */
const usesLaneEffect = (effects: Effect[]): boolean =>
  effects.some((e) => e.kind === 'move' || (e.kind === 'summon' && !e.lane));

export interface UseGameOptions {
  /** When present, the game is authoritative on a server; state arrives over this transport. */
  transport?: Transport;
  /** In net play, render with the HOST's registry (card ids resolve against the shared pool). */
  registry?: Registry;
  /** Seed the initial board (net play passes the first server state). */
  initialState?: GameState;
  /**
   * Lock the rendered point of view to one seat in LOCAL play (Adventure: the human is
   * always seat 0 and the board must not flip while the AI acts). Interactions gate on
   * `myTurn` exactly like net play. Ignored when a transport is present.
   */
  fixedPov?: PlayerId;
  /** Initial AI ownership per side (Adventure sets seat 1). Defaults to all-human. */
  aiSides?: Record<PlayerId, boolean>;
}

export const useGame = (opts: UseGameOptions = {}) => {
  // Subscribe to content so card edits reflect live; the registry used to RESOLVE the
  // current game's card ids is always the latest effective registry — except in net play,
  // where the host's shared registry is passed in so both sides resolve identical cards.
  const liveRegistry = useContent().registry;
  const registry = opts.registry ?? liveRegistry;
  const net = opts.transport ?? null;
  /** Which sides are played by the AI. Either, both (AI-vs-AI auto-play), or neither (hotseat). */
  const [aiSides, setAiSides] = useState<Record<PlayerId, boolean>>(opts.aiSides ?? { 0: false, 1: false });
  const [game, setGame] = useState<GameState>(() => opts.initialState ?? newGame());
  /**
   * Point of view: the seat this client controls. Net play fixes it to our seat; Adventure fixes
   * it via `fixedPov`. SOLO (exactly one AI side) locks it to the human's seat so the human always
   * sees their own side at the bottom and the AI opponent up top — the AI's turns replay as an
   * opponent (card-back hand, play reveals) rather than flipping the board. Only pure hotseat
   * (no AI) and spectated AI-vs-AI fall back to following the active player.
   */
  const soloHumanSeat: PlayerId | null = aiSides[0] !== aiSides[1] ? (aiSides[0] ? 1 : 0) : null;
  const pov: PlayerId = net ? net.seat : (opts.fixedPov ?? soloHumanSeat ?? game.active);
  /** True when it's this client's turn to act (always true in free local play). */
  const myTurn = net ? game.active === net.seat : game.active === pov;
  /**
   * The AI has seized this turn (Adventure's autopilot: a cursed relic or a Trial twist).
   *
   * It is the human's seat and the human's turn — the board stays their board, the hand
   * stays face-up — but the commander is playing it. That is the whole point of the
   * mechanic: you watch your own carefully-arranged hand get spent by somebody else, so
   * the plannable cost is arranging a hand that survives it. Input is locked for the
   * duration (see `dispatch`) and the AI driver below takes the seat.
   */
  const autopilot = !net && autopilotActive(game) && !aiSides[game.active];
  const [log, setLog] = useState<GameEvent[]>([]);
  const [sel, setSel] = useState<Selection>({ kind: 'none' });
  const [drag, setDrag] = useState<DragPayload | null>(null);
  const [message, setMessage] = useState('');
  const [passing, setPassing] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  /** Hint mode: highlight what you can do (playable cards, usable Leader Skill).
   *  Auto-activates after {@link HINT_IDLE_MS} of inactivity and clears on any interaction. */
  const [hintMode, setHintMode] = useState(false);
  /** Guards the idle timer that flips hints on. */
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Sandbox controls (only meaningful in debug mode). */
  const [sandbox, setSandboxState] = useState<SandboxState>({ target: 'me', lane: 'ground1', pos: 'front', placeMode: false, brush: null });
  /** Non-null while the combat-phase animation is playing (input is locked). */
  const [combatAnim, setCombatAnim] = useState<CombatAnim | null>(null);
  /** True while an enemy spell is being shown, before its effects are applied to the board. */
  const [casting, setCasting] = useState(false);
  const castTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Lanes lit together during the pre-combat "declare" beat (before the left→right sweep). */
  const [declareLanes, setDeclareLanes] = useState<LaneId[] | null>(null);
  /** Set when an animation should abort (e.g. New game pressed mid-combat). */
  const cancelAnim = useRef(false);
  // Live refs so the once-installed net subscription always reads current game/registry
  // (the pre-action board is our own last authoritative state).
  const gameRef = useRef(game);
  gameRef.current = game;
  const registryRef = useRef(registry);
  registryRef.current = registry;
  const anyAi = aiSides[0] || aiSides[1];
  /** Guards the AI driver's pending timer so it can be cancelled on reset / deps change. */
  const aiTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Auto-activate hints after a spell of inactivity; any interaction clears them and
   *  restarts the idle countdown. */
  useEffect(() => {
    const arm = (): void => {
      if (hintTimer.current) clearTimeout(hintTimer.current);
      hintTimer.current = setTimeout(() => setHintMode(true), HINT_IDLE_MS);
    };
    const onActivity = (): void => {
      unlockAudio(); // resume the AudioContext on the first gesture (autoplay policy)
      playMusic('music_ambient'); // idempotent — starts the loop once the context is unlocked
      setHintMode((on) => (on ? false : on)); // bail re-render when already off
      arm();
    };
    preloadAll(SOUND_NAMES); // warm the decode cache (no-op for assets that don't exist yet)
    const events: (keyof WindowEventMap)[] = ['pointerdown', 'pointermove', 'keydown', 'wheel'];
    for (const e of events) window.addEventListener(e, onActivity, { passive: true });
    arm();
    return () => {
      for (const e of events) window.removeEventListener(e, onActivity);
      if (hintTimer.current) { clearTimeout(hintTimer.current); hintTimer.current = null; }
    };
  }, []);

  // Drop any pending enemy-cast beat if this hook goes away mid-animation.
  useEffect(() => () => { if (castTimer.current) clearTimeout(castTimer.current); }, []);

  const cardOf = (iid: string): Card | undefined => {
    const inst = game.players[game.active].hand.find((c) => c.iid === iid);
    return inst ? registry.cards.get(inst.cardId) : undefined;
  };

  const nameOf = (cardId: string): string => registry.cards.get(cardId)?.name ?? cardId;

  /**
   * Reveal an OPPONENT's play with a flip-and-travel card token, so a fixed-side player
   * (Adventure / multiplayer) sees what the far side just did. Driven from the public play
   * events (never the redacted hand): the card lifts from the opponent's hand-back row, flips
   * to its face, then flies to its lane (placements) or holds centre (spells). Presentation only.
   */
  const fireOpponentReveal = (action: Action, events: GameEvent[]): void => {
    const laneRect = (lane: LaneId): DOMRect | null =>
      document.querySelector<HTMLElement>(`[data-lane="${lane}"]`)?.getBoundingClientRect() ?? null;
    let cardId: string | undefined;
    let to: DOMRect | null = null;
    if (action.type === 'playUnit') {
      const ev = events.find((e) => e.t === 'playUnit');
      if (ev && ev.t === 'playUnit') { cardId = ev.cardId; to = laneRect(ev.lane); }
    } else if (action.type === 'playFoundation') {
      const ev = events.find((e) => e.t === 'foundationPlaced');
      if (ev && ev.t === 'foundationPlaced') { cardId = ev.cardId; to = laneRect(action.lane); }
    } else if (action.type === 'playEnvironment') {
      const ev = events.find((e) => e.t === 'playEnvironment');
      if (ev && ev.t === 'playEnvironment') { cardId = ev.cardId; to = laneRect(ev.lane); }
    } else if (action.type === 'playSpell') {
      const ev = events.find((e) => e.t === 'castSpell');
      if (ev && ev.t === 'castSpell') cardId = ev.cardId;
    } else {
      return;
    }
    if (!cardId) return;
    const def = registry.cards.get(cardId);
    if (!def) return;
    const from = document.querySelector<HTMLElement>('.ophand')?.getBoundingClientRect()
      ?? new DOMRect(window.innerWidth / 2 - 25, 70, 50, 40);
    const pips = (def.cost.elements ?? [])
      .flatMap((e) => Array<string>(e.amount).fill(ELEMENT_SYMBOL[e.type])).join('');
    const body = 'attack' in def && 'hp' in def
      ? { atk: (def as { attack: number }).attack, hp: (def as { hp: number }).hp }
      : undefined;
    playRevealFx(
      {
        name: def.name,
        element: def.element,
        typeLabel: `${ELEMENT_NAME[def.element]} · ${def.type}`,
        energy: def.cost.energy,
        pips,
        body,
        // Only the spell reveal renders this (see combatFx). A spell leaves nothing behind
        // to inspect, so its own rules text is the only account of what it just did.
        text: def.text,
      },
      from,
      to,
    );
  };

  /**
   * Pre-reveal flourishes: animations that need the OLD board (the affected unit is about to
   * leave or change). `before` is the state the events were computed from. Call right before
   * `setGame` reveals the result.
   */
  const preRevealFx = (events: GameEvent[], before: GameState): void => {
    for (const e of events) {
      if (e.t === 'unitDestroyed') {
        if (unitInState(before, e.iid)?.keywords.kamikaze) { playKamikazeFx(e.iid); playSound('kamikaze'); } // ✸ detonate
        else playDeathFx(e.iid); // the corpse crumbles and falls away
      } else if (e.t === 'transform') {
        metaFadeOut(e.iid); // fade to black; the new form fades in post-reveal
      } else if (e.t === 'expel') {
        const owner = ownerPlayerOf(before, e.iid);
        playExpelFx(e.iid, nameOf(e.cardId), owner === before.active ? 'bottom' : 'top');
      }
    }
  };

  /** Post-reveal flourishes: glows/pops on surviving units, Metamorphosis fade-in, Forget mill. */
  const postRevealFx = (events: GameEvent[], before: GameState, eot = false): void => {
    for (const e of events) {
      if (e.t === 'transform') metaFadeIn(e.iid);
      else if (e.t === 'forget') playForgetFx(e.player, nameOf(e.cardId));
    }
    playEventFlourishes(events, { keywordsOf: (iid) => unitInState(before, iid)?.keywords, eot });
  };

  /** Play one SFX per sounding event. Mirrors the FX helpers; combat attack sounds are
   *  fired separately in lockstep with each lunge (see `soundForAttack`). */
  const playEventSounds = (events: GameEvent[]): void => {
    for (const e of events) {
      const clip = soundForEvent(e);
      if (clip) playSound(clip);
    }
  };

  /**
   * Reveal an authoritative result to the UI: pre-reveal flourishes (computed from the outgoing
   * board), swap in the new state, append to the log, drop into pending-resolution if this client
   * owns the queued choice, then post-reveal flourishes/sounds. Shared by local dispatch and the
   * net message handler. `action` is null for the initial state pushed on match start. endTurn's
   * combat visuals are animated separately (see commitEndTurn / animateCombat), so this skips them.
   */
  const applyResult = (
    action: Action | null,
    res: { state: GameState; events: GameEvent[] },
    preState: GameState,
  ): void => {
    const events = res.events;

    /** Swap in the authoritative board and play everything that reads off it. */
    const commit = (): void => {
      if (action && action.type !== 'endTurn') preRevealFx(events, preState);
      setGame(res.state);
      setLog((prev) => [...prev, ...events]);
      // Enter pending-resolution only when the queued move/expel choice is ours to make.
      const pend = res.state.pending;
      const mineToPick = !net || (pend?.[0] ? pend[0].player === net.seat : false);
      // Same gate for a queued Sniper bonus attack awaiting its aim (`extraActionAim`) — checked
      // only once no move/expel choice is outstanding, matching the engine's own precedence.
      const extraIid = res.state.extraActions?.[0];
      const extraOwner = extraIid ? ownerPlayerOf(res.state, extraIid) : undefined;
      const extraMine = !net || (extraOwner !== undefined ? extraOwner === net.seat : false);
      if (pend?.length && mineToPick) {
        setSel({ kind: 'pending' });
      } else if (extraIid && extraMine) {
        const unit = unitInState(res.state, extraIid);
        const name = unit ? (registry.cards.get(unit.cardId)?.name ?? unit.cardId) : extraIid;
        setSel({ kind: 'extraActionAim', iid: extraIid, name });
      } else {
        setSel({ kind: 'none' });
      }
      setDrag(null);
      setMessage('');
      if (!action || action.type !== 'endTurn') {
        // Play any bonus attacks (Frenzy / extraAction). Build fx from the pre-action state so
        // attacker keywords are correct; play after the DOM updates so positions are current.
        const bonusFx = buildAttackFx(events, preState);
        requestAnimationFrame(() => {
          if (bonusFx.length > 0) void (async () => { for (const fx of bonusFx) { playSound(soundForAttack(fx)); await playAttackFx(fx); } })();
          postRevealFx(events, preState);
          playEventSounds(events);
        });
      }
    };

    // When the OPPONENT (non-pov actor) plays in a fixed-side mode, replay it with the
    // flip-and-travel reveal so their move reads on our screen. Skipped when we are the actor
    // (our own plays already fly from our hand) and in hotseat (actor always is the pov).
    const opponentActed = Boolean(action) && action!.type !== 'endTurn' && preState.active !== pov;

    /**
     * An enemy SPELL used to land in the same frame it was revealed: units died and stats
     * changed while the card was still flipping, so the board simply looked different with no
     * visible cause — the only way to learn what happened was to read the log. Hold the old
     * board for a beat so the card is READ FIRST, then let its effects land against the board
     * they were cast at.
     *
     * Only enemy spells wait. Your own casts need no explanation, and delaying them would just
     * make the game feel unresponsive. The AI's next move is scheduled off `game` changing, so
     * deferring the commit defers the AI too — it cannot act during the beat.
     */
    if (opponentActed && action!.type === 'playSpell') {
      // Show the card NOW, synchronously. The board is deliberately not being touched yet, so
      // there is no layout to wait for — deferring to the next frame would only delay the card
      // and make it hostage to a frame actually being rendered.
      fireOpponentReveal(action!, events);
      setCasting(true);
      if (castTimer.current) clearTimeout(castTimer.current);
      castTimer.current = setTimeout(() => {
        castTimer.current = null;
        setCasting(false);
        commit();
      }, SPELL_BEAT_MS);
      return;
    }
    // Everything else reveals AFTER the board updates: a played unit's card flies to the lane
    // it landed in, so it needs the new layout.
    if (opponentActed) requestAnimationFrame(() => fireOpponentReveal(action!, events));
    commit();
  };

  /**
   * `fromAi` is the AUTOPILOT BYPASS and nothing else: while the AI holds the seat, human
   * input is refused here, and the AI driver is the one caller allowed through. Without
   * the bypass the same lock that stops the player would stop the AI playing the turn for
   * them, and the fight would deadlock on the round it was supposed to be taken over.
   */
  const dispatch = (action: Action, fromAi = false): boolean => {
    if (combatAnim || casting) return false; // input locked while combat or an enemy cast plays
    if (autopilot && !fromAi) { setMessage('The commander has the field this round.'); return false; }
    // Net play: the server is authoritative — send the action and wait for the redacted result.
    if (net) {
      if (game.active !== net.seat) { setMessage('It is not your turn.'); return false; }
      setDrag(null);
      setMessage('');
      net.send(action);
      return true;
    }
    // In debug mode, top up energy before every play action so cost is never a blocker.
    const isPlay = action.type === 'playUnit' || action.type === 'playSpell' ||
                   action.type === 'playFoundation' || action.type === 'playEnvironment' ||
                   action.type === 'heroPower';
    const preState = debugMode && isPlay
      ? applyAction(registry, game, { type: 'debugMaxEnergy' }).state
      : game;
    const res = applyAction(registry, preState, action);
    const error = res.events.find((e) => e.t === 'error');
    if (error && error.t === 'error') {
      setMessage(error.message);
      playSound('ui_deny'); // illegal action — audible rejection
      return false;
    }
    // Card-play travel: capture the played hand card's on-screen spot + its destination lane
    // BEFORE applyResult swaps state (which removes the card from the hand), then fly it after
    // the board re-renders. Units and foundations land in a lane; spells/environments don't.
    if (action.type === 'playUnit' || action.type === 'playFoundation') {
      const src = document.querySelector<HTMLElement>(`[data-cardiid="${CSS.escape(action.iid)}"]`);
      const laneEl = document.querySelector<HTMLElement>(`[data-lane="${action.lane}"]`);
      const label = cardOf(action.iid)?.name ?? '';
      const fromRect = src?.getBoundingClientRect();
      if (fromRect && laneEl) requestAnimationFrame(() => playPlayFx(fromRect, laneEl, label, 'play'));
    }
    applyResult(action, res, preState);
    // Hotseat hands the device between humans; with any AI side there's nothing to pass.
    if (action.type === 'endTurn' && res.state.phase !== 'ended' && !anyAi) setPassing(true);
    return true;
  };

  const debugAddCard = (cardId: string): void => {
    dispatch({ type: 'debugAddCard', cardId });
  };

  // --- Sandbox tools (debug mode) ---

  const setSandbox = (patch: Partial<SandboxState>): void => setSandboxState((s) => ({ ...s, ...patch }));

  /** Resolve the sandbox's target side to an absolute player id. */
  const sandboxPlayer = (): PlayerId => (sandbox.target === 'me' ? game.active : opponentOf(game.active));

  /** Inject a card: place it on the board (placeMode) or add it to hand. */
  const debugInject = (cardId: string): void => {
    if (sandbox.placeMode) {
      const def = registry.cards.get(cardId);
      if (def?.type !== 'unit' && def?.type !== 'foundation') { setMessage('Only unit and foundation cards can be placed on the board.'); return; }
      dispatch({ type: 'debugPlaceUnit', cardId, player: sandboxPlayer(), lane: sandbox.lane, position: sandbox.pos });
    } else {
      dispatch({ type: 'debugAddCard', cardId });
    }
  };

  /** Apply the armed brush to a board unit (status, clear, or remove). */
  const applyBrush = (iid: string): void => {
    if (!sandbox.brush) return;
    if (sandbox.brush === 'remove') dispatch({ type: 'debugRemoveUnit', iid });
    else dispatch({ type: 'debugApplyStatus', iid, status: sandbox.brush });
  };

  const clearBoard = (): void => { dispatch({ type: 'debugClearBoard' }); };

  /** Can this hand card currently be dragged? */
  const canDrag = (iid: string): boolean => {
    const def = cardOf(iid);
    if (!def) return false;
    if (def.type === 'unit' && def.keywords.sacrifice) {
      // Only after the sacrifice ritual is confirmed for THIS card.
      return sel.kind === 'sacrifice' && sel.iid === iid && sel.confirmed;
    }
    return true;
  };

  const canAffordCard = (iid: string): boolean => {
    if (debugMode) return true;
    const inst = game.players[game.active].hand.find((c) => c.iid === iid);
    if (!inst) return false;
    const def = registry.cards.get(inst.cardId);
    if (!def) return false;
    return affordableCard(game.players[game.active], def, inst);
  };

  // --- Click ritual (sacrifice arming + hero targeting) ---

  const clickHand = (iid: string): void => {
    // Don't let a hand click hijack an in-progress multi-step flow (e.g. sniper targeting).
    if (BLOCKING_PHASES.has(sel.kind)) {
      setMessage('Finish the current action first.');
      return;
    }
    const def = cardOf(iid);
    if (!def) return;
    setMessage('');
    if (def.type === 'unit' && def.keywords.sacrifice) {
      // Sacrifice units need the click-ritual before they can be dragged.
      setSel({ kind: 'sacrifice', iid, card: def, sacNeed: def.keywords.sacrifice.max, sac: [], confirmed: false });
    } else {
      // Toggle card info: clicking the same card again dismisses the info panel.
      setSel((prev) =>
        prev.kind === 'card' && prev.iid === iid ? { kind: 'none' } : { kind: 'card', iid, card: def },
      );
    }
  };

  /** The active player's hero power effects, if any (used to decide whether casting it needs
   *  a lane pick before/after its target). */
  const activeHeroPowerEffects = (): Effect[] | undefined =>
    registry.leaders.get(game.players[game.active].leaderId)?.heroPower.effects;

  const clickUnit = (iid: string, owner: PlayerId): void => {
    // Sandbox brush takes priority: clicking any unit applies the armed status / removes it.
    if (debugMode && sandbox.brush) { applyBrush(iid); return; }
    if (sel.kind === 'sacrifice' && !sel.confirmed) {
      if (owner !== game.active) {
        setMessage('You can only sacrifice your own units.');
        return;
      }
      const has = sel.sac.includes(iid);
      const sac = has ? sel.sac.filter((x) => x !== iid) : sel.sac.length < sel.sacNeed ? [...sel.sac, iid] : sel.sac;
      if (sac !== sel.sac) playSound('sacrifice_select'); // an actual add/remove (not a no-op at cap)
      setSel({ ...sel, sac });
      return;
    }
    if (sel.kind === 'spellTargets') {
      addSpellTarget({ kind: 'unit', iid });
      return;
    }
    if (sel.kind === 'heroTargets') {
      addHeroTarget({ kind: 'unit', iid });
      return;
    }
    if (sel.kind === 'hero') {
      const target: TargetRef = { kind: 'unit', iid };
      // Lane-picking hero powers (e.g. Naife's Misdirect) need a destination lane after the
      // target, same as a move spell — enter heroLane mode instead of dispatching immediately.
      if (usesLaneEffect(activeHeroPowerEffects() ?? [])) {
        setSel({ kind: 'heroLane', target });
        return;
      }
      // A power that consumes more than one ref collects the rest by clicking, exactly as a
      // multi-target spell does. Repeats are allowed: Cocoon's two statuses are meant for the
      // same body, so the player clicks it twice.
      const need = targetRefsNeeded(activeHeroPowerEffects() ?? []);
      if (need > 1) {
        setSel({ kind: 'heroTargets', refs: [target], need });
        return;
      }
      dispatch({ type: 'heroPower', targets: [target] });
      return;
    }
    if (sel.kind === 'pending') {
      const pc = game.pending?.[0];
      if (!pc) return;
      const isAlly = owner === game.active;
      const valid =
        pc.scope === 'self' ? iid === pc.sourceIid :
        pc.scope === 'ally' ? isAlly :
        pc.scope === 'enemy' ? !isAlly :
        true;
      if (!valid) {
        setMessage(pc.scope === 'enemy' ? 'Pick an enemy unit.' : pc.scope === 'ally' ? 'Pick an ally unit.' : 'Pick this unit.');
        return;
      }
      if (pc.kind === 'expel') {
        dispatch({ type: 'resolvePending', targetIid: iid });
      } else {
        setSel({ kind: 'pending', pickedUnit: iid }); // move: now pick a destination lane
      }
      return;
    }
  };

  const clickLeader = (player: PlayerId): void => {
    // A leader is a legal target for a multi-target spell too.
    if (sel.kind === 'spellTargets') {
      addSpellTarget({ kind: 'leader', player });
      return;
    }
    if (sel.kind === 'heroTargets') {
      addHeroTarget({ kind: 'leader', player });
      return;
    }
    if (sel.kind !== 'hero') return;
    const target: TargetRef = { kind: 'leader', player };
    if (usesLaneEffect(activeHeroPowerEffects() ?? [])) {
      setSel({ kind: 'heroLane', target });
      return;
    }
    const need = targetRefsNeeded(activeHeroPowerEffects() ?? []);
    if (need > 1) {
      setSel({ kind: 'heroTargets', refs: [target], need });
      return;
    }
    dispatch({ type: 'heroPower', targets: [target] });
  };

  /** Called when the player picks a destination lane for a lane-picking hero power. */
  const pickHeroLane = (lane: LaneId): void => {
    if (sel.kind !== 'heroLane') return;
    dispatch({ type: 'heroPower', targets: sel.target ? [sel.target] : undefined, lane });
    setSel({ kind: 'none' });
  };

  const confirmSacrifice = (): void => {
    // Any number from 0 up to the max is allowed; 0 plays the unit without sacrificing.
    // No sound here: the ritual is confirmed but nothing is consumed yet — the actual
    // `sacrifice` engine event (fired when the unit is played) drives the confirm sting.
    if (sel.kind === 'sacrifice' && sel.sac.length <= sel.sacNeed) setSel({ ...sel, confirmed: true });
  };

  /** Selection phases that own a multi-step flow — starting another action mid-flow drops
   *  their state (bank/choices) and soft-locks the turn, so they block new selections. */
  const BLOCKING_PHASES = new Set<Selection['kind']>([
    'sacrifice', 'spellMove', 'sniperPhase', 'pending', 'heroLane', 'extraActionAim', 'heroTargets',
  ]);

  /** Does this power need a unit/leader CLICK before it can resolve?
   *  Reads the engine's own target tables (`TARGETED` / `SELF_RESOLVING_SCOPES`) rather than
   *  a copy of them — the copy that used to live here is how a kind added to the engine
   *  could silently stop prompting for its target in the UI. */
  const heroNeedsClick = (effects: Effect[]): boolean =>
    effects.some((e) => TARGETED.has(e.kind) && !SELF_RESOLVING_SCOPES.has(e.target));

  const selectHero = (): void => {
    if (BLOCKING_PHASES.has(sel.kind)) {
      setMessage('Finish the current action before using your Leader Skill.');
      return;
    }
    setMessage('');
    const effects = activeHeroPowerEffects() ?? [];
    // A lane-picking power with no unit/leader target to click (e.g. Autopus's Fallback Code)
    // goes straight to the lane picker instead of stalling on a click that will never come.
    if (usesLaneEffect(effects) && !heroNeedsClick(effects)) {
      setSel({ kind: 'heroLane' });
      return;
    }
    setSel({ kind: 'hero' });
  };

  /** Cast an element-choosing hero power (Golun's Cultivate) for the picked element. */
  const pickHeroElement = (element: Element): void => {
    if (sel.kind !== 'hero') return;
    dispatch({ type: 'heroPower', targets: [{ kind: 'element', element }] });
  };

  // --- Drag and drop ---

  const startDrag = (iid: string): void => {
    if (net && !myTurn) { setMessage('It is not your turn.'); return; }
    const def = cardOf(iid);
    if (!def) return;
    const sacrifice = sel.kind === 'sacrifice' && sel.iid === iid && sel.confirmed ? sel.sac : undefined;
    setDrag({ iid, card: def, sacrifice });
  };
  const endDrag = (): void => setDrag(null);

  const dropOnLane = (owner: PlayerId, lane: LaneId, position?: LanePosition): void => {
    if (!drag) return;
    if (owner !== game.active) {
      setMessage('Play onto your own side.');
      setDrag(null);
      return;
    }
    if (drag.card.type === 'unit') {
      // On-play Move/Expel effects queue an interactive choice (`game.pending`); dispatch drops
      // into 'pending' resolution automatically. (The old `mover` keyword is folded into those
      // effects at registry-build time, so there's no separate moverPick flow.)
      dispatch({ type: 'playUnit', iid: drag.iid, lane, position, sacrifice: drag.sacrifice });
    } else if (drag.card.type === 'foundation') dispatch({ type: 'playFoundation', iid: drag.iid, lane });
    else if (drag.card.type === 'environment') setMessage('Drop Environments in the middle row (between the players).');
    else setMessage('Spells are dropped on a target, not a lane.');
    setDrag(null);
  };

  /** Place an Environment into a lane column (the shared middle row). */
  const dropEnvironment = (lane: LaneId): void => {
    if (!drag || drag.card.type !== 'environment') return;
    dispatch({ type: 'playEnvironment', iid: drag.iid, lane });
    setDrag(null);
  };

  const dropOnTarget = (ref: TargetRef): void => {
    if (!drag) return;
    if (drag.card.type === 'spell') {
      // Move spells need a destination lane — enter spellMove mode instead of dispatching.
      if (hasMoveEffect(drag.card.effects)) {
        setSel({ kind: 'spellMove', iid: drag.iid, card: drag.card, target: ref });
        setDrag(null);
        return;
      }
      const need = targetRefsNeeded(drag.card.effects);
      if (need > 1) {
        // One ref down, the rest by clicking.
        setSel({ kind: 'spellTargets', iid: drag.iid, card: drag.card, refs: [ref], need });
        setDrag(null);
        return;
      }
      dispatch({ type: 'playSpell', iid: drag.iid, targets: [ref] });
    }
    setDrag(null);
  };

  /**
   * Add the next target for a multi-target spell, casting once enough are collected.
   *
   * Repeats are allowed: "deal 5 to an enemy, twice" may legitimately be aimed at the same
   * body for 10, and refusing that would be inventing a rule the card does not state.
   */
  /** Accumulate refs for a hero power that consumes more than one, then activate. */
  const addHeroTarget = (ref: TargetRef): void => {
    if (sel.kind !== 'heroTargets') return;
    const refs = [...sel.refs, ref];
    if (refs.length < sel.need) {
      setSel({ ...sel, refs });
      return;
    }
    dispatch({ type: 'heroPower', targets: refs });
    setSel({ kind: 'none' });
  };

  const addSpellTarget = (ref: TargetRef): void => {
    if (sel.kind !== 'spellTargets') return;
    const refs = [...sel.refs, ref];
    if (refs.length < sel.need) {
      setSel({ ...sel, refs });
      return;
    }
    dispatch({ type: 'playSpell', iid: sel.iid, targets: refs });
    setSel({ kind: 'none' });
  };

  /** Called when the player picks a destination lane for the unit chosen for a pending move. */
  const pickPendingLane = (lane: LaneId): void => {
    if (sel.kind !== 'pending' || !sel.pickedUnit) return;
    dispatch({ type: 'resolvePending', targetIid: sel.pickedUnit, toLane: lane });
  };
  /** Skip the current pending move/expel activation (e.g. no legal target). */
  const skipPending = (): void => {
    if (sel.kind !== 'pending') return;
    dispatch({ type: 'resolvePending' });
  };

  /** Called when the player picks a destination lane for a pending move spell. */
  const pickMoveLane = (lane: LaneId): void => {
    if (sel.kind !== 'spellMove') return;
    dispatch({ type: 'playSpell', iid: sel.iid, targets: [sel.target], lane });
    setSel({ kind: 'none' });
  };

  // --- End turn with optional mover/sniper targeting ---

  /**
   * Play the combat-phase animation (lanes highlighted left→right, each sub-step held
   * ~0.25s) over a purely-visual sequence of per-lane board snapshots, then dispatch the
   * authoritative endTurn (which re-resolves combat identically — it consumes no RNG —
   * and applies banking + handoff). Skips straight to endTurn when there's no combat.
   */
  /**
   * Play the combat-phase animation (lanes highlighted left→right, each sub-step held) over a
   * purely-visual sequence of per-lane board snapshots re-derived deterministically from
   * `preCombat` (combat consumes no RNG), then the end-of-turn preview. On completion — unless
   * cancelled — calls `onComplete`, which either applies the authoritative endTurn locally
   * (hotseat/AI) or reveals the state the server sent back (net play).
   */
  const animateCombat = (
    preCombat: GameState,
    sniperChoices: Partial<Record<string, LaneId>> | undefined,
    onComplete: () => void,
  ): void => {
    const { steps, state: postCombat } = resolveCombatByLane(preCombat, sniperChoices, registryRef.current);
    cancelAnim.current = false;
    void (async () => {
      // Declare beat: light every lane that will actually clash, all at once, before the
      // left→right resolution — so the coming fights read before they resolve.
      const clashingLanes = steps.filter((s) => s.acted).map((s) => s.lane);
      if (clashingLanes.length > 0) {
        setDeclareLanes(clashingLanes);
        await sleep(COMBAT_DECLARE_MS);
        setDeclareLanes(null);
        if (cancelAnim.current) return;
      }
      for (const step of steps) {
        if (cancelAnim.current) return;
        if (!step.acted) {
          setCombatAnim({ lane: step.lane, phase: 'skip' });
          await sleep(COMBAT_SKIP_MS);
          continue;
        }
        for (const phase of phasesForStep(step)) {
          if (cancelAnim.current) return;
          setCombatAnim({ lane: step.lane, phase });
          if (phase === 'attack') {
            // Leap each attacker into its target on the still-pre-strike board (so the
            // target is on screen), then reveal the resolved lane once the lunges land.
            for (const fx of buildAttackFx(step.events, preCombat)) {
              if (cancelAnim.current) return;
              playSound(soundForAttack(fx)); // strike sound lands with the lunge
              await playAttackFx(fx);
            }
            preRevealFx(step.events, preCombat); // kamikaze blast / metamorphosis fade-out / expel
            if (step.events.some((e) => e.t === 'transform')) await sleep(320); // let the fade-to-black read
            setGame(step.state);
            postRevealFx(step.events, preCombat); // burn sparks, bloodlust surge, shield/taunt/polish pops
            playEventSounds(step.events); // leader hits, deaths, shield blocks…
            await sleep(COMBAT_SETTLE_MS);
          } else {
            await sleep(COMBAT_STEP_MS);
          }
        }
        if (step.state.phase === 'ended') break; // lethal landed — stop the sweep
      }

      // End-of-turn preview: Growth, Smelt, Sleep-heal, and Poison ticks (both sides) — shown
      // while the ending player's board is still on screen (before the handoff). Replayed on a
      // clone purely for visuals; the authoritative endTurn recomputes it deterministically.
      if (!cancelAnim.current && postCombat.phase !== 'ended') {
        const eot = structuredClone(postCombat);
        const eotEvents: GameEvent[] = [];
        resolveEndOfTurn(eot, eot.active, eotEvents, registryRef.current);
        if (eotEvents.some((e) => EOT_FLOURISH_EVENTS.has(e.t))) {
          preRevealFx(eotEvents, postCombat); // a Poison/Smelt kill can detonate a Kamikaze here
          if (eotEvents.some((e) => e.t === 'transform')) await sleep(320);
          setGame(eot); // reveal grown/ticked stats so the StatNum glows fire too
          postRevealFx(eotEvents, postCombat, true); // Growth pop, Burn, Poison, Smelt forge…
          playEventSounds(eotEvents);
          await sleep(EOT_FX_MS);
        }
      }

      setCombatAnim(null);
      setDeclareLanes(null);
      if (!cancelAnim.current) onComplete();
    })();
  };

  /**
   * `fromAi` carries the autopilot bypass down to the `dispatch` at the end of the
   * combat animation. Without it the AI could play cards on a seized turn but never END
   * it: its own endTurn hit the human-input lock, the turn stayed open, and the driver
   * replayed the combat animation forever.
   */
  const commitEndTurn = (
    bank: Partial<Record<Element, number>> | undefined,
    sniperChoices: Partial<Record<string, LaneId>> | undefined,
    fromAi = false,
  ): void => {
    const endAction: Action = { type: 'endTurn', bank, sniperChoices };
    playSound('end_turn'); // turn is being committed (banking/combat/handoff about to run)
    if (bank && Object.values(bank).some((n) => (n ?? 0) > 0)) playSound('bank'); // energy banked this turn
    // Net play: send the endTurn; the combat animation plays when the server echoes the result
    // back (see the net message handler), keeping both clients' animations identical.
    if (net) { net.send(endAction); return; }
    animateCombat(game, sniperChoices, () => dispatch(endAction, fromAi));
  };

  // --- Net message handler -----------------------------------------------------------
  //
  // Authoritative results arrive here in net play. An endTurn plays the same combat animation
  // both clients run (re-derived deterministically from the pre-combat board), then reveals the
  // server's post-turn state; every other action reveals immediately. Kept in a ref so the
  // once-installed subscription always calls the latest closure.
  const handleServerMsg = (msg: ServerMsg): void => {
    if (msg.t === 'state') {
      const preState = gameRef.current;
      const res = { state: msg.state, events: msg.events };
      if (msg.action?.type === 'endTurn') {
        animateCombat(preState, msg.action.sniperChoices, () => applyResult(msg.action, res, preState));
      } else {
        applyResult(msg.action, res, preState);
      }
    } else if (msg.t === 'error') {
      setMessage(msg.message);
    } else if (msg.t === 'peerLeft') {
      setMessage('Your opponent left the match.');
    }
  };
  const handlerRef = useRef(handleServerMsg);
  handlerRef.current = handleServerMsg;

  useEffect(() => {
    if (!net) return;
    return net.subscribe((msg) => handlerRef.current(msg));
  }, [net]);

  /** Begin ending the turn: pick sniper targets if any can fire, else run combat + endTurn. */
  const endTurn = (bank?: Partial<Record<Element, number>>): void => {
    if (combatAnim) return; // combat already resolving
    if (autopilot) { setMessage('The commander has the field this round.'); return; }
    // A queued move/expel choice or an un-aimed Sniper bonus attack must be resolved first —
    // the engine's own `endTurn` doesn't check these, so without this guard the End Turn button
    // could silently skip a still-pending choice instead of erroring.
    if (game.pending?.length || game.extraActions?.length) {
      setMessage('Finish the current action first.');
      return;
    }
    // No round-1 exception here: the engine always resolves combat on End Turn (summoning
    // sickness already keeps a freshly-played board from swinging) — a Battle Ready Sniper
    // played turn one ignores that sickness and can fire immediately, so it needs the same
    // aim prompt as any other turn. `commitEndTurn` separately skips the ANIMATION on round 1
    // (nothing to show when the board truly is empty); that's a presentation choice, not a
    // reason to skip collecting the player's aim.
    const snipers = findActiveSnipers(game, registry);
    if (snipers.length > 0) {
      setSel({ kind: 'sniperPhase', pending: snipers, choices: {}, bank });
      return;
    }
    commitEndTurn(bank, undefined);
  };

  /** Called when the player clicks an enemy lane during sniper targeting. */
  const pickSniperTarget = (lane: LaneId): void => {
    if (sel.kind !== 'sniperPhase') return;
    const [current, ...rest] = sel.pending;
    if (!current) return;
    const choices = { ...sel.choices, [current.iid]: lane };
    if (rest.length === 0) {
      const bank = sel.bank;
      setSel({ kind: 'none' });
      commitEndTurn(bank, choices);
    } else {
      setSel({ ...sel, pending: rest, choices });
    }
  };

  /** Called when the player clicks an enemy lane to aim a queued Sniper bonus attack
   *  (`sel.kind === 'extraActionAim'`, from `game.extraActions`). */
  const pickExtraActionLane = (lane: LaneId): void => {
    if (sel.kind !== 'extraActionAim') return;
    dispatch({ type: 'resolveExtraAction', lane });
  };

  // --- AI driver ---------------------------------------------------------------------
  //
  // When it's an AI side's turn and the board is idle (no animation, no pass overlay),
  // take ONE action after a short delay; the resulting re-render schedules the next. One
  // action per render keeps each `chooseAction` reading fresh state (no stale closures)
  // and reuses the existing combat animation for the AI's `endTurn`. AI-vs-AI falls out
  // for free: each handoff lands on another AI side and the effect drives it too.
  useEffect(() => {
    if (net) return; // no local AI in net play — the server is authoritative
    // Either the seat BELONGS to the AI, or it has been seized for this round (autopilot).
    if (game.phase === 'ended' || !(aiSides[game.active] || autopilot)) return;
    if (combatAnim || passing || casting) return; // wait out combat / a pass gate / an enemy cast

    aiTimer.current = setTimeout(() => {
      const action = chooseAction(registry, game);
      if (action.type === 'endTurn') {
        // Safety: never commit an endTurn that would error — a rejected endTurn leaves the
        // turn un-ended and the driver would re-loop combat forever. Fall back to a bare
        // endTurn (no banking/sniper choices), which cannot fail.
        const fails = applyAction(registry, game, action).events.some((e) => e.t === 'error');
        commitEndTurn(fails ? undefined : action.bank, fails ? undefined : action.sniperChoices, true);
      } else dispatch(action, true);
    }, AI_STEP_MS);

    return () => {
      if (aiTimer.current) clearTimeout(aiTimer.current);
      aiTimer.current = null;
    };
    // dispatch/commitEndTurn close over `game`, which is already a dep — re-created each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, aiSides, autopilot, combatAnim, passing, casting, registry, net]);

  const reset = (): void => {
    cancelAnim.current = true;
    if (aiTimer.current) { clearTimeout(aiTimer.current); aiTimer.current = null; }
    // A queued enemy-cast beat would otherwise fire after the reset and commit the OLD board.
    if (castTimer.current) { clearTimeout(castTimer.current); castTimer.current = null; }
    setCasting(false);
    setCombatAnim(null);
    setDeclareLanes(null);
    setGame(newGame());
    setLog([]);
    setSel({ kind: 'none' });
    setDrag(null);
    setMessage('');
    setPassing(false);
  };

  return {
    game,
    registry,
    log,
    sel,
    drag,
    message,
    passing,
    combatAnim,
    declareLanes,
    animating: combatAnim !== null || casting,
    // Point of view: local play follows the active player (hotseat); net play is fixed to
    // this client's seat. All "your side" rendering keys off `pov`/`opponent`.
    pov,
    opponent: opponentOf(pov),
    /** Whether it's this client's turn to act (always true in local play). */
    myTurn,
    autopilot,
    /** This client's role — 'host' can edit content; 'player' is play-only. */
    role: (net?.role ?? 'host') as Role,
    /** True when driven by a network transport (vs local hotseat / AI). */
    isNet: Boolean(net),
    canDrag,
    clickHand,
    clickUnit,
    clickLeader,
    confirmSacrifice,
    selectHero,
    pickHeroElement,
    pickHeroLane,
    startDrag,
    endDrag,
    dropOnLane,
    dropEnvironment,
    dropOnTarget,
    addSpellTarget,
    pickMoveLane,
    pickPendingLane,
    skipPending,
    endTurn,
    pickSniperTarget,
    pickExtraActionLane,
    confirmPass: () => setPassing(false),
    cancelSelection: () => setSel({ kind: 'none' }),
    reset,
    debugMode,
    toggleDebug: () => setDebugMode((d) => !d),
    debugAddCard,
    canAffordCard,
    // AI opponent: which sides are AI-controlled, and a per-side toggle.
    aiSides,
    anyAi,
    toggleAi: (p: PlayerId) => setAiSides((s) => ({ ...s, [p]: !s[p] })),
    // Hint mode (auto-activates after idle; see the idle-watch effect)
    hintMode,
    // Sandbox tools
    sandbox,
    setSandbox,
    debugInject,
    clearBoard,
  };
};
