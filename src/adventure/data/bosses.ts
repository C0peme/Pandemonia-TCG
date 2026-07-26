/**
 * Named boss encounters — curated, telegraphed act finales.
 *
 * A boss is pure data that recombines systems already built: a themed archetype
 * deck (by leaderId), a trial twist as its battle gimmick, optional bonus HP, and —
 * for a handful of bosses whose lore demands something a twist can't express — a
 * fixed-energy override, an asymmetric per-turn "curse", and/or a transform on the
 * enemy's own hero power. `bossForAct` assigns one per act deterministically from the
 * run seed, cycling as acts pass the table length.
 */
import { subSeed } from '@adventure/seed';
import type { HeroPower } from '@adventure/runRegistry';

export interface Boss {
  id: string;
  name: string;
  icon: string;
  /** One-line telegraph shown on the map and pre-fight. */
  gimmick: string;
  /** Archetype deck/leader the boss plays (a starterDecks leaderId). Its own name may
   *  differ from the boss's display name (e.g. False Hydra plays John Pork's deck). */
  leaderId: string;
  /** A TWISTS id used as the fixed battle gimmick, if any. */
  twistId?: string;
  /** HP added on top of the boss HP curve. */
  bonusHp: number;
  /** Fixes BOTH players' turn energy to this value instead of the round number. */
  energyOverride?: number;
  /** Asymmetric per-turn card curse: the player mills, and/or the boss draws extra. */
  curse?: { playerMillPerTurn?: number; bossExtraDrawPerTurn?: number };
  /** Transform the enemy leader's hero power for this fight only. Must return a new
   *  object — never mutate the input (see runRegistry.ts's clone-safety contract). */
  heroPowerOverride?: (hp: HeroPower) => HeroPower;
}

/**
 * Every gimmick is deterministic and fully stated — the player reads the rule on the
 * map and can plan a route, a deck, and a line of play around it before committing.
 */
export const BOSSES: Boss[] = [
  {
    id: 'warhost', name: 'Failed Heir', icon: '⚔',
    gimmick: 'Every unit has +2 attack. Trades are brutal — nothing survives.',
    leaderId: 'orsyric', twistId: 'stampede', bonusHp: 4,
  },
  {
    id: 'drowned-king', name: 'Guardian of Ruin', icon: '🌊',
    gimmick: 'Tundra freezes anything entering either Ground lane, while the Shallows open the Water to everyone. Fight at sea, or fight frozen.',
    leaderId: 'naife', twistId: 'boss-drowned-tide', bonusHp: 6,
  },
  {
    id: 'overgrowth', name: 'The Final Stage', icon: '🌿',
    gimmick: 'Every unit has Growth +1/+1, and energy is fixed at 10 every turn for both of you. Win fast or be buried.',
    leaderId: 'corpselock', twistId: 'boss-endless-growth', bonusHp: 6, energyOverride: 10,
  },
  {
    id: 'kedou-revolutionist', name: 'Revolutionist Monk', icon: '🔥',
    gimmick: 'Molten Floor covers both Ground lanes — units entering them are Burned. The cauldron never stops boiling.',
    leaderId: 'kedou', twistId: 'scorched-ground', bonusHp: 6,
  },
  {
    id: 'aleph-infinitude', name: 'Infinitude', icon: '☠',
    gimmick: 'Sludge Pool covers both Ground lanes — every unit entering the ground is Poisoned. The Heights and Water are clean.',
    leaderId: 'aleph', twistId: 'boss-plague-fields', bonusHp: 6,
  },
  {
    id: 'phantom-warlords-daughter', name: "Warlord's Daughter", icon: '💧',
    gimmick: 'Lullaby Grove covers both Ground lanes — every unit entering the ground falls Asleep.',
    leaderId: 'phantom', twistId: 'boss-behind-the-mask', bonusHp: 6,
  },
  {
    id: 'screyera-all-seeing', name: 'The All-Seeing', icon: '🔮',
    gimmick: 'She already knows how this ends: she draws an extra card every turn, and you forget (mill) one every turn.',
    leaderId: 'screyera', bonusHp: 4,
    curse: { playerMillPerTurn: 1, bossExtraDrawPerTurn: 1 },
  },
  {
    id: 'ringleader-executioner', name: "King's Personal Executioner", icon: '🐍',
    gimmick: 'Shifting Sands covers both Ground lanes, and Modification also relocates the leader-unit through the portal.',
    leaderId: 'ringleader', twistId: 'boss-serpents-loop', bonusHp: 4,
    heroPowerOverride: (hp) => ({ ...hp, effects: [...hp.effects, { kind: 'move', target: 'leaderUnit' }] }),
  },
  {
    id: 'false-hydra', name: 'Ignorance is Bliss', icon: '🎭',
    gimmick: "A mindless Follower waits in every lane, on both sides. Any that survive to their owner's next turn sacrifice themselves and mill a card — the price of the cult's bliss.",
    leaderId: 'johnpork', twistId: 'boss-ignorance-is-bliss', bonusHp: 6,
  },
  {
    id: 'cleath-architect', name: 'The Architect and the Builder', icon: '⛰',
    gimmick: 'Bunker covers both Ground lanes, and Fortify now forges +1 attack alongside the HP.',
    leaderId: 'cleath', twistId: 'boss-forge-bound', bonusHp: 6,
    heroPowerOverride: (hp) => ({ ...hp, effects: hp.effects.map((e) => (e.kind === 'buff' ? { ...e, stat: { attack: 1, ...e.stat } } : e)) }),
  },
  {
    id: 'autopus-overflow', name: 'Integer Overflow', icon: '🐙',
    gimmick: 'The Shallows fill the Water lane — every unit there gains Aquatic. Fallback Code now summons a Techtacle.',
    leaderId: 'autopus', twistId: 'open-shallows', bonusHp: 4,
    heroPowerOverride: (hp) => ({ ...hp, effects: hp.effects.map((e) => (e.kind === 'summon' ? { ...e, cardId: 'critter-elite' } : e)) }),
  },
  {
    id: 'eksana-nice', name: 'Leader of NICE', icon: '🗡',
    gimmick: 'Every unit has +0/+3 — and every unit that enters play is Poisoned. Attacking her is never free.',
    leaderId: 'eksana', twistId: 'boss-nice-curse', bonusHp: 6,
  },
  {
    id: 'noctua-death-artificer', name: 'Death Artificer', icon: '🦉',
    gimmick: 'Every unit is Zombified. She wields power over unlife, not death.',
    leaderId: 'noctua', twistId: 'boss-death-artificer', bonusHp: 6,
  },
];

const byId = new Map(BOSSES.map((b) => [b.id, b]));
export const bossById = (id: string): Boss | undefined => byId.get(id);

/** Deterministic boss for an act: cycles through the table, varying per run seed. */
export const bossForAct = (seed: number, act: number): Boss => {
  const base = subSeed(seed, 'boss') % BOSSES.length;
  return BOSSES[(base + (act - 1)) % BOSSES.length]!;
};
