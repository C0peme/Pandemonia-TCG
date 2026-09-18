/**
 * Foundation stacking + "a Foundation uses what it grants".
 *
 * A Foundation is a full unit that ALSO passes its ability upward — it should never be a pure
 * pass-through that can't use its own advertised keyword. And since Foundations stack like any
 * other bond, a second Foundation dropped on a standing one should bond onto it exactly like a
 * unit would, inheriting its LIVE body, and itself remain a Foundation that can take a further
 * bond later.
 */
import { describe, expect, it } from 'vitest';
import { buildRegistry } from '@cards/registry';
import { applyAction } from '@engine/engine';
import { resolveCombat } from '@engine/combat';
import { resolveEndOfTurn } from '@engine/endOfTurn';
import { parseCard, type Card } from '@cards/schema';
import { blankState } from '@engine/testkit';

const cards: Card[] = [
  parseCard({
    id: 'watch-post', name: 'Watch Post', type: 'foundation', element: 'earth',
    cost: { energy: 0 }, attack: 3, hp: 5, keywords: {}, grants: { keywords: { sniper: true } },
  }),
  parseCard({
    id: 'stone-plate', name: 'Stone Plate', type: 'foundation', element: 'earth',
    cost: { energy: 0 }, attack: 2, hp: 4, keywords: {}, grants: { keywords: { tough: 1 } },
  }),
  parseCard({
    id: 'grunt', name: 'Grunt', type: 'unit', element: 'earth',
    cost: { energy: 0 }, attack: 2, hp: 3, keywords: {},
  }),
];
const registry = buildRegistry(cards, []);

describe('a Foundation uses the ability it grants', () => {
  it('a Sniper foundation fights as a Sniper while standing alone', () => {
    let s = blankState();
    s.players[0].hand = [{ iid: 'f1', cardId: 'watch-post' }];
    s = applyAction(registry, s, { type: 'playFoundation', iid: 'f1', lane: 'heights' }).state;
    expect(s.players[0].lanes.heights.standaloneFoundation?.keywords.sniper).toBe(true);
    s.players[0].lanes.heights.standaloneFoundation!.justPlaced = false; // as beginTurn would clear it

    // Put an enemy in a lane other than heights: only Sniper's retarget can reach it.
    s.players[1].lanes.ground2.front = { iid: 'e1', cardId: 'grunt', owner: 1, attack: 0, hp: 5, maxHp: 5, keywords: {}, status: {}, turnsInPlay: 0, justPlaced: false } as never;
    const r = resolveCombat(s).state;
    expect(r.players[1].lanes.ground2.front?.hp).toBe(2); // 5 - 3, sniped from Heights
  });
});

describe('Foundation stacking', () => {
  it('a second Foundation bonds onto a standing one, inheriting its live grant', () => {
    let s = blankState();
    s.players[0].hand = [{ iid: 'f1', cardId: 'stone-plate' }];
    s = applyAction(registry, s, { type: 'playFoundation', iid: 'f1', lane: 'ground1' }).state;

    s.players[0].hand = [{ iid: 'f2', cardId: 'watch-post' }];
    const { state: s2, events } = applyAction(registry, s, { type: 'playFoundation', iid: 'f2', lane: 'ground1' });
    expect(events.some((e) => e.t === 'foundationBonded')).toBe(true);

    const top = s2.players[0].lanes.ground1.standaloneFoundation;
    expect(top?.cardId).toBe('watch-post');
    // Watch Post (3/5) gains half of Stone Plate's live body (2/4 -> +1/+2) plus Stone Plate's
    // own granted Tough, on top of its own granted Sniper.
    expect(top?.attack).toBe(3 + 1);
    expect(top?.maxHp).toBe(5 + 2);
    expect(top?.keywords.tough).toBe(1);
    expect(top?.keywords.sniper).toBe(true);
    expect(top?.foundation?.cardId).toBe('stone-plate');
  });

  it('stacking onto ground placed a prior turn is a free Battle Ready, same as a unit bonding', () => {
    let s = blankState();
    s.players[0].hand = [{ iid: 'f1', cardId: 'stone-plate' }];
    s = applyAction(registry, s, { type: 'playFoundation', iid: 'f1', lane: 'ground1' }).state;
    const events: import('@engine/events').GameEvent[] = [];
    resolveEndOfTurn(s, 0, events, registry); // ends the round the base was placed
    s.players[0].lanes.ground1.standaloneFoundation!.justPlaced = false; // as beginTurn would clear it

    s.players[0].hand = [{ iid: 'f2', cardId: 'watch-post' }];
    s = applyAction(registry, s, { type: 'playFoundation', iid: 'f2', lane: 'ground1' }).state;
    expect(s.players[0].lanes.ground1.standaloneFoundation?.justPlaced).toBe(false);
  });

  it('same-turn Foundation-on-Foundation does NOT get the free Battle Ready', () => {
    let s = blankState();
    s.players[0].hand = [{ iid: 'f1', cardId: 'stone-plate' }, { iid: 'f2', cardId: 'watch-post' }];
    s = applyAction(registry, s, { type: 'playFoundation', iid: 'f1', lane: 'ground1' }).state;
    s = applyAction(registry, s, { type: 'playFoundation', iid: 'f2', lane: 'ground1' }).state;
    expect(s.players[0].lanes.ground1.standaloneFoundation?.justPlaced).toBe(true);
  });
});
