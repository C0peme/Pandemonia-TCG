/**
 * Metamorphosis × Foundations.
 *
 * Ruling: Metamorphosis transforms the UNIT, not the ground beneath it — a Foundation
 * survives the change and keeps granting to the new form. Rebuilding the unit from the new
 * card replaces `keywords`/`onHit`/trigger arrays wholesale, so without re-bonding, the
 * grants silently vanished while the FoundationInstance still claimed they were applied —
 * and a later revert then spliced trigger effects off the NEW form and deleted keywords the
 * new form owned.
 */
import { describe, expect, it } from 'vitest';
import { buildRegistry } from '@cards/registry';
import { parseCard, parseLeader, type Card } from '@cards/schema';
import { blankState, unit } from '@engine/testkit';
import { applyFoundation, revertFoundation } from '@engine/foundation';
import { resolveEndOfTurn } from '@engine/endOfTurn';
import type { GameEvent } from '@engine/events';

const cards: Card[] = [
  parseCard({
    id: 'larva', name: 'Larva', type: 'unit', element: 'nature',
    cost: { energy: 1 }, attack: 1, hp: 3,
    keywords: { metamorphosis: { everyTurns: 1, into: 'imago', gains: { attack: 1 } } },
  }),
  parseCard({
    id: 'imago', name: 'Imago', type: 'unit', element: 'nature',
    cost: { energy: 3 }, attack: 3, hp: 5,
    keywords: { lethal: true }, // a keyword the new form owns natively
    endOfTurn: [{ kind: 'heal', amount: 1, target: 'self' }], // a trigger the new form owns
  }),
  parseCard({
    id: 'aquatic-larva', name: 'Aquatic Larva', type: 'unit', element: 'water',
    cost: { energy: 1 }, attack: 1, hp: 3,
    keywords: { aquatic: true, metamorphosis: { everyTurns: 1, into: 'land-imago' } },
  }),
  parseCard({
    id: 'land-imago', name: 'Land Imago', type: 'unit', element: 'nature',
    cost: { energy: 3 }, attack: 3, hp: 5,
  }),
  parseCard({
    id: 'test-plinth', name: 'Test Plinth', type: 'foundation', element: 'earth',
    cost: { energy: 2 }, attack: 1, hp: 4,
    grants: {
      stat: { attack: 2, hp: 2 },
      keywords: { taunt: true },
      endOfTurn: [{ kind: 'damage', amount: 1, target: 'all-enemy' }],
    },
  }),
  parseCard({
    id: 'test-dock', name: 'Test Dock', type: 'foundation', element: 'water',
    cost: { energy: 2 }, attack: 0, hp: 3,
    grants: { keywords: { aquatic: true } },
  }),
];

const leader = parseLeader({
  id: 'tl', name: 'TL', element: 'nature', signatureCardId: 'larva',
  heroPower: { name: 'HP', cost: { energy: 1 }, effects: [{ kind: 'draw', amount: 1 }] },
});
const registry = buildRegistry(cards, [leader]);
const foundationCard = (id: string) => {
  const c = registry.cards.get(id);
  if (!c || c.type !== 'foundation') throw new Error(id);
  return c;
};
const unitKeywords = (id: string) => {
  const c = registry.cards.get(id);
  if (!c || c.type !== 'unit') throw new Error(id);
  return { ...c.keywords };
};

/** Place a Larva on a Foundation in `lane`, then end the turn so it transforms. */
const transformOnFoundation = (cardId: string, foundationId: string, lane: 'ground1' | 'water') => {
  const s = blankState();
  const u = unit({ owner: 0, attack: 1, hp: 3, cardId });
  u.keywords = unitKeywords(cardId);
  if (cardId === 'aquatic-larva') u.keywords.aquatic = true;
  s.players[0].lanes[lane].front = u;
  u.foundation = applyFoundation(u, foundationCard(foundationId), 'f1', lane);
  u.justPlaced = false;
  const events: GameEvent[] = [];
  resolveEndOfTurn(s, 0, events, registry);
  return { s, u, events };
};

describe('a Foundation survives its host transforming', () => {
  it('keeps granting stats, keywords and triggers to the new form', () => {
    const { u, events } = transformOnFoundation('larva', 'test-plinth', 'ground1');
    expect(events.some((e) => e.t === 'transform')).toBe(true);
    expect(u.cardId).toBe('imago');
    expect(u.foundation).toBeTruthy();

    // Imago is 3/5, Metamorphosis grants +1 atk, and the Plinth (1/4) passes on half its
    // own stats by the universal rule: +0/+2.
    expect(u.attack).toBe(3 + 1 + 0);
    expect(u.maxHp).toBe(5 + 2);
    // Granted keyword survives, alongside the new form's own.
    expect(u.keywords.taunt).toBe(true);
    expect(u.keywords.lethal).toBe(true);
    // Granted trigger survives, alongside the new form's own.
    expect(u.endOfTurn).toHaveLength(2);
  });

  it('carries the Foundation\'s accumulated damage across the transform', () => {
    const s = blankState();
    const u = unit({ owner: 0, attack: 1, hp: 3, cardId: 'larva' });
    u.keywords = unitKeywords('larva');
    s.players[0].lanes.ground1.front = u;
    u.foundation = applyFoundation(u, foundationCard('test-plinth'), 'f1', 'ground1');
    u.foundation.hp = 1; // the Plinth has taken damage
    u.justPlaced = false;
    resolveEndOfTurn(s, 0, [], registry);
    expect(u.foundation!.hp).toBe(1);
    expect(u.foundation!.iid).toBe('f1'); // same physical Foundation
  });

  it('reverting after a transform removes only the grants, not the new form\'s own', () => {
    const { u } = transformOnFoundation('larva', 'test-plinth', 'ground1');
    revertFoundation(u, u.foundation!, 'ground1');
    expect(u.attack).toBe(3 + 1); // Imago's own, plus the Metamorphosis gain
    expect(u.maxHp).toBe(5);
    expect(u.keywords.taunt).toBeUndefined(); // granted — gone
    expect(u.keywords.lethal).toBe(true); // native — kept
    expect(u.endOfTurn).toHaveLength(1); // the new form's own trigger survives the splice
    expect(u.foundation).toBeUndefined();
  });
});

describe('transforming changes water compatibility', () => {
  it('a form that loses Aquatic starts drowning unless the Foundation supplies it', () => {
    // Aquatic Larva swims; Land Imago does not. With no Aquatic Foundation, it goes under.
    const s = blankState();
    const u = unit({ owner: 0, attack: 1, hp: 3, cardId: 'aquatic-larva', keywords: { aquatic: true, metamorphosis: { everyTurns: 1, into: 'land-imago' } } });
    s.players[0].lanes.water.front = u;
    u.justPlaced = false;
    resolveEndOfTurn(s, 0, [], registry);
    expect(u.cardId).toBe('land-imago');
    expect(u.status.drowning).toBe(true);
    expect(u.attack).toBe(0);
    expect(u.predrownAttack).toBe(3);
  });

  it('an Aquatic-granting Foundation keeps the new form afloat', () => {
    const { u } = transformOnFoundation('aquatic-larva', 'test-dock', 'water');
    expect(u.cardId).toBe('land-imago');
    expect(u.keywords.aquatic).toBeTruthy();
    expect(u.status.drowning).toBeUndefined();
    expect(u.attack).toBe(3);
  });
});
