/**
 * Pure Adventure-run reducer.
 *
 * Every transition takes the current RunState and returns a new one (the input is
 * never mutated); an illegal transition returns the input unchanged. Persistence
 * and React wiring live in store.ts — this module is headless and fully testable.
 */
import type { Registry } from '@cards/registry';
import type { MapNode, OwnedCard, RunState } from '@adventure/schema';
import type { Element } from '@cards/schema';
import { generateMap } from '@adventure/mapgen';
import { ADVENTURE_STARTERS } from '@adventure/data/starters';
import { buyPrice, sellPrice, rollStoreOffer, rollRewardCard, rollRewardChoices, combatReward, attuneCost, restHealAmount, kindleHealAmount, ECON } from '@adventure/economy';
import { RULES } from '@engine/constants';
import { rollEnhanceOffer, canApply, applyEnhance } from '@adventure/enhance';
import { aggregateMods, rollRelicChoices } from '@adventure/relics';
import { LEADER_UPGRADES, SIGNATURE_UPGRADES, hasUnique } from '@adventure/hero';
import { relicById } from '@adventure/data/relics';
import { eventForNode } from '@adventure/data/events';
import { COPPER_MECH_HP } from '@adventure/data/copperMech';
import { makeRoller, subSeed } from '@adventure/seed';

export const startRun = (leaderId: string, seed: number, registry?: Registry): RunState => {
  const starter = ADVENTURE_STARTERS[leaderId];
  if (!starter) throw new Error(`No adventure starter deck for leader: ${leaderId}`);
  const deck: OwnedCard[] = starter.map((cardId, i) => ({ uid: `u${i}`, cardId, enhancements: [] }));
  // Run HP starts at the leader's own max. Registry is optional so existing callers
  // (and tests) that don't have one still get the standard baseline.
  const maxHp = registry?.leaders.get(leaderId)?.hp ?? RULES.LEADER_HP;
  return {
    version: 1,
    seed: seed >>> 0,
    act: 1,
    leaderId,
    hp: maxHp,
    maxHp,
    coins: ECON.STARTING_COINS,
    signatureBuff: false,
    deck,
    relics: [],
    heroUpgrades: [],
    copperBest: 0,
    copperAttempts: 0,
    adventureWon: false,
    nextUid: deck.length,
    map: generateMap(seed >>> 0, 1),
    currentNodeId: null,
    phase: { t: 'map' },
  };
};

const node = (run: RunState, id: string): MapNode | undefined => run.map.nodes[id];

/** Reward category for a fought node. */
const rewardKind = (kind: MapNode['kind']): 'combat' | 'trial' | 'elite' | 'boss' =>
  kind === 'boss' || kind === 'trial' || kind === 'elite' ? kind : 'combat';

/** Card-reward pick counts: Elites offer a wider choice than everything else. */
const DEFAULT_CARD_CHOICES = 3;
const ELITE_CARD_CHOICES = 5;

/** Nodes the player may travel to right now. */
export const reachableNodeIds = (run: RunState): string[] => {
  if (run.phase.t !== 'map') return [];
  if (run.currentNodeId === null) return run.map.layers[0] ?? [];
  return node(run, run.currentNodeId)?.next ?? [];
};

export const pickNode = (run: RunState, id: string): RunState => {
  if (!reachableNodeIds(run).includes(id)) return run;
  const target = node(run, id);
  if (!target) return run;
  const next = structuredClone(run);
  next.currentNodeId = id;
  switch (target.kind) {
    case 'combat':
    case 'trial':
    case 'elite':
    case 'boss':
      next.phase = { t: 'combat', nodeId: id, fightSeed: subSeed(run.seed, run.act, 'fight', id) };
      break;
    case 'store':
      next.phase = { t: 'store', nodeId: id };
      break;
    case 'enhance':
      next.phase = { t: 'enhance', nodeId: id };
      break;
    case 'rest':
      next.phase = { t: 'rest', nodeId: id };
      break;
    case 'event':
      next.phase = { t: 'event', nodeId: id };
      break;
  }
  return next;
};

/** Add a relic to the run and apply any one-shot acquisition mods (mutates `next`). */
const grantRelic = (next: RunState, relicId: string): void => {
  if (next.relics.includes(relicId)) return;
  next.relics.push(relicId);
  const relic = relicById(relicId);
  if (relic?.mods.startCoinsDelta) next.coins = Math.max(0, next.coins + relic.mods.startCoinsDelta);
  // Max-HP relics raise the ceiling AND heal by the same amount, so claiming one is a
  // real cushion mid-run rather than just a higher cap the player has to climb to.
  if (relic?.mods.maxHpDelta) {
    next.maxHp += relic.mods.maxHpDelta;
    next.hp = Math.min(next.maxHp, next.hp + relic.mods.maxHpDelta);
  }
};

/**
 * Settle a fight. `playerHp` is the leader HP left standing at the final board state
 * — it carries forward to the next encounter, so winning bloodied is a real cost.
 * Omitted (or non-finite) means "unchanged", keeping older call sites working.
 */
export const resolveCombat = (run: RunState, registry: Registry, won: boolean, playerHp?: number): RunState => {
  if (run.phase.t !== 'combat') return run;
  const { nodeId } = run.phase;
  const at = node(run, nodeId);
  const leader = registry.leaders.get(run.leaderId);
  if (!at || !leader) return run;
  if (!won) return { ...structuredClone(run), phase: { t: 'dead', act: run.act, nodeId } };
  const next = structuredClone(run);
  // A win means the leader survived, so clamp to at least 1 — a 0-HP "win" would
  // otherwise strand the run in an unwinnable state on the very next fight.
  if (playerHp !== undefined && Number.isFinite(playerHp)) {
    next.hp = Math.max(1, Math.min(next.maxHp, Math.floor(playerHp)));
  }
  const coins = combatReward(rewardKind(at.kind), at.layer, run.act);
  // Card pick: Elites offer a wider 5-card choice; Trials offer NONE (their reward is
  // the 2x coins + a relic); everything else the usual 3.
  const cardCount = at.kind === 'elite' ? ELITE_CARD_CHOICES : DEFAULT_CARD_CHOICES;
  const cardChoices = at.kind === 'trial' ? [] : rollRewardChoices(registry, at.seed, leader.element, cardCount);
  next.map.nodes[nodeId]!.visited = true;
  next.coins += coins;
  // Trial and boss wins offer a relic choice, gating Continue until picked. Elites do
  // NOT — their reward is the coin bump + the wider 5-card pick + the bigger fight. Act
  // 3+ bosses roll from the SAME 'rare'/'boss' bands the act 1/2 boss reward draws from.
  const relicChoices =
    at.kind === 'trial'
      ? rollRelicChoices(subSeed(run.seed, run.act, 'relic', nodeId), ['common', 'rare'], next.relics)
      : at.kind === 'boss'
        ? rollRelicChoices(subSeed(run.seed, run.act, 'relic', nodeId), ['rare', 'boss'], next.relics)
        : undefined;
  // Boss progression rewards: the act 1 boss awards the leader's unique upgrade and
  // the act 2 boss the signature buff. Each is skipped if somehow already held, so it
  // can never gate Continue forever.
  const unlock = bossUnlock(next, at.kind);
  // A boss with no unlock left to award grants a SECOND relic pick instead (see
  // `bonusRelic` on the schema) — the significant reward late acts were otherwise
  // missing. This covers act 3+, a repeat kill of an already-claimed unlock, and any
  // act whose unlock has no authored content for this leader, so a boss is never
  // reduced to just coins.
  const bonusRelic = at.kind === 'boss' && !unlock;
  next.phase = {
    t: 'reward',
    nodeId,
    coins,
    ...(cardChoices.length ? { cardChoices } : {}),
    ...(relicChoices ? { relicChoices } : {}),
    ...(unlock ? { unlock } : {}),
    ...(bonusRelic ? { bonusRelic } : {}),
  };
  return next;
};

/**
 * Which progression unlock (if any) this boss kill awards.
 *
 * BOTH unlocks are gated on an upgrade actually being AUTHORED for the run's leader.
 * `SIGNATURE_UPGRADES` is currently empty (the delivery framework shipped ahead of the
 * per-leader content), and offering `signature` regardless meant the act 2 boss handed
 * out a reward screen promising a permanently empowered Signature that changed nothing
 * — and, because an unlock suppresses `bonusRelic`, it also cost the player the relic
 * they would otherwise have received. Gating here is self-healing: authoring an entry
 * in SIGNATURE_UPGRADES turns the unlock back on for that leader with no change here.
 */
const bossUnlock = (run: RunState, kind: MapNode['kind']): 'unique' | 'signature' | undefined => {
  if (kind !== 'boss') return undefined;
  if (run.act === 1 && LEADER_UPGRADES[run.leaderId] && !hasUnique(run.heroUpgrades)) return 'unique';
  if (run.act === 2 && SIGNATURE_UPGRADES[run.leaderId] && !run.signatureBuff) return 'signature';
  return undefined;
};

/** Claim the boss progression reward; clears the unlock gate. */
export const claimUnlock = (run: RunState): RunState => {
  if (run.phase.t !== 'reward' || !run.phase.unlock) return run;
  const next = structuredClone(run);
  if (next.phase.t !== 'reward' || !next.phase.unlock) return run;
  if (next.phase.unlock === 'unique') next.heroUpgrades.push({ kind: 'unique' });
  else next.signatureBuff = true;
  delete next.phase.unlock;
  return next;
};

/**
 * Pick one of the offered relics at a reward screen; clears the choice gate. If the
 * screen carries `bonusRelic` (act 3+ boss), this immediately rolls a SECOND set into
 * `relicChoices` instead of clearing it, and consumes the flag so it fires only once.
 */
export const pickRelic = (run: RunState, relicId: string): RunState => {
  if (run.phase.t !== 'reward' || !run.phase.relicChoices?.includes(relicId)) return run;
  const next = structuredClone(run);
  grantRelic(next, relicId);
  if (next.phase.t !== 'reward') return next;
  if (next.phase.bonusRelic) {
    delete next.phase.bonusRelic;
    next.phase.relicChoices = rollRelicChoices(
      subSeed(run.seed, run.act, 'bonusrelic', next.phase.nodeId),
      ['rare', 'boss'],
      next.relics,
    );
  } else {
    delete next.phase.relicChoices;
  }
  return next;
};

/** Take one of the 3 offered reward cards into the deck; clears the card gate. */
export const pickRewardCard = (run: RunState, cardId: string): RunState => {
  if (run.phase.t !== 'reward' || !run.phase.cardChoices?.includes(cardId)) return run;
  const next = structuredClone(run);
  next.deck.push({ uid: `u${next.nextUid++}`, cardId, enhancements: [] });
  if (next.phase.t === 'reward') delete next.phase.cardChoices;
  return next;
};

/** Decline the reward card (keep the deck lean); clears the card gate. */
export const skipRewardCard = (run: RunState): RunState => {
  if (run.phase.t !== 'reward' || !run.phase.cardChoices) return run;
  const next = structuredClone(run);
  if (next.phase.t === 'reward') delete next.phase.cardChoices;
  return next;
};

const nextAct = (run: RunState): RunState => {
  const next = structuredClone(run);
  next.act += 1;
  next.map = generateMap(next.seed, next.act);
  next.currentNodeId = null;
  next.phase = { t: 'map' };
  return next;
};

/** Leave a node view (store / enhance / rest / event / reward) back to the map. */
export const leaveNode = (run: RunState): RunState => {
  const p = run.phase;
  if (p.t !== 'store' && p.t !== 'enhance' && p.t !== 'rest' && p.t !== 'event' && p.t !== 'reward') return run;
  // Pending card/relic/unlock choices must be resolved before leaving a reward.
  if (p.t === 'reward' && (p.cardChoices || p.relicChoices || p.unlock)) return run;
  const at = node(run, p.nodeId);
  if (p.t === 'reward' && at?.kind === 'boss') return nextAct(run);
  const next = structuredClone(run);
  next.map.nodes[p.nodeId]!.visited = true;
  next.phase = { t: 'map' };
  return next;
};

/** Aggregated economy mods for the current run. */
const econMods = (run: RunState) => aggregateMods(run.relics);

export const buyCard = (run: RunState, registry: Registry, offerIdx: number): RunState => {
  if (run.phase.t !== 'store') return run;
  const at = node(run, run.phase.nodeId);
  const leader = registry.leaders.get(run.leaderId);
  if (!at || !leader) return run;
  if ((at.bought ?? []).includes(offerIdx)) return run;
  const mods = econMods(run);
  const offer = rollStoreOffer(registry, at.seed, leader.element, mods.extraStoreSlots);
  const cardId = offer[offerIdx];
  const card = cardId !== undefined ? registry.cards.get(cardId) : undefined;
  if (!cardId || !card) return run;
  const price = buyPrice(card, leader.element, mods);
  if (run.coins < price) return run;
  const next = structuredClone(run);
  next.coins -= price;
  next.deck.push({ uid: `u${next.nextUid++}`, cardId, enhancements: [] });
  const bought = next.map.nodes[at.id]!;
  bought.bought = [...(bought.bought ?? []), offerIdx];
  return next;
};

export const sellCard = (run: RunState, registry: Registry, uid: string): RunState => {
  if (run.phase.t !== 'store') return run;
  const at = node(run, run.phase.nodeId);
  const leader = registry.leaders.get(run.leaderId);
  if (!at || !leader || at.soldThisVisit) return run;
  if (run.deck.length <= 1) return run; // never sell the last card
  const owned = run.deck.find((c) => c.uid === uid);
  const card = owned ? registry.cards.get(owned.cardId) : undefined;
  if (!owned || !card) return run;
  const next = structuredClone(run);
  next.coins += sellPrice(card, owned, leader.element, econMods(run));
  next.deck = next.deck.filter((c) => c.uid !== uid);
  next.map.nodes[at.id]!.soldThisVisit = true;
  return next;
};

/** Enhance node, option A: buff one owned card with the node's rolled offer. */
export const applyEnhancement = (run: RunState, registry: Registry, uid: string): RunState => {
  if (run.phase.t !== 'enhance') return run;
  const at = node(run, run.phase.nodeId);
  if (!at || at.enhanceUsed) return run;
  const owned = run.deck.find((c) => c.uid === uid);
  const card = owned ? registry.cards.get(owned.cardId) : undefined;
  if (!owned || !card) return run;
  const offer = rollEnhanceOffer(at.seed, run.act);
  const price = Math.round(offer.price * econMods(run).enhanceDiscount);
  if (!canApply(offer, card) || run.coins < price) return run;
  const next = structuredClone(run);
  next.coins -= price;
  next.deck = next.deck.map((c) => (c.uid === uid ? applyEnhance(c, offer) : c));
  next.map.nodes[at.id]!.enhanceUsed = true;
  return next;
};

/**
 * Enhance node, option B: attune (+1 element cap) instead of buffing a card. Same
 * one-purchase-per-visit gate as `applyEnhancement`, priced on the same curve as
 * Rest Site attunement (shared `attuneCost`, counting attunes bought anywhere).
 */
export const enhanceAttune = (run: RunState, element: Element): RunState => {
  if (run.phase.t !== 'enhance') return run;
  const at = node(run, run.phase.nodeId);
  if (!at || at.enhanceUsed) return run;
  const cost = Math.round(attuneCost(run.heroUpgrades.filter((u) => u.kind === 'attune').length) * econMods(run).enhanceDiscount);
  if (run.coins < cost) return run;
  const next = structuredClone(run);
  next.coins -= cost;
  next.heroUpgrades.push({ kind: 'attune', element });
  next.map.nodes[at.id]!.enhanceUsed = true;
  return next;
};

// --- Rest Site ------------------------------------------------------------------
// One service per visit: recover HP, take a card, or attune (+1 element cap). The
// leader's unique upgrade is NOT sold here — it is the act 1 boss reward (see
// `bossUnlock`), so camps stay low-stakes and the run-defining pick stays earned.

/** HP recovery. Free, but consumes the visit — that trade is the routing decision. */
export const restHeal = (run: RunState): RunState => {
  if (run.phase.t !== 'rest') return run;
  const at = node(run, run.phase.nodeId);
  if (!at || at.restUsed || run.hp >= run.maxHp) return run;
  const next = structuredClone(run);
  next.hp = Math.min(next.maxHp, next.hp + restHealAmount(next.maxHp));
  next.map.nodes[at.id]!.restUsed = true;
  return next;
};

/** The three cards a camp offers, fixed by node seed so reloading cannot reroll them. */
export const restCardOffer = (registry: Registry, run: RunState, nodeId: string): string[] => {
  const at = node(run, nodeId);
  const leader = registry.leaders.get(run.leaderId);
  if (!at || !leader) return [];
  return rollRewardChoices(registry, subSeed(at.seed, 'restcard'), leader.element);
};

/** Take one of the offered cards for free. */
export const restTakeCard = (run: RunState, registry: Registry, cardId: string): RunState => {
  if (run.phase.t !== 'rest') return run;
  const at = node(run, run.phase.nodeId);
  if (!at || at.restUsed) return run;
  if (!restCardOffer(registry, run, at.id).includes(cardId)) return run;
  const next = structuredClone(run);
  next.deck.push({ uid: `u${next.nextUid++}`, cardId, enhancements: [] });
  next.map.nodes[at.id]!.restUsed = true;
  return next;
};

/**
 * Kindle: burn 2 owned cards for a bigger heal than plain Rest — paid in cards, not
 * coins, so it's a real deckbuilding trade rather than just a stronger heal. Requires
 * at least 3 cards owned so the deck can never be burned down to empty.
 */
export const restKindle = (run: RunState, uid1: string, uid2: string): RunState => {
  if (run.phase.t !== 'rest') return run;
  const at = node(run, run.phase.nodeId);
  // Full HP would waste the two cards for zero benefit — reject, same as restHeal.
  if (!at || at.restUsed || run.hp >= run.maxHp) return run;
  if (uid1 === uid2) return run;
  if (run.deck.length - ECON.KINDLE_BURN_COUNT < 1) return run;
  if (!run.deck.some((c) => c.uid === uid1) || !run.deck.some((c) => c.uid === uid2)) return run;
  const next = structuredClone(run);
  next.deck = next.deck.filter((c) => c.uid !== uid1 && c.uid !== uid2);
  next.hp = Math.min(next.maxHp, next.hp + kindleHealAmount(next.maxHp));
  next.map.nodes[at.id]!.restUsed = true;
  return next;
};

// --- Copper Mech: the endgame challenge ----------------------------------------
// A persistent, repeatable damage race, enterable from the map at any time and the
// Adventure's win condition. Losing costs NOTHING but the attempt: the run returns to
// the map with its score updated and the map, deck, coins and HP all untouched. That is
// what makes "fightable at any time" real — you can probe it early to measure yourself,
// then come back once the deck is stronger.

/** Enter the Copper Mech fight. Only from the map, and never after the run is dead. */
export const startCopperMech = (run: RunState): RunState => {
  if (run.phase.t !== 'map') return run;
  const next = structuredClone(run);
  // The attempt counter varies the shuffle, so a retry is a fresh fight rather than a
  // replay of the same draw — while still being fully deterministic per attempt.
  next.copperAttempts += 1;
  next.phase = { t: 'copper', fightSeed: subSeed(run.seed, 'copper', next.copperAttempts) };
  return next;
};

/**
 * Settle a Copper Mech attempt. `damage` is how much was ground off its 413 HP; `killed`
 * means it fell, which wins the Adventure permanently.
 *
 * Clamped to `[0, COPPER_MECH_HP]` because the caller derives it from a live board and
 * overkill on the final blow shouldn't inflate the scoreboard past the maximum.
 */
export const resolveCopperMech = (run: RunState, damage: number, killed: boolean): RunState => {
  if (run.phase.t !== 'copper') return run;
  const next = structuredClone(run);
  const dealt = Number.isFinite(damage) ? Math.max(0, Math.min(COPPER_MECH_HP, Math.floor(damage))) : 0;
  const record = dealt > next.copperBest;
  if (record) next.copperBest = dealt;
  if (killed) next.adventureWon = true;
  next.phase = { t: 'copperResult', damage: dealt, killed, record };
  return next;
};

/** Dismiss the Copper Mech scoreboard and return to the map. */
export const leaveCopperMech = (run: RunState): RunState => {
  if (run.phase.t !== 'copperResult') return run;
  return { ...structuredClone(run), phase: { t: 'map' } };
};

// --- Events --------------------------------------------------------------------

export const chooseEventOption = (run: RunState, registry: Registry, idx: number): RunState => {
  if (run.phase.t !== 'event') return run;
  const at = node(run, run.phase.nodeId);
  if (!at || at.eventChoice !== undefined) return run;
  const event = eventForNode(at.seed);
  const choice = event.choices[idx];
  if (!choice) return run;
  if (choice.cost !== undefined && run.coins < choice.cost) return run;
  if (choice.requiresDeck !== undefined && run.deck.length < choice.requiresDeck) return run;
  // Structural floor for the sacrifice trade (2 burned + 1 buffed), independent of
  // whatever `requiresDeck` the choice happens to declare. Rejecting the transition
  // outright is what keeps it from silently consuming the visit for no effect.
  if (choice.outcome.kind === 'sacrificeEnhance' && run.deck.length < 3) return run;

  const next = structuredClone(run);
  if (choice.cost) next.coins = Math.max(0, next.coins - choice.cost);
  const roll = makeRoller(subSeed(run.seed, run.act, 'event', at.id));
  const leaderElement = registry.leaders.get(run.leaderId)?.element ?? 'fire';
  const o = choice.outcome;

  switch (o.kind) {
    case 'coins':
      next.coins = Math.max(0, next.coins + o.amount);
      break;
    case 'relic': {
      const [relicId] = rollRelicChoices(subSeed(run.seed, run.act, 'eventrelic', at.id), o.bands, next.relics, 1);
      if (relicId) grantRelic(next, relicId);
      break;
    }
    case 'card': {
      const cardId = o.cardId === 'random' ? rollRewardCard(registry, at.seed, leaderElement) : o.cardId;
      if (registry.cards.has(cardId)) next.deck.push({ uid: `u${next.nextUid++}`, cardId, enhancements: [] });
      break;
    }
    case 'sacrificeEnhance': {
      // The deck-size gate is the choice's own `requiresDeck`, already checked above —
      // this branch previously re-checked a DIFFERENT threshold (3 vs the authored 4)
      // and, when it failed, fell through to mark the choice taken anyway: the player
      // paid the click, read the result line, and nothing happened. There is no second
      // threshold; reaching here means the trade is legal.
      const order = roll.shuffle(next.deck.map((c) => c.uid));
      const [sac1, sac2, buff] = order;
      next.deck = next.deck.filter((c) => c.uid !== sac1 && c.uid !== sac2);
      next.deck = next.deck.map((c) => (c.uid === buff ? applyEnhance(c, { enhancement: { kind: 'stat', attack: 2, hp: 2 }, price: 0, label: '+2/+2' }) : c));
      break;
    }
    case 'combat':
      next.map.nodes[at.id]!.eventChoice = idx;
      if (o.twistId) next.map.nodes[at.id]!.twistId = o.twistId;
      next.phase = { t: 'combat', nodeId: at.id, fightSeed: subSeed(run.seed, run.act, 'fight', at.id) };
      return next;
    case 'nothing':
      break;
  }

  next.map.nodes[at.id]!.eventChoice = idx;
  next.map.nodes[at.id]!.visited = true;
  next.phase = { t: 'map' };
  return next;
};
