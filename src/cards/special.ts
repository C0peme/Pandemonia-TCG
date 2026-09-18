/**
 * Special system cards that are never part of a deck but must exist in every registry.
 *
 * Null — the "404" card drawn when a player's deck is empty (deck-out). A 0-cost 4/4
 * that is Airborne + Taunt + Battle Ready + Brittle, and on death deals 4 damage to ITS
 * OWN leader (Kamikaze). Decking out becomes a slow bleed.
 *
 * Battle Ready + Brittle make it a one-shot: it swings for 4 the turn it lands, then
 * destroys itself and takes 4 off its own leader. That is a real decision (tempo now,
 * paid for in face damage) rather than the wandering 4/4 Taunt wall it used to be, which
 * was quietly a GOOD card to draw — a free evasive blocker that the deck-out player
 * wanted. The self-Mover that made it wander is gone with it.
 */
import { parseCard, type Card } from '@cards/schema';

export const NULL_CARD_ID = '__null__';

/**
 * Damage the FIRST Null deals to its OWN leader — when destroyed in play (Kamikaze) AND when
 * it leaves the game without ever being played (forgotten, expelled into a full hand, or
 * drawn into a full hand). Decking out bleeds no matter how the Null is shed.
 */
export const NULL_KAMIKAZE_DAMAGE = 4;

/**
 * Damage per Null IN HAND, each turn, at the holder's start of turn. Holding is not free.
 *
 * Measured reason this exists: the bleed used to fire only when a Null was destroyed or
 * discarded, so a player with hand room simply HELD them and paid nothing — Guardian shed
 * 0.3 of the 2.7 Nulls it drew and finished at 16 HP, losing ~1 damage total to deck-out.
 * Escalating the shed damage could not fix that, because the trigger never fired.
 *
 * The tax self-scales: it is charged PER NULL HELD, so the fourth Null costs four times what
 * the first did without any separate counter. That closes both exits — hold them and the
 * per-turn tax compounds, play them to stop the tax and the Brittle body still breaks for
 * `NULL_KAMIKAZE_DAMAGE` (in exchange for one 4-damage swing, which is the only upside on
 * offer). Deck-out is a bill you can choose how to pay, not one you can dodge.
 *
 * MEASURED, do not raise casually. Deck Out's field win rate against this rate alone:
 * 0 -> 25.0%, 1 -> 53.1%, 2 -> 62.5%. This one global constant is worth ~28pp to that deck
 * between 0 and 1 — far more than the entire Forget card package, which is worth roughly
 * nothing on its own (25.0% WITH the cards and no tax, against 30.1% before they existed).
 * It is also not a Deck-Out-only dial: it taxes anyone who runs out of cards, and at 2 the
 * grindy decks (DoT, Attrition) fell 9-10pp.
 */
export const NULL_HOLD_DAMAGE = 1;

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
    battleReady: true, // attacks the turn it lands...
    brittle: true, // ...and destroys itself doing so, triggering its own Kamikaze
    // `target: 'ally'` routes a Kamikaze damage effect to the dying unit's OWN leader.
    kamikaze: { kind: 'damage', amount: NULL_KAMIKAZE_DAMAGE, target: 'ally' },
  },
  text: 'Error 404. Drawn from an empty deck — attacks at once, then breaks, dealing 4 to your own leader. Deals 4 to your own leader if destroyed or discarded instead.',
});

export const SPECIAL_CARDS: Card[] = [NULL_CARD];
