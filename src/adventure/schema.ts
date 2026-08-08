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
 * A permanent leader upgrade. `unique` is AWARDED by the act 1 boss (not bought), and
 * `attune` is bought at Enhance nodes as the alternative to a card buff — neither is
 * sold at Rest Sites, which stay low-stakes (heal / free card / kindle).
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
    /** Trial nodes: which twist from the TWISTS table applies. */
    twistId: z.string().optional(),
    visited: z.boolean(),
    /** Store nodes: one sale per visit. */
    soldThisVisit: z.boolean().optional(),
    /** Store nodes: offer slots already purchased (indices into the rolled offer). */
    bought: z.array(z.number().int()).optional(),
    /** Enhancement nodes: one purchase per visit. */
    enhanceUsed: z.boolean().optional(),
    /** Rest Site nodes: one service used per visit. */
    restUsed: z.boolean().optional(),
    /** Event nodes: which choice index was taken. */
    eventChoice: z.number().int().optional(),
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
  }).strict(),
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
    /**
     * Copper Mech (endgame) progress. `copperBest` is the most damage any attempt has
     * dealt — the run's score — and `copperAttempts` both counts tries and varies each
     * attempt's shuffle. `adventureWon` latches once the Mech has actually been killed.
     * All defaulted, so runs saved before the endgame existed load unchanged.
     */
    copperBest: z.number().int().min(0).default(0),
    copperAttempts: z.number().int().min(0).default(0),
    adventureWon: z.boolean().default(false),
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
