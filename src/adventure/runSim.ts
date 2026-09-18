/**
 * Headless Adventure-run simulation, for balancing the RUN rather than the card pool.
 *
 * `engine/sim.ts` measures deck vs deck: two 30-card lists, one shuffle, one winner. That
 * says nothing about Adventure, where the question is a different one — does a run survive
 * its acts, does the economy pay for the deck it expects you to build, does carried HP
 * recover fast enough to matter. Every one of those numbers (`ECON`, the HP curve in
 * `encounters.ts`, the Rest Site heal fractions) was authored by feel and has never been
 * measured, because the only way to play a run was to click through the UI.
 *
 * This drives the real reducer. Every transition goes through `run.ts` exactly as the UI's
 * buttons do, and every fight is built by the shared `buildFight` and played out by the
 * shipped planning AI — so relics, attune caps, unique discounts, deck buffs, trial twists
 * and boss curses are all live. Nothing here re-implements a rule; if it did, the numbers
 * would describe a game nobody plays.
 *
 * What is NOT the real thing is the PLAYER. A run is a long chain of choices — which node
 * to walk to, what to buy, when to heal — and those are supplied by `RunPolicy` below.
 * The policy is the instrument's calibration, not a fact about the game: a number measured
 * here is "what this policy achieves", and a change in the policy moves it. It is written
 * to be a reasonable, unexciting player so the numbers track content changes rather than
 * cleverness, and it is swappable so two policies can be compared on one build.
 */
import type { Registry } from '@cards/registry';
import type { Element } from '@cards/schema';
import type { MapNode, OwnedCard, RunState } from '@adventure/schema';
import { playOutGame } from '@engine/sim';
import { makeRoller, subSeed, type Roller } from '@adventure/seed';
import { buildFight } from '@adventure/encounters';
import { buyPrice, rollStoreOffer, attuneCost } from '@adventure/economy';
import { rollEnhanceOffer, canApply } from '@adventure/enhance';
import { aggregateMods } from '@adventure/relics';
import { eventForNode } from '@adventure/data/events';
import {
  startRun,
  reachableNodeIds,
  pickNode,
  resolveCombat,
  claimUnlock,
  pickRelic,
  pickRewardCard,
  skipRewardCard,
  leaveNode,
  buyCard,
  applyEnhancement,
  enhanceAttune,
  restHeal,
  restCardOffer,
  restTakeCard,
  restKindle,
  chooseEventOption,
} from '@adventure/run';

/** One fight as it happened, in run order. */
export interface FightLog {
  act: number;
  layer: number;
  kind: MapNode['kind'];
  /** Set on a fight reached through an event choice rather than a battle node. */
  viaEvent?: boolean;
  enemyLeaderId: string;
  enemyHp: number;
  twist?: string;
  boss?: string;
  won: boolean;
  hpBefore: number;
  hpAfter: number;
  turns: number;
}

export interface RunSimResult {
  leaderId: string;
  seed: number;
  /** `cleared` = survived through `maxActs`; `dead` = lost a fight; `stalled` = hit the step guard. */
  outcome: 'cleared' | 'dead' | 'stalled';
  /** Act the run was in when it ended (1-based). */
  actReached: number;
  /** Map nodes entered across the whole run. */
  nodesVisited: number;
  fights: FightLog[];
  bossesKilled: number;
  hp: number;
  maxHp: number;
  coins: number;
  coinsEarned: number;
  coinsSpent: number;
  deckSize: number;
  relics: string[];
  attunes: number;
  hasUnique: boolean;
  signatureBuff: boolean;
}

/**
 * The choices a run needs from its player. Every method is pure in spirit: it reads the
 * run and returns a decision, and the caller applies it through the real reducer, so a
 * policy can never make an illegal move — an illegal one is simply a no-op transition.
 */
export interface RunPolicy {
  /** Which reachable node to walk to next. */
  route: (run: RunState, reachable: MapNode[], roll: Roller) => string;
  /** Take the offered reward card, or skip it to keep the deck lean. */
  takeRewardCard: (run: RunState, choices: string[], registry: Registry) => string | null;
  /** Which of the offered relics to claim. */
  pickRelic: (run: RunState, choices: string[]) => string;
  /** What to do with a Rest Site's single visit. */
  rest: (run: RunState) => 'heal' | 'card' | 'kindle';
  /** Which event choice to take, by index into the event's `choices`. */
  event: (run: RunState, legal: number[], roll: Roller) => number;
}

/** Card kinds a node offers, ranked by how much a healthy run wants to walk into them. */
const ROUTE_WEIGHT: Record<MapNode['kind'], number> = {
  elite: 5, // widest card pick + double coins
  trial: 4, // relic + double coins, at normal fight strength
  store: 3,
  enhance: 3,
  event: 2,
  combat: 2,
  rest: 1, // only worth the detour when actually hurt
  boss: 0, // never a choice — the boss layer is a single node
};

/** Energy cost of an owned card, the rough proxy this policy uses for "how good". */
const cardWeight = (registry: Registry, cardId: string): number => {
  const card = registry.cards.get(cardId);
  if (!card) return 0;
  return card.cost.energy + (card.cost.elements ?? []).reduce((s, e) => s + e.amount, 0);
};

/**
 * An ordinary competent player: takes the rewarding fights while healthy, detours to a
 * camp when bloodied, buys the biggest thing it can afford, and never skips a card.
 *
 * Every threshold here is a guess about behaviour, not a rule of the game. They are named
 * constants so a sensitivity pass can move one and see what the run numbers do.
 */
export const HP_SEEK_REST = 0.5; // below this share of max HP, a Rest Site outranks everything
export const HP_AVOID_RISK = 0.7; // below this, stop seeking out Elites and Trials
export const HP_KINDLE = 0.35; // below this, burn cards for the bigger camp heal
export const KINDLE_MIN_DECK = 16; // ...but never down to a deck that can't function

export const DEFAULT_POLICY: RunPolicy = {
  route: (run, reachable, roll) => {
    const frac = run.hp / run.maxHp;
    const score = (n: MapNode): number => {
      let s = ROUTE_WEIGHT[n.kind];
      if (n.kind === 'rest') s += frac < HP_SEEK_REST ? 8 : 0;
      // A wounded run stops shopping for trouble: an Elite that would have been the best
      // node at full HP is the one most likely to end the run at half.
      if ((n.kind === 'elite' || n.kind === 'trial') && frac < HP_AVOID_RISK) s -= 4;
      return s;
    };
    let best = reachable[0]!;
    let bestScore = score(best);
    for (const n of reachable.slice(1)) {
      const s = score(n);
      if (s > bestScore) { best = n; bestScore = s; }
    }
    // Ties are broken by the roller rather than by node order, so a run does not always
    // hug the left edge of the map — that would sample one corner of every layout.
    const tied = reachable.filter((n) => score(n) === bestScore);
    return (tied.length > 1 ? roll.pick(tied) : best).id;
  },
  // Always take the card, and take the most expensive one offered. Deck dilution is real,
  // but a policy that skips cards is making a judgement the pool has never been measured
  // against; "take the biggest thing" is the behaviour to beat, not the ideal.
  takeRewardCard: (_run, choices, registry) =>
    choices.reduce((best, id) => (cardWeight(registry, id) > cardWeight(registry, best) ? id : best), choices[0]!),
  pickRelic: (_run, choices) => choices[0]!,
  rest: (run) => {
    const frac = run.hp / run.maxHp;
    if (run.hp >= run.maxHp) return 'card'; // heal and kindle are both rejected at full HP
    if (frac < HP_KINDLE && run.deck.length > KINDLE_MIN_DECK) return 'kindle';
    return 'heal';
  },
  event: (run, legal, roll) => {
    // A duel is a free fight when healthy and a run-ender when not, so the one thing this
    // policy is careful about is walking into combat on low HP.
    const safe = legal.filter((i) => eventForNode(nodeSeedFor(run)).choices[i]!.outcome.kind !== 'combat');
    const pool = run.hp / run.maxHp < HP_AVOID_RISK && safe.length > 0 ? safe : legal;
    return pool.length > 1 ? roll.pick(pool) : pool[0]!;
  },
};

/** The seed of the node the run is currently parked on (events read their content from it). */
const nodeSeedFor = (run: RunState): number => {
  const p = run.phase;
  if (p.t !== 'event') return 0;
  return run.map.nodes[p.nodeId]?.seed ?? 0;
};

export interface RunSimOptions {
  /** Stop once this act's boss is cleared. */
  maxActs?: number;
  /**
   * AI policy for the fights. TRUE (the default) is `planTurn`, the policy a player
   * actually faces and the only one balance work may use — see the note on
   * `simulateGame`. Pass false ONLY for plumbing tests: it is ~50x faster and measures
   * a different game.
   */
  usePlan?: boolean;
  policy?: Partial<RunPolicy>;
  /** Called after each fight, so a long batch can stream progress. */
  onFight?: (fight: FightLog, run: RunState) => void;
}

/** Hard ceiling on reducer steps, so a policy that stops making progress ends the run. */
const STEP_GUARD = 4000;

/**
 * Play one Adventure run to its end and report what happened.
 *
 * Deterministic: the same `leaderId`, `seed` and policy replay exactly, because every
 * decision the policy makes at random draws from a roller seeded off the run seed.
 */
export const simulateRun = (
  base: Registry,
  leaderId: string,
  seed: number,
  opts: RunSimOptions = {},
): RunSimResult => {
  const { maxActs = 3, usePlan = true, onFight } = opts;
  const policy: RunPolicy = { ...DEFAULT_POLICY, ...opts.policy };
  const roll = makeRoller(subSeed(seed, 'runsim', leaderId));

  let run = startRun(leaderId, seed, base);
  const fights: FightLog[] = [];
  let nodesVisited = 0;
  let bossesKilled = 0;
  let coinsEarned = 0;
  let coinsSpent = 0;
  let outcome: RunSimResult['outcome'] = 'stalled';

  /** Track spend/income across a transition, so the economy is measured, not assumed. */
  const settle = (before: RunState, after: RunState): RunState => {
    const delta = after.coins - before.coins;
    if (delta > 0) coinsEarned += delta;
    else coinsSpent += -delta;
    return after;
  };

  for (let step = 0; step < STEP_GUARD; step++) {
    if (run.phase.t === 'dead') { outcome = 'dead'; break; }
    if (run.act > maxActs) { outcome = 'cleared'; break; }

    switch (run.phase.t) {
      case 'map': {
        const ids = reachableNodeIds(run);
        if (ids.length === 0) { outcome = 'stalled'; step = STEP_GUARD; break; }
        const nodes = ids.map((id) => run.map.nodes[id]!).filter(Boolean);
        const next = pickNode(run, policy.route(run, nodes, roll));
        if (next === run) { outcome = 'stalled'; step = STEP_GUARD; break; }
        nodesVisited += 1;
        run = next;
        break;
      }

      case 'combat': {
        const { nodeId, fightSeed } = run.phase;
        const at = run.map.nodes[nodeId]!;
        const { registry, initial, enc } = buildFight(base, run, nodeId, fightSeed);
        const hpBefore = run.hp;
        const result = playOutGame(registry, initial, usePlan);
        const won = result.winner === 0;
        const hpAfter = result.finalHp[0];
        const fight: FightLog = {
          act: run.act,
          layer: at.layer,
          kind: at.kind,
          ...(at.kind === 'event' ? { viaEvent: true } : {}),
          enemyLeaderId: enc.enemyLeaderId,
          enemyHp: enc.enemyHp,
          ...(enc.twist ? { twist: enc.twist.id } : {}),
          ...(enc.boss ? { boss: enc.boss.id } : {}),
          won,
          hpBefore,
          hpAfter,
          turns: result.turns,
        };
        fights.push(fight);
        if (won && at.kind === 'boss') bossesKilled += 1;
        run = settle(run, resolveCombat(run, registry, won, hpAfter));
        onFight?.(fight, run);
        break;
      }

      case 'reward': {
        const p = run.phase;
        // Each gate blocks `leaveNode` until resolved, so they are cleared in turn and
        // the loop re-enters this case until the phase is clean.
        if (p.unlock) { run = claimUnlock(run); break; }
        if (p.relicChoices?.length) { run = pickRelic(run, policy.pickRelic(run, p.relicChoices)); break; }
        if (p.cardChoices?.length) {
          const take = policy.takeRewardCard(run, p.cardChoices, base);
          run = take ? pickRewardCard(run, take) : skipRewardCard(run);
          break;
        }
        const next = leaveNode(run);
        if (next === run) { outcome = 'stalled'; step = STEP_GUARD; break; }
        run = next;
        break;
      }

      case 'store': {
        run = settle(run, shopAtStore(run, base));
        run = leaveNode(run);
        break;
      }

      case 'enhance': {
        run = settle(run, upgradeAtEnhance(run, base));
        run = leaveNode(run);
        break;
      }

      case 'rest': {
        run = settle(run, useRestSite(run, base, policy));
        run = leaveNode(run);
        break;
      }

      case 'event': {
        const at = run.map.nodes[run.phase.nodeId]!;
        const event = eventForNode(at.seed);
        const legal = event.choices
          .map((c, i) => ({ c, i }))
          .filter(({ c }) => {
            if (c.cost !== undefined && run.coins < c.cost) return false;
            if (c.requiresDeck !== undefined && run.deck.length < c.requiresDeck) return false;
            if (c.outcome.kind === 'sacrificeEnhance' && run.deck.length < 3) return false;
            return true;
          })
          .map(({ i }) => i);
        if (legal.length === 0) { run = leaveNode(run); break; }
        const before = run;
        run = settle(run, chooseEventOption(run, base, policy.event(run, legal, roll)));
        // An event that routed into a fight leaves the phase on 'combat'; one that
        // resolved returns to the map on its own. A no-op means the choice was refused.
        if (run === before) { run = leaveNode(run); }
        break;
      }

      // The Copper Mech is an optional side challenge entered from the map, never landed
      // on, so a run driven by this policy cannot reach these phases.
      case 'copper':
      case 'copperResult':
        outcome = 'stalled';
        step = STEP_GUARD;
        break;
    }
  }

  return {
    leaderId,
    seed,
    outcome,
    actReached: run.act,
    nodesVisited,
    fights,
    bossesKilled,
    hp: run.hp,
    maxHp: run.maxHp,
    coins: run.coins,
    coinsEarned,
    coinsSpent,
    deckSize: run.deck.length,
    relics: [...run.relics],
    attunes: run.heroUpgrades.filter((u) => u.kind === 'attune').length,
    hasUnique: run.heroUpgrades.some((u) => u.kind === 'unique'),
    signatureBuff: run.signatureBuff,
  };
};

/** Buy the most expensive affordable card, repeatedly, until nothing else fits the purse. */
const shopAtStore = (run: RunState, base: Registry): RunState => {
  if (run.phase.t !== 'store') return run;
  const at = run.map.nodes[run.phase.nodeId];
  const leader = base.leaders.get(run.leaderId);
  if (!at || !leader) return run;
  let cur = run;
  for (let guard = 0; guard < 16; guard++) {
    const mods = aggregateMods(cur.relics);
    const offer = rollStoreOffer(base, at.seed, leader.element, mods.extraStoreSlots);
    const bought = new Set(cur.map.nodes[at.id]?.bought ?? []);
    let bestIdx = -1;
    let bestPrice = -1;
    offer.forEach((cardId, idx) => {
      if (bought.has(idx)) return;
      const card = base.cards.get(cardId);
      if (!card) return;
      const price = buyPrice(card, leader.element, mods);
      // Price tracks cost tracks power under this pricing model, so "most expensive
      // affordable" is the same greedy rule a player follows at a shop.
      if (price <= cur.coins && price > bestPrice) { bestPrice = price; bestIdx = idx; }
    });
    if (bestIdx < 0) break;
    const next = buyCard(cur, base, bestIdx);
    if (next === cur) break;
    cur = next;
  }
  return cur;
};

/** Spend the Enhance node's one purchase: buff the best body, else attune. */
const upgradeAtEnhance = (run: RunState, base: Registry): RunState => {
  if (run.phase.t !== 'enhance') return run;
  const at = run.map.nodes[run.phase.nodeId];
  const leader = base.leaders.get(run.leaderId);
  if (!at || !leader) return run;
  const offer = rollEnhanceOffer(at.seed, run.act);
  const price = Math.round(offer.price * aggregateMods(run.relics).enhanceDiscount);
  if (run.coins >= price) {
    // Put the buff on the biggest card it legally fits: an enhancement on a one-drop is
    // the same price as one on a finisher.
    const eligible = run.deck
      .filter((c: OwnedCard) => {
        const card = base.cards.get(c.cardId);
        return card ? canApply(offer, card) : false;
      })
      .sort((a, b) => cardWeight(base, b.cardId) - cardWeight(base, a.cardId));
    const target = eligible[0];
    if (target) {
      const next = applyEnhancement(run, base, target.uid);
      if (next !== run) return next;
    }
  }
  // Nothing to buff, or the buff is out of reach: attune the leader's own element, which
  // is the cap their deck leans on hardest.
  const cost = Math.round(
    attuneCost(run.heroUpgrades.filter((u) => u.kind === 'attune').length) * aggregateMods(run.relics).enhanceDiscount,
  );
  if (run.coins >= cost) return enhanceAttune(run, leader.element as Element);
  return run;
};

/** Spend the camp's single service according to the policy. */
const useRestSite = (run: RunState, base: Registry, policy: RunPolicy): RunState => {
  if (run.phase.t !== 'rest') return run;
  const { nodeId } = run.phase;
  switch (policy.rest(run)) {
    case 'kindle': {
      // Burn the two cheapest cards — the ones least likely to be the deck's plan.
      const order = [...run.deck].sort((a, b) => cardWeight(base, a.cardId) - cardWeight(base, b.cardId));
      const [a, b] = order;
      if (!a || !b) return restHeal(run);
      const next = restKindle(run, a.uid, b.uid);
      return next === run ? restHeal(run) : next;
    }
    case 'card': {
      const offer = restCardOffer(base, run, nodeId);
      if (offer.length === 0) return run;
      const best = offer.reduce((x, id) => (cardWeight(base, id) > cardWeight(base, x) ? id : x), offer[0]!);
      return restTakeCard(run, base, best);
    }
    case 'heal':
    default: {
      const next = restHeal(run);
      // Rejected at full HP — take the free card instead of wasting the visit.
      if (next !== run) return next;
      const offer = restCardOffer(base, run, nodeId);
      return offer.length > 0 ? restTakeCard(run, base, offer[0]!) : run;
    }
  }
};

// --- Batches ---------------------------------------------------------------------

export interface RunBatchResult {
  leaderId: string;
  runs: number;
  cleared: number;
  died: number;
  stalled: number;
  /** Mean act the run was in when it ended. */
  avgActReached: number;
  avgFights: number;
  avgFightsWon: number;
  /** Mean leader HP lost per fight won — the attrition rate the whole mode rests on. */
  avgHpLostPerWin: number;
  avgCoinsEarned: number;
  avgCoinsSpent: number;
  /** Coins still in the purse at the end: a large number means the economy over-pays. */
  avgCoinsLeft: number;
  avgDeckSize: number;
  avgRelics: number;
  /** Deaths bucketed by the node kind that ended the run. */
  deathsByKind: Record<string, number>;
  /** Deaths bucketed by act. */
  deathsByAct: Record<number, number>;
  results: RunSimResult[];
}

/** Simulate `runs` runs for one leader on consecutive seeds and aggregate them. */
export const runBatchForLeader = (
  base: Registry,
  leaderId: string,
  runs: number,
  seedBase = 1,
  opts: RunSimOptions = {},
  onRun?: (r: RunSimResult, i: number) => void,
): RunBatchResult => {
  const results: RunSimResult[] = [];
  for (let i = 0; i < runs; i++) {
    const r = simulateRun(base, leaderId, seedBase + i, opts);
    results.push(r);
    onRun?.(r, i);
  }
  return summarize(leaderId, results);
};

const mean = (xs: number[]): number => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

export const summarize = (leaderId: string, results: RunSimResult[]): RunBatchResult => {
  const deathsByKind: Record<string, number> = {};
  const deathsByAct: Record<number, number> = {};
  let hpLost = 0;
  let wins = 0;
  for (const r of results) {
    if (r.outcome === 'dead') {
      const last = r.fights[r.fights.length - 1];
      if (last) deathsByKind[last.kind] = (deathsByKind[last.kind] ?? 0) + 1;
      deathsByAct[r.actReached] = (deathsByAct[r.actReached] ?? 0) + 1;
    }
    for (const f of r.fights) {
      if (!f.won) continue;
      wins += 1;
      hpLost += Math.max(0, f.hpBefore - f.hpAfter);
    }
  }
  return {
    leaderId,
    runs: results.length,
    cleared: results.filter((r) => r.outcome === 'cleared').length,
    died: results.filter((r) => r.outcome === 'dead').length,
    stalled: results.filter((r) => r.outcome === 'stalled').length,
    avgActReached: mean(results.map((r) => r.actReached)),
    avgFights: mean(results.map((r) => r.fights.length)),
    avgFightsWon: mean(results.map((r) => r.fights.filter((f) => f.won).length)),
    avgHpLostPerWin: wins ? hpLost / wins : 0,
    avgCoinsEarned: mean(results.map((r) => r.coinsEarned)),
    avgCoinsSpent: mean(results.map((r) => r.coinsSpent)),
    avgCoinsLeft: mean(results.map((r) => r.coins)),
    avgDeckSize: mean(results.map((r) => r.deckSize)),
    avgRelics: mean(results.map((r) => r.relics.length)),
    deathsByKind,
    deathsByAct,
    results,
  };
};
