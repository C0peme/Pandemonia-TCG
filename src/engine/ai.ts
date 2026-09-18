/**
 * AI opponent — pure, deterministic turn planning. No React, no side effects.
 *
 * `chooseAction(registry, state)` returns the SINGLE next action the active player should
 * take (a play, a `resolvePending` resolution, or a fully-populated `endTurn`). The UI
 * driver calls it once per render: dispatch → re-render → choose again, until it returns
 * `endTurn`. `planTurn` loops it on clones for headless play / tests.
 *
 * Policy — 2-ply turn search:
 *  - `evaluate(state, me)` scores a position (leader-HP race, board presence, card advantage);
 *  - `projectAndEvaluate` simulates this turn's Declare Attack (`resolveCombat`) + end-of-turn
 *    ticks before scoring, so trades, blockers, and lethal are valued by their real outcome;
 *  - `candidateTurns` BEAM-SEARCHES over whole turns (sequences of plays), so synergies between
 *    plays are optimised jointly rather than one greedy step at a time;
 *  - each finalist turn is scored by `turnLeafValue`, which plays it out, then lets the OPPONENT
 *    take their best greedy reply turn, and evaluates the result — so the AI holds removal,
 *    avoids overextending, and finds multi-card lethal it would otherwise miss;
 *  - `chooseAction` returns the first action of the best turn (the UI driver re-plans each tick).
 *    `greedyAction` is the fast 1-ply policy used to model the opponent and for headless tests.
 *
 * Determinism: every bit of look-ahead runs on `structuredClone`d state via `applyAction` /
 * `resolveCombat` (both RNG-free for plays and combat), so planning never disturbs the live
 * RNG — the eventual real `endTurn` reproduces the same draw.
 */
import { ELEMENTS, LANES, type Element, type LaneId, type LaneLayout, isHeights, isWater } from '@engine/constants';
import type { Registry } from '@cards/registry';
import { foundationGrantKeywords, foundationGrantStat } from '@engine/foundation';
import type { Action } from '@engine/actions';
import { applyAction, legalActions } from '@engine/engine';
import { resolveCombat } from '@engine/combat';
import { resolveEndOfTurn } from '@engine/endOfTurn';
import { locateUnit } from '@engine/board';
import { signatureThreshold } from '@engine/damage';
import { opponentOf, type GameState, type PlayerId, type UnitInstance } from '@engine/types';

const unitsOf = (state: GameState, side: PlayerId): UnitInstance[] =>
  LANES.flatMap((l) => {
    const lane = state.players[side].lanes[l];
    const out = [lane.front, lane.back].filter((u): u is UnitInstance => Boolean(u));
    // A standalone Foundation is a full unit (own body + the grant it will give a host), so it
    // is valued like one — it already IS a UnitInstance that unitValue can read directly.
    if (lane.standaloneFoundation) out.push(lane.standaloneFoundation);
    return out;
  });

// --- Positional evaluation ------------------------------------------------------------

/**
 * Every magic number the evaluation uses, in one tunable bag. `DEFAULT_WEIGHTS` are
 * hand-set sane values; `aiTuning.ts` runs self-play coordinate-ascent to refine them.
 * Threading a `EvalWeights` through the policy (rather than a module global) lets the tuner
 * pit two weight sets against each other in a single game, and keeps planning side-effect free.
 */
export interface EvalWeights {
  attack: number; // value per point of attack (the main combat-output term)
  hp: number; // value per point of HP
  cardAdvantage: number; // value per net card in hand
  lifeDanger: number; // multiplier for leader HP at/below the Signature threshold (convex life)
  // Defensive / utility keyword flats:
  taunt: number;
  lethal: number;
  immunity: number;
  trueShield: number;
  sniper: number;
  tough: number; // per level
  shield: number; // per instance
  foundation: number;
  spike: number; // per level
  polish: number;
  bloodlust: number;
  kamikaze: number;
  onHit: number;
  airborne: number;
  targeting: number; // undershot target-selection flat
  // Offensive multipliers, applied as a fraction of the unit's base attack value:
  overshotFactor: number; // Overshot converts the body's full attack to unblockable face damage
  doubleStrike: number; // ≈ a second swing
  multiTarget: number; // strikeThrough / splashDamage / branchShot hit extra bodies
  // Engines (future value over a horizon):
  growthHorizon: number; // turns of growth-keyword stat gain credited
  engineHorizon: number; // turns of Producer energy credited
  healTick: number; // value per HP of a recurring end-of-turn heal
  disabledPenalty: number; // fraction of attack value lost while frozen/asleep
  deckOut: number; // value per library card; convex near empty so milling the opponent is a real plan
  dot: number; // value per point of pending Burn/Poison damage on a unit (it rots below its stats)
  bank: number; // value per point of banked element energy that a held card actually needs (ramp)
  synergy: number; // multiplier on board-level combo bonuses (wall stacks, punishing taunt, kill-feeders, anthem width)
}

export const DEFAULT_WEIGHTS: EvalWeights = {
  attack: 3,
  hp: 1,
  cardAdvantage: 1,
  lifeDanger: 4,
  taunt: 2,
  lethal: 3,
  immunity: 4,
  trueShield: 4,
  sniper: 2,
  tough: 1,
  shield: 2,
  foundation: 2,
  spike: 1.5,
  polish: 3,
  bloodlust: 3,
  kamikaze: 2,
  onHit: 2,
  airborne: 1,
  targeting: 1,
  overshotFactor: 0.8,
  doubleStrike: 0.8,
  multiTarget: 0.4,
  growthHorizon: 2,
  engineHorizon: 3,
  healTick: 1,
  disabledPenalty: 1,
  deckOut: 1,
  dot: 1,
  bank: 1,
  synergy: 1,
};

/** Raw stat worth of a body: attack weighted over HP (it's both output and a standing threat). */
const bodyValue = (W: EvalWeights, attack: number, hp: number): number => attack * W.attack + hp * W.hp;

/**
 * Extra worth of a Metamorphosis unit: it is on track to become something bigger. Credit the
 * stat gain it will reach, discounted by how many turns away the next transformation is, so a
 * Larva one turn from a 5/5 Dragon is valued far above its current 1/2 body.
 */
const metamorphValue = (W: EvalWeights, registry: Registry, u: UnitInstance): number => {
  const meta = u.keywords.metamorphosis;
  if (!meta) return 0;
  const here = bodyValue(W, u.attack, u.hp);
  let target = here;
  if (meta.into) {
    const into = registry.cards.get(meta.into);
    if (into && into.type === 'unit') target = bodyValue(W, into.attack, into.hp);
  } else if (meta.gains) {
    target = bodyValue(W, u.attack + (meta.gains.attack ?? 0), u.hp + (meta.gains.hp ?? 0));
  }
  const turnsLeft = meta.everyTurns - (u.turnsInPlay % meta.everyTurns);
  return Math.max(0, target - here) / (turnsLeft + 1);
};

/**
 * Worth of the recurring end-of-turn engine a unit carries. Producers (folded into an
 * `energy` end-of-turn effect by `expandKeywordEffects`) and end-of-turn healers pay out
 * every turn they survive, so they are worth a multiple of a single tick's value.
 */
const engineValue = (W: EvalWeights, u: UnitInstance): number => {
  let v = 0;
  for (const e of u.endOfTurn ?? []) {
    if (e.kind === 'energy' && e.amount) v += e.amount * W.engineHorizon; // a Producer is a mana engine
    else if (e.kind === 'heal' && e.amount) v += e.amount * W.healTick; // a recurring heal tick
    else if (e.kind === 'buff' && e.stat) {
      // A recurring anthem/self-buff pays out every turn it survives. An all-ally anthem (the
      // Swarm carry the board protects) scales with how wide you are — credited at a modest
      // board factor so the AI values keeping it alive, not just its printed stats.
      const g = bodyValue(W, e.stat.attack ?? 0, e.stat.hp ?? 0);
      const allAlly = e.target === 'all-ally';
      v += g * (allAlly ? 2 : 1) * W.growthHorizon;
    }
  }
  return v;
};

/**
 * Worth of a unit's Kamikaze death effect, scored against the real effect payload rather than a
 * flat constant. Effect kinds:
 *   damage  → AOE to lane enemies: credits ~1 average target at a fraction of the damage's attack value
 *   applyStatus → burn/poison/sleep on the lane: similar to an onHit proc, scaled up for AOE target
 *   summon  → a free body enters on death: look up the card's body stats in the registry
 *   conjure → shoves a dead card into the enemy's hand: minor disruption
 *   buff    → buffs an ally / the killer on death: partial body-value credit
 * If the unit is also Zombified it dies TWICE before removal, so the kamikaze fires twice.
 */
const kamikazeValue = (W: EvalWeights, registry: Registry, u: UnitInstance): number => {
  const eff = u.keywords.kamikaze;
  if (!eff) return 0;
  let v = 0;
  switch (eff.kind) {
    case 'damage': {
      const amt = eff.amount ?? 0;
      if (eff.target === 'enemy') {
        // AOE to lane: typically hits 1-2 enemies. Credit ~1.5 targets at 40% of attack weight.
        v = amt * W.attack * 0.4 * 1.5;
      } else {
        // Hits leader or specific unit — less reliable timing, lower credit.
        v = amt * 0.5;
      }
      break;
    }
    case 'applyStatus': {
      // Burn / poison / sleep inflicted on death — fires once, not per hit.
      v = W.onHit * 0.6;
      if (eff.target === 'enemy') v *= 1.5; // AOE to all lane enemies
      break;
    }
    case 'summon': {
      // A free body materialises from the corpse — look it up for real stats.
      if (eff.cardId) {
        const def = registry.cards.get(eff.cardId);
        if (def?.type === 'unit') v = bodyValue(W, def.attack, def.hp) * 0.5;
      }
      if (!v) v = W.hp; // unknown token: at least one body's worth
      break;
    }
    case 'conjure':
      // Dead card (Dead Weight, etc.) shoved into enemy's hand — marginal hand-quality disruption.
      v = W.cardAdvantage * 0.3;
      break;
    case 'buff':
      // Buffs an ally (or the killer) on death — partial body-value credit for the stat transfer.
      if (eff.stat) v = bodyValue(W, eff.stat.attack ?? 0, eff.stat.hp ?? 0) * 0.4;
      break;
    default:
      v = W.kamikaze; // fallback for effect kinds not yet enumerated
  }
  // Zombified: the unit revives at 1 HP on first death, so the kamikaze fires on BOTH deaths.
  if (u.keywords.zombified) v *= 2;
  return v;
};

/**
 * Standalone worth of a unit on the board. Attack is weighted over HP — it's both this turn's
 * combat output and a standing threat. Beyond raw stats this credits: combat MULTIPLIERS
 * (Double Strike, multi-target) scaled by attack; resilience/snowball keywords (Spike, Polish,
 * Bloodlust, Kamikaze, on-hit statuses, Tough, Shield, True Shield, Immunity, Taunt); and
 * ENGINES (Producers, Metamorphosis, Growth) at their FUTURE value, not just their stats.
 */
const unitValue = (W: EvalWeights, registry: Registry, u: UnitInstance): number => {
  const kw = u.keywords;
  let v = bodyValue(W, u.attack, u.hp); // a drowning unit already reports 0 attack, so it scores body-only
  const atkVal = u.attack * W.attack;
  // ANTI-SYNERGY guards. Some keywords are dead weight in a given combination, so we DON'T
  // credit them — otherwise the AI over-values a card whose ability can never fire:
  //  - Overshot (with no Branch/Splash to still hit units) bypasses every unit to the leader,
  //    who has no body to receive on-hit statuses and can't be Lethal'd. Both are wasted.
  //  - Brittle self-destructs the turn it attacks, so any recurring engine (Growth, Producer,
  //    Metamorphosis, end-of-turn heal/anthem) never gets a turn to pay out.
  const seeksLeader = Boolean(kw.overshot) && !kw.branchShot && !kw.splashDamage;
  // Offensive multipliers — worth a fraction of another full swing.
  if (kw.doubleStrike) v += atkVal * W.doubleStrike;
  if (kw.strikeThrough || kw.splashDamage || kw.branchShot) v += atkVal * W.multiTarget;
  // Overshot turns the body's whole attack into unblockable, retaliation-free face damage — a
  // clock that scales with the body, which is precisely the payoff of bonding a big beater onto
  // an Overshot foundation. Scaled (not flat) so the AI foresees that payoff at bond time, before
  // the summoning-sick host can actually swing. Suppressed if Branch/Splash keeps it hitting units.
  if (seeksLeader) v += atkVal * W.overshotFactor;
  if (kw.undershot) v += W.targeting;
  if (kw.lethal && !seeksLeader) v += W.lethal;
  if (kw.sniper) v += W.sniper; // reaches into any lane — picks its target rather than trading head-on
  if (kw.airborne) v += W.airborne;
  // Airborne + Sniper: a Sniper is otherwise heights-locked (planSnipers only lets it fire from
  // Heights), but Airborne frees it to pick targets from ANY lane — the reach is always live, no
  // longer one good removal answer away from being a vanilla body. Worth a second Sniper premium.
  if (kw.sniper && kw.airborne) v += W.sniper;
  // Defensive / resilience / snowball.
  if (kw.taunt) v += W.taunt;
  if (kw.immunity) v += W.immunity;
  if (kw.trueShield) v += W.trueShield;
  if (kw.tough) v += kw.tough * W.tough;
  if (kw.spike) v += kw.spike * W.spike;
  if (kw.polish) v += W.polish;
  if (kw.bloodlust) v += W.bloodlust;
  v += kamikazeValue(W, registry, u);
  // Zombified revives at 1 HP once — a second life. Worth one more attack swing plus the tempo
  // cost of the opponent needing to kill it a second time.
  if (kw.zombified) v += u.attack * W.attack * 0.4 + W.hp;
  if (u.onHit && !seeksLeader) v += W.onHit; // freezes/burns/sleeps what it hits
  v += (u.shield ?? 0) * W.shield;
  if (u.foundation) v += W.foundation; // a bonded Foundation adds resilience
  // Engines (future value) — never credited on a Brittle body that won't survive its own attack.
  if (!kw.brittle) {
    if (kw.growth) v += bodyValue(W, kw.growth.attack ?? 0, kw.growth.hp ?? 0) * W.growthHorizon;
    v += metamorphValue(W, registry, u);
    v += engineValue(W, u);
  }
  // A unit that can't act next turn is worth less than its stats suggest.
  if ((u.status.freeze ?? 0) > 0 || (u.status.sleep ?? 0) > 0) v -= atkVal * W.disabledPenalty;
  // Pending damage-over-time: Poison ticks every end of turn (reliable, persistent); Burn fires
  // at end of the active player's turn, BEFORE the opponent's attack phase. So a unit with
  // burn >= hp is dead before the opponent can use it to block or retaliate this round — it is
  // effectively a ghost. Return near-zero value: only credit its Spike (it retaliates once on
  // the incoming attack if attacked this combat, then dies from burn). All keyword bonuses,
  // stat value, and engine value are meaningless — the unit won't survive the turn.
  const poison = u.status.poisoned ?? 0;
  const burn = u.status.burn ?? 0;
  if (burn >= u.hp) {
    return (kw.spike ?? 0) * W.spike * 0.5;
  }
  if (poison || burn) {
    const pending = Math.min(u.hp, poison * 2 + burn);
    v -= pending * W.dot;
  }
  return v;
};

/**
 * Worth of a leader's remaining HP, weighted CONVEXLY: HP at or below the danger line
 * (that leader's own Signature threshold — half its max HP) is far more precious than
 * HP above it. This makes the AI defend / stall when its own leader is low (each point
 * matters), and press the kill when the opponent's is low — without over-valuing chip
 * damage while both are healthy. `dangerLine` is per-player so this stays correct for
 * Adventure's scaled-HP enemies, not just the standard 30-HP leader.
 */
const lifeValue = (W: EvalWeights, hp: number, dangerLine: number): number => {
  const low = Math.min(Math.max(hp, 0), dangerLine);
  const high = Math.max(0, hp - dangerLine);
  return low * W.lifeDanger + high * 1;
};

/**
 * Worth of a player's remaining library as a buffer against decking out (an empty deck draws
 * self-damaging Null cards). Convex like `lifeValue`: cards in the last `DECKOUT_DANGER` are
 * weighted full, the rest at a fraction — so milling has value at every deck size but the
 * closing mills (which actually win) are valued far higher. Scored as mine − opponent's, this
 * is what lets the AI recognise milling/forget effects as progress toward a win.
 */
const DECKOUT_DANGER = 12;
const deckValue = (W: EvalWeights, cards: number): number => {
  const low = Math.min(Math.max(cards, 0), DECKOUT_DANGER);
  const high = Math.max(0, cards - DECKOUT_DANGER);
  return low * W.deckOut + high * W.deckOut * 0.3;
};

/**
 * Worth of a player's banked element energy — but ONLY up to the largest pip cost of a card
 * they actually hold, per element. Banked energy that no held card needs is dead weight and
 * scores nothing, so this rewards banking TOWARD a high-pip payoff in hand (the Ramp plan:
 * Cultivate/producers toward a cap-locked nature bomb) without making every deck hoard energy.
 */
const bankValue = (W: EvalWeights, registry: Registry, p: GameState['players'][PlayerId]): number => {
  let v = 0;
  for (const el of ELEMENTS) {
    let demand = 0;
    for (const inst of p.hand) {
      const def = registry.cards.get(inst.cardId);
      for (const req of def?.cost.elements ?? []) if (req.type === el) demand = Math.max(demand, req.amount);
    }
    if (demand > 0) v += Math.min(p.bank[el], demand) * W.bank;
  }
  return v;
};

/**
 * Board-level COMBO value: bonuses for keyword PAIRS (and board configurations) that the
 * additive per-unit `unitValue` sum cannot see. Scored per side and subtracted opponent − mine,
 * so the AI both BUILDS its own combos and reads the OPPONENT'S combos as risk (the same
 * pattern on their board subtracts from score, prompting disruption / trading into the engine).
 *
 * Organised by tier matching docs/synergy-guide.txt:
 *
 *  S — Overshot+DS, Lethal+Sniper, Lethal+DS
 *  A — Overshot+Lethal, Spike+Taunt (same unit), Tough+Spike, Growth+Immunity, Growth+Taunt,
 *      Airborne+Overshot, Aquatic+aggro-keyword in Water lane, Bloodlust+kill-reach (DS added)
 *  B — Lethal+multi-reach, TrueShield+Spike, Growth+Healer, Immunity+Taunt
 *  Existing — wall stack (Spike+absorber), punishing Taunt, anthem width
 */
const synergyValue = (W: EvalWeights, side: GameState['players'][PlayerId], layout?: LaneLayout): number => {
  const units = LANES.flatMap((l) =>
    [side.lanes[l].front, side.lanes[l].back].filter((u): u is UnitInstance => Boolean(u)),
  );
  if (units.length === 0) return 0;
  const allyCount = units.length;
  let v = 0;
  for (const lane of LANES) {
    const inLane = [side.lanes[lane].front, side.lanes[lane].back].filter((u): u is UnitInstance => Boolean(u));
    for (const u of inLane) {
      const kw = u.keywords;
      const atkVal = u.attack * W.attack;
      const absorbs = Boolean(kw.trueShield) || (u.shield ?? 0) > 0 || (kw.tough ?? 0) > 0;

      // ── S-TIER ──────────────────────────────────────────────────────────
      // Overshot + Double Strike: both multipliers live simultaneously → double face damage clock.
      if (kw.overshot && kw.doubleStrike) v += atkVal * 0.5;
      // Lethal + Sniper: kill any unit on the entire board every turn from safety.
      if (kw.lethal && kw.sniper) v += W.lethal * 0.5;
      // Lethal + Double Strike: two guaranteed kills per combat round.
      if (kw.lethal && kw.doubleStrike) v += W.lethal * 0.5;

      // ── A-TIER ──────────────────────────────────────────────────────────
      // Overshot + Lethal: minimum damage kills the blocker; all remaining attack overflows to leader.
      if (kw.overshot && kw.lethal) v += atkVal * 0.3;
      // Spike + Taunt on the SAME unit: every attack is funnelled into the spike wall.
      if (kw.taunt && (kw.spike ?? 0) > 0) v += W.spike * 0.5;
      // Tough + Spike: attacker triggers Spike at full value but deals reduced damage — hard to trade safely.
      if ((kw.tough ?? 0) > 0 && (kw.spike ?? 0) > 0) v += W.spike * 0.5;
      // Growth + Immunity: untargetable snowball — opponent must kill it with bodies while it compounds.
      if (kw.growth && kw.immunity) v += W.immunity * 0.5;
      // Growth + Taunt: forced attacks buy more Growth turns; the opponent is feeding the engine.
      if (kw.growth && kw.taunt) v += W.taunt * 0.5;
      // Airborne + Overshot: lane freedom makes the face clock even harder to block or answer.
      if (kw.airborne && kw.overshot) v += W.airborne * 0.5;
      // Aquatic + aggressive keyword in Water: drowning enemies are 0-attack; the unit fires freely.
      if (isWater(lane, layout) && kw.aquatic) {
        const aggro = kw.overshot || kw.sniper || kw.doubleStrike || kw.strikeThrough;
        if (aggro) v += atkVal * 0.4;
      }
      // Kill-feeder: Bloodlust that can reliably secure a kill (Double Strike added to reach list).
      if (kw.bloodlust) {
        const reach = kw.sniper || kw.strikeThrough || kw.splashDamage || kw.branchShot || kw.lethal || kw.doubleStrike;
        if (reach) v += W.bloodlust;
      }

      // ── B-TIER ──────────────────────────────────────────────────────────
      // Lethal + multi-reach: clean kills against protected or back-row targets.
      if (kw.lethal && (kw.splashDamage || kw.branchShot || kw.strikeThrough || kw.undershot)) v += W.lethal * 0.3;
      // True Shield + Spike: attacker hits True Shield (takes 0 damage back), still triggers Spike — free tax.
      if (kw.trueShield && (kw.spike ?? 0) > 0) v += W.spike * 0.3;
      // Immunity + Taunt: spell-proof wall that must be killed by bodies — no soft answers.
      if (kw.immunity && kw.taunt) v += W.immunity * 0.3;
      // Growth + Healer in the same lane: healer keeps Growth investment alive through chip damage.
      if (kw.growth && inLane.some((m) => m !== u && m.keywords.healer)) v += W.healTick * W.growthHorizon * 0.3;

      // ── EXISTING (preserved) ─────────────────────────────────────────────
      // Wall stack — Spike behind an absorber (TrueShield / Shield / Tough).
      if ((kw.spike ?? 0) > 0 && absorbs) v += W.spike;
      // Punishing Taunt — redirects attacks into a Spike / TrueShield / on-hit punisher in lane.
      if (kw.taunt) {
        const punisher = inLane.some((m) => (m.keywords.spike ?? 0) > 0 || m.keywords.trueShield || m.onHit);
        if (punisher) v += W.taunt;
      }
      // Anthem width — an all-ally end-of-turn buff pumping a wide board.
      for (const e of u.endOfTurn ?? []) {
        if (e.kind === 'buff' && e.target === 'all-ally' && e.stat) {
          const perBody = bodyValue(W, e.stat.attack ?? 0, e.stat.hp ?? 0);
          v += perBody * Math.max(0, allyCount - 1) * 0.5;
        }
      }
    }
  }
  return v * W.synergy;
};

/**
 * A body that could be summoned to bond with a standalone foundation. Just the fields the
 * grant↔host synergy reads — satisfied by a `UnitCard` (host in hand) or `GENERIC_HOST`.
 */
type HostBody = { attack: number; hp: number; keywords: import('@cards/schema').Keywords; onHit?: unknown };

/** Placeholder "average beater" used to value a grant when no real host is in hand yet. */
const GENERIC_HOST: HostBody = { attack: 3, hp: 3, keywords: {} };

/**
 * INCREMENTAL worth a foundation's grant adds to ONE specific host body — the heart of
 * "which body wants which foundation". The same grant is worth wildly different amounts on
 * different bodies, so this reads the host's attack and keywords to reward synergy and avoid
 * waste:
 *  - a granted keyword the host ALREADY has does nothing (the engine ignores it) → no credit;
 *  - Double Strike ≈ a second swing (scales with attack) and RE-PROCS on-hit / Bloodlust /
 *    Lethal, so it loves a big or kill-securing body;
 *  - Overshot turns the body's whole attack into unblockable face damage (scales with attack)
 *    but BYPASSES units, wasting the host's own on-hit / Lethal — so it wants a vanilla beater;
 *  - Growth compounds only while the host survives → worth more on a durable / Bloodlust body;
 *  - Lethal is a kill-feeder: huge on reach (Sniper / Strike-Through / Splash / Branch /
 *    Undershot) or Bloodlust, modest on a plain body that just trades head-on.
 */
const grantOnHostValue = (W: EvalWeights, grants: import('@cards/schema').FoundationCard['grants'], host: HostBody): number => {
  const gk = (grants.keywords ?? {}) as import('@cards/schema').Keywords;
  const hk = host.keywords;
  let v = 0;
  const grantedAttack = host.attack + (grants.stat?.attack ?? 0);
  const atkVal = grantedAttack * W.attack; // the attack the offensive keywords scale on
  if (grants.stat) v += bodyValue(W, grants.stat.attack ?? 0, grants.stat.hp ?? 0);
  // Double Strike — a second swing; re-triggers on-hit / Bloodlust / Lethal each hit.
  if (gk.doubleStrike && !hk.doubleStrike) {
    v += atkVal * W.doubleStrike;
    if (host.onHit || hk.bloodlust || hk.lethal) v += atkVal * W.doubleStrike * 0.5;
  }
  // Overshot — unblockable face clock; on-hit / Lethal go dead because it skips bodies.
  if (gk.overshot && !hk.overshot) {
    v += atkVal * W.overshotFactor;
    if (host.onHit || hk.lethal) v -= W.onHit; // mild anti-synergy: prefer a plain beater here
  }
  // Growth — compounds while the host lives; loves a durable or snowballing body.
  if (gk.growth && !hk.growth) {
    let gv = bodyValue(W, gk.growth.attack ?? 0, gk.growth.hp ?? 0) * W.growthHorizon;
    if ((hk.tough ?? 0) > 0 || (host as { shield?: number }).shield || host.hp >= 4) gv *= 1.25;
    if (hk.bloodlust) gv *= 1.2;
    v += gv;
  }
  // Lethal — kill-feeder: trades up into anything; reach / Bloodlust make it land reliably.
  if (gk.lethal && !hk.lethal) {
    v += W.lethal;
    const reach = hk.sniper || hk.strikeThrough || hk.splashDamage || hk.branchShot || hk.undershot;
    if (reach || hk.bloodlust) v += W.lethal;
  }
  // Flat defensive / utility grants — value independent of host, only if it lacks them.
  if (gk.taunt && !hk.taunt) v += W.taunt;
  if (gk.immunity && !hk.immunity) v += W.immunity;
  if (gk.trueShield && !hk.trueShield) v += W.trueShield;
  if (gk.airborne && !hk.airborne) v += W.airborne;
  if (gk.sniper && !hk.sniper) v += W.sniper;
  if ((gk.spike ?? 0) > 0) v += (gk.spike ?? 0) * W.spike;
  if ((gk.tough ?? 0) > 0) v += (gk.tough ?? 0) * W.tough;
  if (gk.battleReady) v += 1;
  return v;
};

/**
 * Forward-looking value of a standalone foundation's grants, matched to the BEST host the
 * owner can actually field. The foundation body is already scored by `unitValue` (it IS a
 * UnitInstance); this credits the bonus it will give to the unit bonded on top — but now
 * conditioned on what that unit is, so the AI hoards an Overshot ramp for the Mountain Bull and
 * doesn't over-rate it with only chaff in hand. Two parts:
 *  - the best grant↔host pairing among units in hand (a generic beater, discounted, when none);
 *  - the Battle-Ready TEMPO of bonding onto a PRE-placed foundation (set a prior turn): the host
 *    deploys ready and swings the same turn, an immediate granted-attack hit the engine's own
 *    projection only sees once the body is actually played. This is what makes the AI lay the
 *    foundation a turn early instead of dumping both at once.
 */
const foundationGrantValue = (
  W: EvalWeights,
  registry: Registry,
  sf: UnitInstance,
  owner: GameState['players'][PlayerId],
): number => {
  const card = registry.cards.get(sf.cardId);
  if (!card || card.type !== 'foundation') return 0;
  // Value what this Foundation would ACTUALLY hand up right now: half its LIVE body plus its
  // own keywords (see foundation.ts), not the authored `grants` the engine no longer reads.
  const grants = {
    ...card.grants,
    stat: foundationGrantStat({ attack: sf.status.drowning ? (sf.predrownAttack ?? 0) : sf.attack, hp: sf.hp }),
    keywords: foundationGrantKeywords(card, sf.keywords) as import('@cards/schema').Keywords,
  };
  let bestVal = 0;
  let bestAtk = 0;
  let haveHost = false;
  for (const inst of owner.hand) {
    const def = registry.cards.get(inst.cardId);
    if (def?.type !== 'unit') continue;
    haveHost = true;
    const val = grantOnHostValue(W, grants, def);
    if (val > bestVal) {
      bestVal = val;
      bestAtk = def.attack + (grants.stat.attack ?? 0);
    }
  }
  if (!haveHost) {
    // No body in hand yet — value the grant against an average beater so the AI still sets up,
    // but halved: the payoff body has still to be drawn.
    bestVal = grantOnHostValue(W, grants, GENERIC_HOST) * 0.5;
    bestAtk = GENERIC_HOST.attack;
  }
  // Battle-Ready tempo only on a foundation that has been STANDING (placed a prior turn).
  const tempo = !sf.justPlaced && haveHost ? bestAtk * W.attack * 0.4 : 0;
  // 55% discount on the grant body: the payoff only lands once a unit actually bonds.
  return bestVal * 0.55 + tempo;
};

/**
 * Board × Environment synergies the additive per-unit sum can't see, because they emerge from a
 * unit's keyword PAIRED with the lane's Environment. The headline case the user named: a
 * recurring-DAMAGE environment (Cinder Field) is symmetric chip to most bodies, but a POLISH unit
 * standing in it converts that self-damage into a GUARANTEED trigger every turn — a free engine,
 * not a liability. Credit my Polish bodies in a damage lane at their real per-turn payoff (a stat
 * gain valued as Growth; a flat for effect-Polish). Scored mine − opp so the AI both builds the
 * loop and reads the opponent's. Returns 0 when no damage environment is in play, so it costs the
 * rest of the field nothing.
 */
const environmentSynergyValue = (W: EvalWeights, registry: Registry, state: GameState, me: PlayerId): number => {
  const damageLanes: LaneId[] = [];
  for (const lane of LANES) {
    const env = state.environments[lane];
    if (!env) continue;
    const def = registry.cards.get(env.cardId);
    if (def?.type === 'environment' && def.effects?.some((e) => e.kind === 'damage' && (e.amount ?? 0) > 0)) {
      damageLanes.push(lane);
    }
  }
  if (damageLanes.length === 0) return 0;
  const sideValue = (side: PlayerId): number => {
    let v = 0;
    for (const lane of damageLanes) {
      const laneObj = state.players[side].lanes[lane];
      for (const u of [laneObj.front, laneObj.back]) {
        const polish = u?.keywords.polish;
        if (!polish) continue;
        if (polish.stat) v += bodyValue(W, polish.stat.attack ?? 0, polish.stat.hp ?? 0) * W.growthHorizon;
        if (polish.effects?.length) v += W.polish; // a reliable per-turn debuff/heal/etc.
      }
    }
    return v;
  };
  return (sideValue(me) - sideValue(opponentOf(me))) * W.synergy;
};

/**
 * Hand × Board synergy value: credits keyword PAIRS where one half is in hand and the other
 * is already on the board (or both are in hand and will synergise once played together).
 * Scored for both sides (mine − opp) so the AI both VALUES assembling its own combos and
 * reads the OPPONENT'S hand as a risk when their board sets up a dangerous payoff.
 *
 * Key patterns:
 *  - Anthem (all-ally buff) in hand scales with current board WIDTH — the Swarm plan:
 *    Hivemind Surge / Brood Warlord are almost worthless on an empty board but devastating
 *    when 4+ critters are out. The AI must learn to BUILD width before dropping the anthem,
 *    and to protect width when the anthem is already in hand.
 *  - Bloodlust on board + reach card in hand: reach (DS / Splash / Lethal / Sniper) turns
 *    Bloodlust from a slow grind into a reliable snowball; holding that card is meaningful.
 *  - Polish on board + damage environment in hand: the Cinder Field loop enabler.
 *  - Growth on board + healer in hand: healer shields the growth investment from chip damage.
 *  - Sniper + Airborne both in hand: they synergise once played as a pair (Airborne unlocks
 *    the Sniper's reach from any lane).
 */
const handSynergyValue = (W: EvalWeights, registry: Registry, state: GameState, side: PlayerId): number => {
  const player = state.players[side];
  const boardUnits = LANES.flatMap((l) =>
    [player.lanes[l].front, player.lanes[l].back].filter((u): u is UnitInstance => Boolean(u)),
  );
  const boardWidth = boardUnits.length;
  const hasBloodlustOnBoard = boardUnits.some((u) => u.keywords.bloodlust);
  const hasGrowthOnBoard = boardUnits.some((u) => u.keywords.growth);
  const hasPolishOnBoard = boardUnits.some((u) => u.keywords.polish);
  let v = 0;
  let handHasSniper = false;
  let handHasAirborne = false;
  for (const inst of player.hand) {
    const def = registry.cards.get(inst.cardId);
    if (!def) continue;
    if (def.type === 'unit') {
      const hkw = def.keywords;
      // Anthem in hand (end-of-turn or on-play all-ally buff) scales with current board width.
      for (const e of [...(def.endOfTurn ?? []), ...(def.onPlay ?? [])]) {
        if (e.kind === 'buff' && e.target === 'all-ally' && e.stat) {
          v += bodyValue(W, e.stat.attack ?? 0, e.stat.hp ?? 0) * boardWidth * 0.3;
        }
      }
      // Reach in hand + Bloodlust on board: reach makes the snowball actually turn over.
      if (hasBloodlustOnBoard) {
        const isReach = hkw.doubleStrike || hkw.splashDamage || hkw.lethal || hkw.sniper || hkw.strikeThrough || hkw.branchShot;
        if (isReach) v += W.bloodlust * 0.25;
      }
      // Healer in hand + Growth on board: healer sustains the growing engine.
      if (hasGrowthOnBoard && hkw.healer) v += W.healTick * W.growthHorizon * 0.2;
      // Track for hand-to-hand Sniper + Airborne pair.
      if (hkw.sniper) handHasSniper = true;
      if (hkw.airborne) handHasAirborne = true;
    }
    if (def.type === 'spell') {
      // Anthem spell in hand (e.g. Hivemind Surge) scales with board width.
      for (const e of def.effects ?? []) {
        if (e.kind === 'buff' && e.target === 'all-ally' && e.stat) {
          // Slightly higher weight than unit anthem — immediate one-shot pump, no survival required.
          v += bodyValue(W, e.stat.attack ?? 0, e.stat.hp ?? 0) * boardWidth * 0.4;
        }
      }
    }
    if (def.type === 'environment') {
      // Damage environment in hand + Polish on board: the Cinder Field loop enabler.
      if (hasPolishOnBoard && def.effects?.some((e) => e.kind === 'damage' && (e.amount ?? 0) > 0)) {
        v += W.polish * 0.3;
      }
    }
  }
  // Hand-to-hand: Sniper + Airborne in the same hand synergise once both are on board.
  if (handHasSniper && handHasAirborne) v += W.sniper * 0.2;
  // Producer on board → high-pip payoff in hand: explicitly connect the engine to its destination.
  // bankValue credits already-banked energy; this credits the FUTURE production trajectory toward
  // a specific payoff, so the AI understands "keep the Sun Priest alive 2 more turns → play Wyrm."
  for (const u of boardUnits) {
    for (const e of u.endOfTurn ?? []) {
      if (e.kind !== 'energy' || !e.amount || !e.element) continue;
      let maxDemand = 0;
      for (const inst of player.hand) {
        const def = registry.cards.get(inst.cardId);
        for (const req of def?.cost.elements ?? []) {
          if (req.type === e.element) maxDemand = Math.max(maxDemand, req.amount);
        }
      }
      if (maxDemand > 0) v += Math.min(e.amount, maxDemand) * W.engineHorizon * W.bank * 0.3;
    }
  }
  return v;
};

/** Score a position from `me`'s perspective. Higher is better; ±1e6 for a decided game. */
const evaluate = (W: EvalWeights, registry: Registry, state: GameState, me: PlayerId): number => {
  const opp = opponentOf(me);
  const myHp = state.players[me].leaderHp;
  const oppHp = state.players[opp].leaderHp;
  if (myHp <= 0) return -1e6;
  if (oppHp <= 0) return 1e6;
  let score =
    lifeValue(W, myHp, signatureThreshold(state.players[me])) -
    lifeValue(W, oppHp, signatureThreshold(state.players[opp]));
  for (const u of unitsOf(state, me)) score += unitValue(W, registry, u);
  for (const u of unitsOf(state, opp)) score -= unitValue(W, registry, u);
  score += (state.players[me].hand.length - state.players[opp].hand.length) * W.cardAdvantage;
  score += deckValue(W, state.players[me].deck.length) - deckValue(W, state.players[opp].deck.length);
  score += bankValue(W, registry, state.players[me]) - bankValue(W, registry, state.players[opp]);
<<<<<<< Updated upstream
  score += synergyValue(W, state.players[me]) - synergyValue(W, state.players[opp]);
=======
  // Energy queued for next turn is real energy, just later. Without this the AI sees
  // Cancerous Growth spend 2 energy for no board change and never casts it.
  score += ((state.players[me].energyNext ?? 0) - (state.players[opp].energyNext ?? 0)) * W.energyNext;
  score += synergyValue(W, state.players[me], state.laneTypes) - synergyValue(W, state.players[opp], state.laneTypes);
>>>>>>> Stashed changes
  score += environmentSynergyValue(W, registry, state, me);
  score += handSynergyValue(W, registry, state, me) - handSynergyValue(W, registry, state, opp);
  // Credit the future bonding value of standalone foundations (their grants are invisible to unitValue).
  for (const lane of LANES) {
    const sf = state.players[me].lanes[lane].standaloneFoundation;
    if (sf) score += foundationGrantValue(W, registry, sf, state.players[me]);
    const sfOpp = state.players[opp].lanes[lane].standaloneFoundation;
    if (sfOpp) score -= foundationGrantValue(W, registry, sfOpp, state.players[opp]);
  }
  return score;
};

/**
 * Project forward to a comparable board, then evaluate from `me`'s perspective:
 *  1. the active player's Declare Attack (unless they're the round-1 first player), then
 *  2. their end-of-turn ticks, then
 *  3. the OPPONENT's immediate Declare Attack with their current board (no development).
 *
 * Step 3 is what makes the heuristic DEFENCE-AWARE: blockers, removal, and disabling a
 * threat (Sleep/Freeze) are valued by the leader/board damage they prevent — not just by
 * the AI's own offence. Combat is RNG-free, so none of this disturbs the live RNG.
 */
const computeProjection = (W: EvalWeights, registry: Registry, state: GameState, me: PlayerId): number => {
  if (state.phase === 'ended') return evaluate(W, registry, state, me);
  // 1. The active player's attack. No round-1 exception — mirrors the engine.
  let board = resolveCombat(state, planSnipers(state), registry).state;
  if (board.phase === 'ended') return evaluate(W, registry, board, me);
  // 2. The active player's end-of-turn ticks (Burn / Poison / Growth / Producer / Smelt / …).
  const after = structuredClone(board);
  resolveEndOfTurn(after, after.active, [], registry);
  // 3. The opponent's reply attack with the board as it stands (no draws/plays modelled here).
  //    Aim their snipers too, so their threat isn't under-counted when we weigh our defence.
  const replyState = { ...after, active: opponentOf(after.active) };
  const reply = resolveCombat(replyState, planSnipers(replyState), registry).state;
  return evaluate(W, registry, reply, me);
};

/**
 * Transposition cache for `projectAndEvaluate`. The beam reaches the same board by different
 * play ORDERS (play A then B == B then A), and each beam node is re-scored against every child;
 * memoising the (board, perspective) → score map removes that redundant combat simulation. It
 * is scoped to a single `planTurn` (a fresh Map per top-level call, restored after) so the
 * weights `W` are invariant across every lookup — no need to key on them. Null outside planning,
 * where the standalone `greedyAction`/tuner run uncached. A pure memo: results are identical.
 */
type EvalCache = Map<string, number>;
let evalCache: EvalCache | null = null;

/** Key on everything the projection's SCORE reads. Excludes RNG/deck/discard — none affect it
 *  (combat and end-of-turn are RNG-free and never touch the library), which also lifts hit rate. */
const evalKey = (state: GameState, me: PlayerId): string =>
  me + JSON.stringify(state, (k, v) => (k === 'rng' || k === 'deck' || k === 'discard' ? undefined : v));

const projectAndEvaluate = (W: EvalWeights, registry: Registry, state: GameState, me: PlayerId): number => {
  if (!evalCache) return computeProjection(W, registry, state, me);
  const key = evalKey(state, me);
  const cached = evalCache.get(key);
  if (cached !== undefined) return cached;
  const value = computeProjection(W, registry, state, me);
  evalCache.set(key, value);
  return value;
};

/** The legal action whose projected board scores highest (or null if the list is empty). */
const bestAction = (W: EvalWeights, registry: Registry, state: GameState, me: PlayerId, options: Action[]): Action | null => {
  let best: Action | null = null;
  let bestScore = -Infinity;
  for (const a of options) {
    const next = a.type === 'endTurn' ? state : applyAction(registry, state, a).state;
    const score = projectAndEvaluate(W, registry, next, me);
    if (score > bestScore) {
      bestScore = score;
      best = a;
    }
  }
  return best;
};

// --- End-of-turn choices (banking / snipers) -----------------------------------------

/** A unit that can act this turn (not summoning-sick / asleep / frozen). */
const canAct = (u: UnitInstance): boolean =>
  !((u.justPlaced && !u.keywords.battleReady) || (u.status.sleep ?? 0) > 0 || (u.status.freeze ?? 0) > 0);

/** Pick the best enemy lane for each active sniper: a lane it can kill into, else the toughest. */
const planSnipers = (state: GameState): Partial<Record<string, LaneId>> => {
  const me = state.active;
  const opp = opponentOf(me);
  const choices: Partial<Record<string, LaneId>> = {};
  const enemyLanes = LANES.filter((l) => state.players[opp].lanes[l].front);
  if (enemyLanes.length === 0) return choices;
  for (const u of unitsOf(state, me)) {
    const loc = locateUnit(state, u.iid)!;
    if (!u.keywords.sniper || !(isHeights(loc.lane, state.laneTypes) || u.keywords.airborne) || !canAct(u)) continue;
    const killable = enemyLanes.filter((l) => (state.players[opp].lanes[l].front?.hp ?? 0) <= u.attack);
    const pool = killable.length ? killable : enemyLanes;
    // Among the pool, hit the highest-attack front unit (neutralise the biggest threat).
    choices[u.iid] = pool.reduce((a, b) =>
      (state.players[opp].lanes[a].front?.attack ?? 0) >= (state.players[opp].lanes[b].front?.attack ?? 0) ? a : b,
    );
  }
  return choices;
};

/**
 * Distribute `leftover` energy into element banks. Leftover energy is lost if not banked, so
 * we always bank ALL of it, preferring the elements that most need it: first what the hand
 * needs THIS turn (`handDemand`), then what the rest of the deck will want (`deckDemand`, so
 * the AI pre-banks toward a not-yet-drawn Titan instead of mana-screwing itself), then any
 * remaining room as pure overflow (free — banked energy never hurts).
 */
const distributeBank = (
  state: GameState,
  leftover: number,
  handDemand: Record<Element, number>,
  deckDemand: Record<Element, number>,
): Partial<Record<Element, number>> => {
  const p = state.players[state.active];
  const applied: Partial<Record<Element, number>> = {};
  const room = (el: Element): number => p.elementCaps[el] - p.bank[el] - (applied[el] ?? 0);
  const fillBy = (weight: (el: Element) => number): void => {
    const order = [...ELEMENTS].sort((a, b) => weight(b) - weight(a));
    for (const el of order) {
      if (leftover <= 0) break;
      if (weight(el) <= 0) continue;
      const take = Math.min(leftover, room(el));
      if (take > 0) {
        applied[el] = (applied[el] ?? 0) + take;
        leftover -= take;
      }
    }
  };
  fillBy((el) => handDemand[el]); // 1. cards in hand, this turn
  fillBy((el) => deckDemand[el]); // 2. cards still in the deck, future turns
  fillBy(() => 1); // 3. overflow anywhere with room (otherwise the energy is lost)
  return applied;
};

/** Banking with the registry available, so element-cost demand can be read from card defs. */
const computeBank = (registry: Registry, state: GameState): Partial<Record<Element, number>> | undefined => {
  const p = state.players[state.active];
  if (p.energy <= 0) return undefined;
  const handDemand: Record<Element, number> = { fire: 0, water: 0, nature: 0, earth: 0 };
  const deckDemand: Record<Element, number> = { fire: 0, water: 0, nature: 0, earth: 0 };
  for (const inst of p.hand) {
    const def = registry.cards.get(inst.cardId);
    for (const req of def?.cost.elements ?? []) handDemand[req.type] += Math.max(0, req.amount - p.bank[req.type]);
  }
  for (const inst of p.deck) {
    const def = registry.cards.get(inst.cardId);
    for (const req of def?.cost.elements ?? []) deckDemand[req.type] += req.amount;
  }
  const applied = distributeBank(state, p.energy, handDemand, deckDemand);
  return Object.keys(applied).length ? applied : undefined;
};

/**
 * Compute the choice bundle for committing `endTurn`: banking of leftover energy and sniper
 * target lanes. End-of-turn movers are NOT included — they were folded into auto-resolved
 * `endOfTurn` move effects by `expandKeywordEffects`, so the engine relocates them itself.
 * Pure; reads only the current state.
 */
export const endTurnChoices = (
  registry: Registry,
  state: GameState,
): { bank?: Partial<Record<Element, number>>; sniperChoices?: Partial<Record<string, LaneId>> } => {
  const bank = computeBank(registry, state);
  const sniperChoices = planSnipers(state);
  return {
    ...(bank && Object.keys(bank).length ? { bank } : {}),
    ...(Object.keys(sniperChoices).length ? { sniperChoices } : {}),
  };
};

const endTurnAction = (registry: Registry, state: GameState): Action => ({
  type: 'endTurn',
  ...endTurnChoices(registry, state),
});

// --- Greedy inner policy (fast; models the opponent, drives headless self-play) -------

/**
 * The fast 1-ply greedy next action: play the legal action that most improves this turn's
 * projected board, else end the turn (and resolve any queued move/expel choice sensibly).
 * Used to model the opponent inside the search and to run bulk self-play in tests.
 */
export const greedyAction = (registry: Registry, state: GameState, w: EvalWeights = DEFAULT_WEIGHTS): Action => {
  if (state.phase === 'ended') return { type: 'endTurn' };
  const me = state.active;
  if (state.pending?.length || state.extraActions?.length) {
    const fallback: Action = state.pending?.length ? { type: 'resolvePending' } : { type: 'resolveExtraAction', lane: LANES[0]! };
    return bestAction(w, registry, state, me, legalActions(registry, state)) ?? fallback;
  }
  const base = projectAndEvaluate(w, registry, state, me);
  let best: Action | null = null;
  let bestScore = base;
  for (const action of legalActions(registry, state)) {
    if (action.type === 'endTurn') continue;
    const score = projectAndEvaluate(w, registry, applyAction(registry, state, action).state, me);
    if (score > bestScore) {
      bestScore = score;
      best = action;
    }
  }
  return best ?? endTurnAction(registry, state);
};

/** Play out a whole greedy turn from `state` (its active player to move); return the result. */
const greedyRollout = (registry: Registry, state: GameState, w: EvalWeights): GameState => {
  let s = state;
  for (let i = 0; i < MAX_ROLLOUT && s.phase !== 'ended'; i++) {
    const action = greedyAction(registry, s, w);
    s = applyAction(registry, s, action).state;
    if (action.type === 'endTurn') break;
  }
  return s;
};

// --- 2-ply turn search ----------------------------------------------------------------

/** Beam/branch knobs. Modest so a live turn plans in well under a second. */
const BEAM_WIDTH = 4;   // partial turns carried between plies
const BRANCH = 4;       // best plays expanded from each partial turn
const MAX_PLAN_DEPTH = 5; // most plays considered in one turn
const FINALISTS = 6;    // complete turns scored by the (expensive) opponent reply
const MAX_ROLLOUT = 8;  // play cap for a modelled opponent turn

interface PlanNode {
  actions: Action[]; // plays so far this turn (excludes the closing endTurn)
  state: GameState; // board after those plays
  h: number; // cheap heuristic: this turn's projected board value
}

/**
 * Enumerate promising complete turns via beam search on the cheap projected-board heuristic.
 * A node may "complete" (end the turn) at any depth once its pending queue is clear, so the
 * option of stopping early — e.g. holding a card — is always represented. Returns the top
 * `FINALISTS` complete turns for the expensive 2-ply scoring.
 */
const candidateTurns = (W: EvalWeights, registry: Registry, state: GameState, me: PlayerId): PlanNode[] => {
  let beam: PlanNode[] = [{ actions: [], state, h: projectAndEvaluate(W, registry, state, me) }];
  const completed: PlanNode[] = [];

  for (let depth = 0; depth <= MAX_PLAN_DEPTH; depth++) {
    const next: PlanNode[] = [];
    for (const node of beam) {
      if (!node.state.pending?.length && !node.state.extraActions?.length) completed.push(node); // ending here is an option
      const scored = legalActions(registry, node.state)
        .filter((a) => a.type !== 'endTurn')
        .map((a) => {
          const s = applyAction(registry, node.state, a).state;
          return { a, s, h: projectAndEvaluate(W, registry, s, me) };
        })
        .sort((x, y) => y.h - x.h)
        .slice(0, BRANCH);
      for (const { a, s, h } of scored) next.push({ actions: [...node.actions, a], state: s, h });
    }
    if (next.length === 0) break;
    next.sort((x, y) => y.h - x.h);
    beam = next.slice(0, BEAM_WIDTH);
  }

  completed.sort((a, b) => b.h - a.h);
  return completed.slice(0, FINALISTS);
};

/**
 * Number of whole greedy turns rolled out AFTER my planned turn before scoring the leaf.
 *   1 = opponent's reply only (2-ply);
 *   2 = opponent's reply + my greedy counter-turn (3-ply) — lets the AI see past a board wipe
 *       ("they clear me, I rebuild/stabilise") and value grind/control lines, not just the
 *       immediate exchange. Each extra ply is one more `greedyRollout` per finalist.
 */
const REPLY_DEPTH = 2;

/**
 * Value of committing a turn that ends at `endState`: play the closing `endTurn` (combat +
 * handoff), then alternate `REPLY_DEPTH` whole greedy turns (opponent, then me, …) before
 * evaluating from `me`. This is the look-ahead beyond my own turn — what lets the AI account
 * for the opponent's response and its own follow-up.
 */
const turnLeafValue = (W: EvalWeights, registry: Registry, endState: GameState, me: PlayerId): number => {
  let s = applyAction(registry, endState, endTurnAction(registry, endState)).state;
  for (let ply = 0; ply < REPLY_DEPTH && s.phase !== 'ended'; ply++) {
    s = replyTurn(registry, s, W); // the player to move takes a full (lethal-aware greedy) turn
  }
  return evaluate(W, registry, s, me);
};

// --- Lethal check ---------------------------------------------------------------------

const LETHAL_NODE_BUDGET = 400; // hard cap on states the lethal search may expand
const LETHAL_DEPTH = 5;         // most plays chained before the closing attack
const LETHAL_BRANCH = 5;        // best plays expanded per node (ordered by damage dealt)

/**
 * Loose UPPER bound on the damage the active player could do to the enemy leader this turn:
 * every unit's attack hitting face + every direct-damage spell in hand + the hero power.
 * Ignores blockers and energy, so it never under-counts — if even this can't kill, there is
 * no lethal and the (more expensive) search is skipped.
 */
const maxPlausibleDamage = (registry: Registry, state: GameState): number => {
  const me = state.active;
  const p = state.players[me];
  let dmg = 0;
  for (const u of unitsOf(state, me)) dmg += u.attack;
  for (const inst of p.hand) {
    const def = registry.cards.get(inst.cardId);
    if (def?.type === 'spell') {
      for (const e of def.effects) if (e.kind === 'damage' && e.amount && e.target !== 'self' && e.target !== 'ally') dmg += e.amount;
    }
  }
  if (!p.heroPowerUsed) {
    const leader = registry.leaders.get(p.leaderId);
    for (const e of leader?.heroPower.effects ?? []) if (e.kind === 'damage' && e.amount) dmg += e.amount;
  }
  return dmg;
};

/** Apply this turn's closing `endTurn` (banking + the Declare-Attack combat) to a clone. */
const closeTurn = (registry: Registry, state: GameState): GameState =>
  applyAction(registry, state, endTurnAction(registry, state)).state;

/**
 * Best-first search for a sequence of plays that KILLS the enemy leader on this turn's
 * Declare Attack. Returns the full action sequence (ending in `endTurn`) or null. Gated by a
 * cheap damage upper bound and a node budget, so it is near-free in the common non-lethal
 * case and bounded when it does run. A guaranteed-win safety net the pruned beam can miss.
 */
const findLethal = (registry: Registry, state: GameState, me: PlayerId): Action[] | null => {
  const opp = opponentOf(me);
  if (state.players[opp].leaderHp <= 0) return null;
  if (state.active !== me) return null;
  if (maxPlausibleDamage(registry, state) < state.players[opp].leaderHp) return null;

  let budget = LETHAL_NODE_BUDGET;
  const dfs = (s: GameState, path: Action[]): Action[] | null => {
    if (budget-- <= 0 || s.phase === 'ended') return null;
    const plays = legalActions(registry, s).filter((a) => a.type !== 'endTurn');

    // With no pending choice outstanding, ending the turn here is a candidate lethal.
    if (!s.pending?.length && !s.extraActions?.length) {
      const closed = closeTurn(registry, s);
      if (closed.phase === 'ended' && closed.winner === me) return [...path, endTurnAction(registry, s)];
      if (path.length >= LETHAL_DEPTH) return null;
    }

    // Expand the plays that bring the enemy leader lowest after the closing attack first.
    const scored = plays
      .map((a) => {
        const ns = applyAction(registry, s, a).state;
        const closed = (ns.pending?.length || ns.extraActions?.length) ? null : closeTurn(registry, ns);
        const oppHp = closed?.winner === me ? -1 : (closed ?? ns).players[opp].leaderHp;
        return { a, ns, oppHp };
      })
      .sort((x, y) => x.oppHp - y.oppHp)
      .slice(0, LETHAL_BRANCH);

    for (const { a, ns } of scored) {
      const found = dfs(ns, [...path, a]);
      if (found) return found;
    }
    return null;
  };
  return dfs(state, []);
};

/**
 * A modelled WHOLE turn for the player to move during look-ahead: take a guaranteed kill if one
 * exists (`findLethal`, same as the AI does for itself), else play out a greedy turn. Making the
 * modelled opponent lethal-aware stops the AI being over-optimistic — it now plays AROUND the
 * opponent's multi-card lethal, not just their single-play kills (which greedy already saw).
 */
const replyTurn = (registry: Registry, state: GameState, w: EvalWeights): GameState => {
  const lethal = findLethal(registry, state, state.active);
  if (lethal) {
    let s = state;
    for (const a of lethal) s = applyAction(registry, s, a).state;
    return s;
  }
  return greedyRollout(registry, state, w);
};

/**
 * Plan the active player's whole turn with a 2-ply search and return the action sequence
 * (plays followed by the closing `endTurn`). Headless / test entry point; the UI driver
 * uses `chooseAction` and re-plans each tick.
 */
export const planTurn = (registry: Registry, state: GameState, w: EvalWeights = DEFAULT_WEIGHTS): Action[] => {
  if (state.phase === 'ended') return [{ type: 'endTurn' }];
  const me = state.active;
  const lethal = findLethal(registry, state, me); // take a guaranteed kill over any positional plan
  if (lethal) return lethal;

  // A fresh transposition cache lives for the duration of this plan (W is invariant within it).
  const outer = evalCache;
  evalCache = new Map();
  try {
    const finalists = candidateTurns(w, registry, state, me);
    if (finalists.length === 0) return [greedyAction(registry, state, w)]; // pending fallback

    let best = finalists[0]!;
    let bestValue = -Infinity;
    for (const node of finalists) {
      const value = turnLeafValue(w, registry, node.state, me);
      if (value > bestValue) {
        bestValue = value;
        best = node;
      }
    }
    return [...best.actions, endTurnAction(registry, best.state)];
  } finally {
    evalCache = outer;
  }
};

/**
 * The next action for the active (AI) player: the first step of the best searched turn.
 * The UI driver calls this once per render and re-plans from fresh state each time.
 */
export const chooseAction = (registry: Registry, state: GameState, w: EvalWeights = DEFAULT_WEIGHTS): Action => {
  if (state.phase === 'ended') return { type: 'endTurn' };
  return planTurn(registry, state, w)[0] ?? endTurnAction(registry, state);
};
