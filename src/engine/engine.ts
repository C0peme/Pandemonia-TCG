/**
 * The engine reducer: applyAction(registry, state, action) -> { state, events }.
 *
 * Pure and deterministic. `registry` is static card content (not mutable state).
 * Wave 1 fully implements playUnit + endTurn (which declares the attack); spells,
 * foundations, environments, and hero powers are stubbed for later waves.
 */
import { ELEMENTS, LANES, type LaneId } from '@engine/constants';
import type { Registry } from '@cards/registry';
import type { Card, Cost, Effect, SpellCard, UnitCard } from '@cards/schema';
import type { Action, LanePosition, TargetRef } from '@engine/actions';
import { buffUnit, createUnitInstance, makeFoundationUnit, locateUnit, relocateUnit, vacateSlot } from '@engine/board';
import { refreshLaneEnvironment } from '@engine/environment';
import { resolveCombat, resolveExtraAction } from '@engine/combat';
import { applyEffects, applyOnPlayEffects, processDeaths } from '@engine/effects';
import { damageLeader, reconcileLeaderUnit } from '@engine/damage';
import { applyBanking, canAfford, settleCost } from '@engine/energy';
import { addCardToHand, forgetCard } from '@engine/hand';
import { resolveEndOfTurn } from '@engine/endOfTurn';
import type { ApplyResult, GameEvent } from '@engine/events';
import { applyFoundation } from '@engine/foundation';
import { applyStatus } from '@engine/status';
import { addAttack, reconcileDrowning } from '@engine/drowning';
import { beginTurn } from '@engine/turn';
import {
  opponentOf,
  type GameState,
  type Lane,
  type PlayerId,
  type PlayerState,
  type UnitInstance,
} from '@engine/types';

const err = (state: GameState, message: string): ApplyResult => ({
  state,
  events: [{ t: 'error', message }],
});

/** Checks both leaders; if either is at 0 HP, sets phase=ended and pushes gameOver. Returns true if game ended. */
const checkGameOver = (draft: GameState, events: GameEvent[]): boolean => {
  reconcileLeaderUnit(draft, events); // sync leaderHp from any leader-unit first
  const p0hp = draft.players[0].leaderHp;
  const p1hp = draft.players[1].leaderHp;
  if (p0hp > 0 && p1hp > 0) return false;
  const winner = p1hp <= 0 ? 0 : 1;
  draft.phase = 'ended';
  draft.winner = winner;
  events.push({ t: 'gameOver', winner });
  return true;
};


const replacePlayer = (state: GameState, next: PlayerState): GameState => ({
  ...state,
  players: { ...state.players, [next.id]: next },
});

const hasDoubleTeam = (lane: Lane): boolean =>
  Boolean(lane.front?.keywords.doubleTeam) || Boolean(lane.back?.keywords.doubleTeam);

/** Decide where a unit can go in a lane, or null if the lane is full. */
const resolvePosition = (
  lane: Lane,
  incoming: UnitCard,
  requested?: LanePosition,
): LanePosition | null => {
  const doubleTeamAvailable = hasDoubleTeam(lane) || Boolean(incoming.keywords.doubleTeam);
  // A standalone Foundation in an empty lane lets a unit go in front (it will bond).
  if (!lane.front && lane.standaloneFoundation) return 'front';
  if (!lane.front) {
    if (requested === 'back') return doubleTeamAvailable ? 'back' : null;
    return 'front';
  }
  // front occupied
  if (!lane.back && doubleTeamAvailable) {
    // Player can choose: place in front (pushing existing unit to back) or place in back (default).
    if (requested === 'front') return 'front';
    return 'back';
  }
  return null;
};

const makeUnit = createUnitInstance;

const playUnit = (
  registry: Registry,
  state: GameState,
  iid: string,
  lane: LaneId,
  position: LanePosition | undefined,
  sacrifice: string[] | undefined,
): ApplyResult => {
  const draft: GameState = structuredClone(state);
  const player = draft.players[draft.active];
  const idx = player.hand.findIndex((c) => c.iid === iid);
  if (idx < 0) return err(state, `Card ${iid} is not in hand`);
  const inst = player.hand[idx]!;

  const def = registry.cards.get(inst.cardId);
  if (!def) return err(state, `Unknown card: ${inst.cardId}`);
  if (def.type !== 'unit') return err(state, `${def.name} is not a unit`);

  const effUnitCost: Cost = { ...def.cost, energy: Math.max(0, def.cost.energy + costModFor(player, 'unit')) };
  const afford = canAfford(player, effUnitCost);
  if (!afford.ok) return err(state, afford.reason ?? 'Cannot afford');

  const laneObj = player.lanes[lane];
  const slot = resolvePosition(laneObj, def, position);
  if (!slot) return err(state, `Lane ${lane} is full`);

  // Validate a Sacrifice payment up front (so the action is all-or-nothing). Sacrifice is
  // optional: 0 up to `max` of your own units may be offered, each granting the buff.
  const sac = def.keywords.sacrifice;
  if (sacrifice && sacrifice.length > 0) {
    if (!sac) return err(state, `${def.name} has no Sacrifice ability`);
    if (sacrifice.length > sac.max) return err(state, `Can sacrifice at most ${sac.max} unit(s)`);
    for (const sIid of sacrifice) {
      const loc = locateUnit(draft, sIid);
      if (!loc || loc.owner !== draft.active) return err(state, `Cannot sacrifice ${sIid}`);
    }
  }

  // Water lane: units without water-compatibility drown.
  const waterCompatible = Boolean(def.keywords.aquatic) || Boolean(def.keywords.airborne);
  const drowning = lane === 'water' && !waterCompatible;

  payInline(player, effUnitCost);
  player.hand.splice(idx, 1);
  const unit = makeUnit(def, inst, draft.active, drowning);
  // Placing in front when a unit is already there (Double Team swap): push existing front to back.
  if (slot === 'front' && laneObj.front) {
    laneObj.back = laneObj.front;
  }
  laneObj[slot] = unit;
  // Apply the lane's Environment grants on entry (matching relocation). This can hand out
  // Aquatic — e.g. Shallows — which un-drowns the unit before we report it as drowning.
  refreshLaneEnvironment(registry, draft, lane);

  const events: GameEvent[] = [
    { t: 'playUnit', player: draft.active, cardId: def.id, lane, position: slot },
  ];
  if (unit.status.drowning) events.push({ t: 'drowning', player: draft.active, cardId: def.id });

  // Aquatic water-entry effects: fire when the unit enters the water lane.
  // Airborne units act as if in the Heights, so they forfeit Aquatic's bonus.
  const aquaticEffects = Array.isArray(def.keywords.aquatic) ? def.keywords.aquatic : null;
  if (lane === 'water' && !drowning && aquaticEffects && !def.keywords.airborne) {
    applyOnPlayEffects(draft, unit, aquaticEffects, events, undefined, registry);
  }

  // Auto-bond with any standalone Foundation already in this lane.
  if (laneObj.standaloneFoundation) {
    const sfData = laneObj.standaloneFoundation;
    const foundDef = registry.cards.get(sfData.cardId);
    if (foundDef && foundDef.type === 'foundation') {
      unit.foundation = applyFoundation(unit, foundDef, sfData.iid, lane);
      unit.foundation.hp = sfData.hp; // preserve HP after any standalone damage
      laneObj.standaloneFoundation = undefined;
      // A foundation is a prepared position: a unit bonding onto ground already in play (placed a
      // prior turn) deploys ready to fight — a free Battle Ready. Same-turn foundation+unit drops
      // don't get this; the ground must have been set in advance.
      if (!sfData.justPlaced) unit.justPlaced = false;
      events.push({ t: 'foundationBonded', player: draft.active, foundationCardId: foundDef.id, hostIid: unit.iid });
    }
  }

  // Sacrifice: destroy the chosen units (triggering their death effects), then apply the
  // buff once per unit sacrificed. Zero sacrifices = no buff (a plain, weaker body).
  if (sac && sacrifice && sacrifice.length > 0) {
    for (const sIid of sacrifice) {
      const loc = locateUnit(draft, sIid);
      if (loc) {
        loc.unit.hp = 0;
        events.push({ t: 'sacrifice', iid: sIid, forIid: unit.iid });
      }
    }
    processDeaths(draft, events, undefined, registry);
    for (let i = 0; i < sacrifice.length; i++) buffUnit(unit, sac.buff, events);
  }

  // Generic on-play effects (Frost King, Ra Lax, Spinning Top Bruiser, etc.). On-play
  // Healer/Debuff/Expel/Mover are folded into `def.onPlay` by expandKeywordEffects.
  // Move/expel effects queue an interactive choice (resolved per activation by the UI).
  if (def.onPlay?.length) applyOnPlayEffects(draft, unit, def.onPlay, events, { interactive: true }, registry);

  // Environment effects are NOT applied on entry; the lane's Environment re-applies them to
  // all units in the lane at the end of each combat phase (see combat.ts resolveCombatStatuses),
  // so hazards like Molten Floor keep biting rather than firing once on entry.

  return { state: draft, events };
};

const playFoundation = (
  registry: Registry,
  state: GameState,
  iid: string,
  lane: LaneId,
  _position: LanePosition | undefined, // reserved; placement order is now always Foundation-first
): ApplyResult => {
  const draft: GameState = structuredClone(state);
  const player = draft.players[draft.active];
  const idx = player.hand.findIndex((c) => c.iid === iid);
  if (idx < 0) return err(state, `Card ${iid} is not in hand`);
  const inst = player.hand[idx]!;

  const def = registry.cards.get(inst.cardId);
  if (!def) return err(state, `Unknown card: ${inst.cardId}`);
  if (def.type !== 'foundation') return err(state, `${def.name} is not a foundation`);

  const laneObj = player.lanes[lane];

  // Foundations must be placed BEFORE any unit — they are the base layer.
  if (laneObj.front || laneObj.back) {
    return err(state, `A unit already occupies ${lane} — place the Foundation first, then a unit on top`);
  }
  if (laneObj.standaloneFoundation) {
    return err(state, `A Foundation is already waiting in ${lane}`);
  }

  const effFoundCost: Cost = { ...def.cost, energy: Math.max(0, def.cost.energy + costModFor(player, 'foundation')) };
  const afford = canAfford(player, effFoundCost);
  if (!afford.ok) return err(state, afford.reason ?? 'Cannot afford');

  payInline(player, effFoundCost);
  player.hand.splice(idx, 1);
  laneObj.standaloneFoundation = makeFoundationUnit(def, inst, draft.active);

  return {
    state: draft,
    events: [{ t: 'foundationPlaced', player: draft.active, cardId: def.id, hostIid: '' }],
  };
};

/** Pay a cost in-place on a draft player (caller must have checked affordability).
 *  Delegates to `settleCost` so this shares ONE settlement rule with `canAfford`/`payCost`:
 *  element requirements draw from the bank first and fall back to generic energy. Deducting
 *  `req.amount` from the bank directly here would drive it negative whenever the player is
 *  covering a shortfall with energy. */
const payInline = (player: PlayerState, cost: Cost): void => {
  const settled = settleCost(player, cost);
  player.energy = settled.energy;
  player.bank = settled.bank;
};

/**
 * The single source of truth for where an Environment may be placed. Exported so
 * every placement path (hand plays, the AI's legal actions, Adventure's pre-placed
 * boss/trial hazards, and their tests) enforces the same rule — never re-implement it.
 */
export const laneAllowed = (restrictions: string[], lane: LaneId): boolean => {
  // Water and Heights are special: an environment may only be placed there if it
  // explicitly opts in (as a deliberate drawback). Empty restrictions default to
  // ground-only rather than "any lane".
  if (restrictions.length === 0) return lane === 'ground1' || lane === 'ground2';
  return restrictions.some((r) => r === 'ground' ? lane === 'ground1' || lane === 'ground2' : r === lane);
};

const playSpell = (
  registry: Registry,
  state: GameState,
  iid: string,
  targets: TargetRef[] | undefined,
  lane: LaneId | undefined,
): ApplyResult => {
  const draft: GameState = structuredClone(state);
  const player = draft.players[draft.active];
  const idx = player.hand.findIndex((c) => c.iid === iid);
  if (idx < 0) return err(state, `Card ${iid} is not in hand`);
  const inst = player.hand[idx]!;
  const def = registry.cards.get(inst.cardId);
  if (!def) return err(state, `Unknown card: ${inst.cardId}`);
  if (def.type !== 'spell') return err(state, `${def.name} is not a spell`);

  const effCost: Cost = { ...def.cost, energy: Math.max(0, def.cost.energy + costModFor(player, 'spell')) };
  const afford = canAfford(player, effCost);
  if (!afford.ok) return err(state, afford.reason ?? 'Cannot afford');

  payInline(player, effCost);
  player.hand.splice(idx, 1);
  player.discard.push(inst);

  const events: GameEvent[] = [{ t: 'castSpell', player: draft.active, cardId: def.id }];
  const error = applyEffects(draft, draft.active, def.effects, targets ?? [], lane, events, registry);
  if (error) return err(state, error); // reject; original state untouched
  checkGameOver(draft, events);
  return { state: draft, events };
};

const playEnvironment = (
  registry: Registry,
  state: GameState,
  iid: string,
  lane: LaneId,
): ApplyResult => {
  const draft: GameState = structuredClone(state);
  const player = draft.players[draft.active];
  const idx = player.hand.findIndex((c) => c.iid === iid);
  if (idx < 0) return err(state, `Card ${iid} is not in hand`);
  const inst = player.hand[idx]!;
  const def = registry.cards.get(inst.cardId);
  if (!def) return err(state, `Unknown card: ${inst.cardId}`);
  if (def.type !== 'environment') return err(state, `${def.name} is not an environment`);
  if (!laneAllowed(def.lanes, lane)) return err(state, `${def.name} cannot be placed in ${lane}`);

  const effEnvCost: Cost = { ...def.cost, energy: Math.max(0, def.cost.energy + costModFor(player, 'environment')) };
  const afford = canAfford(player, effEnvCost);
  if (!afford.ok) return err(state, afford.reason ?? 'Cannot afford');

  payInline(player, effEnvCost);
  player.hand.splice(idx, 1);
  // Persistent lane effect is applied in a later wave; for now the environment is placed,
  // replacing any prior environment in that lane.
  // Environments are shared per lane column — one at a time. Placing a new one replaces
  // any existing Environment in that lane (either player's). Its keyword grants take
  // effect at combat time (see environment.ts / combat.ts); it just occupies the lane now.
  draft.environments[lane] = { iid: inst.iid, cardId: def.id, owner: draft.active };

  return {
    state: draft,
    events: [{ t: 'playEnvironment', player: draft.active, cardId: def.id, lane }],
  };
};

const heroPower = (
  registry: Registry,
  state: GameState,
  targets: TargetRef[] | undefined,
  lane: LaneId | undefined,
): ApplyResult => {
  const draft: GameState = structuredClone(state);
  const player = draft.players[draft.active];
  if (player.heroPowerUsed) return err(state, 'Hero power already used this turn');
  const leader = registry.leaders.get(player.leaderId);
  if (!leader) return err(state, `Unknown leader: ${player.leaderId}`);

  const afford = canAfford(player, leader.heroPower.cost);
  if (!afford.ok) return err(state, afford.reason ?? 'Cannot afford');

  // Optional HP cost is paid from the caster's own leader. It cannot be self-lethal:
  // the leader must have strictly more HP than the cost.
  const hpCost = leader.heroPower.hpCost ?? 0;
  if (hpCost > 0 && player.leaderHp <= hpCost) return err(state, 'Not enough HP to pay the hero power');

  payInline(player, leader.heroPower.cost);
  player.heroPowerUsed = true;

  const events: GameEvent[] = [{ t: 'heroPower', player: draft.active }];
  // Route the HP cost through damageLeader so it can unlock the caster's own Signature.
  if (hpCost > 0) damageLeader(draft, draft.active, hpCost, events, registry);
  const error = applyEffects(draft, draft.active, leader.heroPower.effects, targets ?? [], lane, events, registry);
  if (error) return err(state, error);
  checkGameOver(draft, events);
  return { state: draft, events };
};

const moveUnit = (registry: Registry, state: GameState, targetIid: string, toLane: LaneId): ApplyResult => {
  const draft: GameState = structuredClone(state);
  const loc = locateUnit(draft, targetIid);
  if (!loc) return err(state, `No such unit: ${targetIid}`);
  const events: GameEvent[] = [];
  const error = relocateUnit(registry, draft, loc, toLane, events);
  if (error) return err(state, error);
  return { state: draft, events };
};

/** Pop and return the queue with the first pending choice removed (clearing `pending` when empty). */
const dropPending = (draft: GameState): void => {
  const rest = (draft.pending ?? []).slice(1);
  if (rest.length) draft.pending = rest;
  else delete draft.pending;
};

/**
 * Resolve the first queued interactive move/expel choice against the chosen target
 * (and destination lane for a move). Omitting `targetIid` skips that activation.
 */
const resolvePending = (registry: Registry, state: GameState, targetIid: string | undefined, toLane: LaneId | undefined): ApplyResult => {
  const pc = state.pending?.[0];
  if (!pc) return err(state, 'No pending choice to resolve');

  // Skip this activation (e.g. no legal target on the board).
  if (!targetIid) {
    const draft: GameState = structuredClone(state);
    dropPending(draft);
    return { state: draft, events: [] };
  }

  const draft: GameState = structuredClone(state);
  const loc = locateUnit(draft, targetIid);
  if (!loc) return err(state, `No such unit: ${targetIid}`);
  const isAlly = loc.owner === pc.player;
  if (pc.scope === 'self' && targetIid !== pc.sourceIid) return err(state, 'Must target this unit');
  if (pc.scope === 'ally' && !isAlly) return err(state, 'Must target an ally');
  if (pc.scope === 'enemy' && isAlly) return err(state, 'Must target an enemy');

  const events: GameEvent[] = [];
  if (pc.kind === 'move') {
    if (!toLane) return err(state, 'Move requires a destination lane');
    const error = relocateUnit(registry, draft, loc, toLane, events);
    if (error) return err(state, error);
  } else if (pc.kind === 'forget') {
    vacateSlot(draft.players[loc.owner].lanes[loc.lane], loc.slot);
    forgetCard(draft, loc.owner, { iid: loc.unit.iid, cardId: loc.unit.cardId }, events);
  } else {
    vacateSlot(draft.players[loc.owner].lanes[loc.lane], loc.slot);
    events.push({ t: 'expel', iid: loc.unit.iid, cardId: loc.unit.cardId, victim: loc.owner });
    // Full hand forgets the returned card instead (a Null bleeds its leader).
    addCardToHand(draft, loc.owner, { iid: loc.unit.iid, cardId: loc.unit.cardId }, events);
  }
  dropPending(draft);
  return { state: draft, events };
};

const endTurn = (
  registry: Registry,
  state: GameState,
  bankChoice: Partial<Record<'fire' | 'water' | 'nature' | 'earth', number>> | undefined,
  sniperChoices?: Partial<Record<string, LaneId>>,
): ApplyResult => {
  const events: GameEvent[] = [];
  let working = state;

  // Declare Attack: the active player's units resolve combat, unless this is the
  // first player's round-1 turn.
  const skipCombat = working.active === working.first && working.round === 1;
  if (!skipCombat) {
    const combat = resolveCombat(working, sniperChoices, registry);
    working = combat.state;
    events.push(...combat.events);
    if (working.phase === 'ended') return { state: working, events };
  }

  // End-of-Turn effects resolve now, for the player whose turn is ending — AFTER their
  // Declare Attack. This is why a Sleep/Freeze applied to a unit survives until after the
  // unit's own attack: the duration ticks down here, at the end of the unit-owner's turn.
  if (working === state) working = structuredClone(working); // ensure a private draft (skip-combat path)
  resolveEndOfTurn(working, working.active, events, registry);
  if (checkGameOver(working, events)) return { state: working, events };

  // Banking: overflow leftover energy into chosen elements (clamped to caps/energy; never fails).
  const active = working.players[working.active];
  const banked = applyBanking(active, bankChoice ?? {});
  for (const [el, amt] of Object.entries(banked.applied)) {
    if (amt) events.push({ t: 'bank', player: working.active, element: el as never, amount: amt });
  }
  // Temporary cost modifiers (e.g. Anti Magic Field) last exactly the affected player's
  // turn, so clear the ending player's `costMods` now. `costBase` (persistent run-long
  // discounts) is deliberately left untouched.
  working = replacePlayer(working, { ...active, bank: banked.bank, costMods: { unit: 0, spell: 0, foundation: 0, environment: 0 } });
  events.push({ t: 'endTurn', player: working.active });

  // Handoff.
  const nextActive = opponentOf(working.active);
  const nextRound = nextActive === working.first ? working.round + 1 : working.round;
  working = { ...working, active: nextActive, round: nextRound, turn: working.turn + 1 };

  const begun = beginTurn(working, nextActive, registry);
  events.push(...begun.events);
  working = begun.state;
  checkGameOver(working, events);
  return { state: working, events };
};

/**
 * Resolve any bonus attacks queued by `extraAction` effects during this action. Mutates
 * `result.state` in place (it is already a fresh draft) and appends combat events.
 */
const drainExtraActions = (registry: Registry, result: ApplyResult): ApplyResult => {
  const draft = result.state;
  if (!draft.extraActions?.length) return result;
  const events = result.events;
  while (draft.extraActions?.length) {
    const iid = draft.extraActions.shift()!;
    resolveExtraAction(draft, iid, registry, events);
    if (checkGameOver(draft, events)) break;
  }
  delete draft.extraActions;
  return result;
};

export const applyAction = (
  registry: Registry,
  state: GameState,
  action: Action,
): ApplyResult => {
  if (state.phase === 'ended') return err(state, 'Game is over');

  const result = ((): ApplyResult => {
    switch (action.type) {
      case 'playUnit':
        return playUnit(registry, state, action.iid, action.lane, action.position, action.sacrifice);
      case 'playFoundation':
        return playFoundation(registry, state, action.iid, action.lane, action.position);
      case 'playSpell':
        return playSpell(registry, state, action.iid, action.targets, action.lane);
      case 'playEnvironment':
        return playEnvironment(registry, state, action.iid, action.lane);
      case 'heroPower':
        return heroPower(registry, state, action.targets, action.lane);
      case 'endTurn':
        return endTurn(registry, state, action.bank, action.sniperChoices);
      case 'moveUnit':
        return moveUnit(registry, state, action.targetIid, action.toLane);
      case 'resolvePending':
        return resolvePending(registry, state, action.targetIid, action.toLane);
      case 'debugAddCard': {
        if (!registry.cards.has(action.cardId)) return err(state, `Unknown card: ${action.cardId}`);
        const draft: GameState = structuredClone(state);
        draft.players[draft.active].hand.push({ iid: `dbg${draft.iidSeq++}`, cardId: action.cardId });
        return { state: draft, events: [] };
      }
      case 'debugMaxEnergy': {
        const draft: GameState = structuredClone(state);
        const p = draft.players[draft.active];
        p.energy = 999;
        p.bank = { fire: 999, water: 999, nature: 999, earth: 999 };
        return { state: draft, events: [] };
      }
      case 'debugPlaceUnit': {
        const def = registry.cards.get(action.cardId);
        if (!def || def.type !== 'unit') return err(state, 'Pick a unit card to place.');
        const draft: GameState = structuredClone(state);
        const lane = draft.players[action.player].lanes[action.lane];
        const drowning = action.lane === 'water' && !def.keywords.aquatic && !def.keywords.airborne;
        const unit = createUnitInstance(def, { iid: `dbg${draft.iidSeq++}`, cardId: def.id }, action.player, drowning);
        unit.justPlaced = false; // sandbox units are ready to act immediately
        const pos = action.position ?? (lane.front ? 'back' : 'front');
        if (pos === 'back') {
          if (!lane.front) lane.front = unit;
          else lane.back = unit;
        } else {
          if (lane.front && !lane.back) lane.back = lane.front;
          lane.front = unit;
        }
        refreshLaneEnvironment(registry, draft, action.lane);
        return { state: draft, events: [] };
      }
      case 'debugApplyStatus': {
        const draft: GameState = structuredClone(state);
        const loc = locateUnit(draft, action.iid);
        if (!loc) return err(state, 'Unit not found.');
        const u = loc.unit;
        if (action.status === 'shield') {
          // Shield is keyword-backed with a live counter; go through the shared helper rather
          // than hand-rolling the two stores (see status.ts).
          applyStatus(u, 'shield', { shield: 1 }, []);
        } else if (action.status === 'clear') {
          if (u.status.drowning) u.attack = u.predrownAttack ?? u.attack;
          u.status = {};
        } else if (action.status === 'drowning') {
          u.status.drowning = true;
          u.predrownAttack = u.predrownAttack ?? u.attack;
          u.attack = 0;
        } else if (action.status === 'sleep') {
          u.status.sleep = 1;
        } else if (action.status === 'freeze') {
          u.status.freeze = 1;
        } else if (action.status === 'burn') {
          u.status.burn = (u.status.burn ?? 0) + 1;
        } else if (action.status === 'poison') {
          u.status.poisoned = (u.status.poisoned ?? 0) + 1;
        }
        return { state: draft, events: [] };
      }
      case 'debugToggleKeyword': {
        const draft: GameState = structuredClone(state);
        const loc = locateUnit(draft, action.iid);
        if (!loc) return err(state, 'Unit not found.');
        const kw = loc.unit.keywords as Record<string, unknown>;
        const k = action.keyword;
        // Numeric keywords toggle unset ⇄ 1; the rest are plain boolean flags.
        if (k === 'tough' || k === 'spike') {
          if (kw[k]) delete kw[k];
          else kw[k] = 1;
        } else if (kw[k]) {
          delete kw[k];
        } else {
          kw[k] = true;
        }
        // Airborne/Aquatic change Water compatibility, so the drowning state must be re-derived
        // for the unit's lane (never left stale — see drowning.ts).
        if (k === 'airborne' || k === 'aquatic') reconcileDrowning(loc.unit, loc.lane);
        return { state: draft, events: [] };
      }
      case 'debugAdjustStat': {
        const draft: GameState = structuredClone(state);
        const loc = locateUnit(draft, action.iid);
        if (!loc) return err(state, 'Unit not found.');
        const u = loc.unit;
        if (action.stat === 'attack') {
          // Never assign `attack` directly — addAttack writes to whichever store is live
          // (predrownAttack while drowning), preserving the Water invariant.
          addAttack(u, action.delta);
        } else {
          u.hp = Math.max(1, u.hp + action.delta);
          if (u.hp > u.maxHp) u.maxHp = u.hp;
        }
        return { state: draft, events: [] };
      }
      case 'debugSetLeaderHp': {
        const draft: GameState = structuredClone(state);
        const p = draft.players[action.player];
        p.leaderHp = Math.max(0, Math.min(action.hp, p.leaderMaxHp ?? 30));
        return { state: draft, events: [] };
      }
      case 'debugRemoveUnit': {
        const draft: GameState = structuredClone(state);
        const loc = locateUnit(draft, action.iid);
        if (!loc) return err(state, 'Unit not found.');
        vacateSlot(draft.players[loc.owner].lanes[loc.lane], loc.slot);
        return { state: draft, events: [] };
      }
      case 'debugClearBoard': {
        const draft: GameState = structuredClone(state);
        for (const pid of [0, 1] as const) {
          for (const ln of LANES) {
            draft.players[pid].lanes[ln].front = undefined;
            draft.players[pid].lanes[ln].back = undefined;
            // Standalone Foundations are board occupants too — leaving them behind meant
            // "Clear board" didn't actually clear the board.
            draft.players[pid].lanes[ln].standaloneFoundation = undefined;
          }
        }
        return { state: draft, events: [] };
      }
      default: {
        const _exhaustive: never = action;
        return err(state, `Unknown action: ${JSON.stringify(_exhaustive)}`);
      }
    }
  })();

  // Resolve any bonus attacks the action queued (unless it errored and left state intact).
  return result.state.phase === 'ended' ? result : drainExtraActions(registry, result);
};

// --- Move generator -------------------------------------------------------------------
//
// `legalActions` is the complete, reusable move generator (UI hints + AI). It ENUMERATES
// candidate actions, then VALIDATES each by trial-applying it to a clone and discarding
// any that produce an `error` event — so the engine itself is the source of truth on
// legality and the enumerators can stay simple (slightly over-permissive is fine).

/** Every unit currently in play on `side` (front + back across all lanes). */
const unitsOnSide = (state: GameState, side: PlayerId): UnitInstance[] =>
  LANES.flatMap((l) =>
    [state.players[side].lanes[l].front, state.players[side].lanes[l].back].filter(
      (u): u is UnitInstance => Boolean(u),
    ),
  );

/** Effect kinds that help their target, so an ambiguous scope defaults to the caster's side. */
const BENEFICIAL_KINDS: ReadonlySet<Effect['kind']> = new Set([
  'heal', 'buff', 'energy', 'draw', 'cleanse',
]);

/**
 * This player's total cost modifier for a card type: the temporary per-turn `costMods`
 * plus the persistent `costBase` (which survives turn-end). The single source of truth
 * for effective cost — every play/afford path routes through it.
 */
export const costModFor = (player: PlayerState, type: Card['type']): number =>
  player.costMods[type] + (player.costBase?.[type] ?? 0);

/** Effective cost of a hand card after this player's per-type cost modifier. */
const affordableCard = (
  player: PlayerState,
  def: { type: Card['type']; cost: Cost },
): boolean => {
  const effCost: Cost = { ...def.cost, energy: Math.max(0, def.cost.energy + costModFor(player, def.type)) };
  return canAfford(player, effCost).ok;
};

/** Cartesian product of candidate lists (used to fan a multi-target spell over its targets). */
const product = <T>(lists: T[][]): T[][] =>
  lists.reduce<T[][]>((acc, list) => acc.flatMap((prev) => list.map((x) => [...prev, x])), [[]]);

/**
 * Candidate target refs for ONE effect, polarity-aware (mirrors effects.ts targeting):
 *  - `null`   → the effect consumes no target ref (AOE / leaderUnit / side-scoped)
 *  - `[]`     → it needs a ref but no legal target exists (caller drops the whole card)
 *  - refs     → one ref per legal target on the appropriate side
 */
const effectTargetRefs = (
  state: GameState,
  caster: PlayerId,
  effect: Effect,
): TargetRef[] | null => {
  const { kind, target: scope } = effect;
  if (scope === 'all-enemy' || scope === 'all-ally' || scope === 'leaderUnit') return null;
  if (kind === 'draw' || kind === 'forget' || kind === 'summon' || kind === 'conjure' || kind === 'costMod' || kind === 'custom') {
    return null;
  }
  if (kind === 'energy') {
    return effect.chooseElement ? ELEMENTS.map((element) => ({ kind: 'element', element })) : null;
  }
  // Targeted unit/leader effect — pick the side from the scope, else from polarity.
  const ownSide =
    scope === 'ally' || scope === 'lane-ally' || scope === 'self'
      ? true
      : scope === 'enemy' || scope === 'lane-enemy'
        ? false
        : BENEFICIAL_KINDS.has(kind);
  const side = ownSide ? caster : opponentOf(caster);
  const refs: TargetRef[] = unitsOnSide(state, side).map((u) => ({ kind: 'unit', iid: u.iid }));
  // Only damage/heal accept a leader ref directly (applyOne special-cases it).
  if (kind === 'damage' || kind === 'heal') refs.push({ kind: 'leader', player: side });
  return refs;
};

/** All target-ref combinations for an effect list, or null if any required ref is unfillable. */
const targetCombos = (state: GameState, effects: Effect[]): TargetRef[][] | null => {
  const lists: TargetRef[][] = [];
  for (const eff of effects) {
    const refs = effectTargetRefs(state, state.active, eff);
    if (refs === null) continue; // consumes no ref
    if (refs.length === 0) return null; // unfillable → card not castable
    lists.push(refs);
  }
  return lists.length ? product(lists) : [[]];
};

const unitPlays = (state: GameState, player: PlayerState, iid: string, def: UnitCard): Action[] => {
  if (!affordableCard(player, def)) return [];
  // Sacrifice: the buff stacks once per unit offered, up to `max`. Offer 0, each single own
  // unit (so a specific weak/dying body can be picked), and the "feed the N weakest" combos
  // up to `max` (the usual optimum when you want the full buff). The evaluator picks among them.
  const sacOptions: Array<string[] | undefined> = [undefined];
  const sac = def.keywords.sacrifice;
  if (sac) {
    const own = unitsOnSide(state, state.active);
    for (const u of own) sacOptions.push([u.iid]);
    const weakestFirst = [...own].sort((a, b) => a.attack + a.hp - (b.attack + b.hp));
    for (let n = 2; n <= Math.min(sac.max, weakestFirst.length); n++) {
      sacOptions.push(weakestFirst.slice(0, n).map((u) => u.iid));
    }
  }

  const out: Action[] = [];
  for (const lane of LANES) {
    const laneObj = player.lanes[lane];
    const positions: Array<LanePosition | undefined> = [undefined];
    const dtAvail =
      Boolean(laneObj.front?.keywords.doubleTeam) ||
      Boolean(laneObj.back?.keywords.doubleTeam) ||
      Boolean(def.keywords.doubleTeam);
    // The only meaningful front/back fork is Double-Team's "swap to front" when front is taken.
    if (laneObj.front && !laneObj.back && dtAvail) positions.push('front');
    for (const position of positions)
      for (const sacrifice of sacOptions)
        out.push({ type: 'playUnit', iid, lane, position, sacrifice });
  }
  return out;
};

const spellPlays = (state: GameState, player: PlayerState, iid: string, def: SpellCard): Action[] => {
  if (!affordableCard(player, def)) return [];
  const combos = targetCombos(state, def.effects);
  if (!combos) return [];
  const lanes: Array<LaneId | undefined> = def.effects.some((e) => e.kind === 'move') ? [...LANES] : [undefined];
  const out: Action[] = [];
  for (const targets of combos)
    for (const lane of lanes)
      out.push({ type: 'playSpell', iid, targets: targets.length ? targets : undefined, lane });
  return out;
};

const heroPowerPlays = (registry: Registry, state: GameState, player: PlayerState): Action[] => {
  if (player.heroPowerUsed) return [];
  const leader = registry.leaders.get(player.leaderId);
  if (!leader || !canAfford(player, leader.heroPower.cost).ok) return [];
  const combos = targetCombos(state, leader.heroPower.effects);
  if (!combos) return [];
  const lanes: Array<LaneId | undefined> = leader.heroPower.effects.some((e) => e.kind === 'move') ? [...LANES] : [undefined];
  const out: Action[] = [];
  for (const targets of combos)
    for (const lane of lanes)
      out.push({ type: 'heroPower', targets: targets.length ? targets : undefined, lane });
  return out;
};

/** Resolve-pending candidates for the first queued move/expel/forget choice (skip + each target). */
const pendingActions = (state: GameState): Action[] => {
  const pc = state.pending?.[0];
  if (!pc) return [];
  const out: Action[] = [{ type: 'resolvePending' }]; // skip this activation
  const pool =
    pc.scope === 'self' ? unitsOnSide(state, pc.player).filter((u) => u.iid === pc.sourceIid)
    : pc.scope === 'ally' ? unitsOnSide(state, pc.player)
    : pc.scope === 'enemy' ? unitsOnSide(state, opponentOf(pc.player))
    : [...unitsOnSide(state, 0), ...unitsOnSide(state, 1)];
  for (const u of pool) {
    if (pc.kind === 'move') for (const lane of LANES) out.push({ type: 'resolvePending', targetIid: u.iid, toLane: lane });
    else out.push({ type: 'resolvePending', targetIid: u.iid });
  }
  return out;
};

/** Dedup candidates and keep only those that apply without error (endTurn/skip always kept). */
const validate = (registry: Registry, state: GameState, candidates: Action[]): Action[] => {
  const seen = new Set<string>();
  const out: Action[] = [];
  for (const a of candidates) {
    const key = JSON.stringify(a);
    if (seen.has(key)) continue;
    seen.add(key);
    // endTurn and the pending-skip can't meaningfully "fail" — keep them unconditionally.
    if (a.type === 'endTurn' || (a.type === 'resolvePending' && a.targetIid === undefined)) {
      out.push(a);
      continue;
    }
    if (!applyAction(registry, state, a).events.some((e) => e.t === 'error')) out.push(a);
  }
  return out;
};

/**
 * Enumerate the active player's legal actions: every play (units, foundations, spells with
 * legal targets, environments, hero power) plus a bare `endTurn`. While interactive
 * move/expel choices are queued (`state.pending`), only `resolvePending` options are legal.
 *
 * NOTE: the `endTurn` here is bare — its `bank`/`sniperChoices` are computed separately when
 * the turn is actually committed (see `endTurnChoices` in ai.ts).
 */
export const legalActions = (registry: Registry, state: GameState): Action[] => {
  if (state.phase === 'ended') return [];
  if (state.pending?.length) return validate(registry, state, pendingActions(state));

  const player = state.players[state.active];
  const candidates: Action[] = [{ type: 'endTurn' }];
  for (const inst of player.hand) {
    const def = registry.cards.get(inst.cardId);
    if (!def) continue;
    if (def.type === 'unit') candidates.push(...unitPlays(state, player, inst.iid, def));
    else if (def.type === 'foundation' && affordableCard(player, def)) {
      for (const lane of LANES) candidates.push({ type: 'playFoundation', iid: inst.iid, lane });
    } else if (def.type === 'spell') candidates.push(...spellPlays(state, player, inst.iid, def));
    else if (def.type === 'environment' && affordableCard(player, def)) {
      for (const lane of LANES) if (laneAllowed(def.lanes, lane)) candidates.push({ type: 'playEnvironment', iid: inst.iid, lane });
    }
  }
  candidates.push(...heroPowerPlays(registry, state, player));
  return validate(registry, state, candidates);
};
