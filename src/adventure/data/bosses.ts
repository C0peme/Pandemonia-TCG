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
 *
 * A boss's `twistId`, when present, is a symmetric rule (applies to both sides), so it
 * is only worth carrying if it measurably favors the BOSS more than the player — a
 * symmetric rule doesn't help both sides equally in practice, since it interacts with
 * each side's own deck shape. Measured 2026-09-21 (every boss vs. all 13 leaders' own
 * starter decks, fair A/B against the same fight with the twist stripped): Warhost
 * (Stampede), Autopus (Open Shallows), Phantom (Behind the Mask), Cleath (Forge-Bound),
 * Eksana (The NICE Curse) and Noctua (Death Artificer) all measured NEGATIVE or
 * negligible for their boss and had their twist removed (see trials.ts for the four
 * that were also deleted from the twist table as now-unused).
 *
 * "Measured X pp" in this file always means the delta in PLAYER win rate (full config
 * minus bare archetype) from the fair A/B test in `boss_balance.test.ts` — a NEGATIVE
 * delta means the dressing makes the fight harder (lower player win%, which is what a
 * boss-strength lever is *for*), a POSITIVE delta means it makes the fight easier
 * (higher player win%, i.e. it's undermining the boss). Getting that backwards is an easy
 * mistake — this file did, for one round, on the next finding: Drowning Tide, Endless
 * Growth and Plague Fields were originally read as "positive for the boss" and kept, but
 * they carry the LARGEST positive deltas of any boss twist (aleph/Plague Fields +28.8pp,
 * kedou/Scorched Ground +23.1pp, overgrowth/Endless Growth +13.5pp, drowned-king/Drowning
 * Tide +11.5pp, false-hydra/Ignorance is Bliss +7.7pp — measured 2026-09-24, same fair
 * test) — these ground-hazard/state twists were making their bosses among the EASIEST in
 * the roster (75-84.6% player win, vs. a 26.9-84.6% full-roster spread at the time), the
 * same "symmetric rule doesn't help both sides equally" failure mode as the twists removed
 * above, just in the direction that undertunes rather than overtunes the boss. Removed
 * `twistId` from all five for the same reason the first six were removed: Copers wants
 * boss difficulty converging to one common level, not scattered across both tails.
 * `scorched-ground` and the four bossOnly twists these bosses used to carry are left
 * defined in trials.ts (unassigned, `scorched-ground` still rollable by ordinary
 * Trial/Elite nodes) rather than deleted, since `trials.test.ts` still exercises them as
 * the concrete fixtures for the general `fixedEnvironments`/`fixedUnits` twist mechanism.
 *
 * `heroPowerOverride` is asymmetric by construction (it only ever changes the BOSS's own
 * copy of the power), so it wasn't touched by the twist pass above — but the re-measure
 * afterward showed two of them were doing the actual damage. Autopus's override
 * (Fallback Code → summons a Techtacle: Lethal/TrueShield/Airborne) turned a 2-energy
 * throwaway body into a repeatable 1-energy near-unkillable win condition — elsewhere in
 * the card pool that same unit costs 6 energy and is normally earned only four-at-once as
 * a one-time Signature spell. Cleath's override (Fortify also grants +1 attack) let its
 * Taunt wall punch back every cast, turning a stall shell into one that out-races
 * attackers too. Both measured FAR below their own bare-archetype baseline even after
 * losing their twist (autopus 11.5% vs. 53.8% bare; cleath 26.9% vs. 55.8% bare) —
 * measured 2026-09-22, removed both overrides rather than merely tone them down, matching
 * the "no tricks, full curated army" pattern already used successfully by Eksana/Noctua.
 *
 * Screyera's curse (`bossExtraDrawPerTurn`) had the same shape of problem: an extra draw
 * per turn sounds like a pure boss buff, but it doubles how fast the BOSS itself burns
 * through its own deck (see draw.ts) — so the boss decks out roughly twice as fast as
 * normal, hits its hand cap sooner, and starts taking the deck-out Null-card self-damage
 * (4 to its own leader per forgotten Null, see cards/special.ts) far earlier and more
 * often than the player does. Measured 2026-09-22: Screyera's full config scored 21.1pp
 * BELOW its own bare-archetype baseline (30.8% vs. 51.9%) — the single worst symmetric-
 * looking-but-actually-self-harming gimmick found yet. Removed `bossExtraDrawPerTurn`,
 * kept `playerMillPerTurn` (a pure player-side cost with no such backfire).
 */
export const BOSSES: Boss[] = [
  {
    id: 'warhost', name: 'Failed Heir', icon: '⚔',
    gimmick: 'No tricks, just a full curated army and a leader who trades hard.',
    leaderId: 'orsyric', bonusHp: 4,
  },
  {
    id: 'drowned-king', name: 'Guardian of Ruin', icon: '🌊',
    gimmick: 'No tricks — just a leader who moves the board against you.',
    leaderId: 'naife', bonusHp: 6,
  },
  {
    id: 'overgrowth', name: 'The Final Stage', icon: '🌿',
    gimmick: 'Energy is fixed at 10 every turn for both of you. Win fast, or be buried under an army that never stops arriving.',
    leaderId: 'corpselock', bonusHp: 6, energyOverride: 10,
  },
  {
    id: 'kedou-revolutionist', name: 'Revolutionist Monk', icon: '🔥',
    gimmick: 'No tricks — just a monk whose whole army hits hard and fast.',
    leaderId: 'kedou', bonusHp: 6,
  },
  {
    id: 'aleph-infinitude', name: 'Infinitude', icon: '☠',
    gimmick: 'No tricks — just a curated army built to grind you down.',
    leaderId: 'aleph', bonusHp: 6,
  },
  {
    id: 'phantom-warlords-daughter', name: "Warlord's Daughter", icon: '💧',
    gimmick: "She hides behind no trick — just her father's full curated army.",
    leaderId: 'phantom', bonusHp: 6,
  },
  {
    id: 'screyera-all-seeing', name: 'The All-Seeing', icon: '🔮',
    gimmick: 'She already knows how this ends: you forget (mill) a card every turn.',
    leaderId: 'screyera', bonusHp: 4,
    curse: { playerMillPerTurn: 1 },
  },
  {
    id: 'ringleader-executioner', name: "King's Personal Executioner", icon: '🐍',
    gimmick: 'Shifting Sands covers both Ground lanes, and Modification also relocates the leader-unit through the portal.',
    leaderId: 'ringleader', twistId: 'boss-serpents-loop', bonusHp: 4,
    heroPowerOverride: (hp) => ({ ...hp, effects: [...hp.effects, { kind: 'move', target: 'leaderUnit' }] }),
  },
  {
    id: 'false-hydra', name: 'Ignorance is Bliss', icon: '🎭',
    gimmick: 'No tricks — just a cult leader whose flock hits harder than it looks.',
    leaderId: 'johnpork', bonusHp: 6,
  },
  {
    id: 'cleath-architect', name: 'The Architect and the Builder', icon: '⛰',
    gimmick: 'No tricks — just a wall of Taunt that refuses to fall.',
    leaderId: 'cleath', bonusHp: 6,
  },
  {
    id: 'autopus-overflow', name: 'Integer Overflow', icon: '🐙',
    gimmick: 'No tricks — just a swarm that keeps rebuilding itself.',
    leaderId: 'autopus', bonusHp: 4,
  },
  {
    id: 'eksana-nice', name: 'Leader of NICE', icon: '🗡',
    gimmick: 'No tricks — just a leader whose whole army hits hard and holds up.',
    leaderId: 'eksana', bonusHp: 6,
  },
  {
    id: 'noctua-death-artificer', name: 'Death Artificer', icon: '🦉',
    gimmick: 'She wields power over unlife, not death — her army was built to outlast yours.',
    leaderId: 'noctua', bonusHp: 6,
  },
];

const byId = new Map(BOSSES.map((b) => [b.id, b]));
export const bossById = (id: string): Boss | undefined => byId.get(id);

/** Deterministic boss for an act: cycles through the table, varying per run seed. */
export const bossForAct = (seed: number, act: number): Boss => {
  const base = subSeed(seed, 'boss') % BOSSES.length;
  return BOSSES[(base + (act - 1)) % BOSSES.length]!;
};
