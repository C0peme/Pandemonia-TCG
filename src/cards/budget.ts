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

type Lookup = (id: string) => unknown;

const num = (v: unknown, d = 0): number => (typeof v === 'number' ? v : d);

// Flat stat cost — used for incremental buff/debuff/grant amounts (not unit base stats).
const statCost = (s: { attack?: number; hp?: number } | undefined | null): number =>
  s ? num(s.attack) * 0.25 + num(s.hp) * 0.5 : 0;

// Geometric (progressive) stat cost for a unit's base stats.
// Attack: geometric with r=1.30 (no cap — attack values rarely exceed 6).
// HP: geometric with r=1.40, no cap — outlier tanks are balanced at the data level.
// STAT_BASE raised 0.28 → 0.38: printed raw stats are deliberately LESS energy-efficient than
// abilities, so vanilla stat-stick units (Midrange) pay a premium and ability cards out-value
// them per energy. Tuned high enough that the efficient 2/3 and 3/4 vanilla bodies that anchor
// goodstuff decks cost +1 (a 2/3 now ≈ 2.53 → 3e), which is what actually taxes vanilla-heavy
// decks. Paired with ABILITY_FACTOR below. Note: `statCost` (incremental buff/grant stats) is
// intentionally NOT raised — only PRINTED bodies cost more, not ability-granted stats.
const STAT_BASE  = 0.38;
const STAT_R_ATK = 1.30;
const STAT_R_HP  = 1.40;

// Abilities (keywords, triggered/spell effects, on-hit statuses) are discounted 20%, so an
// ability is worth more impact per energy than the equivalent raw stats. This is the second
// half of the stats→abilities value shift (see STAT_BASE).
const ABILITY_FACTOR = 0.8;

const attackCost = (n: number): number =>
  n <= 0 ? 0 : STAT_BASE * (Math.pow(STAT_R_ATK, n) - 1) / (STAT_R_ATK - 1);

const hpCost = (n: number): number =>
  n <= 0 ? 0 : STAT_BASE * (Math.pow(STAT_R_HP, n) - 1) / (STAT_R_HP - 1);

const unitStatCost = (attack: number, hp: number): number =>
  attackCost(attack) + hpCost(hp);

const isAll = (t: unknown): boolean => t === 'all-ally' || t === 'all-enemy';

function statusCost(status: string, amount = 1): number {
  switch (status) {
    case 'burn': return 1.0 + 1.0 * (amount - 1);
    case 'poison': return 1.0 + 1.5 * (amount - 1);
    case 'sleep': return 2.0;
    case 'freeze': return 2.5;
    case 'shield': return 2.5 + 0.5 * (amount - 1);
    case 'trueShield': return 3.0;
    case 'zombified': return 2.75;
    case 'taunt': return 1.0;
    default: return 1.0;
  }
}

/** Base cost of a single effect, ignoring the all-units and recurrence multipliers. */
function effectCostBase(e: any, lookup: Lookup, depth: number): number {
  switch (e.kind) {
    case 'damage': { let c = num(e.amount) * 0.5; if (e.chainDiminish || e.chain) c += 1.0; return c; }
    case 'heal': return num(e.amount) * 0.5;
    case 'buff': return statCost(e.stat) + keywordsCost(e.keywords, false, lookup, depth);
    case 'debuff': return 1.25 + statCost(e.stat);
    case 'applyStatus': return statusCost(e.status, num(e.amount, 1));
    case 'draw': return num(e.amount, 1) * 1.0;
    case 'energy': return num(e.amount, 1) * 0.5;
    case 'move': return 1.0;
    case 'expel': return 2.5;
    case 'forget':
    case 'mill': return 1.75 + 1.5 * (num(e.amount, 1) - 1);
    case 'conjure': return 1.5;
    // depth+1 so self-summon bloodlust (e.g. Shypher) stops at depth>1 and returns stats only
    case 'summon': return e.cardId ? valueOf(lookup(e.cardId), lookup, depth + 1) : 1.0;
    case 'extraAction': return 1.5;
    case 'costMod': return 1.0;
    case 'setStats': return 2.0;
    case 'cleanse': return 1.0;
    case 'custom': return 0;
    default: return 0;
  }
}

function effectCost(e: any, lookup: Lookup, recurring = false, depth = 0): number {
  const base = effectCostBase(e, lookup, depth);
  const allMult = isAll(e.target) ? 2.5 : 1;
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

/** Value of a keywords object. `allUnits` multiplies every keyword by 2.5 (environment grants). */
function keywordsCost(kw: any, allUnits: boolean, lookup: Lookup, depth = 0): number {
  if (!kw) return 0;
  const m = allUnits ? 2.5 : 1;
  let c = 0;
  for (const [k, v] of Object.entries<any>(kw)) {
    switch (k) {
      // Brittle is a pure downside (self-destructs after one attack), but it's near-free for the
      // one-shot reach attackers that actually run it — a full −1.0 energy refund undercosts them
      // (it pushed Swift Falcon to a 1e 3/1 flyer). Priced for the average case at −0.5.
      case 'brittle': c += -0.5; break;
      case 'battleReady': c += 0.25; break;
      case 'sniper': c += 0.75; break;
      case 'overshot': c += 0.75; break;
      case 'airborne': c += 0.75; break;
      case 'strikeThrough': c += 1.5; break;
      case 'branchShot': c += 1.5; break;
      case 'splashDamage': c += 2.5; break; // multi-target (3 fronts) — empirically Undershot-tier+, not 1.5
      case 'doubleStrike': c += 1.5; break;
      case 'taunt': c += 1.0; break;
      case 'doubleTeam': c += 1.0; break;
      case 'immunity': c += 2.0; break;
      case 'undershot': c += 2.0; break;
      case 'lethal': c += 3.0; break;
      case 'trueShield': c += 3.0; break;
      case 'zombified': c += 2.75; break;
      case 'shield': c += 2.5 + 0.5 * (num(v, 1) - 1); break;
      case 'tough': c += 2.0 + 1.5 * (num(v, 1) - 1); break;
      case 'spike': c += 1.5 + 0.5 * (num(v, 1) - 1); break;
      case 'aquatic': c += aquaticCost(v); break;
      case 'producer': c += num(v?.amount, 1) * 0.7; break;           // energy×0.5 × 1.4
      case 'growth': c += 1.5 + statCost(v); break;
      case 'bloodlust': c += 1.25 + statCost(v?.buff) + effectsCost(v?.effects, lookup, false, depth); break;
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
export function cardBudgetValue(card: any, lookup: Lookup = () => undefined): number {
  return valueOf(card, lookup, 0);
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
    // A Foundation is a FULL UNIT (its own body, keywords, on-hit) that ALSO grants a bonus to a
    // host placed on top. Price the body exactly like a unit, then add the grant as a discounted
    // PREMIUM: the grant is delayed upside (you need a second card on top, and the Foundation can
    // be killed first), so it is discounted by FOUND_GRANT_DISCOUNT — but always leaves a small
    // positive premium so a Foundation is never cheaper than the equivalent vanilla unit (else
    // everyone would run it purely as a body). The premium scales with how strong the grant is.
    const FOUND_GRANT_DISCOUNT = 1.5;
    const body = unitStatCost(num(card.attack), num(card.hp)) +
      keywordsCost(card.keywords, false, lookup, depth) + onHitCost(card.onHit) +
      triggers(true, card.onAttack, card.endOfTurn, card.startOfTurn) + triggers(false, card.onPlay);
    const grant = statCost(card.grants?.stat) + keywordsCost(card.grants?.keywords, false, lookup, depth);
    const premium = Math.max(0.5, grant - FOUND_GRANT_DISCOUNT);
    return body + premium;
  }
  if (card.type === 'spell') return effectsCost(card.effects, lookup);
  if (card.type === 'environment') {
    return effectsCost(card.effects, lookup) + keywordsCost(card.grantKeywords, true, lookup);
  }
  return 0;
}

/** Recommended whole-number energy cost: value minus the budget already paid by element
 *  pips (each pip = 0.5), rounded, floored at 0. */
export function recommendedEnergy(card: any, lookup: Lookup = () => undefined): number {
  const pips = (card?.cost?.elements ?? []).reduce((s: number, e: any) => s + num(e.amount), 0);
  return Math.max(0, Math.round(cardBudgetValue(card, lookup) - 0.5 * pips));
}
