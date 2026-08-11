/**
 * Card budget calculator — encodes the balancing table from docs/card-creation-guide.txt.
 *
 * Given a card (or a card-shaped draft from the Card Studio editor), it estimates the
 * card's "value" by summing stat, keyword, on-hit, and effect costs, then converts that
 * to a recommended energy cost. Rules implemented:
 *   - geometric stat cost: base 0.28, attack multiplier 1.30, hp multiplier 1.40
 *     (each additional point in a category costs ~30%/40% more than the previous)
 *   - foundation base 0 (pay for the standalone body + everything it grants)
 *   - all-units ×2.5 multiplier (AOE effect scopes and environment grantKeywords)
 *   - keyword costs per the table; on-hit statuses; spell/trigger effect costs
 *
 * Folded keyword-effects (Healer / Producer / Mover / Debuff / Expel) are authored either
 * as keywords (starter.ts) OR as trigger effects (cards saved from the editor). This module
 * values both forms equivalently: a recurring trigger effect is priced like its keyword.
 */

import { RULES } from '@engine/constants';

type Lookup = (id: string) => unknown;

const num = (v: unknown, d = 0): number => (typeof v === 'number' ? v : d);

// Flat stat cost — used for incremental buff/debuff/grant amounts (not unit base stats).
const statCost = (s: { attack?: number; hp?: number } | undefined | null): number =>
  s ? num(s.attack) * 0.25 + num(s.hp) * 0.5 : 0;

// Geometric (progressive) stat cost for a unit's base stats: each extra point costs more than
// the last. Both per-category fudges are gone — STAT_BASE is its honest value and ABILITY_FACTOR
// is 1.0 — because abilities now earn their edge STRUCTURALLY, by converting energy into element
// pips (see recommendedPips), not by taxing stats.
//
// The ratios were tuned empirically over several meta sims:
//   0.28 / 1.30 / 1.40  original — stats-per-energy fell 3.71x from a 1/2 to a 7/7, a cliff that
//                       made anything above a 4/4 uneconomical to author.
//   0.30 / 1.08 / 1.12  OVERSHOT. Flat enough that a 7/7 was as efficient per energy as a 2/3,
//                       so vanilla stat-sticks became the best cards in the game and the most
//                       vanilla-efficient deck jumped 62% -> 74% field win rate.
//   0.29 / 1.26 / 1.35  current (~3.0x spread). A real premium for going tall without the cliff.
//
// Why a premium is correct at all: energy binds early (favouring cheap wide bodies) but CARDS
// and board slots bind later — 1 draw/turn over ~15 rounds, 8 slots. A big body converts one
// card into many stats, so linear pricing would simply let tall dominate the late game instead.
const STAT_BASE  = 0.29;
const STAT_R_ATK = 1.26;
const STAT_R_HP  = 1.35;

/** Kept as a named constant so the old stats↔abilities fudge can be reintroduced in one place. */
const ABILITY_FACTOR = 1.0;

const attackCost = (n: number): number =>
  n <= 0 ? 0 : STAT_BASE * (Math.pow(STAT_R_ATK, n) - 1) / (STAT_R_ATK - 1);

const hpCost = (n: number): number =>
  n <= 0 ? 0 : STAT_BASE * (Math.pow(STAT_R_HP, n) - 1) / (STAT_R_HP - 1);

const unitStatCost = (attack: number, hp: number): number =>
  attackCost(attack) + hpCost(hp);

const isAll = (t: unknown): boolean => t === 'all-ally' || t === 'all-enemy';

/**
 * Status prices, corrected from measured field data. Every disruption status came back
 * OVERPRICED in the effect sweep — freeze -11.1, sleep -6.7, taunt -8.1 marginal win rate when
 * a spell carrying it replaced a similarly-priced vanilla body. Tempo denial reads far better
 * on paper than it plays: the target survives, the board does not change, and you spent a card.
 * Burn/poison were fine (+3.1) and are untouched.
 */
function statusCost(status: string, amount = 1): number {
  switch (status) {
    case 'burn': return 1.0 + 1.0 * (amount - 1);
    case 'poison': return 1.0 + 1.5 * (amount - 1);
    case 'sleep': return 1.3;   // was 2.0  (field -6.7)
    case 'freeze': return 1.4;  // was 2.5  (field -11.1)
    case 'shield': return 2.3 + 0.5 * (amount - 1); // was 2.5 (field -2.2)
    case 'trueShield': return 3.0;
    case 'zombified': return 2.75;
    case 'taunt': return 0.2;   // was 1.0  (field -8.1)
    default: return 1.0;
  }
}

/** Base cost of a single effect, ignoring the all-units and recurrence multipliers. */
function effectCostBase(e: any, lookup: Lookup, depth: number): number {
  switch (e.kind) {
    // Damage is PROGRESSIVE. Measured: 2 damage reads neutral (+1.4) but 4 damage is badly
    // underpriced (+11.1) — big hits kill real bodies where small ones only chip, so the value
    // per point rises. Same reasoning as the geometric stat curve, applied to removal.
    case 'damage': {
      let c = num(e.amount) * 0.5 + Math.max(0, num(e.amount) - 2) * 0.55;
      if (e.chainDiminish || e.chain) c += 1.0;
      return c;
    }
    case 'heal': return num(e.amount) * 0.3;   // was 0.5/pt (field -6.7 on heal 3)
    // A spell buff is worth far more than the same stats printed on a body (+13.9): it lands on
    // an already-deployed unit, so it dodges summoning sickness and doubles down on a threat.
    case 'buff': return statCost(e.stat) * 1.9 + keywordsCost(e.keywords, false, lookup, depth);
    case 'debuff': return 1.25 + statCost(e.stat);
    case 'applyStatus': return statusCost(e.status, num(e.amount, 1));
    case 'draw': return num(e.amount, 1) * 0.85;  // was 1.0/card (field -4.4)
    case 'energy': return num(e.amount, 1) * 0.5;
    // Same energy, one turn later: worth slightly less than immediate energy, never more.
    case 'energyNext': return num(e.amount, 1) * 0.4;
    // Fills all four banks to cap. Worth the energy it saves later, but the actual haul
    // depends on the leader's caps and what is already banked, so price it at a typical
    // refill (~6 points) times the 0.5 the budget charges per pip.
    case 'bankMax': return 3.0;
    case 'move': return 1.0;
    case 'expel': return 1.8;   // was 2.5 (field -6.7)
    case 'forget':
    case 'mill': return 0.7 + 1.5 * (num(e.amount, 1) - 1);  // was 1.75 base (field -10.8)
    case 'conjure': return 1.5;
    // depth+1 so self-summon bloodlust (e.g. Shypher) stops at depth>1 and returns stats only
    case 'summon': return e.cardId ? valueOf(lookup(e.cardId), lookup, depth + 1) : 1.0;
    case 'extraAction': return 1.5;
    case 'costMod': return 1.0;
    case 'setStats': return 2.0;
    case 'cleanse': return 0.1;  // was 1.0 (field -9.2)
    case 'custom': return 0;
    default: return 0;
  }
}

function effectCost(e: any, lookup: Lookup, recurring = false, depth = 0): number {
  const base = effectCostBase(e, lookup, depth);
  // AOE measured UNDERPRICED at 2.5 (+9.2 for a 2-damage all-enemy sweep), so the multiplier
  // rises. Note this is the EFFECT-scope multiplier and is separate from the Environment grant
  // multiplier, which went the other way (2.5 -> 1.0) because that grant is symmetric.
  const allMult = isAll(e.target) ? 3.5 : 1;
  // Any effect in onAttack / endOfTurn / startOfTurn fires every turn the unit is alive.
  // Universal ×1.4 recurrence premium — no exceptions.
  const recurMult = recurring ? 1.4 : 1;
  return base * allMult * recurMult * ABILITY_FACTOR;
}

function effectsCost(arr: any[] | undefined, lookup: Lookup, recurring = false, depth = 0): number {
  return (arr ?? []).reduce((s, e) => s + effectCost(e, lookup, recurring, depth), 0);
}

function aquaticCost(a: any): number {
  if (a === true) return 0.25;
  if (Array.isArray(a)) return 0.25 + a.reduce((s, e) => s + statCost(e.stat), 0);
  if (a && typeof a === 'object') return 0.25 + statCost(a);
  return 0;
}

/**
 * ENVIRONMENT GRANT MULTIPLIER — 2.5 -> 1.0.
 *
 * An Environment's `grantKeywords` were amplified 2.5x on the theory that hitting a whole lane
 * is worth far more than one unit having the keyword. That is wrong twice over. First, the
 * grant is SYMMETRIC: `refreshLaneEnvironment` applies it to units of BOTH players in that lane
 * column, so you are partly arming your opponent. Second, once the keyword table itself was
 * repriced from measured field data, the 2.5x stacked on top and produced uncastable cards —
 * Warehouse 22e, Overgrowth 20e, High Ground 19e, in a game whose average length is ~15 rounds
 * and whose energy equals the round number. Meanwhile Fortified Line fell to 0e.
 *
 * At 1.0 an Environment costs about what its keyword is worth, which is the honest price for a
 * shared, symmetric effect whose upside is that you choose when and where to drop it.
 */
const ENV_GRANT_MULT = 1.0;

/** Value of a keywords object. `allUnits` applies the Environment grant multiplier. */
function keywordsCost(kw: any, allUnits: boolean, lookup: Lookup, depth = 0): number {
  if (!kw) return 0;
  const m = allUnits ? ENV_GRANT_MULT : 1;
  let c = 0;
  for (const [k, v] of Object.entries<any>(kw)) {
    switch (k) {
      // Brittle is a pure downside (self-destructs after one attack), but it's near-free for the
      // one-shot reach attackers that actually run it — a full −1.0 energy refund undercosts them
      // (it pushed Swift Falcon to a 1e 3/1 flyer). Priced for the average case at −0.5.
      case 'brittle': c += -0.5; break;
      case 'battleReady': c += 2.75; break;  // field delta +25.3 -> repriced
      case 'sniper': c += 0.25; break;  // field delta -5.2 -> repriced
      case 'overshot': c += 4.05; break;  // field delta +33.3 -> repriced
      case 'airborne': c += 1.95; break;  // field delta +11.8 -> repriced
      case 'strikeThrough': c += 2.4; break;  // field delta +9.4 -> repriced
      case 'branchShot': c += 3.5; break;  // field delta +38.9 -> repriced
      case 'splashDamage': c += 2.5; break; // multi-target (3 fronts) — empirically Undershot-tier+, not 1.5
      case 'doubleStrike': c += 3.9; break;  // field delta +23.6 -> repriced
      case 'taunt': c += 0.2; break;  // field delta -8.0 -> repriced
      case 'doubleTeam': c += 1.7; break;  // field delta +6.6 -> repriced
      case 'immunity': c += 3.2; break;  // field delta +11.8 -> repriced
      case 'undershot': c += 1.0; break;  // field delta -9.7 -> repriced
      case 'lethal': c += 4.5; break;  // field delta +15.3 -> repriced
      case 'trueShield': c += 3.0; break;
      case 'zombified': c += 2.75; break;
      case 'shield': c += 3.4 + 0.5 * (num(v, 1) - 1); break;
      case 'tough': c += 3.3 + 1.5 * (num(v, 1) - 1); break;
      case 'spike': c += 1.5 + 0.5 * (num(v, 1) - 1); break;
      case 'aquatic': c += aquaticCost(v); break;
      case 'producer': c += num(v?.amount, 1) * 0.7; break;           // energy×0.5 × 1.4
      case 'growth': c += 3.5 + statCost(v); break;
      case 'bloodlust': c += 1.95 + statCost(v?.buff) + effectsCost(v?.effects, lookup, false, depth); break;
      case 'polish': c += 1.0 + statCost(v?.stat) + effectsCost(v?.effects, lookup, false, depth); break;
      case 'healer': c += num(v?.amount, 1) * 0.7; break;             // heal×0.5 × 1.4
      case 'mover': c += 1.4; break;                                   // move×1.0 × 1.4
      case 'expel': c += 3.5; break;                                   // expel×2.5 × 1.4
      case 'debuff': c += (1.25 + statCost(v)) * 1.4; break;
      case 'sacrifice': c += -0.5 + statCost(v?.buff); break;
      case 'kamikaze': c += -0.5 + effectCost(v, lookup, false, depth); break;
      case 'smelt': c += effectCost(v?.effect, lookup, false, depth) - 0.5 * num(v?.hpCost); break;
      case 'metamorphosis': {
        // one level only: value the "into" card's printed body/effects, not its further
        // metamorphosis (avoids double-counting A<->B transform loops). Minus 2 / turn.
        const into = v?.into ? valueOf(lookup(v.into), lookup, depth + 1) : statCost(v?.gains);
        c += Math.max(0, into - 2 * num(v?.everyTurns, 1));
        break;
      }
      default: break;
    }
  }
  return c * m * ABILITY_FACTOR;
}

function onHitCost(oh: any): number {
  if (!oh) return 0;
  let c = 0;
  if (oh.burn)              c += statusCost('burn', oh.burn);
  if (oh.poison)            c += statusCost('poison', oh.poison === true ? 1 : oh.poison);
  if (oh.sleep !== undefined) c += statusCost('sleep');
  if (oh.freeze)            c += statusCost('freeze');
  // ×1.5 recurrence premium: on-hit fires every time damage lands, unlike a one-shot spell.
  // ×ABILITY_FACTOR: on-hit is an ability, discounted like all others.
  return c * 1.5 * ABILITY_FACTOR;
}

/** Total computed value (budget) of a card. Pass `lookup` so summon/metamorphosis
 *  references can be priced; default is a no-op (those references value as 0/fallback). */
/**
 * Global price level. The value function only ever determines RATIOS between cards — its
 * absolute scale is arbitrary, and dropping the STAT_BASE/ABILITY_FACTOR fudges deflated it
 * by 17.5%, which would have made the whole pool cheaper and sped the game up. VALUE_SCALE
 * pins the scale so the pool's total cost matches the originally authored one. Recalibrated twice:
 * 1.20 -> 1.30 when the stat curve was softened (flattening dropped the pool 9.4%), then
 * 1.30 -> 1.09 after the keyword table was repriced from measured field data (that inflated the
 * pool +19.6%, which would have silently slowed every game since energy per turn is fixed at
 * the round number). Both times the point is the same: hold the price level so a change to
 * RELATIVE pricing is not smuggled in alongside a change to game pace. Retune ONLY to move the game's overall pace; it is not a balance knob,
 * because scaling every card together changes no card's cost relative to any other.
 */
const VALUE_SCALE = 1.09;

export function cardBudgetValue(card: any, lookup: Lookup = () => undefined): number {
  return valueOf(card, lookup, 0) * VALUE_SCALE;
}

function valueOf(card: any, lookup: Lookup, depth: number): number {
  if (!card || depth > 1) return depth > 1 ? statCost({ attack: card?.attack, hp: card?.hp }) : 0;
  const triggers = (recurring: boolean, ...arrs: (any[] | undefined)[]) =>
    arrs.reduce((s, a) => s + effectsCost(a, lookup, recurring, depth), 0);

  if (card.type === 'unit') {
    return (
      unitStatCost(num(card.attack), num(card.hp)) +
      keywordsCost(card.keywords, false, lookup, depth) + onHitCost(card.onHit) +
      triggers(false, card.onPlay) +
      triggers(true, card.onAttack, card.endOfTurn, card.startOfTurn)
    );
  }
  if (card.type === 'foundation') {
    // A Foundation is a FULL UNIT (its own body, keywords, on-hit) that ALSO grants a bonus to
    // the host placed on top. Price the body exactly like a unit, then add the grant at FULL
    // value.
    //
    // The grant used to be discounted by 1.5 as "delayed upside — you need a second card on top,
    // and the Foundation can be killed first". That reasoning no longer holds. A deck built to
    // bond reliably (Combo runs 8 foundations behind 22 units) realises the grant nearly every
    // time, so the discount was a straight subsidy: ~12 budget of free value across its list,
    // which is what carried it to a 66% field with no removal, no draw and no reach. It stacks
    // on top of the ability-pip discount every card already gets, so foundations were being
    // discounted twice.
    const body = unitStatCost(num(card.attack), num(card.hp)) +
      keywordsCost(card.keywords, false, lookup, depth) + onHitCost(card.onHit) +
      triggers(true, card.onAttack, card.endOfTurn, card.startOfTurn) + triggers(false, card.onPlay);
    // The half-stat carryover IS charged, computed from the body rather than read from
    // `grants.stat` (registry.ts derives that universally, so the card data no longer carries it).
    //
    // It was briefly free, on the reasoning that bonding sacrifices the body so the carryover is
    // a refund on a downside. A meta sim killed that: correlation between a deck's foundation
    // count and its win-rate change came out at 0.86 — every deck holding foundations gained,
    // every deck without one lost. The premise was wrong because a Foundation fights standalone
    // as a full unit FIRST and only then passes half its stats up. That is a two-stage payoff,
    // not a sacrifice, so it has to be paid for.
    const derivedGrantStat = statCost({
      attack: Math.floor(num(card.attack) / 2),
      hp: Math.floor(num(card.hp) / 2),
    });
    const grant = derivedGrantStat + keywordsCost(card.grants?.keywords, false, lookup, depth);
    // Floor keeps a Foundation from ever costing less than the equivalent vanilla body.
    const premium = Math.max(0.5, grant);
    return body + premium;
  }
  if (card.type === 'spell') return effectsCost(card.effects, lookup);
  if (card.type === 'environment') {
    return effectsCost(card.effects, lookup) + keywordsCost(card.grantKeywords, true, lookup);
  }
  return 0;
}

// ── Element pips ──────────────────────────────────────────────────────────────
// Pips are the BANKED-element portion of a cost. They were previously hand-authored per
// card with only a loose relationship to value, which made low-value cards unplayably
// gated: a 1-pip requirement on a 2-value card forces a bank-and-wait turn to cast
// something that should be a curve filler, and every element has a bank cap, so a deck
// full of small pipped cards deadlocks itself.
//
// Pips are DERIVED from how many ABILITIES a card has. Each ability converts one point of
// the card's cost out of generic energy and into an element pip:
//
//   pips  = abilityCount, capped at MAX_ELEMENT_COST and at the card's own rounded value
//   energy = round(value) − pips
//
// The card's face cost is unchanged in nominal terms — the energy removed is replaced by an
// equal number of pips — but it is CHEAPER in practice, because a pip is paid from
// end-of-turn overflow that would otherwise evaporate, while generic energy competes with
// everything else you want to do that turn. That is the whole point: it lets ability cards
// compete with vanilla stat-sticks structurally, instead of via the STAT_BASE/ABILITY_FACTOR
// fudge that used to tax stats and discount abilities so the errors cancelled.
//
// It also gives elements a job. A vanilla body is pure energy and always castable; an
// ability card commits you to an element, so a leader's `elementCaps` decide which ability
// cards their deck can actually support, and banking has a reason to exist.
//
// There is deliberately NO floor on the generic half: an ability-dense card can convert its
// cost away entirely and land at 0 energy + N pips. That is safe precisely because pips fall
// back to generic energy (see energy.ts `settleCost`) — a 0-energy/2-pip card still costs 2
// to a player who never banked the element, so it is free only to one who committed to it.
const MAX_ABILITY_PIPS = RULES.MAX_ELEMENT_COST;

/**
 * How many distinct abilities a card has. Only abilities that ADD value count — a pure
 * downside such as Brittle must not earn its card a pip. Stats are not abilities.
 */
export function abilityCount(card: any, lookup: Lookup = () => undefined): number {
  if (!card) return 0;
  let n = 0;
  const countKeywords = (kw: any): void => {
    for (const [k, v] of Object.entries<any>(kw ?? {})) {
      // `aquatic: true` is a lane permission, not an ability; `aquatic: Effect[]` is one.
      if (k === 'aquatic' && v === true) continue;
      if (keywordsCost({ [k]: v }, false, lookup, 0) > 0) n++;
    }
  };
  const countEffects = (arr: any[] | undefined): void => {
    for (const e of arr ?? []) if (effectCost(e, lookup, false, 0) > 0) n++;
  };
  const countOnHit = (oh: any): void => {
    if (!oh) return;
    for (const k of ['burn', 'poison', 'sleep', 'freeze']) if (oh[k] !== undefined && oh[k] !== false) n++;
  };

  countKeywords(card.keywords);
  countOnHit(card.onHit);
  countEffects(card.onPlay); countEffects(card.onAttack);
  countEffects(card.endOfTurn); countEffects(card.startOfTurn);
  if (card.type === 'spell') countEffects(card.effects);
  if (card.type === 'environment') { countEffects(card.effects); countKeywords(card.grantKeywords); }
  if (card.type === 'foundation') {
    countKeywords(card.grants?.keywords); countOnHit(card.grants?.onHit);
    countEffects(card.grants?.onAttack); countEffects(card.grants?.endOfTurn); countEffects(card.grants?.startOfTurn);
  }
  return n;
}

/** Recommended element-pip count: one pip per ability, bounded only by the card's own cost. */
/**
 * FOUNDATION SURCHARGE — one extra pip, on top of whatever its abilities convert.
 *
 * Pricing a Foundation at exactly unit rates made the plain unit pointless: same body, same
 * keywords, same cost, but the Foundation ALSO hands half its stats and all its keywords to a
 * host. The surcharge is what a Foundation pays for being strictly more flexible.
 *
 * It is a genuine surcharge, NOT another energy→pip conversion: `recommendedEnergy` subtracts
 * only the ability-derived pips, so the extra pip is added without any energy coming off. A
 * Foundation therefore costs its unit-equivalent price plus one element pip.
 */
const FOUNDATION_PIP_SURCHARGE = 1;

/** Pips a card's abilities convert, before any surcharge. Bounded by the card's own value. */
const convertiblePips = (card: any, lookup: Lookup): number => {
  const baseEnergy = Math.round(cardBudgetValue(card, lookup));
  return Math.max(0, Math.min(abilityCount(card, lookup), MAX_ABILITY_PIPS, baseEnergy));
};

export function recommendedPips(card: any, lookup: Lookup = () => undefined): number {
  const surcharge = card?.type === 'foundation' ? FOUNDATION_PIP_SURCHARGE : 0;
  return Math.min(convertiblePips(card, lookup) + surcharge, RULES.MAX_ELEMENT_COST);
}

/**
 * Recommended whole-number energy cost: the card's rounded value, minus one energy per
 * ABILITY-derived pip. The conversion is 1:1 — an ability moves a full point of cost from
 * energy into an element requirement, rather than the 0.5 the budget nominally charges for a
 * pip. That gap IS the ability discount, and it is deliberate: it is what makes an ability
 * card cheaper to deploy than the equivalent vanilla body.
 *
 * The Foundation surcharge is excluded here on purpose — subtracting it would turn the extra
 * pip into a discount rather than the premium it is meant to be.
 */
export function recommendedEnergy(card: any, lookup: Lookup = () => undefined): number {
  return Math.max(0, Math.round(cardBudgetValue(card, lookup)) - convertiblePips(card, lookup));
}

// ── Hero powers ───────────────────────────────────────────────────────────────
// Leaders were never run through this formula. Every hero power is hand-authored, and
// `heroPowerUsed` resets each turn (engine.ts), so a power fires EVERY turn for the whole
// game from a source that cannot be killed, discarded, countered or answered.
//
// That makes a hero power the most recurring effect in the game, and until now the only one
// charged nothing for recurring. `effectCost` already charges +40% for a unit trigger, but a
// unit trigger is CONDITIONAL — it recurs only while the body survives, and the opponent
// chooses whether to let it. A hero power is unconditional. Its premium must be larger.
//
// The premium is a straight multiplier, so it does NOT change the relative ordering of the
// leaders — the disparity table is readable without pinning it. It only matters when
// converting a value into a recommended cost, which is why it is calibrated from field
// measurement rather than assumed.

/** Recurrence premium for an unconditional every-turn effect. Calibrated in Phase 2. */
export const HERO_RECUR_MULT = 1.4;

/**
 * Leader HP charged by an `hpCost` power, in budget units. A leader has 30 HP and the
 * Signature unlocks at half, so early HP is cheap and late HP is not. Priced as a flat
 * average; only Ring Leader's Modification uses it, so the whole table barely moves on it.
 */
const LEADER_HP_VALUE = 0.35;

/** Value of ONE activation of a leader's hero power, before the recurrence premium. */
export function heroPowerValue(leader: any, lookup: Lookup = () => undefined): number {
  const power = leader?.heroPower;
  if (!power) return 0;
  return effectsCost(power.effects, lookup) * VALUE_SCALE;
}

/** What one activation COSTS, in the same budget units (energy + pips + HP). */
export function heroPowerCost(leader: any): number {
  const power = leader?.heroPower;
  if (!power) return 0;
  const pips = (power.cost?.elements ?? []).reduce((s: number, r: any) => s + num(r.amount), 0);
  return num(power.cost?.energy) + pips + num(power.hpCost) * LEADER_HP_VALUE;
}

/**
 * Value the power delivers per point of cost paid. This is the comparison that matters:
 * two powers costing 2e are meant to be roughly equally strong, and are not.
 */
export function heroPowerRatio(leader: any, lookup: Lookup = () => undefined): number {
  const cost = heroPowerCost(leader);
  return cost > 0 ? heroPowerValue(leader, lookup) / cost : heroPowerValue(leader, lookup);
}
