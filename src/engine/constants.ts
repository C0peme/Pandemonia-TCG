/**
 * Central, tunable rules constants for Pandemonia.
 *
 * Every balance lever lives here so changes are a one-line edit (per the build plan).
 * The engine and card validation both read from this single source of truth.
 */

/**
 * The five lane columns, in PHYSICAL left-to-right order. That ordering is load-bearing:
 * `adjacentLanes` (combat.ts) derives splash/collateral neighbours straight from this array's
 * indices, so the array order IS the board layout.
 *
 * A second Heights was added because board space, not energy, is what a hand actually runs
 * out of: a deck with no Airborne or Aquatic units could only ever use the three middle lanes
 * (2 slots each with Double Team), so it stalled out holding cards it had the energy for and
 * nowhere to put. The extra column widens that ceiling for every deck, and widens it MOST for
 * the grounded decks that were worst off — Heights has no entry requirement, unlike Water.
 */
export const LANES = ['heights', 'ground1', 'water', 'ground2', 'heights2'] as const;
export type LaneId = (typeof LANES)[number];

/**
 * A lane's TYPE, as distinct from its identity.
 *
 * `LaneId` is a POSITION on the board — one of five fixed columns, in fixed left-to-right
 * order. That identity is load-bearing and never changes: it keys `Lanes`, it is what
 * `adjacentLanes` indexes for splash and collateral, and it is what every animation and
 * saved state addresses. The TYPE is what the column IS — high ground, ground, or water —
 * and that is per-fight data, not a property of the id.
 *
 * Splitting the two is what lets a board be re-laid out (a boss rule, a Trial twist)
 * without touching the state shape, the adjacency model, or a single card definition: the
 * five slots stay exactly where they are, and only what they mean changes.
 */
export type LaneType = 'heights' | 'ground' | 'water';
export type LaneLayout = Record<LaneId, LaneType>;

/** The printed board: Heights, Ground, Water, Ground, Heights. */
export const DEFAULT_LANE_LAYOUT: LaneLayout = {
  heights: 'heights',
  ground1: 'ground',
  water: 'water',
  ground2: 'ground',
  heights2: 'heights',
};

/**
 * What this column IS in this fight. `layout` absent = the printed board, so every caller
 * that has no business knowing about re-laid boards keeps working unchanged.
 */
export const laneTypeOf = (lane: LaneId, layout?: LaneLayout): LaneType =>
  layout?.[lane] ?? DEFAULT_LANE_LAYOUT[lane];

/**
 * Anything gated on "is this the high ground" — Sniper's free targeting, an Environment
 * opting into `heights` — must ask this rather than compare against the string 'heights',
 * or the second Heights column silently loses the rule (and a re-laid board loses it
 * everywhere). Same for `isGround`, and for `isWater`, which used to be written inline as
 * `lane === 'water'` in eight places.
 */
export const isHeights = (lane: LaneId, layout?: LaneLayout): boolean => laneTypeOf(lane, layout) === 'heights';
export const isGround = (lane: LaneId, layout?: LaneLayout): boolean => laneTypeOf(lane, layout) === 'ground';
export const isWater = (lane: LaneId, layout?: LaneLayout): boolean => laneTypeOf(lane, layout) === 'water';

export const RULES = {
  /** Leader starting/most HP. */
  LEADER_HP: 30,
  /**
   * DEFAULT Signature threshold, used only as a fallback when a PlayerState has no
   * `leaderMaxHp` (hand-built test fixtures). The REAL rule (see `signatureThreshold`
   * in damage.ts) is dynamic: HALF of that leader's own max HP, so it scales correctly
   * for Adventure's reduced-HP enemies and any future leader whose HP isn't 30. This
   * constant is exactly RULES.LEADER_HP / 2, which is why it's still 15 today.
   */
  SIGNATURE_HP_THRESHOLD: 15,

  /** Deck construction. */
  DECK_SIZE: 30,
  MAX_COPIES: 4,

  /** Hand & draw. */
  STARTING_HAND: 4,
  /**
   * Cap on the `conjureOnPlay` trigger (Corpselock's Signature) per turn. Without a bound
   * this is a genuine infinite loop once cards are cheap: playing a card conjures a card
   * you can then play. The hand cap limits what you HOLD, not how many times the cycle
   * runs, and the AI's search would ride it indefinitely.
   */
  CONJURE_ON_PLAY_PER_TURN: 4,
  DRAW_PER_TURN: 1,
  HAND_CAP: 10,

  /** Energy & banking (revised model — see docs/build-plan.md). */
  // Per-turn universal energy equals the round number; this is the round-1 value.
  STARTING_ENERGY: 1,
  ENERGY_PER_ROUND: 1,
  // Element-specific costs are paid from banked element energy (Option A).
  // There is no global banking cap; each element is capped individually by the
  // leader's per-element caps (see elementCapsSchema). These bound those caps.
  MAX_ELEMENT_COST: 4,
  ELEMENT_CAP_MIN: 1,
  ELEMENT_CAP_MAX: 4,
  ELEMENT_CAP_TOTAL: 8,
  // Safety valve, currently disabled: max element energy a player may bank per turn.
  PER_TURN_BANK_LIMIT: null as number | null,

  /** Status effect durations. */
  SLEEP_DURATION: 1,
  FREEZE_DURATION: 2,
  /** Default Poison level: constant damage dealt at end of each turn. Lasts until removed. */
  POISON_DAMAGE: 1,
  /**
   * Damage a drowning unit takes at the start of its owner's turn. Drowning already
   * zeroes attack; this puts the unit on a clock so it is a temporary blocker (it can
   * still body-block an Aquatic attacker) rather than permanent dead weight.
   */
  DROWN_DAMAGE: 1,

  /** Board. */
  MAX_UNITS_PER_LANE: 2, // Double Team allows a second unit.
} as const;

export const ELEMENTS = ['fire', 'water', 'nature', 'earth'] as const;
export type Element = (typeof ELEMENTS)[number];
<<<<<<< Updated upstream
=======

/**
 * What a CARD may be. `neutral` is a card class, NOT a fifth element: there is no neutral bank,
 * no neutral cap and no neutral pip, so `Element` (used for costs, banking and leader caps)
 * deliberately excludes it.
 *
 * A neutral card is one whose abilities have no elemental association — plain damage, draw,
 * heal, summon — so the pip system charges it nothing in colour and it is priced entirely in
 * energy. That makes it castable on curve by every leader, which is the point: it is the pool's
 * common ground.
 */
export const CARD_ELEMENTS = [...ELEMENTS, 'neutral'] as const;
export type CardElement = (typeof CARD_ELEMENTS)[number];

/**
 * The single source of truth for where an Environment may be placed. Exported so
 * every placement path (hand plays, the AI's legal actions, Adventure's pre-placed
 * boss/trial hazards, and their tests) enforces the same rule — never re-implement it.
 */
export const laneAllowed = (restrictions: string[], lane: LaneId, layout?: LaneLayout): boolean => {
  // Water and Heights are special: an environment may only be placed there if it
  // explicitly opts in (as a deliberate drawback). Empty restrictions default to
  // ground-only rather than "any lane".
  if (restrictions.length === 0) return isGround(lane, layout);
  // 'ground' and 'heights' name a lane TYPE, not a column: each matches BOTH of its columns.
  // 'water' is the one column that is its own type.
  // A re-laid board is matched by TYPE, not by column name: 'water' names the water type,
  // so an environment that opts into Water follows the water wherever the layout puts it.
  return restrictions.some((r) =>
    r === 'ground' ? isGround(lane, layout)
    : r === 'heights' ? isHeights(lane, layout)
    : r === 'water' ? isWater(lane, layout)
    : r === lane);
};
>>>>>>> Stashed changes
