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
import { sellPrice, slotPrice, relicPrice, relicUnbindCost, rollStoreOffer, storeRerollCost, rollRewardCard, rollRewardChoices, combatReward, attuneCost, round5, restHealAmount, kindleHealAmount, victoryHealAmount, hpCeiling, ECON } from '@adventure/economy';
import { RULES } from '@engine/constants';
<<<<<<< Updated upstream
import { rollEnhanceOffer, canApply, applyEnhance } from '@adventure/enhance';
import { aggregateMods, rollRelicChoices } from '@adventure/relics';
import { LEADER_UPGRADES, hasUnique } from '@adventure/hero';
import { relicById } from '@adventure/data/relics';
import { eventForNode } from '@adventure/data/events';
=======
import { rollEnhanceOffers, canApply, applyEnhance, rerollCost } from '@adventure/enhance';
import { runMods, rollRelicChoices, rollStoreRelics, brokenRelics, effectiveAct } from '@adventure/relics';
import { LEADER_UPGRADES, SIGNATURE_UPGRADES, hasUnique } from '@adventure/hero';
import { relicById } from '@adventure/data/relics';
import { trialById, twistSeverity, trialRewardBands, trialCoinMult } from '@adventure/trials';
import { pickEvent, eventById, type EventOutcome, type EventRequirement } from '@adventure/data/events';
import { boonById, type Boon } from '@adventure/data/boons';
import { COPPER_MECH_HP } from '@adventure/data/copperMech';
>>>>>>> Stashed changes
import { makeRoller, subSeed } from '@adventure/seed';

/**
 * Apply an opening boon to a freshly-built run (mutates `run`).
 *
 * Every field of `Boon` must be handled here — an unhandled field is silently free
 * power. The boon is applied at construction rather than as a phase the player walks
 * through, so the run that reaches the map is already the run they chose.
 */
const applyBoon = (run: RunState, boon: Boon, registry?: Registry): void => {
  run.boonId = boon.id;
  const grants: { relics: string[]; cards: string[] } = { relics: [], cards: [] };
  let relicChoices: string[] | undefined;
  if (boon.coins) run.coins = Math.max(0, run.coins + boon.coins);
  // The FIRST of the recurring payouts — `nextAct` (below) pays out every one after this.
  if (boon.coinsPerAct) run.coins = Math.max(0, run.coins + boon.coinsPerAct);
  if (boon.mendLevel) run.mendLevel += boon.mendLevel;
  if (boon.maxHpDelta) {
    // Floor at 1: a costed boon must never be able to start a run already dead, however
    // the constants are later retuned.
    run.maxHp = Math.max(1, run.maxHp + boon.maxHpDelta);
    run.hp = Math.min(hpCeiling(run.maxHp), Math.max(1, run.hp + boon.maxHpDelta));
  }
  const roll = makeRoller(subSeed(run.seed, `boon:${boon.id}`));
  if (boon.attune) {
    const element = registry?.leaders.get(run.leaderId)?.element;
    // Without a registry there is no leader element to attune, so the grant is skipped
    // rather than guessed — attuning the wrong element is worse than not attuning.
    if (element) for (let i = 0; i < boon.attune; i++) run.heroUpgrades.push({ kind: 'attune', element });
  }
  if (boon.trim) {
    // Shuffle then drop: trimming the FIRST n would always cut the same cards from a
    // fixed starter list, which is a different (and duller) boon than a thinner deck.
    const doomed = new Set(roll.shuffle(run.deck.map((c) => c.uid)).slice(0, boon.trim));
    if (run.deck.length - doomed.size >= ECON.MIN_DECK_SIZE) {
      run.deck = run.deck.filter((c) => !doomed.has(c.uid));
    }
  }
  if (boon.buff) {
    const units = run.deck.filter((c) => {
      const def = registry?.cards.get(c.cardId);
      return def ? def.type === 'unit' || def.type === 'foundation' : false;
    });
    for (const uid of roll.shuffle(units.map((c) => c.uid)).slice(0, boon.buff.count)) {
      run.deck = run.deck.map((c) =>
        c.uid === uid ? applyEnhance(c, { kind: 'stat', attack: boon.buff!.attack, hp: boon.buff!.hp }) : c);
    }
  }
  if (boon.randomCards && registry) {
    const element = registry.leaders.get(run.leaderId)?.element;
    if (element) {
      for (let i = 0; i < boon.randomCards; i++) {
        const cardId = rollRewardCard(registry, subSeed(run.seed, `boon-card:${i}`), element);
        run.deck.push({ uid: `u${run.nextUid++}`, cardId, enhancements: [] });
        grants.cards.push(cardId);
      }
    }
  }
  if (boon.relicIds) {
    // Granted outright, not offered: the boon's blurb already named it, so there is
    // nothing left to choose. Goes through `grantRelic` like every other acquisition, so
    // a named relic's one-shot payload (and a broken relic's repair debt) is seeded
    // exactly as it would be from a shop counter.
    for (const relicId of boon.relicIds) {
      grantRelic(run, relicId, registry);
      grants.relics.push(relicId);
    }
  }
  if (boon.relicBands) {
    // Offered, not assigned: the boon says "a relic", and which relic is the player's
    // call, exactly as it is at every other relic payout in the run.
    relicChoices = rollRelicChoices(
      subSeed(run.seed, 'boon-relic'), boon.relicBands, run.relics, DEFAULT_CARD_CHOICES,
    );
  }
  if (grants.relics.length || grants.cards.length) run.boonGrants = grants;
  // The run opens on a result screen whenever the boon actually handed something over —
  // a rolled relic to choose, or rolled cards to look at — instead of starting on the map
  // with unexplained additions already in the deck and tray.
  if (relicChoices?.length || grants.cards.length) {
    run.phase = {
      t: 'gain',
      text: `${boon.icon} ${boon.name} — ${boon.blurb}`,
      ...(relicChoices?.length ? { relicChoices } : {}),
      ...(grants.cards.length ? { gainedCards: grants.cards } : {}),
    };
  }
};

/**
 * Start a run. `boonId` is the opening boon chosen at the leader picker (see
 * `data/boons.ts`); omitting it starts a plain run, which is what every pre-boon caller
 * and test fixture does.
 */
export const startRun = (leaderId: string, seed: number, registry?: Registry, boonId?: string): RunState => {
  const starter = ADVENTURE_STARTERS[leaderId];
  if (!starter) throw new Error(`No adventure starter deck for leader: ${leaderId}`);
  const deck: OwnedCard[] = starter.map((cardId, i) => ({ uid: `u${i}`, cardId, enhancements: [] }));
  // Run HP starts at the leader's own max. Registry is optional so existing callers
  // (and tests) that don't have one still get the standard baseline.
  const maxHp = registry?.leaders.get(leaderId)?.hp ?? RULES.LEADER_HP;
  const run: RunState = {
    version: 1,
    seed: seed >>> 0,
    act: 1,
    leaderId,
    hp: maxHp,
    maxHp,
    mendLevel: 0,
    coins: ECON.STARTING_COINS,
    signatureBuff: false,
    deck,
    relics: [],
    heroUpgrades: [],
<<<<<<< Updated upstream
=======
    copperBest: 0,
    copperAttempts: 0,
    copperTiers: [],
    seenEvents: [],
    eventFlags: [],
    eventBank: 0,
    spentRelics: [],
    relicRepair: {},
    adventureWon: false,
>>>>>>> Stashed changes
    nextUid: deck.length,
    map: generateMap(seed >>> 0, 1),
    currentNodeId: null,
    phase: { t: 'map' },
  };
  const boon = boonId ? boonById(boonId) : undefined;
  if (boon) applyBoon(run, boon, registry);
  return run;
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
    case 'trial':
      // A Trial stops to let the player choose its condition first. A node that already
      // has a `twistId` (an older map, an event-spawned trial, a test fixture) skips
      // straight to the fight — the choice exists, it has simply already been made.
      if (!target.twistId && (target.twistChoices?.length ?? 0) > 0) {
        next.phase = { t: 'trial', nodeId: id };
        break;
      }
      next.phase = { t: 'combat', nodeId: id, fightSeed: subSeed(run.seed, run.act, 'fight', id) };
      break;
    case 'combat':
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
    case 'event': {
      // Resolve WHICH event this is on entry and record it, so the pick (which prefers
      // unseen events) cannot change under the player between viewing and choosing.
      // Flags gate the later parts of a chain, so "The Tinker, Again" can only be drawn
      // by a run that actually met the Tinker.
      const chosen = target.eventId ?? pickEvent(target.seed, next.seenEvents, next.eventFlags).id;
      next.map.nodes[id]!.eventId = chosen;
      if (!next.seenEvents.includes(chosen)) next.seenEvents.push(chosen);
      next.phase = { t: 'event', nodeId: id };
      break;
    }
  }
  return next;
};

/**
 * Add a relic to the run and apply any one-shot acquisition mods (mutates `next`).
 *
 * `registry` is optional and only needed by `temperRandom`, which has to know which owned
 * cards actually have stats to buff; without one that payload is skipped rather than
 * guessed at. Every caller inside a reward flow has a registry to hand.
 */
const grantRelic = (next: RunState, relicId: string, registry?: Registry): void => {
  if (next.relics.includes(relicId)) return;
  next.relics.push(relicId);
  const relic = relicById(relicId);
  if (!relic) return;
  // A BROKEN relic arrives owing repairs. Seeded here rather than lazily on first read,
  // so the HUD can show "3 wins to repair" the moment it lands and a reload cannot
  // silently reset the debt.
  if (relic.broken && relic.repairWins) {
    next.relicRepair = { ...next.relicRepair, [relicId]: relic.repairWins };
  }
  const m = relic.mods;
  if (m.startCoinsDelta) next.coins = Math.max(0, next.coins + m.startCoinsDelta);
  // Proportional coins resolve against the purse as it stands at CLAIM time — after any
  // flat delta above, so a relic granting both compounds in the order it is written.
  if (m.coinsPercent) next.coins = Math.max(0, next.coins + Math.round(next.coins * m.coinsPercent));
  // Max-HP relics raise the ceiling AND heal by the same amount, so claiming one is a
  // real cushion mid-run rather than just a higher cap the player has to climb to.
  // Floors at 2: several boss relics buy their power with a permanent max-HP cut, and no
  // combination of them may found a run that is already dead.
  if (m.maxHpDelta) {
    next.maxHp = Math.max(2, next.maxHp + m.maxHpDelta);
    // Clamped to the overheal ceiling, not to maxHp — a player already carrying temporary
    // HP must not have it silently shaved off by picking up a max-HP relic.
    next.hp = Math.max(1, Math.min(runCeiling(next), next.hp + m.maxHpDelta));
  }
  // Temporary HP on claim: real HP banked ABOVE the maximum, which only Rest otherwise
  // produces. Clamped to the (relic-aware) ceiling like every other out-of-fight heal.
  if (m.tempHpDelta) {
    next.hp = Math.min(runCeiling(next), next.hp + m.tempHpDelta);
  }
  // --- one-shot RUN TRANSFORMATIONS (the boss band's third shape) -------------------
  // Resolved on claim and never again. Seeded off the relic id rather than a node, so the
  // same claim in the same run always burns/tempers the same cards.
  const roll = makeRoller(subSeed(next.seed, next.act, 'relicclaim', relicId));
  if (m.trimDeck) {
    // The PLAYER chooses which cards leave, not the reducer — see `RunState.pendingTrim`.
    // Floored at MIN_DECK_SIZE, exactly like selling and the `trimDeck` event outcome: a
    // thinning reward must never be able to strand a run with an unplayable deck, and it
    // must never demand more picks than the run can actually afford to make.
    const removable = Math.max(0, next.deck.length - ECON.MIN_DECK_SIZE);
    const count = Math.min(m.trimDeck, removable);
    if (count > 0) {
      next.pendingTrim = {
        count,
        ...(m.trimCoinsPerCard ? { coinsPerCard: m.trimCoinsPerCard } : {}),
        ...(m.trimBuffPerCard ? { buffPerCard: m.trimBuffPerCard } : {}),
      };
    }
  }
  if (m.temperRandom && registry) {
    const eligible = next.deck.filter((c) => {
      const def = registry.cards.get(c.cardId);
      return def?.type === 'unit' || def?.type === 'foundation';
    });
    const chosen = new Set(roll.shuffle(eligible.map((c) => c.uid)).slice(0, m.temperRandom.count));
    next.deck = next.deck.map((c) =>
      chosen.has(c.uid) ? applyEnhance(c, { kind: 'stat', attack: m.temperRandom!.attack, hp: m.temperRandom!.hp }) : c);
  }
  for (const cardId of m.grantCards ?? []) {
    next.deck.push({ uid: `u${next.nextUid++}`, cardId, enhancements: [] });
  }
  if (m.spendAllForBuff && registry) {
    const { perCoins, attack, hp, maxSteps } = m.spendAllForBuff;
    const steps = Math.min(maxSteps, Math.floor(next.coins / perCoins));
    if (steps > 0) {
      next.coins -= steps * perCoins;
      next.deck = next.deck.map((c) => {
        const def = registry.cards.get(c.cardId);
        if (def?.type !== 'unit' && def?.type !== 'foundation') return c;
        return applyEnhance(c, { kind: 'stat', attack: steps * attack, hp: steps * hp });
      });
    }
  }
};

/**
 * Mark every `consumedAfterBattle` relic spent (mutating and returning `next`).
 *
 * Monster Train's "Divine" pattern: twice the power of an ordinary relic, gone after one
 * fight. It fires on a LOSS as well as a win — a relic you carried into a battle was
 * carried into a battle, and letting a defeat refund it would make holding one strictly
 * free. A spent relic stays in the tray, greyed, because "you already used it" is
 * information the run should not hide.
 */
const spendConsumables = (next: RunState): RunState => {
  for (const id of next.relics) {
    if (relicById(id)?.mods.consumedAfterBattle && !next.spentRelics.includes(id)) next.spentRelics.push(id);
  }
  return next;
};

/**
 * Work one battle off every broken relic's repair debt (mutating and returning `next`).
 *
 * Only WINS count, which is the whole design: the price of a broken relic is paid in the
 * currency the run is already trying to earn, so the drawback shrinks exactly as fast as
 * the player is doing well. A loss leaves the debt untouched rather than growing it —
 * a curse that punishes you harder for struggling is the "cannot be overcome" failure
 * this shape exists to avoid.
 *
 * An entry hitting zero is DELETED rather than kept at 0, so `brokenRelics` stays a
 * simple truthiness scan and a repaired relic leaves no trace in the save.
 */
const repairRelicsOnWin = (next: RunState): RunState => {
  const repair = { ...(next.relicRepair ?? {}) };
  let changed = false;
  for (const [id, left] of Object.entries(repair)) {
    if (left <= 0) { delete repair[id]; changed = true; continue; }
    changed = true;
    if (left - 1 <= 0) delete repair[id];
    else repair[id] = left - 1;
  }
  if (changed) next.relicRepair = repair;
  return next;
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
  if (!won) {
    // Phoenix Ember: the first battle you would LOSE, you survive at 1 HP instead, and
    // the relic is spent. This is the only thing in the run that changes how the MAP is
    // walked rather than how a fight goes — it is permission to take the route you would
    // otherwise have avoided, which no amount of stats can be.
    //
    // The rescue lands on the map, not on a reward screen: you did not win, so there is
    // nothing to award; you simply are not dead.
    const saviour = run.relics.find((id) => relicById(id)?.mods.reviveOnce && !run.spentRelics.includes(id));
    if (saviour) {
      const saved = structuredClone(run);
      saved.spentRelics.push(saviour);
      saved.hp = 1;
      saved.map.nodes[nodeId]!.visited = true;
      saved.phase = { t: 'map' };
      return spendConsumables(saved);
    }
    return { ...structuredClone(run), phase: { t: 'dead', act: run.act, nodeId } };
  }
  const next = repairRelicsOnWin(spendConsumables(structuredClone(run)));
  // A win means the leader survived, so clamp to at least 1 — a 0-HP "win" would
  // otherwise strand the run in an unwinnable state on the very next fight.
  // Clamped to the OVERHEAL ceiling, not to maxHp: temporary HP carried in from an
  // earlier Rest is real HP and must survive a fight it wasn't spent in.
  if (playerHp !== undefined && Number.isFinite(playerHp)) {
    next.hp = Math.max(1, Math.min(hpCeiling(next.maxHp), Math.floor(playerHp)));
  }
  // Post-battle heal. Every win pays it, raised permanently by each Mend taken at a Rest
  // Site. Clamped to `maxHp`, NOT `hpCeiling` — winning never manufactures temporary HP,
  // it only tops up a wound. `Math.max(next.hp, …)` is load-bearing: without it, a leader
  // already carrying temporary HP from a Rest (hp > maxHp) would have that overheal
  // silently clamped back down to `maxHp` by this heal, destroying HP the player earned
  // rather than leaving it untouched. Only `restHeal`/`restKindle` create temporary HP.
  const mods = runMods(next, registry);
  const hpBefore = next.hp;
  next.hp = Math.max(next.hp, Math.min(next.maxHp, next.hp + victoryHealAmount(next.mendLevel) + mods.victoryHealBonus));
  const healed = next.hp - hpBefore;
  // A Trial pays by the SEVERITY of the twist the player chose to fight under, in coins
  // and in relic band alike. Before this the payout was flat, so the shortlist was only
  // ever a search for the least inconvenient rule — and the node as a whole was strictly
  // better than a plain combat, since a Trial has identical HP and deck size to one.
  const severity = at.kind === 'trial' ? twistSeverity(trialById(at.twistId ?? '')) : 2;
  const trialScale = at.kind === 'trial' ? trialCoinMult(severity) : 1;
  // Paid against the SAME act the fight was scaled to. This is the whole price of The
  // Lesser Road: a run that fights two acts easier is paid two acts poorer, so the
  // discount can never be taken without its cost and neither half can drift from the
  // other.
  // HP lost is read from BEFORE the post-battle heal — the heal is a separate reward,
  // not a discount on what was actually spent to win.
  const hpLost = Math.max(0, run.hp - hpBefore);
  const coins =
    round5(combatReward(rewardKind(at.kind), at.layer, effectiveAct(run.act, mods)) * trialScale * mods.coinsEarnedMult)
    + mods.coinsPerWin + mods.coinsPerHpLost * hpLost;
  // Card pick: Elites offer a wider 5-card choice; Trials offer NONE (their reward is
  // the coins + a relic); everything else the usual 3. Floored at 1 — Cracked Diadem
  // takes two choices away, and a reward screen that offers nothing cannot be dismissed.
  const cardCount = Math.max(1, (at.kind === 'elite' ? ELITE_CARD_CHOICES : DEFAULT_CARD_CHOICES) + mods.extraCardChoices);
  const cardChoices = at.kind === 'trial' ? [] : rollRewardChoices(registry, at.seed, leader.element, cardCount);
  next.map.nodes[nodeId]!.visited = true;
  next.coins += coins;
  // Trial and boss wins offer a relic choice, gating Continue until picked. Elites do
  // NOT — their reward is the coin bump + the wider 5-card pick + the bigger fight. Act
  // 3+ bosses roll from the SAME 'rare'/'boss' bands the act 1/2 boss reward draws from.
  const relicChoices =
    at.kind === 'trial'
      ? rollRelicChoices(subSeed(run.seed, run.act, 'relic', nodeId), trialRewardBands(severity), next.relics)
      : at.kind === 'boss'
        ? rollRelicChoices(subSeed(run.seed, run.act, 'relic', nodeId), ['rare', 'boss'], next.relics)
        : undefined;
  // Boss progression rewards: the act 1 boss awards the leader's unique upgrade and
  // the act 2 boss the signature buff. Each is skipped if somehow already held, so it
  // can never gate Continue forever.
  const unlock = bossUnlock(next, at.kind);
  // Act 3+ bosses have no unlock left to award, so they instead grant a SECOND relic
  // pick (see `bonusRelic` on the schema) — the significant reward late acts were
  // otherwise missing.
  const bonusRelic = at.kind === 'boss' && !unlock;
  next.phase = {
    t: 'reward',
    nodeId,
    coins,
    ...(healed > 0 ? { healed } : {}),
    ...(cardChoices.length ? { cardChoices } : {}),
    // `.length`, not truthiness: a run that already owns every relic in these bands gets an
    // EMPTY array back, and an empty array is truthy. Stored, it renders a reward screen with
    // no relics to pick (the view gates on `.length`) that `leaveNode` then refuses to leave.
    ...(relicChoices?.length ? { relicChoices } : {}),
    ...(unlock ? { unlock } : {}),
    ...(bonusRelic ? { bonusRelic } : {}),
  };
  return next;
};

<<<<<<< Updated upstream
/** Which progression unlock (if any) this boss kill awards. */
=======
/**
 * Which progression unlock (if any) this boss kill awards.
 *
 * BOTH unlocks are gated on an upgrade actually being AUTHORED for the run's leader
 * (today that means every leader, but a newly-added one starts without an entry in
 * either table). Offering `signature`/`unique` regardless of authorship used to hand
 * out a reward screen promising a permanently empowered upgrade that changed nothing
 * — and, because an unlock suppresses `bonusRelic`, it also cost the player the relic
 * they would otherwise have received. Gating here is self-healing: authoring an entry
 * in LEADER_UPGRADES/SIGNATURE_UPGRADES turns the matching unlock on for that leader
 * with no change needed here.
 */
>>>>>>> Stashed changes
const bossUnlock = (run: RunState, kind: MapNode['kind']): 'unique' | 'signature' | undefined => {
  if (kind !== 'boss') return undefined;
  if (run.act === 1 && LEADER_UPGRADES[run.leaderId] && !hasUnique(run.heroUpgrades)) return 'unique';
  if (run.act === 2 && !run.signatureBuff) return 'signature';
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
/**
 * Resolve an owed `pendingTrim` by removing EXACTLY the chosen cards.
 *
 * A stale or wrong-sized selection (a client that raced a reroll, or simply a bug) is
 * refused outright rather than silently trimming a different count than the relic
 * promised — the player agreed to lose N specific cards, not N cards chosen for them.
 */
export const resolveTrim = (run: RunState, uids: string[], registry?: Registry): RunState => {
  if (!run.pendingTrim) return run;
  const { count: want, coinsPerCard, buffPerCard } = run.pendingTrim;
  const unique = new Set(uids);
  if (unique.size !== want) return run;
  if (![...unique].every((uid) => run.deck.some((c) => c.uid === uid))) return run;
  const next = structuredClone(run);
  next.deck = next.deck.filter((c) => !unique.has(c.uid));
  delete next.pendingTrim;
  if (coinsPerCard) next.coins += coinsPerCard * want;
  // Buffs land on the SURVIVING deck, resolved AFTER the burn — never on a card the
  // player is about to lose, and never guessable in advance since the roll is seeded
  // off the run rather than the card choice.
  if (buffPerCard && registry) {
    const roll = makeRoller(subSeed(next.seed, next.act, 'trimbuff', next.deck.length));
    const eligible = next.deck.filter((c) => {
      const def = registry.cards.get(c.cardId);
      return def?.type === 'unit' || def?.type === 'foundation';
    });
    const chosen = new Set(roll.shuffle(eligible.map((c) => c.uid)).slice(0, want));
    next.deck = next.deck.map((c) =>
      chosen.has(c.uid) ? applyEnhance(c, { kind: 'stat', attack: buffPerCard.attack, hp: buffPerCard.hp }) : c);
  }
  return next;
};

export const pickRelic = (run: RunState, relicId: string, registry?: Registry): RunState => {
  if (run.phase.t !== 'reward' || !run.phase.relicChoices?.includes(relicId)) return run;
  const next = structuredClone(run);
  grantRelic(next, relicId, registry);
  if (next.phase.t !== 'reward') return next;
  if (next.phase.bonusRelic) {
    delete next.phase.bonusRelic;
    const bonus = rollRelicChoices(
      subSeed(run.seed, run.act, 'bonusrelic', next.phase.nodeId),
      ['rare', 'boss'],
      next.relics,
    );
    // An empty roll (every relic in those bands already owned) must CLEAR the gate rather
    // than leave an empty choice list behind — otherwise the reward screen waits forever
    // on a pick the player cannot make.
    if (bonus.length) next.phase.relicChoices = bonus;
    else delete next.phase.relicChoices;
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
  // Print More Money's recurring half. Reads the SAME `boonId` → `Boon.coinsPerAct` the
  // opening grant did, rather than a separate stored amount, so there is exactly one
  // place that says how much and this can never drift from what the boon's own blurb
  // promised.
  const boon = run.boonId ? boonById(run.boonId) : undefined;
  if (boon?.coinsPerAct) next.coins += boon.coinsPerAct;
  // Each act permanently raises max HP, and heals by the same amount so the player does
  // not arrive in the new act artificially wounded (the `maxHpDelta` relics set that
  // precedent: "+N max HP AND heal N").
  //
  // Note this deliberately raises the SIGNATURE THRESHOLD too — it is half of max HP,
  // computed live in `damage.ts`, so a 40-HP leader unlocks their Signature at 20 rather
  // than 15. That is intended: the comeback valve should stay proportional rather than
  // becoming trivially easy to reach as the pool grows.
  next.maxHp += ECON.ACT_MAX_HP_GAIN;
  next.hp = Math.min(hpCeiling(next.maxHp), next.hp + ECON.ACT_MAX_HP_GAIN);
  next.map = generateMap(next.seed, next.act);
  next.currentNodeId = null;
  next.phase = { t: 'map' };
  return next;
};

/**
 * Commit a Trial's twist and start the fight.
 *
 * The pick must come from the node's own shortlist — accepting an arbitrary id would let
 * a client fight a Trial under a twist of its choosing (including a boss-only one), and
 * would also let the twist differ from what the map node advertises.
 */
export const chooseTrialTwist = (run: RunState, twistId: string): RunState => {
  if (run.phase.t !== 'trial') return run;
  const at = node(run, run.phase.nodeId);
  if (!at || at.twistId) return run;
  if (!(at.twistChoices ?? []).includes(twistId)) return run;
  const next = structuredClone(run);
  next.map.nodes[at.id]!.twistId = twistId;
  next.phase = { t: 'combat', nodeId: at.id, fightSeed: subSeed(run.seed, run.act, 'fight', at.id) };
  return next;
};

/** Leave a node view (store / enhance / rest / event / reward) back to the map. */
export const leaveNode = (run: RunState): RunState => {
  const p = run.phase;
  if (p.t !== 'store' && p.t !== 'enhance' && p.t !== 'rest' && p.t !== 'event' && p.t !== 'reward') return run;
  // Pending card/relic/unlock choices must be resolved before leaving a reward. Gated on
  // `.length` rather than truthiness so an EMPTY choice array cannot wedge the screen shut:
  // the roll above no longer stores one, but runs persisted before that fix still can, and
  // an unleavable reward is unrecoverable.
  if (p.t === 'reward' && (p.cardChoices?.length || p.relicChoices?.length || p.unlock)) return run;
  const at = node(run, p.nodeId);
  if (p.t === 'reward' && at?.kind === 'boss') return nextAct(run);
  const next = structuredClone(run);
  next.map.nodes[p.nodeId]!.visited = true;
  next.phase = { t: 'map' };
  return next;
};

/**
 * Aggregated economy mods for the current run.
 *
 * Goes through `runMods` so conditional relics are judged against the run and spent
 * one-shots contribute nothing. No registry is passed here — several callers legitimately
 * have none — which means a `monoElement` condition reads as unsatisfied on this path.
 * That is safe by construction: nothing gated on `monoElement` carries an economy mod.
 */
const econMods = (run: RunState) => runMods(run);

/**
 * The run's overheal ceiling, including any relic that widens the reservoir.
 *
 * Every path that raises HP outside a fight must clamp to THIS, not to `hpCeiling(maxHp)`
 * directly, or a relic that grants extra temporary-HP headroom silently does nothing.
 */
const runCeiling = (run: RunState): number =>
  hpCeiling(run.maxHp) + Math.round(run.maxHp * runMods(run).overhealBonus);

/**
 * A store's stock — derived from `(node.seed, act, rerolls, relic slot bonus)`, never
 * stored. The UI and the reducer MUST read it through this one helper: they previously
 * each called `rollStoreOffer` with different arguments (the view omitted
 * `extraStoreSlots`), so a relic that widened the shop silently desynced the displayed
 * card from the one an index actually bought.
 */
export const storeStock = (run: RunState, registry: Registry, at: MapNode) => {
  const leader = registry.leaders.get(run.leaderId);
  if (!leader) return [];
  return rollStoreOffer(registry, at.seed, leader.element, {
    extraSlots: econMods(run).extraStoreSlots,
    act: run.act,
    rerolls: at.storeRerolls ?? 0,
  });
};

export const buyCard = (run: RunState, registry: Registry, offerIdx: number): RunState => {
  if (run.phase.t !== 'store') return run;
  const at = node(run, run.phase.nodeId);
  const leader = registry.leaders.get(run.leaderId);
  if (!at || !leader) return run;
  if ((at.bought ?? []).includes(offerIdx)) return run;
  const mods = econMods(run);
  const slot = storeStock(run, registry, at)[offerIdx];
  const card = slot ? registry.cards.get(slot.cardId) : undefined;
  if (!slot || !card) return run;
  const price = slotPrice(card, slot, leader.element, mods);
  if (run.coins < price) return run;
  const next = structuredClone(run);
  next.coins -= price;
  // Pre-enhanced stock arrives with the enhancement already on the copy, exactly as if
  // the player had bought it plain and walked it to an altar.
  next.deck.push({
    uid: `u${next.nextUid++}`,
    cardId: slot.cardId,
    enhancements: [...(slot.enhancements ?? [])],
  });
  const bought = next.map.nodes[at.id]!;
  bought.bought = [...(bought.bought ?? []), offerIdx];
  return next;
};

/**
 * A store's RELIC shelf — two ordinary relics plus the one cursed relic every store
 * keeps. Derived from the node like the card stock, and read through this one helper by
 * both the view and the reducer for exactly the reason `storeStock` is.
 */
export const storeRelicStock = (run: RunState, at: MapNode): string[] =>
  rollStoreRelics(at.seed, run.act, at.storeRerolls ?? 0, run.relics, ECON.STORE_RELIC_SLOTS);

/**
 * Buy a relic off a store shelf.
 *
 * Relics were previously unbuyable, which left a late-run purse with nothing to do:
 * cards and rerolls are the only other sinks and both saturate. This is also the ONLY
 * way a cursed relic enters a run — no reward screen rolls one — so the decision to take
 * a drawback is always something the player walks up to a counter and does.
 */
export const buyRelic = (run: RunState, registry: Registry, shelfIdx: number): RunState => {
  if (run.phase.t !== 'store') return run;
  const at = node(run, run.phase.nodeId);
  if (!at) return run;
  if ((at.boughtRelics ?? []).includes(shelfIdx)) return run;
  const mods = econMods(run);
  const relicId = storeRelicStock(run, at)[shelfIdx];
  const relic = relicId ? relicById(relicId) : undefined;
  if (!relic || run.relics.includes(relic.id)) return run;
  const price = relicPrice(relic.rarity, mods);
  if (run.coins < price) return run;
  const next = structuredClone(run);
  next.coins -= price;
  // Through `grantRelic`, so a bought relic's one-shot payload (trim/temper/max HP)
  // resolves exactly as it would on a reward screen.
  grantRelic(next, relic.id, registry);
  const n = next.map.nodes[at.id]!;
  n.boughtRelics = [...(n.boughtRelics ?? []), shelfIdx];
  return next;
};

/**
 * Restock a shop for coins. Escalating price (`storeRerollCost`), and the `bought` list
 * is CLEARED — the new stock is genuinely new, so a slot index that was sold out no
 * longer refers to anything the player already took.
 */
export const storeReroll = (run: RunState): RunState => {
  if (run.phase.t !== 'store') return run;
  const at = node(run, run.phase.nodeId);
  if (!at) return run;
  const used = at.storeRerolls ?? 0;
  const mods = econMods(run);
  const price = Math.round(storeRerollCost(used) * mods.storeBuyMult);
  if (run.coins < price) return run;
  const next = structuredClone(run);
  next.coins -= price;
  const n = next.map.nodes[at.id]!;
  n.storeRerolls = used + 1;
  n.bought = [];
  // The relic shelf restocks with the cards — same seed input, so leaving it stale would
  // show the new shelf while the sold-out markers still pointed at the old one.
  n.boughtRelics = [];
  return next;
};

/**
 * Remove a relic from the run, taking its bookkeeping with it.
 *
 * The three ways a relic can LEAVE — unbinding it at a shop, selling it at an event,
 * trading it at an event — must shed exactly the same state, or a relic re-acquired later
 * inherits a repair countdown or a spent flag from a life the player no longer remembers
 * owning. One helper so those three can never drift apart.
 */
const shedRelic = (run: RunState, relicId: string): void => {
  run.relics = run.relics.filter((id) => id !== relicId);
  run.spentRelics = run.spentRelics.filter((id) => id !== relicId);
  delete run.relicRepair[relicId];
};

/**
 * Unbind (permanently discard) an owned relic, for coins. The run's only relic removal.
 *
 * Costs rather than pays — see `ECON.RELIC_UNBIND_PRICE` for why the price rises with
 * the band. Two things deliberately do NOT happen here:
 *
 *  - A one-shot payload is never refunded. `maxHpDelta`, `startCoinsDelta`, `trimDeck`
 *    and friends resolved on CLAIM and are part of the run's history now; handing them
 *    back would make "claim it, unbind it" a free tap on every one of them.
 *  - The relic is not blocked from returning. It leaves `relics`, so a shop may stock it
 *    again later — which is correct: changing your mind twice is allowed, it just costs
 *    twice.
 *
 * Its repair debt and spent flag go with it, or re-acquiring the relic later would
 * inherit bookkeeping from a life the player no longer remembers owning.
 */
export const unbindRelic = (run: RunState, relicId: string): RunState => {
  if (run.phase.t !== 'store') return run;
  if (!run.relics.includes(relicId)) return run;
  const relic = relicById(relicId);
  if (!relic) return run;
  const price = relicUnbindCost(relic.rarity, econMods(run));
  if (run.coins < price) return run;
  const next = structuredClone(run);
  next.coins -= price;
  shedRelic(next, relicId);
  return next;
};

export const sellCard = (run: RunState, registry: Registry, uid: string): RunState => {
  if (run.phase.t !== 'store') return run;
  const at = node(run, run.phase.nodeId);
  const leader = registry.leaders.get(run.leaderId);
  if (!at || !leader) return run;
  // Selling is UNLIMITED per visit. It used to stop after the first sale
  // (`at.soldThisVisit`), which put deck removal at roughly 0.9 cards per act against
  // ~11 gained — so decks only ever grew and dilution had no answer. The shop is now
  // the removal mechanism, which is why no separate removal service exists.
  if (run.deck.length <= ECON.MIN_DECK_SIZE) return run; // keep a playable deck
  const owned = run.deck.find((c) => c.uid === uid);
  const card = owned ? registry.cards.get(owned.cardId) : undefined;
  if (!owned || !card) return run;
  const next = structuredClone(run);
  next.coins += sellPrice(card, owned, leader.element, econMods(run));
  next.deck = next.deck.filter((c) => c.uid !== uid);
  return next;
};

/** The three offers currently on a node — derived, never stored. See `enhance.ts`. */
const enhanceOffersAt = (run: RunState, at: MapNode) =>
  rollEnhanceOffers(at.seed, run.act, at.enhanceRerolls ?? 0);

/**
 * Enhance node, option A: take one of the three offers. FREE — the coins at this node
 * buy rerolls, not the upgrade itself.
 *
 * `offerIdx` selects from the row; a stale index (from an older UI state, or a client
 * that rerolled between render and click) is refused rather than silently applying a
 * different upgrade than the one the player looked at.
 */
export const applyEnhancement = (run: RunState, registry: Registry, uid: string, offerIdx: number): RunState => {
  if (run.phase.t !== 'enhance') return run;
  const at = node(run, run.phase.nodeId);
  if (!at || at.enhanceUsed) return run;
  // Dead Anvil's price: the altar's WORKING stops functioning for you. Attuning
  // (`enhanceAttune`) still does — the relic buys energy with card upgrades, not with the
  // node, and leaving one of the two services alive keeps an Enhance node worth walking to.
  const offer = enhanceOffersAt(run, at)[offerIdx];
  const owned = run.deck.find((c) => c.uid === uid);
  const card = owned ? registry.cards.get(owned.cardId) : undefined;
  if (!offer || !owned || !card || !canApply(offer, card)) return run;
  const next = structuredClone(run);
  if (offer.sort === 'duplicate') {
    // A copy is a NEW physical card, so it gets its own uid — the two copies can be
    // enhanced apart from each other afterwards, exactly like two bought copies.
    // `full` carries the original's enhancements across; the common form does not.
    next.deck.push({
      uid: `u${next.nextUid++}`,
      cardId: owned.cardId,
      enhancements: offer.full ? [...owned.enhancements] : [],
    });
  } else {
    next.deck = next.deck.map((c) => (c.uid === uid ? applyEnhance(c, offer.enhancement) : c));
  }
  next.map.nodes[at.id]!.enhanceUsed = true;
  return next;
};

/**
 * Reroll the row of offers. The first reroll at a node is free; each one after costs
 * more (`rerollCost`). Rerolling does NOT consume the visit — you still get a working
 * afterwards — so the only limit on rerolling is the escalating price.
 */
export const enhanceReroll = (run: RunState): RunState => {
  if (run.phase.t !== 'enhance') return run;
  const at = node(run, run.phase.nodeId);
  if (!at || at.enhanceUsed) return run;
  const used = at.enhanceRerolls ?? 0;
  const price = Math.round(rerollCost(used) * econMods(run).enhanceDiscount);
  if (run.coins < price) return run;
  const next = structuredClone(run);
  next.coins -= price;
  next.map.nodes[at.id]!.enhanceRerolls = used + 1;
  return next;
};

/**
 * Enhance node, option B: attune (+1 element cap) instead of buffing a card. Same
 * one-purchase-per-visit gate as `applyEnhancement`, priced on the same curve as
 * Rest Site attunement (shared `attuneCost`, counting attunes bought anywhere).
 */
export const enhanceAttune = (run: RunState, registry: Registry, element: Element): RunState => {
  if (run.phase.t !== 'enhance') return run;
  const at = node(run, run.phase.nodeId);
  if (!at) return run;
  const cost = Math.round(attuneCost(elementCap(run, registry, element)) * econMods(run).enhanceDiscount);
  if (run.coins < cost) return run;
  const next = structuredClone(run);
  next.coins -= cost;
  next.heroUpgrades.push({ kind: 'attune', element });
  // Attuning does NOT consume the visit and is not limited per node — it is a pure coin
  // sink whose escalating price is its own limit. It used to compete with the altar's
  // working for a single visit, which made it a strictly worse use of the node once the
  // working became free.
  return next;
};

/** An element's CURRENT banking cap: the leader's printed cap plus attunes bought. */
export const elementCap = (run: RunState, registry: Registry, element: Element): number =>
  (registry.leaders.get(run.leaderId)?.elementCaps[element] ?? 0) +
  run.heroUpgrades.filter((u) => u.kind === 'attune' && u.element === element).length;

// --- Rest Site ------------------------------------------------------------------
// One service per visit: recover HP, take a card, or attune (+1 element cap). The
// leader's unique upgrade is NOT sold here — it is the act 1 boss reward (see
// `bossUnlock`), so camps stay low-stakes and the run-defining pick stays earned.

/**
 * HP recovery. Free, but consumes the visit — that trade is the routing decision.
 *
 * The ONE source of temporary HP in the game: clamped to `hpCeiling`, not `maxHp`, so
 * resting at full health still pays out (up to the overheal ceiling) instead of being
 * wasted. Only rejected once that ceiling is reached — the post-battle win heal never
 * overheals, so Rest is never dominated by simply winning the next fight.
 */
export const restHeal = (run: RunState): RunState => {
  if (run.phase.t !== 'rest') return run;
  const at = node(run, run.phase.nodeId);
  // Hollow Lantern's price. Mend is deliberately still available (see `restMend`): the
  // relic buys energy with the ability to recover HP NOW, not with the whole node.
  if (!at || at.restUsed || run.hp >= runCeiling(run)) return run;
  const next = structuredClone(run);
  next.hp = Math.min(runCeiling(next), next.hp + restHealAmount(next.maxHp) + econMods(next).restHealBonus);
  next.map.nodes[at.id]!.restUsed = true;
  return next;
};

/**
 * Mend: spend the camp on a PERMANENT increase to the post-battle heal instead of on HP now.
 * The only Rest service that pays off later rather than immediately — and the only one worth
 * taking at full health, since the heal it raises can overheal into temporary HP.
 */
export const restMend = (run: RunState): RunState => {
  if (run.phase.t !== 'rest') return run;
  const at = node(run, run.phase.nodeId);
  if (!at || at.restUsed) return run;
  const next = structuredClone(run);
  next.mendLevel += 1;
  next.map.nodes[at.id]!.restUsed = true;
  return next;
};

/**
 * Kindle: burn 2 owned cards for a bigger heal than plain Rest — paid in cards, not
 * coins, so it's a real deckbuilding trade rather than just a stronger heal. Requires
 * at least 3 cards owned so the deck can never be burned down to empty.
 */
/**
 * Burn EXACTLY `ECON.KINDLE_BURN_COUNT` cards for a bigger heal than plain Rest.
 *
 * Takes the selection as an array, not fixed positional uids — a stale or wrong-sized
 * selection is refused outright rather than silently burning a different set than the
 * player picked, the same discipline `resolveTrim` uses for the same reason: two call
 * sites (here and the UI) each independently assuming the count is 2 is how a future
 * retune of `KINDLE_BURN_COUNT` would silently truncate a burn instead of failing loud.
 */
export const restKindle = (run: RunState, uids: string[]): RunState => {
  if (run.phase.t !== 'rest') return run;
  const at = node(run, run.phase.nodeId);
  // Same overheal ceiling as restHeal, not maxHp — Kindle can bank temporary HP too;
  // it's only wasted once the ceiling itself is already reached.
  if (!at || at.restUsed || run.hp >= runCeiling(run)) return run;
  const unique = new Set(uids);
  if (unique.size !== ECON.KINDLE_BURN_COUNT) return run;
  if (run.deck.length - ECON.KINDLE_BURN_COUNT < 1) return run;
  if (![...unique].every((uid) => run.deck.some((c) => c.uid === uid))) return run;
  const next = structuredClone(run);
  next.deck = next.deck.filter((c) => !unique.has(c.uid));
  next.hp = Math.min(runCeiling(next), next.hp + kindleHealAmount(next.maxHp) + econMods(next).restHealBonus);
  next.map.nodes[at.id]!.restUsed = true;
  return next;
};

<<<<<<< Updated upstream
=======
// --- Copper Mech: the endgame challenge ----------------------------------------
// A persistent, repeatable damage race, enterable from the map at any time and the
// Adventure's win condition. Losing costs NOTHING but the attempt: the run returns to
// the map with its score updated and the map, deck, coins and HP all untouched. That is
// what makes "fightable at any time" real — you can probe it early to measure yourself,
// then come back once the deck is stronger.

/**
 * Enter the Copper Mech fight. Only from the map, and only if the toll can be paid.
 *
 * The attempt now costs coins. Probing it is still meant to be a real option — that is the
 * point of a boss you can walk up to at any time — but not a strictly free one, or farming
 * acts and poking it every visit dominates every other line.
 */
export const startCopperMech = (run: RunState): RunState => {
  if (run.phase.t !== 'map') return run;
  if (run.coins < ECON.COPPER_ATTEMPT_COST) return run;
  const next = structuredClone(run);
  next.coins -= ECON.COPPER_ATTEMPT_COST;
  // The attempt counter varies the shuffle, so a retry is a fresh fight rather than a
  // replay of the same draw — while still being fully deterministic per attempt.
  next.copperAttempts += 1;
  next.phase = { t: 'copper', fightSeed: subSeed(run.seed, 'copper', next.copperAttempts) };
  return next;
};

/** Damage-tier percentages this attempt reached that the run has not already banked. */
const newCopperTiers = (run: RunState, dealt: number): number[] => {
  const pct = (dealt / COPPER_MECH_HP) * 100;
  return ECON.COPPER_TIERS.filter((t) => pct >= t && !run.copperTiers.includes(t));
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

  // Damage milestones pay a boss-tier relic, ONCE each per run. Keyed off this attempt's
  // damage rather than `copperBest` so a later, weaker attempt cannot re-trigger a rung
  // the run has already banked.
  // ONE relic PER tier crossed. A first attempt that jumps straight past 20% AND 40%
  // banked both rungs but paid a single relic, because only one choice row was ever
  // rolled and claiming it cleared the gate. `tiersOwed` carries the remainder so the
  // screen re-offers until every rung crossed has actually paid out.
  const tiers = newCopperTiers(run, dealt);
  let relicChoices: string[] | undefined;
  let tiersOwed: number[] | undefined;
  if (tiers.length > 0) {
    next.copperTiers = [...next.copperTiers, ...tiers];
    relicChoices = rollRelicChoices(subSeed(run.seed, 'coppertier', tiers[0]!), ['boss'], next.relics);
    if (relicChoices.length === 0) relicChoices = undefined;
    if (tiers.length > 1) tiersOwed = tiers.slice(1);
  }

  // Losing costs the ACT, not the run: the current map is rerolled and must be walked
  // again from the start. That is a real price for an unprepared attempt while still
  // leaving deck, coins, HP and progression untouched — and it doubles as a deliberate
  // map reroll, which makes throwing yourself at the Mech a legitimate play when the act
  // you are standing in is a bad one.
  const actReset = !killed;
  if (actReset) {
    next.map = generateMap(next.seed, next.act, next.copperAttempts);
    next.currentNodeId = null;
  }

  next.phase = {
    t: 'copperResult', damage: dealt, killed, record,
    ...(tiers.length ? { tiers } : {}),
    ...(relicChoices ? { relicChoices } : {}),
    ...(tiersOwed?.length ? { tiersOwed } : {}),
    ...(actReset ? { actReset: true } : {}),
  };
  return next;
};

/** Claim a Copper Mech tier relic; clears the gate on the result screen. */
export const pickCopperRelic = (run: RunState, relicId: string, registry?: Registry): RunState => {
  if (run.phase.t !== 'copperResult' || !run.phase.relicChoices?.includes(relicId)) return run;
  const next = structuredClone(run);
  grantRelic(next, relicId, registry);
  if (next.phase.t !== 'copperResult') return next;
  // Another rung still owes a relic: roll it a fresh row (excluding what is now owned)
  // rather than clearing the gate. An attempt that crosses two tiers pays two relics.
  const owed = next.phase.tiersOwed ?? [];
  const [nextTier, ...rest] = owed;
  if (nextTier !== undefined) {
    const more = rollRelicChoices(subSeed(run.seed, 'coppertier', nextTier), ['boss'], next.relics);
    if (rest.length) next.phase.tiersOwed = rest;
    else delete next.phase.tiersOwed;
    // An empty roll (every boss relic owned) clears the gate instead of stalling it.
    if (more.length) next.phase.relicChoices = more;
    else delete next.phase.relicChoices;
    return next;
  }
  delete next.phase.relicChoices;
  delete next.phase.tiersOwed;
  return next;
};

/** Dismiss the Copper Mech scoreboard and return to the map. */
export const leaveCopperMech = (run: RunState): RunState => {
  if (run.phase.t !== 'copperResult') return run;
  // A pending tier relic gates Continue, exactly like a combat reward's relic choice.
  if (run.phase.relicChoices?.length) return run;
  return { ...structuredClone(run), phase: { t: 'map' } };
};

>>>>>>> Stashed changes
// --- Events --------------------------------------------------------------------

/**
 * Is a choice's `requires` block satisfied by the run right now?
 *
 * Exported so `EventView` gates the BUTTON on exactly the same predicate the reducer
 * gates the transition on — the alternative is a button that looks available and then
 * silently does nothing, which is the class of bug the `sacrificeEnhance` deck-size check
 * used to produce.
 */
export const requirementMet = (run: RunState, req: EventRequirement | undefined): boolean => {
  if (!req) return true;
  if (req.flag && !run.eventFlags.includes(req.flag)) return false;
  if (req.notFlag && run.eventFlags.includes(req.notFlag)) return false;
  if (req.relicsAtLeast !== undefined && run.relics.length < req.relicsAtLeast) return false;
  if (req.bankAtLeast !== undefined && run.eventBank < req.bankAtLeast) return false;
  if (req.cardsOwned) {
    const held = run.deck.filter((c) => c.cardId === req.cardsOwned!.cardId).length;
    if (held < req.cardsOwned.count) return false;
  }
  if (req.mendableAtLeast !== undefined) {
    // Both kinds of damage count, because the choice mends both. Offering "let me fix
    // that for you" to a player carrying nothing broken is the kind of dead door the
    // requirement system exists to hide.
    const mendable = brokenRelics(run).length + run.spentRelics.length;
    if (mendable < req.mendableAtLeast) return false;
  }
  return true;
};

export const chooseEventOption = (run: RunState, registry: Registry, idx: number): RunState => {
  if (run.phase.t !== 'event') return run;
  const at = node(run, run.phase.nodeId);
  if (!at || at.eventChoice !== undefined) return run;
  const event = eventById(at.eventId ?? '') ?? pickEvent(at.seed, run.seenEvents, run.eventFlags);
  const choice = event.choices[idx];
  if (!choice) return run;
  if (!requirementMet(run, choice.requires)) return run;
  if (choice.cost !== undefined && run.coins < choice.cost) return run;
  // An HP price may bruise but must never be lethal — an event is a decision, not a
  // death trap, and a run ending on a menu click reads as a bug however it is worded.
  if (choice.hpCost !== undefined && run.hp <= choice.hpCost) return run;
  if (choice.requiresDeck !== undefined && run.deck.length < choice.requiresDeck) return run;

  const next = structuredClone(run);
  if (choice.cost) next.coins = Math.max(0, next.coins - choice.cost);
  if (choice.hpCost) next.hp = Math.max(1, next.hp - choice.hpCost);
  const roll = makeRoller(subSeed(run.seed, run.act, 'event', at.id));
  const leaderElement = registry.leaders.get(run.leaderId)?.element ?? 'fire';

  // What this choice produced, for the result screen. `relicChoices`/`cardChoices` are
  // offered to the player; `gainedCards` is what was added outright (a named card, or
  // the junk from a curse) and is shown rather than chosen.
  let relicChoices: string[] | undefined;
  let cardChoices: string[] | undefined;
  const gainedCards: string[] = [];
  const gainedRelics: string[] = [];

  /**
   * Resolve one outcome. Recursive so a `gamble` can resolve to any other outcome on
   * either side of the flip, rather than needing a parallel set of gamble-only payloads.
   */
  const resolve = (o: EventOutcome): 'combat' | void => {
    switch (o.kind) {
    case 'coins':
      next.coins = Math.max(0, next.coins + o.amount);
      break;
    case 'coinsPercent':
      // Resolved LIVE against the purse at the moment this choice fires, not a number
      // fixed when the event was authored — the entire point of a proportional stake.
      next.coins = Math.max(0, next.coins + Math.round(next.coins * o.amount));
      break;
    case 'relic': {
      // A ROLLED grant becomes a CHOICE, the same pick-one-of-three a battle reward
      // offers — an event handing you one relic out of the whole table, unseen, was the
      // single least legible payout in the run.
      relicChoices = rollRelicChoices(
        subSeed(run.seed, run.act, 'eventrelic', at.id), o.bands, next.relics, DEFAULT_CARD_CHOICES,
      );
      break;
    }
    case 'namedRelic':
      // No choice screen: the event choice that led here already was the act. Goes
      // through `grantRelic` like every other acquisition, so a one-shot payload (or a
      // broken relic's repair debt) is seeded exactly as it would be from a shop.
      grantRelic(next, o.relicId, registry);
      gainedRelics.push(o.relicId);
      break;
    case 'chooseRelic':
      // An EXPLICIT list, not a band roll — reuses the same relicChoices gate and 'gain'
      // screen a rolled pick uses, so two or three hand-picked relics can be offered
      // side by side with no new UI.
      relicChoices = o.relicIds.filter((id) => relicById(id) && !next.relics.includes(id));
      break;
    case 'card': {
      if (o.cardId === 'random') {
        // Same treatment: roll a row and let the player pick.
        cardChoices = rollRewardChoices(registry, at.seed, leaderElement, DEFAULT_CARD_CHOICES);
      } else if (registry.cards.has(o.cardId)) {
        // A NAMED card is not a choice — but it is still shown rather than silently
        // filed into the deck.
        next.deck.push({ uid: `u${next.nextUid++}`, cardId: o.cardId, enhancements: [] });
        gainedCards.push(o.cardId);
      }
      break;
    }
    case 'sacrificeEnhance': {
<<<<<<< Updated upstream
      if (next.deck.length >= 3) {
        const order = roll.shuffle(next.deck.map((c) => c.uid));
        const [sac1, sac2, buff] = order;
        next.deck = next.deck.filter((c) => c.uid !== sac1 && c.uid !== sac2);
        next.deck = next.deck.map((c) => (c.uid === buff ? applyEnhance(c, { enhancement: { kind: 'stat', attack: 2, hp: 2 }, price: 0, label: '+2/+2' }) : c));
      }
=======
      // The deck-size gate is the choice's own `requiresDeck`, already checked above —
      // this branch previously re-checked a DIFFERENT threshold (3 vs the authored 4)
      // and, when it failed, fell through to mark the choice taken anyway: the player
      // paid the click, read the result line, and nothing happened. There is no second
      // threshold; reaching here means the trade is legal.
      const order = roll.shuffle(next.deck.map((c) => c.uid));
      const [sac1, sac2, buff] = order;
      next.deck = next.deck.filter((c) => c.uid !== sac1 && c.uid !== sac2);
      next.deck = next.deck.map((c) => (c.uid === buff ? applyEnhance(c, { kind: 'stat', attack: 2, hp: 2 }) : c));
      break;
    }
    case 'heal':
      // Clamped to the overheal ceiling like every out-of-fight heal, and never lethal
      // when negative — the same rule the HP cost above follows.
      next.hp = Math.max(1, Math.min(hpCeiling(next.maxHp), next.hp + o.amount));
      break;
    case 'maxHp':
      next.maxHp = Math.max(2, next.maxHp + o.amount);
      if (o.amount > 0) next.hp = Math.min(hpCeiling(next.maxHp), next.hp + o.amount);
      next.hp = Math.max(1, Math.min(hpCeiling(next.maxHp), next.hp));
      break;
    case 'curse': {
      // Junk forced into the deck. This is what makes card REMOVAL (unlimited selling at
      // any store) worth spending a visit on.
      if (registry.cards.has(o.cardId)) {
        for (let i = 0; i < (o.count ?? 1); i++) {
          next.deck.push({ uid: `u${next.nextUid++}`, cardId: o.cardId, enhancements: [] });
          gainedCards.push(o.cardId);
        }
      }
      break;
    }
    case 'gamble':
      // A real roll, from the node-seeded roller — deterministic per node, so reloading
      // cannot reroll a bad outcome.
      return resolve(roll.chance(o.p) ? o.win : o.lose);
    case 'multi': {
      // Ordered, and a `combat` anywhere inside short-circuits the rest: the fight owns
      // the node from that point on, so anything queued behind it would be lost.
      for (const inner of o.outcomes) {
        if (resolve(inner) === 'combat') return 'combat';
      }
      break;
    }
    case 'flag':
      if (!next.eventFlags.includes(o.flag)) next.eventFlags.push(o.flag);
      break;
    case 'deposit':
      // The coins themselves were already taken by the choice's `cost`; this records what
      // the bank owes. Accumulates, so depositing twice before collecting is legal.
      next.eventBank += Math.max(0, o.payout);
      break;
    case 'withdraw':
      next.coins += next.eventBank;
      next.eventBank = 0;
      break;
    case 'trimDeck': {
      // Thinning, the one deck operation Adventure could not otherwise buy outright.
      // Floors at MIN_DECK_SIZE for the same reason selling does: a run must not be able
      // to reduce itself to something unplayable.
      const removable = Math.max(0, next.deck.length - ECON.MIN_DECK_SIZE);
      const doomed = new Set(roll.shuffle(next.deck.map((c) => c.uid)).slice(0, Math.min(o.count, removable)));
      next.deck = next.deck.filter((c) => !doomed.has(c.uid));
      break;
    }
    case 'purge': {
      // Every copy of one card — how the junk a chain handed you gets cleaned up. Also
      // floored, so purging can never strand the run below a playable deck.
      const survivors = next.deck.filter((c) => c.cardId !== o.cardId);
      if (survivors.length >= ECON.MIN_DECK_SIZE) next.deck = survivors;
      break;
    }
    case 'temper': {
      // Only units/foundations can carry a stat enhancement, so spells/environments are
      // excluded from the draw rather than silently consuming one of the N.
      const eligible = next.deck.filter((c) => {
        const def = registry.cards.get(c.cardId);
        return def?.type === 'unit' || def?.type === 'foundation';
      });
      const chosen = new Set(roll.shuffle(eligible.map((c) => c.uid)).slice(0, o.count));
      next.deck = next.deck.map((c) => (chosen.has(c.uid) ? applyEnhance(c, { kind: 'stat', attack: o.attack, hp: o.hp }) : c));
      break;
    }
    case 'sellRelic': {
      // A random owned relic, so no mid-event picker is needed. Refuses on an empty tray
      // rather than paying out for nothing — the choice's `requires` should have caught
      // that, and this is the backstop.
      const doomed = roll.shuffle([...next.relics])[0];
      if (!doomed) break;
      shedRelic(next, doomed);
      next.coins += o.coins;
      break;
    }
    case 'mendRelics': {
      // Broken first: it is actively costing the player something, where a spent relic
      // is merely inert. Both are capped by the one `count` so the choice's blurb stays
      // true whichever mix the run happens to be carrying.
      let left = o.count;
      const repair = { ...(next.relicRepair ?? {}) };
      for (const id of Object.keys(repair)) {
        if (left <= 0) break;
        delete repair[id];
        left--;
      }
      next.relicRepair = repair;
      if (left > 0 && next.spentRelics.length > 0) next.spentRelics = next.spentRelics.slice(left);
      break;
    }
    case 'tradeRelic': {
      const doomed = roll.shuffle([...next.relics])[0];
      if (!doomed) break;
      shedRelic(next, doomed);
      // Offered as a CHOICE from the new bands, like every other rolled relic grant —
      // and rolled AFTER the removal, so the relic you gave up can come back around.
      relicChoices = rollRelicChoices(
        subSeed(run.seed, run.act, 'eventtrade', at.id), o.bands, next.relics, DEFAULT_CARD_CHOICES,
      );
>>>>>>> Stashed changes
      break;
    }
    case 'combat':
      next.map.nodes[at.id]!.eventChoice = idx;
      if (o.twistId) next.map.nodes[at.id]!.twistId = o.twistId;
      next.phase = { t: 'combat', nodeId: at.id, fightSeed: subSeed(run.seed, run.act, 'fight', at.id) };
      return 'combat';
    case 'nothing':
      break;
    }
  };

  // A `combat` outcome hands the node over to the fight and must NOT be marked visited
  // or bounced back to the map — `resolveCombat` owns it from here.
  if (resolve(choice.outcome) === 'combat') return next;

  next.map.nodes[at.id]!.eventChoice = idx;
  next.map.nodes[at.id]!.visited = true;
  // Always stop on a result screen. The authored `result` line was previously written,
  // stored and never rendered — the event resolved straight back to the map, so a payout
  // was something the player had to go and discover in their deck or relic tray.
  next.phase = {
    t: 'gain',
    nodeId: at.id,
    text: choice.result,
    ...(relicChoices?.length ? { relicChoices } : {}),
    ...(cardChoices?.length ? { cardChoices } : {}),
    ...(gainedCards.length ? { gainedCards } : {}),
    ...(gainedRelics.length ? { gainedRelics } : {}),
  };
  return next;
};

/** Claim one of the relics offered by a `gain` screen. */
export const pickGainRelic = (run: RunState, relicId: string, registry?: Registry): RunState => {
  if (run.phase.t !== 'gain') return run;
  if (!(run.phase.relicChoices ?? []).includes(relicId)) return run;
  const next = structuredClone(run);
  grantRelic(next, relicId, registry);
  if (next.phase.t === 'gain') {
    delete next.phase.relicChoices;
    next.phase.gainedRelics = [...(next.phase.gainedRelics ?? []), relicId];
  }
  return next;
};

/** Claim one of the cards offered by a `gain` screen. */
export const pickGainCard = (run: RunState, cardId: string): RunState => {
  if (run.phase.t !== 'gain') return run;
  if (!(run.phase.cardChoices ?? []).includes(cardId)) return run;
  const next = structuredClone(run);
  next.deck.push({ uid: `u${next.nextUid++}`, cardId, enhancements: [] });
  if (next.phase.t === 'gain') {
    delete next.phase.cardChoices;
    next.phase.gainedCards = [...(next.phase.gainedCards ?? []), cardId];
  }
  return next;
};

/** Leave a `gain` screen. Refused while an unresolved choice is still on it. */
export const leaveGain = (run: RunState): RunState => {
  if (run.phase.t !== 'gain') return run;
  if (run.phase.relicChoices?.length || run.phase.cardChoices?.length) return run;
  if (run.pendingTrim) return run;
  return { ...run, phase: { t: 'map' } };
};
