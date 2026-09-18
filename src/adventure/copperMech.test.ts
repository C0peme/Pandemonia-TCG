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
import { startRun, startCopperMech, resolveCopperMech, leaveCopperMech, pickCopperRelic } from '@adventure/run';
import { ECON } from '@adventure/economy';
import { aggregateMods, applyRelicsToState } from '@adventure/relics';
import { parseRun, type RunState } from '@adventure/schema';
import {
  copperMechLeader, copperMechRaidPools, copperMechDeck,
  COPPER_MECH_HP, COPPER_MECH_ID, COPPER_MECH_RAID_COUNT,
} from '@adventure/data/copperMech';

const base = buildRegistry(starterCards, starterLeaders);
const run0 = startRun('orsyric', 42, base);

/**
 * Claim any tier relic the result screen is holding, so a test that cares about something
 * else can walk past the gate. Tier payouts are a separate concern with their own tests.
 */
/**
 * Claim every relic the scoreboard is offering. One is owed PER tier crossed, so an
 * attempt that jumps two rungs re-offers after the first claim — a single pick would
 * leave Continue gated.
 */
const clearTierGate = (run: ReturnType<typeof startRun>): ReturnType<typeof startRun> => {
  let cur = run;
  for (let guard = 0; guard < 8; guard++) {
    if (cur.phase.t !== 'copperResult' || !cur.phase.relicChoices?.length) return cur;
    cur = pickCopperRelic(cur, cur.phase.relicChoices[0]!);
  }
  return cur;
};

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
    // Rich enough to pay several attempt tolls.
    let run = { ...run0, coins: 400 };
    run = leaveCopperMech(clearTierGate(resolveCopperMech(startCopperMech(run), 200, false)));
    run = resolveCopperMech(startCopperMech(run), 50, false);
    expect(run.copperBest).toBe(200);
    expect(run.phase).toMatchObject({ damage: 50, record: false });
  });

  // The loss rule: an attempt costs coins up front, and losing resets the ACT — its map is
  // redrawn and must be walked again. Everything the player has BUILT survives.
  it('losing resets the act and redraws its map, but keeps deck, HP and progression', () => {
    const before = { ...run0, coins: 400 };
    const started = startCopperMech(before);
    const after = leaveCopperMech(clearTierGate(resolveCopperMech(started, 77, false)));
    expect(after.phase).toEqual({ t: 'map' });
    expect(after.hp).toBe(before.hp);
    expect(after.act).toBe(before.act);
    expect(after.deck).toEqual(before.deck);
    expect(after.adventureWon).toBe(false);
    // The act is rewalked from the start, on a different map.
    expect(after.currentNodeId).toBeNull();
    expect(after.map).not.toEqual(before.map);
    // Only the attempt toll was charged.
    expect(after.coins).toBe(before.coins - ECON.COPPER_ATTEMPT_COST);
  });

  it('charges for the attempt and refuses one that cannot be paid', () => {
    const rich = { ...run0, coins: ECON.COPPER_ATTEMPT_COST };
    expect(startCopperMech(rich).coins).toBe(0);
    const broke = { ...run0, coins: ECON.COPPER_ATTEMPT_COST - 1 };
    expect(startCopperMech(broke)).toBe(broke);
  });

  it('pays each damage tier exactly once per run', () => {
    let run = { ...run0, coins: 900 };
    const pct = (p: number): number => Math.ceil((COPPER_MECH_HP * p) / 100);

    // First attempt clears 20% and 40% together — both are newly reached.
    let settled = resolveCopperMech(startCopperMech(run), pct(40), false);
    expect(settled.phase.t === 'copperResult' && settled.phase.tiers).toEqual([20, 40]);
    expect(settled.copperTiers).toEqual([20, 40]);
    run = leaveCopperMech(clearTierGate(settled));

    // A repeat of the same mark pays nothing.
    settled = resolveCopperMech(startCopperMech(run), pct(40), false);
    expect(settled.phase.t === 'copperResult' && settled.phase.tiers).toBeUndefined();
    run = leaveCopperMech(clearTierGate(settled));

    // Beating it pays only the NEW rung.
    settled = resolveCopperMech(startCopperMech(run), pct(60), false);
    expect(settled.phase.t === 'copperResult' && settled.phase.tiers).toEqual([60]);
  });

  it('gates Continue on an unclaimed tier relic, exactly like a combat reward', () => {
    const settled = resolveCopperMech(startCopperMech({ ...run0, coins: 400 }), COPPER_MECH_HP, true);
    if (settled.phase.t !== 'copperResult' || !settled.phase.relicChoices?.length) return;
    expect(leaveCopperMech(settled)).toBe(settled);
    const claimed = pickCopperRelic(settled, settled.phase.relicChoices[0]!);
    expect(claimed.relics).toContain(settled.phase.relicChoices[0]);
    // A full kill crosses every rung at once, so several relics are owed — Continue stays
    // gated until each has been claimed.
    expect(leaveCopperMech(clearTierGate(claimed)).phase).toEqual({ t: 'map' });
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

describe('tier relics: one per rung crossed', () => {
  const atCopper = (over: Partial<RunState> = {}): RunState => {
    const run = startRun('orsyric', 42, base);
    return { ...run, ...over, phase: { t: 'copper', fightSeed: 1 } };
  };

  it('pays a relic for EVERY tier an attempt crosses, not just the first', () => {
    // A first attempt that jumps straight past 20% and 40% banked both rungs but paid a
    // single relic: only one choice row was rolled, and claiming it cleared the gate.
    const dealt = Math.ceil(COPPER_MECH_HP * 0.45);
    let run = resolveCopperMech(atCopper({ coins: 500 }), dealt, false);
    if (run.phase.t !== 'copperResult') throw new Error('expected the scoreboard');
    expect(run.phase.tiers).toEqual([20, 40]);
    expect(run.phase.relicChoices?.length).toBeGreaterThan(0);
    expect(run.phase.tiersOwed).toEqual([40]);

    // First claim re-offers rather than closing the gate.
    run = pickCopperRelic(run, run.phase.relicChoices![0]!);
    if (run.phase.t !== 'copperResult') throw new Error('expected the scoreboard');
    expect(run.relics).toHaveLength(1);
    expect(run.phase.relicChoices?.length, 'the second rung still owes a relic').toBeGreaterThan(0);
    expect(leaveCopperMech(run), 'Continue stays gated').toBe(run);

    run = pickCopperRelic(run, run.phase.relicChoices![0]!);
    expect(run.relics).toHaveLength(2);
    expect(run.phase.t === 'copperResult' && run.phase.relicChoices).toBeUndefined();
    expect(leaveCopperMech(run).phase.t).toBe('map');
  });

  it('pays exactly one for a single rung', () => {
    const run = resolveCopperMech(atCopper(), Math.ceil(COPPER_MECH_HP * 0.25), false);
    if (run.phase.t !== 'copperResult') throw new Error('expected the scoreboard');
    expect(run.phase.tiers).toEqual([20]);
    expect(run.phase.tiersOwed).toBeUndefined();
  });
});

describe('what the Mech ignores', () => {
  it('always starts the player at full leader HP, whatever the run carries', () => {
    // The Mech is a SCORE challenge: a damage number has to mean the same thing whatever
    // state the run is in, so carried HP (and therefore every HP relic) is deliberately
    // not applied. `resolveCopperMech` likewise never writes HP back.
    const reg = runRegistry();
    const deck = playerDeck(run0.leaderId, run0.deck);
    const full = buildCopperMechState(reg, deck, 1);
    expect(full.players[0].leaderHp).toBe(full.players[0].leaderMaxHp ?? RULES.LEADER_HP);
  });

  it('never changes the run HP, win or lose', () => {
    const wounded: RunState = { ...run0, hp: 7, coins: 500 };
    const after = resolveCopperMech(startCopperMech(wounded), 100, false);
    expect(after.hp).toBe(7);
  });

  it('still applies the relics that are NOT about HP', () => {
    // Cost discounts, banked energy, element caps, extra draws and the signature all ride
    // `applyRelicsToState`, which the Mech does run — only the HP path is excluded.
    const mods = aggregateMods(['drill-sergeant', 'runic-battery', 'banked-reserves-fire', 'veterans-draw']);
    const reg = runRegistry();
    let state = buildCopperMechState(reg, playerDeck(run0.leaderId, run0.deck), 1);
    const handBefore = state.players[0].hand.length;
    state = applyRelicsToState(reg, state, mods, 1);
    expect(state.players[0].costBase?.unit).toBe(-1);
    expect(state.players[0].energy).toBeGreaterThan(0);
    expect(state.players[0].hand.length).toBe(handBefore + 1);
  });

  it('enemy-HP-reduction relics never soften the Mech', () => {
    // `enemyHpMult` is read in exactly one place — `rollEncounter`, which builds a normal
    // battle node's enemy. The Mech's own HP comes from `COPPER_MECH_HP` via
    // `copperMechLeader`, a path `enemyHpMult` is never threaded into. Asserted directly
    // (not just "not less than") so a future refactor that accidentally wires it in fails
    // loudly here instead of only showing up as an easier boss fight.
    const withCuts = aggregateMods(['ember-cache', 'siege-ram', 'war-drums', 'avalanche-horn']);
    expect(withCuts.enemyHpMult).toBeLessThan(1); // the mods really do cut something
    const mech = copperMechLeader(base);
    expect(mech.hp).toBe(COPPER_MECH_HP);

    const reg = runRegistry();
    let state = buildCopperMechState(reg, playerDeck(run0.leaderId, run0.deck), 1);
    const before = state.players[1].leaderMaxHp;
    state = applyRelicsToState(reg, state, withCuts, 1);
    expect(state.players[1].leaderMaxHp).toBe(before);
    expect(state.players[1].leaderMaxHp).toBe(COPPER_MECH_HP);
  });

  it("DOES apply the player's own boosted max HP to the Mech, at full current HP", () => {
    // The other half of the same instruction: enemy-side cuts are excluded, but the
    // player's own permanent maximum (act growth, maxHpDelta relics) is not a situational
    // wound — it raises the bar the Mech is fought at exactly like any other fight.
    const reg = runRegistry();
    const boosted = buildCopperMechState(reg, playerDeck(run0.leaderId, run0.deck), 1, 50);
    expect(boosted.players[0].leaderMaxHp).toBe(50);
    expect(boosted.players[0].leaderHp).toBe(50);
  });
});
