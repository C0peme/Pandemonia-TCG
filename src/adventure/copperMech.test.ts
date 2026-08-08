import { describe, expect, it } from 'vitest';
import { buildRegistry } from '@cards/registry';
import { starterCards, starterLeaders, starterDecks } from '@cards/data/starter';
import { leaderSchema } from '@cards/schema';
import { RULES } from '@engine/constants';
import { beginTurn } from '@engine/turn';
import { applyAction } from '@engine/engine';
import { greedyAction } from '@engine/ai';
import { buildRunRegistry } from '@adventure/runRegistry';
import { playerDeck, buildCopperMechState } from '@adventure/encounters';
import { startRun, startCopperMech, resolveCopperMech, leaveCopperMech, pickNode } from '@adventure/run';
import { parseRun } from '@adventure/schema';
import {
  copperMechLeader, copperMechRaidPools, copperMechDeck,
  COPPER_MECH_HP, COPPER_MECH_ID, COPPER_MECH_RAID_COUNT,
} from '@adventure/data/copperMech';

const base = buildRegistry(starterCards, starterLeaders);
const run0 = startRun('orsyric', 42, base);

const runRegistry = () =>
  buildRunRegistry(base, { deck: run0.deck, extraLeaders: [copperMechLeader(base)] });

describe('Copper Mech content', () => {
  it('has 413 HP and every element capped at 4', () => {
    const mech = copperMechLeader(base);
    expect(mech.hp).toBe(COPPER_MECH_HP);
    expect(COPPER_MECH_HP).toBe(413);
    expect(mech.elementCaps).toEqual({ fire: 4, water: 4, nature: 4, earth: 4 });
    for (const cap of Object.values(mech.elementCaps)) expect(cap).toBe(RULES.ELEMENT_CAP_MAX);
  });

  // The caps deliberately break the authored-leader budget. This test pins that the
  // violation is INTENTIONAL and, crucially, that it stays out of the validated content
  // path — every leader a player can actually pick must still satisfy the budget.
  it('intentionally exceeds the leader cap budget, and is therefore kept unvalidated', () => {
    const mech = copperMechLeader(base);
    const total = Object.values(mech.elementCaps).reduce((a, b) => a + b, 0);
    expect(total).toBe(16);
    expect(total).toBeGreaterThan(RULES.ELEMENT_CAP_TOTAL);
    expect(leaderSchema.safeParse(mech).success).toBe(false); // would be rejected as authored content
    expect(starterLeaders.some((l) => l.id === COPPER_MECH_ID)).toBe(false); // never shipped as one
    // ...while every real leader still passes.
    for (const l of starterLeaders) expect(leaderSchema.safeParse(l).success).toBe(true);
  });

  it('its placeholder signature is a real card (overwritten by the first raid anyway)', () => {
    expect(base.cards.has(copperMechLeader(base).signatureCardId)).toBe(true);
  });

  it('its deck is the whole battle-ready card pool, with no tokens or signatures', () => {
    const deck = copperMechDeck(base);
    expect(deck.cards.length).toBeGreaterThan(100);
    for (const { cardId } of deck.cards) {
      const card = base.cards.get(cardId)!;
      expect(card.wip).toBe(false);
      expect(card.tags).not.toContain('token');
      expect(card.tags).not.toContain('signature');
      expect(cardId.startsWith('__')).toBe(false);
    }
    // "Access to all cards" — it should hold essentially the entire pool.
    const eligible = [...base.cards.values()].filter(
      (c) => !c.wip && !c.tags.includes('token') && !c.tags.includes('signature') && !c.id.startsWith('__') && !c.id.startsWith('sig-'),
    );
    expect(deck.cards.length).toBe(eligible.length);
  });

  it('has one raid pool per archetype, each with that leader\'s signature', () => {
    const pools = copperMechRaidPools(base);
    expect(pools.length).toBe(starterDecks.length);
    for (const pool of pools) {
      expect(pool.cardIds.length).toBeGreaterThan(0);
      expect(new Set(pool.cardIds).size).toBe(pool.cardIds.length); // deduped
      expect(pool.signatureCardId).toBeTruthy();
      expect(base.cards.has(pool.signatureCardId!)).toBe(true);
      for (const id of pool.cardIds) expect(base.cards.has(id)).toBe(true);
    }
    // Every shipped leader's signature is reachable, so any of them can show up.
    const sigs = new Set(pools.map((p) => p.signatureCardId));
    for (const deck of starterDecks) {
      expect(sigs.has(base.leaders.get(deck.leaderId)!.signatureCardId)).toBe(true);
    }
  });
});

describe('Copper Mech encounter', () => {
  it('seats the Mech at 413 HP opposite the player, with the raid armed', () => {
    const registry = runRegistry();
    const state = buildCopperMechState(registry, playerDeck('orsyric', run0.deck), 99);
    expect(state.players[1].leaderId).toBe(COPPER_MECH_ID);
    expect(state.players[1].leaderHp).toBe(COPPER_MECH_HP);
    expect(state.players[1].leaderMaxHp).toBe(COPPER_MECH_HP);
    expect(state.players[1].elementCaps).toEqual({ fire: 4, water: 4, nature: 4, earth: 4 });
    expect(state.players[1].turnDeckRaid?.count).toBe(COPPER_MECH_RAID_COUNT);
    expect(state.players[1].turnDeckRaid?.pools.length).toBe(starterDecks.length);
    expect(state.players[0].leaderId).toBe('orsyric'); // player keeps their own leader
    expect(state.active).toBe(0); // player moves first
  });

  it('raids on each of its turns, gaining cards AND a signature it can actually cast', () => {
    const registry = runRegistry();
    let state = buildCopperMechState(registry, playerDeck('orsyric', run0.deck), 99);
    const seen = new Set<string>();
    for (let turn = 0; turn < 6; turn++) {
      state.players[1].hand = [];
      const res = beginTurn(state, 1, registry);
      state = res.state;
      const raid = res.events.find((e) => e.t === 'deckRaid');
      expect(raid).toBeTruthy();
      seen.add(state.players[1].signatureCardId);
      // Everything it holds must resolve in the registry — a raided card the engine
      // can't find would be a dead card in hand.
      for (const c of state.players[1].hand) expect(registry.cards.has(c.cardId)).toBe(true);
    }
    // Across several rounds it should have rotated through more than one signature.
    expect(seen.size).toBeGreaterThan(1);
  });

  // Smoke test: the whole fight actually plays out under AI control without crashing,
  // and the defining mechanic holds for EVERY round rather than just the first. The
  // hand cap is what makes this worth pinning — a raid fills the hand to the cap, and
  // an ordinary "deliver if there's room" grant silently degrades to one signature per
  // GAME instead of one per round.
  it('plays to completion, delivering a fresh signature every single round', () => {
    const registry = runRegistry();
    let state = buildCopperMechState(registry, playerDeck('orsyric', run0.deck), 5);
    let raids = 0;
    let signatures = 0;
    const sources = new Set<string>();
    let guard = 0;
    while (state.phase !== 'ended' && guard++ < 2000) {
      const res = applyAction(registry, state, greedyAction(registry, state));
      for (const e of res.events) {
        if (e.t === 'deckRaid' && e.player === 1) { raids += 1; sources.add(e.source); }
        if (e.t === 'signatureGranted' && e.player === 1) signatures += 1;
      }
      state = res.state;
    }
    expect(state.phase).toBe('ended');
    expect(raids).toBeGreaterThan(2);
    // One signature per raid — never fewer, however full the hand got.
    expect(signatures).toBe(raids);
    // And it really does rotate archetypes rather than locking onto one.
    expect(sources.size).toBeGreaterThan(1);
    // Every card it still holds is a real, resolvable card.
    for (const c of state.players[1].hand) expect(registry.cards.has(c.cardId)).toBe(true);
  });

  it('is reproducible: the same fight seed yields the same opening', () => {
    const a = buildCopperMechState(runRegistry(), playerDeck('orsyric', run0.deck), 1234);
    const b = buildCopperMechState(runRegistry(), playerDeck('orsyric', run0.deck), 1234);
    expect(a.players[0].hand.map((c) => c.cardId)).toEqual(b.players[0].hand.map((c) => c.cardId));
    expect(a.players[1].deck.map((c) => c.cardId)).toEqual(b.players[1].deck.map((c) => c.cardId));
  });
});

describe('Copper Mech run flow', () => {
  it('is enterable from the map at any time and bumps the attempt counter', () => {
    const started = startCopperMech(run0);
    expect(started.phase.t).toBe('copper');
    expect(started.copperAttempts).toBe(1);
    expect(startCopperMech(started)).toBe(started); // not from inside the fight
  });

  it('varies the fight seed per attempt', () => {
    const first = startCopperMech(run0);
    const settled = leaveCopperMech(resolveCopperMech(first, 10, false));
    const second = startCopperMech(settled);
    expect(second.phase.t === 'copper' && second.phase.fightSeed).not.toBe(
      first.phase.t === 'copper' && first.phase.fightSeed,
    );
  });

  it('records damage as the score and flags a new record', () => {
    const settled = resolveCopperMech(startCopperMech(run0), 120, false);
    expect(settled.copperBest).toBe(120);
    expect(settled.phase).toMatchObject({ t: 'copperResult', damage: 120, killed: false, record: true });
  });

  it('keeps the best across attempts and does not regress on a worse run', () => {
    let run = leaveCopperMech(resolveCopperMech(startCopperMech(run0), 200, false));
    run = resolveCopperMech(startCopperMech(run), 50, false);
    expect(run.copperBest).toBe(200);
    expect(run.phase).toMatchObject({ damage: 50, record: false });
  });

  // The chosen loss rule: an attempt costs nothing but the attempt.
  it('losing leaves the run completely untouched — map, deck, coins, HP, act', () => {
    const before = pickNode(run0, run0.map.layers[0]![0]!); // put the run somewhere non-trivial
    const after = leaveCopperMech(resolveCopperMech(startCopperMech({ ...before, phase: { t: 'map' } }), 77, false));
    expect(after.phase).toEqual({ t: 'map' });
    expect(after.hp).toBe(before.hp);
    expect(after.coins).toBe(before.coins);
    expect(after.act).toBe(before.act);
    expect(after.deck).toEqual(before.deck);
    expect(after.map).toEqual(before.map);
    expect(after.adventureWon).toBe(false);
  });

  it('killing it wins the Adventure, permanently', () => {
    const won = resolveCopperMech(startCopperMech(run0), COPPER_MECH_HP, true);
    expect(won.adventureWon).toBe(true);
    expect(won.copperBest).toBe(COPPER_MECH_HP);
    expect(won.phase).toMatchObject({ killed: true });
    // A later, worse attempt cannot un-win it.
    const later = resolveCopperMech(startCopperMech(leaveCopperMech(won)), 5, false);
    expect(later.adventureWon).toBe(true);
  });

  it('clamps a nonsensical damage figure into [0, 413]', () => {
    expect(resolveCopperMech(startCopperMech(run0), -5, false).copperBest).toBe(0);
    expect(resolveCopperMech(startCopperMech(run0), 99999, false).copperBest).toBe(COPPER_MECH_HP);
    expect(resolveCopperMech(startCopperMech(run0), NaN, false).copperBest).toBe(0);
  });

  it('round-trips through persistence, and older saves load with the endgame zeroed', () => {
    const run = resolveCopperMech(startCopperMech(run0), 130, false);
    expect(parseRun(JSON.parse(JSON.stringify(run)))).toEqual(run);

    const legacy = JSON.parse(JSON.stringify(run0)) as Record<string, unknown>;
    delete legacy.copperBest;
    delete legacy.copperAttempts;
    delete legacy.adventureWon;
    const loaded = parseRun(legacy);
    expect(loaded).toBeTruthy();
    expect(loaded!.copperBest).toBe(0);
    expect(loaded!.adventureWon).toBe(false);
  });
});
