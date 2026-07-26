/**
 * Relic definitions — run-long passive charms that give a run its identity.
 *
 * Every relic is "cheap-tier": it only declares typed `RelicMods` fields that the
 * existing Adventure seams already read (run start, encounter HP, post-init state,
 * economy). No relic runs arbitrary code and none needs an engine change, so relics
 * stay pure and are persisted by id alone.
 */
import type { Element, EffectGrantKeywords } from '@cards/schema';

export type RelicRarity = 'common' | 'rare' | 'boss';

/** Typed modifiers a relic contributes; all optional, folded by aggregateMods. */
export interface RelicMods {
  /** One-shot: extra coins at run start. */
  startCoinsDelta?: number;
  /**
   * One-shot on claim: permanently raise the run's leader max HP (and heal by the same
   * amount, so it's a real cushion, not just a higher ceiling). Even values only, to
   * keep the Signature threshold — half of max — a clean integer.
   */
  maxHpDelta?: number;
  /** Every fight: shift enemy leader HP (negative = easier). */
  enemyHpDelta?: number;
  /**
   * Every fight: PERSISTENT additive discount to your card costs by type (negative =
   * cheaper). Applied to `costBase`, which survives turn-end — so unlike an in-game
   * costMod it lasts the whole fight. Each field supports an archetype: `unit` → Swarm/
   * Aggro bodies, `spell` → burn/removal, `foundation` → Combo/Guardian, `environment`
   * → Lane Control.
   */
  costReduction?: Partial<{ unit: number; spell: number; foundation: number; environment: number }>;
  /**
   * Element-conditional stat buffs to YOUR units/foundations (spells/environments have
   * no stats to buff, so they're ignored). Each entry buffs every owned card of that
   * element, for the whole fight — materialized as transient stat enhancements, so it
   * stacks with real enhancements and applies to every draw, not just the opening hand.
   * A single relic may list several elements to give "different buffs per element".
   */
  elementBuffs?: { element: Element; attack?: number; hp?: number }[];
  /**
   * Element-conditional KEYWORD grants to YOUR units/foundations — same seam as
   * `elementBuffs` (transient `keyword` enhancements), so player-only and whole-fight.
   * A unit that already has the keyword keeps its own (stronger) value. Grant a keyword
   * from the element's toolkit (see docs/card-creation-guide.txt): Fire→battleReady,
   * Water→taunt/sniper, Nature→spike/growth, Earth→tough. (Aquatic is NOT in the
   * grantable subset — it's special-cased in the engine — so Water grants use Taunt.)
   */
  elementKeywords?: { element: Element; keywords: EffectGrantKeywords }[];
  /** Every fight: raise one of your element banking caps. */
  elementCapDelta?: { element: Element; amount: number };
  /**
   * Every fight: begin with element energy already banked. `'leader'` targets the
   * leader's own element, so one relic supports every leader's ramp plan. Clamped to
   * the (possibly relic-boosted) element cap. Persists — the bank is never auto-cleared.
   */
  startBank?: { element: Element | 'leader'; amount: number };
  /**
   * Every fight: extra universal energy on turn 1 only (a tempo burst — spent or lost
   * that turn, like any unbanked energy). Deliberately NOT a cost discount: additive
   * costMods are wiped at the first turn-end, so they can't carry a run-long passive.
   */
  startEnergyBonus?: number;
  /** Every fight: extra opening-hand draws. */
  startingHandDelta?: number;
  /** Every fight: pre-place a foundation in a lane ('random' = any foundation). */
  prePlaceFoundation?: string | 'random';
  /** Every fight: start with your signature card already in hand. */
  startWithSignature?: boolean;
  /** Store buy-price multiplier (0.75 = 25% off). */
  storeBuyMult?: number;
  /** Store sell-price multiplier (1.25 = +25%). */
  storeSellMult?: number;
  /** Enhancement price multiplier. */
  enhanceDiscount?: number;
  /** Extra store offer slots. */
  extraStoreSlots?: number;
}

export interface Relic {
  id: string;
  name: string;
  icon: string;
  blurb: string;
  rarity: RelicRarity;
  mods: RelicMods;
}

export const RELICS: Relic[] = [
  // --- common ---
  { id: 'ember-cache', name: 'Ember Cache', icon: '🔥', blurb: 'Enemies begin every battle with 4 less HP.', rarity: 'common', mods: { enemyHpDelta: -4 } },
  { id: 'caltrops', name: 'Scattered Caltrops', icon: '🌵', blurb: 'Enemies begin every battle with 2 less HP.', rarity: 'common', mods: { enemyHpDelta: -2 } },
  { id: 'veterans-draw', name: "Veteran's Draw", icon: '🎴', blurb: 'Start each battle with 1 extra card in hand.', rarity: 'common', mods: { startingHandDelta: 1 } },
  { id: 'iron-ration', name: 'Iron Ration', icon: '🥖', blurb: 'Begin each battle with +1 energy on your first turn.', rarity: 'common', mods: { startEnergyBonus: 1 } },
  { id: 'merchants-seal', name: "Merchant's Seal", icon: '🏷', blurb: 'Store cards cost 25% less; sell for 25% more.', rarity: 'common', mods: { storeBuyMult: 0.75, storeSellMult: 1.25 } },
  { id: 'salvagers-kit', name: "Salvager's Kit", icon: '🧰', blurb: 'Sell cards at stores for 50% more.', rarity: 'common', mods: { storeSellMult: 1.5 } },
  { id: 'coin-pouch', name: 'Heavy Coin Pouch', icon: '💰', blurb: 'Gain 40 coins the moment you claim it.', rarity: 'common', mods: { startCoinsDelta: 40 } },
  { id: 'whetstone', name: 'Traveling Whetstone', icon: '🪓', blurb: 'Enhancements cost 20% less.', rarity: 'common', mods: { enhanceDiscount: 0.8 } },
  { id: 'wide-market', name: 'Wide Market', icon: '🛍', blurb: 'Stores offer 2 additional cards.', rarity: 'common', mods: { extraStoreSlots: 2 } },
  // --- rare ---
  { id: 'banked-reserves-fire', name: 'Ashen Reservoir', icon: '⛲', blurb: '+1 to your Fire banking cap.', rarity: 'rare', mods: { elementCapDelta: { element: 'fire', amount: 1 } } },
  { id: 'banked-reserves-water', name: 'Tidal Reservoir', icon: '🌊', blurb: '+1 to your Water banking cap.', rarity: 'rare', mods: { elementCapDelta: { element: 'water', amount: 1 } } },
  { id: 'banked-reserves-nature', name: 'Verdant Reservoir', icon: '🌱', blurb: '+1 to your Nature banking cap.', rarity: 'rare', mods: { elementCapDelta: { element: 'nature', amount: 1 } } },
  { id: 'banked-reserves-earth', name: 'Stone Reservoir', icon: '🪨', blurb: '+1 to your Earth banking cap.', rarity: 'rare', mods: { elementCapDelta: { element: 'earth', amount: 1 } } },
  // Ramp support: a head start in the leader's own element every fight. Pairs with the
  // banking-cap reservoirs for a dedicated ramp line.
  { id: 'deep-cistern', name: 'Deep Cistern', icon: '🛢', blurb: "Start each battle with 2 energy banked in your leader's element.", rarity: 'rare', mods: { startBank: { element: 'leader', amount: 2 } } },
  { id: 'runic-battery', name: 'Runic Battery', icon: '🔋', blurb: 'Begin each battle with +2 energy on your first turn.', rarity: 'rare', mods: { startEnergyBonus: 2 } },
  { id: 'siege-ram', name: 'Siege Ram', icon: '🐏', blurb: 'Enemies begin every battle with 6 less HP.', rarity: 'rare', mods: { enemyHpDelta: -6 } },
  { id: 'quartermasters-ledger', name: "Quartermaster's Ledger", icon: '📒', blurb: 'Start each battle with 1 extra card; store cards cost 15% less.', rarity: 'rare', mods: { startingHandDelta: 1, storeBuyMult: 0.85 } },
  { id: 'standing-stone', name: 'Standing Stone', icon: '🗿', blurb: 'Start each battle with a random foundation already in play.', rarity: 'rare', mods: { prePlaceFoundation: 'random' } },
  { id: 'prophets-coin', name: "Prophet's Coin", icon: '🔮', blurb: 'Start each battle with your signature card in hand.', rarity: 'rare', mods: { startWithSignature: true } },
  // Archetype cost-reduction line (persistent — lasts the whole fight, every fight).
  { id: 'drill-sergeant', name: 'Drill Sergeant', icon: '🎖', blurb: 'Your units cost 1 less energy.', rarity: 'rare', mods: { costReduction: { unit: -1 } } },
  { id: 'spell-focus', name: 'Spell Focus', icon: '🎇', blurb: 'Your spells cost 1 less energy.', rarity: 'rare', mods: { costReduction: { spell: -1 } } },
  { id: 'master-mason', name: 'Master Mason', icon: '⚒', blurb: 'Your foundations cost 1 less energy.', rarity: 'rare', mods: { costReduction: { foundation: -1 } } },
  { id: 'cartographers-compass', name: "Cartographer's Compass", icon: '🧭', blurb: 'Your environments cost 1 less energy.', rarity: 'rare', mods: { costReduction: { environment: -1 } } },
  { id: 'oaken-heart', name: 'Oaken Heart', icon: '🌰', blurb: 'Permanently gain 4 max HP (and heal 4) when claimed.', rarity: 'rare', mods: { maxHpDelta: 4 } },
  // Element-conditional stat buffs to your own units/foundations (new: element-scoped).
  { id: 'emberbrand', name: 'Emberbrand', icon: '🔥', blurb: 'Your Fire units gain +1 attack.', rarity: 'rare', mods: { elementBuffs: [{ element: 'fire', attack: 1 }] } },
  { id: 'tidal-ward', name: 'Tidal Ward', icon: '🌊', blurb: 'Your Water units gain +1 HP.', rarity: 'rare', mods: { elementBuffs: [{ element: 'water', hp: 1 }] } },
  { id: 'bramble-fang', name: 'Bramble Fang', icon: '🌿', blurb: 'Your Nature units gain +1 attack.', rarity: 'rare', mods: { elementBuffs: [{ element: 'nature', attack: 1 }] } },
  { id: 'granite-skin', name: 'Granite Skin', icon: '🪨', blurb: 'Your Earth units gain +1 HP.', rarity: 'rare', mods: { elementBuffs: [{ element: 'earth', hp: 1 }] } },
  // Element-conditional keyword grants (each element's signature keyword).
  { id: 'warpaint', name: 'War Paint', icon: '🔥', blurb: 'Your Fire units gain Battle Ready (can attack the turn they enter).', rarity: 'rare', mods: { elementKeywords: [{ element: 'fire', keywords: { battleReady: true } }] } },
  { id: 'bedrock-hide', name: 'Bedrock Hide', icon: '🪨', blurb: 'Your Earth units gain Tough 1 (reduce incoming damage by 1).', rarity: 'rare', mods: { elementKeywords: [{ element: 'earth', keywords: { tough: 1 } }] } },
  // --- boss ---
  { id: 'war-drums', name: 'War Drums', icon: '🥁', blurb: 'Enemies begin every battle with 8 less HP.', rarity: 'boss', mods: { enemyHpDelta: -8 } },
  { id: 'avalanche-horn', name: 'Avalanche Horn', icon: '📯', blurb: 'Enemies begin every battle with 12 less HP.', rarity: 'boss', mods: { enemyHpDelta: -12 } },
  { id: 'full-quiver', name: 'Full Quiver', icon: '🏹', blurb: 'Start each battle with 2 extra cards in hand.', rarity: 'boss', mods: { startingHandDelta: 2 } },
  { id: 'endless-satchel', name: 'Endless Satchel', icon: '🎒', blurb: 'Start each battle with 3 extra cards in hand.', rarity: 'boss', mods: { startingHandDelta: 3 } },
  // Ramp payoff: a big banked head start every fight. The ramp line's capstone.
  { id: 'worldtree-seed', name: 'World-Tree Seed', icon: '🌳', blurb: "Start each battle with 4 energy banked in your leader's element.", rarity: 'boss', mods: { startBank: { element: 'leader', amount: 4 } } },
  { id: 'titans-girdle', name: "Titan's Girdle", icon: '🏋', blurb: 'Permanently gain 10 max HP (and heal 10) when claimed.', rarity: 'boss', mods: { maxHpDelta: 10 } },
  { id: 'quartermaster-general', name: 'Quartermaster General', icon: '🎗', blurb: 'Your units and spells cost 1 less energy.', rarity: 'boss', mods: { costReduction: { unit: -1, spell: -1 } } },
  // Showcase of the element-conditional buff: a different bonus per element.
  { id: 'prismatic-core', name: 'Prismatic Core', icon: '🌈', blurb: 'Your units gain a buff by element: Fire +1 atk, Water +1 HP, Nature +1/+1, Earth +2 HP.', rarity: 'boss', mods: { elementBuffs: [
    { element: 'fire', attack: 1 },
    { element: 'water', hp: 1 },
    { element: 'nature', attack: 1, hp: 1 },
    { element: 'earth', hp: 2 },
  ] } },
  // Keyword showcase: each element gains its signature keyword.
  { id: 'elemental-attunement', name: 'Elemental Attunement', icon: '🔯', blurb: 'Your units gain a keyword by element: Fire Battle Ready, Water Taunt, Nature Spike 1, Earth Tough 1.', rarity: 'boss', mods: { elementKeywords: [
    { element: 'fire', keywords: { battleReady: true } },
    { element: 'water', keywords: { taunt: true } },
    { element: 'nature', keywords: { spike: 1 } },
    { element: 'earth', keywords: { tough: 1 } },
  ] } },
];

const BY_ID = new Map(RELICS.map((r) => [r.id, r]));
export const relicById = (id: string): Relic | undefined => BY_ID.get(id);
