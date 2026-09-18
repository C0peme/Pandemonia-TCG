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
import { LANES, RULES, type LaneId, type LaneLayout } from '@engine/constants';
import { refreshEnvironmentGrants } from '@engine/environment';
import { createUnitInstance } from '@engine/board';
<<<<<<< Updated upstream
=======
import { drawCard } from '@engine/draw';
import { reconcileDrowning } from '@engine/drowning';
>>>>>>> Stashed changes
import { laneAllowed } from '@engine/engine';
import { applyLaneLayout } from '@engine/bossRules';

interface TwistBase {
  id: string;
  name: string;
  blurb: string;
  /** Boss signature gimmicks aren't rolled by ordinary Trial/Elite nodes. */
  bossOnly?: boolean;
  /**
   * How hard this twist makes the fight — and therefore what the Trial pays out.
   *
   * A Trial used to be a STRICTLY BETTER combat node: identical enemy HP, identical deck
   * size, double coins AND a relic, with the only cost being a rule the player picked
   * themselves from a shortlist. Routing through Trials was free value, which is the
   * exact opposite of what the node is for.
   *
   * Severity fixes that by making the choice a WAGER instead of a search for the least
   * bad option: `trialRewardBands`/`trialCoinMult` below scale the payout with the
   * severity of the twist taken, and mapgen deliberately spans the severities when it
   * rolls a shortlist. Picking the gentle rule is still allowed — it just pays like the
   * gentle rule.
   *
   * 1 — a garnish. Changes how the board feels, rarely who wins.
   * 2 — a real condition. Most decks have to adjust their plan.
   * 3 — a different game. Some decks simply cannot be played under it.
   *
   * Required on every trial-rollable twist (asserted in trials.test.ts); boss signatures
   * may omit it, since a boss's reward is not priced off its gimmick.
   */
  severity?: 1 | 2 | 3;
}

/** Keyword payloads: a flag (airborne), a magnitude (spike/tough), or a StatMod (growth). */
export type KeywordValue = true | number | StatMod;

/** The subset of statuses a `globalOnPlayStatus` twist can inflict on entry. */
export type OnPlayStatus = NonNullable<Effect['status']>;

/**
 * A one-sided adjustment. Adventure always seats the player at 0 and the enemy at 1, and
 * `applyTrialToState` is Adventure-only, so naming the sides is safe here.
 *
 * These exist because the twist pool had exactly ONE shape — a global stat, a global
 * keyword, or an environment in both Ground lanes — and read as interchangeable as a
 * result. They are also the only honest way to build an ASYMMETRIC twist: keyword and
 * stat rules are applied by rewriting the shared run registry, so they cannot be aimed at
 * one side; draws, opening cards and energy are plain state and can.
 *
 * The existing design rule was that a twist must be SYMMETRIC. The property that actually
 * makes a twist plannable is that it is fully STATED before the player commits, which an
 * asymmetric rule is just as capable of being — so the rule is relaxed to that, and the
 * asymmetric twists below name both halves of the bargain in their blurb.
 */
export interface SidedMod {
  side: 'player' | 'enemy';
  /** Extra cards drawn every turn (rides `turnCardMod`). */
  extraDraws?: number;
  /** Extra cards in the opening hand. */
  openingCards?: number;
  /** Extra energy on turn one only. */
  energyBonus?: number;
}

export type TrialTwist =
  | (TwistBase & { kind: 'globalBuff'; stat: StatMod })
  | (TwistBase & { kind: 'globalKeyword'; keyword: keyof EffectGrantKeywords; value: KeywordValue })
  | (TwistBase & { kind: 'globalOnPlayStatus'; status: OnPlayStatus })
  | (TwistBase & { kind: 'fixedEnvironments'; places: { lane: LaneId; cardId: string }[] })
  | (TwistBase & { kind: 'fixedUnits'; cardId: string; lanes?: LaneId[]; sides?: PlayerId[] })
  /** Both players' turn energy is FIXED at this value instead of the round number. */
  | (TwistBase & { kind: 'fixedEnergy'; energy: number })
  /** Both players draw this many extra cards every turn (and get the hand room for them). */
  | (TwistBase & { kind: 'globalDraw'; extraDraws: number })
  /**
   * Both players' remaining DRAW PILES are cut to this many cards. Only the in-fight
   * shuffled pile is touched — the run's persisted deck is never modified, so this can
   * never cost the player a card they own.
   */
  | (TwistBase & { kind: 'shortDecks'; cards: number })
  /** One-sided adjustments, for asymmetric twists that state both halves. */
  | (TwistBase & { kind: 'sided'; mods: SidedMod[] })
  /**
   * AUTOPILOT: every Nth round, the AI plays the PLAYER's turn (`GameState.autopilot`).
   *
   * The one twist kind that is one-sided by nature rather than by choice — the enemy
   * seat is already played by the AI, so "the commander takes your turn" has no enemy
   * half to state. It stays inside the design rule because that rule is STATEDNESS, not
   * symmetry: the round counter is on the HUD and the blurb names the interval, so the
   * player knows before committing which rounds are not theirs.
   */
  | (TwistBase & { kind: 'autopilot'; everyRounds: number })
  /**
   * RE-LAY THE BOARD: change which of the five columns is Heights, Ground or Water, and
   * optionally pre-place Environments into the new lanes.
   *
   * The most structural twist in the table — it does not adjust the units, it changes the
   * terrain they are fought over, so a deck's whole lane plan has to be rebuilt. An
   * Airborne-heavy deck loses its free Heights; a grounded deck can be pushed into the
   * water. Fully stated before the player commits, like every other twist.
   *
   * Shares `applyLaneLayout` with `BossRules.laneLayout` — see there.
   */
  | (TwistBase & { kind: 'laneLayout'; types: LaneLayout; places?: { lane: LaneId; cardId: string }[] })
  | (TwistBase & { kind: 'composite'; twists: TrialTwist[] });

/** Flatten a (possibly composite) twist into the list of leaf twists it applies. */
export const flattenTwist = (twist: TrialTwist): TrialTwist[] =>
  twist.kind === 'composite' ? twist.twists.flatMap(flattenTwist) : [twist];

/** Every twist in the game (trial-rollable + boss signatures). */
export const TWISTS: TrialTwist[] = [
  // ---------------------------------------------------------------------------------
  // SEVERITY 1 — a garnish. Changes how the board feels, rarely who wins. Pays least.
  // ---------------------------------------------------------------------------------
  { id: 'surge', name: 'Surge of Power', blurb: 'Every unit has +1/+1.', severity: 1, kind: 'globalBuff', stat: { attack: 1, hp: 1 } },
  { id: 'thorned-world', name: 'Thorned World', blurb: 'Every unit has Spike 1 — attacking always costs you.', severity: 1, kind: 'globalKeyword', keyword: 'spike', value: 1 },
  { id: 'hardened', name: 'Hardened Earth', blurb: 'Every unit has Tough 1 — all damage is reduced by 1.', severity: 1, kind: 'globalKeyword', keyword: 'tough', value: 1 },
  {
    id: 'open-shallows', name: 'Open Shallows',
    blurb: 'The Shallows fill the Water lane — every unit there gains Aquatic instead of drowning.',
    severity: 1,
    kind: 'fixedEnvironments', places: [{ lane: 'water', cardId: 'shallows' }],
  },
  {
    id: 'high-ground', name: 'The High Ground',
    blurb: 'Watchtowers crown both Heights — every unit up there gains Sniper.',
    severity: 1,
    kind: 'fixedEnvironments', places: [{ lane: 'heights', cardId: 'watchtowers' }, { lane: 'heights2', cardId: 'watchtowers' }],
  },
  {
    id: 'sanctuary', name: 'Sanctuary',
    blurb: 'Sanctified Ground covers both Ground lanes — units there are Immune to afflictions.',
    severity: 1,
    kind: 'fixedEnvironments', places: [{ lane: 'ground1', cardId: 'sanctified-ground' }, { lane: 'ground2', cardId: 'sanctified-ground' }],
  },

  // ---------------------------------------------------------------------------------
  // SEVERITY 2 — a real condition. Most decks have to adjust their plan.
  // ---------------------------------------------------------------------------------
  { id: 'stampede', name: 'Stampede', blurb: 'Every unit has +2 attack.', severity: 2, kind: 'globalBuff', stat: { attack: 2 } },
  { id: 'winged-omen', name: 'Winged Omen', blurb: 'Every unit is Airborne.', severity: 2, kind: 'globalKeyword', keyword: 'airborne', value: true },
  { id: 'war-drums', name: 'War Drums', blurb: 'Every unit has Battle Ready — everything attacks the turn it lands.', severity: 2, kind: 'globalKeyword', keyword: 'battleReady', value: true },
  { id: 'blood-moon', name: 'Blood Moon', blurb: 'Every unit has Bloodlust +1/+1 — each kill makes the killer bigger.', severity: 2, kind: 'globalKeyword', keyword: 'bloodlust', value: { attack: 1, hp: 1 } },
  { id: 'ashfall', name: 'Ashfall', blurb: 'Every unit that enters play is Burned.', severity: 2, kind: 'globalOnPlayStatus', status: 'burn' },
  {
    id: 'scorched-ground', name: 'Scorched Ground',
    blurb: 'Molten Floor covers both Ground lanes — units entering them are Burned.',
    severity: 2,
    kind: 'fixedEnvironments', places: [{ lane: 'ground1', cardId: 'molten-floor' }, { lane: 'ground2', cardId: 'molten-floor' }],
  },
  {
    id: 'iron-line', name: 'Iron Line',
    blurb: 'Fortified Line holds both Ground lanes — every unit there has Taunt.',
    severity: 2,
    kind: 'fixedEnvironments', places: [{ lane: 'ground1', cardId: 'fortified-line' }, { lane: 'ground2', cardId: 'fortified-line' }],
  },
  {
    id: 'crowded-field', name: 'Crowded Field',
    blurb: 'Pocket Dimension opens both Ground lanes — each holds two units instead of one.',
    severity: 2,
    kind: 'fixedEnvironments', places: [{ lane: 'ground1', cardId: 'pocket-dimension' }, { lane: 'ground2', cardId: 'pocket-dimension' }],
  },
  {
    id: 'twin-blades', name: 'Twin Blades',
    blurb: 'Coffee Fields cover both Ground lanes — every unit there strikes twice.',
    severity: 2,
    kind: 'fixedEnvironments', places: [{ lane: 'ground1', cardId: 'coffee-fields' }, { lane: 'ground2', cardId: 'coffee-fields' }],
  },

  // --- STRUCTURAL twists: they change the SHAPE of the fight, not a stat on every unit.
  // Every one of these rides a seam the engine already had for boss curses
  // (`energyOverride`, `turnCardMod`) or is a plain edit to the opening state, so a whole
  // new category of Trial cost no engine work at all.
  {
    id: 'rationing', name: 'Rationing',
    blurb: 'Energy is fixed at 4 every turn, for both players. There is no ramp and no late game — only the curve you brought.',
    severity: 2, kind: 'fixedEnergy', energy: 4,
  },
  {
    id: 'total-mobilisation', name: 'Total Mobilisation',
    blurb: 'Both players draw 2 extra cards every turn — and burn through their decks twice as fast.',
    severity: 2, kind: 'globalDraw', extraDraws: 2,
  },
  {
    id: 'siegeworks', name: 'Siegeworks',
    blurb: 'The enemy draws 1 extra card every turn. You draw 1 extra card every turn AND open with 2 more.',
    severity: 2,
    kind: 'sided',
    mods: [
      { side: 'enemy', extraDraws: 1 },
      { side: 'player', extraDraws: 1, openingCards: 2 },
    ],
  },

  {
    id: 'standing-orders', name: 'Standing Orders',
    blurb: 'Every 5th round, the commander plays your turn for you. Rounds 5 and 10 are his; the rest are yours.',
    severity: 2, kind: 'autopilot', everyRounds: 5,
  },

  // ---------------------------------------------------------------------------------
  // SEVERITY 3 — a different game. Some decks simply cannot be played under it. Pays most.
  // ---------------------------------------------------------------------------------
  {
    id: 'the-narrows', name: 'The Narrows',
    blurb: 'The board is re-laid: Heights, Ground, Ground, Ground, Heights. The Water is gone — nothing drowns, and nothing swims.',
    severity: 2,
    kind: 'laneLayout',
    types: { heights: 'heights', ground1: 'ground', water: 'ground', ground2: 'ground', heights2: 'heights' },
  },
  {
    id: 'the-flood', name: 'The Flood',
    blurb: 'The board is re-laid: Water, Ground, Water, Ground, Water. Three columns are open sea — bring Aquatic or Airborne, or sink.',
    severity: 3,
    kind: 'laneLayout',
    types: { heights: 'water', ground1: 'ground', water: 'water', ground2: 'ground', heights2: 'water' },
  },
  {
    id: 'the-high-passes', name: 'The High Passes',
    blurb: 'The board is re-laid: every column is Heights. No water, no ground — every Sniper on the field fires freely.',
    severity: 2,
    kind: 'laneLayout',
    types: { heights: 'heights', ground1: 'heights', water: 'heights', ground2: 'heights', heights2: 'heights' },
  },
  { id: 'killing-field', name: 'Killing Field', blurb: 'Every unit has Lethal — any damage to a unit destroys it.', severity: 3, kind: 'globalKeyword', keyword: 'lethal', value: true },
  { id: 'glass-war', name: 'Glass War', blurb: 'Every unit is Brittle — it attacks once, then destroys itself.', severity: 3, kind: 'globalKeyword', keyword: 'brittle', value: true },
  {
    id: 'long-march', name: 'The Long March',
    blurb: 'Both draw piles are cut to 10 cards. Whoever runs out first starts bleeding. (Your own deck is untouched — only this fight is short.)',
    severity: 3, kind: 'shortDecks', cards: 10,
  },
  {
    id: 'famine-field', name: 'Famine Field',
    blurb: 'Energy is fixed at 2 every turn, for both players. Nothing expensive will ever be cast here.',
    severity: 3, kind: 'fixedEnergy', energy: 2,
  },
  {
    id: 'overwhelming-force', name: 'Overwhelming Force',
    blurb: 'The enemy draws 2 extra cards every turn. You open with 3 extra cards and 2 extra energy — spend the head start before it runs out.',
    severity: 3,
    kind: 'sided',
    mods: [
      { side: 'enemy', extraDraws: 2 },
      { side: 'player', openingCards: 3, energyBonus: 2 },
    ],
  },
  {
    id: 'ambush', name: 'Ambush',
    blurb: 'The enemy opens with 5 extra cards in hand. You get 3 extra energy on your first turn to answer it.',
    severity: 3,
    kind: 'sided',
    mods: [
      { side: 'enemy', openingCards: 5 },
      { side: 'player', energyBonus: 3 },
    ],
  },
  {
    id: 'field-commander', name: 'The Field Commander',
    blurb: 'Every 3rd round, the commander takes the field and plays your turn for you. Rounds 3, 6, 9 — count them, and leave him something he cannot ruin.',
    severity: 3, kind: 'autopilot', everyRounds: 3,
  },
  {
    id: 'zero-hour', name: 'Zero Hour',
    blurb: 'Every unit has Lethal, and energy is fixed at 5. One clean answer kills anything — and both of you can afford it.',
    severity: 3,
    kind: 'composite',
    twists: [
      { id: 'zero-hour-lethal', name: 'Zero Hour (lethal)', blurb: '', kind: 'globalKeyword', keyword: 'lethal', value: true },
      { id: 'zero-hour-energy', name: 'Zero Hour (energy)', blurb: '', kind: 'fixedEnergy', energy: 5 },
    ],
  },

  // --- FORMER boss signatures, now ordinary Trial/Elite twists ---
  //
  // All four bosses that used to carry these were redesigned onto a genuine BOSS RULE
  // (see bosses.ts / bossRules.ts), which left the twists themselves orphaned — but the
  // board setups are still good ones, so they were widened into the general pool rather
  // than deleted, which is also the fix for "the shortlist could use more variety".
  {
    id: 'drowning-tide', name: 'Drowning Tide',
    blurb: 'Tundra freezes anything entering either Ground lane, while the Shallows open the Water to everyone. Fight at sea, or fight frozen.',
    severity: 2,
    kind: 'fixedEnvironments',
    places: [{ lane: 'ground1', cardId: 'tundra' }, { lane: 'ground2', cardId: 'tundra' }, { lane: 'water', cardId: 'shallows' }],
  },
  {
    id: 'endless-growth', name: 'Endless Growth',
    blurb: 'Every unit has Growth +1/+1 — the longer this runs, the worse it gets.',
    severity: 2,
    kind: 'globalKeyword', keyword: 'growth', value: { attack: 1, hp: 1 },
  },
  {
    id: 'plague-fields', name: 'Plague Fields',
    blurb: 'Sludge Pool covers both Ground lanes — every unit entering the ground is Poisoned. The Heights and Water are clean.',
    severity: 2,
    kind: 'fixedEnvironments',
    places: [{ lane: 'ground1', cardId: 'sludge-pool' }, { lane: 'ground2', cardId: 'sludge-pool' }],
  },
  {
    id: 'lullaby-fields', name: 'Lullaby Fields',
    blurb: 'Lullaby Grove covers both Ground lanes — every unit entering the ground falls Asleep.',
    severity: 2,
    kind: 'fixedEnvironments',
    places: [{ lane: 'ground1', cardId: 'lullaby-grove' }, { lane: 'ground2', cardId: 'lullaby-grove' }],
  },
  // --- boss signatures (never rolled by Trial/Elite nodes) ---
  {
    id: 'boss-serpents-loop', name: "Serpent's Loop", bossOnly: true,
    blurb: 'Shifting Sands covers both Ground lanes — every unit there wanders to a new lane each turn.',
    kind: 'fixedEnvironments',
    places: [{ lane: 'ground1', cardId: 'shifting-sands' }, { lane: 'ground2', cardId: 'shifting-sands' }],
  },
];

/** How many twists a Trial node offers the player to choose between. */
export const TRIAL_TWIST_CHOICES = 3;

/** Twists ordinary Trial/Elite nodes may roll (boss signatures excluded). */
export const TRIAL_TWISTS: TrialTwist[] = TWISTS.filter((t) => !t.bossOnly);

/** @deprecated kept as the rollable pool alias; prefer TRIAL_TWISTS. */
export const TRIALS = TRIAL_TWISTS;

export const trialById = (id: string): TrialTwist | undefined => TWISTS.find((t) => t.id === id);

/** A twist's severity, defaulting to the middle rung for anything unauthored. */
export const twistSeverity = (twist: TrialTwist | undefined): 1 | 2 | 3 => twist?.severity ?? 2;

/**
 * Which relic bands a Trial pays out, by the severity of the twist taken.
 *
 * This is what turns the Trial's three-way choice from "which rule hurts my deck least"
 * into a wager. Before it, every twist paid `['common','rare']` regardless, so the only
 * sane play was always the gentlest option on the shortlist — and the node as a whole was
 * strictly better than a plain combat for it.
 */
export const trialRewardBands = (severity: 1 | 2 | 3): ('common' | 'rare' | 'boss')[] =>
  severity === 1 ? ['common'] : severity === 2 ? ['common', 'rare'] : ['rare', 'boss'];

/** Coin multiplier ON TOP of `ECON.TRIAL_MULTIPLIER`, by severity. */
export const trialCoinMult = (severity: 1 | 2 | 3): number =>
  severity === 1 ? 0.75 : severity === 2 ? 1 : 1.35;

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
    if (leaf.kind === 'fixedEnergy') {
      // `energyOverride` REPLACES the round-number curve for both players, every turn.
      // `initGame` has already run the opening `beginTurn`, so the opener's live energy
      // has to be topped up by hand or the rule would not start until turn two. Taking
      // the MAX rather than assigning keeps any bonus already seated (a relic's turn-one
      // burst) instead of silently deleting it.
      state.energyOverride = leaf.energy;
      const opener = state.players[state.active];
      opener.energy = Math.max(opener.energy, leaf.energy);
    } else if (leaf.kind === 'globalDraw') {
      // Both sides, via the same per-turn seam boss curses use. Hand room comes with it:
      // drawing into a full hand discards on the spot, which would read as the rule not
      // working rather than as a rule.
      for (const side of [0, 1] as PlayerId[]) {
        const pl = state.players[side];
        pl.turnCardMod = { ...pl.turnCardMod, extraDraws: (pl.turnCardMod?.extraDraws ?? 0) + leaf.extraDraws };
        pl.handCap = (pl.handCap ?? RULES.HAND_CAP) + leaf.extraDraws;
      }
    } else if (leaf.kind === 'shortDecks') {
      // Only the in-fight draw pile is cut. The run's persisted deck lives on RunState
      // and is never reachable from here, so a Trial can never cost the player a card
      // they own — the blurb says so, and this is why that promise is true.
      for (const side of [0, 1] as PlayerId[]) {
        state.players[side].deck = state.players[side].deck.slice(0, leaf.cards);
      }
    } else if (leaf.kind === 'autopilot') {
      // Adventure always seats the player at 0. Nothing in the pure engine reads this —
      // the UI's AI driver does (see `autopilotActive`), which is why a Trial can hand
      // the turn over without the engine gaining a concept of "who is playing".
      state.autopilot = { player: 0, everyRounds: leaf.everyRounds };
    } else if (leaf.kind === 'sided') {
      for (const mod of leaf.mods) {
        const seat: PlayerId = mod.side === 'player' ? 0 : 1;
        const pl = state.players[seat];
        if (mod.extraDraws) {
          pl.turnCardMod = { ...pl.turnCardMod, extraDraws: (pl.turnCardMod?.extraDraws ?? 0) + mod.extraDraws };
          pl.handCap = (pl.handCap ?? RULES.HAND_CAP) + mod.extraDraws;
        }
        if (mod.openingCards) {
          // Cap first, then draw — same ordering rule the relic path follows.
          pl.handCap = (pl.handCap ?? RULES.HAND_CAP) + mod.openingCards;
          for (let i = 0; i < mod.openingCards; i++) drawCard(state, seat, []);
        }
        // Turn-one only. The enemy has not taken a turn yet, so seating energy on them
        // here would be overwritten by their own `beginTurn`; an energy head start is a
        // player-side lever by construction and the twists only ever use it that way.
        if (mod.energyBonus) pl.energy += mod.energyBonus;
      }
    } else if (leaf.kind === 'laneLayout') {
      applyLaneLayout(registry, state, leaf.types, leaf.places ?? []);
    } else if (leaf.kind === 'fixedEnvironments') {
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
