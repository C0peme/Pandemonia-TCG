import { describe, expect, it } from 'vitest';
import { buildRegistry } from '@cards/registry';
import { starterCards, starterLeaders } from '@cards/data/starter';
import {
  startRun, pickNode, resolveCombat, pickRelic, pickRewardCard, skipRewardCard, leaveNode,
  buyCard, sellCard, applyEnhancement, enhanceAttune, restHeal, restCardOffer, restTakeCard, restKindle, claimUnlock, chooseEventOption, reachableNodeIds,
} from '@adventure/run';
import { parseRun, type MapNode, type RunState } from '@adventure/schema';
import { rollStoreOffer, buyPrice, combatReward, attuneCost, restHealAmount, kindleHealAmount, ECON } from '@adventure/economy';
import { rollEnhanceOffer, canApply } from '@adventure/enhance';
import { eventForNode } from '@adventure/data/events';
import { SIGNATURE_UPGRADES } from '@adventure/hero';
import { ADVENTURE_STARTERS } from '@adventure/data/starters';

const registry = buildRegistry(starterCards, starterLeaders);

/**
 * Run `fn` with a stub signature upgrade authored for `leaderId`, restoring whatever was
 * there before. Every shipped leader now HAS a real buff, so the stub keeps this test
 * asserting the unlock gate rather than the content of one particular entry — and the
 * restore matters: an unconditional `delete` here would strip that leader's real buff for
 * every test that ran afterwards.
 */
const withSignatureUpgrade = (leaderId: string, fn: () => void): void => {
  const prev = SIGNATURE_UPGRADES[leaderId];
  SIGNATURE_UPGRADES[leaderId] = { name: 'Test Buff', icon: '★', desc: 'test', card: (c) => c };
  try {
    fn();
  } finally {
    if (prev) SIGNATURE_UPGRADES[leaderId] = prev;
    else delete SIGNATURE_UPGRADES[leaderId];
  }
};

/**
 * The mirror image: run `fn` with NO signature upgrade authored for `leaderId`. All 13
 * shipped leaders have one, so this is how the "leader with no authored buff" branch —
 * still live for a custom or future leader — stays covered.
 */
const withoutSignatureUpgrade = (leaderId: string, fn: () => void): void => {
  const prev = SIGNATURE_UPGRADES[leaderId];
  delete SIGNATURE_UPGRADES[leaderId];
  try {
    fn();
  } finally {
    if (prev) SIGNATURE_UPGRADES[leaderId] = prev;
  }
};

/** Inject a fresh entry node of the given kind and travel to it (test-only surgery). */
const teleportTo = (run: RunState, kind: MapNode['kind'], extra: Partial<MapNode> = {}): RunState => {
  const next = structuredClone(run);
  const id = `inj-${kind}`;
  const injected: MapNode = { id, kind, layer: 0, col: 99, next: [], seed: 4242, visited: false, ...extra };
  next.map.nodes[id] = injected;
  next.map.layers[0] = [...next.map.layers[0]!, id];
  return pickNode(next, id);
};

describe('run reducer', () => {
  it('starts a run with the starter deck, coins, and a map', () => {
    const run = startRun('orsyric', 42);
    expect(run.act).toBe(1);
    expect(run.coins).toBe(ECON.STARTING_COINS);
    expect(run.deck.length).toBe(ADVENTURE_STARTERS['orsyric']!.length);
    expect(run.relics).toEqual([]);
    expect(run.phase).toEqual({ t: 'map' });
    expect(reachableNodeIds(run)).toEqual(run.map.layers[0]);
  });

  it('rejects picking an unreachable node', () => {
    const run = startRun('orsyric', 42);
    const far = run.map.bossId;
    expect(pickNode(run, far)).toBe(run);
  });

  it('combat: win pays coins and returns to the map; loss ends the run', () => {
    const run = startRun('orsyric', 42);
    const first = reachableNodeIds(run)[0]!;
    const inFight = pickNode(run, first);
    expect(inFight.phase.t).toBe('combat');
    expect(inFight.currentNodeId).toBe(first);

    const lost = resolveCombat(inFight, registry, false);
    expect(lost.phase).toEqual({ t: 'dead', act: 1, nodeId: first });

    const won = resolveCombat(inFight, registry, true);
    expect(won.coins).toBe(run.coins + combatReward('combat', 0, 1));
    expect(won.phase.t).toBe('reward');
    // Reward now offers a 1-of-3 card choice (no auto-add) that gates Continue.
    if (won.phase.t !== 'reward') throw new Error('expected reward');
    expect(won.phase.cardChoices?.length).toBe(3);
    for (const id of won.phase.cardChoices!) expect(registry.cards.has(id)).toBe(true);
    expect(leaveNode(won)).toBe(won); // gated until the card choice is resolved

    // Picking adds exactly that card.
    const chosen = won.phase.cardChoices![0]!;
    const picked = pickRewardCard(won, chosen);
    expect(picked.deck.length).toBe(run.deck.length + 1);
    expect(picked.deck[picked.deck.length - 1]!.cardId).toBe(chosen);

    const back = leaveNode(picked);
    expect(back.phase).toEqual({ t: 'map' });
    expect(back.map.nodes[first]!.visited).toBe(true);
    // Now only the fought node's successors are reachable.
    expect(reachableNodeIds(back)).toEqual(back.map.nodes[first]!.next);
  });

  it('reward card can be skipped to keep the deck lean', () => {
    const run = startRun('orsyric', 42);
    const first = reachableNodeIds(run)[0]!;
    const won = resolveCombat(pickNode(run, first), registry, true);
    const skipped = skipRewardCard(won);
    expect(skipped.deck.length).toBe(run.deck.length); // no card added
    expect(skipped.phase.t === 'reward' && skipped.phase.cardChoices).toBeUndefined();
    expect(leaveNode(skipped).phase).toEqual({ t: 'map' });
  });

  it('store: buys once per slot, sells once per visit, never sells the last card', () => {
    let run = teleportTo(startRun('orsyric', 42), 'store');
    expect(run.phase.t).toBe('store');
    const nodeId = (run.phase as { nodeId: string }).nodeId;
    const at = run.map.nodes[nodeId]!;
    const leader = registry.leaders.get('orsyric')!;
    const offer = rollStoreOffer(registry, at.seed, leader.element);
    // Pick the first slot the starting purse can actually afford. The offer is rolled from the
    // whole card pool, so WHICH slot is affordable shifts every time a card is added to the
    // game — hardcoding slot 0 made this test fail for an unrelated reason. The rule under test
    // is one-buy-per-slot; refusing an unaffordable card is correct behaviour, tested elsewhere.
    const slot = offer.findIndex((id) => buyPrice(registry.cards.get(id)!, leader.element) <= run.coins);
    expect(slot).toBeGreaterThanOrEqual(0);
    const price = buyPrice(registry.cards.get(offer[slot]!)!, leader.element);

    const deckBefore = run.deck.length;
    run = buyCard(run, registry, slot);
    expect(run.deck.length).toBe(deckBefore + 1);
    expect(run.coins).toBe(ECON.STARTING_COINS - price);
    // Same slot can't be bought twice.
    expect(buyCard(run, registry, slot)).toBe(run);

    const sold = sellCard(run, registry, run.deck[0]!.uid);
    expect(sold.deck.length).toBe(run.deck.length - 1);
    expect(sold.coins).toBeGreaterThan(run.coins);
    // Only one sale per visit.
    expect(sellCard(sold, registry, sold.deck[0]!.uid)).toBe(sold);
  });

  it('enhance: applies the rolled offer to an eligible card once, for coins', () => {
    let run = teleportTo(startRun('orsyric', 4242), 'enhance');
    expect(run.phase.t).toBe('enhance');
    run = { ...run, coins: 500 };
    const nodeId = (run.phase as { nodeId: string }).nodeId;
    const offer = rollEnhanceOffer(run.map.nodes[nodeId]!.seed, run.act);
    const eligible = run.deck.find((c) => canApply(offer, registry.cards.get(c.cardId)!));
    expect(eligible, 'starter deck should have an eligible card').toBeTruthy();

    const after = applyEnhancement(run, registry, eligible!.uid);
    expect(after.coins).toBe(500 - offer.price);
    expect(after.deck.find((c) => c.uid === eligible!.uid)!.enhancements).toEqual([offer.enhancement]);
    // One purchase per visit.
    expect(applyEnhancement(after, registry, eligible!.uid)).toBe(after);
    // Can't afford → rejected.
    expect(applyEnhancement({ ...run, coins: 0 }, registry, eligible!.uid)).toMatchObject({ coins: 0 });
  });

  it('beating the boss starts the next act with deck and coins preserved', () => {
    let run = startRun('orsyric', 7);
    // Teleport to the boss: make it reachable from the current (null) position.
    run = { ...run, map: structuredClone(run.map) };
    run.map.layers[0]!.push(run.map.bossId);
    run.map.nodes[run.map.bossId]!.layer = 0;
    run = pickNode(run, run.map.bossId);
    expect(run.phase.t).toBe('combat');
    const won = resolveCombat(run, registry, true);
    expect(won.coins).toBe(ECON.STARTING_COINS + ECON.BOSS_BASE);
    // Boss wins offer both a card choice and a relic choice, each gating Continue.
    if (won.phase.t !== 'reward') throw new Error('expected reward');
    expect(won.phase.cardChoices?.length).toBe(3);
    expect(won.phase.relicChoices?.length).toBe(3);
    expect(won.phase.unlock).toBe('unique'); // act 1 boss also awards the leader unique
    expect(leaveNode(won)).toBe(won); // gated until all three are resolved
    const card = pickRewardCard(won, won.phase.cardChoices![0]!);
    expect(leaveNode(card)).toBe(card); // relic + unlock still pending
    if (card.phase.t !== 'reward') throw new Error('expected reward');
    const picked = pickRelic(card, card.phase.relicChoices![0]!);
    expect(picked.relics.length).toBe(1);
    expect(leaveNode(picked)).toBe(picked); // unlock still pending
    const claimed = claimUnlock(picked);
    expect(claimed.heroUpgrades).toEqual([{ kind: 'unique' }]);
    const act2 = leaveNode(claimed);
    expect(act2.act).toBe(2);
    expect(act2.currentNodeId).toBeNull();
    expect(act2.phase).toEqual({ t: 'map' });
    expect(act2.deck.length).toBe(ADVENTURE_STARTERS['orsyric']!.length + 1); // starter + the chosen boss reward card
    expect(act2.relics.length).toBe(1);
    expect(act2.map.layers.length).toBeGreaterThan(won.map.layers.length - 1);
    expect(act2.map).not.toEqual(won.map);
  });

  it('elite win offers a wider 5-card pick and more coins, but NO relic', () => {
    const run = teleportTo(startRun('orsyric', 42), 'elite', { layer: 3, seed: 555 });
    expect(run.phase.t).toBe('combat');
    const won = resolveCombat(run, registry, true);
    if (won.phase.t !== 'reward') throw new Error('expected reward');
    expect(won.phase.cardChoices?.length).toBe(5); // Elite = 5 instead of 3
    expect(won.phase.relicChoices).toBeUndefined();
    expect(won.phase.coins).toBeGreaterThan(combatReward('combat', 3, 1));
    expect(leaveNode(skipRewardCard(won)).phase).toEqual({ t: 'map' });
  });

  it('trial win offers NO card pick, a relic choice, and 2x coins', () => {
    const run = teleportTo(startRun('orsyric', 42), 'trial', { layer: 3, seed: 555 });
    const won = resolveCombat(run, registry, true);
    if (won.phase.t !== 'reward') throw new Error('expected reward');
    expect(won.phase.cardChoices).toBeUndefined(); // trials give no card
    expect(won.phase.relicChoices?.length).toBe(3);
    expect(won.phase.coins).toBe(combatReward('trial', 3, 1)); // 2x
    expect(leaveNode(won)).toBe(won); // gated until the relic is picked
    const chosen = won.phase.relicChoices![1]!;
    const after = pickRelic(won, chosen);
    expect(after.relics).toContain(chosen);
    expect(after.phase.t === 'reward' && after.phase.relicChoices).toBeUndefined();
    expect(leaveNode(after).phase).toEqual({ t: 'map' });
  });

  it('rest site: take-a-card grants one of the seeded offer, free, one per visit', () => {
    const run = teleportTo({ ...startRun('orsyric', 7), coins: 200 }, 'rest');
    expect(run.phase.t).toBe('rest');
    const offer = restCardOffer(registry, run, 'inj-rest');
    expect(offer.length).toBeGreaterThan(0);
    const before = run.deck.length;
    const taken = restTakeCard(run, registry, offer[0]!);
    expect(taken.deck.length).toBe(before + 1);
    expect(taken.deck.at(-1)!.cardId).toBe(offer[0]);
    expect(taken.coins).toBe(200); // free
    expect(restTakeCard(taken, registry, offer[1]!)).toBe(taken); // one service per visit
    // A card not in the offer is rejected.
    expect(restTakeCard(run, registry, 'not-a-real-card')).toBe(run);
  });

  it('enhance node: attune raises a chosen element cap for scaling coins, repeatable across visits', () => {
    const run = teleportTo({ ...startRun('orsyric', 9), coins: 500 }, 'enhance');
    const once = enhanceAttune(run, 'water');
    expect(once.heroUpgrades).toEqual([{ kind: 'attune', element: 'water' }]);
    expect(once.coins).toBe(500 - attuneCost(0));
    expect(enhanceAttune(once, 'fire')).toBe(once); // one service per visit
    // A second altar can attune again — it never runs out. (Reopen the same node
    // rather than injecting a second one, which would desync the map key from id.)
    const nextAltar = structuredClone(once);
    delete nextAltar.map.nodes['inj-enhance']!.enhanceUsed;
    const twice = enhanceAttune(nextAltar, 'water');
    expect(twice.heroUpgrades).toEqual([
      { kind: 'attune', element: 'water' },
      { kind: 'attune', element: 'water' },
    ]);
    expect(twice.coins).toBe(500 - attuneCost(0) - attuneCost(1));
  });

  it('enhance node: attune competes with the card-buff service for the single visit', () => {
    const run = teleportTo({ ...startRun('orsyric', 4242), coins: 500 }, 'enhance');
    const attuned = enhanceAttune(run, 'fire');
    const eligible = attuned.deck.find((c) => canApply(rollEnhanceOffer(attuned.map.nodes['inj-enhance']!.seed, attuned.act), registry.cards.get(c.cardId)!));
    if (eligible) expect(applyEnhancement(attuned, registry, eligible.uid)).toBe(attuned);
  });

  it('rest site: kindle burns 2 cards for a bigger heal than plain Rest, one per visit', () => {
    const base = { ...startRun('orsyric', 42, registry), hp: 4, coins: 0 };
    const run = teleportTo(base, 'rest');
    const [c1, c2] = run.deck;
    const kindled = restKindle(run, c1!.uid, c2!.uid);
    expect(kindled.deck.length).toBe(run.deck.length - 2);
    expect(kindled.hp - 4).toBe(kindleHealAmount(run.maxHp));
    expect(kindleHealAmount(run.maxHp)).toBeGreaterThan(restHealAmount(run.maxHp));
    expect(kindled.map.nodes['inj-rest']!.restUsed).toBe(true);
    // One service per visit.
    expect(restKindle(kindled, kindled.deck[0]!.uid, kindled.deck[1]!.uid)).toBe(kindled);
  });

  it('kindle is rejected at full HP, with duplicate uids, or with too few cards to spare', () => {
    const wounded = { ...startRun('orsyric', 42, registry), hp: 4, coins: 0 };
    const run = teleportTo(wounded, 'rest');
    // Full HP would waste the burn for nothing.
    const full = teleportTo({ ...startRun('orsyric', 43, registry), coins: 0 }, 'rest');
    expect(restKindle(full, full.deck[0]!.uid, full.deck[1]!.uid)).toBe(full);
    // Same card twice is rejected.
    expect(restKindle(run, run.deck[0]!.uid, run.deck[0]!.uid)).toBe(run);
    // Deck too small to survive the burn (needs >= 3 owned, 1 must remain).
    const thin = { ...run, deck: run.deck.slice(0, 2) };
    expect(restKindle(thin, thin.deck[0]!.uid, thin.deck[1]!.uid)).toBe(thin);
  });

  it('event: coin choices adjust coins; combat choice routes to a fight; one choice per node', () => {
    // Find an event whose first choice is a plain coin gain.
    let run = teleportTo(startRun('orsyric', 7), 'event', { seed: 100 });
    expect(run.phase.t).toBe('event');
    const nodeId = (run.phase as { nodeId: string }).nodeId;
    const event = eventForNode(run.map.nodes[nodeId]!.seed);
    const coinIdx = event.choices.findIndex((c) => c.outcome.kind === 'coins' && !c.cost);
    if (coinIdx >= 0) {
      const amt = (event.choices[coinIdx]!.outcome as { amount: number }).amount;
      const after = chooseEventOption(run, registry, coinIdx);
      expect(after.coins).toBe(run.coins + amt);
      expect(after.phase).toEqual({ t: 'map' });
      expect(chooseEventOption(after, registry, 0)).toBe(after); // node consumed
    }

    // A combat-outcome choice routes into a fight.
    const combatEv = teleportTo(startRun('orsyric', 7), 'event', { seed: 0 });
    const evId = (combatEv.phase as { nodeId: string }).nodeId;
    const ev = eventForNode(combatEv.map.nodes[evId]!.seed);
    const cIdx = ev.choices.findIndex((c) => c.outcome.kind === 'combat');
    if (cIdx >= 0) {
      const fighting = chooseEventOption(combatEv, registry, cIdx);
      expect(fighting.phase.t).toBe('combat');
    }
  });

  it('round-trips through JSON + schema validation (persistence, incl. relics)', () => {
    let run = teleportTo(startRun('phantom', 99), 'store');
    run = { ...run, relics: ['ember-cache', 'veterans-draw'] };
    const revived = parseRun(JSON.parse(JSON.stringify(run)));
    expect(revived).toEqual(run);
    expect(parseRun({ garbage: true })).toBeNull();
  });
});

// --- Persistent run HP ---------------------------------------------------------
// Adventure is an attrition run: leader HP carries BETWEEN fights, so winning
// bloodied is a real cost and Rest Sites have something to trade against.
describe('persistent run HP', () => {
  it('starts at the leader\'s own max HP', () => {
    const run = startRun('orsyric', 42, registry);
    expect(run.maxHp).toBe(registry.leaders.get('orsyric')!.hp);
    expect(run.hp).toBe(run.maxHp);
  });

  it('carries surviving HP forward after a win', () => {
    const run = teleportTo(startRun('orsyric', 42, registry), 'combat');
    const after = resolveCombat(run, registry, true, 17);
    expect(after.hp).toBe(17);
    expect(after.maxHp).toBe(run.maxHp); // max never moves
    expect(after.phase.t).toBe('reward');
  });

  it('never carries HP above max or below 1, and floors fractional HP', () => {
    const run = teleportTo(startRun('orsyric', 42, registry), 'combat');
    expect(resolveCombat(run, registry, true, 999).hp).toBe(run.maxHp);
    expect(resolveCombat(run, registry, true, 0).hp).toBe(1);
    expect(resolveCombat(run, registry, true, -5).hp).toBe(1);
    expect(resolveCombat(run, registry, true, 12.7).hp).toBe(12);
  });

  it('leaves HP untouched when the caller reports none (back-compat)', () => {
    const run = teleportTo(startRun('orsyric', 42, registry), 'combat');
    const wounded = { ...run, hp: 21 };
    expect(resolveCombat(wounded, registry, true).hp).toBe(21);
  });

  it('a loss still ends the run regardless of reported HP', () => {
    const run = teleportTo(startRun('orsyric', 42, registry), 'combat');
    expect(resolveCombat(run, registry, false, 9).phase.t).toBe('dead');
  });

  it('defaults HP for a pre-HP saved run instead of dropping it', () => {
    const run = startRun('orsyric', 42, registry);
    const legacy: Record<string, unknown> = { ...run };
    delete legacy.hp;
    delete legacy.maxHp;
    const parsed = parseRun(legacy);
    expect(parsed).not.toBeNull();
    expect(parsed!.hp).toBe(parsed!.maxHp);
  });
});

describe('rest site healing', () => {
  it('heals an even amount, consumes the visit, and never exceeds max', () => {
    const base = startRun('orsyric', 42, registry);
    const run = teleportTo({ ...base, hp: 4 }, 'rest');
    const healed = restHeal(run);
    const gain = healed.hp - 4;
    expect(gain).toBe(restHealAmount(run.maxHp));
    expect(gain % 2).toBe(0);
    expect(healed.map.nodes['inj-rest']!.restUsed).toBe(true);
    // Second use on the same camp is rejected.
    expect(restHeal(healed).hp).toBe(healed.hp);
    // Near-full heals clamp to max rather than overshooting.
    expect(restHeal(teleportTo({ ...base, hp: base.maxHp - 2 }, 'rest')).hp).toBe(base.maxHp);
  });

  it('is rejected at full HP so the camp is not wasted', () => {
    const run = teleportTo(startRun('orsyric', 42, registry), 'rest');
    const after = restHeal(run);
    expect(after).toEqual(run);
    expect(after.map.nodes['inj-rest']!.restUsed).toBeUndefined();
  });

  it('competes with the other camp services for the single visit', () => {
    const run = teleportTo({ ...startRun('orsyric', 42, registry), hp: 6 }, 'rest');
    const healed = restHeal(run);
    // Having rested, take-a-card at the same camp is no longer available.
    expect(restTakeCard(healed, registry, restCardOffer(registry, healed, 'inj-rest')[0]!).deck.length).toBe(healed.deck.length);
  });
});

// --- Boss unlocks: leader unique (act 1) and signature buff (act 2) ------------
describe('boss unlocks', () => {
  it('the act 1 boss offers the leader unique as an unlock gate', () => {
    const run = teleportTo(startRun('orsyric', 42, registry), 'boss');
    const won = resolveCombat(run, registry, true, 20);
    expect(won.phase.t).toBe('reward');
    expect(won.phase.t === 'reward' && won.phase.unlock).toBe('unique');
  });

  it('claiming the unique unlock records it and clears the gate', () => {
    const run = teleportTo(startRun('orsyric', 42, registry), 'boss');
    const won = resolveCombat(run, registry, true, 20);
    const claimed = claimUnlock(won);
    expect(claimed.heroUpgrades).toEqual([{ kind: 'unique' }]);
    expect(claimed.phase.t === 'reward' && claimed.phase.unlock).toBeUndefined();
    // The gate blocks leaving until claimed.
    expect(leaveNode(won)).toBe(won);
  });

  it('a second act-1-boss kill (unique already owned) offers no unlock', () => {
    const owned = { ...startRun('orsyric', 42, registry), heroUpgrades: [{ kind: 'unique' as const }] };
    const run = teleportTo(owned, 'boss');
    const won = resolveCombat(run, registry, true, 20);
    expect(won.phase.t === 'reward' && won.phase.unlock).toBeUndefined();
  });

  it('the act 2 boss offers the signature buff when one is authored for the leader', () => {
    const act2 = { ...startRun('orsyric', 42, registry), act: 2, heroUpgrades: [{ kind: 'unique' as const }] };
    const run = teleportTo(act2, 'boss');
    withSignatureUpgrade('orsyric', () => {
      const won = resolveCombat(run, registry, true, 20);
      expect(won.phase.t === 'reward' && won.phase.unlock).toBe('signature');
      const claimed = claimUnlock(won);
      expect(claimed.signatureBuff).toBe(true);
    });
  });

  // Regression: offering the unlock for a leader with no authored buff gave the player a
  // reward screen promising an empowered Signature that did nothing — while ALSO
  // suppressing the bonus relic an unlock-less boss grants. All 13 shipped leaders are
  // authored now, so the branch is reached by removing one for the duration of the test.
  it('the act 2 boss offers NO signature unlock when the leader has none authored', () => {
    const act2 = { ...startRun('orsyric', 42, registry), act: 2, heroUpgrades: [{ kind: 'unique' as const }] };
    const run = teleportTo(act2, 'boss');
    withoutSignatureUpgrade('orsyric', () => {
      const won = resolveCombat(run, registry, true, 20);
      expect(won.phase.t === 'reward' && won.phase.unlock).toBeUndefined();
      // ...and falls back to the bonus relic rather than being reduced to coins.
      expect(won.phase.t === 'reward' && won.phase.bonusRelic).toBe(true);
    });
  });

  it('the act 2 boss offers the signature unlock for a shipped leader, with no stubbing', () => {
    const act2 = { ...startRun('orsyric', 42, registry), act: 2, heroUpgrades: [{ kind: 'unique' as const }] };
    const run = teleportTo(act2, 'boss');
    const won = resolveCombat(run, registry, true, 20);
    expect(won.phase.t === 'reward' && won.phase.unlock).toBe('signature');
  });

  it('a non-boss combat kill never offers an unlock', () => {
    const run = teleportTo(startRun('orsyric', 42, registry), 'combat');
    const won = resolveCombat(run, registry, true, 20);
    expect(won.phase.t === 'reward' && won.phase.unlock).toBeUndefined();
  });

  it('claimUnlock is a no-op outside a pending unlock gate', () => {
    const run = teleportTo(startRun('orsyric', 42, registry), 'store');
    expect(claimUnlock(run)).toBe(run);
    const rewardNoUnlock = resolveCombat(teleportTo(startRun('orsyric', 42, registry), 'combat'), registry, true, 20);
    expect(claimUnlock(rewardNoUnlock)).toBe(rewardNoUnlock);
  });
});

describe('act 3+ boss bonus relic (the "significant reward" once unlocks run out)', () => {
  it('an act 3+ boss offers no unlock but flags bonusRelic on the reward', () => {
    const act3 = { ...startRun('orsyric', 42, registry), act: 3, heroUpgrades: [{ kind: 'unique' as const }], signatureBuff: true };
    const run = teleportTo(act3, 'boss');
    const won = resolveCombat(run, registry, true, 20);
    expect(won.phase.t === 'reward' && won.phase.unlock).toBeUndefined();
    expect(won.phase.t === 'reward' && won.phase.bonusRelic).toBe(true);
    expect(won.phase.t === 'reward' && won.phase.relicChoices?.length).toBe(3);
  });

  it('picking the first relic immediately rolls a second pick instead of clearing the gate', () => {
    const act3 = { ...startRun('orsyric', 42, registry), act: 3, heroUpgrades: [{ kind: 'unique' as const }], signatureBuff: true };
    const run = teleportTo(act3, 'boss');
    const won = resolveCombat(run, registry, true, 20);
    if (won.phase.t !== 'reward') throw new Error('expected reward');
    const first = won.phase.relicChoices![0]!;
    const afterFirst = pickRelic(won, first);
    expect(afterFirst.relics).toContain(first);
    if (afterFirst.phase.t !== 'reward') throw new Error('expected reward');
    expect(afterFirst.phase.bonusRelic).toBeUndefined(); // consumed, fires only once
    expect(afterFirst.phase.relicChoices?.length).toBeGreaterThan(0); // second round rolled
    expect(afterFirst.phase.relicChoices).not.toContain(first); // already owned, excluded
    expect(leaveNode(afterFirst)).toBe(afterFirst); // still gated on the second pick

    const second = afterFirst.phase.relicChoices![0]!;
    const afterSecond = pickRelic(afterFirst, second);
    expect(afterSecond.relics).toContain(first);
    expect(afterSecond.relics).toContain(second);
    expect(afterSecond.relics.length).toBe(2);
    if (afterSecond.phase.t !== 'reward') throw new Error('expected reward');
    expect(afterSecond.phase.relicChoices).toBeUndefined(); // second pick clears normally
  });

  it('a boss with an unlock to award gets no bonusRelic (the unlock IS the reward)', () => {
    const act1 = teleportTo(startRun('orsyric', 42, registry), 'boss');
    const won1 = resolveCombat(act1, registry, true, 20);
    expect(won1.phase.t === 'reward' && won1.phase.unlock).toBe('unique');
    expect(won1.phase.t === 'reward' && won1.phase.bonusRelic).toBeUndefined();

    const act2 = { ...startRun('orsyric', 42, registry), act: 2, heroUpgrades: [{ kind: 'unique' as const }] };
    withSignatureUpgrade('orsyric', () => {
      const won2 = resolveCombat(teleportTo(act2, 'boss'), registry, true, 20);
      expect(won2.phase.t === 'reward' && won2.phase.unlock).toBe('signature');
      expect(won2.phase.t === 'reward' && won2.phase.bonusRelic).toBeUndefined();
    });
  });
});

describe('max-HP relics (Oaken Heart / Titan\'s Girdle)', () => {
  const rewardWith = (relicId: string, hp: number, maxHp: number): RunState => {
    const base = structuredClone(startRun('orsyric', 42, registry));
    return { ...base, hp, maxHp, phase: { t: 'reward', nodeId: 'x', coins: 0, relicChoices: [relicId] } };
  };

  it('raises maxHp and heals by the same amount on claim', () => {
    const after = pickRelic(rewardWith('oaken-heart', 20, 30), 'oaken-heart'); // +4
    expect(after.relics).toContain('oaken-heart');
    expect(after.maxHp).toBe(34);
    expect(after.hp).toBe(24);
  });

  it('the heal never overshoots the new max', () => {
    const after = pickRelic(rewardWith('titans-girdle', 28, 30), 'titans-girdle'); // +10 → max 40, hp 28+10=38 ≤ 40
    expect(after.maxHp).toBe(40);
    expect(after.hp).toBe(38);
  });

  it('keeps maxHp even so the Signature threshold stays a clean half', () => {
    for (const id of ['oaken-heart', 'titans-girdle']) {
      const after = pickRelic(rewardWith(id, 20, 30), id);
      expect(after.maxHp % 2).toBe(0);
    }
  });
});
