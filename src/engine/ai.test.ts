import { LANES } from '@engine/constants';
import { describe, expect, it } from 'vitest';
import { chooseAction, endTurnChoices, greedyAction, planTurn } from '@engine/ai';
import { applyAction } from '@engine/engine';
import { initGame } from '@engine/setup';
import { blankState, makeDeck, place, tenVanilla, testRegistry, unit } from '@engine/testkit';
import type { GameState } from '@engine/types';

/** Active player (0) with energy and a hand of the given card ids. */
const withHand = (energy: number, cardIds: string[]): GameState => {
  const s = blankState();
  s.players[0].energy = energy;
  s.players[0].hand = cardIds.map((cardId, i) => ({ iid: `h${i}`, cardId }));
  // Both players need SOMETHING to draw. `blankState` decks are empty, so without this every
  // projected draw in the AI's look-ahead is a deck-out Null and the search is really reasoning
  // about a deck-out spiral rather than about the board question each test is asking.
  for (const p of [0, 1] as const) {
    s.players[p].deck = Array.from({ length: 8 }, (_, i) => ({ iid: `d${p}${i}`, cardId: 'v1' }));
  }
  return s;
};

describe('chooseAction — board development', () => {
  it('plays a sticky body onto a non-Water lane when the board is empty', () => {
    // v1 is a 2/2 — it survives the opponent's 1-damage Spark, so developing it is
    // unambiguously right even with the search anticipating the reply.
    const action = chooseAction(testRegistry, withHand(1, ['v1']));
    expect(action.type).toBe('playUnit');
    if (action.type === 'playUnit') expect(action.lane).not.toBe('water');
  });

  it('ends the turn rather than drowning its own non-aquatic unit', () => {
    const s = withHand(1, ['v0']);
    s.players[0].heroPowerUsed = true; // no free face-ping available, so the only plays are drown-or-pass
    // Fill every non-Water lane so the only open slot is Water (where a vanilla would drown).
    for (const lane of LANES.filter((l) => l !== 'water')) place(s, 0, lane, unit({ owner: 0 }));
    expect(chooseAction(testRegistry, s).type).toBe('endTurn');
  });
});

describe('chooseAction — removal & lethal', () => {
  it('spends removal to kill a threatening enemy unit', () => {
    const s = withHand(1, ['firebolt']); // 3 damage to an enemy
    const enemy = unit({ owner: 1, attack: 5, hp: 2 });
    place(s, 1, 'ground1', enemy);
    const action = chooseAction(testRegistry, s);
    expect(action.type).toBe('playSpell');
    if (action.type === 'playSpell') expect(action.targets?.[0]).toEqual({ kind: 'unit', iid: enemy.iid });
  });

  it('takes lethal on the enemy leader over a chip kill', () => {
    const s = withHand(1, ['firebolt']);
    s.players[1].leaderHp = 2; // firebolt (3) is lethal to the face
    place(s, 1, 'ground1', unit({ owner: 1, attack: 1, hp: 1 }));
    const action = chooseAction(testRegistry, s);
    expect(action.type).toBe('playSpell');
    if (action.type === 'playSpell') expect(action.targets?.[0]).toEqual({ kind: 'leader', player: 1 });
  });
});

describe('chooseAction — defensive play', () => {
  /** P0 to act mid-game (not the round-1 first player), facing an unblocked enemy attacker. */
  const underThreat = (leaderHp: number, energy: number, hand: string[]): GameState => {
    const s = blankState();
    s.first = 1; // P0 is the second player, so its combat (and the opponent's reply) are live
    s.round = 3;
    s.players[0].leaderHp = leaderHp;
    s.players[0].energy = energy;
    s.players[0].hand = hand.map((cardId, i) => ({ iid: `h${i}`, cardId }));
    return s;
  };

  it('uses a control spell to neutralise a threat when it has no blocker', () => {
    // A pure-control hand (only Lull = Hypnotic Patterns) vs a big attacker: the AI should
    // sleep the threat to prevent the incoming damage rather than just pass.
    const s = underThreat(16, 4, ['lull', 'lull']);
    const threat = unit({ owner: 1, attack: 6, hp: 6 });
    place(s, 1, 'ground1', threat);
    const action = chooseAction(testRegistry, s);
    expect(action.type).toBe('playSpell');
    if (action.type === 'playSpell') expect(action.targets?.[0]).toEqual({ kind: 'unit', iid: threat.iid });
  });

  it('blocks an incoming attacker by developing a body in its lane', () => {
    // Given a body instead of removal, the AI should develop it INTO the threatened lane
    // (blocking) rather than parking it elsewhere and taking the hit to the face.
    const s = underThreat(10, 2, ['v2']); // v2 is a 3/3
    place(s, 1, 'ground2', unit({ owner: 1, attack: 4, hp: 4 }));
    const action = chooseAction(testRegistry, s);
    expect(action.type).toBe('playUnit');
    if (action.type === 'playUnit') expect(action.lane).toBe('ground2'); // same lane as the threat
  });
});

describe('chooseAction — lethal', () => {
  it('assembles a multi-resource kill (spell + hero power + combat) over a positional play', () => {
    // Opp at 6. P0 has a ready 2/2 (2 combat), Firebolt (3) and the Spark hero power (1):
    // 3 + 1 + 2 = exactly lethal, but only if all three are spent at the enemy leader.
    const s = blankState({ round: 3 });
    s.players[1].leaderHp = 6;
    s.players[0].energy = 2; // affords Firebolt (1) + Spark (1)
    s.players[0].hand = [{ iid: 'h0', cardId: 'firebolt' }];
    place(s, 0, 'ground1', unit({ owner: 0, attack: 2, hp: 2 }));

    let working: GameState = s;
    for (const a of planTurn(testRegistry, s)) working = applyAction(testRegistry, working, a).state;
    expect(working.phase).toBe('ended');
    expect(working.winner).toBe(0);
  });
});

describe('chooseAction — engine valuation', () => {
  it('removes a Producer over an equal-statline vanilla (the recurring engine is worth more)', () => {
    const s = blankState({ round: 3 });
    s.players[0].energy = 1;
<<<<<<< Updated upstream
    s.players[0].hand = [{ iid: 'h0', cardId: 'firebolt' }]; // 3 damage — kills either 0/3 body
    const producer = unit({ owner: 1, attack: 0, hp: 3, cardId: 'kiln', keywords: { producer: { amount: 1, element: 'fire' } } });
    const vanilla = unit({ owner: 1, attack: 0, hp: 3 });
=======
    // The hero power competes for the same single energy, and which of the two opens the turn
    // is a different question from the one under test. Disable it so this measures ONLY the
    // removal's choice of target (same idiom as the drowning test above).
    s.players[0].heroPowerUsed = true;
    s.players[0].hand = [{ iid: 'h0', cardId: 'firebolt' }]; // 3 damage — kills either 3/3 body
    // Both bodies ATTACK, so casting now is clearly right and the only open question is which
    // one to hit — the comparison this test exists to make. With two 0/3 walls and a real deck
    // to draw from, the search correctly prefers to hold the removal for a future threat, and
    // the test could never reach its actual assertion.
    const producer = unit({ owner: 1, attack: 3, hp: 3, cardId: 'kiln', keywords: { producer: { amount: 1 } } });
    const vanilla = unit({ owner: 1, attack: 3, hp: 3 });
>>>>>>> Stashed changes
    place(s, 1, 'ground1', producer);
    place(s, 1, 'ground2', vanilla);
    const action = chooseAction(testRegistry, s);
    expect(action.type).toBe('playSpell');
    if (action.type === 'playSpell') expect(action.targets?.[0]).toEqual({ kind: 'unit', iid: producer.iid });
  });

  it('removes a Metamorphosis unit over an equal-statline vanilla (it is about to become a Dragon)', () => {
    const s = blankState({ round: 3 });
    s.players[0].energy = 1;
    s.players[0].hand = [{ iid: 'h0', cardId: 'firebolt' }];
    const larva = unit({ owner: 1, attack: 1, hp: 2, cardId: 'larva', keywords: { metamorphosis: { everyTurns: 1, into: 'dragon' } } });
    const vanilla = unit({ owner: 1, attack: 1, hp: 2 });
    place(s, 1, 'ground1', larva);
    place(s, 1, 'ground2', vanilla);
    const action = chooseAction(testRegistry, s);
    expect(action.type).toBe('playSpell');
    if (action.type === 'playSpell') expect(action.targets?.[0]).toEqual({ kind: 'unit', iid: larva.iid });
  });
});

describe('chooseAction — combat-keyword valuation', () => {
  // Firebolt (3) kills either 1/3 body. The AI should spend it on the unit whose keyword makes
  // it the bigger threat, not the bare vanilla. Each keyword here has no removal backfire and
  // leaves the projected reply ~symmetric, so the choice is driven by the static keyword value.
  const cases: Array<[string, ReturnType<typeof unit>]> = [
    ['Double Strike', unit({ owner: 1, attack: 1, hp: 3, keywords: { doubleStrike: true } })],
    ['Bloodlust', unit({ owner: 1, attack: 1, hp: 3, keywords: { bloodlust: { buff: { attack: 1, hp: 1 } } } })],
    ['on-hit freeze', unit({ owner: 1, attack: 1, hp: 3, onHit: { freeze: true } })],
  ];
  it.each(cases)('removes a %s unit over an equal-stat vanilla', (_name, special) => {
    const s = blankState({ round: 3 });
    s.players[0].energy = 1;
    s.players[0].hand = [{ iid: 'h0', cardId: 'firebolt' }];
    const vanilla = unit({ owner: 1, attack: 1, hp: 3 });
    place(s, 1, 'ground1', special);
    place(s, 1, 'ground2', vanilla);
    const action = chooseAction(testRegistry, s);
    expect(action.type).toBe('playSpell');
    if (action.type === 'playSpell') expect(action.targets?.[0]).toEqual({ kind: 'unit', iid: special.iid });
  });
});

describe('chooseAction — pending move/expel', () => {
  it('resolves a queued enemy move by drowning the threat in Water', () => {
    const s = blankState();
    const enemy = unit({ owner: 1, attack: 4, hp: 3 });
    place(s, 1, 'ground1', enemy);
    s.pending = [{ player: 0, sourceIid: 'src', kind: 'move', scope: 'enemy' }];
    const action = chooseAction(testRegistry, s);
    expect(action.type).toBe('resolvePending');
    if (action.type === 'resolvePending') {
      expect(action.targetIid).toBe(enemy.iid);
      expect(action.toLane).toBe('water');
    }
  });

  it('skips a pending choice with no good target', () => {
    const s = blankState(); // no enemy units to act on
    s.pending = [{ player: 0, sourceIid: 'src', kind: 'expel', scope: 'enemy' }];
    const action = chooseAction(testRegistry, s);
    expect(action.type).toBe('resolvePending');
    if (action.type === 'resolvePending') expect(action.targetIid).toBeUndefined();
  });
});

describe('endTurnChoices', () => {
  it('banks leftover energy toward an element the hand demands', () => {
    const s = withHand(3, ['titan']); // Titan needs 2 banked fire
    const { bank } = endTurnChoices(testRegistry, s);
    expect(bank?.fire).toBe(2);
    const total = Object.values(bank ?? {}).reduce((a, b) => a + b, 0);
    expect(total).toBeLessThanOrEqual(3); // never banks more than leftover energy
  });

  it('pre-banks toward an element the deck (not yet the hand) will demand', () => {
    // Hand is empty, but a Titan sits in the deck needing 2 banked fire. With spare energy and
    // nothing to spend it on, the AI should bank toward fire rather than waste it.
    const s = blankState();
    s.players[0].energy = 1;
    s.players[0].hand = [];
    s.players[0].deck = [{ iid: 'd0', cardId: 'titan' }];
    const { bank } = endTurnChoices(testRegistry, s);
    expect(bank?.fire).toBe(1);
  });

  it('aims a sniper at a lane it can kill into', () => {
    const s = blankState();
    place(s, 0, 'heights', unit({ owner: 0, attack: 3, keywords: { sniper: true } }));
    place(s, 1, 'ground1', unit({ owner: 1, attack: 1, hp: 2 })); // killable by 3 attack
    place(s, 1, 'water', unit({ owner: 1, attack: 6, hp: 5, keywords: { aquatic: true } })); // too tough
    const sniperIid = s.players[0].lanes.heights.front!.iid;
    const { sniperChoices } = endTurnChoices(testRegistry, s);
    expect(sniperChoices?.[sniperIid]).toBe('ground1');
  });
});

describe('planTurn', () => {
  it('produces a sequence that ends in endTurn and applies without error', () => {
    const s = withHand(3, ['v0', 'v1', 'firebolt']);
    place(s, 1, 'ground1', unit({ owner: 1, attack: 2, hp: 3 }));

    const actions = planTurn(testRegistry, s);
    expect(actions.at(-1)?.type).toBe('endTurn');

    let working = s;
    for (const a of actions) {
      const { state, events } = applyAction(testRegistry, working, a);
      expect(events.some((e) => e.t === 'error'), `errored on ${JSON.stringify(a)}`).toBe(false);
      working = state;
    }
  });
});

describe('search strength', () => {
  // A deck with real decisions (removal, buffs, heals, freeze, sacrifice) so look-ahead matters.
  const richIds = ['v1', 'v2', 'twins', 'reaper', 'medic', 'icebreaker', 'firebolt', 'mend', 'rally', 'sleeper'];

  const playGame = (seed: number, searchSide: 0 | 1): number | null => {
    const deck = makeDeck(richIds);
    let game = initGame({ registry: testRegistry, decks: [deck, makeDeck(richIds)], seed });
    let guard = 0;
    while (game.phase !== 'ended' && guard < 3000) {
      const act = game.active === searchSide ? chooseAction(testRegistry, game) : greedyAction(testRegistry, game);
      game = applyAction(testRegistry, game, act).state;
      guard += 1;
    }
    return game.winner;
  };

  it('the 2-ply search does not lose a mini-match to the greedy policy', () => {
    const t0 = Date.now();
    let searchWins = 0;
    let greedyWins = 0;
    const seeds = [1, 2, 3, 4];
    for (const seed of seeds) {
      const searchSide: 0 | 1 = (seed % 2) as 0 | 1; // alternate sides to cancel first-player bias
      const winner = playGame(seed, searchSide);
      if (winner === searchSide) searchWins += 1;
      else if (winner !== null) greedyWins += 1;
    }
    // eslint-disable-next-line no-console
    console.log(`[search strength] search ${searchWins} – ${greedyWins} greedy over ${seeds.length} games in ${Date.now() - t0}ms`);
    expect(searchWins).toBeGreaterThanOrEqual(greedyWins);
  }, 60000);
});

describe('self-play (AI vs AI)', () => {
  it('drives a full game to a winner with no illegal action or stall', () => {
    // Uses the fast greedy policy so a whole game runs quickly (the search is exercised separately).
    let game = initGame({
      registry: testRegistry,
      decks: [makeDeck(tenVanilla), makeDeck(tenVanilla)],
      seed: 7,
    });
    let guard = 0;
    while (game.phase !== 'ended' && guard < 4000) {
      const action = greedyAction(testRegistry, game);
      const { state, events } = applyAction(testRegistry, game, action);
      expect(events.some((e) => e.t === 'error'), `errored on ${JSON.stringify(action)}`).toBe(false);
      game = state;
      guard += 1;
    }
    expect(game.phase).toBe('ended');
    expect(game.winner).not.toBeNull();
  });
});
