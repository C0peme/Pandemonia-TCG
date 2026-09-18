/**
 * Relic logic: fold owned relics into a single set of modifiers, apply the
 * fight-start ones to a freshly-built GameState, and roll relic choices for
 * elite/boss rewards. All pure — mirrors trials.ts's applyTrialToState.
 */
import type { Element, CardElement, EffectGrantKeywords, FoundationCard } from '@cards/schema';
import type { Registry } from '@cards/registry';
import type { GameState, PlayerId } from '@engine/types';
import type { OwnedCard, RunState } from '@adventure/schema';
import { LANES, type LaneId } from '@engine/constants';
import { drawCard } from '@engine/draw';
import { RULES } from '@engine/constants';
import { makeFoundationUnit } from '@engine/board';
import { reconcileDrowning } from '@engine/drowning';
import { addCardToHand } from '@engine/hand';
import { makeRoller } from '@adventure/seed';
import { RELICS, relicById, ENERGY_PER_TURN_CAP, type Relic, type RelicRarity, type RelicCondition, type RelicMods, type RelicScale } from '@adventure/data/relics';

const PLAYER: PlayerId = 0;

/**
 * What a conditional relic is judged against.
 *
 * Conditions are re-evaluated every time mods are folded rather than latched on claim, so
 * Lean Ledger switches off the moment a reward card pushes the deck over its threshold —
 * that live feedback is the whole point of a build-around.
 *
 * `monoElement` is OPTIONAL because deriving it needs a registry to look up each owned
 * card's element, and several economy call sites (`runCeiling`, `storeReroll`) legitimately
 * have no registry to hand. Absent means "unknown", which reads as NOT satisfied — the
 * conservative direction, and only ever affects relics whose payload is a fight-time buff
 * that the registry-carrying combat path evaluates correctly anyway.
 */
export interface RelicContext {
  /** Cards owned. */
  deckSize: number;
  /** Relics owned (spent ones included — they are still in the tray). */
  relicCount: number;
  /** Current HP as a fraction of max, for `wounded`. */
  hpFraction: number;
  /** Every owned card shares one card element. Undefined = could not be determined. */
  monoElement?: boolean;
  /** Relic ids whose one-shot has already been used; their mods are skipped entirely. */
  spent?: readonly string[];
  /**
   * Relic ids still BROKEN — their `broken` mods apply instead of their real ones until
   * enough battles have been won. See `RunState.relicRepair`.
   */
  broken?: readonly string[];
  /**
   * Owned cards per element, for `elementAtLeast`. Undefined = could not be determined
   * (no registry), which reads as NOT satisfied — the same conservative direction
   * `monoElement` takes, and for the same reason.
   */
  elementCounts?: Partial<Record<CardElement, number>>;
  // --- scaling sources (see `RelicScale`). Everything below is a live run quantity, so a
  // scaling relic strengthens and weakens as the run does — spending the purse really
  // does give the Hoard-Ledger's ground back.
  /** Coins held right now. */
  coins: number;
  /** 1-based act number. */
  act: number;
  /** Total enhancements worked into owned cards. */
  enhancements: number;
  /** HP below maximum (never negative — temporary HP above max does not count backwards). */
  missingHp: number;
}

/** The folded result of every owned relic's mods. */
export interface AggregateMods {
  startCoinsDelta: number;
  /** Claim-time proportional coin gain; consumed by `grantRelic`, never a live mod. */
  coinsPercent: number;
  maxHpDelta: number;
  enemyHpMult: number;
  elementCapDeltas: { element: Element; amount: number }[];
  elementBuffs: { element: CardElement; attack?: number; hp?: number }[];
  elementKeywords: { element: CardElement; keywords: EffectGrantKeywords }[];
  costReduction: { unit: number; spell: number; foundation: number; environment: number };
  startBanks: { element: Element | 'leader'; amount: number }[];
  startEnergyBonus: number;
  energyPerTurn: number;
  turnDraw: number;
  turnMill: number;
  startingHandDelta: number;
  handCapDelta: number;
  prePlaceFoundations: (string | 'random')[];
  startWithSignature: boolean;
  storeBuyMult: number;
  storeSellMult: number;
  enhanceDiscount: number;
  extraStoreSlots: number;
  // Run-layer (read by run.ts between fights, not applied to a GameState).
  tempHpDelta: number;
  victoryHealBonus: number;
  restHealBonus: number;
  extraCardChoices: number;
  overhealBonus: number;
  coinsPerWin: number;
  /** Coins granted per point of HP lost in the battle just won. */
  coinsPerHpLost: number;
  /** Multiplies the final combat coin reward, before `coinsPerWin` is added. */
  coinsEarnedMult: number;
  /** Act shift for difficulty AND reward scaling. Negative = easier and poorer. */
  actDelta: number;
  /** 0 = never. Otherwise the AI plays the player's turn every N rounds. */
  autopilotEveryRounds: number;
}

export const emptyMods = (): AggregateMods => ({
  startCoinsDelta: 0,
  coinsPercent: 0,
  maxHpDelta: 0,
  enemyHpMult: 1,
  elementCapDeltas: [],
  elementBuffs: [],
  elementKeywords: [],
  costReduction: { unit: 0, spell: 0, foundation: 0, environment: 0 },
  startBanks: [],
  startEnergyBonus: 0,
  energyPerTurn: 0,
  turnDraw: 0,
  turnMill: 0,
  startingHandDelta: 0,
  handCapDelta: 0,
  prePlaceFoundations: [],
  startWithSignature: false,
  storeBuyMult: 1,
  storeSellMult: 1,
  enhanceDiscount: 1,
  extraStoreSlots: 0,
  tempHpDelta: 0,
  victoryHealBonus: 0,
  restHealBonus: 0,
  extraCardChoices: 0,
  overhealBonus: 0,
  coinsPerWin: 0,
  coinsPerHpLost: 0,
  coinsEarnedMult: 1,
  actDelta: 0,
  autopilotEveryRounds: 0,
});

/**
 * Does a relic's condition hold?
 *
 * A relic with no condition always applies. A CONDITIONAL relic with no context to judge
 * against does not — see the `RelicContext` note; guessing "yes" would hand out free power
 * in exactly the paths that could not check.
 */
const conditionMet = (when: RelicCondition | undefined, ctx?: RelicContext): boolean => {
  if (!when) return true;
  if (!ctx) return false;
  if (when.deckAtMost !== undefined && ctx.deckSize > when.deckAtMost) return false;
  if (when.deckAtLeast !== undefined && ctx.deckSize < when.deckAtLeast) return false;
  if (when.relicsAtLeast !== undefined && ctx.relicCount < when.relicsAtLeast) return false;
  if (when.wounded && ctx.hpFraction > 0.5) return false;
  if (when.monoElement && ctx.monoElement !== true) return false;
  if (when.elementAtLeast) {
    // Needs a registry to have resolved the deck's elements; without one the honest
    // answer is "unknown", which must read as unsatisfied rather than as free power.
    if (!ctx.elementCounts) return false;
    for (const need of when.elementAtLeast) {
      if ((ctx.elementCounts[need.element] ?? 0) < need.count) return false;
    }
  }
  return true;
};

/**
 * How many STEPS of a relic's `scale.mods` apply, given the run it is sitting in.
 *
 * No context means no steps — the same conservative direction `conditionMet` takes, and
 * for the same reason: the call sites without a context (bare `aggregateMods` in tests
 * and fixtures) must not be handed free power they could not have measured.
 */
const scaleSteps = (scale: RelicScale | undefined, ctx?: RelicContext): number => {
  if (!scale || !ctx || scale.per <= 0) return 0;
  const value =
    scale.source === 'relics' ? ctx.relicCount
      : scale.source === 'coins' ? ctx.coins
        : scale.source === 'deckSize' ? ctx.deckSize
          : scale.source === 'act' ? ctx.act
            : scale.source === 'enhancements' ? ctx.enhancements
              : ctx.missingHp;
  const from = scale.from ?? 0;
  const span = scale.invert ? from - value : value - from;
  return Math.max(0, Math.min(scale.maxSteps, Math.floor(span / scale.per)));
};

/**
 * Fold ONE relic's mods into the accumulator.
 *
 * Extracted so a scaling relic can fold the SAME bag repeatedly — additive fields
 * therefore multiply by the step count and multiplicative ones compound, which is the
 * right shape for both (see `Relic.scale`). Every field the table can declare has to be
 * handled here or it is silently free; `relicShapes.test.ts` asserts the coverage.
 */
const foldMods = (agg: AggregateMods, m: RelicMods): void => {
  if (m.startCoinsDelta) agg.startCoinsDelta += m.startCoinsDelta;
  if (m.coinsPercent) agg.coinsPercent += m.coinsPercent;
  if (m.maxHpDelta) agg.maxHpDelta += m.maxHpDelta;
  // MULTIPLIED, not summed: two relics at 0.9 and 0.8 give 0.72, not 0.7 — stacking
  // cuts compounds toward zero instead of racing past it, so no combination can delete
  // an enemy outright the way additive flat deltas could. A price above 1 (Covenant
  // Stone) composes the same way, so a discount can always answer it.
  if (m.enemyHpMult !== undefined) agg.enemyHpMult *= m.enemyHpMult;
  if (m.elementCapDelta) agg.elementCapDeltas.push(m.elementCapDelta);
  if (m.elementBuffs) agg.elementBuffs.push(...m.elementBuffs);
  if (m.elementKeywords) agg.elementKeywords.push(...m.elementKeywords);
  if (m.costReduction) {
    for (const [k, v] of Object.entries(m.costReduction)) {
      if (v !== undefined) agg.costReduction[k as keyof typeof agg.costReduction] += v;
    }
  }
  if (m.startBank) agg.startBanks.push(m.startBank);
  if (m.startEnergyBonus) agg.startEnergyBonus += m.startEnergyBonus;
  if (m.energyPerTurn) agg.energyPerTurn += m.energyPerTurn;
  if (m.turnDraw) agg.turnDraw += m.turnDraw;
  if (m.turnMill) agg.turnMill += m.turnMill;
  if (m.startingHandDelta) agg.startingHandDelta += m.startingHandDelta;
  if (m.handCapDelta) agg.handCapDelta += m.handCapDelta;
  if (m.prePlaceFoundation) agg.prePlaceFoundations.push(m.prePlaceFoundation);
  if (m.startWithSignature) agg.startWithSignature = true;
  if (m.storeBuyMult !== undefined) agg.storeBuyMult *= m.storeBuyMult;
  if (m.storeSellMult !== undefined) agg.storeSellMult *= m.storeSellMult;
  if (m.enhanceDiscount !== undefined) agg.enhanceDiscount *= m.enhanceDiscount;
  if (m.extraStoreSlots) agg.extraStoreSlots += m.extraStoreSlots;
  if (m.tempHpDelta) agg.tempHpDelta += m.tempHpDelta;
  if (m.victoryHealBonus) agg.victoryHealBonus += m.victoryHealBonus;
  if (m.restHealBonus) agg.restHealBonus += m.restHealBonus;
  if (m.extraCardChoices) agg.extraCardChoices += m.extraCardChoices;
  if (m.overhealBonus) agg.overhealBonus += m.overhealBonus;
  if (m.coinsPerWin) agg.coinsPerWin += m.coinsPerWin;
  if (m.coinsPerHpLost) agg.coinsPerHpLost += m.coinsPerHpLost;
  if (m.coinsEarnedMult !== undefined) agg.coinsEarnedMult *= m.coinsEarnedMult;
  if (m.actDelta) agg.actDelta += m.actDelta;
  // HARSHEST wins, rather than summing: two relics that each seize every 4th round must
  // not compound into a seizure every other round. Taking the minimum keeps the second
  // one's takeover redundant instead of catastrophic — the same reasoning as the
  // energy-per-turn cap below, applied to a field where "more" means "worse".
  if (m.autopilotEveryRounds) {
    agg.autopilotEveryRounds = agg.autopilotEveryRounds === 0
      ? m.autopilotEveryRounds
      : Math.min(agg.autopilotEveryRounds, m.autopilotEveryRounds);
  }
};

/**
 * Fold a set of owned relic ids into one AggregateMods (unknown ids ignored).
 *
 * `ctx` gates conditional relics, skips spent one-shots, and supplies the run quantities
 * a boss relic's `scale` reads. Production callers should go through `runMods`, which
 * builds the context from a RunState; the bare form is kept for fixtures and for the many
 * tests that only care about unconditional, unscaled relics.
 */
export const aggregateMods = (relicIds: readonly string[], ctx?: RelicContext): AggregateMods => {
  const agg = emptyMods();
  const spent = new Set(ctx?.spent ?? []);
  const broken = new Set(ctx?.broken ?? []);
  for (const id of relicIds) {
    const relic = relicById(id);
    if (!relic) continue;
    // A spent one-shot is inert: it keeps its tray slot (the run should be able to see it
    // already used its safety net) but contributes nothing.
    if (spent.has(id)) continue;
    if (!conditionMet(relic.when, ctx)) continue;
    // A BROKEN relic contributes its drawback INSTEAD of its payload — not as well as.
    // Folding both would make it a wash rather than a loan, and the whole point is that
    // the two halves never coexist: you pay first, then you are paid.
    if (broken.has(id) && relic.broken) {
      foldMods(agg, relic.broken);
      continue;
    }
    foldMods(agg, relic.mods);
    // A boss relic's scaling half: the same bag folded once per step, so the relic grows
    // with whatever the run has been accumulating and shrinks again when that is spent.
    const steps = scaleSteps(relic.scale, ctx);
    for (let i = 0; i < steps; i++) foldMods(agg, relic.scale!.mods);
  }
  // Boss and cursed relics both grant +1 energy per turn. Collecting three would be
  // playing a different game from round one, so the SUM is capped — which leaves every
  // one of them a legitimate pick and makes the third redundant rather than run-breaking.
  agg.energyPerTurn = Math.min(ENERGY_PER_TURN_CAP, agg.energyPerTurn);
  return agg;
};

/** Relic ids still awaiting repair (counter present and above zero). */
export const brokenRelics = (run: RunState): string[] =>
  Object.entries(run.relicRepair ?? {}).filter(([, left]) => left > 0).map(([id]) => id);

/** Wins still owed before `id` repairs itself. 0 = not broken (or already fixed). */
export const repairsLeft = (run: RunState, id: string): number => run.relicRepair?.[id] ?? 0;

/**
 * Build a `RelicContext` from a run. Pass the registry wherever one is available — it is
 * needed only to answer `monoElement` and `elementCounts`.
 */
export const runContext = (run: RunState, registry?: Registry): RelicContext => {
  let monoElement: boolean | undefined;
  let elementCounts: Partial<Record<CardElement, number>> | undefined;
  if (registry) {
    const elements = new Set<CardElement>();
    elementCounts = {};
    for (const owned of run.deck) {
      const def = registry.cards.get(owned.cardId);
      if (!def) continue;
      elements.add(def.element);
      elementCounts[def.element] = (elementCounts[def.element] ?? 0) + 1;
    }
    monoElement = elements.size <= 1;
  }
  return {
    deckSize: run.deck.length,
    relicCount: run.relics.length,
    hpFraction: run.maxHp > 0 ? run.hp / run.maxHp : 1,
    ...(monoElement !== undefined ? { monoElement } : {}),
    ...(elementCounts !== undefined ? { elementCounts } : {}),
    spent: run.spentRelics,
    // An id is broken only while its repair counter is still above zero; `resolveCombat`
    // deletes the entry entirely on the win that finishes the job.
    broken: brokenRelics(run),
    coins: run.coins,
    act: run.act,
    enhancements: run.deck.reduce((n, c) => n + c.enhancements.length, 0),
    // Temporary HP puts `hp` ABOVE `maxHp`; a comeback relic must read that as "missing
    // nothing", not as a negative wound that would cancel out a real one.
    missingHp: Math.max(0, run.maxHp - run.hp),
  };
};

/** The run's folded relic mods, conditions and spent one-shots accounted for. */
export const runMods = (run: RunState, registry?: Registry): AggregateMods =>
  aggregateMods(run.relics, runContext(run, registry));

/** Lanes with nothing on the player's side, preferred order for pre-placing. */
const emptyPlayerLanes = (state: GameState): LaneId[] =>
  LANES.filter((lane) => {
    const l = state.players[PLAYER].lanes[lane];
    return !l.front && !l.back && !l.standaloneFoundation;
  });

/**
 * Apply the fight-start relic mods to a freshly-initialized encounter state
 * (player = seat 0). enemyHpMult is handled earlier in the encounter builder.
 */
export const applyRelicsToState = (registry: Registry, state: GameState, mods: AggregateMods, seed: number): GameState => {
  const roll = makeRoller(seed);
  const me = state.players[PLAYER];

  // Element caps (applied first, so pre-banked energy below respects a boosted cap).
  for (const { element, amount } of mods.elementCapDeltas) me.elementCaps[element] += amount;

  // Pre-banked element energy. `'leader'` resolves to the leader's own element, and the
  // total is clamped to that element's (possibly relic-boosted) cap.
  const leaderElement = registry.leaders.get(me.leaderId)?.element;
  for (const { element, amount } of mods.startBanks) {
    // A leader's element is always one of the four bankable ones — `neutral` is a card
    // CLASS, not a fifth element, and has no bank, cap or pip.
    const el = element === 'leader' ? leaderElement : element;
    if (!el) continue;
    me.bank[el] = Math.min(me.elementCaps[el], me.bank[el] + amount);
  }

  // Persistent cost discounts → costBase (survives turn-end, unlike costMods).
  const cr = mods.costReduction;
  if (cr.unit || cr.spell || cr.foundation || cr.environment) {
    me.costBase ??= { unit: 0, spell: 0, foundation: 0, environment: 0 };
    me.costBase.unit += cr.unit;
    me.costBase.spell += cr.spell;
    me.costBase.foundation += cr.foundation;
    me.costBase.environment += cr.environment;
  }

  // Turn-1 energy burst (this is the opening turn, so it adds to live energy directly).
  if (mods.startEnergyBonus) me.energy += mods.startEnergyBonus;

  // PERMANENT per-turn energy. `initGame` has already run round 1's `beginTurn` by the
  // time relics are applied, so the field alone would not pay out until turn 2 — the
  // opening turn has to be topped up by hand, exactly as CombatView already does for a
  // boss's `energyOverride`.
  if (mods.energyPerTurn) {
    me.energyPerTurn = (me.energyPerTurn ?? 0) + mods.energyPerTurn;
    me.energy += mods.energyPerTurn;
  }

  // Per-turn card modifiers ride the same seam boss curses use, so a draw engine relic
  // needs no engine change of its own.
  if (mods.turnDraw || mods.turnMill) {
    me.turnCardMod = {
      ...me.turnCardMod,
      ...(mods.turnDraw ? { extraDraws: (me.turnCardMod?.extraDraws ?? 0) + mods.turnDraw } : {}),
      ...(mods.turnMill ? { millSelf: (me.turnCardMod?.millSelf ?? 0) + mods.turnMill } : {}),
    };
  }

  // AUTOPILOT (cursed): the AI takes this seat every Nth round. Seated on the shared
  // GameState rather than handed to the UI, so the fight itself carries the rule — see
  // `autopilotActive` in engine/types.ts, which is the only predicate any surface uses.
  if (mods.autopilotEveryRounds > 0) {
    state.autopilot = { player: PLAYER, everyRounds: mods.autopilotEveryRounds };
  }

  // Extra opening draws.
  // Room to HOLD the extra cards, applied BEFORE they are drawn. A relic that hands you
  // three cards into a ten-card cap discarded the overflow on the spot, which reads as the
  // relic not working — so every card-granting relic carries a matching cap raise.
  if (mods.handCapDelta) {
    state.players[PLAYER].handCap = (state.players[PLAYER].handCap ?? RULES.HAND_CAP) + mods.handCapDelta;
  }
  for (let i = 0; i < mods.startingHandDelta; i++) drawCard(state, PLAYER, []);

  // Signature card into hand.
  if (mods.startWithSignature) {
    const sigId = registry.leaders.get(me.leaderId)?.signatureCardId;
    if (sigId && registry.cards.has(sigId)) {
      addCardToHand(state, PLAYER, { iid: `r${state.iidSeq++}`, cardId: sigId }, []);
    }
  }

  // Pre-placed foundations.
  const foundations = [...registry.cards.values()].filter((c): c is FoundationCard => c.type === 'foundation' && !c.wip);
  for (const spec of mods.prePlaceFoundations) {
    const lane = emptyPlayerLanes(state)[0];
    if (!lane || foundations.length === 0) break;
    const def = spec === 'random' ? roll.pick(foundations) : registry.cards.get(spec);
    if (!def || def.type !== 'foundation') continue;
    const sf = makeFoundationUnit(def, { iid: `rf${state.iidSeq++}`, cardId: def.id }, PLAYER);
    sf.justPlaced = false; // prepared ground — free to fight from turn one
    state.players[PLAYER].lanes[lane].standaloneFoundation = sf;
    // The Water rule applies to a pre-placed Foundation like any other body. `emptyPlayerLanes`
    // walks LANES in board order, so with one such relic this is always Heights — but a second
    // one reaches `water`, and `makeFoundationUnit` takes no drowning flag. Reconciled here for
    // the same reason `trials.ts` reconciles ITS pre-placed units: the rule lives in
    // drowning.ts, and a placement path that skips it silently exempts itself from Water.
    reconcileDrowning(sf, lane);
  }
  return state;
};

/**
 * Apply element-conditional buffs (stats and/or keywords) to the player's deck for one
 * encounter.
 *
 * Returns a TRANSIENT copy — the persisted run deck is never mutated. Buffs are
 * expressed as extra `stat`/`keyword` enhancements appended to matching owned copies, so
 * they flow through the exact same materialization (`ownedCardDef` → `adv:${uid}`) that
 * real enhancements use: player-only, stacks with existing enhancements, and applies to
 * every draw all game rather than just the opening hand. Spells/environments have no
 * stats or grantable keywords in play, so only units and foundations are touched; a
 * keyword the card already has is kept (never downgraded), per `ownedCardDef`.
 *
 * Matching is on `CardElement`, so `neutral` cards are addressable like any other — they
 * previously were not, which silently excluded a whole card class from every
 * element-scoped relic.
 *
 * Must be fed to BOTH `buildRunRegistry({ deck })` and `playerDeck(...)` so the
 * materialized defs and the deck-list card ids agree.
 */
export const applyDeckBuffs = (registry: Registry, deck: OwnedCard[], mods: AggregateMods): OwnedCard[] => {
  if (mods.elementBuffs.length === 0 && mods.elementKeywords.length === 0) return deck;
  return deck.map((owned) => {
    const def = registry.cards.get(owned.cardId);
    if (!def || (def.type !== 'unit' && def.type !== 'foundation')) return owned;
    const extra = [...owned.enhancements];

    let attack = 0;
    let hp = 0;
    for (const b of mods.elementBuffs) {
      if (b.element === def.element) {
        attack += b.attack ?? 0;
        hp += b.hp ?? 0;
      }
    }
    if (attack !== 0 || hp !== 0) extra.push({ kind: 'stat', attack, hp });

    const keywords: EffectGrantKeywords = {};
    for (const g of mods.elementKeywords) {
      if (g.element === def.element) Object.assign(keywords, g.keywords);
    }
    if (Object.keys(keywords).length > 0) extra.push({ kind: 'keyword', keywords });

    return extra.length === owned.enhancements.length ? owned : { ...owned, enhancements: extra };
  });
};

<<<<<<< Updated upstream
/** 3 distinct unowned relics of a rarity band, seeded. Falls back across bands if short. */
export const rollRelicChoices = (seed: number, bands: RelicRarity[], owned: readonly string[], count = 3): string[] => {
  const roll = makeRoller(seed);
  const ownedSet = new Set(owned);
  const inBand = RELICS.filter((r) => bands.includes(r.rarity) && !ownedSet.has(r.id));
  const rest = RELICS.filter((r) => !bands.includes(r.rarity) && !ownedSet.has(r.id));
  const picks = [...roll.shuffle(inBand), ...roll.shuffle(rest)].slice(0, count);
=======
/**
 * Reward bands, weakest first — the order fallback descends through.
 *
 * `cursed` is deliberately ABSENT. A cursed relic is a trade the player agrees to at a
 * shop counter, never something a reward screen hands them: rolling one into a boss
 * reward would put a drawback on a fight they already paid for in HP, which is the exact
 * thing splitting the band off was meant to end.
 */
const RARITY_ORDER: RelicRarity[] = ['common', 'rare', 'boss'];

/** Relics a reward screen may offer: everything except the cursed shelf. */
const REWARDABLE = RELICS.filter((r) => r.rarity !== 'cursed');

/** Relics only the store's cursed shelf stocks. */
export const CURSED_RELICS = RELICS.filter((r) => r.rarity === 'cursed');

/**
 * 3 distinct unowned relics of a rarity band, seeded. Falls back across bands if short.
 *
 * Fallback goes DOWNWARD first (rarer bands are the last resort), so exhausting the
 * common pool at a Trial can no longer hand out a boss-band relic — the band is what
 * makes a boss reward feel like one, and padding indiscriminately undermined exactly
 * the pacing it was meant to protect. Upward fallback still exists as the final tier so
 * the caller is always offered `count` choices when that many unowned relics remain.
 */
export const rollRelicChoices = (seed: number, bands: RelicRarity[], owned: readonly string[], count = 3): string[] => {
  const roll = makeRoller(seed);
  const ownedSet = new Set(owned);
  const available = REWARDABLE.filter((r) => !ownedSet.has(r.id));
  const highest = Math.max(...bands.map((b) => RARITY_ORDER.indexOf(b)));
  const rank = (r: Relic): number => RARITY_ORDER.indexOf(r.rarity);

  const inBand = available.filter((r) => bands.includes(r.rarity));
  const spare = available.filter((r) => !bands.includes(r.rarity));
  // Descend one band at a time (rarest of the lower bands first), shuffling WITHIN each
  // band so the fallback still varies by seed rather than always naming the same relic.
  const below = [...RARITY_ORDER].reverse()
    .filter((b) => RARITY_ORDER.indexOf(b) < highest)
    .flatMap((b) => roll.shuffle(spare.filter((r) => r.rarity === b)));
  const above = roll.shuffle(spare.filter((r) => rank(r) > highest));

  const picks = [...roll.shuffle(inBand), ...below, ...above].slice(0, count);
>>>>>>> Stashed changes
  return picks.map((r) => r.id);
};

/**
 * A store's relic shelf: `slots` ordinary relics plus exactly one CURSED one.
 *
 * Bands are act-gated and deliberately STOP AT RARE. A boss relic is the thing a boss
 * fight pays for; putting one behind a coin price would make the reward buyable, and the
 * scaling relics in that band are the run's biggest rewrites. So the split across the
 * whole game is: commons and rares are found OR bought, boss relics are only ever won,
 * and cursed relics are only ever bought — which is what makes taking a curse an act
 * rather than something that happens to a run.
 *
 * Derived from `(seed, act, rerolls)` like every other store offer, so a reload
 * reproduces the shelf exactly and only paying for a restock can change it.
 */
export const rollStoreRelics = (
  seed: number,
  act: number,
  rerolls: number,
  owned: readonly string[],
  slots = 2,
): string[] => {
  const roll = makeRoller(seed + rerolls * 9173 + 4441);
  const ownedSet = new Set(owned);
  const bands: RelicRarity[] = act <= 1 ? ['common'] : ['common', 'rare'];
  const pool = REWARDABLE.filter((r) => bands.includes(r.rarity) && !ownedSet.has(r.id));
  const picks = roll.shuffle(pool).slice(0, slots).map((r) => r.id);
  // The cursed shelf. Always present, always exactly one: a shop that sometimes has a
  // curse and sometimes does not is a shop the player cannot plan a visit around.
  const curse = roll.shuffle(CURSED_RELICS.filter((r) => !ownedSet.has(r.id)))[0];
  if (curse) picks.push(curse.id);
  return picks;
};

/**
 * The act a run is SCALED against, once relics have had their say.
 *
 * Floored at 1: act 0 would run `actScale` below its own baseline and hand out enemies
 * weaker than the ones act 1 is balanced around, which is a different and much worse
 * thing than "an easier run". Read by both halves of the trade — `rollEncounter` for
 * enemy HP and deck size, `combatReward` for the payout — so an easier fight is always
 * a poorer one and the discount can never be taken without the price.
 */
export const effectiveAct = (act: number, mods: AggregateMods): number =>
  Math.max(1, act + mods.actDelta);
