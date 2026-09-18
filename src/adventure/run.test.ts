import { describe, expect, it } from 'vitest';
import { buildRegistry } from '@cards/registry';
import { starterCards, starterLeaders } from '@cards/data/starter';
import {
  startRun, pickNode, resolveCombat, pickRelic, pickRewardCard, skipRewardCard, leaveNode,
  buyCard, storeReroll, storeStock, chooseTrialTwist, sellCard, applyEnhancement, enhanceReroll, enhanceAttune, restHeal, restKindle, restMend, claimUnlock, chooseEventOption, reachableNodeIds,
} from '@adventure/run';
import { parseRun, type MapNode, type RunState } from '@adventure/schema';
<<<<<<< Updated upstream
import { rollStoreOffer, buyPrice, combatReward, attuneCost, restHealAmount, kindleHealAmount, ECON } from '@adventure/economy';
import { rollEnhanceOffer, canApply } from '@adventure/enhance';
import { eventForNode } from '@adventure/data/events';

const registry = buildRegistry(starterCards, starterLeaders);

=======
import { slotPrice, storeRerollCost, combatReward, attuneCost, restHealAmount, kindleHealAmount, victoryHealAmount, hpCeiling, ECON } from '@adventure/economy';
import { rollEnhanceOffers, canApply, rerollCost } from '@adventure/enhance';
import { EVENTS, eventForNode } from '@adventure/data/events';
import { RELICS } from '@adventure/data/relics';
import { SIGNATURE_UPGRADES } from '@adventure/hero';

const registry = buildRegistry(starterCards, starterLeaders);

/**
 * Run `fn` with a STUB signature upgrade temporarily standing in for `leaderId`'s real
 * one, restoring whatever was there before (present or absent) afterward.
 *
 * Every leader now has a real entry, so this exists to keep tests decoupled from that
 * content rather than to fill a gap -- a test asserting the unlock MECHANISM fires
 * should not need to change when someone edits a leader's actual signature blurb.
 *
 * Restoring rather than deleting matters: `SIGNATURE_UPGRADES` is a module-level
 * singleton, so a bare `delete` here used to permanently erase a leader's real entry for
 * the rest of the test file. A later test asserting "no unlock when none is authored"
 * for that SAME leader then passed for the wrong reason -- not because the leader
 * genuinely has none, but because an earlier test's cleanup had just deleted the real
 * one. Isolating that test (`vitest -t`) turns it red.
 */
const withSignatureUpgrade = (leaderId: string, fn: () => void): void => {
  const had = Object.prototype.hasOwnProperty.call(SIGNATURE_UPGRADES, leaderId);
  const original = SIGNATURE_UPGRADES[leaderId];
  SIGNATURE_UPGRADES[leaderId] = { name: 'Test Buff', icon: '★', desc: 'test', card: (c) => c };
  try {
    fn();
  } finally {
    if (had) SIGNATURE_UPGRADES[leaderId] = original!;
    else delete SIGNATURE_UPGRADES[leaderId];
  }
};

/**
 * The inverse: run `fn` with `leaderId`'s real signature upgrade (if any) temporarily
 * REMOVED, so the "no entry authored" code path can be exercised honestly even though
 * every real leader has one today. Restores it afterward, same discipline as above.
 */
const withoutSignatureUpgrade = (leaderId: string, fn: () => void): void => {
  const had = Object.prototype.hasOwnProperty.call(SIGNATURE_UPGRADES, leaderId);
  const original = SIGNATURE_UPGRADES[leaderId];
  delete SIGNATURE_UPGRADES[leaderId];
  try {
    fn();
  } finally {
    if (had) SIGNATURE_UPGRADES[leaderId] = original!;
  }
};

>>>>>>> Stashed changes
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
    expect(run.deck.length).toBe(15); // half a full 30-card deck
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
<<<<<<< Updated upstream
    const offer = rollStoreOffer(registry, at.seed, leader.element);
    const price = buyPrice(registry.cards.get(offer[0]!)!, leader.element);
=======
    const offer = storeStock(run, registry, at);
    // Pick the first slot the starting purse can actually afford. The offer is rolled from the
    // whole card pool, so WHICH slot is affordable shifts every time a card is added to the
    // game — hardcoding slot 0 made this test fail for an unrelated reason. The rule under test
    // is one-buy-per-slot; refusing an unaffordable card is correct behaviour, tested elsewhere.
    const slot = offer.findIndex((sl) => slotPrice(registry.cards.get(sl.cardId)!, sl, leader.element) <= run.coins);
    expect(slot).toBeGreaterThanOrEqual(0);
    const price = slotPrice(registry.cards.get(offer[slot]!.cardId)!, offer[slot]!, leader.element);
>>>>>>> Stashed changes

    const deckBefore = run.deck.length;
    run = buyCard(run, registry, 0);
    expect(run.deck.length).toBe(deckBefore + 1);
    expect(run.coins).toBe(ECON.STARTING_COINS - price);
    // Same slot can't be bought twice.
    expect(buyCard(run, registry, 0)).toBe(run);

    const sold = sellCard(run, registry, run.deck[0]!.uid);
    expect(sold.deck.length).toBe(run.deck.length - 1);
    expect(sold.coins).toBeGreaterThan(run.coins);
    // Selling is UNLIMITED per visit — the shop is Adventure's card-removal mechanism,
    // so a second sale at the same node must also go through.
    const twice = sellCard(sold, registry, sold.deck[0]!.uid);
    expect(twice.deck.length).toBe(sold.deck.length - 1);
    expect(twice.coins).toBeGreaterThan(sold.coins);
  });

  it('store: a paid restock changes the stock and reopens the sold-out slots', () => {
    let run = teleportTo({ ...startRun('orsyric', 42, registry), coins: 900 }, 'store');
    const nodeId = (run.phase as { nodeId: string }).nodeId;
    const at = (r: RunState) => r.map.nodes[nodeId]!;
    const stockIds = (r: RunState): string => storeStock(r, registry, at(r)).map((s) => s.cardId).join();

    const before = stockIds(run);
    // Buy something first, so the reopening of `bought` is observable.
    const affordable = storeStock(run, registry, at(run))
      .findIndex((sl) => slotPrice(registry.cards.get(sl.cardId)!, sl, registry.leaders.get('orsyric')!.element) <= run.coins);
    run = buyCard(run, registry, affordable);
    expect(at(run).bought).toContain(affordable);

    const coinsBefore = run.coins;
    const restocked = storeReroll(run);
    expect(coinsBefore - restocked.coins).toBe(storeRerollCost(0));
    expect(stockIds(restocked)).not.toBe(before);
    // The new stock is genuinely new, so an index that was sold out no longer refers to
    // anything already taken.
    expect(at(restocked).bought).toEqual([]);
    // And the price climbs for the next one.
    expect(restocked.coins - storeReroll(restocked).coins).toBe(storeRerollCost(1));
  });

  it('store: a restock is refused when it cannot be paid for', () => {
    const run = teleportTo({ ...startRun('orsyric', 42, registry), coins: 0 }, 'store');
    expect(storeReroll(run)).toBe(run);
  });

  it('store: buying a pre-enhanced slot carries the enhancement onto the copy', () => {
    // Walk seeds until a shop stocks an enhanced slot the purse can afford.
    for (let seed = 0; seed < 200; seed++) {
      const run = teleportTo({ ...startRun('orsyric', seed, registry), coins: 900, act: 5 }, 'store');
      const stock = storeStock(run, registry, run.map.nodes[(run.phase as { nodeId: string }).nodeId]!);
      const idx = stock.findIndex((s) => s.enhancements?.length);
      if (idx < 0) continue;
      const after = buyCard(run, registry, idx);
      if (after === run) continue; // couldn't afford it; try another seed
      const bought = after.deck[after.deck.length - 1]!;
      expect(bought.cardId).toBe(stock[idx]!.cardId);
      expect(bought.enhancements).toEqual(stock[idx]!.enhancements);
      return;
    }
    throw new Error('no affordable pre-enhanced slot found in 200 seeds');
  });

  it('a relic gate with nothing left to offer resolves instead of soft-locking', () => {
    // `rollRelicChoices` excludes what you already own, so a late-run boss can roll an
    // EMPTY list. An empty array is still truthy, so the reward screen rendered an empty
    // grid: no charm to click, and Continue never appeared.
    const run = teleportTo(startRun('orsyric', 42, registry), 'combat');
    // Own EVERYTHING: `rollRelicChoices` falls back to lower bands when the requested
    // band runs dry, so only a fully-exhausted table actually returns an empty row.
    const owned = RELICS.map((r) => r.id).filter((id) => id !== 'tithe-box');
    const rich: RunState = {
      ...run,
      relics: owned,
      phase: { t: 'reward', nodeId: 'inj-combat', coins: 0, relicChoices: ['tithe-box'], bonusRelic: true },
    };
    const after = pickRelic(rich, 'tithe-box');
    if (after.phase.t !== 'reward') throw new Error('expected reward');
    // The bonus roll had nothing left to give, so the gate CLEARS rather than sitting
    // empty and unresolvable.
    expect(after.phase.relicChoices).toBeUndefined();
    expect(after.phase.bonusRelic).toBeUndefined();
    expect(after.relics).toContain('tithe-box');
  });

  it('trial: choosing the condition is what starts the fight', () => {
    const run = teleportTo(startRun('orsyric', 42, registry), 'trial', {
      twistChoices: ['surge', 'hardened', 'war-drums'],
    });
    // Entering a Trial stops at the choice rather than dropping straight into combat.
    expect(run.phase.t).toBe('trial');

    const chosen = chooseTrialTwist(run, 'hardened');
    expect(chosen.phase.t).toBe('combat');
    expect(chosen.map.nodes['inj-trial']!.twistId).toBe('hardened');
    // The pick is locked in — a second call cannot swap the condition mid-fight.
    expect(chooseTrialTwist(chosen, 'surge')).toBe(chosen);
  });

  it('trial: refuses a twist that is not on the node\'s own shortlist', () => {
    const run = teleportTo(startRun('orsyric', 42, registry), 'trial', {
      twistChoices: ['surge', 'hardened', 'war-drums'],
    });
    // Otherwise a client could fight a Trial under a condition of its choosing —
    // including a boss signature — regardless of what the map advertises.
    expect(chooseTrialTwist(run, 'boss-death-artificer')).toBe(run);
    expect(chooseTrialTwist(run, 'killing-field')).toBe(run);
    expect(chooseTrialTwist(run, 'nonexistent')).toBe(run);
  });

  it('trial: a node that already has a twist skips the choice', () => {
    // Pre-choice maps, event-spawned trials and test fixtures all take this path.
    const run = teleportTo(startRun('orsyric', 42, registry), 'trial', { twistId: 'surge' });
    expect(run.phase.t).toBe('combat');
  });

  it('selling stops at the minimum deck size rather than emptying the deck', () => {
    let run = teleportTo(startRun('orsyric', 4242, registry), 'store');
    // Sell as hard as the reducer will allow.
    for (let i = 0; i < 50; i++) {
      const next = sellCard(run, registry, run.deck[0]!.uid);
      if (next === run) break;
      run = next;
    }
    expect(run.deck.length).toBe(ECON.MIN_DECK_SIZE);
    expect(sellCard(run, registry, run.deck[0]!.uid)).toBe(run);
  });

  it('enhance: the working is FREE, and one of the three offers ends the visit', () => {
    let run = teleportTo(startRun('orsyric', 4242), 'enhance');
    expect(run.phase.t).toBe('enhance');
    run = { ...run, coins: 500 };
    const nodeId = (run.phase as { nodeId: string }).nodeId;
    const offers = rollEnhanceOffers(run.map.nodes[nodeId]!.seed, run.act);
    const idx = offers.findIndex((o) => o.sort === 'enhance' && run.deck.some((c) => canApply(o, registry.cards.get(c.cardId)!)));
    expect(idx, 'a row of three should contain something the starter deck can take').toBeGreaterThanOrEqual(0);
    const offer = offers[idx]!;
    const eligible = run.deck.find((c) => canApply(offer, registry.cards.get(c.cardId)!))!;

    const after = applyEnhancement(run, registry, eligible.uid, idx);
    expect(after.coins, 'enhancing costs nothing — coins buy rerolls now').toBe(500);
    if (offer.sort !== 'enhance') throw new Error('picked the wrong offer sort');
    expect(after.deck.find((c) => c.uid === eligible.uid)!.enhancements).toEqual([offer.enhancement]);
    // One working per visit.
    expect(applyEnhancement(after, registry, eligible.uid, idx)).toBe(after);
    // An out-of-range index is refused rather than falling back to another offer.
    expect(applyEnhancement(run, registry, eligible.uid, 99)).toBe(run);
  });

  it('enhance: Duplicate adds a second copy instead of buffing one', () => {
    let run = teleportTo(startRun('orsyric', 4242), 'enhance');
    const nodeId = (run.phase as { nodeId: string }).nodeId;
    // Force the row to contain the duplicate offer by rerolling until it appears.
    let guard = 0;
    while (!rollEnhanceOffers(run.map.nodes[nodeId]!.seed, run.act, run.map.nodes[nodeId]!.enhanceRerolls ?? 0).some((o) => o.sort === 'duplicate') && guard++ < 60) {
      run = { ...run, coins: 9999 };
      run = enhanceReroll(run);
    }
    const rerolls = run.map.nodes[nodeId]!.enhanceRerolls ?? 0;
    const offers = rollEnhanceOffers(run.map.nodes[nodeId]!.seed, run.act, rerolls);
    const idx = offers.findIndex((o) => o.sort === 'duplicate');
    expect(idx).toBeGreaterThanOrEqual(0);

    // Give the target a pre-existing enhancement so the `full` distinction is visible.
    const target = run.deck[0]!;
    run = { ...run, deck: run.deck.map((c) => (c.uid === target.uid ? { ...c, enhancements: [{ kind: 'stat', attack: 1, hp: 1 } as const] } : c)) };
    const after = applyEnhancement(run, registry, target.uid, idx);
    expect(after.deck.length).toBe(run.deck.length + 1);
    const copy = after.deck[after.deck.length - 1]!;
    expect(copy.cardId).toBe(target.cardId);
    expect(copy.uid).not.toBe(target.uid); // its own identity — enhanceable separately
    const full = (offers[idx] as { full: boolean }).full;
    expect(copy.enhancements.length).toBe(full ? 1 : 0);
  });

  it('enhance: the first reroll is free, the rest escalate, and none consume the visit', () => {
    let run = teleportTo({ ...startRun('orsyric', 4242), coins: 500 }, 'enhance');
    const nodeId = (run.phase as { nodeId: string }).nodeId;
    const row = (r: RunState): string =>
      rollEnhanceOffers(r.map.nodes[nodeId]!.seed, r.act, r.map.nodes[nodeId]!.enhanceRerolls ?? 0).map((o) => o.id).join();

    const before = row(run);
    const once = enhanceReroll(run);
    expect(once.coins, 'first reroll is free').toBe(500);
    expect(row(once)).not.toBe(before);

    const twice = enhanceReroll(once);
    expect(once.coins - twice.coins).toBe(rerollCost(1));
    expect(twice.coins - enhanceReroll(twice).coins).toBe(rerollCost(2));

    // Rerolling never spends the visit — the working is still available afterwards.
    expect(twice.map.nodes[nodeId]!.enhanceUsed).toBeUndefined();
    // And a broke player cannot reroll past the free one.
    expect(enhanceReroll({ ...twice, coins: 0 })).toMatchObject({ coins: 0 });
    expect(enhanceReroll({ ...twice, coins: 0 }).map.nodes[nodeId]!.enhanceRerolls).toBe(twice.map.nodes[nodeId]!.enhanceRerolls);
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
    expect(act2.deck.length).toBe(16); // starter 15 + the chosen boss reward card
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

  it('enhance node: attune is UNLIMITED, priced off the cap it is raising', () => {
    // With the altar's working now free, a single +1 cap gated behind the whole visit was
    // the weakest thing the node could offer. Attuning no longer consumes the visit and is
    // not limited per node — the escalating price is its only limit.
    const cap0 = registry.leaders.get('orsyric')!.elementCaps.water;
    const run = teleportTo({ ...startRun('orsyric', 9, registry), coins: 5000 }, 'enhance');

    const once = enhanceAttune(run, registry, 'water');
    expect(once.heroUpgrades).toEqual([{ kind: 'attune', element: 'water' }]);
    expect(once.coins).toBe(5000 - attuneCost(cap0));

    // Again, at the SAME node — and the price has gone up because the cap has.
    const twice = enhanceAttune(once, registry, 'water');
    expect(twice.heroUpgrades).toHaveLength(2);
    expect(twice.coins).toBe(5000 - attuneCost(cap0) - attuneCost(cap0 + 1));
    expect(attuneCost(cap0 + 1)).toBeGreaterThan(attuneCost(cap0));

    // ...and the visit is still available for a working.
    expect(twice.map.nodes['inj-enhance']!.enhanceUsed).toBeUndefined();
  });

  it('enhance node: attune is refused when it cannot be paid for', () => {
    const broke = teleportTo({ ...startRun('orsyric', 9, registry), coins: 0 }, 'enhance');
    expect(enhanceAttune(broke, registry, 'water')).toBe(broke);
  });

  it('rest site: kindle burns 2 cards for a bigger heal than plain Rest, one per visit', () => {
    const base = { ...startRun('orsyric', 42, registry), hp: 4, coins: 0 };
    const run = teleportTo(base, 'rest');
    const [c1, c2] = run.deck;
    const kindled = restKindle(run, [c1!.uid, c2!.uid]);
    expect(kindled.deck.length).toBe(run.deck.length - 2);
    expect(kindled.hp - 4).toBe(kindleHealAmount(run.maxHp));
    expect(kindleHealAmount(run.maxHp)).toBeGreaterThan(restHealAmount(run.maxHp));
    expect(kindled.map.nodes['inj-rest']!.restUsed).toBe(true);
    // One service per visit.
    expect(restKindle(kindled, [kindled.deck[0]!.uid, kindled.deck[1]!.uid])).toBe(kindled);
  });

  it('rejects a selection sized differently than KINDLE_BURN_COUNT, rather than silently burning a prefix of it', () => {
    // Regression: restKindle used to take two POSITIONAL uid params, and the UI called it
    // with burnSel[0]!, burnSel[1]! -- both independently hardcoding "2". A selection of any
    // other size (a stray extra pick, a future KINDLE_BURN_COUNT retune) would have silently
    // burned only the first two and dropped the rest, rather than failing. It must refuse.
    const base = { ...startRun('orsyric', 42, registry), hp: 4, coins: 0 };
    const run = teleportTo(base, 'rest');
    const [c1, c2, c3] = run.deck;
    expect(restKindle(run, [c1!.uid])).toBe(run); // too few
    expect(restKindle(run, [c1!.uid, c2!.uid, c3!.uid])).toBe(run); // too many
    expect(restKindle(run, [])).toBe(run); // none
  });

  it('kindle overheals at full HP but is rejected at the ceiling, with duplicate uids, or with too few cards to spare', () => {
    const wounded = { ...startRun('orsyric', 42, registry), hp: 4, coins: 0 };
    const run = teleportTo(wounded, 'rest');
    // Full HP no longer wastes the burn — Kindle overheals just like plain Rest.
    const full = teleportTo({ ...startRun('orsyric', 43, registry), coins: 0 }, 'rest');
    const kindledFull = restKindle(full, [full.deck[0]!.uid, full.deck[1]!.uid]);
    expect(kindledFull.hp).toBe(Math.min(hpCeiling(full.maxHp), full.maxHp + kindleHealAmount(full.maxHp)));
    expect(kindledFull.hp).toBeGreaterThan(full.maxHp);
    // Only rejected once the overheal ceiling itself is reached.
    const capped = teleportTo({ ...startRun('orsyric', 43, registry), coins: 0, hp: hpCeiling(full.maxHp) }, 'rest');
    expect(restKindle(capped, [capped.deck[0]!.uid, capped.deck[1]!.uid])).toBe(capped);
    // Same card twice is rejected.
    expect(restKindle(run, [run.deck[0]!.uid, run.deck[0]!.uid])).toBe(run);
    // Deck too small to survive the burn (needs >= 3 owned, 1 must remain).
    const thin = { ...run, deck: run.deck.slice(0, 2) };
    expect(restKindle(thin, [thin.deck[0]!.uid, thin.deck[1]!.uid])).toBe(thin);
  });

  it('event: coin choices adjust coins; combat choice routes to a fight; one choice per node', () => {
    // PIN the event rather than hoping a hardcoded seed lands on a suitable one. This
    // used to teleport to `seed: 100` and assert that whatever event came up happened to
    // have a plain coin choice — so every time the event table grew, the seed landed
    // somewhere new and this test failed for reasons that had nothing to do with the
    // reducer. Injecting the id keeps it testing `chooseEventOption` and nothing else.
    const plain = EVENTS.find((e) =>
      e.choices.some((c) => c.outcome.kind === 'coins' && !c.cost && !c.hpCost && !c.requires) && !e.requiresFlag)!;
    expect(plain, 'no event has a plain coin choice to exercise').toBeTruthy();
    let run = teleportTo(startRun('orsyric', 7), 'event', { seed: 100 });
    expect(run.phase.t).toBe('event');
    const nodeId = (run.phase as { nodeId: string }).nodeId;
    run = { ...run, map: { ...run.map, nodes: { ...run.map.nodes, [nodeId]: { ...run.map.nodes[nodeId]!, eventId: plain.id } } } };
    const event = plain;
    const coinIdx = event.choices.findIndex((c) => c.outcome.kind === 'coins' && !c.cost && !c.hpCost && !c.requires);
    expect(coinIdx, `${event.id} has no plain coin choice to exercise`).toBeGreaterThanOrEqual(0);
    const amt = (event.choices[coinIdx]!.outcome as { amount: number }).amount;
    const after = chooseEventOption(run, registry, coinIdx);
    expect(after.coins).toBe(run.coins + amt);
    // Every event stops on a result screen — the authored `result` line has to be shown.
    expect(after.phase.t).toBe('gain');
    expect(chooseEventOption(after, registry, 0)).toBe(after); // node consumed

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

  it('carries surviving HP forward after a win, plus the post-battle heal', () => {
    const run = teleportTo(startRun('orsyric', 42, registry), 'combat');
    const after = resolveCombat(run, registry, true, 17);
    expect(after.hp).toBe(17 + victoryHealAmount(0));
    expect(after.maxHp).toBe(run.maxHp); // max never moves
    expect(after.phase.t).toBe('reward');
    expect(after.phase.t === 'reward' && after.phase.healed).toBe(victoryHealAmount(0));
  });

  it('clamps carried HP to the overheal ceiling and 1, and floors fractional HP', () => {
    const run = teleportTo(startRun('orsyric', 42, registry), 'combat');
    const ceiling = hpCeiling(run.maxHp);
    expect(resolveCombat(run, registry, true, 999).hp).toBe(ceiling);
    expect(resolveCombat(run, registry, true, 0).hp).toBe(1 + victoryHealAmount(0));
    expect(resolveCombat(run, registry, true, -5).hp).toBe(1 + victoryHealAmount(0));
    expect(resolveCombat(run, registry, true, 12.7).hp).toBe(12 + victoryHealAmount(0));
  });

  it('still heals when the caller reports no HP (back-compat)', () => {
    const run = teleportTo(startRun('orsyric', 42, registry), 'combat');
    // Wounded far enough that the heal can land in full — it clamps at maxHp, and the
    // base heal is now big enough that a lightly-wounded leader would hit that clamp.
    const wounded = { ...run, hp: 15 };
    expect(resolveCombat(wounded, registry, true).hp).toBe(15 + victoryHealAmount(0));
  });

  it('the post-battle heal never overheals — it clamps at maxHp, unlike Rest', () => {
    const run = teleportTo(startRun('orsyric', 42, registry), 'combat');
    const after = resolveCombat(run, registry, true, run.maxHp);
    expect(after.hp).toBe(run.maxHp);
    expect(after.phase.t === 'reward' && after.phase.healed).toBeUndefined();
  });

  it('a win never erases temporary HP a prior Rest already banked', () => {
    const run = teleportTo(startRun('orsyric', 42, registry), 'combat');
    const overhealed = hpCeiling(run.maxHp); // as if carried in from a Rest overheal
    const after = resolveCombat(run, registry, true, overhealed);
    expect(after.hp).toBe(overhealed);
  });

  it('Mend raises the heal every later win pays, and costs the camp visit', () => {
    const rest = teleportTo(startRun('orsyric', 42, registry), 'rest');
    const mended = restMend(rest);
    expect(mended.mendLevel).toBe(1);
    // One service per visit, same as every other Rest option.
    expect(restMend(mended).mendLevel).toBe(1);
    expect(restHeal(mended)).toBe(mended);

    // A picked Rest node has no `next`, so walk into the fight from a fresh run carrying
    // the Mend level rather than from the camp we just spent.
    const fight = teleportTo({ ...startRun('orsyric', 42, registry), mendLevel: mended.mendLevel }, 'combat');
    const after = resolveCombat(fight, registry, true, 10);
    expect(after.hp - 10).toBe(victoryHealAmount(1));
    expect(victoryHealAmount(1)).toBeGreaterThan(victoryHealAmount(0));
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
  it('heals an even amount and consumes the visit', () => {
    const base = startRun('orsyric', 42, registry);
    const run = teleportTo({ ...base, hp: 4 }, 'rest');
    const healed = restHeal(run);
    const gain = healed.hp - 4;
    expect(gain).toBe(restHealAmount(run.maxHp));
    expect(gain % 2).toBe(0);
    expect(healed.map.nodes['inj-rest']!.restUsed).toBe(true);
    // Second use on the same camp is rejected.
    expect(restHeal(healed).hp).toBe(healed.hp);
  });

  // Rest is the ONE source of temporary HP: it overheals past maxHp, unlike the
  // post-battle win heal, which is what makes it worth visiting even unhurt.
  it('overheals past max into temporary HP, up to the ceiling', () => {
    const base = startRun('orsyric', 42, registry);
    const nearFull = teleportTo({ ...base, hp: base.maxHp - 2 }, 'rest');
    const healed = restHeal(nearFull);
    expect(healed.hp).toBe(base.maxHp - 2 + restHealAmount(base.maxHp));
    expect(healed.hp).toBeGreaterThan(base.maxHp);
    expect(healed.hp).toBeLessThanOrEqual(hpCeiling(base.maxHp));

    // Even at full health, Rest still pays out — it's no longer wasted at max HP.
    const full = teleportTo(base, 'rest');
    const overhealed = restHeal(full);
    expect(overhealed.hp).toBe(base.maxHp + restHealAmount(base.maxHp));
  });

  it('is rejected only once the overheal ceiling itself is reached', () => {
    const base = startRun('orsyric', 42, registry);
    const run = teleportTo({ ...base, hp: hpCeiling(base.maxHp) }, 'rest');
    const after = restHeal(run);
    expect(after).toEqual(run);
    expect(after.map.nodes['inj-rest']!.restUsed).toBeUndefined();
  });

  it('competes with the other camp services for the single visit', () => {
    const run = teleportTo({ ...startRun('orsyric', 42, registry), hp: 6 }, 'rest');
    const healed = restHeal(run);
    // Having rested, Mend at the same camp is no longer available.
    expect(restMend(healed)).toBe(healed);
    expect(restKindle(healed, [healed.deck[0]!.uid, healed.deck[1]!.uid])).toBe(healed);
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

<<<<<<< Updated upstream
  it('the act 2 boss offers the signature buff instead of the unique', () => {
    const act2 = { ...startRun('orsyric', 42, registry), act: 2, heroUpgrades: [{ kind: 'unique' as const }] };
    const run = teleportTo(act2, 'boss');
    const won = resolveCombat(run, registry, true, 20);
    expect(won.phase.t === 'reward' && won.phase.unlock).toBe('signature');
    const claimed = claimUnlock(won);
    expect(claimed.signatureBuff).toBe(true);
=======
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

  // Regression: an unauthored leader used to get the unlock offered anyway, which gave
  // the player a reward screen promising an empowered Signature that did nothing —
  // while ALSO suppressing the bonus relic an unlock-less boss grants. Every leader is
  // authored now, so `withoutSignatureUpgrade` removes orsyric's real entry for the
  // length of this test to exercise that path honestly, rather than the test only
  // passing because the table happened to be empty.
  it('the act 2 boss offers NO signature unlock when the leader has none authored', () => {
    const act2 = { ...startRun('orsyric', 42, registry), act: 2, heroUpgrades: [{ kind: 'unique' as const }] };
    const run = teleportTo(act2, 'boss');
    withoutSignatureUpgrade('orsyric', () => {
      const won = resolveCombat(run, registry, true, 20);
      expect(won.phase.t === 'reward' && won.phase.unlock).toBeUndefined();
      // ...and falls back to the bonus relic rather than being reduced to coins.
      expect(won.phase.t === 'reward' && won.phase.bonusRelic).toBe(true);
    });
>>>>>>> Stashed changes
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

  it('act 1/2 bosses never get bonusRelic (they still have an unlock to award)', () => {
    const act1 = teleportTo(startRun('orsyric', 42, registry), 'boss');
    const won1 = resolveCombat(act1, registry, true, 20);
    expect(won1.phase.t === 'reward' && won1.phase.bonusRelic).toBeUndefined();

    const act2 = { ...startRun('orsyric', 42, registry), act: 2, heroUpgrades: [{ kind: 'unique' as const }] };
    const won2 = resolveCombat(teleportTo(act2, 'boss'), registry, true, 20);
    expect(won2.phase.t === 'reward' && won2.phase.bonusRelic).toBeUndefined();
  });
});

describe('max-HP relics (Oaken Heart / The Endowment) — was (Oaken Heart / Titan\'s Girdle)', () => {
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
    // The Endowment replaced Titan's Girdle as the boss-band HP grant: +8 max (and a heal
    // to match), plus 20 TEMPORARY HP on top — a one-shot run transformation rather than
    // the same relic with a bigger number, which is the whole point of the band. Temporary
    // HP is real HP above the max, so the bound on it is `hpCeiling`, not `maxHp`.
    const after = pickRelic(rewardWith('the-endowment', 28, 30), 'the-endowment');
    expect(after.maxHp).toBe(38);
    expect(after.hp).toBe(Math.min(hpCeiling(38), 28 + 8 + 20));
    expect(after.hp).toBeGreaterThan(after.maxHp); // banked as temporary HP
  });

  it('keeps maxHp even so the Signature threshold stays a clean half', () => {
    for (const id of ['oaken-heart', 'the-endowment', 'brittle-crown', 'gluttons-idol']) {
      const after = pickRelic(rewardWith(id, 20, 30), id);
      expect(after.maxHp % 2).toBe(0);
    }
  });
});
