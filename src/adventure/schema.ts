/**
 * Adventure (single-player roguelike) run state — Zod schemas.
 *
 * Mirrors the card-content pattern: the schema is the single source of truth, all
 * TypeScript types are inferred from it, and anything loaded from localStorage is
 * validated with `safeParse` (a run that no longer parses is dropped, not repaired).
 */
import { z } from 'zod';
import { effectGrantKeywordsSchema, elementSchema } from '@cards/schema';
import { RULES } from '@engine/constants';

/** A permanent upgrade bought at an Enhancement node, attached to one owned copy. */
export const enhancementSchema = z.discriminatedUnion('kind', [
  // Stat increase — units/foundations only.
  z.object({ kind: z.literal('stat'), attack: z.number().int().min(0), hp: z.number().int().min(0) }).strict(),
  // Generic-energy cost reduction (clamped at 0 when applied).
  z.object({ kind: z.literal('cost'), energy: z.number().int().min(1) }).strict(),
  // Grant a keyword from the runtime-grantable subset — units/foundations only.
  z.object({ kind: z.literal('keyword'), keywords: effectGrantKeywordsSchema }).strict(),
]);
export type Enhancement = z.infer<typeof enhancementSchema>;

/**
 * One physical card the player owns. `uid` gives each copy its own identity so two
 * copies of the same card can be enhanced differently; enhanced copies materialize
 * in the run registry as derived defs with id `adv:${uid}`.
 */
export const ownedCardSchema = z
  .object({
    uid: z.string().min(1),
    cardId: z.string().min(1),
    enhancements: z.array(enhancementSchema),
  })
  .strict();
export type OwnedCard = z.infer<typeof ownedCardSchema>;

/**
 * A permanent leader upgrade bought at a Rest Site.
 *
 * The old generic trio (efficient/empowered/ruthless) was replaced because it landed
 * unevenly: `efficient` applied to all 13 leaders, `empowered` to 9, and `ruthless` to
 * exactly 1 (Ring Leader was the only leader with an `hpCost`), leaving four leaders
 * with no upgrade path at all once their power hit 0 energy. Now every leader has one
 * hand-authored `unique` (see LEADER_UPGRADES in hero.ts) plus repeatable `attune`.
 */
export const heroUpgradeSchema = z.discriminatedUnion('kind', [
  // The leader's own signature upgrade — one-time, since several are binary
  // ("costs no HP", "summons the elite instead") and cannot meaningfully stack.
  z.object({ kind: z.literal('unique') }).strict(),
  // +1 to one element's banking cap. Repeatable, and the universal fallback that
  // scales with any hero power no matter what it does.
  z.object({ kind: z.literal('attune'), element: elementSchema }).strict(),
]);
export type HeroUpgrade = z.infer<typeof heroUpgradeSchema>;

// Trial and Elite are DISTINCT battle nodes:
//  - 'trial' — a normal-strength battle under a fixed twist condition (no HP/deck
//    spike, no relic). Its extra difficulty is the twist itself.
//  - 'elite' — a beefier battle (more HP + bigger deck), no twist. Rewards more coins,
//    a relic choice, AND a wider card pick (5 instead of 3).
// See encounters.ts / economy.ts / run.ts / mapgen.ts.
export const nodeKindSchema = z.enum(['combat', 'store', 'enhance', 'trial', 'boss', 'elite', 'rest', 'event']);
export type NodeKind = z.infer<typeof nodeKindSchema>;

export const mapNodeSchema = z
  .object({
    id: z.string().min(1),
    kind: nodeKindSchema,
    /** Grid position: `layer` is the row (0 = start), `col` the slot within it. */
    layer: z.number().int().min(0),
    col: z.number().int().min(0),
    /** Ids of the nodes in the next layer this node connects to. */
    next: z.array(z.string()),
    /** Per-node sub-seed fixed at map generation — offers/encounters can't be rerolled. */
    seed: z.number().int(),
<<<<<<< Updated upstream
    /** Trial nodes: which twist from the TRIALS table applies. */
=======
    /**
     * Trial nodes: the twist being fought under. Set when the player PICKS one from
     * `twistChoices` on entering the node — before that it is absent, which is what the
     * `trial` phase gates on. A node carrying `twistId` but no `twistChoices` is a
     * pre-choice map (or a test fixture) and simply fights that twist.
     */
>>>>>>> Stashed changes
    twistId: z.string().optional(),
    /** Trial nodes: the shortlist rolled at map generation, one of which is chosen. */
    twistChoices: z.array(z.string()).optional(),
    visited: z.boolean(),
    /** Store nodes: one sale per visit. */
    soldThisVisit: z.boolean().optional(),
    /** Store nodes: offer slots already purchased (indices into the rolled offer). */
    bought: z.array(z.number().int()).optional(),
    /**
     * Store nodes: relic-shelf slots already purchased. Kept SEPARATE from `bought`
     * rather than sharing an index space with the card offer — the two shelves are
     * rolled independently and are different lengths, so one array would have made every
     * reader do arithmetic to work out which shelf an index referred to.
     */
    boughtRelics: z.array(z.number().int()).optional(),
    /**
     * Store nodes: rerolls bought here. Like the enhance altar's counter, this is the
     * whole of the node's restock state — the stock itself is derived from it, so a
     * reload cannot reroll the shop but paying can. Rerolling clears `bought`, since the
     * indices no longer refer to the same cards.
     */
    storeRerolls: z.number().int().min(0).optional(),
    /** Enhancement nodes: one working per visit. */
    enhanceUsed: z.boolean().optional(),
    /**
     * Enhancement nodes: how many rerolls have been bought here. The offers themselves
     * are DERIVED from `(seed, act, enhanceRerolls)` rather than stored, so this single
     * counter is the whole of the node's reroll state — and rerolling stays the only
     * thing that can change what is on offer.
     */
    enhanceRerolls: z.number().int().min(0).optional(),
    /** Rest Site nodes: one service used per visit. */
    restUsed: z.boolean().optional(),
    /** Event nodes: which choice index was taken. */
    eventChoice: z.number().int().optional(),
    /**
     * Event nodes: which event this node resolved to, fixed when the node is ENTERED.
     * Stored rather than recomputed because the pick prefers events the run has not seen,
     * and `seenEvents` grows — a live lookup could display one event and resolve another.
     */
    eventId: z.string().optional(),
  })
  .strict();
export type MapNode = z.infer<typeof mapNodeSchema>;

export const runMapSchema = z
  .object({
    nodes: z.record(z.string(), mapNodeSchema),
    /** Node ids per layer, bottom (start) to top (boss) — the rendering order. */
    layers: z.array(z.array(z.string())),
    bossId: z.string().min(1),
  })
  .strict();
export type RunMap = z.infer<typeof runMapSchema>;

export const runPhaseSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('map') }).strict(),
  z.object({ t: z.literal('store'), nodeId: z.string() }).strict(),
  z.object({ t: z.literal('enhance'), nodeId: z.string() }).strict(),
  z.object({ t: z.literal('rest'), nodeId: z.string() }).strict(),
  z.object({ t: z.literal('event'), nodeId: z.string() }).strict(),
  /**
   * Something was gained outside a battle — an event payout, or the opening boon.
   *
   * Events used to resolve straight back to the map: the authored `result` line was never
   * displayed, and a relic or card simply appeared in the deck/tray with no indication of
   * WHAT had appeared. Where the grant is a roll, this phase offers the same pick-one-of-N
   * a battle reward does; where it is a fixed grant, it shows what was received.
   *
   * `relicChoices`/`cardChoices` gate Continue until resolved, exactly like `reward`.
   */
  z.object({
    t: z.literal('gain'),
    nodeId: z.string().optional(),
    /** The event's own flavour line for what just happened. */
    text: z.string().optional(),
    relicChoices: z.array(z.string()).optional(),
    cardChoices: z.array(z.string()).optional(),
    /** Already granted — shown, not chosen. */
    gainedRelics: z.array(z.string()).optional(),
    gainedCards: z.array(z.string()).optional(),
  }).strict(),
  // Trial nodes stop here first: pick which twist to fight under, THEN the fight starts.
  z.object({ t: z.literal('trial'), nodeId: z.string() }).strict(),
  z.object({ t: z.literal('combat'), nodeId: z.string(), fightSeed: z.number().int() }).strict(),
  // `cardChoices` (pick 1 of 3, or skip) and `relicChoices` (elite/boss) each gate
  // Continue until resolved; both are removed once the player acts.
  // `unlock` is a boss-only gate: act 1's boss awards the leader's unique upgrade,
  // act 2's awards the signature buff. Like the card/relic gates it blocks Continue
  // until claimed, and is removed once taken.
  z.object({
    t: z.literal('reward'),
    nodeId: z.string(),
    coins: z.number().int(),
    /** HP this win restored (post-battle heal). Display only; already applied to `hp`. */
    healed: z.number().int().min(0).optional(),
    cardChoices: z.array(z.string()).optional(),
    relicChoices: z.array(z.string()).optional(),
    unlock: z.enum(['unique', 'signature']).optional(),
    /**
     * Act 3+ bosses no longer award the (act 1/2-only) unique/signature unlock, so they
     * instead grant a SECOND relic pick — the "significant reward" late acts were
     * otherwise missing. Internal-only flag: once the first `relicChoices` is resolved,
     * `pickRelic` sees this, rolls a fresh set into `relicChoices`, and clears the flag
     * so it can only trigger once.
     */
    bonusRelic: z.boolean().optional(),
  }).strict(),
  z.object({ t: z.literal('dead'), act: z.number().int(), nodeId: z.string() }).strict(),
<<<<<<< Updated upstream
=======
  // --- Copper Mech (the endgame challenge) --------------------------------------
  // Not a map node: it is entered from the map at any time and returns there, so it
  // carries its own seed rather than a nodeId.
  z.object({ t: z.literal('copper'), fightSeed: z.number().int() }).strict(),
  // The post-attempt scoreboard. `damage` is what this attempt dealt; `killed` means
  // the Mech actually fell, which wins the Adventure.
  z.object({
    t: z.literal('copperResult'),
    damage: z.number().int().min(0),
    killed: z.boolean(),
    /** True when this attempt beat the run's previous best. */
    record: z.boolean(),
    /** Damage-tier percentages newly reached this attempt (each pays out once per run). */
    tiers: z.array(z.number().int()).optional(),
    /** Relic choices granted by those tiers; gates Continue until one is claimed. */
    relicChoices: z.array(z.string()).optional(),
    /**
     * Tiers crossed this attempt that have NOT yet paid their relic. One relic is owed
     * per rung, so an attempt that jumps past two tiers at once re-offers a fresh row
     * after the first is claimed instead of silently paying only one.
     */
    tiersOwed: z.array(z.number().int()).optional(),
    /** The act was reset by the loss — its map has been rerolled. */
    actReset: z.boolean().optional(),
  }).strict(),
>>>>>>> Stashed changes
]);
export type RunPhase = z.infer<typeof runPhaseSchema>;

export const runStateSchema = z
  .object({
    version: z.literal(1),
    /** Master seed — every sub-seed derives from it (see seed.ts). */
    seed: z.number().int(),
    /** 1-based act (map) number; completed maps = act - 1. */
    act: z.number().int().min(1),
    leaderId: z.string().min(1),
    /**
     * Persistent run HP. The player's leader carries damage BETWEEN fights: each
     * encounter seats them at `hp`, and whatever survives is written back. `maxHp`
     * is the leader's undamaged total and never changes, so the Signature threshold
     * (half of max) stays fixed — a wounded player reaches it sooner, which is the
     * intended comeback pressure. Defaulted for back-compat with pre-HP saved runs.
     */
    hp: z.number().int().min(0).default(RULES.LEADER_HP),
    maxHp: z.number().int().min(1).default(RULES.LEADER_HP),
    /**
     * How many Mend services the run has taken at Rest Sites. Each one permanently raises
     * the heal every battle win pays out (see `victoryHealAmount`). Defaulted, so runs saved
     * before Mend existed load as level 0.
     */
    mendLevel: z.number().int().min(0).default(0),
    coins: z.number().int().min(0),
    deck: z.array(ownedCardSchema),
    /** Owned relic ids (definitions live in data/relics.ts, never persisted). */
    relics: z.array(z.string()).default([]),
    /**
     * Permanent leader upgrades. `unique` is awarded by the act 1 boss; `attune` is
     * bought repeatedly at Rest Sites.
     */
    heroUpgrades: z.array(heroUpgradeSchema).default([]),
    /**
     * Whether the leader's signature buff (act 2 boss reward) has been claimed. The
     * per-leader effects live in SIGNATURE_UPGRADES (hero.ts) and rewrite the
     * signature card def in the run registry.
     */
    signatureBuff: z.boolean().default(false),
<<<<<<< Updated upstream
=======
    /**
     * Copper Mech (endgame) progress. `copperBest` is the most damage any attempt has
     * dealt — the run's score — and `copperAttempts` both counts tries and varies each
     * attempt's shuffle. `adventureWon` latches once the Mech has actually been killed.
     * All defaulted, so runs saved before the endgame existed load unchanged.
     */
    copperBest: z.number().int().min(0).default(0),
    copperAttempts: z.number().int().min(0).default(0),
    /**
     * Damage-tier percentages already paid out this run. Each tier pays ONCE, so a repeat
     * attempt that reaches the same mark grants nothing. Keyed off the tier reached by the
     * ATTEMPT rather than `copperBest`, so a weaker later run cannot re-trigger a rung.
     */
    copperTiers: z.array(z.number().int()).default([]),
    /** Event ids already shown this run, so a run surfaces variety before repeating. */
    seenEvents: z.array(z.string()).default([]),
    /**
     * Flags an event has set this run — the run's MEMORY.
     *
     * Every event used to be one screen, one choice, one payout, after which the run
     * forgot it happened. That single missing capability is what ruled out chained NPCs
     * (meet the Tinker again and he remembers what you took), deferred payoffs, and
     * choices that only appear because of something you did earlier. An event both READS
     * flags (`EventChoice.requires`, `AdventureEvent.requiresFlag`) and WRITES them
     * (the `flag` outcome), and `pickEvent` uses them to gate later parts of a chain
     * behind the earlier ones.
     */
    eventFlags: z.array(z.string()).default([]),
    /**
     * Coins deposited at an event, payable at a LATER one. The reward is a routing
     * incentive — a reason to steer toward another '?' — which is a kind of payout no
     * other node in the run offers.
     */
    eventBank: z.number().int().min(0).default(0),
    /**
     * Relics whose one-shot use has been spent (Phoenix Ember's revival, a Divine relic
     * consumed after its battle). They stay in the tray, greyed, because a spent relic is
     * still information: it says the run already used its safety net.
     *
     * `aggregateMods` skips a spent relic's fight/economy mods entirely, so "spent" is a
     * single check in one place rather than a per-field concern.
     */
    spentRelics: z.array(z.string()).default([]),
    /**
     * An owed deck trim the player must CHOOSE, not the reducer. Set by `grantRelic`
     * when a relic's `trimDeck` fires (Empty Reliquary) and cleared by `resolveTrim`.
     *
     * Random removal used to resolve the instant the relic was claimed — which made the
     * relic strictly worse than simply walking to a shop and selling exactly the cards
     * you didn't want, for coins on top. A boss reward should never lose that comparison.
     * Top-level rather than a `phase` field because the relic can be claimed from EITHER
     * `reward` (a boss/Trial pick) or `gain` (an event or boon roll), and both screens
     * gate on this the same way rather than each carrying their own copy of the state.
     */
    pendingTrim: z.object({
      count: z.number().int().min(1),
      /** Coins granted per card actually burned, resolved alongside the trim. */
      coinsPerCard: z.number().int().min(0).optional(),
      /** A random SURVIVING card permanently buffed per card burned. */
      buffPerCard: z.object({ attack: z.number().int().min(0), hp: z.number().int().min(0) }).strict().optional(),
    }).strict().optional(),
    /**
     * BROKEN relics and the wins left before each repairs itself — HSR's Error Code
     * curios, which impose a drawback until they are fixed and then flip to a benefit.
     *
     * The shape exists because it is the purest expression of the table's own rule that
     * a curse must be OVERCOME rather than endured: the price is real and immediate, the
     * repair is guaranteed, and the thing you are buying is on the far side of it. It is
     * a loan against the run rather than a tax on it.
     *
     * An id present with a count > 0 is still broken (`Relic.broken` mods apply instead
     * of `Relic.mods`). Every battle won decrements every counter; at 0 the entry is
     * deleted and the relic is simply a good relic from then on. Absent = never broken,
     * which is every relic that does not declare `broken`.
     */
    relicRepair: z.record(z.string(), z.number().int().min(0)).default({}),
    /**
     * The opening boon this run was founded on, chosen at the leader picker. Already
     * applied to the fields it touches (coins/maxHp/deck/...) — kept only so the HUD and
     * the death summary can say what the run was built around. Optional: runs started
     * before boons existed, and every test fixture, simply have none.
     */
    boonId: z.string().optional(),
    /**
     * What that boon actually handed over — the rolled relic and any rolled cards.
     * Recorded because a boon's blurb says "a relic" or "two cards of your element", and
     * WHICH ones is decided by the seed: without this the run began with things in the
     * deck and relic tray that the player never saw arrive.
     */
    boonGrants: z
      .object({ relics: z.array(z.string()).default([]), cards: z.array(z.string()).default([]) })
      .strict()
      .optional(),
    adventureWon: z.boolean().default(false),
>>>>>>> Stashed changes
    /** Monotonic counter for OwnedCard uids. */
    nextUid: z.number().int().min(0),
    map: runMapSchema,
    /** null before the first node of an act is picked. */
    currentNodeId: z.string().nullable(),
    phase: runPhaseSchema,
  })
  .strict();
export type RunState = z.infer<typeof runStateSchema>;

/** Parse a persisted run; returns null (no run) if it doesn't validate. */
export const parseRun = (data: unknown): RunState | null => {
  const res = runStateSchema.safeParse(data);
  return res.success ? res.data : null;
};
