/**
 * Adventure encounters: which enemy you fight at a node and on what terms.
 *
 * Enemies play the 13 shipped archetype decks. Early encounters face a trimmed,
 * cheap-heavy subset at reduced leader HP; deeper nodes and later acts scale the
 * deck back up to the full 30 cards and full (then boosted) HP. Bosses always play
 * the complete archetype deck.
 */
import type { Deck } from '@cards/schema';
import type { Registry } from '@cards/registry';
import { expandDeck } from '@cards/registry';
import { starterDecks } from '@cards/data/starter';
import { RULES } from '@engine/constants';
import { initGame } from '@engine/setup';
import type { BossRules, GameState } from '@engine/types';
import type { GameEvent } from '@engine/events';
import { applyLaneLayout, placeBossUnits, resolveRoundStartRules, resolveSeal, resolveSteal } from '@engine/bossRules';
import type { MapNode, OwnedCard } from '@adventure/schema';
import { makeRoller } from '@adventure/seed';
import { combatReward } from '@adventure/economy';
import { advCardId, advEnemyCardId, ENEMY_LEADER_ID } from '@adventure/runRegistry';
import { foundryDeck } from '@adventure/foundry';
import { applyTrialToState, trialById, TRIAL_TWISTS, type TrialTwist } from '@adventure/trials';
import { findLeaderUnit } from '@engine/damage';
import { bossForAct, type Boss } from '@adventure/data/bosses';
<<<<<<< Updated upstream
=======
import { eliteForNode, type Elite } from '@adventure/data/elites';
import { copperMechDeck, copperMechRaidPools, COPPER_MECH_RAID_COUNT } from '@adventure/data/copperMech';
>>>>>>> Stashed changes

export interface Encounter {
  enemyDeck: Deck;
  enemyLeaderId: string;
  enemyHp: number;
  coinReward: number;
  twist?: TrialTwist;
  /**
   * The enemy's owned copies when the Foundry has worked on them (act 4+). Must be fed to
   * `buildRunRegistry` as `enemyDeck` — `enemyDeck.cards` already references the derived
   * `adve:` ids, so without it those cards resolve to nothing.
   */
  enemyOwned?: OwnedCard[];
  /**
   * A boss's BOSS RULE, if its signature is that channel and this act is not withholding
   * it. Seated onto `GameState.bossRules` by `buildEncounterState`.
   */
  bossRules?: BossRules;
  /** Present on boss nodes — the named boss being fought. */
  boss?: Boss;
  /** Present on elite nodes — the named Elite being fought. */
  elite?: Elite;
}

/**
 * Trimmed enemy deck size by node depth and act. Elites fight a much fuller deck (as if
 * ~4 layers deeper) so they're a genuine spike. Trials fight a normal-sized deck — their
 * difficulty comes from the twist condition, not extra cards.
 */
const encounterDeckSize = (kind: MapNode['kind'], layer: number, act: number): number => {
  // Elites fight a deeper deck than their layer, but +4 was measured as too much: with
  // act 1 fixed, elites became the SECOND biggest killer in the run (12 of 34 deaths,
  // behind only bosses) and act 2 became the new wall. A deeper deck compounds with the
  // elite's HP multiplier, so both were landing at once.
  const depth = kind === 'elite' ? layer + ELITE_DECK_DEPTH : layer;
  // Act-1 base cut 8 -> 6: measured with `.tuning/advRun.ts`, 46 of 49 recorded deaths
  // happened in ACT 1, and a run that survived act 1 almost never died afterwards. A
  // smaller opening deck shortens the earliest fights, which is where the attrition that
  // ends runs is actually accumulated.
  return Math.min(RULES.DECK_SIZE, Math.round(6 + 3 * depth + 5 * actScale(act) - 5));
};

/**
 * Enemy leader HP, ramping with depth and act. Since the Signature now unlocks at
 * HALF a leader's OWN max HP (see damage.ts `signatureThreshold`) rather than a fixed
 * number, a low-HP early enemy is no longer at risk of instantly opening with their
 * Signature — the threshold scales down right along with their HP. That removes the
 * need for an inflated early-HP floor: weak enemies can be genuinely weak again, and
 * some will die before ever reaching half their (already low) HP.
 *
 * Every term here is even, and every combination of them stays even, so `enemyHp` is
 * always an even number — the Signature threshold (half of it) is then always a clean
 * integer, which is clearer to the player than a rounded-down half.
 *
 * `HP_FLOOR` (and `encounterDeckSize`'s base) were lowered from 12/12 to 8/8: early
 * fights were winning mostly via deck-out (the enemy's small, cheapest-first deck still
 * packs efficient removal), and the run to empty their deck was taking long enough to
 * bleed the player far more HP than the fight's actual difficulty warranted. Shrinking
 * both the enemy's HP pool and their card count up front shortens that grind without
 * touching the per-act/per-layer scaling, so the cut is proportionally biggest early
 * (where it hurt) and fades out by the deeper layers.
 */
/**
 * The normal pool. Small — a plain fight should be short — but not trivial: at 4-6 HP a
 * normal enemy died before the fight was a fight at all.
 *
 * Per-layer growth is deliberately shallow, because the multipliers compound on it: a
 * boss sits on the act's deepest layer and takes 2x whatever the curve says there, so a
 * steep per-layer term shows up doubled in exactly the fight that can end a run.
 */
const NORMAL_HP_BASE = 8;
const NORMAL_HP_PER_LAYER = 0.4;
/** Extra deck depth an Elite fights at, in map layers. */
const ELITE_DECK_DEPTH = 2;
/**
 * Enemy HP is ONE curve with two multipliers on it.
 *
 * Regular combat and Trials share the same low pool — a Trial's difficulty is its twist,
 * never a bigger body. Elites are 1.5x that, bosses 2x. Expressing it as multipliers of a
 * single `normalHp` rather than three independent formulas is what makes the ordering
 * true by construction instead of something a cap has to enforce afterwards, and it means
 * one number (`NORMAL_HP_BASE`) moves the whole game's difficulty coherently.
 *
 * The normal pool is deliberately SMALL. Early fights were being won by deck-out — the
 * enemy's trimmed, cheapest-first deck still packs efficient removal, so grinding a big
 * HP bar down cost the player far more HP than the fight's actual difficulty warranted.
 * A low pool makes a won fight short.
 */
const ELITE_HP_MULT = 1.5;
const BOSS_HP_MULT = 2;

/**
 * Per-act difficulty multiplier — EXPONENTIAL, at a deliberately small growth rate.
 *
 * The act treadmill is not the run's final exam. The Copper Mech is, and it is a fixed
 * wall that does not scale at all, so the acts exist to build a deck capable of
 * attempting it. That argues for gentle growth — but not for a LOGARITHMIC curve, which
 * was tried and flattens to ~1.9x forever: against a player who compounds (deck,
 * enhancements, relics, leader upgrades, `ECON.ACT_MAX_HP_GAIN`) a flattening curve means
 * late acts stop being fights at all, and an endless run needs its acts to keep meaning
 * something.
 *
 * `ACT_GROWTH` 1.13 keeps the compounding shape while making the early multiples much
 * gentler than the 1.3 this replaced:
 *
 *   act    1     2     3     4     5     6     8    10
 *   1.13  1.00  1.13  1.28  1.44  1.63  1.84  2.35  3.00
 *   1.30  1.00  1.30  1.69  2.20  2.86  3.71  6.27 10.60   <- previous
 *
 * Acts 1-2 are now a genuine on-ramp (act 2 costs 13% more than act 1, not 30%), which is
 * what clearing act 2 — and so earning BOTH the leader unique and the signature buff —
 * requires, while act 8+ still grows rather than plateauing.
 */
const ACT_GROWTH = 1.13;
const actScale = (act: number): number => Math.pow(ACT_GROWTH, Math.max(0, act - 1));

/** Round to an EVEN number: enemy HP must stay even so the Signature threshold (half of
 *  it) is a clean integer rather than a rounded-down half. */
const even = (n: number): number => Math.max(2, 2 * Math.round(n / 2));

/**
 * Apply a relic's enemy-HP multiplier and round to an even number that is actually
 * DIFFERENT from the unmodified pool.
 *
 * Enemy HP is always even (so the Signature threshold — half of it — is a clean integer),
 * and the normal pool is deliberately small: 8-16 HP in the early acts. Rounding to
 * nearest therefore swallowed relics whole. A 10 HP enemy under a 10% cut is 9, which
 * rounds straight back to 10 — so Ember Cache, a common whose entire text is "enemies
 * begin with 10% less HP", did literally nothing in exactly the fights a common is most
 * likely to be found in.
 *
 * Rounding to nearest and nudging one step ONLY when the result would be a no-op keeps
 * the number as close to the intended proportion as evenness allows (a 25% cut on 10 HP
 * lands on 8, not the 6 that flooring would give) while guaranteeing that a relic which
 * promises a change delivers one.
 */
const scaleEnemyHp = (base: number, mult: number): number => {
  if (mult === 1) return even(base);
  const rounded = even(base * mult);
  if (rounded !== even(base)) return rounded;
  return Math.max(2, rounded + (mult < 1 ? -2 : 2));
};

/**
 * The baseline pool a plain fight (and a Trial) uses at this depth and act. Every other
 * kind is a multiple of it.
 *
 * Every result is even, so the Signature threshold (half of it) is always a clean integer
 * rather than a rounded-down half.
 */
const normalHp = (layer: number, act: number): number =>
  even((NORMAL_HP_BASE + NORMAL_HP_PER_LAYER * layer) * actScale(act));

/**
 * The full HP for an encounter kind at this depth and act. Exported so the ratio between
 * kinds can be asserted directly.
 */
export const encounterHp = (kind: MapNode['kind'], layer: number, act: number): number => {
  const normal = normalHp(layer, act);
  if (kind === 'boss') return even(normal * BOSS_HP_MULT);
  if (kind === 'elite') return even(normal * ELITE_HP_MULT);
  // Combat and Trial are the same fight; only the twist differs.
  return normal;
};

/**
 * Does the act-1 boss get to use its signature at all?
 *
 * It used to read `boss.twistId && act > 1` inline, which withheld only the twist — so
 * bosses whose signature was carried by a different channel (a curse, a hero-power
 * rewrite) kept theirs at full strength in act 1. Screyera's mill clock, Autopus's free
 * elite every turn and Ring Leader's hero-power rewrite all fired against a 15-card
 * starter deck, which is precisely the spike the withholding rule exists to prevent. Kept
 * as its own predicate — rather than inlined at the one remaining call site — because a
 * boss rule is the most violent of the game's signature mechanisms, and "is this act
 * withholding it" deserves a name of its own even with a single channel left to gate.
 */
export const bossSignatureActive = (act: number): boolean => act > 1;

/** Coin-reward node category from a map node kind. */
const rewardKind = (kind: MapNode['kind']): 'combat' | 'trial' | 'elite' | 'boss' =>
  kind === 'boss' || kind === 'trial' || kind === 'elite' ? kind : 'combat';

/**
 * Build an encounter. `enemyHpMult` (from relic mods) scales enemy HP but never below
 * a minimal safety floor. Trials always fight under a battle twist; Elites are beefier
 * (more HP + deck) but carry no twist.
 */
export const rollEncounter = (
  base: Registry,
  node: MapNode,
  act: number,
  /**
   * Relic scaling on enemy HP. 1 = unchanged. NOTE this replaced a flat `enemyHpDelta`
   * whose neutral value was 0 — a caller that still passes 0 is asking for an enemy with
   * no HP at all, which the MIN_ENEMY_HP floor then quietly turns into a 4 HP pushover.
   */
  enemyHpMult = 1,
  /**
   * The RUN master seed, used only to pick the act's boss. `bossForAct` walks a per-run
   * permutation, so it needs a seed that is stable ACROSS acts — a node seed is salted per
   * act and would give a fresh draw each time, which is what allowed back-to-back repeats.
   * Defaults to the node seed so the many call sites that only ever build a single
   * encounter (tests, probes) keep working unchanged.
   */
  runSeed: number = node.seed,
  /**
   * The act used for enemy HP and deck size, when a relic has shifted it
   * (`RelicMods.actDelta`). Defaults to the real `act`, which is what every caller that
   * does not care about relics wants.
   *
   * Kept SEPARATE from `act` rather than replacing it because boss SELECTION must stay
   * on the real act: which boss guards act 5 is that act's identity, and swapping it for
   * an earlier one would rewrite the run's story as well as its numbers.
   */
  scaleAct: number = act,
): Encounter => {
  const roll = makeRoller(node.seed);
  // A boss plays its named, curated archetype under a fixed gimmick; everything else
  // rolls a random archetype from the node seed.
<<<<<<< Updated upstream
  const boss = node.kind === 'boss' ? bossForAct(node.seed, act) : undefined;
  const archetype = boss ? starterDecks.find((d) => d.leaderId === boss.leaderId) ?? roll.pick(starterDecks) : roll.pick(starterDecks);
  const size = node.kind === 'boss' ? RULES.DECK_SIZE : encounterDeckSize(node.kind, node.layer, act);
=======
  const boss = node.kind === 'boss' ? bossForAct(runSeed, act) : undefined;
  // Elites are named too, drawn from the node's own seed. Same data shape as a boss at a
  // smaller scale — they were previously anonymous, just "+HP and a deeper deck".
  const elite = node.kind === 'elite' ? eliteForNode(node.seed) : undefined;
  // A boss MUST play its own archetype: its name, icon, gimmick, bonus HP and hero-power
  // override are all authored against that deck. Silently falling back to a random deck
  // produced a fight that looked like the boss but played as someone else, so a missing
  // archetype is a content error and fails loudly instead.
  let archetype: Deck;
  if (boss) {
    const bossDeck = starterDecks.find((d) => d.leaderId === boss.leaderId);
    if (!bossDeck) throw new Error(`Boss ${boss.id} has no archetype deck for leader: ${boss.leaderId}`);
    archetype = bossDeck;
  } else if (elite) {
    // Same contract as a boss: a named Elite MUST play the archetype it is authored
    // against, so a missing deck is a content error rather than a silent substitution.
    const eliteDeck = starterDecks.find((d) => d.leaderId === elite.leaderId);
    if (!eliteDeck) throw new Error(`Elite ${elite.id} has no archetype deck for leader: ${elite.leaderId}`);
    archetype = eliteDeck;
  } else {
    archetype = roll.pick(starterDecks);
  }
  // Bosses ALWAYS play the complete archetype. Trimming an early boss's deck was tried and
  // measured WORSE (deaths 41 -> 47): the trim is cheapest-first, so a smaller deck is a
  // concentrated one — it drops the expensive top end and keeps the efficient core. This is
  // the same effect `encounterHp` notes for early fights winning via deck-out. Early bosses
  // are softened through HP (`BOSS_HP_BASE`), never through deck size.
  const size = node.kind === 'boss' ? RULES.DECK_SIZE : encounterDeckSize(node.kind, node.layer, scaleAct);
>>>>>>> Stashed changes

  let enemyDeck: Deck = archetype;
  if (size < RULES.DECK_SIZE) {
    // Cheapest-first trim (seeded shuffle breaks cost ties) so a small deck can
    // still afford its curve.
    const cost = (id: string): number => {
      const card = base.cards.get(id);
      if (!card) return 99;
      return card.cost.energy + (card.cost.elements ?? []).reduce((s, e) => s + e.amount, 0);
    };
    const ids = roll.shuffle(expandDeck(archetype)).sort((a, b) => cost(a) - cost(b));
    enemyDeck = {
      name: archetype.name,
      leaderId: archetype.leaderId,
      cards: ids.slice(0, size).map((cardId) => ({ cardId, count: 1 })),
    };
  }

  // A minimal safety net only — stacked HP-reducing relics shouldn't be able to drive
  // an enemy to 0 or negative HP. The dynamic Signature threshold (half of whatever
  // this ends up being) means there's no longer a signature-safety reason for a
  // higher floor: a weak enemy can be genuinely weak, even dying before reaching it.
  const MIN_ENEMY_HP = 4;
  // No per-encounter `bonusHp` any more: HP is the curve times the kind's multiplier and
  // nothing else, so the 1x / 1.5x / 2x ratio is exactly what it says. A named Boss or
  // Elite's character lives in its deck, its signature and its name — not in a private
  // HP top-up that quietly broke the ratio (and, added after the old cap, once let an
  // Elite out-tank the boss it precedes).
  // `scaleEnemyHp` guarantees a relic's multiplier is never rounded away — see there.
  const enemyHp = Math.max(MIN_ENEMY_HP, scaleEnemyHp(encounterHp(node.kind, node.layer, scaleAct), enemyHpMult));
  // A boss's signature is its `rule`, never a Trial twist (see bosses.ts) — a boss node
  // therefore never carries one. Trial nodes carry the twist mapgen rolled for them
  // (`node.twistId`), with a random fallback for a Trial injected without one (e.g. ad hoc
  // test/event nodes).
  const twist = boss
    ? undefined
    : elite
      // A named Elite may carry a mild twist of its own. Its edge is still stats and deck
      // depth — the twist is a garnish, unlike a Trial where the twist IS the difficulty.
      ? (elite.twistId ? trialById(elite.twistId) : undefined)
      : node.twistId
        ? trialById(node.twistId)
        : node.kind === 'trial'
          ? roll.pick(TRIAL_TWISTS)
          : undefined;

  // The boss-rule channel, behind the same act-1 gate as every other signature.
  const bossRules = boss?.rule && bossSignatureActive(act) ? boss.rule : undefined;

  // THE FOUNDRY: from act 4 the enemy's deck arrives with workings on it, deepening every
  // act (see foundry.ts). Keyed to the RUN seed, not the node seed, so every fight in a
  // run faces the same accumulated build rather than a fresh roll per node — the enemy is
  // one opponent getting better, not a series of unrelated ones.
  //
  // Scaled by `scaleAct` like HP and deck size, so an act-shifting relic discounts this
  // along with everything else it discounts and pays for.
  const enemyOwned = foundryDeck(base, enemyDeck, runSeed, scaleAct);
  const enhancedEnemy = enemyOwned.some((o) => o.enhancements.length > 0);
  if (enhancedEnemy) {
    enemyDeck = {
      ...enemyDeck,
      cards: enemyOwned.map((o) => ({
        cardId: o.enhancements.length > 0 ? advEnemyCardId(o.uid) : o.cardId,
        count: 1,
      })),
    };
  }

  return {
    enemyDeck,
    ...(enhancedEnemy ? { enemyOwned } : {}),
    enemyLeaderId: archetype.leaderId,
    enemyHp,
    coinReward: combatReward(rewardKind(node.kind), node.layer, act),
    ...(twist ? { twist } : {}),
    ...(bossRules ? { bossRules } : {}),
    ...(boss ? { boss } : {}),
    ...(elite ? { elite } : {}),
  };
};

/** The player's run deck as a Deck literal (never Zod-validated — no 30-card rule). */
export const playerDeck = (leaderId: string, deck: OwnedCard[]): Deck => ({
  name: 'Adventure',
  leaderId,
  cards: deck.map((c) => ({ cardId: c.enhancements.length > 0 ? advCardId(c.uid) : c.cardId, count: 1 })),
});

/**
<<<<<<< Updated upstream
=======
 * Build the Copper Mech encounter: registry + opening GameState, player at seat 0.
 *
 * Kept separate from `rollEncounter`/`buildEncounterState` because it is not a map node
 * and shares almost none of their shape — no archetype roll, no deck trim, no HP curve,
 * no twist, no coin reward. It is a fixed, always-identical fight; only the shuffle
 * varies with `fightSeed`.
 *
 * The player keeps their run deck, relics, hero upgrades and enhancements — the run's
 * full power is exactly what is being measured — but NOT their carried run HP: every
 * attempt starts at full so the score reflects the deck, not how bruised you happened to
 * be when you walked in.
 */

/**
 * Seat the player's PERMANENT max HP into a freshly built state.
 *
 * `initGame` always seeds `leaderMaxHp` from the leader's printed, static HP (30 for a
 * standard leader) — it has no notion of a run. That was silently wrong for any run whose
 * `maxHp` had grown past that printed value (Act clears, `maxHpDelta` relics, boons):
 * `leaderMaxHp` stayed pinned at 30 forever, so the ENGINE's own `healLeader` clamped any
 * in-battle heal back down to 30 no matter how high the run's real ceiling was — a player
 * standing at, say, 45 HP could lose 15 of it to a single heal effect. Fixed here, once,
 * for every path that builds a player-side battle state.
 *
 * Also updates the leader-unit avatar (Ring Leader), whose own `maxHp` mirrors
 * `leaderMaxHp` but is a SEPARATE field `initGame` does not touch when patching leaderHp.
 */
const seedRunMaxHp = (state: GameState, runMaxHp: number | undefined): void => {
  if (runMaxHp === undefined || !Number.isFinite(runMaxHp) || runMaxHp <= 0) return;
  const pl = state.players[0];
  pl.leaderMaxHp = runMaxHp;
  const lu = findLeaderUnit(state, 0);
  if (lu) lu.maxHp = runMaxHp;
};

export const buildCopperMechState = (
  registry: Registry,
  player: Deck,
  fightSeed: number,
  /**
   * The run's carried CURRENT HP is deliberately NOT taken here — every attempt starts at
   * full HP, so a damage number means the same thing whatever state the run is in, and
   * `resolveCopperMech` never writes HP back either. The fight bar states the rule.
   *
   * The run's MAXIMUM HP is a different question and IS applied (`runMaxHp` below): a
   * `maxHpDelta`/act-growth ceiling is a permanent upgrade to the leader, not a situational
   * wound, so it raises the bar the Mech is fought at exactly like any other fight. Without
   * this, `leaderMaxHp` silently stayed pinned at the leader's printed 30 and any in-battle
   * heal would clamp back down to it — see `seedRunMaxHp`.
   */
  runMaxHp?: number,
): GameState => {
  const state = initGame({
    registry,
    decks: [player, copperMechDeck(registry)],
    seed: fightSeed,
    first: 0,
  });
  seedRunMaxHp(state, runMaxHp);
  // Always full HP at the (possibly raised) max — see the `runMaxHp` note above.
  state.players[0].leaderHp = state.players[0].leaderMaxHp ?? RULES.LEADER_HP;
  const lu = findLeaderUnit(state, 0);
  if (lu) lu.hp = lu.maxHp;
  // Arm the per-turn raid. Set AFTER initGame, which has already run the player's
  // opening turn — the Mech raids on its own first turn, as intended.
  state.players[1].turnDeckRaid = { pools: copperMechRaidPools(registry), count: COPPER_MECH_RAID_COUNT };
  return state;
};

/**
>>>>>>> Stashed changes
 * Build the initial GameState for an encounter (player is seat 0 and goes first).
 *
 * `playerHp` is the run's carried HP. `runMaxHp` is the run's CURRENT permanent maximum
 * (`RunState.maxHp`) — act growth, `maxHpDelta` relics and boons all raise it over a
 * leader's printed 30, and it must be seated here or the engine's own `leaderMaxHp` stays
 * pinned at the printed value forever (see `seedRunMaxHp`). The Signature threshold —
 * half of MAX — moves with it too, exactly as documented for the run layer; a wounded
 * player still starts nearer their (now correctly higher) Signature line, which is the
 * intended comeback valve, not a bug.
 *
 * Carried HP may be ABOVE `runMaxHp`: the post-battle heal overheals into temporary HP
 * (see `hpCeiling`). That extra is seated as real leader HP — the engine's `healLeader`
 * still clamps at `leaderMaxHp`, so once temporary HP is spent it is gone for the fight,
 * which is exactly the intended behaviour. Only a corrupt save is clamped out, at twice max.
 */
export const buildEncounterState = (
  registry: Registry,
  player: Deck,
  enc: Encounter,
  fightSeed: number,
  playerHp?: number,
  runMaxHp?: number,
): GameState => {
  const state = initGame({
    registry,
    decks: [player, { ...enc.enemyDeck, leaderId: ENEMY_LEADER_ID }],
    seed: fightSeed,
    first: 0,
  });
  // ORDER matters: the max has to be seated before the hard cap below is computed from it.
  seedRunMaxHp(state, runMaxHp);
  if (playerHp !== undefined && Number.isFinite(playerHp)) {
    const hardCap = 2 * (state.players[0].leaderMaxHp ?? RULES.LEADER_HP);
    const seated = Math.max(1, Math.min(hardCap, Math.floor(playerHp)));
    state.players[0].leaderHp = seated;
    const lu = findLeaderUnit(state, 0);
    if (lu) lu.hp = Math.min(lu.maxHp, seated);
  }
  const withTwist = enc.twist ? applyTrialToState(registry, state, enc.twist) : state;
  return enc.bossRules ? applyBossRulesToState(registry, withTwist, enc.bossRules) : withTwist;
};

/**
 * Seat a boss's rule onto the opening state.
 *
 * `everyRounds: 0` placements are the OPENING BOARD (Cleath's bulwarks) and are resolved
 * right here, once — `beginTurn` only ever fires the recurring ones. That split is what
 * lets one field express both "his wall is already built" and "the cult comes back every
 * odd round" without either needing to know about the other.
 *
 * Everything else is pure state the engine reads at its own seams, so there is nothing to
 * do but write the field.
 */
export const applyBossRulesToState = (registry: Registry, state: GameState, rules: BossRules): GameState => {
  state.bossRules = rules;
  const events: GameEvent[] = [];
  // The board is re-laid FIRST: every placement, drowning check and Environment legality
  // test below has to run against the layout being played, not the printed one.
  if (rules.laneLayout) applyLaneLayout(registry, state, rules.laneLayout.types, rules.laneLayout.places ?? []);
  for (const p of rules.placements ?? []) {
    if (p.everyRounds === 0) placeBossUnits(registry, state, p.cardId, p.side, events);
  }
  // `initGame` has ALREADY run round 1's `beginTurn`, before this field existed on the
  // state — so round 1's share of the per-round rules has to be replayed by hand here or
  // none of them start until turn two. That is the same one-turn hole `applyTrialToState`
  // documents for `fixedEnergy`, and it matters more here: round 1 is exactly the round
  // the round-one rule (see bosses.ts) promises these will bite on.
  resolveRoundStartRules(registry, state, events);
  resolveSteal(registry, state, state.active, events);
  resolveSeal(registry, state, state.active);
  return state;
};
