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
import type { Card, Effect, Element, Leader } from '@cards/schema';
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
 * NOTE: the per-leader effects are not yet authored — this is the delivery framework.
 * Add entries here (same shape as LEADER_UPGRADES) and they take effect immediately;
 * a leader with no entry simply keeps their base signature.
 */
export interface SignatureUpgrade {
  name: string;
  icon: string;
  desc: string;
  card: (c: Card) => Card;
}

export const SIGNATURE_UPGRADES: Record<string, SignatureUpgrade> = {
  // Intentionally empty until the per-leader buffs are authored.
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
