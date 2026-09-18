/**
 * Opening boons — the one meaningful choice a run makes before it starts.
 *
 * A run used to open with no decision at all: pick a leader, get the fixed starter deck,
 * walk onto the map. Every run of a given leader therefore began identically, and the
 * first real choice was several nodes away. A boon is the run's opening statement — take
 * the money, take the body, thin the deck, or take a risk — and because they are drawn
 * from the run seed, two runs on the same leader diverge immediately.
 *
 * DESIGN RULE: a boon shapes a run, it does not win one. Each is roughly the value of a
 * couple of early nodes, and each pulls in a different direction, so the choice is about
 * what kind of run you want rather than which number is biggest.
 *
 * ---------------------------------------------------------------------------------
 * THE VALUE UNIT
 * ---------------------------------------------------------------------------------
 * The table drifted badly because nothing said how much a boon was worth, so each was
 * authored against its own intuition. Measured against a common yardstick, the spread
 * ran better than 5x: `deep-attunement` handed out two attunes worth ~800 coins
 * (`attuneCost` is 60 x 1.7^cap, so the 4th and 5th points of a cap cost ~295 and ~500),
 * `field-medic` at Mend 2 paid +10 HP on every win for the whole run, and `full-purse`
 * gave 150 coins — barely one common relic, and only after you had walked to a shop.
 *
 * Every boon is now priced at roughly ONE UNIT, where a unit is about 250-300 coins of
 * value: one rare relic, or two early nodes' takings. Three corollaries:
 *
 *  - DELAYED value must exceed IMMEDIATE value. Coins need a store node before they do
 *    anything, so the coin boon pays more raw value than the relic boon that simply
 *    hands you the relic.
 *  - A boon that ADDS cards has to make them worth having. Two random cards dropped into
 *    a curated 15-card starter is dilution, not a gift — `conscription` pairs them with a
 *    drilling buff so breadth is genuinely net-positive.
 *  - A PRICE is allowed (`pact-of-ash`, `borrowed-dawn`) as long as the tin says so, and
 *    it has to be priced like everything else: the benefit minus the price still lands
 *    on one unit.
 *
 * Every field is applied by `applyBoon` (run.ts). Adding a field means handling it
 * there; an unhandled field is silently free power, which is how a "boon" becomes a
 * balance hole nobody notices.
 */
import { makeRoller } from '@adventure/seed';

export interface Boon {
  id: string;
  name: string;
  icon: string;
  /** What it does, in the player's words. Shown on the choice card. */
  blurb: string;
  /** Coins on top of `ECON.STARTING_COINS`. */
  coins?: number;
  /**
   * Coins granted again at the START of every act, including this one — the one boon
   * field that is not a single upfront grant. Applied by `applyBoon` on the run's
   * opening act and by `nextAct` (run.ts) on every act clear after that, both reading
   * the SAME field off the run's own `boonId` rather than duplicating the amount
   * anywhere else, so there is exactly one source of truth for how much and how often.
   */
  coinsPerAct?: number;
  /** Raises `maxHp` AND heals by the same amount. Negative is a real price. */
  maxHpDelta?: number;
  /** Starting `mendLevel` — bigger post-battle heals for the whole run. */
  mendLevel?: number;
  /** Roll a relic from these bands and grant it. */
  relicBands?: ('common' | 'rare')[];
  /**
   * Grant these EXACT relics, by id.
   *
   * Distinct from `relicBands` on purpose. A band roll is a lottery the player watches
   * resolve; a named grant is the boon's whole identity, printed on the card before they
   * choose. It is also the only route by which a CURSED relic may enter a run outside a
   * shop counter — and it stays inside that rule rather than bending it, because the
   * point of the rule is that a curse is always an ACT. Choosing a boon whose blurb
   * names the curse is exactly such an act; a band roll that could surface one would
   * not be. `rollRelicChoices` still filters the cursed band out of every reward path.
   */
  relicIds?: string[];
  /** Extra cards added to the starting deck, biased to the leader's element. */
  randomCards?: number;
  /** Remove this many cards from the starting deck — a thinner deck draws its best cards more often. */
  trim?: number;
  /** +1 banking cap on the leader's own element, N times. */
  attune?: number;
  /** Permanently buff N random owned units by this much. */
  buff?: { count: number; attack: number; hp: number };
}

export const BOONS: Boon[] = [
  {
    id: 'full-purse', name: 'Full Purse', icon: '⊙',
    blurb: 'Begin with ⊙ 280 more. Enough to walk into the first store and buy something that matters.',
    // Raised 150 -> 280. Coins are the only boon that does NOTHING until the run reaches
    // a store, and a store is a node you may have to route toward; delayed, conditional
    // value has to out-pay the boons that hand you the thing directly. At 340 total the
    // first shop can be a rare relic or the whole card shelf, which is an opening plan
    // rather than a rounding error on the starting purse.
    coins: 280,
  },
  {
    id: 'iron-constitution', name: 'Iron Constitution', icon: '❤',
    blurb: '+10 maximum HP. A longer run, and a later Signature.',
    maxHpDelta: 10,
  },
  {
    id: 'heirloom', name: 'Heirloom', icon: '⚱',
    blurb: 'Start carrying a relic, drawn from the common and rare bands.',
    relicBands: ['common', 'rare'],
  },
  {
    id: 'travelling-light', name: 'Travelling Light', icon: '🜁',
    blurb: 'Burn 3 cards from your starting deck. A thinner deck draws its best cards far more often.',
    trim: 3,
  },
  {
    id: 'conscription', name: 'Conscription', icon: '⚑',
    blurb: 'Two extra cards of your element — and two of your soldiers are drilled to +1/+1.',
    // Was two random cards and nothing else, which is close to a NEGATIVE boon: dropping
    // two rolled cards into a curated 15-card starter dilutes every draw for the rest of
    // act 1. Breadth only reads as a gift if the extra bodies are worth drawing, so the
    // cards now arrive alongside a drilling buff.
    randomCards: 2, buff: { count: 2, attack: 1, hp: 1 },
  },
  {
    id: 'field-medic', name: 'Field Medic', icon: '✚',
    blurb: 'Begin at Mend 1 — every won battle restores 5 more, for the whole run.',
    // Was Mend 2 (+10 HP on EVERY win). Across a dozen wins that is 100+ HP against
    // Iron Constitution's one-time 10 — the largest single effect in the table by a wide
    // margin, and in an attrition run the one you always wanted. Mend 1 keeps the
    // long-run sustain identity at about one unit.
    mendLevel: 1,
  },
  {
    id: 'deep-attunement', name: 'Deep Attunement', icon: '↯',
    blurb: '+1 banking cap on your own element. Your biggest cards arrive sooner.',
    // Was +2, which `attuneCost` prices at roughly 800 coins from a typical cap of 3 —
    // three times any other boon. One point is still a real ramp enabler and lands on
    // the same unit as a rare relic.
    attune: 1,
  },
  {
    id: 'blessed-steel', name: 'Blessed Steel', icon: '✧',
    blurb: 'Two units in your starting deck are permanently +2/+2.',
    // Left at two. Three was tried and the value metric in `boons.test.ts` scored it at
    // roughly twice its neighbours — four permanent stat points on a starter body is
    // already a full unit's worth.
    buff: { count: 2, attack: 2, hp: 2 },
  },
  {
    id: 'pact-of-ash', name: 'Pact of Ash', icon: '☠',
    blurb: '⊙ 250 and a relic — paid for with 8 of your maximum HP.',
    // The price was 6 HP against 250 coins AND a relic, which made this strictly better
    // than Heirloom and Full Purse combined for the cost of two Rest visits. 8 HP off a
    // 30 HP leader is a quarter of the pool and moves the Signature line with it.
    coins: 250, relicBands: ['common', 'rare'], maxHpDelta: -8,
  },
  {
    id: 'quartermaster', name: "Quartermaster's Favour", icon: '📦',
    blurb: 'A relic, ⊙ 100, and one extra card. A little of everything, and the best of nothing.',
    relicBands: ['common'], coins: 100, randomCards: 1,
  },
  {
    id: 'print-more-money', name: 'Print More Money', icon: '🖨',
    blurb: 'Gain ⊙ 90 now, and ⊙ 90 more at the start of every act after this one.',
    // The one boon that PAYS AGAIN rather than once. Priced against the others by total
    // over a run that reaches the boss gauntlet (roughly 4-5 acts): 90 x 5 = 450, well
    // above a single unit — but nearly all of that is DELAYED and conditional on the run
    // actually surviving that long, which is the same discount every deferred-value boon
    // in this table already pays (see the header note: delayed value must exceed
    // immediate value, precisely because it is not guaranteed to be collected in full).
    coinsPerAct: 90,
  },
  {
    id: 'borrowed-dawn', name: 'The Borrowed Dawn', icon: '🌗',
    blurb: 'Begin carrying The Borrowed Dawn: the early acts are almost free, and the debt comes due later.',
    // The one boon that hands over a CURSED relic, named on the tin. Its whole shape is
    // in the relic (see `borrowed-dawn` in data/relics.ts): enemies begin act 1 at a
    // fraction of their HP and climb past full strength by the late acts. Granted by id
    // rather than by a band roll, which is what keeps "a curse is always an act" true.
    relicIds: ['borrowed-dawn'],
  },
];

const byId = new Map(BOONS.map((b) => [b.id, b]));
export const boonById = (id: string): Boon | undefined => byId.get(id);

/** How many boons a run is offered to choose between. */
export const BOON_CHOICES = 3;

/**
 * The boons offered at the start of a run. Derived from the run seed alone, so the
 * offer is fixed for a given run and reloading the leader picker cannot reroll it.
 */
export const rollBoons = (seed: number, count = BOON_CHOICES): Boon[] => {
  const roll = makeRoller(seed);
  return roll.shuffle(BOONS).slice(0, Math.min(count, BOONS.length));
};
