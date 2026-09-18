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

<<<<<<< Updated upstream
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
=======
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
//   0.29 / 1.26 / 1.35  a real premium for going tall without the cliff.
//   0.34 / 1.21 / 1.28  current. The CHEAP-END REPRICE: the first point of stat costs more and
//                       each further point costs less, which is the same dial read from both
//                       ends. It exists because the bottom of the pool had stopped asking a
//                       question — Magma Brute was a 3/2 for ONE energy, and round 1 gives
//                       exactly 1 energy, so turn one was decided by who held the best 1-drop.
//                       Kept well short of the 1.08/1.12 overshoot: the honest 1/2 and 2/1
//                       bodies still cost 1, only the overstatted ones moved to 2.
//
// Why a premium is correct at all: energy binds early (favouring cheap wide bodies) but CARDS
// and board slots bind later — 1 draw/turn over ~15 rounds, 8 slots. A big body converts one
// card into many stats, so linear pricing would simply let tall dominate the late game instead.
const STAT_BASE  = 0.34;
const STAT_R_ATK = 1.21;
const STAT_R_HP  = 1.28;
>>>>>>> Stashed changes

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

<<<<<<< Updated upstream
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
=======
/**
 * Multiplier for an `all-ally`/`all-enemy` scope. Named rather than inlined because BOTH the raw
 * effect path (`effectCost`) and the folded keyword-effects (`healer`/`debuff`, which carry
 * their own target) have to charge the same multiple — they were separate literals.
 *
 * 3.5 -> 2.9 in the cheap-end reprice. AOE was the second-largest driver of the expensive tail
 * (behind Foundations), and that tail is the half of the pool a ~15-round game never reaches:
 * cards priced at 12-17 were authored and then never cast.
 */
const AOE_MULT = 2.9;

/**
 * Status prices, corrected from measured field data. Every disruption status came back
 * OVERPRICED in the effect sweep — freeze -11.1, sleep -6.7, taunt -8.1 marginal win rate when
 * a spell carrying it replaced a similarly-priced vanilla body. Tempo denial reads far better
 * on paper than it plays: the target survives, the board does not change, and you spent a card.
 * Burn/poison were fine (+3.1) and are untouched.
 */
function statusCost(status: string, amount = 1): number {
  switch (status) {
    case 'burn': return 1.36 + 1.0 * (amount - 1);
    case 'poison': return 1.36 + 1.5 * (amount - 1);
    case 'sleep': return 1.57;   // was 2.0  (field -6.7)
    case 'freeze': return 1.64;  // was 2.5  (field -11.1)
    case 'shield': return 2.27 + 0.5 * (amount - 1); // was 2.5 (field -2.2)
    case 'trueShield': return 2.76;
    case 'zombified': return 2.58;
    case 'taunt': return 0.9;   // was 1.0  (field -8.1)
>>>>>>> Stashed changes
    default: return 1.0;
  }
}

<<<<<<< Updated upstream
/** Base cost of a single effect, ignoring the all-units and recurrence multipliers. */
function effectCostBase(e: any, lookup: Lookup, depth: number): number {
  switch (e.kind) {
    case 'damage': { let c = num(e.amount) * 0.5; if (e.chainDiminish || e.chain) c += 1.0; return c; }
    case 'heal': return num(e.amount) * 0.5;
    case 'buff': return statCost(e.stat) + keywordsCost(e.keywords, false, lookup, depth);
=======
/**
 * PIERCE — 1.0 -> 2.5.
 *
 * The 1.0 came from a field probe run under the GREEDY 1-ply AI. Removal and defence-piercing
 * are exactly what a lookahead policy exploits best (greedy cannot sequence a kill or hold an
 * answer), so that measurement understated it. Pierce negates Shield (3.4), Tough (3.3), True
 * Shield (3.0), Freeze (1.4), Spike and Taunt, and is stopped only by Immunity (3.2) — pricing
 * the thing that beats all of them BELOW any of them was never coherent.
 *
 * 2.5 sits just under Immunity: comprehensive, but conditional on the opponent actually owning
 * a defence worth piercing.
 *
 * Blast radius is small and deliberate. Of six Pierce holders, four are 0-cost signatures or an
 * undecked foundation, so this reprices exactly the two new Control removal cards — the
 * package that took Control from 36.7 to 80.3 (+44.7pp measured, three seeds).
 */
const PIERCE_COST = 2.41;

/**
 * Shared compounding multiplier for any keyword that grants a PERMANENT stat buff on a
 * repeatable trigger — Growth (ticks every turn), Bloodlust (ticks every kill), Polish (ticks
 * every hit survived). Each is the same shape already fixed once in this codebase for Ring
 * Leader's Modification (`.tuning/LOG.md`): "every other power's value is LINEAR in game
 * length... this one is QUADRATIC: activation k adds +1 to every remaining turn, so N
 * activations sum to 1+2+...+N." Modification's own fix escalated its COST per activation;
 * that lever doesn't exist for a card keyword (energy is paid once, at play), so the one-time
 * price instead has to reflect the compounding TOTAL rather than a single tick.
 *
 * COMPOUND_FACTOR is that 1+2+...+T triangular sum, standing in for "how many times this
 * keeps mattering for" — deliberately conservative (T=3) rather than the ~15-round average
 * game, since a stat-stacking body left unanswered is exactly what a removal spell is for.
 * NOT field-measured (no meta run for this pass) — tune COMPOUND_TICKS first if it overshoots.
 * It DID overshoot, and this is that tune: T=3 (factor 6) -> T=2 (factor 3). At 6 the compound
 * keywords alone were most of the expensive tail — Colossal Worm, Apex Predator, Bramble Tyrant
 * and Down Under Masks were all priced past the turn any real game reaches, which is the
 * failure mode the comment above already warned about ("a card priced far past what a game ever
 * reaches"). T=2 says a stat-stacker gets about two good ticks before it is answered, which is
 * the conservative reading the constant was always meant to encode.
 * A card that ends up priced far past what a game ever reaches (Worldheart Wyrm, already at
 * 15e before this) needs its OWN stats reconsidered rather than being forced under this curve.
 */
const COMPOUND_TICKS = 2;
const COMPOUND_FACTOR = (COMPOUND_TICKS * (COMPOUND_TICKS + 1)) / 2;
const GROWTH_BASE = 1.0;

/**
 * `move` lets whoever resolves it pick the destination lane — the CASTER for an interactive
 * spell or hero power, `firstOpenLane` for an auto-targeting trigger (mover keyword, on-play/
 * on-attack/end-of-turn effects). Either way, dropping a non-Aquatic, non-Airborne target in
 * Water starts it DROWNING: pinned at 0 attack and taking `RULES.DROWN_DAMAGE` every one of
 * its owner's turns until it moves out or gains evasion. That is a real, repeatable disable —
 * comparable to Freeze (1.4) but persistent rather than one-turn, and it got MORE available
 * (not less) once Water moved to the middle of a 5-lane board, since `firstOpenLane` reaches
 * it sooner. It was priced as a flat 1.0 with no regard for who could be targeted. A move that
 * can only ever land an ALLY (or the caster itself) carries none of that risk and is priced as
 * plain repositioning instead.
 */
const MOVE_REPOSITION = 0.5;
const MOVE_ENEMY_DROWN_PREMIUM = 1.5;
const canTargetEnemy = (target: unknown): boolean =>
  target === 'enemy' || target === 'any' || target === 'all-enemy';
/**
 * A `buff` effect can grant an arbitrary keyword from `grantableKeywordsShape` (schema.ts) to
 * whatever it targets — and unlike a card's own native keywords, that target can be an ENEMY
 * unit ('enemy', 'all-enemy', 'lane-enemy', 'any', or Kamikaze's 'killer'). `keywordsCost`
 * prices every keyword ONCE, from the perspective of a unit that WANTS it — correct for a
 * card's own keywords (always self-worn) and for Environment grants (symmetric: both sides'
 * units in the lane get it), but wrong for a one-sided grant onto a chosen enemy.
 *
 * Only keywords that are a DOWNSIDE for their holder are affected, because only those flip
 * sign when forced onto someone who doesn't want them. Every other grantable keyword (Pierce,
 * Immunity, Airborne, Growth, ...) is strictly good for its holder, so "give the ENEMY Pierce"
 * is just a bad card, not a mispriced one — nobody would author it, and its already-high price
 * discourages it further. Brittle is the one keyword in `grantableKeywordsShape` that is a
 * downside natively (self-destructs its holder after one attack) and therefore the one where
 * self-cost and enemy-grant cost must diverge.
 */
const ENEMY_GRANT_OVERRIDE: Partial<Record<string, number>> = {
  // Forced Brittle on an enemy is an unconditional kill contingent only on that unit ever
  // attacking again — which nearly everything with real Attack eventually does. Priced near
  // Lethal (4.5): the "out" here (the target never attacks) is rarer than Lethal's own
  // condition (the attack still has to connect), so it is not discounted further.
  brittle: 4.0,
};
const canGrantToEnemy = (target: unknown): boolean =>
  target === 'enemy' || target === 'all-enemy' || target === 'lane-enemy' || target === 'any' || target === 'killer';

const moveEffectCost = (target: unknown): number =>
  MOVE_REPOSITION + (canTargetEnemy(target) ? MOVE_ENEMY_DROWN_PREMIUM : 0);

/** Price of forcing a card into the OPPONENT's hand: a clog, valued independently of the card. */
const CONJURE_DENIAL = 1.5;

/** Card advantage from conjuring one card — the same rate `draw` is charged at. */
const CONJURE_ADVANTAGE = 0.85;

/**
 * How often a `conjureOnKill` rider is expected to actually pay out. Removal is aimed at
 * things it can kill, so this is well above a coin flip; it is not 1.0 because a whiffed
 * shot conjures nothing.
 */
const CONJURE_ON_KILL_ODDS = 0.7;

/**
 * Value a conjured card carries ABOVE its own printed cost. Zero for a fairly-priced card
 * (you still pay for it), its full value for a free token. Priced at depth+1 so a chain of
 * cards that conjure each other terminates.
 */
function conjureSurplus(cardId: unknown, lookup: Lookup, depth: number): number {
  if (typeof cardId !== 'string') return 0;
  const card: any = lookup(cardId);
  if (!card) return 0;
  const pips = (card.cost?.elements ?? []).reduce((s: number, el: any) => s + num(el?.amount), 0);
  const printed = num(card.cost?.energy) + pips;
  return Math.max(0, valueOf(card, lookup, depth + 1) - printed);
}

/** Base cost of a single effect, ignoring the all-units and recurrence multipliers. */
function effectCostBase(e: any, lookup: Lookup, depth: number): number {
  switch (e.kind) {
    // Damage is PROGRESSIVE. Measured: 2 damage reads neutral (+1.4) but 4 damage is badly
    // underpriced (+11.1) — big hits kill real bodies where small ones only chip, so the value
    // per point rises. Same reasoning as the geometric stat curve, applied to removal.
    case 'damage': {
      // `amountFrom: 'targetAttack'` has no printed amount. Priced at a proxy of 3 — not the
      // pool's MEAN attack (1.88), because you cast it on a real threat, not on a random unit;
      // 24% of units have 3+ attack and those are what it is for. Deliberately not discounted
      // for being conditional: the conditionality is the card's identity (dead against a 0/5
      // wall, lethal to a 5/5), and after round ~5 a price is not what restrains a card anyway.
      const amt = e.amountFrom ? 3 : num(e.amount);
      let c = amt * 0.5 + Math.max(0, amt - 2) * 0.55;
      if (e.chainDiminish || e.chain) c += 1.0;
      // Conditional on the damage actually killing, so it is discounted against a plain
      // conjure — but it is NOT free, which is what it used to be.
      if (e.conjureOnKill) c += CONJURE_ON_KILL_ODDS * (CONJURE_ADVANTAGE + conjureSurplus(e.conjureOnKill, lookup, depth));
      // Same concept as the Pierce KEYWORD, so it tracks the keyword's price (see below).
      if (e.pierce) c += PIERCE_COST;
      return c;
    }
    case 'heal': return num(e.amount) * 0.5;   // was 0.5/pt (field -6.7 on heal 3)
    // A spell buff is worth far more than the same stats printed on a body (+13.9): it lands on
    // an already-deployed unit, so it dodges summoning sickness and doubles down on a threat.
    // `onHit` was missing here, so a buff whose ENTIRE payload was an on-hit package priced at
    // exactly 0 — Symbiosis and Kedou's Scalding Veil were both free by arithmetic.
    case 'buff': return statCost(e.stat) * 1.9 + keywordsCost(e.keywords, false, lookup, depth, e.target) + onHitCost(e.onHit);
>>>>>>> Stashed changes
    case 'debuff': return 1.25 + statCost(e.stat);
    case 'applyStatus': return statusCost(e.status, num(e.amount, 1));
    case 'draw': return num(e.amount, 1) * 1.0;
    case 'energy': return num(e.amount, 1) * 0.5;
<<<<<<< Updated upstream
    case 'move': return 1.0;
    case 'expel': return 2.5;
    case 'forget':
    case 'mill': return 1.75 + 1.5 * (num(e.amount, 1) - 1);
    case 'conjure': return 1.5;
=======
    // Same energy, one turn later: worth slightly less than immediate energy, never more.
    case 'energyNext': return num(e.amount, 1) * 0.4;
    // Fills all four banks to cap. Worth the energy it saves later, but the actual haul
    // depends on the leader's caps and what is already banked, so price it at a typical
    // refill (~6 points) times the 0.5 the budget charges per pip.
    case 'bankMax': return 3.0;
    case 'move': return moveEffectCost(e.target);
    case 'expel': return 1.8;   // was 2.5 (field -6.7)
    // Briefly cheapened to 0.5 + 0.7 when Deck Out measured 19.8%, then REVERTED: the archetype
    // was weak because the pool had no Forget CARDS at all, not because Forget was mispriced.
    // Once the cards existed (plus the deck-out hold tax) Deck Out went to 62.5% — every one of
    // its 12 matchups improved by ~40pp — so the discount was never what it needed.
    case 'forget':
    case 'mill': return 0.7 + 1.5 * (num(e.amount, 1) - 1);  // was 1.75 base (field -10.8)
    // Conjure was a FLAT 1.5 regardless of what it made, which meant the formula could not
    // police token strength at all: a spell adding two 0-cost 2/1 Battle Ready bodies priced
    // identically to one adding a vanilla 1/1. Now it is priced from the conjured card.
    //
    // A conjured card lands in HAND, so the recipient still pays its printed cost — unlike
    // `summon`, which pays nothing. The value delivered is therefore the card advantage (one
    // card from nowhere, priced exactly like `draw`) PLUS whatever surplus the conjured card
    // carries over its own printed price. A fairly-priced conjure is just a tutored draw; a
    // 0-cost token is a draw plus the token's whole value.
    case 'conjure':
      // Conjuring into the ENEMY's hand is denial, not card advantage — the surplus model is
      // wrong-signed there (a better card would price as a bigger gift to you). Those keep the
      // old flat price: what they are worth is the clog, not the card.
      return e.target === 'enemy' || e.target === 'all-enemy'
        ? CONJURE_DENIAL
        : CONJURE_ADVANTAGE + conjureSurplus(e.cardId, lookup, depth);
>>>>>>> Stashed changes
    // depth+1 so self-summon bloodlust (e.g. Shypher) stops at depth>1 and returns stats only
    case 'summon': return e.cardId ? valueOf(lookup(e.cardId), lookup, depth + 1) : 1.0;
    case 'extraAction': return 1.5;
    case 'costMod': return 1.2;
    case 'setStats': return 2.0;
<<<<<<< Updated upstream
    case 'cleanse': return 1.0;
=======
    // A permanent, per-copy discount on everything you are already holding. Flat rather than
    // scaled by `amount`: what it is worth is bounded by HAND SIZE and by how much of that hand
    // you ever get to play, not by the size of the reduction — a -99 (Eksana's cascade) empties
    // the same hand a -3 would once every card in it is already free.
    case 'discountHand': return 1.5;
    case 'cleanse': return 0.45;  // was 1.0 (field -9.2)
>>>>>>> Stashed changes
    case 'custom': return 0;
    default: return 0;
  }
}

function effectCost(e: any, lookup: Lookup, recurring = false, depth = 0): number {
  const base = effectCostBase(e, lookup, depth);
<<<<<<< Updated upstream
  const allMult = isAll(e.target) ? 2.5 : 1;
=======
  // AOE measured UNDERPRICED at 2.5 (+9.2 for a 2-damage all-enemy sweep), so the multiplier
  // rises. Note this is the EFFECT-scope multiplier and is separate from the Environment grant
  // multiplier, which went the other way (2.5 -> 1.0) because that grant is symmetric.
  const allMult = isAll(e.target) ? AOE_MULT : 1;
>>>>>>> Stashed changes
  // Any effect in onAttack / endOfTurn / startOfTurn fires every turn the unit is alive.
  // Universal ×1.4 recurrence premium — no exceptions.
  const recurMult = recurring ? 1.4 : 1;
  return base * allMult * recurMult * ABILITY_FACTOR;
}

function effectsCost(arr: any[] | undefined, lookup: Lookup, recurring = false, depth = 0): number {
  return (arr ?? []).reduce((s, e) => s + effectCost(e, lookup, recurring, depth), 0);
}

function aquaticCost(a: any): number {
  if (a === true) return 0.9;
  if (Array.isArray(a)) return 0.9 + a.reduce((s, e) => s + statCost(e.stat), 0);
  if (a && typeof a === 'object') return 0.9 + statCost(a);
  return 0;
}

<<<<<<< Updated upstream
/** Value of a keywords object. `allUnits` multiplies every keyword by 2.5 (environment grants). */
function keywordsCost(kw: any, allUnits: boolean, lookup: Lookup, depth = 0): number {
  if (!kw) return 0;
  const m = allUnits ? 2.5 : 1;
=======
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

/**
 * Bloodlust, Polish, Sacrifice and Kamikaze don't just trigger — each one GRANTS a further
 * ability on top: a permanent stat buff (Bloodlust/Polish/Sacrifice's `buff`/`stat`) or an
 * arbitrary nested effect (Bloodlust/Polish's `effects`, Kamikaze's own payload, which IS an
 * Effect rather than a wrapper around one). `keywordsCost` already prices that payload in
 * full — a Bloodlust carrying a big buff or an extra conjure costs more than a bare one — but
 * the ABILITY COUNT that earns a card its pip discount (`recommendedPips`/`recommendedEnergy`)
 * only ever credited the keyword ONCE, treating a Bloodlust that grants nothing extra the same
 * as one that grants a whole chain. This counts each granted payload as its own ability slot,
 * so a keyword doing more work earns more of the same 1-pip-per-ability discount every other
 * ability gets. Used identically by `abilityCount` (diagnostic) and `pipBreakdown` (pricing),
 * so the two stay consistent with each other.
 */
const compoundGrantCount = (k: string, v: any, lookup: Lookup): number => {
  let extra = 0;
  if (k === 'bloodlust' || k === 'polish' || k === 'sacrifice') {
    const buff = v?.buff ?? v?.stat;
    if (buff && (num(buff.attack) || num(buff.hp))) extra += 1;
  }
  if (k === 'kamikaze') {
    if (v && effectCost(v, lookup, false, 0) > 0) extra += 1;
  } else {
    for (const e of v?.effects ?? []) if (effectCost(e, lookup, false, 0) > 0) extra += 1;
  }
  return extra;
};

/**
 * Ability slots a `buff` EFFECT hands out on top of itself — one per granted keyword and one
 * per granted on-hit status. Exactly the reasoning `compoundGrantCount` applies to a keyword
 * that grants a further payload: the buff is one ability, and each thing it confers is another.
 *
 * Without it, a keyword-granting spell earned a single ability slot and — worse — NO element
 * pip at all, because `elementOfEffect` has no entry for `buff` and so fell through to
 * "colourless". That contradicted the guide's own rule that a pip is charged in the element of
 * the ABILITY that earns it: Bulwark grants Tough, an Earth ability, and paid for it entirely
 * in generic energy. Counted here and in `pipBreakdown`, which walk in lockstep by construction.
 */
const buffGrantCount = (e: any, lookup: Lookup): number => {
  let n = 0;
  for (const [k, v] of Object.entries<any>(e?.keywords ?? {})) {
    if (keywordsCost({ [k]: v }, false, lookup, 0) > 0) n++;
    n += compoundGrantCount(k, v, lookup);
  }
  for (const k of ['burn', 'poison', 'sleep', 'freeze']) {
    if (e?.onHit?.[k] !== undefined && e.onHit[k] !== false) n++;
  }
  return n;
};

/**
 * Value of a keywords object. `allUnits` applies the Environment grant multiplier.
 * `grantTarget` is the target of the `buff` effect doing the granting (undefined for a card's
 * own native keywords, which are always self-worn) — when it can reach an enemy, downside
 * keywords in `ENEMY_GRANT_OVERRIDE` price as the curse they become instead of the discount
 * they'd be on their own holder.
 */
function keywordsCost(kw: any, allUnits: boolean, lookup: Lookup, depth = 0, grantTarget?: unknown): number {
  if (!kw) return 0;
  const m = allUnits ? ENV_GRANT_MULT : 1;
  const toEnemy = grantTarget !== undefined && canGrantToEnemy(grantTarget);
>>>>>>> Stashed changes
  let c = 0;
  for (const [k, v] of Object.entries<any>(kw)) {
    if (toEnemy && k in ENEMY_GRANT_OVERRIDE) { c += ENEMY_GRANT_OVERRIDE[k]!; continue; }
    switch (k) {
      // Brittle is a pure downside (self-destructs after one attack), but it's near-free for the
      // one-shot reach attackers that actually run it — a full −1.0 energy refund undercosts them
      // (it pushed Swift Falcon to a 1e 3/1 flyer). Priced for the average case at −0.5.
      // (Forced onto an enemy instead of worn: see ENEMY_GRANT_OVERRIDE above — this case is
      // reached only when `grantTarget` cannot hit an enemy, e.g. a card's own keywords.)
      // ── THE ABILITY PRICE TABLE, compressed toward its own middle (2.2) at 0.7, floored
      // at 0.9. The `field delta` notes below record where each entry came from and still
      // explain its ORDER relative to its neighbours, which the compression preserves exactly
      // — Lethal is still the dearest keyword, Taunt still the cheapest. What changed is the
      // SPREAD: it ran 0.20 to 4.50, a 22x range, and both ends of that range were broken.
      //
      // At the bottom, five cards cost literally nothing (0 energy AND 0 pips) because a single
      // 0.2-0.25 ability rounds to zero — Target, Watchtowers, Fortified Line, Shallows and
      // Sacred Spring. A free card is not a cheap card; it has no opportunity cost, so the only
      // question it ever asks is "do I own it", and no amount of measurement can price it.
      // At the top, the sum of two dear keywords landed past any turn a ~15-round game reaches.
      //
      // The floor of 0.9 is the real content of the change: it is the cheapest an ability can be
      // and still round to a cost at all.
      case 'brittle': c += -0.5; break;
<<<<<<< Updated upstream
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
=======
      case 'battleReady': c += 2.58; break;  // field delta +25.3 -> repriced
      case 'sniper': c += 0.9; break;  // field delta -5.2 -> repriced
      case 'overshot': c += 3.5; break;  // field delta +33.3 -> repriced
      case 'airborne': c += 2.02; break;  // field delta +11.8 -> repriced
      case 'strikeThrough': c += 2.34; break;  // field delta +9.4 -> repriced
      case 'branchShot': c += 3.11; break;  // field delta +38.9 -> repriced
      case 'splashDamage': c += 2.41; break; // multi-target (3 fronts) — empirically Pierce-tier+, not 1.5
      case 'doubleStrike': c += 3.39; break;  // field delta +23.6 -> repriced
      case 'taunt': c += 0.9; break;  // field delta -8.0 -> repriced
      case 'doubleTeam': c += 1.85; break;  // field delta +6.6 -> repriced
      case 'immunity': c += 2.9; break;  // field delta +11.8 -> repriced
      case 'pierce': c += PIERCE_COST; break;
      case 'lethal': c += 3.81; break;  // field delta +15.3 -> repriced
      case 'trueShield': c += 2.76; break;
      case 'zombified': c += 2.58; break;
      case 'shield': c += 3.04 + 0.5 * (num(v, 1) - 1); break;
      case 'tough': c += 2.97 + 1.5 * (num(v, 1) - 1); break;
      case 'spike': c += 1.71 + 0.5 * (num(v, 1) - 1); break;
      case 'aquatic': c += aquaticCost(v); break;
      case 'producer': c += num(v?.amount, 1) * 0.9; break;           // energy×0.5 × 1.4
      // Growth, Bloodlust and Polish all grant a PERMANENT stat buff on a repeatable trigger
      // and were all priced FLAT — one tick's worth of stat gain plus a small ability tax —
      // with no regard for how many times that trigger actually fires over a game. See
      // COMPOUND_FACTOR's own comment for the full reasoning (same shape as Ring Leader's
      // Modification, LOG.md) and its caveat: NOT field-measured, tune COMPOUND_TICKS first
      // if any of the three overshoots.
      case 'growth': c += GROWTH_BASE + statCost(v) * COMPOUND_FACTOR; break;
      case 'bloodlust': c += 1.95 + statCost(v?.buff) * COMPOUND_FACTOR + effectsCost(v?.effects, lookup, false, depth); break;
      case 'polish': c += 1.0 + statCost(v?.stat) * COMPOUND_FACTOR + effectsCost(v?.effects, lookup, false, depth); break;
      // The folded keyword-effects carry their own TARGET, and an `all-ally`/`all-enemy`
      // scope is worth the same multiple here as it is on a raw effect (see `effectCost`).
      // Pricing them flat let a keyword sneak a whole-board effect in at single-target rates —
      // the one route by which `debuff`/`healer` could be authored cheaper as a keyword than
      // as the trigger effect `expandKeywordEffects` turns them into.
      case 'healer': c += num(v?.amount, 1) * 0.9 * (isAll(v?.target) ? AOE_MULT : 1); break; // heal×0.5 × 1.4
      // Same drowning premium as the raw `move` effect (see MOVE_ENEMY_DROWN_PREMIUM), keyed
      // off the keyword's own scope enum ('either' is the keyword-form spelling of 'any').
      case 'mover': c += moveEffectCost(v?.scope === 'either' ? 'any' : v?.scope) * 1.4; break;
      case 'expel': c += 3.11; break;                                   // expel×2.5 × 1.4
      case 'debuff': c += (1.25 + statCost(v)) * 1.4 * (isAll(v?.target) ? AOE_MULT : 1); break;
>>>>>>> Stashed changes
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
<<<<<<< Updated upstream
=======
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
const VALUE_SCALE = 1.0669;
// 1.09 -> 1.0669 in the cheap-end reprice, and ONLY to hold the pool's mean total cost at its
// previous 4.442. Lifting the floor adds value everywhere, so without this the whole pool would
// have drifted more expensive — a pace change smuggled in alongside a change to RELATIVE
// pricing, which is exactly what the comment above says not to do. Everything else in this pass
// redistributes; this one number holds the level.

>>>>>>> Stashed changes
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

<<<<<<< Updated upstream
/** Recommended whole-number energy cost: value minus the budget already paid by element
 *  pips (each pip = 0.5), rounded, floored at 0. */
export function recommendedEnergy(card: any, lookup: Lookup = () => undefined): number {
  const pips = (card?.cost?.elements ?? []).reduce((s: number, e: any) => s + num(e.amount), 0);
  return Math.max(0, Math.round(cardBudgetValue(card, lookup) - 0.5 * pips));
}
=======
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

// ── Ability → element ─────────────────────────────────────────────────────────
// The canonical 8/8/8/8 map (docs/card-creation-guide.txt). A pip is charged in the element of
// the ABILITY that earns it, not the element printed on the card — so a Fire body carrying
// Taunt pays an Earth pip, and cards become multi-element by what they DO.
//
// This is a real constraint in a way energy is not: energy equals the round number and is
// uncapped, whereas pips are gated by a leader's `elementCaps` and by banking. Note it is a
// constraint, not a lock — `settleCost` pays any element shortfall out of generic energy, so an
// off-element ability makes a card EXPENSIVE for the wrong leader, never uncastable.
export const ABILITY_ELEMENT: Record<string, Element> = {
  // Fire — aggression, burst, self-sacrifice
  battleReady: 'fire', strikeThrough: 'fire', doubleStrike: 'fire', brittle: 'fire',
  kamikaze: 'fire', countdown: 'fire', overshot: 'fire', splashDamage: 'fire',
  // Water — control, positioning, denial. (Freeze and Sleep are Water's statuses; with those
  // counted as abilities Water reached 10 and Earth 8, so SHIELD moved to Earth to even it at
  // 9/9/9/9. Shield joins its own family there — Earth already holds Tough and True Shield.)
  aquatic: 'water', sniper: 'water', pierce: 'water',
  doubleTeam: 'water', healer: 'water', mover: 'water', expel: 'water',
  // Nature — growth, resources, evolution
  growth: 'nature', bloodlust: 'nature', producer: 'nature', airborne: 'nature',
  lethal: 'nature', metamorphosis: 'nature', sacrifice: 'nature', branchShot: 'nature',
  // Earth — defense, endurance, punishment
  tough: 'earth', polish: 'earth', taunt: 'earth', spike: 'earth',
  trueShield: 'earth', immunity: 'earth', zombified: 'earth', debuff: 'earth',
  shield: 'earth',
};

/** Statuses carry their own element, so an on-hit Burn is Fire wherever it is printed. */
const STATUS_ELEMENT: Record<string, Element> = {
  burn: 'fire', poison: 'nature', freeze: 'water', sleep: 'water',
  shield: 'earth', taunt: 'earth', trueShield: 'earth', zombified: 'earth',
};

/**
 * Effects that mirror a mapped keyword take its element. Everything else (damage, draw, heal,
 * summon, energy...) falls back to the CARD's element — deliberately: those have no canonical
 * element in the guide, and inventing one here would be a design decision smuggled into a
 * pricing function.
 */
const EFFECT_ELEMENT: Record<string, Element> = {
  move: 'water', expel: 'water', debuff: 'earth',
};

/**
 * Returns undefined for effects with NO canonical element (damage, draw, heal, summon,
 * energy...). Those earn no pip at all — their cost stays as plain energy. An element pip is a
 * statement that an ability belongs to an element; charging one for a colourless effect just
 * because of the card it is printed on says nothing.
 */
const elementOfEffect = (e: any): Element | undefined => {
  if (e?.kind === 'applyStatus') return STATUS_ELEMENT[e.status];
  // `pierce` on a damage effect is the Pierce ABILITY wearing a flag rather than a keyword, so
  // it colours the effect Water even though plain damage is colourless.
  if (e?.pierce) return ABILITY_ELEMENT.pierce;
  return EFFECT_ELEMENT[e?.kind];
};

export type PipTally = Partial<Record<Element, number>>;

/**
 * Which element each of a card's abilities charges its pip in. Walks exactly what
 * `abilityCount` walks, so the TOTAL always equals `abilityCount` — the two cannot drift.
 */
export function pipBreakdown(card: any, lookup: Lookup = () => undefined): PipTally {
  const tally: PipTally = {};
  if (!card) return tally;
  const cardEl: Element = card.element ?? 'fire';
  const add = (el: Element): void => { tally[el] = (tally[el] ?? 0) + 1; };

  const kws = (kw: any): void => {
    for (const [k, v] of Object.entries<any>(kw ?? {})) {
      if (keywordsCost({ [k]: v }, false, lookup, 0) > 0) add(ABILITY_ELEMENT[k] ?? cardEl);
      // Each extra ability a compound keyword GRANTS earns its own pip, in the same element
      // the keyword itself would — see `compoundGrantCount`.
      for (let i = 0; i < compoundGrantCount(k, v, lookup); i++) add(ABILITY_ELEMENT[k] ?? cardEl);
    }
  };
  const fx = (arr: any[] | undefined): void => {
    for (const e of arr ?? []) {
      if (effectCost(e, lookup, false, 0) <= 0) continue;
      const el = elementOfEffect(e);
      if (el) add(el); // colourless effects earn no pip — see elementOfEffect
      // A `buff` is colourless in itself (its stat half has no element), but each ability it
      // GRANTS is charged in that ability's own element — see `buffGrantCount`.
      if (e.kind === 'buff') {
        for (const [k, v] of Object.entries<any>(e.keywords ?? {})) {
          if (keywordsCost({ [k]: v }, false, lookup, 0) > 0) add(ABILITY_ELEMENT[k] ?? cardEl);
          for (let i = 0; i < compoundGrantCount(k, v, lookup); i++) add(ABILITY_ELEMENT[k] ?? cardEl);
        }
        for (const k of ['burn', 'poison', 'sleep', 'freeze']) {
          if (e.onHit?.[k] !== undefined && e.onHit[k] !== false) add(STATUS_ELEMENT[k]!);
        }
      }
    }
  };
  const onHit = (oh: any): void => {
    if (!oh) return;
    for (const k of ['burn', 'poison', 'sleep', 'freeze']) {
      if (oh[k] !== undefined && oh[k] !== false) add(STATUS_ELEMENT[k]!);
    }
  };

  kws(card.keywords);
  onHit(card.onHit);
  fx(card.onPlay); fx(card.onAttack); fx(card.endOfTurn); fx(card.startOfTurn);
  if (card.type === 'spell') fx(card.effects);
  if (card.type === 'environment') { fx(card.effects); kws(card.grantKeywords); }
  if (card.type === 'foundation') {
    kws(card.grants?.keywords); onHit(card.grants?.onHit);
    fx(card.grants?.onAttack); fx(card.grants?.endOfTurn); fx(card.grants?.startOfTurn);
  }
  return tally;
}

/**
 * The card's element cost, as `cost.elements` wants it. Trims to the same total
 * `recommendedPips` reports, dropping the SMALLEST element groups first so a card keeps the
 * identity it is mostly made of. A Foundation's surcharge pip is charged in its own element.
 */
export function recommendedElements(
  card: any, lookup: Lookup = () => undefined,
): { type: Element; amount: number }[] {
  const total = recommendedPips(card, lookup);
  if (total <= 0) return [];
  const tally = pipBreakdown(card, lookup);
  if (card?.type === 'foundation') {
    const el: Element = card.element ?? 'fire';
    tally[el] = (tally[el] ?? 0) + FOUNDATION_PIP_SURCHARGE;
  }
  const rows = (Object.entries(tally) as [Element, number][])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);
  const out: { type: Element; amount: number }[] = [];
  let left = total;
  for (const [el, n] of rows) {
    if (left <= 0) break;
    const take = Math.min(n, left);
    out.push({ type: el, amount: take });
    left -= take;
  }
  return out;
}



/**
 * How many distinct abilities a card has. Only abilities that ADD value count — a pure
 * downside such as Brittle must not earn its card a pip. Stats are not abilities.
 */
export function abilityCount(card: any, lookup: Lookup = () => undefined): number {
  if (!card) return 0;
  let n = 0;
  const countKeywords = (kw: any): void => {
    for (const [k, v] of Object.entries<any>(kw ?? {})) {
      if (keywordsCost({ [k]: v }, false, lookup, 0) > 0) n++;
      n += compoundGrantCount(k, v, lookup);
    }
  };
  const countEffects = (arr: any[] | undefined): void => {
    for (const e of arr ?? []) {
      if (effectCost(e, lookup, false, 0) > 0) n++;
      if (e?.kind === 'buff') n += buffGrantCount(e, lookup);
    }
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
/**
 * How many pips a card converts its energy into. This counts ELEMENT-BEARING abilities, not all
 * abilities: an ability with no element (a plain damage or draw effect) leaves its cost as
 * energy instead of converting it. So a card of purely colourless abilities is priced entirely
 * in energy — the NEUTRAL class.
 */
const convertiblePips = (card: any, lookup: Lookup): number => {
  const baseEnergy = Math.round(cardBudgetValue(card, lookup));
  const elemental = Object.values(pipBreakdown(card, lookup)).reduce<number>((s, n) => s + (n ?? 0), 0);
  return Math.max(0, Math.min(elemental, MAX_ABILITY_PIPS, baseEnergy));
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

>>>>>>> Stashed changes
