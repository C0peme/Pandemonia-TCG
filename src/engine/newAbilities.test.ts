import { describe, expect, it } from 'vitest';
import { applyEffects } from '@engine/effects';
import { drawCard } from '@engine/draw';
import { resolveCombat } from '@engine/combat';
import { blankState, place, unit, testRegistry } from '@engine/testkit';
import { NULL_CARD_ID } from '@cards/special';
import { LANES, RULES } from '@engine/constants';
import type { Effect } from '@cards/schema';
import type { TargetRef } from '@engine/actions';
import type { GameEvent } from '@engine/events';
import type { GameState, PlayerId } from '@engine/types';

const run = (s: GameState, effects: Effect[], targets: TargetRef[] = [], caster: PlayerId = 0) => {
  const events: GameEvent[] = [];
  const err = applyEffects(s, caster, effects, targets, undefined, events, testRegistry);
  return { err, events };
};

const fullHand = (s: GameState, player: PlayerId) => {
  s.players[player].hand = Array.from({ length: RULES.HAND_CAP }, (_, i) => ({ iid: `h${i}`, cardId: 'v0' }));
};

describe('Battle Ready', () => {
  it('lets a just-placed unit attack the turn it enters', () => {
    const s = blankState();
    const u = unit({ owner: 0, attack: 3, hp: 3, keywords: { battleReady: true } });
    u.justPlaced = true;
    place(s, 0, 'ground1', u);
    const { state } = resolveCombat(s);
    expect(state.players[1].leaderHp).toBe(RULES.LEADER_HP - 3);
  });

  it('without Battle Ready, a just-placed unit cannot attack', () => {
    const s = blankState();
    const u = unit({ owner: 0, attack: 3, hp: 3 });
    u.justPlaced = true;
    place(s, 0, 'ground1', u);
    const { state } = resolveCombat(s);
    expect(state.players[1].leaderHp).toBe(RULES.LEADER_HP);
  });
});

describe('Forget effect (deck mill)', () => {
  it('removes cards from the top of the target deck', () => {
    const s = blankState();
    s.players[1].deck = [
      { iid: 'd1', cardId: 'v0' },
      { iid: 'd2', cardId: 'v1' },
      { iid: 'd3', cardId: 'v2' },
    ];
    const { events } = run(s, [{ kind: 'forget', amount: 2, target: 'enemy' }]);
    expect(s.players[1].deck).toHaveLength(1);
    expect(s.players[1].deck[0]!.iid).toBe('d3');
    expect(events.filter((e) => e.t === 'forget')).toHaveLength(2);
  });

  it('milling more than deck size clamps to deck length', () => {
    const s = blankState();
    s.players[1].deck = [{ iid: 'd1', cardId: 'v0' }];
    run(s, [{ kind: 'forget', amount: 5, target: 'enemy' }]);
    expect(s.players[1].deck).toHaveLength(0);
  });
});

describe('Energy chooseElement (Golun Cultivate)', () => {
  it('banks the player-chosen element', () => {
    const s = blankState();
    const before = s.players[0].bank.fire;
    run(s, [{ kind: 'energy', amount: 2, chooseElement: true }], [{ kind: 'element', element: 'fire' }]);
    expect(s.players[0].bank.fire).toBe(Math.min(before + 2, s.players[0].elementCaps.fire));
  });

  it('errors when no element is chosen', () => {
    const s = blankState();
    const { err } = run(s, [{ kind: 'energy', amount: 2, chooseElement: true }], []);
    expect(err).toBeTruthy();
  });
});

describe('Full hand → permanent removal (mill)', () => {
  it('drawing into a full hand forgets the drawn card', () => {
    const s = blankState();
    fullHand(s, 0);
    s.players[0].deck = [{ iid: 'd1', cardId: 'v1' }];
    const events: GameEvent[] = [];
    drawCard(s, 0, events);
    expect(s.players[0].hand).toHaveLength(RULES.HAND_CAP);
    expect(s.players[0].discard.some((c) => c.iid === 'd1')).toBe(true);
    expect(events.some((e) => e.t === 'forget')).toBe(true);
  });

  it('drawing a Null into a full hand bleeds the leader for 4', () => {
    const s = blankState();
    fullHand(s, 0);
    s.players[0].deck = []; // deck-out → Null
    drawCard(s, 0, []);
    expect(s.players[0].hand).toHaveLength(RULES.HAND_CAP);
    expect(s.players[0].leaderHp).toBe(RULES.LEADER_HP - 4);
  });

  it('expelling into a full hand discards the unit instead (and a Null bleeds)', () => {
    const s = blankState();
    fullHand(s, 1);
    place(s, 1, 'ground1', unit({ owner: 1, attack: 0, hp: 4, cardId: NULL_CARD_ID }));
    const id = s.players[1].lanes.ground1.front!.iid;
    run(s, [{ kind: 'expel', target: 'enemy' }], [{ kind: 'unit', iid: id }]);
    expect(s.players[1].lanes.ground1.front).toBeUndefined();
    expect(s.players[1].hand).toHaveLength(RULES.HAND_CAP); // not held
    expect(s.players[1].discard.some((c) => c.iid === id)).toBe(true);
    expect(s.players[1].leaderHp).toBe(RULES.LEADER_HP - 4);
  });
});

describe('Summon effect', () => {
  it('creates a unit on the caster side in a fixed lane', () => {
    const s = blankState();
    run(s, [{ kind: 'summon', cardId: 'titan', lane: 'ground2' }]);
    expect(s.players[0].lanes.ground2.front?.cardId).toBe('titan');
    expect(s.players[0].lanes.ground2.front?.attack).toBe(6);
  });

  it('with target enemy, summons onto the enemy side', () => {
    const s = blankState();
    run(s, [{ kind: 'summon', cardId: 'v0', target: 'enemy', lane: 'ground1' }]);
    expect(s.players[1].lanes.ground1.front?.cardId).toBe('v0');
  });

  it('falls back to the first open lane when none is specified', () => {
    const s = blankState();
    run(s, [{ kind: 'summon', cardId: 'v0' }]);
    expect(LANES.some((l) => s.players[0].lanes[l].front?.cardId === 'v0')).toBe(true);
  });
});

describe('Conjure effect', () => {
  it('creates a card in the caster hand', () => {
    const s = blankState();
    run(s, [{ kind: 'conjure', cardId: 'firebolt' }]);
    expect(s.players[0].hand.some((c) => c.cardId === 'firebolt')).toBe(true);
  });

  it('with target enemy, conjures into the enemy hand', () => {
    const s = blankState();
    run(s, [{ kind: 'conjure', cardId: 'firebolt', target: 'enemy' }]);
    expect(s.players[1].hand.some((c) => c.cardId === 'firebolt')).toBe(true);
  });
});
