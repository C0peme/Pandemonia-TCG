/**
 * A strategy-aware `RunPolicy` — sits alongside `DEFAULT_POLICY` (runSim.ts) rather than
 * replacing it, so the two can be compared on the same build.
 *
 * `DEFAULT_POLICY` measures RUN STRUCTURE: it deliberately never skips a card, buys
 * whatever is priciest, and picks whatever relic is offered first, so a clear-rate number
 * from it isolates content/economy changes rather than "did the player shop well" (see its
 * own docstring). That also means it is a FLOOR, not a realistic estimate of skilled play
 * — see the [[runsim-policy-has-no-synergy-awareness]] memory. `SMART_POLICY` is the other
 * end of that comparison: it commits to the leader's own element as its "chosen strategy"
 * (the game already gates a deck to that element via the cap budget, so it's the one
 * strategy signal the run itself hands you), weighs reach keywords heavily whenever the
 * owned deck doesn't have one yet (closing the exact stall mechanism measured in
 * [[no-reach-six-archetypes-cant-close]]), scores relics against that plan instead of
 * always taking the first one, is willing to skip a reward and to sell/kindle its worst
 * cards instead of its cheapest, and opportunistically challenges the Copper Mech — which
 * costs nothing to attempt — once per act to record how the build is coming along.
 *
 * Two later additions, closing gaps the first pass didn't cover: it reinforces whatever
 * keyword already shows up most in the deck it's actually built (there's no per-leader
 * archetype table, so this reads the plan back out of the deck itself — a Snowball leader
 * accumulates `growth`, a Stall leader `taunt`, and so on), and it gears up harder at
 * Enhance/Store nodes specifically when the boss (a full curated deck, per the measured
 * 43%-vs-75% win-rate gap) is one or two layers away rather than treating every healthy
 * detour the same. Event choices are also ranked by expected value instead of picked at
 * random among whatever's "safe".
 */
import type { Card, Element } from '@cards/schema';
import type { Registry } from '@cards/registry';
import type { OwnedCard, RunState } from '@adventure/schema';
import { relicById } from '@adventure/data/relics';
import { eventForNode, type EventOutcome } from '@adventure/data/events';
import { HP_AVOID_RISK, HP_SEEK_REST, ROUTE_WEIGHT, nodeSeedFor, type RunPolicy } from '@adventure/runSim';

/** Keywords that get an attack past a lane an opponent has fully occupied (see combat.ts
 *  `findTaunt` — a plain attack into a held lane always hits the front unit; these are the
 *  only ways around that). */
const REACH_KEYWORDS = ['sniper', 'pierce', 'overshot', 'branchShot', 'splashDamage', 'strikeThrough'] as const;

const has = (kw: Partial<Record<string, unknown>> | undefined, key: string): boolean => Boolean(kw?.[key]);

const cardHasReach = (card: Card): boolean => {
  if (card.type === 'unit') return REACH_KEYWORDS.some((k) => has(card.keywords, k));
  if (card.type === 'foundation') return REACH_KEYWORDS.some((k) => has(card.keywords, k) || has(card.grants?.keywords, k));
  if (card.type === 'environment') return REACH_KEYWORDS.some((k) => has(card.grantKeywords, k));
  return false;
};

const cardCost = (card: Card): number => card.cost.energy + (card.cost.elements ?? []).reduce((s, e) => s + e.amount, 0);

const deckReachCount = (registry: Registry, deck: readonly OwnedCard[]): number =>
  deck.filter((c) => {
    const card = registry.cards.get(c.cardId);
    return card ? cardHasReach(card) : false;
  }).length;

/** The card's own keyword identity — a unit's `keywords`, a foundation's own keywords
 *  PLUS what it grants (either one can carry its "growth"/"taunt"/etc. signature), an
 *  environment's grant — or `undefined` for spells, which have neither. */
const cardKeywords = (card: Card): Partial<Record<string, unknown>> | undefined => {
  if (card.type === 'unit') return card.keywords;
  if (card.type === 'foundation') return { ...card.keywords, ...card.grants?.keywords };
  if (card.type === 'environment') return card.grantKeywords;
  return undefined;
};

/**
 * How many owned cards already carry each keyword — the run's own emergent identity.
 * There is no per-leader archetype table to consult (a custom leader has none either),
 * so this reads the plan back out of the deck the run has actually built: a Snowball
 * leader's deck fills up with `growth`, a Stall leader's with `taunt`/`tough`, a Combo
 * leader's foundations grant reach or lethal, and so on. Reinforcing whichever keyword
 * is already most common keeps the policy building toward ONE plan instead of a grab bag
 * of unrelated good stats.
 */
const deckKeywordCounts = (registry: Registry, deck: readonly OwnedCard[]): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const c of deck) {
    const card = registry.cards.get(c.cardId);
    const kw = card && cardKeywords(card);
    if (!kw) continue;
    for (const [k, v] of Object.entries(kw)) if (v) counts[k] = (counts[k] ?? 0) + 1;
  }
  return counts;
};

/**
 * How well `cardId` fits the run's plan. Bigger effects (cost) still count — a strict
 * downgrade from "always take the biggest" would throw out real signal — but this adds
 * what cost alone misses: does it match the leader's own element (guaranteed playable,
 * already inside the cap budget), does it close a reach gap the deck actually has, does
 * it reinforce whatever keyword identity the deck has already committed to, does it help
 * survive right now, and are we already stacked on this exact card.
 */
export const cardFit = (registry: Registry, run: RunState, cardId: string): number => {
  const card = registry.cards.get(cardId);
  if (!card) return -Infinity;
  const leader = registry.leaders.get(run.leaderId);
  let score = cardCost(card);
  if (leader && card.element === leader.element) score += 3;
  if (cardHasReach(card)) score += deckReachCount(registry, run.deck) === 0 ? 8 : 2;
  // Only once the deck has actually committed (3+ copies) — a single stray keyword on
  // the opening hand shouldn't be read as "the plan" yet.
  const kw = cardKeywords(card);
  if (kw) {
    const counts = deckKeywordCounts(registry, run.deck);
    const [topKeyword, topCount] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0] ?? [];
    if (topKeyword && (topCount ?? 0) >= 3 && kw[topKeyword]) score += 3;
  }
  if (card.type === 'unit' || card.type === 'foundation') {
    const hpFrac = run.hp / run.maxHp;
    if (hpFrac < 0.5) score += card.hp * 0.3; // bloodied: value staying alive over raw stats
    if (has(card.keywords, 'taunt') && hpFrac < 0.6) score += 2;
  }
  // Diminishing returns: the 4th copy of the same card is much less exciting than the 1st.
  const owned = run.deck.filter((c) => c.cardId === cardId).length;
  score -= owned * 1.5;
  return score;
};

/** Same idea as `cardFit`, for the relic pool: does this relic serve the leader's element,
 *  the deck's own card-type mix, or the run's current HP pressure — not just "which is
 *  first in the list". */
export const relicFit = (run: RunState, registry: Registry, relicId: string): number => {
  const relic = relicById(relicId);
  if (!relic) return -Infinity;
  const leader = registry.leaders.get(run.leaderId);
  const el: Element | undefined = leader?.element;
  const m = relic.mods;
  const hpFrac = run.hp / run.maxHp;
  let score = 0;
  if (m.enemyHpDelta) score += -m.enemyHpDelta * 0.5; // enemyHpDelta is negative = easier
  if (m.maxHpDelta) score += m.maxHpDelta * (hpFrac < 0.6 ? 1.2 : 0.8);
  if (m.elementBuffs?.some((b) => b.element === el)) score += 6;
  if (m.elementKeywords?.some((k) => k.element === el)) score += 6;
  if (m.elementCapDelta && m.elementCapDelta.element === el) score += 5;
  if (m.costReduction) {
    const total = Math.max(1, run.deck.length);
    const share = (type: string): number =>
      run.deck.filter((c) => registry.cards.get(c.cardId)?.type === type).length / total;
    if (m.costReduction.unit) score += 5 * share('unit');
    if (m.costReduction.spell) score += 4 * share('spell');
    if (m.costReduction.foundation) score += 4 * share('foundation');
    if (m.costReduction.environment) score += 3 * share('environment');
  }
  if (m.startingHandDelta) score += m.startingHandDelta * 2;
  if (m.startEnergyBonus) score += m.startEnergyBonus * 1.5;
  if (m.startBank) score += m.startBank.amount * 1.2;
  if (m.startWithSignature) score += 4;
  if (m.prePlaceFoundation) score += 3;
  if (m.storeBuyMult !== undefined) score += (1 - m.storeBuyMult) * 10;
  if (m.storeSellMult !== undefined) score += (m.storeSellMult - 1) * 6;
  if (m.enhanceDiscount !== undefined) score += (1 - m.enhanceDiscount) * 8;
  if (m.extraStoreSlots) score += m.extraStoreSlots * 1.5;
  if (m.startCoinsDelta) score += m.startCoinsDelta * 0.05;
  return score;
};

/** A reward pick this weak, relative to the deck's own median card, isn't worth the
 *  dilution — skip it and keep the deck lean instead of taking everything on offer. */
const SKIP_BELOW = 2;
/** Never skip below this deck size — a thin deck decks out and self-damages on Nulls
 *  (see [[adventure-deckout-was-killing-runs]]); staying at or above the starter size
 *  matters more than any one card's fit. */
const MIN_KEEP_DECK = 20;

/** Map layers still ahead before the forced, single boss node at the final layer — the
 *  boss itself is never a routing choice (mapgen.ts puts it alone at the top layer), but
 *  knowing it's close is what should make a policy gear up rather than push forward. */
const layersToBoss = (run: RunState): number => {
  const lastLayer = run.map.layers.length - 1;
  const currentLayer = run.currentNodeId ? (run.map.nodes[run.currentNodeId]?.layer ?? -1) : -1;
  return lastLayer - currentLayer;
};

/**
 * Rough expected value of an event outcome, for choosing between several rather than
 * picking at random among whatever's "safe". A named card reuses `cardFit`; a random one
 * and a relic get a flat estimate (their actual identity isn't knowable before landing);
 * `sacrificeEnhance` is only worth it once the deck is bloated enough to afford losing 2
 * cards for a buffed 1; `combat` gets a modest, not dominant, value — a free fight is a
 * genuine bonus while healthy, but this is still a permadeath format, so it should never
 * outweigh a guaranteed relic or card.
 */
export const eventOutcomeValue = (registry: Registry, run: RunState, outcome: EventOutcome): number => {
  switch (outcome.kind) {
    case 'coins': return outcome.amount * 0.05;
    case 'relic': return 4;
    case 'card': return outcome.cardId === 'random' ? 3 : cardFit(registry, run, outcome.cardId);
    case 'sacrificeEnhance': return run.deck.length > 24 ? 3 : -2;
    case 'combat': return 1.5;
    case 'nothing': return 0;
  }
};

export const SMART_POLICY: RunPolicy = {
  route: (run, reachable, roll) => {
    const frac = run.hp / run.maxHp;
    const nearBoss = layersToBoss(run) <= 2;
    const score = (n: (typeof reachable)[number]): number => {
      let s = ROUTE_WEIGHT[n.kind];
      if (n.kind === 'rest') s += frac < HP_SEEK_REST ? 8 : 0;
      if ((n.kind === 'elite' || n.kind === 'trial') && frac < HP_AVOID_RISK) s -= 4;
      // Chasing the plan: seek Enhance/Store harder while healthy enough to detour, and
      // harder still with the boss (a full curated 30-card deck, per the boss-win-rate
      // finding) coming up in the next layer or two.
      if ((n.kind === 'enhance' || n.kind === 'store') && frac >= HP_AVOID_RISK) s += nearBoss ? 3 : 1;
      return s;
    };
    let best = reachable[0]!;
    let bestScore = score(best);
    for (const n of reachable.slice(1)) {
      const s = score(n);
      if (s > bestScore) { best = n; bestScore = s; }
    }
    const tied = reachable.filter((n) => score(n) === bestScore);
    return (tied.length > 1 ? roll.pick(tied) : best).id;
  },
  takeRewardCard: (run, choices, registry) => {
    const scored = choices
      .map((id) => ({ id, s: cardFit(registry, run, id) }))
      .sort((a, b) => b.s - a.s);
    const best = scored[0];
    if (!best) return null;
    if (best.s < SKIP_BELOW && run.deck.length >= MIN_KEEP_DECK) return null;
    return best.id;
  },
  pickRelic: (run, choices, registry) => {
    const scored = choices.map((id) => ({ id, s: relicFit(run, registry, id) })).sort((a, b) => b.s - a.s);
    return scored[0]!.id;
  },
  rest: (run) => {
    const frac = run.hp / run.maxHp;
    if (run.hp >= run.maxHp) return 'card';
    if (frac < 0.35 && run.deck.length > 22) return 'kindle';
    return 'heal';
  },
  event: (run, legal, roll, registry) => {
    // Same care DEFAULT_POLICY takes around a combat-outcome choice (a duel is a free
    // fight when healthy and a run-ender when not), reusing the exact same lookup — but
    // rank what's left by expected value instead of picking at random among it.
    const event = eventForNode(nodeSeedFor(run));
    const safe = legal.filter((i) => event.choices[i]!.outcome.kind !== 'combat');
    const pool = run.hp / run.maxHp < HP_AVOID_RISK && safe.length > 0 ? safe : legal;
    const scored = pool.map((i) => ({ i, s: eventOutcomeValue(registry, run, event.choices[i]!.outcome) })).sort((a, b) => b.s - a.s);
    const bestScore = scored[0]?.s;
    const tied = scored.filter((x) => x.s === bestScore);
    return tied.length > 1 ? roll.pick(tied).i : scored[0]!.i;
  },
  cardScore: cardFit,
  copperMech: true,
};
