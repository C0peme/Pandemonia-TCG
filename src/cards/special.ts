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

// Everything but Taunt; the live Null adds it back, the candidate redesigns below do not.
const NULL_KEYWORDS_NO_TAUNT = {
  airborne: true,
  mover: { scope: 'self', trigger: 'endOfTurn' }, // wanders at the end of its owner's turn
  // `target: 'ally'` routes a Kamikaze damage effect to the dying unit's OWN leader.
  kamikaze: { kind: 'damage', amount: NULL_KAMIKAZE_DAMAGE, target: 'ally' },
} as const;
const NULL_TEXT = 'Error 404. Drawn from an empty deck — it wanders each turn and deals 4 to your own leader when destroyed or discarded.';

const nullCard = (keywords: Record<string, unknown>, text: string): Card => parseCard({
  id: NULL_CARD_ID,
  name: 'Null',
  type: 'unit',
  element: 'water',
  cost: { energy: 0 },
  attack: 4,
  hp: 4,
  keywords,
  text,
});

export const NULL_CARD: Card = nullCard({ ...NULL_KEYWORDS_NO_TAUNT, taunt: true }, NULL_TEXT);

/**
 * Candidate Null redesigns, kept beside the live card so the meta sim can A/B them on one
 * build (`META_NULL`). The design intent (Copers, 2026-10-27) is a LAST STAND: a Null may
 * close a small gap for a player already ahead, but must never be a win condition. The live
 * Null breaks that twice: Taunt turns it into a wall that buys time (exactly what Attrition
 * wants), and it lingers, so several Nulls become an army.
 *  - `noTaunt`: drops Taunt only — isolates how much of the problem is the wall.
 *  - `lastStand`: drops Taunt and adds Brittle, so it attacks once and crumbles. Crumbling
 *    is a death, so Kamikaze still deals 4 to its own leader: each Null is a 4-for-4 trade
 *    that only wins the race for whoever already leads it.
 */
export const NULL_VARIANTS: Record<string, Card> = {
  current: NULL_CARD,
  noTaunt: nullCard(NULL_KEYWORDS_NO_TAUNT, NULL_TEXT),
  lastStand: nullCard({ ...NULL_KEYWORDS_NO_TAUNT, brittle: true },
    'Error 404. Drawn from an empty deck — a last stand: it attacks once and crumbles, dealing 4 to your own leader when destroyed or discarded.'),
};

export const SPECIAL_CARDS: Card[] = [NULL_CARD];
