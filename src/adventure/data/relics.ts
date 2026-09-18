/**
 * Relic definitions — run-long passives that give a run its identity.
 *
 * ONE system, ONE word. The UI used to call these "charms" in five player-facing strings
 * and "relics" everywhere else, which read as two mechanics that happened to behave
 * identically. They were always the same table.
 *
 * ---------------------------------------------------------------------------------
 * WHAT EACH RARITY MEANS: how much of the game a relic is allowed to touch
 * ---------------------------------------------------------------------------------
 * Rarity is not magnitude, and it is not "how much drawback comes attached" either.
 * Both of those were tried. It is now SCOPE — how much of the run's state and rules the
 * effect is permitted to manipulate — which is the model Honkai: Star Rail's curios use,
 * and the reason a 1-star curio there can still be the right pick over a 3-star.
 *
 *   common — ONE small thing, always-on, or one SITUATIONAL thing that is genuinely
 *            strong when its situation holds. Touches a single number.
 *
 *   rare   — a whole SYSTEM, or several effects combined: an archetype's costs, an
 *            element's keyword toolkit, a lane rule, a build-around that pays out for
 *            steering the run a particular way.
 *
 *   boss   — REWRITES THE RUN, and typically SCALES with something else the run has
 *            accumulated (see `RelicScale`): relics carried, coins hoarded, acts
 *            cleared, HP already lost, cards already thinned. A boss relic should make
 *            the rest of your inventory mean more than it did a moment ago.
 *
 *   cursed — real power with a REAL PRICE. This band exists so the three above do not
 *            have to carry one. It is not a fourth step on a power ladder: a cursed
 *            relic is a trade, and whether it is good is a question about this run.
 *
 * Two consequences worth stating rather than rediscovering:
 *
 * - **Boss relics never carry a drawback.** They are handed out once or twice a run,
 *   after a fight the player already paid for in HP; taxing that reward again is taxing
 *   the same win twice. `relicShapes.test.ts` enforces it.
 * - **Cursed relics are never rolled as a reward.** They are bought — see the store's
 *   cursed shelf in `economy.ts` — so taking one is always an act, never something that
 *   happens to a run. `rollRelicChoices` filters the band out of every reward path.
 * - **A curse can always be OVERCOME, never simply endured.** It reads as either a
 *   temporary setback natural play repairs (a max-HP loss that Oaken Heart, a Mend, or
 *   the next act's `ACT_MAX_HP_GAIN` grows back) or a standing challenge the player
 *   plays around for the rest of the run (a permanent cost curve, a harsher enemy
 *   multiplier) — never a system switched off. Relics that permanently disabled Rest,
 *   the altar or the shop (Hollow Lantern, Dead Anvil, The Long Column) were removed for
 *   exactly this reason: "this system no longer exists for you" cannot be overcome by
 *   any amount of skill, so no benefit on the other side of it was ever worth the risk.
 *   `MAX_HP_LOSS`/`MAX_ENEMY_HP_PRICE`/`MIN_HEAL_BONUS` cap how far a degree-priced curse
 *   may go, so a future one cannot recreate the same failure by increments instead.
 * - **No relic rewrites a lane for BOTH sides.** Symmetric board rewrites read as a wash
 *   rather than as power, and seven relics shaped that way made two whole bands feel
 *   interchangeable. Shared-Environment rules still exist — as Trial twists, where the
 *   player picks the rule knowingly and is paid for the severity of it.
 *
 * ---------------------------------------------------------------------------------
 * A relic still declares only typed `RelicMods` fields that existing Adventure seams
 * read (run start, encounter HP, post-init state, the run layer, the economy). No relic
 * runs arbitrary code, so relics stay pure and are persisted by id alone. Exactly TWO
 * engine fields exist for this table: `PlayerState.energyPerTurn` and
 * `GameState.autopilot`.
 */
import type { Element, CardElement, EffectGrantKeywords } from '@cards/schema';

export type RelicRarity = 'common' | 'rare' | 'boss' | 'cursed';

/**
 * A quantity a boss relic can SCALE off — the mechanism behind "rewrites the run, and
 * makes the rest of your inventory mean more".
 *
 * Every source is something the run already tracks and the player already watches, so a
 * scaling relic reads as a reason to do more of a thing you were doing anyway (hoard,
 * thin, collect, survive) rather than as a number that happens to be bigger.
 */
export type RelicScaleSource =
  /** Relics carried, spent ones included. */
  | 'relics'
  /** Coins in the purse RIGHT NOW — so spending genuinely weakens the relic. */
  | 'coins'
  /** Cards owned. */
  | 'deckSize'
  /** Acts cleared (1-based act number). */
  | 'act'
  /** Enhancements worked into owned cards. */
  | 'enhancements'
  /** HP below maximum — a comeback source. */
  | 'missingHp';

/**
 * How a scaling relic converts a run quantity into STEPS of its `mods`.
 *
 * `steps = clamp(floor(max(0, value - from) / per), 0, maxSteps)`, or with `invert`,
 * `floor(max(0, from - value) / per)` — which is how a relic rewards a quantity going
 * DOWN (a thinned deck) using the same arithmetic as one rewarding it going up.
 *
 * `maxSteps` is REQUIRED, not optional: `coins` and `deckSize` are unbounded, and an
 * uncapped multiplier off either one is how a relic quietly ends the difficulty curve.
 */
export interface RelicScale {
  source: RelicScaleSource;
  /** Threshold to measure from (default 0); with `invert`, the value counted DOWN from. */
  from?: number;
  /** One step per this many units of the source. */
  per: number;
  /** Hard cap on steps. Required — see above. */
  maxSteps: number;
  /** Count downward from `from` instead of upward. */
  invert?: boolean;
  /** Folded once per step, on top of the relic's own `mods`. */
  mods: RelicMods;
}

/**
 * A gate on when a relic's `mods` apply at all.
 *
 * Nothing in the old table cared what the player's deck looked like, so no relic ever
 * told you what to draft, thin or keep — every pick was "which number goes up". A
 * condition turns a relic into a GOAL: Lean Ledger is a reason to sell, Monochrome
 * Banner is a reason to stay in one element, Hoarder's Crest is a reason to take the
 * relic node. Evaluated against a `RelicContext` (see relics.ts) at the moment the mods
 * are folded, so it is re-checked every fight rather than latched on claim.
 *
 * ALL declared fields must hold (AND, not OR).
 */
export interface RelicCondition {
  /** Owned-card count at or below this. */
  deckAtMost?: number;
  /** Owned-card count at or above this. */
  deckAtLeast?: number;
  /** Every owned card shares one card element (`neutral` counts as its own element). */
  monoElement?: boolean;
  /** This many relics owned (counting this one). */
  relicsAtLeast?: number;
  /** Entering the battle at or below half of max HP. */
  wounded?: boolean;
  /**
   * At least this many owned cards of each named element — HSR's Divergent Universe
   * "Equations", which activate only once you hold enough Blessings of two named Paths.
   *
   * `monoElement` was the only deck-composition axis the table had, and it asks for
   * PURITY, which is a single, very demanding plan that most runs abandon early. This
   * asks for a MIX instead: "six Fire and six Water" is a target a drafting run can
   * actually steer toward from the middle of act 1, and it makes two-element decks —
   * the shape most real decks already are — into something a relic can reward.
   */
  elementAtLeast?: { element: CardElement; count: number }[];
}

/** Typed modifiers a relic contributes; all optional, folded by aggregateMods. */
export interface RelicMods {
  // --- ONE-SHOT, resolved on claim -------------------------------------------------
  /** Extra coins the moment it is claimed. */
  startCoinsDelta?: number;
  /**
   * Coins gained on claim as a PERCENTAGE of the purse at that moment (0.5 = +50%).
   *
   * Every other coin effect in the table is a flat number, which means a relic is worth
   * the same to a broke run and a rich one and never asks a question about timing. This
   * one is worth nothing when you are poor and a fortune when you are not, so the
   * decision it creates is *when* to claim it — the same tension the Hoard-Ledger's
   * scaling creates, resolved in a single moment instead of continuously.
   */
  coinsPercent?: number;
  /**
   * Permanently raise the run's leader max HP (and heal by the same amount, so it's a
   * real cushion, not just a higher ceiling). Even values only, to keep the Signature
   * threshold — half of max — a clean integer. May be NEGATIVE: that is the price half
   * of a boss-tier trade.
   */
  maxHpDelta?: number;
  /** Temporary HP granted immediately, above `maxHp`. */
  tempHpDelta?: number;
  /**
   * Burn this many cards out of the deck on claim — the PLAYER chooses which, via
   * `RunState.pendingTrim` (see there).
   *
   * Selection alone is not enough to justify a BOSS-tier slot: a shop already lets you
   * choose which cards to sell, for coins, on demand, with no node cost. A relic that
   * only removes cards is strictly worse than that free service the moment the run has
   * a shop to walk to. `trimCoinsPerCard`/`trimBuffPerCard` are what a shop trade cannot
   * offer — coins AND permanent power on the SURVIVING deck, resolved without spending a
   * node visit — and are what make burning here a genuinely different transaction from
   * selling, not a worse copy of it. Never cuts below `ECON.MIN_DECK_SIZE`.
   */
  trimDeck?: number;
  /** Coins granted per card actually burned by a `trimDeck` payload, on top of the removal. */
  trimCoinsPerCard?: number;
  /** A random SURVIVING card permanently buffed by this much, per card burned. */
  trimBuffPerCard?: { attack: number; hp: number };
  /**
   * Spend the ENTIRE purse on claim, converting it into permanent power on every
   * eligible owned card. `steps = min(maxSteps, floor(coins / perCoins))`; only the
   * spent portion (`steps * perCoins`) leaves the purse, so a partial remainder below
   * one step is kept rather than lost. Every eligible card gains `steps * attack` /
   * `steps * hp`, applied once as a single enhancement entry — not per step — so the
   * whole payload is one dated grant rather than a stack of identical ones.
   *
   * The one place in the table where being RICH is itself the price: this is worth
   * nothing to a broke run and a genuine transformation to a hoarding one, which is what
   * makes claiming it a decision about timing rather than a free upgrade.
   */
  spendAllForBuff?: { perCoins: number; attack: number; hp: number; maxSteps: number };
  /** Permanently buff N random owned units/foundations on claim. */
  temperRandom?: { count: number; attack: number; hp: number };
  /** Named cards added to the deck on claim (the junk half of a bargain, or a gift). */
  grantCards?: string[];

  // --- EVERY FIGHT -----------------------------------------------------------------
  /**
   * Scale enemy leader HP. Multiplicative, NOT a flat delta — deliberately the OPPOSITE
   * convention to the player-side HP fields (`maxHpDelta`, `tempHpDelta`), which stay flat
   * numbers so their cost is a known quantity the player can plan to mitigate. A
   * percentage cut on the enemy scales with the fight; a percentage cost on the player
   * would scale with how well the run is going, punishing exactly the runs that invested
   * in HP.
   *
   * These were authored as flat cuts (-4, -8, -14) against an enemy pool of 12-20 HP.
   * When the HP curve was rebuilt around a small `normalHp` (8-16 early), those numbers
   * stopped being a discount and became a delete button. A multiplier keeps a relic's
   * promise proportional to the fight.
   *
   * ABOVE 1 is legal and is a PRICE, not a bug: Covenant Stone buys a permanent energy
   * advantage by making every enemy tougher for the rest of the run. Bounded either side
   * by `relics.test.ts` so no combination can delete an enemy or wall the run.
   */
  enemyHpMult?: number;
  /**
   * PERSISTENT additive discount to your card costs by type (negative = cheaper).
   * Applied to `costBase`, which survives turn-end — so unlike an in-game costMod it
   * lasts the whole fight. Each field supports an archetype: `unit` → Swarm/Aggro
   * bodies, `spell` → burn/removal, `foundation` → Combo/Guardian, `environment` → Lane
   * Control.
   */
  costReduction?: Partial<{ unit: number; spell: number; foundation: number; environment: number }>;
  /**
   * Element-conditional stat buffs to YOUR units/foundations (spells/environments have
   * no stats to buff, so they're ignored). Materialized as transient stat enhancements,
   * so they stack with real enhancements and apply to every draw, not just the opening
   * hand.
   *
   * Keyed by `CardElement`, not `Element` — so `neutral` is addressable. It previously
   * was not, which quietly excluded an entire card CLASS (see `CARD_ELEMENTS`: neutral is
   * not a fifth element, it is the pool's colourless common ground) from every
   * element-scoped relic in the game, including the "every element" showcases.
   */
  elementBuffs?: { element: CardElement; attack?: number; hp?: number }[];
  /**
   * Element-conditional KEYWORD grants to YOUR units/foundations — same seam as
   * `elementBuffs`. A unit that already has the keyword keeps its own (stronger) value.
   * Grant from the element's toolkit (docs/card-creation-guide.txt): Fire→battleReady,
   * Water→taunt/sniper, Nature→spike/growth, Earth→tough. Aquatic is NOT in the
   * grantable subset (it is engine-special-cased), so no relic can open the Water lane;
   * that rule belongs to Environments, and therefore to Trial twists rather than here.
   */
  elementKeywords?: { element: CardElement; keywords: EffectGrantKeywords }[];
  /** Raise one of your element banking caps. */
  elementCapDelta?: { element: Element; amount: number };
  /**
   * Begin with element energy already banked. `'leader'` targets the leader's own
   * element, so one relic supports every leader's ramp plan. Clamped to the
   * (possibly relic-boosted) element cap.
   */
  startBank?: { element: Element | 'leader'; amount: number };
  /**
   * Extra universal energy on turn 1 ONLY (a tempo burst — spent or lost that turn).
   * Deliberately NOT a cost discount: additive costMods are wiped at the first turn-end.
   */
  startEnergyBonus?: number;
  /**
   * Extra universal energy EVERY turn, permanently — the single largest thing a relic can
   * give, and therefore boss-only and always priced.
   *
   * Turn energy equals the ROUND NUMBER, so +1 is worth far more early (round 1: 1 → 2,
   * a doubling) than late. That front-loading is why every relic carrying it pays a
   * permanent, run-layer price rather than an in-fight one. `aggregateMods` caps the
   * total (see ENERGY_PER_TURN_CAP) so collecting the whole cluster cannot compound into
   * an unloseable run.
   */
  energyPerTurn?: number;
  /** Extra card DRAWN every turn (rides the existing `turnCardMod` seam). */
  turnDraw?: number;
  /** Cards milled from your own deck every turn — the price half of a draw engine. */
  turnMill?: number;
  /** Extra opening-hand draws. */
  startingHandDelta?: number;
  /**
   * Raises the HAND CAP. Pairs with `startingHandDelta` — cards drawn into a full
   * ten-card hand are discarded on the spot, so a relic that hands you cards without room
   * to hold them reads as broken.
   *
   * NEGATIVE is legal, and CURSED-ONLY, floored at `MIN_HAND_CAP_DELTA`. A tight hand is
   * the most violent price in the table: with one draw a turn you begin discarding live
   * cards, so a relic charging it has to hand back something that changes the game
   * (a whole-deck discount, a permanent draw engine), not a marginal number. Both halves
   * of that rule — the band and the floor — are asserted in `relicShapes.test.ts`.
   */
  handCapDelta?: number;
  /** Pre-place a foundation in a lane ('random' = any foundation). */
  prePlaceFoundation?: string | 'random';
  /** Start each battle with your signature card already in hand. */
  startWithSignature?: boolean;

  // --- ECONOMY ---------------------------------------------------------------------
  /** Store buy-price multiplier (0.75 = 25% off). */
  storeBuyMult?: number;
  /** Store sell-price multiplier (1.25 = +25%). */
  storeSellMult?: number;
  /** Enhancement reroll / attune price multiplier. */
  enhanceDiscount?: number;
  /** Extra store offer slots. */
  extraStoreSlots?: number;

  // --- RUN LAYER (read by run.ts between fights) ------------------------------------
  /** Added to the post-battle heal, every win. */
  victoryHealBonus?: number;
  /** Added to a Rest Site's heal (and Kindle's). */
  restHealBonus?: number;
  /** Cards offered on a combat reward screen. NEGATIVE is a boss-tier price. */
  extraCardChoices?: number;
  /** Raises the overheal ceiling multiplier — a bigger temporary-HP reservoir. */
  overhealBonus?: number;
  /** Coins earned per battle won, on top of the node's reward. */
  coinsPerWin?: number;
  /**
   * Coins earned per point of HP lost in the battle just won. Rewards playing
   * aggressively rather than conservatively — the coin value of "attrition" (this
   * codebase's own word for the run's core resource) is otherwise invisible; this makes
   * it visible and, for a run that leans into taking hits, genuinely profitable.
   * Resolved once per win, from the HP lost BEFORE the post-battle heal is applied.
   */
  coinsPerHpLost?: number;
  /**
   * Multiplies the FINAL coin reward from a win (the node's own payout, Trial-scaled,
   * BEFORE `coinsPerWin` is added). Every other coin field in the table is additive, so
   * is worth the same flat number to a run three nodes in and a run three acts in; this
   * is the one field that keeps pace with the run's own payout curve, and the one that
   * compounds with a stacked `coinsPerWin` rather than competing with it.
   */
  coinsEarnedMult?: number;
  /**
   * Shift the ACT the run is scaled against — negative makes the whole game easier.
   *
   * `actScale` (encounters.ts) is `1.13^(act-1)` and drives both enemy HP and enemy deck
   * size, so an act is the single biggest difficulty dial in Adventure. This moves the
   * dial itself rather than a number downstream of it: at `-2`, act 5 fights like act 3.
   *
   * It is deliberately applied to the COIN REWARD as well, and that is the whole price:
   * `combatReward` also scales on act, so a run that fights two acts easier is also paid
   * two acts poorer. The trade prices itself and cannot drift, which is exactly what the
   * flat percentage costs elsewhere in this table cannot promise.
   *
   * NOT applied to boss SELECTION (`bossForAct`) — which boss guards act 5 is that act's
   * identity, and swapping it for an earlier one would quietly rewrite the run's story
   * as well as its numbers. Floored at act 1 by `effectiveAct`.
   */
  actDelta?: number;

  /**
   * AUTOPILOT: every Nth round, the AI plays your turn for you (`GameState.autopilot`).
   *
   * The one price in the table paid in AGENCY rather than in a resource, and the reason
   * it works is that it is perfectly predictable: rounds are on the HUD, so "round 4 is
   * theirs" is a fact you can build a hand around — hold the combo, dump the chaff, let
   * the commander swing with what is already on the board. It ruins a hand you planned
   * as though the turn were yours, which is exactly the skill it is asking for.
   *
   * Lower is harsher, so `aggregateMods` takes the MINIMUM across relics rather than
   * summing: two of these do not add up to a takeover every round and a half.
   *
   * NOTE ON PRICES GENERALLY: an earlier draft also had `noBuy`/`noRest`/`noEnhance`,
   * which permanently DELETED a node type from the run — see the file header's "a curse
   * can always be overcome" rule, and the `MAX_HP_LOSS`/`MAX_ENEMY_HP_PRICE`/
   * `MIN_HEAL_BONUS` caps that keep a degree-priced curse from drifting back into one.
   */
  autopilotEveryRounds?: number;

  // --- CONSUMABLE ------------------------------------------------------------------
  /**
   * The first battle you would LOSE, you survive at 1 HP instead — then the relic is
   * spent (`RunState.spentRelics`) and does nothing further.
   *
   * The first relic in the game whose value is not a number at all: it is permission to
   * take the route you would otherwise have avoided. Nothing else in the table changes
   * how the map is walked.
   */
  reviveOnce?: boolean;
  /**
   * Spent after the next battle it is carried into — Monster Train's "Divine" pattern.
   * Twice the power for one fight, which turns a store visit before a boss into a plan
   * rather than a discount.
   */
  consumedAfterBattle?: boolean;
}

export interface Relic {
  id: string;
  name: string;
  icon: string;
  blurb: string;
  rarity: RelicRarity;
  /** When the mods apply at all. Absent = always. */
  when?: RelicCondition;
  mods: RelicMods;
  /**
   * Boss-tier scaling: `scale.mods` folded once per step (see `RelicScale`). Additive
   * fields therefore multiply by the step count and multiplicative ones compound, which
   * is the desirable shape for both — `enemyHpMult: 0.96` over 8 steps is 0.72, a curve
   * that decelerates instead of racing to zero.
   */
  scale?: RelicScale;
  /**
   * A BROKEN relic: these mods apply INSTEAD of `mods` until the relic repairs itself,
   * which happens after `repairWins` battles won (`RunState.relicRepair`).
   *
   * Modelled on HSR's Error Code curios, and the single best fit for this table's own
   * rule that a curse must be possible to overcome. Everything in the `cursed` band
   * charges a price you carry for the whole run; a broken relic charges one you actively
   * work off, and the work is just *playing the game well*. That makes it the only price
   * in the table that gets SMALLER as the run goes on, and the only one whose whole
   * appeal is what happens after you have paid it.
   *
   * A relic declaring `broken` must also declare `repairWins`, and its repaired `mods`
   * have to be worth the wait — both asserted in `relicShapes.test.ts`.
   */
  broken?: RelicMods;
  /** Battles that must be WON before `broken` gives way to `mods`. */
  repairWins?: number;
}

/**
 * Hard ceiling on stacked `energyPerTurn`. Five boss relics grant +1 each (same power,
 * different prices — that is the point of the cluster), and a run that collects three of
 * them would be playing a different game from round one. Capping the SUM rather than
 * forbidding duplicates keeps every one of them a legitimate pick while making the third
 * copy redundant instead of run-breaking.
 */
export const ENERGY_PER_TURN_CAP = 2;

/**
 * Floor on a cursed relic's hand-cap price. `RULES.HAND_CAP` is 10, so -3 leaves 7 —
 * tight enough to force real discards from the mid-game, shallow enough that a hand can
 * still be held together around it. At -5 the fight stops being about your deck.
 */
export const MIN_HAND_CAP_DELTA = -3;

/**
 * Every OTHER proportionality cap a cursed price must respect. Named and exported so
 * `relicShapes.test.ts` can hold new content to them instead of relying on a reviewer to
 * eyeball a percentage — the failure mode that shipped Hollow Lantern and Dead Anvil
 * (a system permanently switched off) and, briefly, a -10 max-HP Brittle Crown and a
 * +25%-forever Covenant Stone. A curse is a challenge to play AROUND for the rest of the
 * run, never a war of attrition against a shrinking pool the player cannot rebuild:
 *
 * - `MAX_HP_LOSS` — a one-time max-HP price. -8 against a 30 HP leader is a genuine
 *   wound (over a quarter of the pool) but Oaken Heart, a Rest Mend, or simply clearing
 *   an act (`ECON.ACT_MAX_HP_GAIN`) all grow the pool back — "overcome through natural
 *   means", not a debt that only compounds.
 * - `MAX_ENEMY_HP_PRICE` — a permanent multiplier on every future enemy. This one is the
 *   most dangerous shape in the table because it compounds with the act curve itself
 *   (`actScale`) rather than sitting beside it, so even 15% is a real, run-long tax —
 *   which is exactly why nothing above it is permitted.
 * - `MIN_HEAL_BONUS` — a flat cut to a heal service (Rest or the post-battle heal). Both
 *   heals scale with max HP and neither floors at zero, so a cut at or past this floor
 *   would be indistinguishable from switching the service off outright for a fresh
 *   30 HP leader — precisely the failure this whole cap exists to prevent.
 */
export const MAX_HP_LOSS = -8;
export const MAX_ENEMY_HP_PRICE = 1.15;
export const MIN_HEAL_BONUS = -8;

export const RELICS: Relic[] = [
  // ===============================================================================
  // COMMON — ONE small thing, always-on; or one SITUATIONAL thing that is genuinely
  // strong when its situation holds. Touches a single number. Never a price.
  // ===============================================================================
  { id: 'ember-cache', name: 'Ember Cache', icon: '🔥', blurb: 'Enemies begin every battle with 10% less HP.', rarity: 'common', mods: { enemyHpMult: 0.9 } },
  { id: 'veterans-draw', name: "Veteran's Draw", icon: '🎴', blurb: 'Start each battle with 1 extra card in hand.', rarity: 'common', mods: { startingHandDelta: 1, handCapDelta: 1 } },
  { id: 'iron-ration', name: 'Iron Ration', icon: '🥖', blurb: 'Begin each battle with +1 energy on your first turn.', rarity: 'common', mods: { startEnergyBonus: 1 } },
  { id: 'merchants-seal', name: "Merchant's Seal", icon: '🏷', blurb: 'Store prices are 25% lower; you sell for 25% more.', rarity: 'common', mods: { storeBuyMult: 0.75, storeSellMult: 1.25 } },
  { id: 'salvagers-kit', name: "Salvager's Kit", icon: '🧰', blurb: 'Sell cards at stores for double.', rarity: 'common', mods: { storeSellMult: 2 } },
  { id: 'wide-market', name: 'Wide Market', icon: '🛍', blurb: 'Stores offer 2 additional cards.', rarity: 'common', mods: { extraStoreSlots: 2 } },
  { id: 'coin-pouch', name: 'Heavy Coin Pouch', icon: '💰', blurb: 'Gain 120 coins the moment you claim it.', rarity: 'common', mods: { startCoinsDelta: 120 } },
  { id: 'whetstone', name: 'Traveling Whetstone', icon: '🪓', blurb: 'Altar rerolls and attunement cost 40% less.', rarity: 'common', mods: { enhanceDiscount: 0.6 } },
  { id: 'travellers-flask', name: "Traveller's Flask", icon: '🧉', blurb: 'Gain 12 temporary HP the moment you claim it.', rarity: 'common', mods: { tempHpDelta: 12 } },
  { id: 'veterans-poultice', name: "Veteran's Poultice", icon: '🌿', blurb: 'Heal 4 more after every battle won.', rarity: 'common', mods: { victoryHealBonus: 4 } },
  { id: 'pilgrims-kettle', name: "Pilgrim's Kettle", icon: '🫖', blurb: 'Rest Sites (and Kindle) heal 6 more.', rarity: 'common', mods: { restHealBonus: 6 } },
  { id: 'tithe-box', name: 'Tithe Box', icon: '🧾', blurb: 'Gain 20 coins for every battle you win.', rarity: 'common', mods: { coinsPerWin: 20 } },
  { id: 'scouts-lantern', name: "Scout's Lantern", icon: '🏮', blurb: 'Battle rewards offer 1 extra card to choose from.', rarity: 'common', mods: { extraCardChoices: 1 } },
  { id: 'oaken-heart', name: 'Oaken Heart', icon: '🌰', blurb: 'Permanently gain 4 max HP (and heal 4) when claimed.', rarity: 'common', mods: { maxHpDelta: 4 } },
  // Single-element stat grants are the textbook COMMON: one number, always on, and only
  // worth anything if your deck happens to lean that way.
  { id: 'emberbrand', name: 'Emberbrand', icon: '🔥', blurb: 'Your Fire units gain +1 attack.', rarity: 'common', mods: { elementBuffs: [{ element: 'fire', attack: 1 }] } },
  { id: 'tidal-ward', name: 'Tidal Ward', icon: '🌊', blurb: 'Your Water units gain +1 HP.', rarity: 'common', mods: { elementBuffs: [{ element: 'water', hp: 1 }] } },
  { id: 'bramble-fang', name: 'Bramble Fang', icon: '🌿', blurb: 'Your Nature units gain +1 attack.', rarity: 'common', mods: { elementBuffs: [{ element: 'nature', attack: 1 }] } },
  { id: 'granite-skin', name: 'Granite Skin', icon: '🪨', blurb: 'Your Earth units gain +1 HP.', rarity: 'common', mods: { elementBuffs: [{ element: 'earth', hp: 1 }] } },
  // Neutral was unreachable until `elementBuffs` was widened to CardElement — an entire
  // card class no relic in the game could see.
  { id: 'grey-standard', name: 'Grey Standard', icon: '⚪', blurb: 'Your Neutral units gain +1/+1.', rarity: 'common', mods: { elementBuffs: [{ element: 'neutral', attack: 1, hp: 1 }] } },

  // --- SITUATIONAL commons: narrow, but strong where they land ---------------------
  // The other half of the 1-star bargain. These are deliberately capable of beating a
  // rare in the run that satisfies them, and of being dead weight in the run that does
  // not — which is what makes reading your own deck before picking one worth doing.
  {
    id: 'lean-satchel', name: 'Lean Satchel', icon: '🎒',
    blurb: 'While you own 18 cards or fewer: start each battle with 2 extra cards.',
    rarity: 'common', when: { deckAtMost: 18 }, mods: { startingHandDelta: 2, handCapDelta: 2 },
  },
  {
    id: 'ashen-token', name: 'Ashen Token', icon: '🪙',
    blurb: 'Enter a battle at half HP or less and you start with 2 extra cards.',
    rarity: 'common', when: { wounded: true }, mods: { startingHandDelta: 2, handCapDelta: 2 },
  },
  {
    id: 'quarry-marker', name: 'Quarry Marker', icon: '⛏',
    blurb: 'While you own 24 cards or more: gain 35 coins for every battle you win.',
    rarity: 'common', when: { deckAtLeast: 24 }, mods: { coinsPerWin: 35 },
  },
  {
    id: 'pilgrims-token', name: "Pilgrim's Token", icon: '🎗',
    blurb: 'While you carry 4 relics or more: heal 6 more after every battle won.',
    rarity: 'common', when: { relicsAtLeast: 4 }, mods: { victoryHealBonus: 6 },
  },

  // ===============================================================================
  // RARE — a whole SYSTEM, or several effects combined. Still never a price: the
  // decision a rare asks for is "does my run want this system", not "can I afford it".
  // ===============================================================================

  // --- the banking system ---
  { id: 'banked-reserves-fire', name: 'Ashen Reservoir', icon: '⛲', blurb: '+1 to your Fire banking cap.', rarity: 'rare', mods: { elementCapDelta: { element: 'fire', amount: 1 } } },
  { id: 'banked-reserves-water', name: 'Tidal Reservoir', icon: '🌊', blurb: '+1 to your Water banking cap.', rarity: 'rare', mods: { elementCapDelta: { element: 'water', amount: 1 } } },
  { id: 'banked-reserves-nature', name: 'Verdant Reservoir', icon: '🌱', blurb: '+1 to your Nature banking cap.', rarity: 'rare', mods: { elementCapDelta: { element: 'nature', amount: 1 } } },
  { id: 'banked-reserves-earth', name: 'Stone Reservoir', icon: '🪨', blurb: '+1 to your Earth banking cap.', rarity: 'rare', mods: { elementCapDelta: { element: 'earth', amount: 1 } } },
  { id: 'deep-cistern', name: 'Deep Cistern', icon: '🛢', blurb: "Start each battle with 3 energy banked in your leader's element.", rarity: 'rare', mods: { startBank: { element: 'leader', amount: 3 } } },
  { id: 'runic-battery', name: 'Runic Battery', icon: '🔋', blurb: 'Begin each battle with +2 energy on your first turn.', rarity: 'rare', mods: { startEnergyBonus: 2 } },

  // --- the opening ---
  { id: 'siege-ram', name: 'Siege Ram', icon: '🐏', blurb: 'Enemies begin every battle with 15% less HP.', rarity: 'rare', mods: { enemyHpMult: 0.85 } },
  { id: 'quartermasters-ledger', name: "Quartermaster's Ledger", icon: '📒', blurb: 'Start each battle with 1 extra card; store prices are 15% lower.', rarity: 'rare', mods: { startingHandDelta: 1, handCapDelta: 1, storeBuyMult: 0.85 } },
  { id: 'standing-stone', name: 'Standing Stone', icon: '🗿', blurb: 'Start each battle with a random foundation already in play.', rarity: 'rare', mods: { prePlaceFoundation: 'random' } },
  { id: 'prophets-coin', name: "Prophet's Coin", icon: '🔮', blurb: 'Start each battle with your signature card in hand.', rarity: 'rare', mods: { startWithSignature: true } },
  { id: 'second-wind', name: 'Second Wind', icon: '🌬', blurb: 'Draw 1 extra card every turn, and hold 2 more.', rarity: 'rare', mods: { turnDraw: 1, handCapDelta: 2 } },

  // --- an archetype's whole cost curve ---
  { id: 'drill-sergeant', name: 'Drill Sergeant', icon: '🎖', blurb: 'Your units cost 1 less energy.', rarity: 'rare', mods: { costReduction: { unit: -1 } } },
  { id: 'spell-focus', name: 'Spell Focus', icon: '🎇', blurb: 'Your spells cost 1 less energy.', rarity: 'rare', mods: { costReduction: { spell: -1 } } },
  { id: 'master-mason', name: 'Master Mason', icon: '⚒', blurb: 'Your foundations cost 1 less energy.', rarity: 'rare', mods: { costReduction: { foundation: -1 } } },
  { id: 'cartographers-compass', name: "Cartographer's Compass", icon: '🧭', blurb: 'Your environments cost 1 less energy.', rarity: 'rare', mods: { costReduction: { environment: -1 } } },

  // --- an element's whole keyword toolkit ---
  { id: 'warpaint', name: 'War Paint', icon: '🔥', blurb: 'Your Fire units gain Battle Ready (they can attack the turn they enter).', rarity: 'rare', mods: { elementKeywords: [{ element: 'fire', keywords: { battleReady: true } }] } },
  { id: 'reef-guard', name: 'Reef Guard', icon: '🌊', blurb: 'Your Water units gain Taunt (enemies must attack them first).', rarity: 'rare', mods: { elementKeywords: [{ element: 'water', keywords: { taunt: true } }] } },
  { id: 'thorn-coat', name: 'Thorn Coat', icon: '🌿', blurb: 'Your Nature units gain Spike 1 (they hit back when struck).', rarity: 'rare', mods: { elementKeywords: [{ element: 'nature', keywords: { spike: 1 } }] } },
  { id: 'bedrock-hide', name: 'Bedrock Hide', icon: '🪨', blurb: 'Your Earth units gain Tough 1 (reduce incoming damage by 1).', rarity: 'rare', mods: { elementKeywords: [{ element: 'earth', keywords: { tough: 1 } }] } },
  { id: 'prismatic-core', name: 'Prismatic Core', icon: '🌈', blurb: 'Your units gain a buff by element: Fire +1 atk, Water +1 HP, Nature +1/+1, Earth +2 HP, Neutral +1/+1.', rarity: 'rare', mods: { elementBuffs: [
    { element: 'fire', attack: 1 },
    { element: 'water', hp: 1 },
    { element: 'nature', attack: 1, hp: 1 },
    { element: 'earth', hp: 2 },
    { element: 'neutral', attack: 1, hp: 1 },
  ] } },
  { id: 'elemental-attunement', name: 'Elemental Attunement', icon: '🔯', blurb: 'Your units gain a keyword by element: Fire Battle Ready, Water Taunt, Nature Spike 1, Earth Tough 1.', rarity: 'rare', mods: { elementKeywords: [
    { element: 'fire', keywords: { battleReady: true } },
    { element: 'water', keywords: { taunt: true } },
    { element: 'nature', keywords: { spike: 1 } },
    { element: 'earth', keywords: { tough: 1 } },
  ] } },

  // --- BUILD-AROUNDS: a system you steer the whole run toward ----------------------
  {
    id: 'lean-ledger', name: 'Lean Ledger', icon: '📓',
    blurb: 'While you own 15 cards or fewer: +2 energy on your first turn, and 1 extra card.',
    rarity: 'rare', when: { deckAtMost: 15 }, mods: { startEnergyBonus: 2, startingHandDelta: 1, handCapDelta: 1 },
  },
  {
    id: 'monochrome-banner', name: 'Monochrome Banner', icon: '🎌',
    blurb: 'While every card you own shares one element: your units gain +1/+1.',
    rarity: 'rare', when: { monoElement: true }, mods: { elementBuffs: [
      { element: 'fire', attack: 1, hp: 1 },
      { element: 'water', attack: 1, hp: 1 },
      { element: 'nature', attack: 1, hp: 1 },
      { element: 'earth', attack: 1, hp: 1 },
      { element: 'neutral', attack: 1, hp: 1 },
    ] },
  },
  {
    id: 'hoarders-crest', name: "Hoarder's Crest", icon: '🏅',
    blurb: 'While you carry 6 relics or more: enemies begin every battle with 20% less HP.',
    rarity: 'rare', when: { relicsAtLeast: 6 }, mods: { enemyHpMult: 0.8 },
  },
  {
    id: 'gravediggers-charm', name: "Gravedigger's Charm", icon: '🪦',
    blurb: 'While you own 26 cards or more: draw 1 extra card every turn, hold 3 more, and gain 15 coins per win.',
    rarity: 'rare', when: { deckAtLeast: 26 }, mods: { turnDraw: 1, handCapDelta: 3, coinsPerWin: 15 },
  },

  // --- Currency that reads the fight, not just the win/loss of it -------------------
  {
    id: 'attrition-ledger', name: 'The Attrition Ledger', icon: '🩸',
    blurb: 'Gain ⊙ 4 for every point of HP you lose in a battle you win.',
    rarity: 'rare', mods: { coinsPerHpLost: 4 },
  },

  // --- EQUATIONS: a two-element deck is a plan, not a compromise --------------------
  // Modelled on Divergent Universe's Equations, which activate only once you hold enough
  // Blessings of two named Paths. `monoElement` was the table's only deck-composition
  // axis and it demands PURITY — a single very steep plan most runs abandon. These ask
  // for a MIX, which is the shape most real decks already drift toward, so they reward
  // steering a draft rather than restarting it.
  {
    id: 'steamforge-equation', name: 'The Steamforge Equation', icon: '♨',
    blurb: 'While you own 5+ Fire and 5+ Water cards: your units gain +1/+1 and your spells cost 1 less.',
    rarity: 'rare',
    when: { elementAtLeast: [{ element: 'fire', count: 5 }, { element: 'water', count: 5 }] },
    mods: { costReduction: { spell: -1 }, elementBuffs: [
      { element: 'fire', attack: 1, hp: 1 }, { element: 'water', attack: 1, hp: 1 },
      { element: 'nature', attack: 1, hp: 1 }, { element: 'earth', attack: 1, hp: 1 },
      { element: 'neutral', attack: 1, hp: 1 },
    ] },
  },
  {
    id: 'deeproot-equation', name: 'The Deeproot Equation', icon: '🌲',
    blurb: 'While you own 5+ Nature and 5+ Earth cards: your units gain Tough 1 and your foundations cost 1 less.',
    rarity: 'rare',
    when: { elementAtLeast: [{ element: 'nature', count: 5 }, { element: 'earth', count: 5 }] },
    mods: { costReduction: { foundation: -1 }, elementKeywords: [
      { element: 'fire', keywords: { tough: 1 } }, { element: 'water', keywords: { tough: 1 } },
      { element: 'nature', keywords: { tough: 1 } }, { element: 'earth', keywords: { tough: 1 } },
      { element: 'neutral', keywords: { tough: 1 } },
    ] },
  },
  {
    id: 'cinderstone-equation', name: 'The Cinderstone Equation', icon: '🌋',
    blurb: 'While you own 5+ Fire and 5+ Earth cards: begin each battle with +2 energy and 1 extra card.',
    rarity: 'rare',
    when: { elementAtLeast: [{ element: 'fire', count: 5 }, { element: 'earth', count: 5 }] },
    mods: { startEnergyBonus: 2, startingHandDelta: 1, handCapDelta: 1 },
  },

  // --- several effects at once ------------------------------------------------------
  { id: 'deep-reserve', name: 'Deep Reserve', icon: '🫗', blurb: 'Your temporary-HP ceiling rises by half your maximum HP.', rarity: 'rare', mods: { overhealBonus: 0.5 } },
  { id: 'brimming-vial', name: 'Brimming Vial', icon: '🫙', blurb: 'Gain 25 temporary HP, and raise the ceiling that holds it.', rarity: 'rare', mods: { tempHpDelta: 25, overhealBonus: 0.4 } },
  {
    id: 'silver-discord', name: 'Silver Coin of Discord', icon: '🪙',
    blurb: 'When claimed: your purse grows by half again. Worth nothing when you are broke, a fortune when you are not.',
    rarity: 'rare', mods: { coinsPercent: 0.5 },
  },
  { id: 'wanderers-map', name: "Wanderer's Map", icon: '🗺', blurb: 'Battle rewards offer 2 extra cards to choose from, and stores stock 2 more.', rarity: 'rare', mods: { extraCardChoices: 2, extraStoreSlots: 2 } },
  { id: 'phoenix-ember', name: 'Phoenix Ember', icon: '🕯', blurb: 'The first battle you would lose, you survive at 1 HP instead. Then the ember goes out.', rarity: 'rare', mods: { reviveOnce: true } },

  // ===============================================================================
  // BOSS — rewrites the run, and usually SCALES off something the run has already
  // accumulated. No drawbacks: a boss relic is paid for by the boss fight.
  // ===============================================================================

  // --- (a) SCALING: the rest of your inventory starts meaning more ------------------
  {
    id: 'reliquary-chain', name: 'Reliquary Chain', icon: '⛓',
    blurb: 'Gain 15 coins per battle won, and 15 more for every relic you carry.',
    rarity: 'boss',
    mods: { coinsPerWin: 15 },
    scale: { source: 'relics', per: 1, maxSteps: 12, mods: { coinsPerWin: 15 } },
  },
  {
    id: 'hoard-ledger', name: 'The Hoard-Ledger', icon: '🏦',
    blurb: 'For every 100 coins in your purse, enemies begin battle with 4% less HP (up to 800). Spending gives the ground back.',
    rarity: 'boss',
    mods: {},
    scale: { source: 'coins', per: 100, maxSteps: 8, mods: { enemyHpMult: 0.96 } },
  },
  {
    id: 'wardens-tally', name: "Warden's Tally", icon: '🗓',
    blurb: 'Enemies begin every battle with 5% less HP for each act you have already cleared.',
    rarity: 'boss',
    mods: {},
    scale: { source: 'act', from: 1, per: 1, maxSteps: 8, mods: { enemyHpMult: 0.95 } },
  },
  {
    id: 'ascetics-tally', name: "Ascetic's Tally", icon: '🕉',
    blurb: 'For every 2 cards your deck sits below 24, begin each battle with +1 energy (up to +4).',
    rarity: 'boss',
    mods: {},
    scale: { source: 'deckSize', from: 24, invert: true, per: 2, maxSteps: 4, mods: { startEnergyBonus: 1 } },
  },
  {
    id: 'masters-loupe', name: "Master's Loupe", icon: '🔍',
    blurb: 'For every 2 enhancements worked into your cards, all your units gain +1 HP (up to +4).',
    rarity: 'boss',
    mods: {},
    scale: { source: 'enhancements', per: 2, maxSteps: 4, mods: { elementBuffs: [
      { element: 'fire', hp: 1 }, { element: 'water', hp: 1 }, { element: 'nature', hp: 1 },
      { element: 'earth', hp: 1 }, { element: 'neutral', hp: 1 },
    ] } },
  },
  {
    id: 'last-stand-standard', name: 'Last-Stand Standard', icon: '🏳',
    blurb: 'For every 5 HP you are missing, begin the battle with +1 energy and 1 extra card (up to +4).',
    rarity: 'boss',
    mods: {},
    scale: { source: 'missingHp', per: 5, maxSteps: 4, mods: { startEnergyBonus: 1, startingHandDelta: 1, handCapDelta: 1 } },
  },

  // --- (b) RULE REWRITES: what your whole deck does, not what one number is ------
  // Every one of these is PLAYER-ONLY. An earlier draft rewrote a lane for both sides by
  // pre-placing shared Environments; symmetry read as a wash rather than as power, and
  // seven relics all shaped that way made the bands feel samey. A boss relic should
  // change what YOUR deck does.
  {
    id: 'dawn-engine', name: 'Dawn Engine', icon: '🌅',
    blurb: '+1 energy every turn, in every battle, for the rest of the run.',
    rarity: 'boss', mods: { energyPerTurn: 1 },
  },
  {
    id: 'the-great-vault', name: 'The Great Vault', icon: '🏛',
    blurb: "Start every battle with 4 energy already banked in your leader's element, and +1 energy on your first turn.",
    rarity: 'boss', mods: { startBank: { element: 'leader', amount: 4 }, startEnergyBonus: 1 },
  },

  {
    id: 'vanguard-writ', name: 'The Vanguard Writ', icon: '🏇',
    blurb: 'All your units have Battle Ready — every one of them can attack the turn it enters play.',
    rarity: 'boss', mods: { elementKeywords: [
      { element: 'fire', keywords: { battleReady: true } },
      { element: 'water', keywords: { battleReady: true } },
      { element: 'nature', keywords: { battleReady: true } },
      { element: 'earth', keywords: { battleReady: true } },
      { element: 'neutral', keywords: { battleReady: true } },
    ] },
  },
  {
    id: 'iron-doctrine', name: 'Iron Doctrine', icon: '🛡',
    blurb: 'All your units gain Tough 1, and +1 HP more for every 2 relics you carry (up to +4).',
    rarity: 'boss',
    mods: { elementKeywords: [
      { element: 'fire', keywords: { tough: 1 } },
      { element: 'water', keywords: { tough: 1 } },
      { element: 'nature', keywords: { tough: 1 } },
      { element: 'earth', keywords: { tough: 1 } },
      { element: 'neutral', keywords: { tough: 1 } },
    ] },
    scale: { source: 'relics', per: 2, maxSteps: 4, mods: { elementBuffs: [
      { element: 'fire', hp: 1 }, { element: 'water', hp: 1 }, { element: 'nature', hp: 1 },
      { element: 'earth', hp: 1 }, { element: 'neutral', hp: 1 },
    ] } },
  },

  {
    id: 'the-creditors-due', name: "The Creditor's Due", icon: '💳',
    blurb: 'When claimed: your whole purse converts into power. For every ⊙ 150 spent this way (up to 6 times), all your units permanently gain +1/+1.',
    // Worth nothing to a broke run and a genuine transformation to a hoarding one — the
    // one relic in the table where being RICH is itself the price. Capped at 6 steps
    // (900 coins) so a very late, very wealthy claim cannot compound into a stat line
    // no other one-shot in the table gets near.
    rarity: 'boss', mods: { spendAllForBuff: { perCoins: 150, attack: 1, hp: 1, maxSteps: 6 } },
  },

  // --- (c) ONE-SHOT RUN TRANSFORMATIONS ---------------------------------------------
  {
    id: 'empty-reliquary', name: 'Empty Reliquary', icon: '🗝',
    blurb: 'When claimed: choose 4 cards to burn from your deck. For each one, gain ⊙ 50 and permanently enhance a random surviving card +1/+1.',
    // Selectable removal ALONE duplicates a shop sale — free, on demand, no node cost —
    // and a shop pays coins for the privilege where the old version paid nothing. The
    // relic now gives what a shop trade categorically cannot: real coins (200 total,
    // matching The Endowment's flat grant) AND permanent power on the deck that
    // survives, in one motion, without spending a node visit or store coins to get it.
    // The buffs land on SURVIVING cards, resolved after the burn, so a buff can never be
    // wasted on a card the player is about to lose.
    rarity: 'boss', mods: { trimDeck: 4, trimCoinsPerCard: 50, trimBuffPerCard: { attack: 1, hp: 1 } },
  },
  {
    id: 'masterwork-crucible', name: 'Masterwork Crucible', icon: '⚗',
    blurb: 'When claimed: three random cards you own permanently gain +2/+2.',
    rarity: 'boss', mods: { temperRandom: { count: 3, attack: 2, hp: 2 } },
  },
  {
    id: 'the-endowment', name: 'The Endowment', icon: '🎁',
    blurb: 'When claimed: gain 200 coins, 8 max HP and 20 temporary HP.',
    rarity: 'boss', mods: { startCoinsDelta: 200, maxHpDelta: 8, tempHpDelta: 20 },
  },

  // --- THE UNDERWRITERS: one decision, two shapes of the same payout -----------------
  // Offered together as a single CHOICE by "The Underwriters" event — never rolled or
  // bought separately — because the decision they exist to create ("ongoing income, or
  // a bird in the hand") only makes sense read side by side. Distinguishing them in the
  // table rather than building one relic with an internal branch keeps both halves
  // simple, typed, foldable relics with no new claim-time state of their own.
  {
    id: 'underwriters-bond', name: "The Underwriter's Bond", icon: '📈',
    blurb: 'All coins you earn from battles are increased by 50%, for the rest of the run.',
    rarity: 'boss', mods: { coinsEarnedMult: 1.5 },
  },
  {
    id: 'underwriters-payout', name: "The Underwriter's Payout", icon: '💰',
    blurb: 'When claimed: gain ⊙ 260 immediately.',
    rarity: 'boss', mods: { startCoinsDelta: 260 },
  },

  // --- Granted only by "The Adjudicator" event: harder terms, printed on the relic ---
  {
    id: 'overclock-contract', name: 'The Overclock Contract', icon: '⚙',
    blurb: 'The run scales as though you were 2 acts further along — harder fights, and purses 2 acts richer to match.',
    rarity: 'rare', mods: { actDelta: 2 },
  },

  // ===============================================================================
  // CURSED — real power, real price. Never rolled as a reward: these are BOUGHT, on
  // the cursed shelf every store keeps, and cheaply. Taking one is always an act.
  // ===============================================================================

  // --- the energy cluster: one benefit, five prices --------------------------------
  // Slay the Spire's boss-relic pattern, moved to the band that should have carried it.
  // Every one of these grants permanent per-turn energy PLUS a second benefit, so it is
  // never simply a worse Dawn Engine — it is more power than the boss band hands out,
  // sold at a price the run has to be able to afford.
  {
    id: 'brittle-crown', name: 'Brittle Crown', icon: '👑',
    blurb: '+1 energy every turn, and +2 more on your first turn — but you permanently lose 8 max HP.',
    rarity: 'cursed', mods: { energyPerTurn: 1, startEnergyBonus: 2, maxHpDelta: -8 },
  },
  {
    id: 'covenant-stone', name: 'Covenant Stone', icon: '🗿',
    blurb: '+1 energy every turn, and battle rewards offer 2 more cards — but every enemy for the rest of the run has 15% more HP.',
    rarity: 'cursed', mods: { energyPerTurn: 1, extraCardChoices: 2, enemyHpMult: 1.15 },
  },
  {
    id: 'cracked-diadem', name: 'Cracked Diadem', icon: '💠',
    blurb: '+1 energy every turn, and +1 more on your first turn — but battle rewards offer 2 fewer cards.',
    rarity: 'cursed', mods: { energyPerTurn: 1, startEnergyBonus: 1, extraCardChoices: -2 },
  },

  // --- the hand cap: the most violent price in the table ----------------------------
  // Allowed here and nowhere else, floored at MIN_HAND_CAP_DELTA, and only ever against
  // something that changes the game rather than a number. A tighter hand is survivable
  // when the cards you hold are cheaper and you see more of them — which is exactly
  // what these two pay back.
  {
    id: 'skirmishers-creed', name: "Skirmisher's Creed", icon: '🗡',
    blurb: 'Every card you play costs 1 less energy and you draw 1 extra every turn — but your hand holds 3 fewer cards.',
    rarity: 'cursed',
    mods: { costReduction: { unit: -1, spell: -1, foundation: -1, environment: -1 }, turnDraw: 1, handCapDelta: -3 },
  },
  {
    id: 'duellists-oath', name: "Duellist's Oath", icon: '🤺',
    blurb: 'All your units gain +2/+2 — but your hand holds 2 fewer cards.',
    rarity: 'cursed',
    mods: { handCapDelta: -2, elementBuffs: [
      { element: 'fire', attack: 2, hp: 2 }, { element: 'water', attack: 2, hp: 2 },
      { element: 'nature', attack: 2, hp: 2 }, { element: 'earth', attack: 2, hp: 2 },
      { element: 'neutral', attack: 2, hp: 2 },
    ] },
  },

  // --- AUTOPILOT: the price paid in agency ------------------------------------------
  // Perfectly predictable and therefore plannable: the round counter is on the HUD, so
  // you know before you commit which turn is not yours. What it ruins is a hand arranged
  // as though every turn were.
  {
    id: 'conscripts-banner', name: "Conscript's Banner", icon: '📯',
    blurb: '+1 energy every turn and 3 extra cards in hand — but every 4th round the commander takes the field and plays your turn for you.',
    rarity: 'cursed',
    mods: { energyPerTurn: 1, startingHandDelta: 3, handCapDelta: 3, autopilotEveryRounds: 4 },
  },
  {
    id: 'generals-seal', name: "The General's Seal", icon: '🎖',
    blurb: 'Your units cost 2 less and all of them gain +1/+1 — but every 3rd round the commander plays your turn for you.',
    rarity: 'cursed',
    mods: { costReduction: { unit: -2 }, autopilotEveryRounds: 3, elementBuffs: [
      { element: 'fire', attack: 1, hp: 1 }, { element: 'water', attack: 1, hp: 1 },
      { element: 'nature', attack: 1, hp: 1 }, { element: 'earth', attack: 1, hp: 1 },
      { element: 'neutral', attack: 1, hp: 1 },
    ] },
  },

  // --- BROKEN: a debt you work off, not a tax you carry ------------------------------
  // HSR's Error Code curios, and the cleanest fit for this table's own rule that a curse
  // must be possible to OVERCOME. Every other cursed relic charges a price you carry for
  // the whole run; these charge one you actively work off by winning, and what you are
  // buying is on the far side of it. That makes them the only prices in the table that
  // shrink as the run goes on — a loan against the run rather than a tax on it — and the
  // only ones whose appeal is entirely in what happens after they are paid.
  //
  // Deliberately the cheapest shelf in the shop to say yes to and the most expensive to
  // say yes to LATE: bought in act 1 the debt is nearly free, bought before the Copper
  // Mech it may never repay at all.
  {
    id: 'corrupted-code', name: 'Corrupted Code', icon: '🧬',
    blurb: 'Broken: your units cost 1 MORE. Repairs itself after 3 battles won — then your units cost 1 less instead.',
    rarity: 'cursed',
    broken: { costReduction: { unit: 1 } },
    repairWins: 3,
    mods: { costReduction: { unit: -1 } },
  },
  {
    id: 'odd-code', name: 'Odd Code', icon: '🩸',
    blurb: 'Broken: you heal 6 less after every win. Repairs itself after 3 battles won — then you heal 8 MORE after every win.',
    rarity: 'cursed',
    broken: { victoryHealBonus: -6 },
    repairWins: 3,
    mods: { victoryHealBonus: 8 },
  },
  {
    id: 'recursive-code', name: 'Infinitely Recursive Code', icon: '🔁',
    blurb: 'Broken: mill 2 cards off your own deck every turn. Repairs itself after 4 battles won — then draw 2 extra every turn and hold 3 more.',
    rarity: 'cursed',
    broken: { turnMill: 2 },
    repairWins: 4,
    mods: { turnDraw: 2, handCapDelta: 3 },
  },
  {
    id: 'mysterious-code', name: 'Mysterious Code', icon: '👁',
    blurb: 'Broken: every enemy has 15% more HP. Repairs itself after 3 battles won — then every enemy has 20% less instead.',
    rarity: 'cursed',
    broken: { enemyHpMult: 1.15 },
    repairWins: 3,
    mods: { enemyHpMult: 0.8 },
  },
  {
    id: 'elegant-code', name: 'Elegant Code', icon: '✨',
    blurb: 'Broken: battle rewards offer 2 fewer cards. Repairs itself after 5 battles won — then +1 energy every turn, forever.',
    rarity: 'cursed',
    broken: { extraCardChoices: -2 },
    repairWins: 5,
    mods: { energyPerTurn: 1 },
  },

  // --- BORROWED TIME: pay for the early game with the late one ----------------------
  // Granted only by the boon of the same name, so it is chosen at the leader picker with
  // its whole shape printed on the card. The curve rides the existing `act` scale source
  // rather than needing a cliff: enemies open act 1 at a fraction of their HP, cross back
  // through full strength around act 6, and cap out well above it. Acts 1 and 2 are close
  // to free; everything after is the bill.
  //
  // The compounding step is what makes this readable as a DEBT rather than a difficulty
  // slider — each act is a fixed multiple worse than the last, so the player can see the
  // reckoning coming several acts out and route, thin and buy against it.
  {
    id: 'borrowed-dawn', name: 'The Borrowed Dawn', icon: '🌗',
    blurb: 'Enemies begin act 1 at a tenth of their HP. Every act after, they recover — and past the fifth they are stronger than they ever were.',
    rarity: 'cursed',
    mods: { enemyHpMult: 0.12 },
    scale: { source: 'act', from: 1, per: 1, maxSteps: 6, mods: { enemyHpMult: 1.55 } },
  },

  // --- THE LESSER ROAD: turn the difficulty dial itself down ------------------------
  {
    id: 'lesser-road', name: 'The Lesser Road', icon: '🛤',
    blurb: 'The run scales as though you were 2 acts earlier — easier fights, and purses 2 acts poorer to match.',
    rarity: 'cursed',
    mods: { actDelta: -2 },
  },

  // --- flat trades -------------------------------------------------------------------
  { id: 'gluttons-idol', name: "Glutton's Idol", icon: '👹', blurb: 'Enemies begin every battle with 25% less HP — but you lose 6 max HP.', rarity: 'cursed', mods: { enemyHpMult: 0.75, maxHpDelta: -6 } },
  { id: 'bleeding-edge', name: 'Bleeding Edge', icon: '⚔', blurb: 'Your units cost 2 less — but you heal 8 less after every battle.', rarity: 'cursed', mods: { costReduction: { unit: -2 }, victoryHealBonus: -8 } },
  { id: 'hollow-purse', name: 'Hollow Purse', icon: '👛', blurb: 'Gain 30 coins per battle won — but stores charge 40% more.', rarity: 'cursed', mods: { coinsPerWin: 30, storeBuyMult: 1.4 } },
  { id: 'war-drums', name: 'War Drums', icon: '🥁', blurb: 'Enemies begin every battle with 25% less HP — but you heal 6 less after every win.', rarity: 'cursed', mods: { enemyHpMult: 0.75, victoryHealBonus: -6 } },
  {
    id: 'ashen-pact', name: 'Ashen Pact', icon: '🌒',
    blurb: '+1 energy every turn, and 2 extra cards in your opening hand — but Rest Sites heal 5 less.',
    rarity: 'cursed', mods: { energyPerTurn: 1, startingHandDelta: 2, handCapDelta: 2, restHealBonus: -5 },
  },
  {
    id: 'famine-charm', name: 'Charm of Famine', icon: '🥀',
    blurb: 'Start each battle with 3 extra cards — but Rest Sites heal 4 less.',
    rarity: 'cursed', mods: { startingHandDelta: 3, handCapDelta: 3, restHealBonus: -4 },
  },
  {
    id: 'drowned-library', name: 'The Drowned Library', icon: '📚',
    blurb: 'Draw 2 extra cards every turn, and hold 4 more — but mill 2 off your own deck every turn.',
    rarity: 'cursed', mods: { turnDraw: 2, handCapDelta: 4, turnMill: 2 },
  },
  {
    id: 'vow-of-ash', name: 'Vow of Ash', icon: '🏺',
    blurb: 'Enemies begin at half HP — but the vow is spent after one battle.',
    rarity: 'cursed', mods: { enemyHpMult: 0.5, consumedAfterBattle: true },
  },
];

const BY_ID = new Map(RELICS.map((r) => [r.id, r]));
export const relicById = (id: string): Relic | undefined => BY_ID.get(id);
