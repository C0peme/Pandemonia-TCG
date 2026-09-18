/**
 * Leader progression: the permanent upgrades a run buys at Rest Sites.
 *
 * Two kinds (see `heroUpgradeSchema`):
 *  - `unique`   — the leader's own hand-authored upgrade, one per leader, one-time.
 *  - `attune`   — +1 to one element's banking cap, repeatable, available to everyone.
 *
 * Most uniques are a pure transform of the hero power, so they take effect for play
 * AND the AI with no engine change: the engine resolves hero powers from the registry
 * leader at cast time, and `runRegistry.ts` seats the upgraded leader there.
 *
 * A few uniques instead (or also) modify the player's battle state — Naife discounts
 * Environments via `costMods`, and every `attune` raises `elementCaps`. Those cannot
 * live on the hero power, so they are collected by `heroStateMods` and applied to the
 * opening GameState alongside relic mods (see CombatView).
 */
import type { Card, Effect, EffectGrantKeywords, Element, Keywords, Leader } from '@cards/schema';
import type { GameState, PlayerId, PlayerState } from '@engine/types';
import type { HeroUpgrade } from '@adventure/schema';

export type HeroUpgradeKind = HeroUpgrade['kind'];

type HeroPower = Leader['heroPower'];

/** One leader's signature upgrade. */
export interface LeaderUpgrade {
  /** Display name, e.g. "Steam Pressure". */
  name: string;
  icon: string;
  /** One-line description of what it changes. */
  desc: string;
  /** Transform of the hero power. Omitted when the upgrade is purely state-level. */
  power?: (hp: HeroPower) => HeroPower;
  /** Battle-state mods (cost discounts). Element caps come from `attune` instead. */
  costMods?: Partial<PlayerState['costMods']>;
}

/** Append effects to a power (the common shape — "…also does X"). */
const also = (...extra: Effect[]) => (hp: HeroPower): HeroPower => ({ ...hp, effects: [...hp.effects, ...extra] });

/**
 * The 13 signature upgrades, keyed by leader id. Each is built from effect primitives
 * the engine already supports — extra targeted effects consume their own target
 * (`targets[cursor++]` in effects.ts), so "hits a second unit" needs no engine work.
 */
export const LEADER_UPGRADES: Record<string, LeaderUpgrade> = {
  // Scald 2 → 3: the steam city runs hotter.
  kedou: {
    name: 'Steam Pressure',
    icon: '♨',
    desc: 'Scald inflicts Burn 3 instead of Burn 2.',
    power: (hp) => ({
      ...hp,
      effects: hp.effects.map((e) => (e.kind === 'applyStatus' && e.status === 'burn' ? { ...e, amount: 3 } : e)),
    }),
  },
  // A second lash — desperation for more power, spread thinner.
  orsyric: {
    name: 'Psychic Lash',
    icon: '🌀',
    desc: 'Mind Whip strikes a second unit for 1.',
    power: also({ kind: 'damage', amount: 1, target: 'any' }),
  },
  // The warden does not merely punish, he sentences.
  aleph: {
    name: 'Idealist Declaration',
    icon: '⚖',
    desc: 'Disciplinary Power also puts the target to Sleep.',
    power: also({ kind: 'applyStatus', amount: 1, target: 'enemy', status: 'sleep' }),
  },
  // The mask reaches two minds at once.
  phantom: {
    name: 'Veil of Silence',
    icon: '🎭',
    desc: 'Subdue puts a second enemy unit to Sleep.',
    power: also({ kind: 'applyStatus', amount: 1, target: 'enemy', status: 'sleep' }),
  },
  // She sells prophecy; the buyer forgets what they came for.
  screyera: {
    name: 'Foresight',
    icon: '🔮',
    desc: 'Scry also makes the opponent forget 1 card.',
    power: also({ kind: 'forget', amount: 1, target: 'enemy' }),
  },
  // The executioner keeps appointments: no blood price, and the portal moves him.
  ringleader: {
    name: 'Busy Schedule',
    icon: '🎩',
    desc: 'Modification costs no HP and also relocates your leader-unit.',
    power: (hp) => {
      const next: HeroPower = { ...hp, effects: [...hp.effects, { kind: 'move', target: 'leaderUnit' }] };
      delete next.hpCost;
      return next;
    },
  },
  // The growth spreads to a second host.
  corpselock: {
    name: 'Metastasis',
    icon: '🦠',
    desc: 'Cancerous Growth banks a second element too.',
    power: also({ kind: 'energy', amount: 2, chooseElement: true }),
  },
  // The bartender drinks with the house.
  johnpork: {
    name: 'Happy Hour',
    icon: '🍺',
    desc: 'Sweet Liquor also draws you a card.',
    power: also({ kind: 'draw', amount: 1 }),
  },
  // The fallback code overflows into something much worse.
  autopus: {
    name: 'Integer Overflow',
    icon: '🐙',
    desc: 'Fallback Code summons a Techtacle instead of a Mechanical Failure.',
    power: (hp) => ({
      ...hp,
      effects: hp.effects.map((e) => (e.kind === 'summon' ? { ...e, cardId: 'critter-elite' } : e)),
    }),
  },
  // He does not only shore up walls — he forges what stands on them.
  cleath: {
    name: 'The Architect',
    icon: '🔨',
    desc: 'Fortify also grants +1 attack.',
    power: (hp) => ({
      ...hp,
      effects: hp.effects.map((e) => (e.kind === 'buff' && e.stat ? { ...e, stat: { ...e.stat, attack: (e.stat.attack ?? 0) + 1 } } : e)),
    }),
  },
  // Stale upgrade removed: this used to read "Exploit also Poisons the target", from back when
  // her power was a targeted damage effect. Call in a Favour is a SUMMON — appending a targeted
  // applyStatus to it would have consumed a target the power never asks for.
  //
  // The right axis for her is the network itself. Call in a Favour is gated entirely by its
  // discount (1 per card played), so doubling the rate she calls in debts is both the strongest
  // upgrade available to her and the only one that touches her actual engine.
  eksana: {
    name: 'The Network',
    icon: '🕸',
    desc: 'Call in a Favour costs 2 less per card played, instead of 1.',
    power: (hp) => ({ ...hp, costStep: (hp.costStep ?? 1) * 2 }),
  },
  // The curse she carries, she can now lend out.
  //
  // Rewritten when Tinkerer became COCOON. The original mapped over the power's `buff` effect
  // to add Zombified, and Cocoon has no `buff` — it is two `applyStatus` effects — so the
  // upgrade had silently become a no-op the moment the skill changed.
  //
  // It does two things, because an upgrade to a skill should make the SKILL better rather than
  // only bolt a second ability onto it:
  //
  //  1. DEEPENS the cocoon — the sleep heals twice as much. This edits the existing effect in
  //     place, so it costs no extra target picks, and it scales the half of Cocoon that is
  //     pure upside (the heal) rather than the half that disables the unit.
  //  2. ADDS the curse. Scoped `all-ally` deliberately: Cocoon already consumes TWO target refs
  //     (one per status), the most of any power in the game, and a third targeted effect would
  //     mean clicking the same body three times to fire one ability. An AOE scope is
  //     self-resolving (`SELF_RESOLVING_SCOPES`), so it costs no extra picks — and it still
  //     covers the cocooned unit, which is an ally like any other. Zombified does not stack, so
  //     re-granting it to a board that already has it is a no-op rather than a compounding one.
  noctua: {
    name: 'Curse Bound',
    icon: '💀',
    desc: 'The cocoon heals 6 instead of 3, and ALL your units gain Zombified (each revives once at 1 HP).',
    power: (hp) => ({
      ...hp,
      effects: [
        ...hp.effects.map((e) =>
          e.kind === 'applyStatus' && e.status === 'sleep' ? { ...e, amount: (e.amount ?? 0) * 2 } : e,
        ),
        { kind: 'applyStatus', target: 'all-ally', status: 'zombified' },
      ],
    }),
  },
  // The shell network moves his own as readily as the enemy — and anchors the ground.
  naife: {
    name: 'Shell Network',
    icon: '🐢',
    desc: 'Misdirect can also relocate one of your own units, and Environments cost 1 less.',
    power: also({ kind: 'move', target: 'ally' }),
    costMods: { environment: -1 },
  },
};

export const leaderUpgrade = (leaderId: string): LeaderUpgrade | undefined => LEADER_UPGRADES[leaderId];

/** Has this run already bought its one-time unique? */
export const hasUnique = (upgrades: readonly HeroUpgrade[]): boolean => upgrades.some((u) => u.kind === 'unique');

/**
 * Which upgrade kinds a run may still buy. `unique` drops off once taken (and is
 * absent for a leader with no authored upgrade); `attune` is always available.
 */
export const applicableUpgrades = (leaderId: string, upgrades: readonly HeroUpgrade[]): HeroUpgradeKind[] => {
  const out: HeroUpgradeKind[] = [];
  if (LEADER_UPGRADES[leaderId] && !hasUnique(upgrades)) out.push('unique');
  out.push('attune');
  return out;
};

/** Return a clone of `leader` with its hero power modified by its unique, if bought. */
export const applyHeroUpgrades = (leader: Leader, upgrades: readonly HeroUpgrade[]): Leader => {
  const unique = LEADER_UPGRADES[leader.id];
  if (!unique?.power || !hasUnique(upgrades)) return leader;
  const hp = unique.power(structuredClone(leader.heroPower));
  // The authored `text` describes the BASE power; once upgraded it would lie, so drop
  // it and let the UI derive an accurate line from `effects`.
  delete hp.text;
  return { ...leader, heroPower: hp };
};

// --- Signature buffs (act 2 boss reward) -----------------------------------------

/**
 * A permanent upgrade to the leader's SIGNATURE card, awarded by the act 2 boss.
 *
<<<<<<< Updated upstream
 * One per leader, keyed by leader id. `card` rewrites the signature card definition;
 * `runRegistry` swaps the rewritten def in, so the buffed signature is what gets
 * delivered to hand when the leader crosses the Signature threshold.
 *
 * NOTE: the per-leader effects are not yet authored — this is the delivery framework.
 * Add entries here (same shape as LEADER_UPGRADES) and they take effect immediately;
 * a leader with no entry simply keeps their base signature.
=======
 * One per leader, keyed by leader id -- all 13 are authored below. `card` rewrites
 * the signature card definition; `runRegistry` swaps the rewritten def in, so the
 * buffed signature is what gets delivered to hand when the leader crosses the
 * Signature threshold.
 *
 * A leader with NO entry is not offered the unlock at all: `bossUnlock` (run.ts) reads
 * this table, so the act 2 boss grants that leader a bonus relic instead of a reward
 * screen promising an empowered Signature that does nothing. Adding a new leader
 * without an entry here degrades gracefully to that fallback rather than a dead unlock
 * -- authoring an entry (same shape as LEADER_UPGRADES) is the only step needed to
 * turn the real unlock on for one.
>>>>>>> Stashed changes
 */
export interface SignatureUpgrade {
  name: string;
  icon: string;
  desc: string;
  card: (c: Card) => Card;
}

/**
 * Small typed helpers so each upgrade stays a one-liner instead of repeating the
 * discriminated-union narrowing. A transform that does not match its card's type is a
 * no-op rather than a crash — an authoring mistake degrades to "no buff", never to a
 * broken run.
 */
const spellFx = (fn: (effects: Effect[]) => Effect[]) => (c: Card): Card =>
  c.type === 'spell' ? { ...c, effects: fn(c.effects) } : c;

/** Rewrite the keywords a Foundation grants to the unit bonded above it. */
const grantKw = (extra: Keywords) => (c: Card): Card =>
  c.type === 'foundation'
    ? { ...c, grants: { ...c.grants, keywords: { ...c.grants?.keywords, ...extra } } }
    : c;

/**
 * Rewrite the keywords a SPELL's `buff` effect grants. The twin of `grantKw` for a signature
 * that hands its keywords out directly rather than through ground beneath a unit.
 *
 * Typed `EffectGrantKeywords`, not `Keywords`: a `buff` merges with a shallow `Object.assign`,
 * so only the keywords a bare merge fully wires up may be granted this way. That is not a
 * technicality here — it is why Noctua's upgrade no longer grants Countdown.
 */
const buffKw = (extra: EffectGrantKeywords) => (c: Card): Card =>
  c.type === 'spell'
    ? { ...c, effects: c.effects.map((e) => (e.kind === 'buff' ? { ...e, keywords: { ...e.keywords, ...extra } } : e)) }
    : c;

/** Rewrite a unit card's own keywords. */
const unitKw = (extra: Keywords) => (c: Card): Card =>
  c.type === 'unit' ? { ...c, keywords: { ...c.keywords, ...extra } } : c;

/** Re-describe a card alongside whatever structural change it just received. */
const retext = (text: string, fn: (c: Card) => Card) => (c: Card): Card => ({ ...fn(c), text });

export const SIGNATURE_UPGRADES: Record<string, SignatureUpgrade> = {
  // Steam Bath clears the board that exists; the conjured Veil taxes everything played
  // into it afterwards. Two cards rather than one, both because a single card doing an
  // AOE status and an on-hit grant reads badly, and because the second half wants to be
  // held and timed rather than spent the instant the Signature lands.
  kedou: {
    name: 'Boiling Point', icon: '♨',
    desc: 'Steam Bath also conjures Scalding Veil — your units gain On-Hit Burn 2.',
    card: retext(
      'Signature: inflict Burn 2 on all enemy units, and conjure Scalding Veil.',
      spellFx((fx) => [...fx, { kind: 'conjure', target: 'self', cardId: 'sig-scalding-veil' }]),
    ),
  },

  // A free body that damage and status both fail to remove.
  cleath: {
    name: 'Bedrock', icon: '⛰',
    desc: 'Living Mountain gains Tough 3 and Immunity.',
    card: retext(
      'Signature: a massive free defender — Taunt, Tough 3, Immunity.',
      unitKw({ tough: 3, immunity: true }),
    ),
  },

  // Aggro's finisher: the same alpha strike, hitting harder.
  orsyric: {
    name: 'Total Commitment', icon: '⚔',
    desc: 'Overexert grants +2/0 instead of +1/0.',
    card: retext(
      'Signature: all allies gain +2/0 and a bonus attack.',
      spellFx((fx) => fx.map((e) => (e.kind === 'buff' ? { ...e, stat: { attack: 2 } } : e))),
    ),
  },

  // -9 attack disarms essentially anything, and the Poison it comes with means the
  // opponent cannot buff the unit back up: Poison blocks stat gains. The disable is
  // permanent rather than a tempo hit, which is the point of the upgraded version.
  aleph: {
    name: 'Total Reflection', icon: '☯',
    desc: 'Reflections of Omniscience strips 9 attack instead of 2.',
    card: retext(
      'Signature: every enemy unit loses 9 attack and is Poisoned.',
      spellFx((fx) => fx.map((e) => (e.kind === 'debuff' ? { ...e, stat: { attack: 9 } } : e))),
    ),
  },

  // The chosen ally survives the turn it wins on.
  phantom: {
    name: 'Perfect Mask', icon: '\u{1f3ad}',
    desc: 'Masking also grants the chosen ally Immunity and Zombified.',
    card: retext(
      'Signature: freeze all enemy units; give one of your units Pierce, Double Strike, Immunity and Zombified.',
      spellFx((fx) =>
        fx.map((e) =>
          e.kind === 'buff' ? { ...e, keywords: { ...e.keywords, immunity: true, zombified: true } } : e,
        ),
      ),
    ),
  },

  // A Foundation grants through the FULL keyword schema rather than the runtime-grantable
  // subset, so this can hand out the entire defensive toolkit at once — including Shield
  // and Countdown, which no spell's `buff` is able to grant.
  screyera: {
    name: 'Certain Future', icon: '\u{1f52e}',
    desc: 'Fortune Foretold also grants Immunity, True Shield, Shield 1, Zombified and Tough 2.',
    card: retext(
      'Signature Foundation: grants Taunt, Tough 2, Spike 2, Immunity, True Shield, Shield 1 and Zombified to the unit above it.',
      grantKw({ tough: 2, immunity: true, trueShield: true, shield: 1, zombified: true }),
    ),
  },

  // Spike on the leader-unit is deliberate and Adventure-only: SIGNATURE_UPGRADES is read
  // solely by `buildRunRegistry` inside a run, so it can never reach constructed play.
  ringleader: {
    name: 'Load-Bearing', icon: '⚙',
    desc: 'Core Component grants Shield 2 and adds Spike 1.',
    card: retext(
      'Signature: your leader-unit gains Shield 2, Bloodlust +0/+1, Pierce and Spike 1.',
      spellFx((fx) =>
        fx.map((e) =>
          e.kind === 'applyStatus' && e.status === 'shield'
            ? { ...e, amount: 2 }
            : e.kind === 'buff'
              ? { ...e, keywords: { ...e.keywords, spike: 1 } }
              : e,
        ),
      ),
    ),
  },

  // Deck Out's finisher: clear the board, then bury the hand it would rebuild from.
  // `conjure` reaches a HAND, never a deck (there is no deck-insert effect in the engine),
  // which suits this better anyway — the hand cap means the overflow is forgotten outright.
  johnpork: {
    name: 'Last Call', icon: '\u{1f37a}',
    desc: 'Happy Hour also forces five Dead Weights into the enemy hand and mills two cards.',
    card: retext(
      'Signature: expel every enemy unit to the opponent’s hand, add five Dead Weights to it, and make them forget 2 cards.',
      spellFx((fx) => [
        ...fx,
        ...Array.from({ length: 5 }, (): Effect => ({ kind: 'conjure', target: 'enemy', cardId: 'dead-weight' })),
        { kind: 'forget', amount: 2, target: 'enemy' },
      ]),
    ),
  },

  // Double Team is a lane-capacity flag and is absent from the grantable subset, so the
  // summons are re-pointed at a token that already carries it rather than granting it.
  autopus: {
    name: 'Parallel Process', icon: '\u{1f419}',
    desc: 'The summoned Techtacles gain Double Team, so every lane can hold a second unit.',
    card: retext(
      'Signature: summon a Twinned Techtacle (Lethal, True Shield, Airborne, Double Team) in every lane.',
      spellFx((fx) => fx.map((e) => (e.kind === 'summon' ? { ...e, cardId: 'critter-elite-pair' } : e))),
    ),
  },

  // Two strikes, each able to start its own Loose Ends chain.
  eksana: {
    name: 'Double Contract', icon: '\u{1f5e1}',
    desc: 'Swift Kill strikes twice — each kill starts its own chain.',
    card: retext(
      'Signature: deal 5 to an enemy, twice. Each kill adds Loose Ends to your hand.',
      spellFx((fx) => [...fx, ...fx.filter((e) => e.kind === 'damage')]),
    ),
  },

  // Restored to its original design once COUNTDOWN was made grantable (see the keyword's own
  // comment in schema.ts). It had to be dropped when Death Goddess' Will became a spell,
  // because a `buff` merges only the grantable subset and Countdown was outside it — not for
  // any runtime reason, it turns out, but because naming `effectSchema` from the grantable
  // shape created a type cycle. Countdown itself is stateless (`resolveEndOfTurn` drives it
  // off `turnsInPlay`), so a bare merge always did wire it up correctly.
  //
  // `repeat: true` is REQUIRED for a granted countdown, not decoration: the clock is the
  // unit's AGE, so a one-shot would need the unit to be exactly `turns` old at the moment it
  // is granted, and would silently never fire on anything older.
  noctua: {
    name: 'Eternal Vigil', icon: '\u{1f989}',
    desc: 'Death Goddess’ Will also grants Countdown 2: Shield 1, refreshing forever.',
    card: retext(
      'Signature: an ally gains Immunity, Zombified, Growth +2/+2 and Countdown 2: Shield 1.',
      buffKw({
        countdown: {
          turns: 2,
          repeat: true,
          effects: [{ kind: 'applyStatus', amount: 1, target: 'self', status: 'shield' }],
        },
      }),
    ),
  },

  // The cascade, made free to ride. `discountHand` attaches the discount to the copies in
  // hand at that instant and to nothing else — a player-level `costMod` would also cheapen
  // everything drawn for the rest of the turn, and `costBase` everything for the rest of
  // the fight. Combined with the conjure trigger this is deliberately the strongest
  // Signature in Adventure; the per-turn conjure cap (RULES.CONJURE_ON_PLAY_PER_TURN) is
  // what keeps "play a card, get a card, play it" from being a literal infinite loop.
  corpselock: {
    name: 'Terminal Bloom', icon: '\u{1f9ec}',
    desc: 'Stage 4 also drops every card in your hand to 0 energy — permanently, for those copies.',
    card: retext(
      'Signature: fill every element bank to its cap. Every card in your hand costs 0 energy from now on, and every card you play conjures a random card into your hand.',
      spellFx((fx) => [...fx, { kind: 'discountHand', amount: -99 }]),
    ),
  },

  // Lane Control's finisher: the whole board becomes untouchable, and the environments to
  // reshape it arrive free.
  naife: {
    name: 'Rewritten Ground', icon: '\u{1f30a}',
    desc: 'Guardian of Ruins protects ALL allies and conjures two Tundras.',
    card: retext(
      'Signature: give every ally Immunity and Pierce. All environments cost 0 energy this turn. Conjure two Tundras.',
      spellFx((fx) => [
        ...fx.map((e) => (e.kind === 'buff' ? { ...e, target: 'all-ally' as const } : e)),
        { kind: 'conjure', target: 'self', cardId: 'tundra' },
      ]),
    ),
  },
};

export const signatureUpgrade = (leaderId: string): SignatureUpgrade | undefined => SIGNATURE_UPGRADES[leaderId];

/**
 * Apply the leader's signature buff to their signature card, if claimed. Returns the
 * card untouched when the buff isn't owned or no upgrade is authored for the leader.
 */
export const applySignatureUpgrade = (leaderId: string, card: Card, claimed: boolean): Card => {
  const up = SIGNATURE_UPGRADES[leaderId];
  if (!claimed || !up) return card;
  return up.card(structuredClone(card));
};

export interface HeroStateMods {
  elementCapDeltas: { element: Element; amount: number }[];
  costMods: Partial<PlayerState['costMods']>;
}

/** Battle-state mods owed by a run's upgrades: attune caps, plus any unique's discounts. */
export const heroStateMods = (leaderId: string, upgrades: readonly HeroUpgrade[]): HeroStateMods => {
  const elementCapDeltas: { element: Element; amount: number }[] = [];
  for (const u of upgrades) if (u.kind === 'attune') elementCapDeltas.push({ element: u.element, amount: 1 });
  const unique = LEADER_UPGRADES[leaderId];
  const costMods = unique && hasUnique(upgrades) ? (unique.costMods ?? {}) : {};
  return { elementCapDeltas, costMods };
};

/** Apply `heroStateMods` to the player's side of an opening GameState (mutates). */
export const applyHeroModsToState = (state: GameState, mods: HeroStateMods, seat: PlayerId = 0): void => {
  const me = state.players[seat];
  for (const { element, amount } of mods.elementCapDeltas) me.elementCaps[element] += amount;
  // Cost discounts go on the PERSISTENT `costBase` — `costMods` is wiped at the first
  // turn-end, which would make a run-long discount (Naife's Environments) last one turn.
  if (Object.keys(mods.costMods).length > 0) {
    me.costBase ??= { unit: 0, spell: 0, foundation: 0, environment: 0 };
    for (const [key, delta] of Object.entries(mods.costMods)) {
      if (delta !== undefined) me.costBase[key as keyof typeof me.costBase] += delta;
    }
  }
};
