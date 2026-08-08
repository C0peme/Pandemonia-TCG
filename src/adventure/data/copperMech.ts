/**
 * The Copper Mech — Adventure's endgame challenge, and its win condition.
 *
 * A persistent, repeatable, deliberately unfair boss that can be entered from the map at
 * any time. It is a DAMAGE RACE, not a fair match: you are expected to lose. What you
 * take away is how far you got — the run records your best damage dealt — and actually
 * grinding all 413 HP off it wins the Adventure.
 *
 * What makes it unfair, all of it intentional:
 *  - 413 HP, roughly 14x a normal leader.
 *  - Every element capped at 4 (a 16-point spread). Real leaders distribute exactly
 *    `RULES.ELEMENT_CAP_TOTAL` (8) points, so this DELIBERATELY breaks the leader budget
 *    invariant — see `copperMechLeader` for why that is safe here.
 *  - Its deck is the entire card pool, so anything in the game can show up.
 *  - Every one of its turns it raids a random leader's archetype for a fistful of cards
 *    AND that leader's signature, which replaces the one it had. It therefore casts a
 *    different signature essentially every round.
 *
 * Everything specific to it lives here; the engine-side mechanic (`turnDeckRaid`) is
 * generic and knows nothing about leaders or archetypes.
 */
import type { Card, Deck, Leader } from '@cards/schema';
import type { Registry } from '@cards/registry';
import { expandDeck } from '@cards/registry';
import { starterDecks } from '@cards/data/starter';
import type { DeckRaidPool } from '@engine/types';

export const COPPER_MECH_ID = 'adv:copper-mech';
export const COPPER_MECH_NAME = 'The Copper Mech';
export const COPPER_MECH_ICON = '⚙';

/** Its HP pool — also the damage total that constitutes a win. */
export const COPPER_MECH_HP = 413;

/** Cards plundered per raid, i.e. per Copper Mech turn (on top of its normal draw). */
export const COPPER_MECH_RAID_COUNT = 3;

/**
 * Cards the Copper Mech's own deck may contain, and that its raids may pull.
 *
 * Excludes system cards (Null and friends), unfinished mechanics, and tokens — the same
 * exclusions the store uses, for the same reason. Signatures are excluded too, because
 * they are not drawn: they arrive through the raid's signature slot instead, one per
 * round, which is the whole gimmick.
 */
const battleReady = (card: Card): boolean =>
  !card.id.startsWith('__') &&
  !card.id.startsWith('sig-') &&
  !card.tags.includes('token') &&
  !card.tags.includes('signature') &&
  !card.wip;

/**
 * The Copper Mech's leader definition.
 *
 * Built as a plain typed object and inserted straight into the run registry — never
 * parsed through `leaderSchema` and never added to `starterLeaders`. That is deliberate:
 * its 4/4/4/4 caps sum to 16, which `elementCapsSchema` rightly rejects for authored
 * leaders (they must spend exactly `ELEMENT_CAP_TOTAL`). The budget rule exists to keep
 * PLAYABLE leaders balanced against each other; the endgame boss is explicitly outside
 * that budget. Keeping it out of the validated content path means the invariant still
 * holds for every leader a player can actually pick, and the schema tests stay honest.
 *
 * `signatureCardId` is only a placeholder: the first raid on its very first turn
 * overwrites it, and every raid after that overwrites it again.
 */
export const copperMechLeader = (base: Registry): Leader => {
  const placeholder = starterDecks
    .map((d) => base.leaders.get(d.leaderId)?.signatureCardId)
    .find((id): id is string => id !== undefined && base.cards.has(id));
  if (!placeholder) throw new Error('Copper Mech: no leader signature available for the placeholder slot');

  return {
    id: COPPER_MECH_ID,
    name: COPPER_MECH_NAME,
    element: 'earth',
    hp: COPPER_MECH_HP,
    elementCaps: { fire: 4, water: 4, nature: 4, earth: 4 },
    signatureCardId: placeholder,
    heroPower: {
      name: 'Overclock',
      cost: { energy: 2 },
      effects: [{ kind: 'damage', amount: 3, target: 'enemy' }],
      text: 'Deal 3 damage to an enemy unit.',
    },
  };
};

/**
 * One raid pool per shipped archetype: that leader's whole card list, plus their
 * signature. Deduplicated because a raid samples WITH replacement — leaving duplicates
 * in would silently weight a 4-of more heavily than the archetype intends.
 */
export const copperMechRaidPools = (base: Registry): DeckRaidPool[] =>
  starterDecks.map((deck) => {
    const leader = base.leaders.get(deck.leaderId);
    const cardIds = [...new Set(expandDeck(deck))].filter((id) => {
      const card = base.cards.get(id);
      return card !== undefined && battleReady(card);
    });
    return {
      name: leader?.name ?? deck.leaderId,
      cardIds,
      ...(leader ? { signatureCardId: leader.signatureCardId } : {}),
    };
  }).filter((pool) => pool.cardIds.length > 0);

/**
 * Its deck: literally every battle-ready card in the game, one copy each.
 *
 * Returned as a `Deck` literal and never Zod-validated — same as the player's Adventure
 * deck, and for the same reason: the 30-card construction rule does not apply to decks
 * the run builds rather than the player.
 */
export const copperMechDeck = (base: Registry): Deck => ({
  name: COPPER_MECH_NAME,
  leaderId: COPPER_MECH_ID,
  cards: [...base.cards.values()].filter(battleReady).map((card) => ({ cardId: card.id, count: 1 })),
});
