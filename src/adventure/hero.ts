/**
 * Leader progression: a run's permanent leader upgrades.
 *
 * Two kinds (see `heroUpgradeSchema`):
 *  - `unique`   — the leader's own hand-authored upgrade, one per leader, one-time.
 *                 AWARDED by the act 1 boss, not bought.
 *  - `attune`   — +1 to one element's banking cap, repeatable, available to everyone.
 *                 Bought at Enhance nodes (not Rest Sites).
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
import type { Card, Effect, Element, FoundationCard, Leader, UnitCard } from '@cards/schema';
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
    desc: 'Cancerous Growth repays only 1 of the 3 energy it borrows — the growth outruns the debt.',
    power: also({ kind: 'energyNext', amount: 1 }),
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
  // A blade she never needed to sharpen.
  eksana: {
    name: 'Poisoned Blade',
    icon: '🗡',
    desc: 'Exploit also Poisons the target.',
    power: also({ kind: 'applyStatus', target: 'enemy', status: 'poison' }),
  },
  // The curse she carries, she can now lend out.
  noctua: {
    name: 'Curse Bound',
    icon: '💀',
    desc: 'Tinkerer also grants Zombified (the unit revives once at 1 HP).',
    power: (hp) => ({
      ...hp,
      effects: hp.effects.map((e) =>
        e.kind === 'buff' ? { ...e, keywords: { ...e.keywords, zombified: true } } : e,
      ),
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
 * One per leader, keyed by leader id. `card` rewrites the signature card definition;
 * `runRegistry` swaps the rewritten def in, so the buffed signature is what gets
 * delivered to hand when the leader crosses the Signature threshold.
 *
 * All 13 leaders are authored below. A leader with NO entry is not offered the unlock at
 * all: `bossUnlock` (run.ts) reads this table, so the act 2 boss grants that leader a bonus
 * relic instead of a reward screen promising an empowered Signature that does nothing. That
 * gate stays — it is what keeps a custom or future leader with no authored buff honest.
 *
 * The transform must preserve the card's `id`: `runRegistry` re-keys the rewritten def by
 * `buffed.id`, so changing it would file the buff under a card nothing looks up. It must
 * also rewrite `text`, which the card detail panel renders verbatim — the authored line
 * describes the BASE card and would lie about the upgraded one (the same reason
 * `applyHeroUpgrades` drops the hero power's `text`).
 */
export interface SignatureUpgrade {
  name: string;
  icon: string;
  desc: string;
  card: (c: Card) => Card;
}

/**
 * Rewrite a SPELL signature: new rules text plus a transform of its effect list. A card of
 * any other type is returned untouched, so a mis-keyed entry degrades to a no-op rather
 * than producing a malformed card.
 */
const spellSig =
  (text: string, fx: (effects: Effect[]) => Effect[]) =>
  (c: Card): Card =>
    c.type === 'spell' ? { ...c, text, effects: fx(c.effects) } : c;

/** Rewrite a UNIT signature (Cleath's free defender). */
const unitSig =
  (text: string, fn: (u: UnitCard) => UnitCard) =>
  (c: Card): Card =>
    c.type === 'unit' ? fn({ ...c, text }) : c;

/** Rewrite a FOUNDATION signature (Screyera's and Noctua's grant-platforms). */
const foundationSig =
  (text: string, fn: (f: FoundationCard) => FoundationCard) =>
  (c: Card): Card =>
    c.type === 'foundation' ? fn({ ...c, text }) : c;

/**
 * The 13 signature buffs, keyed by leader id — one per leader, mirroring LEADER_UPGRADES.
 *
 * Each is built from primitives the engine already supports, so none needs engine work:
 * an added effect resolves through `applyEffects` like any other, and extra targeted
 * effects consume their own target (`targets[cursor++]` in effects.ts).
 *
 * These are deliberately LARGE. The Signature only arrives once the leader is at or below
 * half HP, and this buff costs an act 2 boss kill on top of that — it is the comeback
 * payoff for a run that has already been ground down, not a card the player curves into.
 */
export const SIGNATURE_UPGRADES: Record<string, SignatureUpgrade> = {
  // The bath boils over: DoT runs on BOTH tickers, so the upgrade adds the second one.
  kedou: {
    name: 'Boiling Point',
    icon: '♨',
    desc: 'Steam Bath inflicts Burn 3 instead of Burn 2, and also Poisons every enemy.',
    card: spellSig('Signature: inflict Burn 3 and Poison on all enemy units.', (fx) => [
      ...fx.map((e) => (e.kind === 'applyStatus' && e.status === 'burn' ? { ...e, amount: 3 } : e)),
      { kind: 'applyStatus', target: 'all-enemy', status: 'poison' },
    ]),
  },
  // The wall stops being something to climb and starts being something that hits back.
  cleath: {
    name: 'The Mountain Wakes',
    icon: '⛰',
    desc: 'Living Mountain arrives as a 4/6 with Tough 3 and Spike 2.',
    card: unitSig('Signature: a massive free defender that punishes every attacker.', (u) => ({
      ...u,
      attack: 4,
      hp: 6,
      keywords: { ...u.keywords, tough: 3, spike: 2 },
    })),
  },
  // The last charge goes THROUGH the wall — Aggro's losing matchup is the one that blocks.
  orsyric: {
    name: 'Last Breath',
    icon: '🔥',
    desc: 'Overexert grants +2/0 instead of +1/0, and gives every ally Pierce for the swing.',
    card: spellSig('Signature: all allies gain +2/0, Pierce and a bonus attack.', (fx) =>
      fx.map((e) => (e.kind === 'buff' ? { ...e, stat: { attack: 2 }, keywords: { ...e.keywords, pierce: true } } : e)),
    ),
  },
  // He does not merely level the board; he forbids it from rising again.
  aleph: {
    name: 'Final Judgement',
    icon: '⚖',
    desc: 'Reflections of Omniscience reduces enemies by -3/-3 and Poisons them, so they cannot be buffed back.',
    card: spellSig('Signature: reduce every enemy unit by -3/-3 and Poison them.', (fx) => [
      ...fx.map((e) => (e.kind === 'debuff' ? { ...e, stat: { attack: 3, hp: 3 } } : e)),
      { kind: 'applyStatus', target: 'all-enemy', status: 'poison' },
    ]),
  },
  // The mask covers the whole board: everything frozen, everything of his striking twice.
  phantom: {
    name: 'Total Eclipse',
    icon: '🎭',
    desc: 'Masking gives Pierce and Double Strike to EVERY ally, not just one.',
    card: spellSig('Signature: freeze all enemy units and give all your units Pierce and Double Strike.', (fx) =>
      fx.map((e) => (e.kind === 'buff' ? { ...e, target: 'all-ally' as const } : e)),
    ),
  },
  // The keystone finally carries the weight the prophecy promised it would.
  screyera: {
    name: 'Destiny Written',
    icon: '🔮',
    desc: 'Fortune Foretold is a 4/7 and grants +2/+3 and Spike 3 to the unit above it.',
    card: foundationSig(
      'Signature Foundation: grants +2/+3, Taunt, Tough 1 and Spike 3 to the unit above it.',
      (f) => ({
        ...f,
        attack: 4,
        hp: 7,
        grants: { ...f.grants, stat: { attack: 2, hp: 3 }, keywords: { ...f.grants.keywords, spike: 3 } },
      }),
    ),
  },
  // Top billing: the avatar walks out with a guarantee that whatever it touches dies.
  ringleader: {
    name: 'Main Event',
    icon: '🎩',
    desc: 'Core Component grants Shield 2, Lethal, and Bloodlust +1/+1.',
    card: spellSig('Signature: your leader-unit gains Shield 2, Lethal, Pierce and Bloodlust +1/+1.', (fx) =>
      fx.map((e) => {
        if (e.kind === 'applyStatus' && e.status === 'shield') return { ...e, amount: 2 };
        if (e.kind === 'buff') {
          return { ...e, keywords: { ...e.keywords, lethal: true, bloodlust: { buff: { attack: 1, hp: 1 } } } };
        }
        return e;
      }),
    ),
  },
  // Full banks are worthless with an empty hand — the terminal stage supplies both.
  corpselock: {
    name: 'Terminal Stage',
    icon: '🦠',
    desc: 'Stage 4 also draws 2 cards, so the filled banks have something to be spent on.',
    card: spellSig('Signature: fill every element bank to its cap and draw 2 cards.', (fx) => [
      ...fx,
      { kind: 'draw', amount: 2 },
    ]),
  },
  // Last call empties the room AND the cellar: the board goes back to hand, the deck thins.
  johnpork: {
    name: 'Last Call',
    icon: '🍺',
    desc: 'Happy Hour also makes the opponent forget 3 cards from their deck.',
    card: spellSig(
      "Signature: expel every enemy unit to the opponent's hand (overflowing it) and make them forget 3 cards.",
      (fx) => [...fx, { kind: 'forget', amount: 3, target: 'enemy' }],
    ),
  },
  // The swarm arrives already running — a board of Techtacles that has to wait a turn is a
  // board the opponent simply answers.
  autopus: {
    name: 'Overclock',
    icon: '🐙',
    desc: '8Bits also gives every ally +1/+1 and Battle Ready, so the swarm attacks the turn it lands.',
    card: spellSig(
      'Signature: summon a Techtacle in every lane; all allies gain +1/+1 and Battle Ready.',
      (fx) => [...fx, { kind: 'buff', target: 'all-ally', stat: { attack: 1, hp: 1 }, keywords: { battleReady: true } }],
    ),
  },
  // A sharper blade cuts a longer chain — and nothing it has frozen or walled is safe.
  eksana: {
    name: 'Execution Order',
    icon: '🗡',
    desc: 'Swift Kill opens at 7 damage instead of 5, and pierces Freeze, Shield and Tough.',
    card: spellSig('Signature: deal 7 to an enemy, ignoring defences; on a kill, chain 6, 5, 4… onward.', (fx) =>
      fx.map((e) => (e.kind === 'damage' ? { ...e, amount: 7, pierce: true } : e)),
    ),
  },
  // Ascension completes: the host stops dying at all, and grows faster while it does not.
  noctua: {
    name: 'Apotheosis',
    icon: '💀',
    desc: "Death Goddess' Will is a 4/6 and grants True Shield and Growth +3/+3.",
    card: foundationSig(
      'Signature Foundation: grants Immunity, Zombified, True Shield and Growth +3/+3 to the unit above it.',
      (f) => ({
        ...f,
        attack: 4,
        hp: 6,
        grants: {
          ...f.grants,
          keywords: { ...f.grants.keywords, trueShield: true, growth: { attack: 3, hp: 3 } },
        },
      }),
    ),
  },
  // The ruins answer to him now: the whole line is warded, and there is a second field to
  // lay down for free while the discount lasts.
  naife: {
    name: 'Ruins Reclaimed',
    icon: '🐢',
    desc: 'Guardian of Ruins wards EVERY ally and conjures a Tidal Rift alongside the Tundra.',
    card: spellSig(
      'Signature: give all your units Immunity and Pierce. All environments cost 0 energy this turn. Conjure a Tundra and a Tidal Rift.',
      (fx) => [
        ...fx.map((e) => (e.kind === 'buff' ? { ...e, target: 'all-ally' as const } : e)),
        { kind: 'conjure', target: 'self', cardId: 'tidal-rift' },
      ],
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
