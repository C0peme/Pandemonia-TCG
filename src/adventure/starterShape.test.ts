/**
 * Adventure starters, held to the same rules as a constructed deck — plus the two that only
 * matter because Adventure has NO DECKBUILDER.
 *
 * A constructed deck is validated by `validateDeck`, which enforces the copy limit and rejects
 * unknown ids. An adventure starter is a bare `string[]` and passes through none of that, so
 * the same mistakes were unguarded on the side of the game where they cost the most: a player
 * who opens a run holding two uncastable cards cannot cut them, cannot replace them, and carries
 * them for the whole run.
 *
 * The curve assertions are deliberately loose bounds, not targets. They encode the one finding
 * the starters were rebuilt around — measured on act-1 layer-1, HP lost correlated with CURVE
 * and not with total card value, and the worst starter in the set was also the most valuable
 * one. They exist to catch a future edit that quietly re-tops a starter, not to pin a design.
 */
import { describe, expect, it } from 'vitest';
import { ADVENTURE_STARTERS } from '@adventure/data/starters';
import { starterLeaders, starterRegistry } from '@cards/data/starter';
import { RULES } from '@engine/constants';
import type { Card, Leader } from '@cards/schema';

const leaders = starterLeaders as Leader[];
const entries = leaders.map((l) => [l.id, ADVENTURE_STARTERS[l.id]!, l] as const);

/** Total price a player actually pays: energy plus pips, since a pip falls back to energy. */
const totalCost = (c: Card): number =>
  c.cost.energy + (c.cost.elements ?? []).reduce((s, e) => s + e.amount, 0);

describe('every leader has a starter, built from real cards', () => {
  it.each(leaders.map((l) => [l.id] as const))('%s', (id) => {
    const deck = ADVENTURE_STARTERS[id];
    expect(deck, `missing starter for ${id}`).toBeTruthy();
    expect(deck!.length, `${id} starter size`).toBe(15);
    for (const cardId of deck!) expect(starterRegistry.cards.get(cardId), `${id}: unknown card ${cardId}`).toBeTruthy();
  });

  it('has no starter for a leader that does not exist', () => {
    const known = new Set(leaders.map((l) => l.id));
    for (const id of Object.keys(ADVENTURE_STARTERS)) expect(known.has(id), `orphan starter: ${id}`).toBe(true);
  });
});

describe('the copy limit applies to a starter too', () => {
  // `validateDeck` enforces this for constructed decks; a starter is a bare array and reaches
  // none of that machinery, so nothing checked it. Three copies of a 15-card starter is a
  // FIFTH of the deck, which is already the most concentrated a run can open.
  it.each(entries.map(([id, deck]) => [id, deck] as const))('%s', (id, deck) => {
    const counts = new Map<string, number>();
    for (const cardId of deck) counts.set(cardId, (counts.get(cardId) ?? 0) + 1);
    for (const [cardId, n] of counts) {
      expect(n, `${id}: ${n} copies of ${cardId}`).toBeLessThanOrEqual(RULES.MAX_COPIES);
    }
  });
});

describe('every pip fits its own leader caps', () => {
  // The failure this exists for: Screyera once opened runs holding two Launch Ramps at 2 Fire
  // against a Fire cap of 1. Not illegal — `settleCost` pays the shortfall out of generic
  // energy — but it means paying full face value all run for a card whose price was discounted
  // on the assumption you had committed to that element, with no way to cut it.
  it.each(entries.map(([id, deck, l]) => [id, deck, l] as const))('%s', (id, deck, leader) => {
    for (const cardId of deck) {
      const c = starterRegistry.cards.get(cardId)!;
      for (const pip of c.cost.elements ?? []) {
        expect(pip.amount, `${id}: ${cardId} needs ${pip.type} ${pip.amount} > cap ${leader.elementCaps[pip.type]}`)
          .toBeLessThanOrEqual(leader.elementCaps[pip.type]);
      }
    }
  });
});

describe('the curve, which is what actually predicted survival', () => {
  it.each(entries.map(([id, deck]) => [id, deck] as const))('%s', (id, deck) => {
    const costs = deck.map((cardId) => totalCost(starterRegistry.cards.get(cardId)!));
    const bodies = deck.filter((cardId) => {
      const t = starterRegistry.cards.get(cardId)!.type;
      return t === 'unit' || t === 'foundation';
    }).length;
    expect(Math.max(...costs), `${id}: nothing above 5 total`).toBeLessThanOrEqual(5);
    expect(costs.filter((c) => c >= 4).length, `${id}: at most 3 cards at 4+`).toBeLessThanOrEqual(3);
    expect(costs.filter((c) => c <= 2).length, `${id}: at least 6 cards at <= 2`).toBeGreaterThanOrEqual(6);
    expect(bodies, `${id}: a majority must be bodies`).toBeGreaterThanOrEqual(8);
  });
});
