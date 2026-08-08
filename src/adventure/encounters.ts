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
import type { GameState } from '@engine/types';
import type { MapNode, OwnedCard } from '@adventure/schema';
import { makeRoller } from '@adventure/seed';
import { combatReward } from '@adventure/economy';
import { advCardId, ENEMY_LEADER_ID } from '@adventure/runRegistry';
import { applyTrialToState, trialById, TRIAL_TWISTS, type TrialTwist } from '@adventure/trials';
import { bossForAct, type Boss } from '@adventure/data/bosses';
import { copperMechDeck, copperMechRaidPools, COPPER_MECH_RAID_COUNT } from '@adventure/data/copperMech';

export interface Encounter {
  enemyDeck: Deck;
  enemyLeaderId: string;
  enemyHp: number;
  coinReward: number;
  twist?: TrialTwist;
  /** Present on boss nodes — the named boss being fought. */
  boss?: Boss;
}

/**
 * Trimmed enemy deck size by node depth and act. Elites fight a much fuller deck (as if
 * ~4 layers deeper) so they're a genuine spike. Trials fight a normal-sized deck — their
 * difficulty comes from the twist condition, not extra cards.
 */
const encounterDeckSize = (kind: MapNode['kind'], layer: number, act: number): number => {
  const depth = kind === 'elite' ? layer + 4 : layer;
  return Math.min(RULES.DECK_SIZE, 12 + 3 * depth + 6 * (act - 1));
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
 */
const HP_FLOOR = 12;
const ELITE_HP_BONUS = 6;

const encounterHp = (kind: MapNode['kind'], layer: number, act: number): number => {
  // Bosses scale with the same per-act step as regular enemies, so progression feels
  // consistent across encounter types — just anchored at the full leader HP.
  const bossHp = RULES.LEADER_HP + 6 * (act - 1);
  if (kind === 'boss') return bossHp;
  // Elites are beefier; trials fight at normal HP (their edge is the twist condition).
  const eliteBonus = kind === 'elite' ? ELITE_HP_BONUS : 0;
  // Capped at the boss's own HP: no regular/elite fight should out-tank the act's boss.
  return Math.min(bossHp, HP_FLOOR + 2 * layer + 6 * (act - 1) + eliteBonus);
};

/** Coin-reward node category from a map node kind. */
const rewardKind = (kind: MapNode['kind']): 'combat' | 'trial' | 'elite' | 'boss' =>
  kind === 'boss' || kind === 'trial' || kind === 'elite' ? kind : 'combat';

/**
 * Build an encounter. `enemyHpDelta` (from relic mods) shifts enemy HP but never below
 * a minimal safety floor. Trials always fight under a battle twist; Elites are beefier
 * (more HP + deck) but carry no twist.
 */
export const rollEncounter = (base: Registry, node: MapNode, act: number, enemyHpDelta = 0): Encounter => {
  const roll = makeRoller(node.seed);
  // A boss plays its named, curated archetype under a fixed gimmick; everything else
  // rolls a random archetype from the node seed.
  const boss = node.kind === 'boss' ? bossForAct(node.seed, act) : undefined;
  // A boss MUST play its own archetype: its name, icon, gimmick, bonus HP and hero-power
  // override are all authored against that deck. Silently falling back to a random deck
  // produced a fight that looked like the boss but played as someone else, so a missing
  // archetype is a content error and fails loudly instead.
  let archetype: Deck;
  if (boss) {
    const bossDeck = starterDecks.find((d) => d.leaderId === boss.leaderId);
    if (!bossDeck) throw new Error(`Boss ${boss.id} has no archetype deck for leader: ${boss.leaderId}`);
    archetype = bossDeck;
  } else {
    archetype = roll.pick(starterDecks);
  }
  const size = node.kind === 'boss' ? RULES.DECK_SIZE : encounterDeckSize(node.kind, node.layer, act);

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
  const bonusHp = boss?.bonusHp ?? 0;
  const enemyHp = Math.max(MIN_ENEMY_HP, encounterHp(node.kind, node.layer, act) + bonusHp + enemyHpDelta);
  // Boss uses its fixed gimmick (some bosses have none — e.g. Screyera's curse isn't a
  // twist); Trial nodes carry the twist mapgen rolled for them (`node.twistId`), with a
  // random fallback for a Trial injected without one (e.g. ad hoc test/event nodes).
  const twist = boss
    ? (boss.twistId ? trialById(boss.twistId) : undefined)
    : node.twistId
      ? trialById(node.twistId)
      : node.kind === 'trial'
        ? roll.pick(TRIAL_TWISTS)
        : undefined;

  return {
    enemyDeck,
    enemyLeaderId: archetype.leaderId,
    enemyHp,
    coinReward: combatReward(rewardKind(node.kind), node.layer, act),
    ...(twist ? { twist } : {}),
    ...(boss ? { boss } : {}),
  };
};

/** The player's run deck as a Deck literal (never Zod-validated — no 30-card rule). */
export const playerDeck = (leaderId: string, deck: OwnedCard[]): Deck => ({
  name: 'Adventure',
  leaderId,
  cards: deck.map((c) => ({ cardId: c.enhancements.length > 0 ? advCardId(c.uid) : c.cardId, count: 1 })),
});

/**
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
export const buildCopperMechState = (registry: Registry, player: Deck, fightSeed: number): GameState => {
  const state = initGame({
    registry,
    decks: [player, copperMechDeck(registry)],
    seed: fightSeed,
    first: 0,
  });
  // Arm the per-turn raid. Set AFTER initGame, which has already run the player's
  // opening turn — the Mech raids on its own first turn, as intended.
  state.players[1].turnDeckRaid = { pools: copperMechRaidPools(registry), count: COPPER_MECH_RAID_COUNT };
  return state;
};

/**
 * Build the initial GameState for an encounter (player is seat 0 and goes first).
 *
 * `playerHp` is the run's carried HP. Only current HP is lowered — `leaderMaxHp` is
 * left at the leader's undamaged total, so the Signature threshold stays half of MAX.
 * A wounded player therefore starts nearer their Signature, which is the intended
 * comeback valve rather than a bug.
 */
export const buildEncounterState = (
  registry: Registry,
  player: Deck,
  enc: Encounter,
  fightSeed: number,
  playerHp?: number,
): GameState => {
  const state = initGame({
    registry,
    decks: [player, { ...enc.enemyDeck, leaderId: ENEMY_LEADER_ID }],
    seed: fightSeed,
    first: 0,
  });
  if (playerHp !== undefined && Number.isFinite(playerHp)) {
    state.players[0].leaderHp = Math.max(1, Math.min(state.players[0].leaderMaxHp ?? playerHp, Math.floor(playerHp)));
  }
  return enc.twist ? applyTrialToState(registry, state, enc.twist) : state;
};
