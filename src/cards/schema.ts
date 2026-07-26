/**
 * Card / leader / deck data schema for Pandemonia.
 *
 * This is the authoring format: cards are plain data validated by these Zod schemas.
 * Types are inferred from the schemas (single source of truth) so the engine and UI
 * stay in sync with whatever the data allows.
 *
 * Keyword PARAMETER shapes are deliberately pragmatic at this stage; the engine's
 * Phase 1 keyword waves will refine semantics. Adding a field here is how you grow
 * the card vocabulary.
 */
import { z } from 'zod';
import { ELEMENTS, RULES } from '@engine/constants';

export const elementSchema = z.enum(ELEMENTS);
export type Element = z.infer<typeof elementSchema>;

/** A change to a unit's stats (buff with positives, debuff with negatives). */
export const statModSchema = z
  .object({
    attack: z.number().int().optional(),
    hp: z.number().int().optional(),
  })
  .strict();
export type StatMod = z.infer<typeof statModSchema>;

/**
 * Card cost.
 * - `energy`: generic cost, paid from the turn's universal energy.
 * - `element`: optional element-specific requirement, paid from BANKED element energy
 *   (Option A). Bounded by MAX_ELEMENT_COST.
 */
const elementCostSchema = z
  .object({ type: elementSchema, amount: z.number().int().min(1).max(RULES.MAX_ELEMENT_COST) })
  .strict();

export const costSchema = z
  .object({
    energy: z.number().int().min(0),
    /** One or more element-specific requirements paid from banked element energy. */
    elements: z.array(elementCostSchema).optional(),
  })
  .strict();
export type Cost = z.infer<typeof costSchema>;

/** When a triggered ability fires. */
export const triggerSchema = z.enum([
  'onPlay',
  'onAttack',
  'onDamaged',
  'onDeath',
  'endOfTurn',
  'startOfTurn',
]);
export type Trigger = z.infer<typeof triggerSchema>;

/** Who an effect/ability can point at. */
export const targetScopeSchema = z.enum([
  'self',        // the triggering unit itself
  'leader',      // a leader (own for beneficial effects, enemy for harmful)
  'killer',      // the unit that killed this one (Kamikaze only)
  'any',         // player picks any unit or leader
  'ally',        // single auto/interactive ally (most-hurt; own leader fallback)
  'enemy',       // single auto/interactive enemy (weakest; enemy leader fallback)
  'all-ally',    // AOE: every allied unit (excl. self), then own leader
  'all-enemy',   // AOE: every enemy unit, then enemy leader
  'lane-ally',   // same-lane ally first, then any ally, then own leader
  'lane-enemy',  // same-lane enemy first, then any enemy, then enemy leader
  'leaderUnit',  // the caster's own leader-unit (Riku) — auto-resolved, no target picked
]);
export type TargetScope = z.infer<typeof targetScopeSchema>;

/**
 * The keywords that are SAFE TO GRANT at runtime via a `buff` effect (spell / hero power /
 * signature). The engine reads each of these directly off `unit.keywords` at the relevant
 * moment (combat targeting, `mitigate`, end-of-turn, on-kill, on-death) and the `buff`
 * handler grants them with a shallow `Object.assign(target.keywords, effect.keywords)` — so
 * a keyword qualifies only if that bare merge fully wires it up.
 *
 * This is the single source of truth for grantability. `keywordsSchema` (defined below)
 * spreads this shape and ADDS the non-grantable keywords — i.e. grantability is now a
 * blocklist: everything here is grantable; the extras added onto `keywordsSchema` are not.
 * Add a new passive flag here and it becomes grantable automatically.
 *
 * It lives above `effectSchema` (which references it) and carries NO nested `Effect[]`, so it
 * has no dependency on `effectSchema` — that's what avoids the keyword⇄effect schema cycle
 * and is why effect-carrying keywords (polish, kamikaze, the Effect[] form of bloodlust) stay
 * on the non-grantable side. Deliberately EXCLUDED and why:
 *   - producer / healer / debuff / mover / expel — folded into trigger arrays by
 *     `expandKeywordEffects` at registry-build time; a runtime merge is a silent no-op.
 *   - metamorphosis / aquatic / sacrifice / smelt — need creation-time / on-play / activated
 *     wiring the merge bypasses.
 *   - shield — the live counter is `unit.shield` (seeded at creation); grant it via the
 *     `applyStatus` status:'shield' path, not the keyword merge.
 *   - doubleTeam — a lane-capacity structural flag, not a unit buff.
 *   - polish / kamikaze / bloodlust-with-effects — carry `Effect[]` (authoring-only).
 * (Sable's Pathmaker grants Immunity + Undershot; sig-incarnate seeds Spike.)
 */
const grantableKeywordsShape = {
  lethal: z.boolean().optional(),
  overshot: z.boolean().optional(),
  undershot: z.boolean().optional(),
  sniper: z.boolean().optional(),
  branchShot: z.boolean().optional(),
  splashDamage: z.boolean().optional(),
  strikeThrough: z.boolean().optional(),
  doubleStrike: z.boolean().optional(),
  airborne: z.boolean().optional(),
  battleReady: z.boolean().optional(),
  taunt: z.boolean().optional(),
  trueShield: z.boolean().optional(),
  immunity: z.boolean().optional(),
  spike: z.number().int().min(1).optional(), // retaliation damage when hit
  tough: z.number().int().min(1).optional(), // incoming damage reduction
  zombified: z.boolean().optional(),
  brittle: z.boolean().optional(),
  growth: statModSchema.optional(), // stat gain per turn
  // Bloodlust: only the stat buff is grantable (the Effect[] form is authoring-only).
  bloodlust: z.object({ buff: statModSchema.optional() }).strict().optional(),
};

export const effectGrantKeywordsSchema = z.object(grantableKeywordsShape).strict();
export type EffectGrantKeywords = z.infer<typeof effectGrantKeywordsSchema>;

/**
 * A generic, card-authored effect (used by spells, environments, hero powers,
 * kamikaze actions, etc.). Kept flexible; the engine interprets `kind` + params.
 */
export const effectSchema = z
  .object({
    kind: z.enum([
      'damage',
      'heal',
      'draw',
      'buff',
      'debuff',
      'summon',
      'conjure',
      'applyStatus',
      'energy',
      'move',
      'expel',
      'forget',
      'cleanse',
      'extraAction',
      'costMod',
      'setStats',
      'custom',
    ]),
    amount: z.number().int().optional(),
    target: targetScopeSchema.optional(),
    element: elementSchema.optional(),
    status: z.enum(['burn', 'poison', 'sleep', 'freeze', 'shield', 'zombified', 'trueShield', 'taunt']).optional(),
    stat: statModSchema.optional(),
    /** Card id to create — for `conjure` (into a hand) and `summon` (a unit onto the board). */
    cardId: z.string().optional(),
    /** Destination lane for `summon` when the card fixes it; omit to let the player choose. */
    lane: z.enum(['heights', 'ground1', 'ground2', 'water']).optional(),
    /** For `damage`: if this hit destroys its target, deal this much to another enemy unit. */
    chain: z.number().int().min(1).optional(),
    /**
     * For `damage`: a self-diminishing chain. The hit deals `amount`; if it kills, the
     * next-weakest enemy takes `amount - 1`, then `amount - 2`, and so on until a hit
     * fails to kill or the damage reaches 0. (Attrition signature.)
     */
    chainDiminish: z.boolean().optional(),
    /** For `costMod`: which card type's costs are modified. Defaults to 'spell' if omitted. */
    cardType: z.enum(['unit', 'spell', 'foundation', 'environment', 'all']).optional(),
    /** For `buff`: keywords granted to the target unit (e.g. Immunity, Undershot). */
    keywords: effectGrantKeywordsSchema.optional(),
    /**
     * For `energy`: the player chooses which element to bank at cast time (an `element`
     * target ref is consumed). Used by Golun's Cultivate. Ignored in non-interactive
     * (triggered) contexts, which fall back to `element`.
     */
    chooseElement: z.boolean().optional(),
    note: z.string().optional(),
  })
  .strict();
export type Effect = z.infer<typeof effectSchema>;

/** Statuses a unit applies to what it hits. */
export const onHitSchema = z
  .object({
    burn: z.number().int().min(1).optional(),
    poison: z.union([z.boolean(), z.number().int().min(1)]).optional(), // true = default level; number = custom level

    sleep: z.number().int().min(0).optional(), // heal X per turn while asleep
    freeze: z.boolean().optional(),
  })
  .strict();
export type OnHit = z.infer<typeof onHitSchema>;

/**
 * Intrinsic keywords a unit (or foundation) carries. Flags are booleans; keywords
 * with magnitudes carry a number or a small parameter object.
 */
export const keywordsSchema = z
  .object({
    // Passive, runtime-grantable keywords (attack/targeting flags, Tough/Spike/Immunity/
    // TrueShield, Zombified/Brittle, Growth, Bloodlust-buff). Single source of truth above.
    ...grantableKeywordsShape,

    // --- Non-grantable: needs setup the bare keyword merge can't do (see grantableKeywordsShape) ---

    // Defensive that isn't a plain merge:
    shield: z.number().int().min(1).optional(), // live counter is unit.shield (seeded at creation); grant via status:'shield'
    doubleTeam: z.boolean().optional(), // lane-capacity structural flag, not a unit buff
    // Polish is a "when hurt" trigger: gains `stat` and/or runs `effects` every time it
    // takes damage of any kind (combat, retaliation, Spike, Burn/Poison, Smelt, spells, …).
    polish: z
      .object({ stat: statModSchema.optional(), effects: z.array(effectSchema).optional() })
      .strict()
      .optional(),

    // --- Support (folded into trigger arrays by expandKeywordEffects at registry-build time) ---
    healer: z
      .object({
        amount: z.number().int().min(1),
        target: targetScopeSchema,
        trigger: triggerSchema,
      })
      .strict()
      .optional(),
    debuff: z
      .object({
        attack: z.number().int().min(0).optional(),
        hp: z.number().int().min(0).optional(),
        target: targetScopeSchema.optional(),
      })
      .strict()
      .optional(),
    mover: z.object({ scope: z.enum(['ally', 'enemy', 'either', 'self']), trigger: z.enum(['endOfTurn', 'startOfTurn']).optional() }).strict().optional(),
    expel: z.object({ scope: z.enum(['self', 'ally', 'enemy', 'either']) }).strict().optional(),

    // --- Conditional ---
    // Sacrifice up to `max` of your own units when playing this card; each one applies
    // `buff`. Playing with zero sacrifices is allowed (usually worse than a vanilla unit).
    sacrifice: z
      .object({ max: z.number().int().min(1), buff: statModSchema })
      .strict()
      .optional(),
    // Bloodlust is an "on kill" trigger: gains `buff` and/or runs `effects` each kill. The
    // full shape (with `effects`) overrides the grant-only buff form spread in above.
    bloodlust: z
      .object({ buff: statModSchema.optional(), effects: z.array(effectSchema).optional() })
      .strict()
      .optional(),
    kamikaze: effectSchema.optional(), // final action on death

    // --- Element exclusives ---
    aquatic: z.union([z.literal(true), z.array(effectSchema)]).optional(), // true = can use water; Effect[] = effects that fire on entering the Water lane (forfeited if also Airborne)
    producer: z
      .object({ amount: z.number().int().min(1), element: elementSchema })
      .strict()
      .optional(),
    metamorphosis: z
      .object({
        everyTurns: z.number().int().min(1),
        into: z.string().optional(), // card id of the evolved form
        gains: statModSchema.optional(),
      })
      .strict()
      .optional(),
    smelt: z
      .object({ hpCost: z.number().int().min(1), effect: effectSchema })
      .strict()
      .optional(),
  })
  .strict();
export type Keywords = z.infer<typeof keywordsSchema>;

// --- Card variants (discriminated on `type`) ---

const cardBase = {
  id: z.string().min(1),
  name: z.string().min(1),
  element: elementSchema,
  text: z.string().optional(), // human-readable rules text
  /**
   * Free-form tags for filtering (e.g. 'signature'). Replaces the old `archetypes`
   * field — kept generic so cards aren't pinned to a single archetype. Used by the
   * deck builder / card studio to group and filter cards (e.g. hide signatures).
   */
  tags: z.array(z.string()).default([]),
  wip: z.boolean().default(false), // true = mechanic not yet fully implemented
};

export const unitCardSchema = z
  .object({
    ...cardBase,
    type: z.literal('unit'),
    cost: costSchema,
    attack: z.number().int().min(0),
    hp: z.number().int().min(1),
    keywords: keywordsSchema.default({}),
    onHit: onHitSchema.optional(),
    /** Effects that fire when this unit enters play ("At entry"). */
    onPlay: z.array(effectSchema).optional(),
    /** Effects that fire just before this unit attacks ("Before attacking"). */
    onAttack: z.array(effectSchema).optional(),
    /** Effects that fire at the end of this unit's owner's turn. */
    endOfTurn: z.array(effectSchema).optional(),
    /** Effects that fire at the start of this unit's owner's turn. */
    startOfTurn: z.array(effectSchema).optional(),
  })
  .strict();

export const foundationCardSchema = z
  .object({
    ...cardBase,
    type: z.literal('foundation'),
    cost: costSchema,
    attack: z.number().int().min(0).default(0),
    hp: z.number().int().min(1),
    keywords: keywordsSchema.default({}),
    onHit: onHitSchema.optional(),
    // Stats, keywords, on-hit statuses and per-turn effects this foundation grants to the
    // unit stacked above it. Keywords the engine reads natively (overshot, doubleStrike,
    // growth, spike, bloodlust, …) work as grants directly; on-hit and triggered effects are
    // transferred onto the host's live trigger arrays at bond time (see applyFoundation).
    grants: z
      .object({
        stat: statModSchema.optional(),
        keywords: keywordsSchema.optional(),
        onHit: onHitSchema.optional(),
        onAttack: z.array(effectSchema).optional(),
        endOfTurn: z.array(effectSchema).optional(),
        startOfTurn: z.array(effectSchema).optional(),
      })
      .strict()
      .default({}),
  })
  .strict();

export const spellCardSchema = z
  .object({
    ...cardBase,
    type: z.literal('spell'),
    cost: costSchema,
    effects: z.array(effectSchema).min(1),
  })
  .strict();

export const environmentCardSchema = z
  .object({
    ...cardBase,
    type: z.literal('environment'),
    cost: costSchema,
    /**
     * Which lane groups this environment may be placed in. An EMPTY array means
     * Ground only — Water and Heights must be opted into explicitly, as a deliberate
     * drawback. The rule itself lives in `laneAllowed` (engine.ts); don't re-implement it.
     */
    lanes: z.array(z.enum(['ground', 'heights', 'water'])).default([]),
    effects: z.array(effectSchema).min(1),
    /**
     * Keywords granted persistently to every unit in this Environment's lane, for as
     * long as the Environment is in play. Applied when a unit enters and removed if the
     * Environment is replaced/removed. (Distinct from `effects`, which are one-shot
     * on-enter effects like Burn or Poison.)
     */
    grantKeywords: keywordsSchema.optional(),
  })
  .strict();

export const cardSchema = z.discriminatedUnion('type', [
  unitCardSchema,
  foundationCardSchema,
  spellCardSchema,
  environmentCardSchema,
]);
export type Card = z.infer<typeof cardSchema>;
export type UnitCard = z.infer<typeof unitCardSchema>;
export type FoundationCard = z.infer<typeof foundationCardSchema>;
export type SpellCard = z.infer<typeof spellCardSchema>;
export type EnvironmentCard = z.infer<typeof environmentCardSchema>;

// --- Leader ---

export const heroPowerSchema = z
  .object({
    name: z.string().min(1),
    cost: costSchema,
    /** Optional HP paid from the caster's own leader in addition to the energy cost. */
    hpCost: z.number().int().min(1).optional(),
    effects: z.array(effectSchema).min(1),
    text: z.string().optional(),
  })
  .strict();

/**
 * Per-leader element banking caps. Each element may be banked up to its own cap;
 * there is no global banking limit. The four caps distribute exactly
 * RULES.ELEMENT_CAP_TOTAL slots, each between ELEMENT_CAP_MIN and ELEMENT_CAP_MAX
 * (e.g. 4/2/1/1, 3/3/1/1, or 2/2/2/2).
 */
export const elementCapsSchema = z
  .object({
    fire: z.number().int().min(RULES.ELEMENT_CAP_MIN).max(RULES.ELEMENT_CAP_MAX),
    water: z.number().int().min(RULES.ELEMENT_CAP_MIN).max(RULES.ELEMENT_CAP_MAX),
    nature: z.number().int().min(RULES.ELEMENT_CAP_MIN).max(RULES.ELEMENT_CAP_MAX),
    earth: z.number().int().min(RULES.ELEMENT_CAP_MIN).max(RULES.ELEMENT_CAP_MAX),
  })
  .strict()
  .refine((c) => c.fire + c.water + c.nature + c.earth === RULES.ELEMENT_CAP_TOTAL, {
    message: `Element caps must distribute exactly ${RULES.ELEMENT_CAP_TOTAL} slots across the four elements.`,
  });
export type ElementCaps = z.infer<typeof elementCapsSchema>;

export const leaderSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    element: elementSchema,
    hp: z.number().int().min(1).default(RULES.LEADER_HP),
    heroPower: heroPowerSchema,
    /** Per-element banking caps (see elementCapsSchema). Defaults to an even 2/2/2/2 split. */
    elementCaps: elementCapsSchema.default({ fire: 2, water: 2, nature: 2, earth: 2 }),
    /**
     * The card delivered to the player's hand when the Signature unlocks (leader HP
     * drops to the threshold). It is an ordinary card in the pool — typically a strong,
     * free (0-cost) spell or unit — never included in a deck.
     */
    signatureCardId: z.string().min(1),
    /**
     * Optional: a unit card spawned onto this leader's board at game start as their
     * "leader-unit" (Riku). Its HP mirrors the leader's HP; if it dies, the leader loses.
     */
    leaderUnitCardId: z.string().min(1).optional(),
  })
  .strict();
export type Leader = z.infer<typeof leaderSchema>;

// --- Deck ---

export const deckEntrySchema = z
  .object({
    cardId: z.string().min(1),
    count: z.number().int().min(1).max(RULES.MAX_COPIES),
  })
  .strict();

export const deckSchema = z
  .object({
    name: z.string().min(1),
    leaderId: z.string().min(1),
    cards: z.array(deckEntrySchema).min(1),
  })
  .strict()
  .refine((deck) => deck.cards.reduce((sum, e) => sum + e.count, 0) === RULES.DECK_SIZE, {
    message: `Deck must contain exactly ${RULES.DECK_SIZE} cards.`,
    path: ['cards'],
  });
export type Deck = z.infer<typeof deckSchema>;
export type DeckEntry = z.infer<typeof deckEntrySchema>;

// --- Parse helpers (throw on invalid data) ---

export const parseCard = (data: unknown): Card => cardSchema.parse(data);
export const parseLeader = (data: unknown): Leader => leaderSchema.parse(data);
export const parseDeck = (data: unknown): Deck => deckSchema.parse(data);
