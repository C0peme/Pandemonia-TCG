import { describe, expect, it } from 'vitest';
import { buildRegistry } from '@cards/registry';
import { starterCards, starterLeaders } from '@cards/data/starter';
import { NULL_CARD_ID } from '@cards/special';
import { LANES } from '@engine/constants';
import { initGame } from '@engine/setup';
import { beginTurn } from '@engine/turn';
import { applyAction, legalActions } from '@engine/engine';
import { processDeaths } from '@engine/effects';
import { placeBossUnits, resolveExecute, resolveSeal, resolveSteal, isSealed } from '@engine/bossRules';
import { applyStatus, clearCleansableStatuses } from '@engine/status';
import { buffUnit } from '@engine/board';
import { healUnit } from '@engine/damage';
import { resolveCombat } from '@engine/combat';
import { resolveEndOfTurn } from '@engine/endOfTurn';
import type { GameState, PlayerId, UnitInstance } from '@engine/types';
import type { GameEvent } from '@engine/events';
import type { Deck } from '@cards/schema';
import { buildRunRegistry, advCardId } from '@adventure/runRegistry';

const base = buildRegistry(starterCards, starterLeaders);
const decks: [Deck, Deck] = [
  { name: 'P', leaderId: 'orsyric', cards: starterCards.filter((c) => c.type === 'unit' && !c.wip).slice(0, 20).map((c) => ({ cardId: c.id, count: 1 })) },
  { name: 'E', leaderId: 'kedou', cards: starterCards.filter((c) => c.type === 'unit' && !c.wip).slice(0, 20).map((c) => ({ cardId: c.id, count: 1 })) },
];
const fresh = (): GameState => initGame({ registry: base, decks, seed: 7, first: 0 });

describe('placements: the False Hydra and the Architect', () => {
  it('fills only the named side, and only its EMPTY lanes', () => {
    const s = fresh();
    // Occupy one of the boss's lanes first — a placement must never clobber a board the
    // boss has already developed, nor a unit the player is about to trade with.
    s.players[1].lanes.ground1.front = s.players[1].lanes.ground1.front ?? {
      iid: 'held', cardId: 'coal-runner', owner: 1, attack: 2, hp: 2, maxHp: 2,
      keywords: {}, status: {}, turnsInPlay: 1, justPlaced: false,
    };
    placeBossUnits(base, s, 'cult-follower', 1, []);
    expect(s.players[1].lanes.ground1.front!.cardId).toBe('coal-runner'); // untouched
    for (const lane of LANES) {
      if (lane === 'ground1') continue;
      expect(s.players[1].lanes[lane].front?.cardId, lane).toBe('cult-follower');
    }
    // The player's board is never touched. The old version filled BOTH sides, which handed
    // the player five free blockers and made the boss mill itself.
    for (const lane of LANES) expect(s.players[0].lanes[lane].front, lane).toBeUndefined();
  });

  it('fills the Water lane too — the prophets are Airborne so they do not drown', () => {
    const s = fresh();
    placeBossUnits(base, s, 'cult-follower', 1, []);
    const water = s.players[1].lanes.water.front!;
    expect(water.cardId).toBe('cult-follower');
    expect(water.status.drowning).toBeFalsy();
  });

  it('the Architect\'s bulwarks are standalone FOUNDATIONS, not units', () => {
    const s = fresh();
    placeBossUnits(base, s, 'bulwark-wall', 1, []);
    for (const lane of LANES) {
      expect(s.players[1].lanes[lane].standaloneFoundation?.cardId, lane).toBe('bulwark-wall');
      expect(s.players[1].lanes[lane].front, lane).toBeUndefined();
    }
  });

  it('a prophet still standing at the end of the round dissolves and Nulls the PLAYER', () => {
    const s = fresh();
    s.bossRules = { placements: [{ cardId: 'cult-follower', side: 1, everyRounds: 2 }] };
    placeBossUnits(base, s, 'cult-follower', 1, []);
    const handBefore = s.players[0].hand.length;

    // The prophets are the boss's, so their endOfTurn fires on the BOSS's turn — which,
    // with the player seated first, is the end of the round. That is the window the
    // gimmick text promises, and it is why they are enemy-owned rather than player-owned:
    // the player can actually attack them in between.
    s.active = 1;
    const res = applyAction(base, s, { type: 'endTurn' });
    const nulls = res.state.players[0].hand.filter((c) => c.cardId === NULL_CARD_ID).length;
    expect(nulls).toBe(LANES.length);
    expect(res.state.players[0].hand.length).toBeGreaterThan(handBefore);
    for (const lane of LANES) expect(res.state.players[1].lanes[lane].front, lane).toBeUndefined();
  });

  it('recurs on ODD rounds — round 1 included — and not on even ones', () => {
    const s = fresh();
    s.bossRules = { placements: [{ cardId: 'cult-follower', side: 1, everyRounds: 2 }] };
    // Round 1 (odd): they arrive.
    const r1 = beginTurn({ ...s, round: 1, active: 0 }, 0, base).state;
    expect(r1.players[1].lanes.ground1.front?.cardId).toBe('cult-follower');
    // Round 2 (even): nothing new.
    const r2 = beginTurn({ ...s, round: 2, active: 0 }, 0, base).state;
    expect(r2.players[1].lanes.ground1.front).toBeUndefined();
    // Round 3 (odd): back again.
    const r3 = beginTurn({ ...s, round: 3, active: 0 }, 0, base).state;
    expect(r3.players[1].lanes.ground1.front?.cardId).toBe('cult-follower');
  });
});

describe('seal: Screyera\'s Foresight', () => {
  it('seals the most expensive card in hand, and the engine refuses to play it', () => {
    const s = fresh();
    s.bossRules = { seal: 0 };
    resolveSeal(base, s, 0);
    const sealed = s.players[0].sealedIid!;
    expect(sealed).toBeTruthy();

    const costOf = (iid: string): number => {
      const inst = s.players[0].hand.find((c) => c.iid === iid)!;
      const def = base.cards.get(inst.cardId)!;
      return def.cost.energy + (def.cost.elements ?? []).reduce((n, e) => n + e.amount, 0);
    };
    for (const c of s.players[0].hand) expect(costOf(c.iid)).toBeLessThanOrEqual(costOf(sealed));

    expect(isSealed(s, 0, sealed)).toBe(true);
    // Not merely absent from `legalActions` — actually refused, so a hand-built action
    // cannot route around the rule either.
    const res = applyAction(base, s, { type: 'playUnit', iid: sealed, lane: 'ground1' });
    expect(res.events.some((e) => e.t === 'error')).toBe(true);
    expect(res.state).toBe(s); // refused outright, nothing committed
    expect(legalActions(base, s).some((a) => 'iid' in a && a.iid === sealed)).toBe(false);
  });

  it('re-chooses every turn rather than locking one card for the fight', () => {
    const s = fresh();
    s.bossRules = { seal: 0 };
    resolveSeal(base, s, 0);
    const first = s.players[0].sealedIid!;
    // Remove the sealed card; the rule should move to whatever is now the best.
    s.players[0].hand = s.players[0].hand.filter((c) => c.iid !== first);
    resolveSeal(base, s, 0);
    expect(s.players[0].sealedIid).toBeDefined();
    expect(s.players[0].sealedIid).not.toBe(first);
  });

  it('never seals the other seat, and clears when the rule is not in play', () => {
    const s = fresh();
    s.bossRules = { seal: 0 };
    resolveSeal(base, s, 1);
    expect(s.players[1].sealedIid).toBeUndefined();
    s.players[0].sealedIid = 'stale';
    s.bossRules = {};
    resolveSeal(base, s, 0);
    expect(s.players[0].sealedIid).toBeUndefined();
  });
});

describe('mirror: Integer Overflow', () => {
  it('copies a played unit into the boss\'s matching lane', () => {
    const s = fresh();
    s.bossRules = { mirror: 0 };
    const unit = s.players[0].hand.find((c) => base.cards.get(c.cardId)!.type === 'unit')!;
    s.players[0].energy = 99;
    const res = applyAction(base, s, { type: 'playUnit', iid: unit.iid, lane: 'ground1' });
    expect(res.events.some((e) => e.t === 'error')).toBe(false);
    expect(res.state.players[1].lanes.ground1.front?.cardId).toBe(unit.cardId);
    expect(res.state.players[0].lanes.ground1.front?.cardId).toBe(unit.cardId);
  });

  it('skips a mirrored lane that is already occupied — it never shoves the boss around', () => {
    const s = fresh();
    s.bossRules = { mirror: 0 };
    s.players[1].lanes.ground1.front = {
      iid: 'held', cardId: 'coal-runner', owner: 1, attack: 2, hp: 2, maxHp: 2,
      keywords: {}, status: {}, turnsInPlay: 1, justPlaced: false,
    };
    const unit = s.players[0].hand.find((c) => base.cards.get(c.cardId)!.type === 'unit')!;
    s.players[0].energy = 99;
    const res = applyAction(base, s, { type: 'playUnit', iid: unit.iid, lane: 'ground1' });
    expect(res.state.players[1].lanes.ground1.front!.cardId).toBe('coal-runner');
  });
});

describe('dampen: NICE\'s Correction', () => {
  it('lands on the body at play time, never below zero, and only on the named seat', () => {
    const s = fresh();
    s.bossRules = { dampen: { player: 0, attack: 2 } };
    s.players[0].energy = 99;
    const unit = s.players[0].hand.find((c) => {
      const d = base.cards.get(c.cardId)!;
      return d.type === 'unit' && d.attack > 0;
    })!;
    const printed = (base.cards.get(unit.cardId) as { attack: number }).attack;
    const res = applyAction(base, s, { type: 'playUnit', iid: unit.iid, lane: 'ground1' });
    const played = res.state.players[0].lanes.ground1.front!;
    expect(played.attack).toBe(Math.max(0, printed - 2));
    expect(played.attack).toBeGreaterThanOrEqual(0);
  });
});

describe('recursion: the Death Artificer', () => {
  it('raises a dead unit under her control, exactly once', () => {
    const s = fresh();
    s.bossRules = { recursion: 1 };
    s.players[0].lanes.ground1.front = {
      iid: 'doomed', cardId: 'coal-runner', owner: 0, attack: 2, hp: 0, maxHp: 2,
      keywords: {}, status: {}, turnsInPlay: 1, justPlaced: false,
    };
    processDeaths(s, [], undefined, base);
    expect(s.players[0].lanes.ground1.front).toBeUndefined();
    const risen = LANES.map((l) => s.players[1].lanes[l].front).find((u) => u?.cardId === 'coal-runner');
    expect(risen).toBeTruthy();
    expect(risen!.owner).toBe(1);
    expect(risen!.raised).toBe(true);

    // Kill the risen copy: it stays dead. Without this bound, death and rebirth loop
    // forever inside a single `processDeaths` fixpoint pass.
    risen!.hp = 0;
    processDeaths(s, [], undefined, base);
    const again = LANES.map((l) => s.players[1].lanes[l].front).filter((u) => u?.cardId === 'coal-runner');
    expect(again).toHaveLength(0);
  });

  it('does nothing when the raising side has no room', () => {
    const s = fresh();
    s.bossRules = { recursion: 1 };
    for (const lane of LANES) {
      s.players[1].lanes[lane].front = {
        iid: `f${lane}`, cardId: 'coal-runner', owner: 1, attack: 1, hp: 1, maxHp: 1,
        keywords: {}, status: {}, turnsInPlay: 1, justPlaced: false,
      };
    }
    s.players[0].lanes.ground1.front = {
      iid: 'doomed', cardId: 'magma-brute', owner: 0, attack: 2, hp: 0, maxHp: 2,
      keywords: {}, status: {}, turnsInPlay: 1, justPlaced: false,
    };
    processDeaths(s, [], undefined, base);
    expect(LANES.every((l) => s.players[1].lanes[l].front?.cardId === 'coal-runner')).toBe(true);
  });
});

describe('execute: the King\'s Personal Executioner', () => {
  it('kills the most EXPENSIVE unit, not the biggest, and ignores the leader-unit', () => {
    const s = fresh();
    s.bossRules = { execute: 0 };
    const cheap = 'coal-runner';
    const dear = [...base.cards.values()].filter((c) => c.type === 'unit' && !c.wip)
      .sort((a, b) => b.cost.energy - a.cost.energy)[0]!;
    s.players[0].lanes.ground1.front = {
      iid: 'cheap', cardId: cheap, owner: 0, attack: 9, hp: 9, maxHp: 9,
      keywords: {}, status: {}, turnsInPlay: 1, justPlaced: false,
    };
    s.players[0].lanes.ground2.front = {
      iid: 'dear', cardId: dear.id, owner: 0, attack: 1, hp: 1, maxHp: 1,
      keywords: {}, status: {}, turnsInPlay: 1, justPlaced: false,
    };
    resolveExecute(base, s, 0, []);
    // The 9/9 survives; the expensive 1/1 does not. Cost, not stats — so the rule reads as
    // "your best card" rather than "whatever happens to be biggest right now".
    expect(s.players[0].lanes.ground2.front!.hp).toBe(0);
    expect(s.players[0].lanes.ground1.front!.hp).toBe(9);
  });

  it('only ever fires on the named seat', () => {
    const s = fresh();
    s.bossRules = { execute: 0 };
    s.players[1].lanes.ground1.front = {
      iid: 'safe', cardId: 'coal-runner', owner: 1, attack: 2, hp: 2, maxHp: 2,
      keywords: {}, status: {}, turnsInPlay: 1, justPlaced: false,
    };
    resolveExecute(base, s, 1 as PlayerId, []);
    expect(s.players[1].lanes.ground1.front!.hp).toBe(2);
  });
});

describe('battleReady: the answer the Hydra owes you', () => {
  it('grants Battle Ready to every unit and foundation, on BOTH sides', () => {
    // A recurring board-filling placement is only a fair rule if the board you play in
    // answer can ACT. Without this, clearing five prophets meant playing units on the odd
    // round and killing them on the even one — by which time the prophets had already
    // resolved and been replaced, so the rule could not be answered at all, only endured.
    const reg = buildRunRegistry(base, { deck: [], bossRules: { battleReady: true } });
    for (const card of reg.cards.values()) {
      if (card.type !== 'unit' && card.type !== 'foundation') continue;
      expect(card.keywords.battleReady, card.id).toBeTruthy();
    }
  });

  it('reaches the player\'s ENHANCED copies too', () => {
    // The registry rewrite runs before the `adv:` defs are cloned, so a God Unit under the
    // Hydra is Battle Ready like everything else rather than being the one body that isn't.
    const reg = buildRunRegistry(base, {
      deck: [{ uid: 'g0', cardId: 'coal-runner', enhancements: [{ kind: 'stat', attack: 9, hp: 9 }] }],
      bossRules: { battleReady: true },
    });
    const god = reg.cards.get(advCardId('g0'))!;
    expect(god.type === 'unit' && god.keywords.battleReady).toBeTruthy();
  });

  it('is absent unless the rule asks for it', () => {
    const reg = buildRunRegistry(base, { deck: [] });
    const plain = reg.cards.get('coal-runner')!;
    expect(plain.type === 'unit' && plain.keywords.battleReady).toBeFalsy();
  });
});

describe("cauldron: Kedou answers her own archetype's counters", () => {
  const withImmunity = (): GameState => {
    const s = fresh();
    s.players[0].lanes.ground1.front = {
      iid: 'imm', cardId: 'coal-runner', owner: 0, attack: 2, hp: 6, maxHp: 6,
      keywords: { immunity: true }, status: {}, turnsInPlay: 1, justPlaced: false,
    };
    return s;
  };

  it('Immunity does not block Burn/Poison landing on the Cauldron side', () => {
    const s = withImmunity();
    s.bossRules = { cauldron: 0 };
    const u = s.players[0].lanes.ground1.front!;
    applyStatus(u, 'poison', { poison: 1 }, []);
    expect(u.status.poisoned).toBe(1);
    applyStatus(u, 'burn', { burn: 2 }, []);
    expect(u.status.burn).toBe(2);
  });

  it('Burn never expires on the Cauldron side, and does on every other side', () => {
    const s = fresh();
    s.bossRules = { cauldron: 0 };
    s.players[0].lanes.ground1.front = {
      iid: 'a', cardId: 'coal-runner', owner: 0, attack: 2, hp: 6, maxHp: 6,
      keywords: {}, status: { burn: 3 }, turnsInPlay: 1, justPlaced: false,
    };
    s.players[1].lanes.ground1.front = {
      iid: 'b', cardId: 'coal-runner', owner: 1, attack: 2, hp: 6, maxHp: 6,
      keywords: {}, status: { burn: 3 }, turnsInPlay: 1, justPlaced: false,
    };
    resolveEndOfTurn(s, 0, []);
    expect(s.players[0].lanes.ground1.front!.status.burn).toBe(3);
    resolveEndOfTurn(s, 1, []);
    expect(s.players[1].lanes.ground1.front!.status.burn).toBeUndefined();
  });

  it('cannot be cleansed on the Cauldron side; cleanses normally otherwise', () => {
    const cauldron = withImmunity();
    cauldron.bossRules = { cauldron: 0 };
    const u = cauldron.players[0].lanes.ground1.front!;
    u.status = { burn: 2, poisoned: 3, sleep: 1 };
    const keep = cauldron.bossRules.cauldron === u.owner ? (['burn', 'poison'] as const) : [];
    clearCleansableStatuses(u, keep);
    expect(u.status.burn).toBe(2);
    expect(u.status.poisoned).toBe(3);
    expect(u.status.sleep).toBeUndefined();

    const v = { ...u, iid: 'v' };
    clearCleansableStatuses(v, []);
    expect(v.status.burn).toBeUndefined();
    expect(v.status.poisoned).toBeUndefined();
  });
});

describe('disciplined: Aleph generalises her own hero power', () => {
  it('blocks a GAIN from buffUnit but still allows a LOSS (a debuff)', () => {
    const u: UnitInstance = {
      iid: 'x', cardId: 'coal-runner', owner: 0, attack: 3, hp: 5, maxHp: 5,
      keywords: {}, status: {}, turnsInPlay: 1, justPlaced: false,
    };
    expect(buffUnit(u, { attack: 2, hp: 2 }, [], true)).toBe(false);
    expect(u.attack).toBe(3);
    expect(buffUnit(u, { attack: -1 }, [], true)).toBe(true);
    expect(u.attack).toBe(2);
  });

  it('blocks healUnit for the disciplined side only', () => {
    const u: UnitInstance = {
      iid: 'y', cardId: 'coal-runner', owner: 0, attack: 2, hp: 2, maxHp: 6,
      keywords: {}, status: {}, turnsInPlay: 1, justPlaced: false,
    };
    expect(healUnit(u, 3, [], true)).toBe(false);
    expect(u.hp).toBe(2);
    expect(healUnit(u, 3, [], false)).toBe(true);
    expect(u.hp).toBe(5);
  });

  it('reaches Growth through the normal end-of-turn path', () => {
    const s = fresh();
    s.bossRules = { disciplined: 0 };
    s.players[0].lanes.ground1.front = {
      iid: 'g', cardId: 'coal-runner', owner: 0, attack: 1, hp: 1, maxHp: 1,
      keywords: { growth: { attack: 1, hp: 1 } }, status: {}, turnsInPlay: 1, justPlaced: false,
    };
    resolveEndOfTurn(s, 0, []);
    expect(s.players[0].lanes.ground1.front!.attack).toBe(1);
  });
});

describe('doubleCombat: Charge', () => {
  it("the Charge side's units attack twice in one Declare Attack step", () => {
    const s = fresh();
    s.bossRules = { doubleCombat: 0 };
    s.active = 0;
    s.players[0].lanes.ground1.front = {
      iid: 'atk', cardId: 'coal-runner', owner: 0, attack: 3, hp: 5, maxHp: 5,
      keywords: {}, status: {}, turnsInPlay: 2, justPlaced: false,
    };
    s.players[1].leaderHp = 30;
    const res = resolveCombat(s, undefined, base);
    expect(res.state.players[1].leaderHp).toBe(30 - 3 - 3);
  });

  it('a side WITHOUT the rule attacks once, as normal', () => {
    const s = fresh();
    s.active = 0;
    s.players[0].lanes.ground1.front = {
      iid: 'atk', cardId: 'coal-runner', owner: 0, attack: 3, hp: 5, maxHp: 5,
      keywords: {}, status: {}, turnsInPlay: 2, justPlaced: false,
    };
    s.players[1].leaderHp = 30;
    const res = resolveCombat(s, undefined, base);
    expect(res.state.players[1].leaderHp).toBe(27);
  });

  it('only fires for the named side, never the opponent', () => {
    const s = fresh();
    s.bossRules = { doubleCombat: 1 };
    s.active = 0;
    s.players[0].lanes.ground1.front = {
      iid: 'atk', cardId: 'coal-runner', owner: 0, attack: 3, hp: 5, maxHp: 5,
      keywords: {}, status: {}, turnsInPlay: 2, justPlaced: false,
    };
    s.players[1].leaderHp = 30;
    const res = resolveCombat(s, undefined, base);
    expect(res.state.players[1].leaderHp).toBe(27);
  });
});

describe('feedOnPlay: Metastasis', () => {
  it("playing a unit hands energy to the OTHER side's next turn", () => {
    const s = fresh();
    s.bossRules = { feedOnPlay: { player: 0, energy: 1 } };
    s.active = 0;
    s.players[0].energy = 99;
    const unit = s.players[0].hand.find((c) => base.cards.get(c.cardId)!.type === 'unit')!;
    const res = applyAction(base, s, { type: 'playUnit', iid: unit.iid, lane: 'ground1' });
    expect(res.state.players[1].energyNext).toBe(1);
    expect(res.state.players[0].energyNext ?? 0).toBe(0);
  });

  it('stacks across multiple plays in the same turn', () => {
    const s = fresh();
    s.bossRules = { feedOnPlay: { player: 0, energy: 1 } };
    s.active = 0;
    s.players[0].energy = 99;
    let cur = s;
    const units = cur.players[0].hand.filter((c) => base.cards.get(c.cardId)!.type === 'unit').slice(0, 2);
    for (const [i, u] of units.entries()) {
      const res = applyAction(base, cur, { type: 'playUnit', iid: u.iid, lane: i === 0 ? 'ground1' : 'ground2' });
      cur = res.state;
    }
    expect(cur.players[1].energyNext).toBe(units.length);
  });
});

describe('steal: Behind the Mask', () => {
  it("takes the single most expensive hand card into the other side's hand", () => {
    const s = fresh();
    s.bossRules = { steal: 0 };
    const costOf = (cardId: string): number => {
      const d = base.cards.get(cardId)!;
      return d.cost.energy + (d.cost.elements ?? []).reduce((n, e) => n + e.amount, 0);
    };
    const before = [...s.players[0].hand];
    const events: GameEvent[] = [];
    resolveSteal(base, s, 0, events);
    expect(s.players[0].hand.length).toBe(before.length - 1);
    const takenId = before.find((c) => !s.players[0].hand.some((h) => h.iid === c.iid))!.cardId;
    expect(costOf(takenId)).toBe(Math.max(...before.map((c) => costOf(c.cardId))));
    expect(s.players[1].hand.some((c) => c.cardId === takenId)).toBe(true);
    expect(events.some((e) => e.t === 'stolen')).toBe(true);
  });

  it('only fires on the named seat, and no-ops on an empty hand', () => {
    const s = fresh();
    s.bossRules = { steal: 0 };
    const before1 = s.players[1].hand.length;
    resolveSteal(base, s, 1, []);
    expect(s.players[1].hand.length).toBe(before1);

    s.players[0].hand = [];
    resolveSteal(base, s, 0, []);
    expect(s.players[0].hand).toEqual([]);
  });
});
