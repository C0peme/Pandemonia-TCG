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
/**
 * Runtime-only hook back to `effectSchema`, for the one grantable keyword that carries effects.
 *
 * It exists purely to break a TYPE cycle. `grantableKeywordsShape` is referenced by
 * `effectSchema` (a `buff` grants keywords), and Countdown's payload is itself `Effect[]` — so
 * naming `effectSchema` anywhere inside the shape, even inside an arrow body or behind an
 * `as` cast, makes TypeScript trace a circular definition and silently resolve the whole
 * keyword type to `any`. That is not hypothetical: it degraded every keyword type in the
 * codebase (183 downstream errors) twice while this was being written.
 *
 * The explicit annotation is what cuts the trace — TS takes the declared type and never looks
 * at what is later assigned. The assignment happens below, immediately after `effectSchema`
 * exists, and long before any card is parsed, so validation is exact at runtime.
 */
let validateEffect: (value: unknown) => boolean = () => true;

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
  /**
   * COUNTDOWN — the ONE effect-carrying keyword that IS grantable, and the exception proves the
   * rule stated above. The test is whether a bare `Object.assign` fully wires the keyword up,
   * and Countdown passes it because it holds NO PER-UNIT STATE: `resolveEndOfTurn` drives it
   * from `u.turnsInPlay`, which every unit already counts, and nothing is seeded at creation.
   * (Contrast `shield`, whose live counter is `unit.shield` — that one really does need
   * `applyStatus`.) Polish and Kamikaze stay out for the ordinary reason: they carry effects
   * AND are read from paths that a merge does not reach.
   *
   * `effects` is typed `unknown[]` HERE and only here. This object is referenced by
   * `effectSchema` (a `buff` carries it), while the effects inside it are Effects — a type
   * cycle TypeScript resolves to `any`, which silently degraded every keyword type in the
   * codebase when it was written the obvious way. The `z.lazy` keeps RUNTIME validation exact
   * (it really does parse each entry against `effectSchema`); only the static type is widened,
   * and only at this authoring boundary. `keywordsSchema` below re-declares Countdown with a
   * precise `Effect[]`, which is what the engine actually reads.
   *
   * CAVEAT for granting one: the clock is the unit's AGE, not the time since the grant.
   * `turnsInPlay === turns` fires on an exact turn, so a one-shot Countdown 2 granted to a unit
   * that has already lived 5 turns never fires at all. Grants want `repeat: true`, which is due
   * whenever `turnsInPlay % turns === 0`.
   */
  countdown: z
    .object({
      turns: z.number().int().min(1),
      // Wrapped in an arrow rather than passed directly: `z.custom` captures the function
      // VALUE at construction time, which here is still the permissive stub declared above —
      // passing the binding itself meant every granted payload validated as fine.
      effects: z.array(z.custom<unknown>((v) => validateEffect(v), 'not a valid Effect')).min(1),
      repeat: z.boolean().optional(),
      consume: z.boolean().optional(),
    })
    .strict()
    .optional(),
};

export const effectGrantKeywordsSchema = z.object(grantableKeywordsShape).strict();
/**
 * Runtime-grantable keyword keys, as a plain list. `applyFoundation` uses it to decide which
 * of a Foundation's OWN live keywords (base + anything buffed onto it while standalone) pass
 * up to the host — the same blocklist the `buff` effect obeys.
 */
export const GRANTABLE_KEYWORD_KEYS = Object.keys(grantableKeywordsShape);
export type EffectGrantKeywords = z.infer<typeof effectGrantKeywordsSchema>;

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
      /**
       * Permanently reduce the cost of every card CURRENTLY in the caster's hand, by
       * writing a per-copy `costDelta` on each. Distinct from `costMod`, which applies to
       * a card TYPE for as long as it is set and so would also discount everything drawn
       * later — this one travels with the specific copies it touched and nothing else.
       */
      'discountHand',
      /**
       * Arm a persistent trigger: every card this player plays from now on conjures a
       * random card into their hand (Corpselock's Signature). Bounded per turn, because
       * "play a card, get a card" is an infinite loop once cards are cheap enough.
       */
      'conjureOnPlay',
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
    lane: z.enum(['heights', 'ground1', 'water', 'ground2', 'heights2']).optional(),
    /** For `damage`: if this hit destroys its target, deal this much to another enemy unit. */
    chain: z.number().int().min(1).optional(),
    /**
     * For `damage`: a self-diminishing chain. The hit deals `amount`; if it kills, the
     * next-weakest enemy takes `amount - 1`, then `amount - 2`, and so on until a hit
     * fails to kill or the damage reaches 0. (Attrition signature.)
     */
    chainDiminish: z.boolean().optional(),
<<<<<<< Updated upstream
=======
    /**
     * For `damage`: if this damage DESTROYED the target, conjure this card into the caster's
     * hand. Mirrors how `chain` tests `target.hp <= 0`. Powers a chain spread across CARDS
     * rather than resolved inside one cast, so each link is a card the player must actually
     * play — which is what lets Eksana's chain recharge her hero power as it runs.
     */
    conjureOnKill: z.string().min(1).optional(),
    /**
     * For `damage`: pierce the target's protective defences — Freeze, Shield, Tough and True
     * Shield — the same promise the `pierce` KEYWORD makes for a unit's attack. Immunity still
     * stops it, as it stops the keyword.
     *
     * The keyword additionally ignores Taunt and Spike; this flag does not, because neither
     * exists on this path rather than by any deliberate exception — a damage effect names its
     * own target (so there is no Taunt redirect to ignore) and provokes no retaliation (so
     * there is no Spike to bypass). Same promise, fewer things in scope.
     *
     * Card damage is a HIT, so by default it wakes its target and Freeze absorbs it. This flag
     * is how a card is allowed to answer something it has just frozen.
     */
    pierce: z.boolean().optional(),
    /**
     * For `damage`: derive the amount from the TARGET instead of a fixed `amount`.
     * `targetAttack` deals damage equal to the target's current attack.
     *
     * This is how removal is differentiated by CONDITION rather than by price. Energy equals
     * the round number and is uncapped, so a costlier answer is barely a worse answer after
     * round ~5 — measured: +2 energy on 5 of a deck's 30 cards moved it 1.6pp, inside noise.
     * A conditional answer, by contrast, is genuinely good against some boards and dead
     * against others no matter how much energy you have.
     */
    amountFrom: z.enum(['targetAttack']).optional(),
>>>>>>> Stashed changes
    /** For `costMod`: which card type's costs are modified. Defaults to 'spell' if omitted. */
    cardType: z.enum(['unit', 'spell', 'foundation', 'environment', 'all']).optional(),
    /** For `buff`: keywords granted to the target unit (e.g. Immunity, Undershot). */
    keywords: effectGrantKeywordsSchema.optional(),
    /**
     * For `buff`: an on-hit status package granted to the target unit, mirroring what a
     * Foundation's `grants.onHit` does (see `applyFoundation`). Like that path it only
     * applies when the target has no on-hit of its OWN — a unit's printed rider always
     * wins over a granted one, so granting can never quietly overwrite authored behaviour.
     */
    onHit: onHitSchema.optional(),
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

// Close the loop declared above: from here on, a granted Countdown's effects are validated
// against the real `effectSchema`, exactly as a printed one's are.
validateEffect = (value: unknown): boolean => effectSchema.safeParse(value).success;

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
<<<<<<< Updated upstream
    smelt: z
      .object({ hpCost: z.number().int().min(1), effect: effectSchema })
=======
    /**
     * COUNTDOWN — a timer the OWNER sets, firing after `turns` of their own turns.
     *
     * The distinction from the game's other delayed mechanics is who controls the clock.
     * Kamikaze fires on death, so the OPPONENT chooses when by choosing whether to kill it.
     * Metamorphosis is a timer that upgrades the unit. Countdown is a timer the opponent must
     * play AROUND: answer it early, or clear the lane before it lands.
     *
     * Deliberately general — `effects` is any Effect[], so the same keyword covers a delayed
     * bomb, a recurring tick (`repeat`), or a payoff that hands its controller an extra action.
     * `consume` destroys the unit when it fires, which is the bomb flavour; without it the unit
     * survives and (with `repeat`) keeps ticking.
     *
     * RE-DECLARED here even though `grantableKeywordsShape` is spread in above, and that is
     * deliberate rather than redundant. This declaration sits AFTER `effectSchema`, so it can
     * name it directly and give `effects` a precise `Effect[]` — which is what the engine reads
     * (`resolveEndOfTurn` hands it straight to `applyTriggeredEffects`). The grantable copy has
     * to type the same field `unknown[]` to avoid a schema cycle; see the comment there. Both
     * validate identically at runtime; only the static types differ.
     */
    countdown: z
      .object({
        turns: z.number().int().min(1),
        effects: z.array(effectSchema).min(1),
        /** Fire every `turns` turns instead of once. */
        repeat: z.boolean().optional(),
        /** Destroy this unit when the timer fires. */
        consume: z.boolean().optional(),
      })
>>>>>>> Stashed changes
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

/**
 * A unit sitting in Water or Heights with no Airborne/Aquatic answer in the opposing lane
 * cannot be traded with in combat at all — only a same-domain unit or a removal spell can
 * touch it. High HP on top of that evasion compounds two advantages the formula prices
 * independently (the keyword cost, the HP cost) into a body that is disproportionately hard
 * to ever remove. Capped, not priced up: this is a DESIGN LINE (per the game's author), not a
 * cost-formula parameter — a body this evasive should not exist at high HP no matter what it
 * paid for it.
 *
 * The current pool's tallest ordinary evasive body is Emerald Drake at 5 HP (6 energy); this
 * cap matches that observed ceiling rather than inventing a new number.
 *
 * LIMITATION, not fully closed by this check: it only sees a card's OWN `keywords.aquatic`/
 * `airborne`. A grounded, high-HP unit that gains Aquatic or Airborne at RUNTIME — via a
 * Foundation grant (Fred's Boat, Tidal Dock) or an Environment's `grantKeywords` — is
 * invisible to static schema validation, since neither card's own definition violates the
 * rule in isolation. Authors granting evasion onto an existing body must apply this same
 * ceiling by hand; the engine cannot catch that combination for you.
 */
export const EVASIVE_HP_CAP = 5;

const checkEvasiveHpCap = (card: { hp: number; keywords?: { aquatic?: unknown; airborne?: boolean }; leaderUnit?: boolean }, ctx: z.RefinementCtx): void => {
  if (card.leaderUnit) return;
  const evasive = Boolean(card.keywords?.aquatic) || Boolean(card.keywords?.airborne);
  if (evasive && card.hp > EVASIVE_HP_CAP) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Airborne/Aquatic units cannot exceed ${EVASIVE_HP_CAP} HP (got ${card.hp}) — they occupy a lane only a same-domain unit or removal can contest. Set leaderUnit: true if this is a leader-unit avatar.`,
      path: ['hp'],
    });
  }
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
    /**
     * Marks the one card per leader that IS the leader-unit avatar (referenced by that
     * leader's `leaderUnitCardId`). The only exemption from `EVASIVE_HP_CAP` below — a
     * leader-unit's HP is the leader's own HP by design (Immunity/Taunt/"if it dies you
     * lose" already govern it), not a stat a card author is choosing freely.
     */
    leaderUnit: z.boolean().optional(),
  })
  .strict()
  .superRefine(checkEvasiveHpCap);

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
  .strict()
  .superRefine(checkEvasiveHpCap);

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
    /**
     * Extra HP added to `hpCost` for each PREVIOUS activation this game (1 -> 1,2,3...).
     * OPT-IN, because it only makes sense where a power's value is CUMULATIVE. Modification
     * grants +1 attack permanently, so activation k adds attack to every remaining turn and
     * its total value is quadratic in game length, while a flat HP price is linear — cost
     * loses that race outright. Screyera's Scry also costs HP but draws 2 cards, which is
     * linear, so it must NOT escalate. A global rule would nerf the wrong power.
     */
    hpCostStep: z.number().int().min(0).optional(),
    /**
     * ENERGY discount per card played since this power was last activated — the inverse of
     * `hpCostStep`. Lets a power be printed at a cost no game ever naturally reaches (energy
     * equals the round number, so ~17 is the practical ceiling) and made castable only by
     * PLAYING CARDS. Activating resets the counter, so it is a rechargeable ultimate rather
     * than a one-way unlock: see Eksana's Call in a Favour.
     */
    costStep: z.number().int().min(0).optional(),
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
