/**
 * Engine state model.
 *
 * Design rules:
 * - State is plain data (serializable: no class instances, no functions, no Maps).
 * - Card *definitions* live in the registry (static content) and are passed to the
 *   engine alongside the state — they are NOT stored here. State holds only instances.
 * - The active player attacks at the end of their own turn ("Declare Attack ends the turn").
 */
import type { Element, LaneId, LaneLayout } from '@engine/constants';
import type { Effect, Keywords, OnHit, TargetScope } from '@cards/schema';
import type { Rng } from '@engine/rng';

export type PlayerId = 0 | 1;
export const opponentOf = (p: PlayerId): PlayerId => (p === 0 ? 1 : 0);

/** A card sitting in a hand, deck, or discard pile. */
export interface CardInstance {
  iid: string;
  cardId: string;
  /**
   * A PERMANENT cost reduction attached to this one physical copy, not to the player.
   * Read alongside the player-level stores by `costModFor`.
   *
   * The player-level `costMods`/`costBase` cannot express "the cards you are holding right
   * now get cheaper, and stay cheaper" — they apply to a card TYPE for as long as they are
   * set, so they would also discount everything drawn afterwards. Corpselock's upgraded
   * Signature needs the discount to travel with the specific copies it touched.
   */
  costDelta?: number;
}

/** Status effects currently on a unit. */
export interface StatusState {
  /** Burn damage applied at end of each turn. */
  burn?: number;
  /** Constant damage dealt at the end of each of the owner's turns; persists until removed. */
  poisoned?: number;
  /** Turns of Sleep remaining. */
  sleep?: number;
  /** HP healed each turn while asleep. */
  sleepHeal?: number;
  /** Turns of Freeze remaining. */
  freeze?: number;
  /** A unit placed in Water without water-compatibility: 0 attack, body only. */
  drowning?: boolean;
}

/**
 * The Foundation's LIVE body at bond time — its stats and keywords as they actually were on
 * the board (buffs, enhancements, Environment grants included), not the card's printed base.
 * Kept on the instance so a re-bond (Metamorphosis) reproduces the same grant.
 */
export interface FoundationLive {
  attack: number;
  hp: number;
  keywords: Keywords;
}

/** A Foundation card stacked beneath a unit. */
export interface FoundationInstance {
  iid: string;
  cardId: string;
  hp: number;
  /** Stat bonus this Foundation granted to the host (for reversion if destroyed). */
  appliedStat: { attack?: number; hp?: number };
  /** Keyword keys this Foundation added to the host (so they can be removed). */
  appliedKeywordKeys: string[];
  /** Shield count this Foundation granted (subtracted, not zeroed, on reversion). */
  appliedShield?: number;
  /** True if this Foundation set the host's onHit (cleared on reversion). */
  appliedOnHit?: boolean;
  /** Counts of triggered effects this Foundation appended to the host (spliced off on revert). */
  appliedTriggers?: { onAttack: number; endOfTurn: number; startOfTurn: number };
  /** The Foundation's live body at bond time (see `FoundationLive`). */
  live?: FoundationLive;
}

/** A unit in play. Current stats are denormalized here; recompute on changes. */
export interface UnitInstance {
  iid: string;
  cardId: string;
  owner: PlayerId;
  attack: number;
  hp: number;
  maxHp: number;
  /** Effective keywords (base ∪ foundation grants ∪ buffs). */
  keywords: Keywords;
  /** Status effects applied to whatever this unit hits. */
  onHit?: OnHit;
  /** Card-authored effects that fire just before this unit attacks ("Before attacking"). */
  onAttack?: Effect[];
  /** Card-authored effects that fire at the end of this unit's owner's turn. */
  endOfTurn?: Effect[];
  /** Card-authored effects that fire at the start of this unit's owner's turn. */
  startOfTurn?: Effect[];
  status: StatusState;
  foundation?: FoundationInstance;
  /** Remaining Shield instances (from the `shield` keyword). */
  shield?: number;
  /** Shield count granted by the lane's Environment (subtracted, not zeroed, on revert). */
  envShield?: number;
  /** Attack to restore if a drowning unit ever leaves Water (Water zeroes its attack). */
  predrownAttack?: number;
  /** Turns this unit has spent in play (drives Metamorphosis). */
  turnsInPlay: number;
  /** True on the turn a unit is placed — it cannot attack until next turn. */
  justPlaced: boolean;
  /** Keyword keys granted by the lane's Environment (so they can be cleanly reverted). */
  envKeywordKeys?: string[];
  /** Riku: this unit IS the leader. Its HP mirrors leaderHp; its death loses the game. */
  isLeaderUnit?: boolean;
  /** True while this unit is a standalone Foundation (a base layer awaiting a unit to bond).
   *  It lives in `Lane.standaloneFoundation` and fights as a full unit until a unit is placed
   *  on top, at which point it folds into that unit's `foundation` (see engine `playUnit`). */
  isFoundation?: boolean;
  /** Transient guard: set while its death trigger (Kamikaze) is resolving so a nested
   *  processDeaths (e.g. via Polish reacting to Kamikaze damage) can't re-fire it. The unit is
   *  removed from the board immediately after, so this never persists into stored state. */
  dying?: boolean;
  /**
   * Already raised once by `BossRules.recursion`. A raised unit that dies again stays
   * dead — the bound that stops death/rebirth from looping forever inside a single
   * `processDeaths` fixpoint pass.
   */
  raised?: boolean;
}

export interface EnvironmentInstance {
  iid: string;
  cardId: string;
  owner: PlayerId;
}

/** A single lane. `front` is nearest the front; `back` exists only via Double Team. */
export interface Lane {
  front?: UnitInstance;
  back?: UnitInstance;
  /**
   * A Foundation placed in an empty lane before any unit arrives. It is a full `UnitInstance`
   * (flagged `isFoundation`) so it fights, takes damage/status, and is targeted through the
   * shared unit machinery. When a unit is placed on top it auto-bonds — the Foundation folds
   * into that unit's `foundation` (see engine `playUnit`) and this slot clears.
   */
  standaloneFoundation?: UnitInstance;
}

export type Lanes = Record<LaneId, Lane>;

export interface PlayerState {
  id: PlayerId;
  leaderId: string;
  leaderHp: number;
  /** This leader's maximum HP (the heal cap for a non-leader-unit leader). */
  leaderMaxHp?: number;
  /** True once the leader has dropped to the Signature HP threshold. */
  signatureUnlocked: boolean;
  /** The card to deliver to hand when the Signature unlocks. */
  signatureCardId: string;
  /** Unlocked but not yet delivered (e.g. the hand was full). */
  signaturePending: boolean;
  /** The Signature card has been delivered to hand (delivered at most once). */
  signatureGranted: boolean;
  /** Universal energy available this turn. */
  energy: number;
  /** Banked element energy. Each element is capped individually by `elementCaps`. */
  bank: Record<Element, number>;
  /** Per-element banking caps, copied from the leader at setup. */
  elementCaps: Record<Element, number>;
  hand: CardInstance[];
  deck: CardInstance[];
  discard: CardInstance[];
  /** Hero-power activations this GAME (not this turn). Drives `hpCostStep`. */
  heroPowerUses?: number;
  /** Cards played since this player's hero power was last activated. Drives `costStep`. */
  cardsSincePower?: number;
  lanes: Lanes;
  heroPowerUsed: boolean;
  /**
   * TEMPORARY additive modifiers to this player's card energy costs, by type. Positive
   * = more expensive, negative = discount. Cleared at the end of this player's own turn
   * (e.g. Anti Magic Field). For run-long discounts, use `costBase` instead.
   */
  costMods: { unit: number; spell: number; foundation: number; environment: number };
  /**
   * PERSISTENT additive cost modifiers, same shape as `costMods` but NEVER auto-cleared.
   * Set once at encounter build (Adventure leader uniques like Naife's Environment
   * discount, and cost-reduction relics) and read alongside `costMods` everywhere a
   * card's effective cost is computed. Optional for back-compat with states built before
   * it existed; absent is treated as all-zero.
   */
  /**
   * Per-player hand cap override. Absent = `RULES.HAND_CAP`.
   *
   * Exists so a relic that hands you extra cards can also give you room to hold them —
   * without it, "start each battle with 3 extra cards" drew three cards and immediately
   * discarded whatever spilled past ten, which reads as the relic not working.
   */
  handCap?: number;
  costBase?: { unit: number; spell: number; foundation: number; environment: number };
  /**
   * Boss-curse per-turn card modifiers (Adventure only — set once at encounter build
   * time, never by ordinary gameplay). Applied in `beginTurn` after the normal draw.
   */
  turnCardMod?: { extraDraws?: number; millSelf?: number };
<<<<<<< Updated upstream
=======
  /**
   * PERMANENT per-turn energy bonus (Adventure only — set once at encounter build time).
   * Added to the round-number energy every turn, on top of `energyNext`.
   *
   * Distinct from every energy field that already existed, and that distinction is the
   * whole point: `energy` is overwritten each `beginTurn` (so adding to it lasts one
   * turn), `energyNext` is explicitly a one-turn carry, and `energyOverride` REPLACES the
   * round curve rather than adding to it. None of them can express "you simply have one
   * more energy, every turn, all fight" — which is the single largest thing a relic can
   * offer and therefore the boss-tier power that boss-tier prices are paid for.
   *
   * Deliberately additive on top of `energyOverride` too: a boss that fixes energy at 4
   * and a player carrying this relic meet at 5, rather than the boss silently deleting
   * the relic (the bug `energyOverride` already caused once for `startEnergyBonus`).
   */
  energyPerTurn?: number;
  /**
   * Per-turn DECK RAID (Adventure endgame only — set once at encounter build time).
   * Each of this player's turns, one pool is chosen at random and raided: `count` cards
   * are pulled from it into hand, and its signature (if any) REPLACES this player's
   * current signature and is re-delivered, so a fresh one arrives every round.
   *
   * Deliberately generic and fully data-driven: the engine never learns what a "leader
   * archetype" is, it just raids id lists. The Adventure layer builds the pools.
   */
  turnDeckRaid?: { pools: DeckRaidPool[]; count: number };
  /**
   * While set, every CARD this player plays conjures a random card from `cardIds` into
   * their hand (Corpselock's Signature).
   *
   * `perTurn` is load-bearing, not flavour: with cheap enough cards, "playing a card gives
   * you a card" is a genuine infinite loop — the hand cap bounds what you HOLD, not how
   * many times the cycle runs, and the AI will happily ride it forever. `usedThisTurn` is
   * reset in `beginTurn`.
   */
  conjureOnPlay?: { cardIds: string[]; perTurn: number; usedThisTurn: number };
  /**
   * The hand card sealed by `BossRules.seal` for THIS turn (Screyera's Foresight).
   *
   * Re-chosen every `beginTurn` (and cleared there when the rule is not in play), so it
   * tracks the hand as it changes rather than locking one card for the fight.
   * `legalActions` filters it out and `takeFromHand` refuses it, so the AI never plans a
   * line through a card it cannot play.
   */
  sealedIid?: string;
}

/** One raidable pool for `turnDeckRaid` — typically one leader's deck + their signature. */
export interface DeckRaidPool {
  /** Display label for the event log (e.g. the leader whose deck is being raided). */
  name: string;
  /** Card ids the raid may pull from. Sampled WITH replacement. */
  cardIds: string[];
  /** Handed over alongside the raid, replacing the raider's current signature. */
  signatureCardId?: string;
>>>>>>> Stashed changes
}

/**
 * A move/expel triggered effect awaiting a player's target choice (interactive
 * resolution — "per target per activation"). Queued FIFO; drained by `resolvePending`.
 */
export interface PendingChoice {
  /** The player who chooses (and the reference side for ally/enemy scope). */
  player: PlayerId;
  /** The unit whose effect this is (for UI labelling and `self` scope). */
  sourceIid: string;
  kind: 'move' | 'expel' | 'forget';
  scope: TargetScope;
}

export interface GameState {
  rng: Rng;
  round: number;
  /** Total turns taken (0-based count). */
  turn: number;
  active: PlayerId;
  first: PlayerId;
  players: Record<PlayerId, PlayerState>;
  phase: 'main' | 'ended';
  winner: PlayerId | null;
  /**
   * Lane Environments are shared, one per lane column (not per player). The Environment
   * sits "in the middle" between the two players and its effect applies to BOTH players'
   * units in that lane. Placing a new Environment in a lane replaces any existing one.
   */
  environments: Partial<Record<LaneId, EnvironmentInstance>>;
  /** Monotonic counter for minting instance ids. */
  iidSeq: number;
  /** Interactive move/expel choices awaiting player input (drained before play continues). */
  pending?: PendingChoice[];
  /**
   * Units owed a bonus attack (from an `extraAction` effect), FIFO. Drained automatically
   * after the triggering action resolves — except a Sniper eligible to redirect (Heights or
   * Airborne), which pauses the queue at its front (`extraActionNeedsAim` in combat.ts) until
   * a `resolveExtraAction` action supplies the lane to aim it at; each bonus attack incurs no
   * retaliation either way.
   */
  extraActions?: string[];
  /**
   * Boss curse (Adventure only): fixes both players' turn energy to this value instead
   * of the round number. Set once at encounter build time.
   */
  energyOverride?: number;
  /**
   * AUTOPILOT (Adventure only): on qualifying rounds, `player`'s turn is played by the
   * AI instead of by the human. Set once at encounter build time by a cursed relic or a
   * Trial twist; nothing in the pure engine reads it.
   *
   * It lives on GameState rather than in the UI because it is part of the FIGHT's stated
   * rules — the same place `energyOverride` lives — so a saved/serialized encounter
   * carries it, and every surface (the banner, the input lock, the AI driver) reads one
   * field instead of three copies of the same predicate. `autopilotActive` (below) is
   * that predicate, and is the only thing any caller should use.
   *
   * The trigger is ROUNDS, deliberately, not cards played: a round boundary is visible
   * on the HUD before you commit to a play, so the cost is something you can build a
   * hand around ("this is my free turn, this is the one they take"). A mid-turn seizure
   * keyed off a card count would fire in the middle of a combo with no warning, which is
   * a different and much worse thing than a hard rule you can plan against.
   */
  autopilot?: { player: PlayerId; everyRounds: number };
  /**
   * THE BOARD'S LAYOUT for this fight — which of the five columns is Heights, Ground or
   * Water. Absent = `DEFAULT_LANE_LAYOUT`, the printed Heights/Ground/Water/Ground/Heights.
   *
   * Lane IDENTITY never changes: the same five keys, in the same left-to-right order, so
   * `adjacentLanes` (splash, collateral), the state shape, saved encounters and every
   * animation target are all untouched. Only what each column MEANS is per-fight data,
   * which is why a re-laid board needed no new state shape and no card edits — every rule
   * that asks "is this the high ground / the water" already had to route through
   * `isHeights`/`isGround`/`isWater` rather than compare against a string.
   *
   * Read it through those helpers, never by indexing this directly.
   */
  laneTypes?: LaneLayout;
  /**
   * BOSS RULES (Adventure only): the mechanisms a named boss's signature is built from.
   *
   * Distinct from a Trial twist, and deliberately so. A twist ADJUSTS the board — every
   * unit is bigger, this lane is on fire — and is applied by rewriting the shared run
   * registry or seeding the opening state, after which the engine never thinks about it
   * again. A boss rule BREAKS A RULE of the game and therefore has to live for the whole
   * fight: cards that cannot be played, deaths that do not stick, plays that are copied
   * onto the other side. Those need per-turn and per-event hooks, which is what this is.
   *
   * Grouped into one field rather than scattered across PlayerState like `turnCardMod`
   * and friends because they are one authored thing — a boss's signature — and a saved
   * encounter has to carry all of it or none. `src/engine/bossRules.ts` owns every read.
   *
   * ONE RULE PER BOSS still holds (`bosses.test.ts`): this shape can express several at
   * once, but no authored boss is allowed to.
   */
  bossRules?: BossRules;
}

/**
 * The boss-rule mechanisms. Every field names the player it acts ON or FOR explicitly —
 * none of them assume Adventure's seating, so a test fixture can aim any of them either
 * way. See `GameState.bossRules` for why these are grouped.
 */
export interface BossRules {
  /**
   * Units dropped into `side`'s EMPTY lanes. `everyRounds: 0` places once, at battle
   * start (a pre-built board); `2` re-places at the start of every odd round, round 1
   * included. Only empty lanes are filled, so a board the boss has already developed is
   * never clobbered.
   */
  placements?: { cardId: string; side: PlayerId; everyRounds: number }[];
  /**
   * Dead units rise again under this player's control, ONCE each (`raised`), on whichever
   * side has room. The once-each bound is load-bearing: without it a unit that dies on
   * arrival re-enters, dies again and re-enters forever inside a single `processDeaths`
   * fixpoint loop.
   */
  recursion?: PlayerId;
  /** This player's highest-cost hand card is sealed (unplayable) each of their turns. */
  seal?: PlayerId;
  /** Units this player plays are copied onto the opposing side, into the mirrored lane. */
  mirror?: PlayerId;
  /** At the end of this player's turn, their highest-cost unit in play is destroyed. */
  execute?: PlayerId;
  /** Units this player plays enter with this much less attack (never below 0). */
  dampen?: { player: PlayerId; attack: number };
  /**
   * Every unit in this fight, both sides, has Battle Ready — it can attack the turn it
   * lands. Applied by rewriting the run registry (`buildRunRegistry`), the same mechanism
   * a `globalKeyword` twist uses, so it reaches summons and tokens as well as hand plays.
   *
   * It exists for the False Hydra. A board-filling placement that recurs is only a fair
   * rule if the board you play in response can ACT: without this, answering five prophets
   * meant playing units on the odd round and killing them on the even one, by which time
   * the prophets had already resolved and been replaced. With it, the fight becomes "how
   * many can I clear this round", which is a decision rather than a wait.
   */
  battleReady?: boolean;
  /**
   * RE-LAY THE BOARD — which column is Heights, Ground or Water for this fight, plus any
   * Environments pre-placed into the new lanes.
   *
   * Shares its whole implementation (`applyLaneLayout`) with the `laneLayout` Trial twist:
   * the mechanism is the same, only who chose it differs. A boss's board is its signature;
   * a Trial's is a rule the player took off a shortlist knowing the price.
   */
  laneLayout?: { types: LaneLayout; places?: { lane: LaneId; cardId: string }[] };
  /**
   * THE CAULDRON (Kedou): Burn and Poison landing on this player's units bypass Immunity,
   * cannot be cleansed, and (Burn specifically) never expire on their own.
   *
   * Kedou's deck is almost entirely Burn/Poison — the rule does not add a new mechanic, it
   * removes the two-card answer (Immunity, cleanse) that would otherwise blank her archetype
   * outright once the altar starts selling Immunity as a common working. `poisoned` already
   * never expires by itself (see RULES.POISON_DAMAGE); this only has to defeat the two things
   * that could otherwise remove it.
   */
  cauldron?: PlayerId;
  /**
   * DISCIPLINE (Aleph): this player's units cannot be buffed, healed, or grow — everything
   * fights at printed size for the whole fight.
   *
   * Aleph's own hero power already does exactly this to ONE unit: "Poison an enemy unit —
   * it can no longer be buffed." Her boss rule generalises that to her whole archetype
   * rather than inventing a new mechanic, and is checked at the SAME chokepoints Poison's
   * growth-lock already uses (`buffUnit`, `healUnit`, `healLeader`) rather than by applying
   * Poison itself, which would also add a damage clock no boss rule here promises.
   *
   * Deliberately does not touch printed enhancements — those are baked into the card def
   * before the fight starts, so a built God Unit still shows up at full size. What it
   * blocks is IN-FIGHT compounding: Growth, Bloodlust, healer effects, sacrifice buffs.
   */
  disciplined?: PlayerId;
  /**
   * CHARGE (Failed Heir/Warhost): this side's Declare Attack step resolves TWICE every
   * round — every unit that can attack does so twice, in the same order, before the turn
   * ends. Aggro's whole identity is more attack steps than the game normally allows; at
   * boss scale that becomes the literal rule rather than a stat.
   */
  doubleCombat?: PlayerId;
  /**
   * METASTASIS (Corpselock/The Final Stage): every unit `player` plays hands `energy` to
   * the OTHER side's next turn. His own hero power already borrows energy from his own
   * future (+3 now, −2 next round); this boss rule borrows from YOURS instead — he grows
   * off what you build, not off a flat number.
   */
  feedOnPlay?: { player: PlayerId; energy: number };
  /**
   * BEHIND THE MASK (Phantom/Warlord's Daughter): at the start of each of `player`'s
   * turns, their single most expensive hand card is taken into the OTHER side's hand.
   *
   * Control's whole identity is denying resources (freeze, sleep, expel, mill); this is
   * that denial aimed at the hand itself rather than the board. "Most expensive" mirrors
   * the vocabulary `seal`/`execute` already use ("your best card"), so the boss table
   * reads as one voice rather than several unrelated mechanics.
   */
  steal?: PlayerId;
}

/**
 * Is the ACTIVE seat currently under AI autopilot?
 *
 * `round` counts full rounds (it advances only when the turn returns to the player who
 * went first), so `everyRounds: 3` means rounds 3, 6, 9 — both seats always see the same
 * round number, and the player can count toward it.
 */
export const autopilotActive = (state: GameState): boolean => {
  const a = state.autopilot;
  if (!a || a.everyRounds < 1) return false;
  return state.active === a.player && state.round % a.everyRounds === 0;
};

export const emptyBank = (): Record<Element, number> => ({
  fire: 0,
  water: 0,
  nature: 0,
  earth: 0,
});
