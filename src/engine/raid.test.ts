import { describe, expect, it } from 'vitest';
import { buildRegistry } from '@cards/registry';
import { starterCards, starterLeaders, starterDecks } from '@cards/data/starter';
import { initGame } from '@engine/setup';
import { beginTurn } from '@engine/turn';
import { RULES } from '@engine/constants';
import { resolveDeckRaid } from '@engine/raid';
import type { DeckRaidPool, GameState } from '@engine/types';

const registry = buildRegistry(starterCards, starterLeaders);
const decks: [typeof starterDecks[number], typeof starterDecks[number]] = [starterDecks[1]!, starterDecks[3]!];

const pools: DeckRaidPool[] = [
  { name: 'Alpha', cardIds: ['coal-runner', 'blaze-hound'], signatureCardId: 'sig-thornburst' },
  { name: 'Beta', cardIds: ['flicker-moth'], signatureCardId: 'sig-equalize' },
];

const fresh = (): GameState => initGame({ registry, decks, seed: 7 });

describe('deck raid', () => {
  it('is a no-op for a player with no turnDeckRaid', () => {
    const s = fresh();
    const before = JSON.stringify(s.players[1]);
    resolveDeckRaid(s, 1, []);
    expect(JSON.stringify(s.players[1])).toBe(before);
  });

  /** The raided cards only — the pool's signature is delivered alongside them. */
  const raidedCards = (s: GameState, sig: string): string[] =>
    s.players[1].hand.map((c) => c.cardId).filter((id) => id !== sig);

  it('pulls `count` cards from exactly one pool into hand', () => {
    const s = fresh();
    s.players[1].turnDeckRaid = { pools, count: 3 };
    s.players[1].hand = [];
    resolveDeckRaid(s, 1, []);
    // `count` plundered cards plus the pool's signature.
    expect(s.players[1].hand).toHaveLength(4);
    const sig = s.players[1].signatureCardId;
    const ids = raidedCards(s, sig);
    expect(ids).toHaveLength(3);
    // All three must come from a SINGLE pool — a raid picks one archetype per turn.
    const fromA = ids.every((id) => pools[0]!.cardIds.includes(id));
    const fromB = ids.every((id) => pools[1]!.cardIds.includes(id));
    expect(fromA || fromB).toBe(true);
  });

  it('samples with replacement, so a single-card pool still yields `count` cards', () => {
    const s = fresh();
    s.players[1].turnDeckRaid = { pools: [pools[1]!], count: 4 };
    s.players[1].hand = [];
    resolveDeckRaid(s, 1, []);
    expect(raidedCards(s, 'sig-equalize')).toEqual(['flicker-moth', 'flicker-moth', 'flicker-moth', 'flicker-moth']);
  });

  it('swaps in the raided pool\'s signature and delivers it immediately', () => {
    const s = fresh();
    s.players[1].turnDeckRaid = { pools: [pools[0]!], count: 1 };
    s.players[1].hand = [];
    s.players[1].signatureGranted = true; // already used a previous signature
    resolveDeckRaid(s, 1, []);
    expect(s.players[1].signatureCardId).toBe('sig-thornburst');
    expect(s.players[1].hand.some((c) => c.cardId === 'sig-thornburst')).toBe(true);
    // Delivered outright rather than left pending — the raid guarantees it.
    expect(s.players[1].signatureGranted).toBe(true);
    expect(s.players[1].signaturePending).toBe(false);
    expect(s.players[1].signatureUnlocked).toBe(true);
  });

  it('emits a deckRaid event naming the pool and the cards taken', () => {
    const s = fresh();
    s.players[1].turnDeckRaid = { pools: [pools[1]!], count: 2 };
    const events: Parameters<typeof resolveDeckRaid>[2] = [];
    resolveDeckRaid(s, 1, events);
    const raid = events.find((e) => e.t === 'deckRaid');
    if (raid?.t !== 'deckRaid') throw new Error('expected a deckRaid event');
    expect(raid).toMatchObject({ t: 'deckRaid', player: 1, source: 'Beta' });
    expect(raid.cardIds).toHaveLength(2);
  });

  // Regression: the raid fills the hand to the cap, and a polite "deliver only if there
  // is room" grant then never fires again — turning "a new signature every round" into
  // "one signature, ever". The signature is the mechanic, so it evicts instead of waiting.
  it('delivers the signature even into a FULL hand, evicting the oldest card', () => {
    const s = fresh();
    s.players[1].turnDeckRaid = { pools: [pools[0]!], count: 3 };
    s.players[1].hand = Array.from({ length: RULES.HAND_CAP }, (_, i) => ({ iid: `f${i}`, cardId: 'flicker-moth' }));
    resolveDeckRaid(s, 1, []);
    const hand = s.players[1].hand;
    expect(hand).toHaveLength(RULES.HAND_CAP);
    expect(hand.some((c) => c.cardId === 'sig-thornburst')).toBe(true);
    expect(hand.some((c) => c.iid === 'f0')).toBe(false); // oldest evicted to make room
    expect(s.players[1].signatureGranted).toBe(true);
  });

  it('grants exactly one signature per raid, round after round, at a full hand', () => {
    const s = fresh();
    s.players[1].turnDeckRaid = { pools, count: 4 };
    s.players[1].hand = Array.from({ length: RULES.HAND_CAP }, (_, i) => ({ iid: `f${i}`, cardId: 'flicker-moth' }));
    let granted = 0;
    for (let round = 0; round < 8; round++) {
      const events: Parameters<typeof resolveDeckRaid>[2] = [];
      resolveDeckRaid(s, 1, events);
      granted += events.filter((e) => e.t === 'signatureGranted').length;
    }
    expect(granted).toBe(8);
  });

  it('respects the hand cap — the plundered cards overflow and are forgotten', () => {
    const s = fresh();
    s.players[1].turnDeckRaid = { pools: [pools[1]!], count: 5 };
    // One slot free: the signature claims it, so all 5 plundered cards overflow.
    s.players[1].hand = Array.from({ length: RULES.HAND_CAP - 1 }, (_, i) => ({ iid: `f${i}`, cardId: 'flicker-moth' }));
    const discardBefore = s.players[1].discard.length;
    resolveDeckRaid(s, 1, []);
    expect(s.players[1].hand).toHaveLength(RULES.HAND_CAP);
    expect(s.players[1].hand.some((c) => c.cardId === 'sig-equalize')).toBe(true);
    expect(s.players[1].discard.length).toBe(discardBefore + 5);
  });

  it('is deterministic for a given seed, and advances the rng', () => {
    const a = fresh();
    const b = fresh();
    a.players[1].turnDeckRaid = { pools, count: 3 };
    b.players[1].turnDeckRaid = { pools, count: 3 };
    const rngBefore = a.rng.s;
    resolveDeckRaid(a, 1, []);
    resolveDeckRaid(b, 1, []);
    expect(a.players[1].hand.map((c) => c.cardId)).toEqual(b.players[1].hand.map((c) => c.cardId));
    expect(a.rng.s).not.toBe(rngBefore);
  });

  it('runs through beginTurn, and the raided signature is the one delivered', () => {
    const s = fresh();
    s.players[1].turnDeckRaid = { pools: [pools[0]!], count: 2 };
    s.players[1].hand = [];
    const res = beginTurn(s, 1, registry);
    const p = res.state.players[1];
    // 1 normal draw + 2 raided + the signature.
    expect(p.hand.some((c) => c.cardId === 'sig-thornburst')).toBe(true);
    expect(p.signatureGranted).toBe(true);
    expect(res.events.some((e) => e.t === 'deckRaid')).toBe(true);
  });

  it('delivers a DIFFERENT signature on a later turn when a different pool is raided', () => {
    // Force each pool in turn and confirm the signature actually rotates.
    const s = fresh();
    s.players[1].turnDeckRaid = { pools: [pools[0]!], count: 1 };
    let st = beginTurn(s, 1, registry).state;
    expect(st.players[1].signatureCardId).toBe('sig-thornburst');
    st.players[1].turnDeckRaid = { pools: [pools[1]!], count: 1 };
    st.players[1].hand = [];
    st = beginTurn(st, 1, registry).state;
    expect(st.players[1].signatureCardId).toBe('sig-equalize');
    expect(st.players[1].hand.some((c) => c.cardId === 'sig-equalize')).toBe(true);
  });
});
