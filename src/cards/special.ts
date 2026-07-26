/**
 * Special system cards that are never part of a deck but must exist in every registry.
 *
 * Null — the "404" card drawn when a player's deck is empty (deck-out). A 0-cost 4/4
 * that is Airborne + Taunt, wanders to a random lane each turn (self-Mover), and on
 * death deals 4 damage to ITS OWN leader (Kamikaze). Decking out becomes a slow bleed.
 */
import { parseCard, type Card } from '@cards/schema';

export const NULL_CARD_ID = '__null__';

/**
 * Damage the Null deals to its OWN leader — when destroyed in play (Kamikaze) AND when
 * it leaves the game without ever being played (forgotten, expelled into a full hand, or
 * drawn into a full hand). Decking out is a slow bleed no matter how the Null is shed.
 */
export const NULL_KAMIKAZE_DAMAGE = 4;

export const NULL_CARD: Card = parseCard({
  id: NULL_CARD_ID,
  name: 'Null',
  type: 'unit',
  element: 'water',
  cost: { energy: 0 },
  attack: 4,
  hp: 4,
  keywords: {
    airborne: true,
    taunt: true,
    mover: { scope: 'self', trigger: 'endOfTurn' }, // wanders at the end of its owner's turn
    // `target: 'ally'` routes a Kamikaze damage effect to the dying unit's OWN leader.
    kamikaze: { kind: 'damage', amount: NULL_KAMIKAZE_DAMAGE, target: 'ally' },
  },
  text: 'Error 404. Drawn from an empty deck — it wanders each turn and deals 4 to your own leader when destroyed or discarded.',
});

export const SPECIAL_CARDS: Card[] = [NULL_CARD];
