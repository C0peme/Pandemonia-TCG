/**
 * Boss rules — the mechanisms a named Adventure boss's signature is built from.
 *
 * These exist because the boss table had drifted into being a second trial-twist table:
 * ten of thirteen bosses used `globalBuff` / `globalKeyword` / `globalOnPlayStatus` /
 * `fixedEnvironments`, which are literally the twist kinds. A twist ADJUSTS the board and
 * is applied once, by rewriting the run registry or seeding the opening state. A boss rule
 * BREAKS A RULE — a card in your hand you cannot play, a death that does not stick, a play
 * that is copied onto the other side — and so has to live for the whole fight, which needs
 * per-turn and per-event hooks. That is the difference this module is.
 *
 * THE ROUND-ONE RULE. Every rule here bites on round 1. Adventure fights are short — a
 * great many never reach round 3 — so a boss rule with a wind-up ("from round 3, a lane
 * closes"; "your Signature never arrives") is a boss with no rule at all in the fights
 * that matter. Anything added to this file has to be checkable at the first Declare
 * Attack, and `bosses.test.ts` asserts it for the authored table.
 *
 * Nothing in here reads Adventure state or assumes Adventure's seating; every rule names
 * the player it acts on, so a fixture can aim any of them at either seat.
 */
import type { Card } from '@cards/schema';
import type { Registry } from '@cards/registry';
import { LANES, laneAllowed, type LaneId, type LaneLayout } from '@engine/constants';
import { createUnitInstance, makeFoundationUnit } from '@engine/board';
import { addAttack, reconcileDrowning } from '@engine/drowning';
import { refreshEnvironmentGrants } from '@engine/environment';
import { addCardToHand } from '@engine/hand';
import type { GameEvent } from '@engine/events';
import type { GameState, PlayerId, UnitInstance } from '@engine/types';

/**
 * RE-LAY THE BOARD: set which of the five columns is Heights, Ground or Water, and
 * optionally pre-place Environments into the new lanes.
 *
 * The single implementation behind both `BossRules.laneLayout` and the `laneLayout` Trial
 * twist — the mechanism is identical, only who chose it differs (a boss's signature, or a
 * rule the player picked off a Trial shortlist).
 *
 * Only lane TYPES move. The five columns keep their ids and their left-to-right order, so
 * adjacency (splash, collateral), the state shape and every animation target are untouched;
 * see `GameState.laneTypes`. Two things have to be re-derived afterwards, and both are
 * easy to forget:
 *
 *  - DROWNING, for every unit already on the board. A column that was Ground and is now
 *    Water sinks whatever is standing in it; a column that was Water and is now Ground
 *    surfaces it, restoring the attack parked in `predrownAttack`.
 *  - ENVIRONMENT LEGALITY. `laneAllowed` is checked against the NEW layout, so an
 *    environment that opts into Ground follows the ground wherever the layout puts it —
 *    and one that does not opt into Water is refused if its column just became Water,
 *    rather than being silently placed somewhere it could never legally go.
 */
export const applyLaneLayout = (
  registry: Registry,
  s: GameState,
  layout: LaneLayout,
  places: { lane: LaneId; cardId: string }[] = [],
): void => {
  s.laneTypes = { ...layout };
  for (const { lane, cardId } of places) {
    const card = registry.cards.get(cardId);
    if (!card || card.type !== 'environment') continue;
    if (!laneAllowed(card.lanes, lane, s.laneTypes)) continue;
    s.environments[lane] = { iid: `env${s.iidSeq++}`, cardId, owner: 0 };
  }
  // Grants first (an Environment may hand out Aquatic), THEN the shared drowning rule —
  // the same order every other placement path uses, and for the same reason.
  refreshEnvironmentGrants(registry, s);
  for (const side of [0, 1] as PlayerId[]) {
    for (const lane of LANES) {
      const laneObj = s.players[side].lanes[lane];
      for (const u of [laneObj.front, laneObj.back, laneObj.standaloneFoundation]) {
        if (u) reconcileDrowning(u, lane, s.laneTypes);
      }
    }
  }
};

/** Total energy+element cost of a card — the ordering used by seal and execute. */
export const cardCostValue = (card: Card | undefined): number => {
  if (!card) return -1;
  return card.cost.energy + (card.cost.elements ?? []).reduce((s, e) => s + e.amount, 0);
};

/**
 * Does a placement fire on this round?
 *
 * `everyRounds: 0` is the opening board (handled at build time, never here). `2` means
 * the ODD rounds — 1, 3, 5 — so the very first round is included; a cult that only shows
 * up on round 2 is a cult that misses most of the fight.
 */
const placesThisRound = (everyRounds: number, round: number): boolean =>
  everyRounds > 0 && (round - 1) % everyRounds === 0;

/**
 * Fill `side`'s EMPTY lanes with `cardId`.
 *
 * Only empty lanes, so a board the boss has already developed is never clobbered — and a
 * player who cleared the lane last round gets it back, which is exactly the tax the rule
 * is charging. Handles foundations too (Cleath's bunker), via the same `makeFoundationUnit`
 * path a standalone Foundation uses, so the walls fight and grant like any other ground.
 */
export const placeBossUnits = (
  registry: Registry,
  s: GameState,
  cardId: string,
  side: PlayerId,
  events: GameEvent[],
): void => {
  const def = registry.cards.get(cardId);
  if (!def || (def.type !== 'unit' && def.type !== 'foundation')) return;
  let placed = 0;
  for (const lane of LANES) {
    const laneObj = s.players[side].lanes[lane];
    if (laneObj.front || laneObj.standaloneFoundation) continue;
    const iid = `br${s.iidSeq++}`;
    if (def.type === 'foundation') {
      laneObj.standaloneFoundation = makeFoundationUnit(def, { iid, cardId: def.id }, side);
    } else {
      laneObj.front = createUnitInstance(def, { iid, cardId: def.id }, side, false);
    }
    placed++;
    events.push({ t: 'summon', player: side, cardId: def.id, lane });
  }
  if (placed === 0) return;
  // Environment grants first (a lane may hand out Aquatic), THEN the shared drowning
  // rule — the same order `applyTrialToState`'s fixedUnits path uses, and for the same
  // reason: re-deriving water compatibility inline would ignore those grants.
  refreshEnvironmentGrants(registry, s);
  for (const lane of LANES) {
    const unit = s.players[side].lanes[lane].front;
    if (unit) reconcileDrowning(unit, lane, s.laneTypes);
  }
};

/**
 * Start-of-ROUND boss rules: recurring placements.
 *
 * Called from `beginTurn` for the round's opening seat only (`state.first`), so a rule
 * that fills the boss's lanes has done so before the player's attack step — which is the
 * whole point of it, and is why this keys off the round opener rather than off the side
 * being filled.
 */
export const resolveRoundStartRules = (
  registry: Registry,
  s: GameState,
  events: GameEvent[],
): void => {
  for (const p of s.bossRules?.placements ?? []) {
    if (placesThisRound(p.everyRounds, s.round)) placeBossUnits(registry, s, p.cardId, p.side, events);
  }
};

/**
 * Seal the highest-cost card in `player`'s hand for this turn (Screyera's Foresight).
 *
 * Re-chosen every turn rather than fixed for the fight, so the rule tracks the hand: it is
 * always the card you most wanted that she has already seen. Ties break on hand order,
 * which is stable within a turn.
 */
export const resolveSeal = (registry: Registry, s: GameState, player: PlayerId): void => {
  const pl = s.players[player];
  if (s.bossRules?.seal !== player) {
    delete pl.sealedIid;
    return;
  }
  let best: { iid: string; cost: number } | undefined;
  for (const inst of pl.hand) {
    const cost = cardCostValue(registry.cards.get(inst.cardId));
    if (!best || cost > best.cost) best = { iid: inst.iid, cost };
  }
  if (best) pl.sealedIid = best.iid;
  else delete pl.sealedIid;
};

/** Is this hand card sealed for its owner's current turn? */
export const isSealed = (s: GameState, player: PlayerId, iid: string): boolean =>
  s.players[player].sealedIid === iid;

/**
 * MIRROR (Autopus): a unit this player plays is copied onto the opposing side, into the
 * same lane. Called from `playUnit` after the unit is on the board.
 *
 * The copy is built from the same def, so an ENHANCED card — whose `adv:` derived def is
 * already seated in the run registry — is copied at its enhanced size. That is the rule's
 * point: build a God Unit and you hand the boss one too.
 *
 * Skipped when the mirrored lane is occupied; a mirror that shoved the boss's own board
 * around would be a different (and much worse) rule.
 */
export const resolveMirror = (
  registry: Registry,
  s: GameState,
  player: PlayerId,
  def: Card,
  lane: LaneId,
  events: GameEvent[],
): void => {
  if (s.bossRules?.mirror !== player) return;
  if (def.type !== 'unit') return;
  const other: PlayerId = player === 0 ? 1 : 0;
  const laneObj = s.players[other].lanes[lane];
  if (laneObj.front) return;
  const iid = `mr${s.iidSeq++}`;
  laneObj.front = createUnitInstance(def, { iid, cardId: def.id }, other, false);
  events.push({ t: 'summon', player: other, cardId: def.id, lane });
  refreshEnvironmentGrants(registry, s);
  const unit = laneObj.front;
  if (unit) reconcileDrowning(unit, lane, s.laneTypes);
};

/**
 * DAMPEN (Eksana's Correction): units this player plays enter with reduced attack.
 *
 * Not a status, deliberately — the god-unit build carries Immunity by act 6, and anything
 * routed through `applyStatus` is already answered by it. This writes the body directly,
 * through `addAttack` so the drowning shadow-copy contract is respected.
 */
export const resolveDampen = (s: GameState, player: PlayerId, unit: UnitInstance): void => {
  const d = s.bossRules?.dampen;
  if (!d || d.player !== player) return;
  addAttack(unit, -Math.min(d.attack, unit.attack));
};

/**
 * RECURSION (Noctua): a unit that dies rises under the recursion player's control.
 *
 * Called from `processDeaths` with the corpse, AFTER its slot is cleared and its death
 * trigger has fired — so a Kamikaze still pays out, and the unit that comes back is a
 * fresh body rather than a rewound one. `raised` bounds it to once per unit: without that
 * bound, a raised unit that dies again re-enters inside the same fixpoint loop, forever.
 *
 * Returns true if the corpse was claimed.
 */
export const resolveRecursion = (
  registry: Registry,
  s: GameState,
  corpse: UnitInstance,
  events: GameEvent[],
): boolean => {
  const to = s.bossRules?.recursion;
  if (to === undefined || corpse.raised || corpse.isLeaderUnit) return false;
  const def = registry.cards.get(corpse.cardId);
  if (!def || def.type !== 'unit') return false;
  for (const lane of LANES) {
    const laneObj = s.players[to].lanes[lane];
    if (laneObj.front) continue;
    const iid = `rc${s.iidSeq++}`;
    const risen = createUnitInstance(def, { iid, cardId: def.id }, to, false);
    risen.raised = true;
    laneObj.front = risen;
    events.push({ t: 'summon', player: to, cardId: def.id, lane });
    refreshEnvironmentGrants(registry, s);
    reconcileDrowning(risen, lane, s.laneTypes);
    return true;
  }
  return false;
};

/**
 * EXECUTE (Ring Leader): at the end of this player's turn, their highest-cost unit dies.
 *
 * Destruction, not a status — so Immunity and True Shield do not stop it, which is the
 * point: this is the one boss in the table that specifically hunts the biggest thing you
 * built. The kill is a direct hp write; the caller runs `processDeaths` after, so death
 * triggers, Zombified and promotion all resolve through the normal path.
 */
export const resolveExecute = (registry: Registry, s: GameState, player: PlayerId, events: GameEvent[]): void => {
  if (s.bossRules?.execute !== player) return;
  let best: { unit: UnitInstance; cost: number } | undefined;
  for (const lane of LANES) {
    const laneObj = s.players[player].lanes[lane];
    for (const slot of ['front', 'back'] as const) {
      const u = laneObj[slot];
      if (!u || u.isLeaderUnit) continue;
      const cost = cardCostValue(registry.cards.get(u.cardId));
      if (!best || cost > best.cost) best = { unit: u, cost };
    }
  }
  if (!best) return;
  best.unit.hp = 0;
  events.push({ t: 'execute', player, iid: best.unit.iid, cardId: best.unit.cardId });
};

/**
 * METASTASIS: `player` playing a unit hands `energy` to the OTHER side's `energyNext`.
 *
 * Rides the same one-turn-carry field Producers and Cancerous Growth already use, so it
 * needs no new energy plumbing — `beginTurn` adds `energyNext` on top of the round number
 * and clears it in the same breath, exactly as it does for those.
 */
export const resolveFeedOnPlay = (s: GameState, player: PlayerId): void => {
  const f = s.bossRules?.feedOnPlay;
  if (!f || f.player !== player) return;
  const other = s.players[player === 0 ? 1 : 0];
  other.energyNext = (other.energyNext ?? 0) + f.energy;
};

/**
 * BEHIND THE MASK: at the start of `player`'s turn, their single most expensive hand card
 * is taken into the OTHER side's hand.
 *
 * "Most expensive" mirrors `resolveSeal`/`resolveExecute` — the boss table's one recurring
 * idea of what "your best card" means — so ties break the same way (hand order).
 * `addCardToHand` is the only legal way a card enters a hand (it also handles hand-cap
 * overflow on the receiving side), so the theft goes through it rather than pushing onto
 * `hand` directly.
 */
export const resolveSteal = (registry: Registry, s: GameState, player: PlayerId, events: GameEvent[]): void => {
  if (s.bossRules?.steal !== player) return;
  const pl = s.players[player];
  if (pl.hand.length === 0) return;
  let best: { idx: number; cost: number } | undefined;
  for (let i = 0; i < pl.hand.length; i++) {
    const cost = cardCostValue(registry.cards.get(pl.hand[i]!.cardId));
    if (!best || cost > best.cost) best = { idx: i, cost };
  }
  if (!best) return;
  const [taken] = pl.hand.splice(best.idx, 1);
  if (!taken) return;
  const other: PlayerId = player === 0 ? 1 : 0;
  events.push({ t: 'stolen', from: player, cardId: taken.cardId });
  addCardToHand(s, other, taken, events);
};
