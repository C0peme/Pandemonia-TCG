/**
 * Battle twists — the special rules a Trial or Boss fight is fought under.
 *
 * DESIGN RULE: a twist is always **deterministic and fully stated**. Variety comes
 * from *which* twist you face (rolled at map generation and telegraphed on the map),
 * never from hidden randomness inside the twist itself — the player must be able to
 * read the rule and plan around it before committing to the fight.
 *
 * Mechanisms, all engine-free:
 *  - `globalBuff` / `globalKeyword` / `globalOnPlayStatus`: rewrite the run registry
 *    both sides resolve through, so the rule is symmetric by construction and also
 *    covers summons.
 *  - `fixedEnvironments`: pre-place named environment cards in named lanes on the
 *    initial GameState (their grants/on-enter effects then run through the engine).
 *  - `fixedUnits`: pre-place a named unit card in named lanes/sides on the initial
 *    GameState (e.g. boss minions waiting at battle start).
 *  - `composite`: bundles several of the above into one twist id, for a boss that
 *    needs more than one rule active at once.
 */
import type { Registry } from '@cards/registry';
import type { StatMod, EffectGrantKeywords, Effect } from '@cards/schema';
import type { GameState, PlayerId } from '@engine/types';
import { LANES, type LaneId } from '@engine/constants';
import { refreshEnvironmentGrants } from '@engine/environment';
import { createUnitInstance } from '@engine/board';
import { laneAllowed } from '@engine/engine';

interface TwistBase {
  id: string;
  name: string;
  blurb: string;
  /** Boss signature gimmicks aren't rolled by ordinary Trial/Elite nodes. */
  bossOnly?: boolean;
}

/** Keyword payloads: a flag (airborne), a magnitude (spike/tough), or a StatMod (growth). */
export type KeywordValue = true | number | StatMod;

/** The subset of statuses a `globalOnPlayStatus` twist can inflict on entry. */
export type OnPlayStatus = NonNullable<Effect['status']>;

export type TrialTwist =
  | (TwistBase & { kind: 'globalBuff'; stat: StatMod })
  | (TwistBase & { kind: 'globalKeyword'; keyword: keyof EffectGrantKeywords; value: KeywordValue })
  | (TwistBase & { kind: 'globalOnPlayStatus'; status: OnPlayStatus })
  | (TwistBase & { kind: 'fixedEnvironments'; places: { lane: LaneId; cardId: string }[] })
  | (TwistBase & { kind: 'fixedUnits'; cardId: string; lanes?: LaneId[]; sides?: PlayerId[] })
  | (TwistBase & { kind: 'composite'; twists: TrialTwist[] });

/** Flatten a (possibly composite) twist into the list of leaf twists it applies. */
export const flattenTwist = (twist: TrialTwist): TrialTwist[] =>
  twist.kind === 'composite' ? twist.twists.flatMap(flattenTwist) : [twist];

/** Every twist in the game (trial-rollable + boss signatures). */
export const TWISTS: TrialTwist[] = [
  // --- rollable by Trial / Elite nodes ---
  { id: 'surge', name: 'Surge of Power', blurb: 'Every unit has +1/+1.', kind: 'globalBuff', stat: { attack: 1, hp: 1 } },
  { id: 'stampede', name: 'Stampede', blurb: 'Every unit has +2 attack.', kind: 'globalBuff', stat: { attack: 2 } },
  { id: 'thorned-world', name: 'Thorned World', blurb: 'Every unit has Spike 1 — attacking always costs you.', kind: 'globalKeyword', keyword: 'spike', value: 1 },
  { id: 'winged-omen', name: 'Winged Omen', blurb: 'Every unit is Airborne.', kind: 'globalKeyword', keyword: 'airborne', value: true },
  { id: 'hardened', name: 'Hardened Earth', blurb: 'Every unit has Tough 1 — all damage is reduced by 1.', kind: 'globalKeyword', keyword: 'tough', value: 1 },
  {
    id: 'scorched-ground', name: 'Scorched Ground',
    blurb: 'Molten Floor covers both Ground lanes — units entering them are Burned.',
    kind: 'fixedEnvironments', places: [{ lane: 'ground1', cardId: 'molten-floor' }, { lane: 'ground2', cardId: 'molten-floor' }],
  },
  {
    id: 'open-shallows', name: 'Open Shallows',
    blurb: 'The Shallows fill the Water lane — every unit there gains Aquatic instead of drowning.',
    kind: 'fixedEnvironments', places: [{ lane: 'water', cardId: 'shallows' }],
  },

  // --- boss signatures (never rolled by Trial/Elite nodes) ---
  {
    id: 'boss-drowned-tide', name: 'Drowning Tide', bossOnly: true,
    blurb: 'Tundra freezes anything entering either Ground lane, while the Shallows open the Water to everyone. Fight at sea, or fight frozen.',
    kind: 'fixedEnvironments',
    places: [{ lane: 'ground1', cardId: 'tundra' }, { lane: 'ground2', cardId: 'tundra' }, { lane: 'water', cardId: 'shallows' }],
  },
  {
    id: 'boss-endless-growth', name: 'Endless Growth', bossOnly: true,
    blurb: 'Every unit has Growth +1/+1 — the longer this runs, the worse it gets.',
    kind: 'globalKeyword', keyword: 'growth', value: { attack: 1, hp: 1 },
  },
  {
    id: 'boss-plague-fields', name: 'Plague Fields', bossOnly: true,
    blurb: 'Sludge Pool covers both Ground lanes — every unit entering the ground is Poisoned. The Heights and Water are clean.',
    kind: 'fixedEnvironments',
    places: [{ lane: 'ground1', cardId: 'sludge-pool' }, { lane: 'ground2', cardId: 'sludge-pool' }],
  },
  {
    id: 'boss-behind-the-mask', name: 'Behind the Mask', bossOnly: true,
    blurb: 'Lullaby Grove covers both Ground lanes — every unit entering the ground falls Asleep.',
    kind: 'fixedEnvironments',
    places: [{ lane: 'ground1', cardId: 'lullaby-grove' }, { lane: 'ground2', cardId: 'lullaby-grove' }],
  },
  {
    id: 'boss-serpents-loop', name: "Serpent's Loop", bossOnly: true,
    blurb: 'Shifting Sands covers both Ground lanes — every unit there wanders to a new lane each turn.',
    kind: 'fixedEnvironments',
    places: [{ lane: 'ground1', cardId: 'shifting-sands' }, { lane: 'ground2', cardId: 'shifting-sands' }],
  },
  {
    id: 'boss-forge-bound', name: 'Forge-Bound', bossOnly: true,
    blurb: 'Bunker covers both Ground lanes — every unit there gains Tough 1, forged into armor.',
    kind: 'fixedEnvironments',
    places: [{ lane: 'ground1', cardId: 'bunker' }, { lane: 'ground2', cardId: 'bunker' }],
  },
  {
    id: 'boss-nice-curse', name: 'The NICE Curse', bossOnly: true,
    blurb: 'Every unit has +0/+3 — and every unit that enters play is Poisoned.',
    kind: 'composite',
    twists: [
      { id: 'boss-nice-curse-buff', name: 'The NICE Curse (buff)', blurb: '', kind: 'globalBuff', stat: { hp: 3 } },
      { id: 'boss-nice-curse-poison', name: 'The NICE Curse (poison)', blurb: '', kind: 'globalOnPlayStatus', status: 'poison' },
    ],
  },
  {
    id: 'boss-death-artificer', name: 'Death Artificer', bossOnly: true,
    blurb: 'Every unit is Zombified.',
    kind: 'globalKeyword', keyword: 'zombified', value: true,
  },
  {
    id: 'boss-ignorance-is-bliss', name: 'Ignorance is Bliss', bossOnly: true,
    blurb: 'A mindless Follower waits in every lane, on both sides — any that survive to their owner\'s next turn sacrifice themselves and mill a card.',
    kind: 'fixedUnits', cardId: 'cult-follower',
  },
];

/** Twists ordinary Trial/Elite nodes may roll (boss signatures excluded). */
export const TRIAL_TWISTS: TrialTwist[] = TWISTS.filter((t) => !t.bossOnly);

/** @deprecated kept as the rollable pool alias; prefer TRIAL_TWISTS. */
export const TRIALS = TRIAL_TWISTS;

export const trialById = (id: string): TrialTwist | undefined => TWISTS.find((t) => t.id === id);

/**
 * Mutate a freshly-initialized GameState for the twist. Only the state-affecting kinds
 * (`fixedEnvironments`, `fixedUnits`) touch state here; registry-based kinds
 * (`globalBuff`/`globalKeyword`/`globalOnPlayStatus`) are handled by buildRunRegistry.
 * Fully deterministic — no seed involved. `composite` is flattened first so each leaf
 * twist is applied by whichever mechanism owns its kind.
 *
 * Environment placements go through the engine's `laneAllowed`, so a pre-placed hazard
 * can never sit somewhere a player couldn't legally place it themselves (the twist
 * tests assert the data is legal; this is the runtime backstop).
 */
export const applyTrialToState = (registry: Registry, state: GameState, twist: TrialTwist): GameState => {
  for (const leaf of flattenTwist(twist)) {
    if (leaf.kind === 'fixedEnvironments') {
      for (const { lane, cardId } of leaf.places) {
        const card = registry.cards.get(cardId);
        if (!card || card.type !== 'environment') continue;
        if (!laneAllowed(card.lanes, lane)) continue;
        state.environments[lane] = { iid: `env${state.iidSeq++}`, cardId, owner: 0 };
      }
      refreshEnvironmentGrants(registry, state);
    } else if (leaf.kind === 'fixedUnits') {
      const def = registry.cards.get(leaf.cardId);
      if (!def || def.type !== 'unit') continue;
      const lanes = leaf.lanes ?? LANES;
      const sides = leaf.sides ?? [0, 1];
      for (const side of sides) {
        for (const lane of lanes) {
          const laneObj = state.players[side].lanes[lane];
          if (laneObj.front || laneObj.standaloneFoundation) continue; // don't clobber
          const iid = `fu${state.iidSeq++}`;
          const drowning = lane === 'water' && !(def.keywords.aquatic || def.keywords.airborne);
          laneObj.front = createUnitInstance(def, { iid, cardId: def.id }, side, drowning);
        }
      }
    }
  }
  return state;
};
