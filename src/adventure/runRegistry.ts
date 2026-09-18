/**
 * Derive the per-encounter Registry for an Adventure fight.
 *
 * Pure: clones the base registry's maps and layers on top of them
 *  - the player's enhanced copies as derived defs (`adv:${uid}`),
 *  - a reduced-HP clone of the enemy leader (`adv:enemy-leader`),
 *  - trial twists that rewrite unit defs (global stat buffs / keyword rain).
 *
 * Base defs in the registry are already keyword-expanded; enhancements only touch
 * stats, generic cost, and grantable passive keywords, so no re-expansion is needed.
 */
import type { Card, Leader, StatMod } from '@cards/schema';

export type HeroPower = Leader['heroPower'];
import type { Registry } from '@cards/registry';
import type { OwnedCard, HeroUpgrade } from '@adventure/schema';
import type { BossRules } from '@engine/types';
import { enhancementLabel } from '@adventure/enhance';
import { flattenTwist, type TrialTwist } from '@adventure/trials';
import { applyHeroUpgrades, applySignatureUpgrade } from '@adventure/hero';

export const ENEMY_LEADER_ID = 'adv:enemy-leader';

export const advCardId = (uid: string): string => `adv:${uid}`;

/**
 * Derived-def id for one of the ENEMY's enhanced copies (the Foundry).
 *
 * A separate namespace from the player's `adv:` ids, and that separation is load-bearing:
 * both sides now mint derived defs from the same `uid`-like counters, and a collision
 * would have one side's enhanced card silently resolve to the other's body.
 */
export const advEnemyCardId = (uid: string): string => `adve:${uid}`;

/**
 * Is this def a materialized ENHANCED copy rather than the printed card?
 *
 * The only durable signal is the derived id — an enhanced copy is a clone of the base def
 * with its stats/cost/keywords already folded in, so nothing else on it says "enhanced".
 * Exported so the UI marks enhanced cards from one place instead of testing the `adv:`
 * prefix in every component that renders a card.
 */
export const isEnhancedCardId = (id: string): boolean => id.startsWith('adv:') || id.startsWith('adve:');

/** The effective card def for one owned copy (base def if unenhanced). */
export const ownedCardDef = (base: Registry, owned: OwnedCard, enemy = false): Card | undefined => {
  const def = base.cards.get(owned.cardId);
  if (!def || owned.enhancements.length === 0) return def;

  const card = structuredClone(def) as Card;
  card.id = enemy ? advEnemyCardId(owned.uid) : advCardId(owned.uid);
  card.name = `${def.name} ${'+'.repeat(owned.enhancements.length)}`;
  for (const e of owned.enhancements) {
    if (e.kind === 'stat' && (card.type === 'unit' || card.type === 'foundation')) {
      card.attack += e.attack;
      card.hp += e.hp;
    } else if (e.kind === 'cost') {
      card.cost.energy = Math.max(0, card.cost.energy - e.energy);
    } else if (e.kind === 'keyword' && (card.type === 'unit' || card.type === 'foundation')) {
      // Never overwrite an existing keyword (mirrors environment-grant semantics).
      const kw = card.keywords as Record<string, unknown>;
      for (const [k, v] of Object.entries(e.keywords)) if (kw[k] === undefined) kw[k] = v;
    }
  }
  // Say WHAT the upgrades were. The derived def folds them into the numbers, so a "+++"
  // card showed final stats with no record of how it got there — the player could see it
  // was enhanced (the frame says so) but not what any of the three workings had been.
  const summary = owned.enhancements.map(enhancementLabel).join(', ');
  card.text = card.text ? `${card.text}
✧ Enhanced: ${summary}` : `✧ Enhanced: ${summary}`;
  return card;
};

const bumpStats = (card: Card, stat: StatMod): Card => {
  if (card.type !== 'unit') return card;
  return { ...card, attack: Math.max(0, card.attack + (stat.attack ?? 0)), hp: Math.max(1, card.hp + (stat.hp ?? 0)) };
};

export interface RunRegistryOpts {
  /** The player's owned copies — enhanced ones materialize as derived defs. */
  deck: OwnedCard[];
  /**
   * The ENEMY's copies, from the Foundry (`adventure/foundry.ts`). Same machinery as the
   * player's deck above, in its own id namespace — the enemy is running the player's
   * enhancement system, not a private imitation of it, which is what lets a boss's Mirror
   * copy an enhanced card and an enemy God Unit exist at all.
   */
  enemyDeck?: OwnedCard[];
  /** Clone this leader under ENEMY_LEADER_ID with `enemyLeaderHp`. */
  enemyLeaderId?: string;
  enemyLeaderHp?: number;
  /** Battle twist that rewrites unit defs, if any (deterministic — no seed). */
  twist?: TrialTwist;
  /** The player's leader id + hero-power upgrades to apply to their own leader. */
  playerLeaderId?: string;
  heroUpgrades?: HeroUpgrade[];
  /** Whether the run has claimed its signature buff (act 2 boss reward). */
  signatureBuff?: boolean;
  /**
   * A boss's rule, when it needs the REGISTRY rather than the state — currently only
   * `battleReady`. Rules that are pure state (seal, mirror, execute, ...) are seated by
   * `applyBossRulesToState` instead and never reach here.
   */
<<<<<<< Updated upstream
  enemyHeroPowerOverride?: (hp: HeroPower) => HeroPower;
=======
  bossRules?: BossRules;
  /**
   * Extra leader definitions to seat in this registry — for encounters whose opponent is
   * not a clone of an authored leader at all (the Copper Mech). Distinct from the
   * `enemyLeaderId`/`enemyLeaderHp` path above, which re-HPs an EXISTING leader.
   */
  extraLeaders?: Leader[];
>>>>>>> Stashed changes
}

export const buildRunRegistry = (base: Registry, opts: RunRegistryOpts): Registry => {
  const cards = new Map(base.cards);
  const leaders = new Map(base.leaders);

  // Trial rewrites run first so the player's enhanced defs (cloned below from the
  // defs in `cards`) inherit the twist too. `composite` twists are flattened so each
  // leaf applies via whichever branch owns its kind.
  for (const leaf of opts.twist ? flattenTwist(opts.twist) : []) {
    if (leaf.kind === 'globalBuff') {
      for (const [id, card] of cards) cards.set(id, bumpStats(card, leaf.stat));
    } else if (leaf.kind === 'globalKeyword') {
      // EVERY unit gains the keyword — deterministic, so the rule can be read and
      // played around. A unit that already has the keyword keeps its own (stronger) value.
      for (const [id, card] of cards) {
        if (card.type !== 'unit') continue;
        const kw = card.keywords as Record<string, unknown>;
        if (kw[leaf.keyword] !== undefined) continue;
        cards.set(id, { ...card, keywords: { ...card.keywords, [leaf.keyword]: leaf.value } });
      }
    } else if (leaf.kind === 'globalOnPlayStatus') {
      // EVERY unit is Poisoned (etc.) the moment it enters play — appended, never
      // replacing whatever onPlay effects the card already carries.
      for (const [id, card] of cards) {
        if (card.type !== 'unit') continue;
        cards.set(id, { ...card, onPlay: [...(card.onPlay ?? []), { kind: 'applyStatus', status: leaf.status, target: 'self' }] });
      }
    }
  }

  // Boss rules that live in the registry. Runs with the twists above and before the
  // enhanced copies below, so a player's `adv:` def inherits the grant like every other
  // card — a God Unit under the Hydra is Battle Ready too.
  if (opts.bossRules?.battleReady) {
    for (const [id, card] of cards) {
      if (card.type !== 'unit' && card.type !== 'foundation') continue;
      if (card.keywords.battleReady !== undefined) continue;
      cards.set(id, { ...card, keywords: { ...card.keywords, battleReady: true } });
    }
  }

  // Player's enhanced copies (cloned from the possibly-twisted def in `cards`), then the
  // enemy's. Same loop, same materialization, different id namespace.
  for (const [owneds, enemy] of [[opts.deck, false], [opts.enemyDeck ?? [], true]] as const) {
    for (const owned of owneds) {
      if (owned.enhancements.length === 0) continue;
      const twisted = cards.get(owned.cardId);
      if (!twisted) continue; // base card deleted in Card Studio — skip defensively
      const def = ownedCardDef({ cards, leaders }, owned, enemy);
      if (def) cards.set(def.id, def);
    }
  }

  // Enemy leader at reduced/boosted HP, cloned so the player's own copy of the same
  // leader keeps its full HP. Built before the player's own hero-power upgrades below, so
  // an enemy on the same archetype never inherits them.
  if (opts.enemyLeaderId !== undefined && opts.enemyLeaderHp !== undefined) {
    const enemy = leaders.get(opts.enemyLeaderId);
    if (!enemy) throw new Error(`Unknown enemy leader: ${opts.enemyLeaderId}`);
    leaders.set(ENEMY_LEADER_ID, { ...enemy, id: ENEMY_LEADER_ID, hp: opts.enemyLeaderHp });
  }

  // Player's own leader, upgraded by any hero-power upgrades (applied last).
  if (opts.playerLeaderId !== undefined && opts.heroUpgrades && opts.heroUpgrades.length > 0) {
    const player = leaders.get(opts.playerLeaderId);
    if (player) leaders.set(opts.playerLeaderId, applyHeroUpgrades(player, opts.heroUpgrades));
  }

  // Signature buff (act 2 boss reward): rewrite the player leader's signature card in
  // place, so the buffed version is what gets delivered at the Signature threshold.
  // Done AFTER the enemy clone above, so a same-archetype enemy keeps the base card.
  if (opts.playerLeaderId !== undefined && opts.signatureBuff) {
    const player = leaders.get(opts.playerLeaderId);
    const sig = player ? cards.get(player.signatureCardId) : undefined;
    if (player && sig) {
      const buffed = applySignatureUpgrade(opts.playerLeaderId, sig, true);
      if (buffed !== sig) cards.set(buffed.id, buffed);
    }
  }

  return { cards, leaders };
};
