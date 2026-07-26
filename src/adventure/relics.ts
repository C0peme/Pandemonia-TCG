/**
 * Relic logic: fold owned relics into a single set of modifiers, apply the
 * fight-start ones to a freshly-built GameState, and roll relic choices for
 * elite/boss rewards. All pure — mirrors trials.ts's applyTrialToState.
 */
import type { Element, EffectGrantKeywords, FoundationCard } from '@cards/schema';
import type { Registry } from '@cards/registry';
import type { GameState, PlayerId } from '@engine/types';
import type { OwnedCard } from '@adventure/schema';
import { LANES, type LaneId } from '@engine/constants';
import { drawCard } from '@engine/draw';
import { makeFoundationUnit } from '@engine/board';
import { addCardToHand } from '@engine/hand';
import { makeRoller } from '@adventure/seed';
import { RELICS, relicById, type RelicRarity } from '@adventure/data/relics';

const PLAYER: PlayerId = 0;

/** The folded result of every owned relic's mods. */
export interface AggregateMods {
  startCoinsDelta: number;
  maxHpDelta: number;
  enemyHpDelta: number;
  elementCapDeltas: { element: Element; amount: number }[];
  elementBuffs: { element: Element; attack?: number; hp?: number }[];
  elementKeywords: { element: Element; keywords: EffectGrantKeywords }[];
  costReduction: { unit: number; spell: number; foundation: number; environment: number };
  startBanks: { element: Element | 'leader'; amount: number }[];
  startEnergyBonus: number;
  startingHandDelta: number;
  prePlaceFoundations: (string | 'random')[];
  startWithSignature: boolean;
  storeBuyMult: number;
  storeSellMult: number;
  enhanceDiscount: number;
  extraStoreSlots: number;
}

export const emptyMods = (): AggregateMods => ({
  startCoinsDelta: 0,
  maxHpDelta: 0,
  enemyHpDelta: 0,
  elementCapDeltas: [],
  elementBuffs: [],
  elementKeywords: [],
  costReduction: { unit: 0, spell: 0, foundation: 0, environment: 0 },
  startBanks: [],
  startEnergyBonus: 0,
  startingHandDelta: 0,
  prePlaceFoundations: [],
  startWithSignature: false,
  storeBuyMult: 1,
  storeSellMult: 1,
  enhanceDiscount: 1,
  extraStoreSlots: 0,
});

/** Fold a set of owned relic ids into one AggregateMods (unknown ids ignored). */
export const aggregateMods = (relicIds: readonly string[]): AggregateMods => {
  const agg = emptyMods();
  for (const id of relicIds) {
    const relic = relicById(id);
    if (!relic) continue;
    const m = relic.mods;
    if (m.startCoinsDelta) agg.startCoinsDelta += m.startCoinsDelta;
    if (m.maxHpDelta) agg.maxHpDelta += m.maxHpDelta;
    if (m.enemyHpDelta) agg.enemyHpDelta += m.enemyHpDelta;
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
    if (m.startingHandDelta) agg.startingHandDelta += m.startingHandDelta;
    if (m.prePlaceFoundation) agg.prePlaceFoundations.push(m.prePlaceFoundation);
    if (m.startWithSignature) agg.startWithSignature = true;
    if (m.storeBuyMult !== undefined) agg.storeBuyMult *= m.storeBuyMult;
    if (m.storeSellMult !== undefined) agg.storeSellMult *= m.storeSellMult;
    if (m.enhanceDiscount !== undefined) agg.enhanceDiscount *= m.enhanceDiscount;
    if (m.extraStoreSlots) agg.extraStoreSlots += m.extraStoreSlots;
  }
  return agg;
};

/** Lanes with nothing on the player's side, preferred order for pre-placing. */
const emptyPlayerLanes = (state: GameState): LaneId[] =>
  LANES.filter((lane) => {
    const l = state.players[PLAYER].lanes[lane];
    return !l.front && !l.back && !l.standaloneFoundation;
  });

/**
 * Apply the fight-start relic mods to a freshly-initialized encounter state
 * (player = seat 0). enemyHpDelta is handled earlier in the encounter builder.
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

  // Extra opening draws.
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

/** 3 distinct unowned relics of a rarity band, seeded. Falls back across bands if short. */
export const rollRelicChoices = (seed: number, bands: RelicRarity[], owned: readonly string[], count = 3): string[] => {
  const roll = makeRoller(seed);
  const ownedSet = new Set(owned);
  const inBand = RELICS.filter((r) => bands.includes(r.rarity) && !ownedSet.has(r.id));
  const rest = RELICS.filter((r) => !bands.includes(r.rarity) && !ownedSet.has(r.id));
  const picks = [...roll.shuffle(inBand), ...roll.shuffle(rest)].slice(0, count);
  return picks.map((r) => r.id);
};
