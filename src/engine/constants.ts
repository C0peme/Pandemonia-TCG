/**
 * Central, tunable rules constants for Pandemonia.
 *
 * Every balance lever lives here so changes are a one-line edit (per the build plan).
 * The engine and card validation both read from this single source of truth.
 */

export const LANES = ['heights', 'ground1', 'ground2', 'water'] as const;
export type LaneId = (typeof LANES)[number];

/** Lanes that impose special placement/behaviour rules. */
export const SPECIAL_LANES = {
  heights: 'heights',
  water: 'water',
} as const;

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
