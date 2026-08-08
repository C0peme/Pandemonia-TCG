import { describe, expect, it } from 'vitest';
import { buildRegistry } from '@cards/registry';
import { starterCards, starterLeaders, starterDecks } from '@cards/data/starter';
import { initGame } from '@engine/setup';
import { beginTurn } from '@engine/turn';
import { LANES, type LaneId } from '@engine/constants';
import { laneAllowed } from '@engine/engine';
import { applyTrialToState, flattenTwist, TWISTS, TRIAL_TWISTS, trialById, type TrialTwist } from '@adventure/trials';
import { buildRunRegistry } from '@adventure/runRegistry';

const base = buildRegistry(starterCards, starterLeaders);
const decks: [typeof starterDecks[number], typeof starterDecks[number]] = [starterDecks[1]!, starterDecks[3]!];

describe('twist table', () => {
  it('has unique ids and every id resolves', () => {
    const ids = TWISTS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(trialById(id)).toBeTruthy();
  });

  it('excludes boss signatures from the trial-rollable pool', () => {
    expect(TRIAL_TWISTS.length).toBeGreaterThan(0);
    for (const t of TRIAL_TWISTS) expect(t.bossOnly).toBeFalsy();
    expect(TWISTS.some((t) => t.bossOnly)).toBe(true);
  });

  // Uses the ENGINE's laneAllowed rather than re-implementing the rule: a twist must
  // never pre-place a hazard where a player couldn't legally place it themselves.
  it('every fixedEnvironments place names a real environment legal in that lane', () => {
    for (const t of TWISTS) {
      if (t.kind !== 'fixedEnvironments') continue;
      for (const { lane, cardId } of t.places) {
        const card = base.cards.get(cardId);
        expect(card, `${t.id}: unknown card ${cardId}`).toBeTruthy();
        if (card!.type !== 'environment') throw new Error(`${t.id}: ${cardId} is not an environment`);
        expect(card!.wip).toBe(false);
        expect(laneAllowed(card!.lanes, lane), `${t.id}: ${cardId} cannot be placed in ${lane}`).toBe(true);
      }
    }
  });
});

describe('applyTrialToState', () => {
  it('places fixed environments in exactly the named lanes, consuming iidSeq', () => {
    const twist = trialById('boss-plague-fields')!; // both Ground lanes
    const state = initGame({ registry: base, decks, seed: 1 });
    const before = state.iidSeq;
    applyTrialToState(base, state, twist);
    const placed = LANES.filter((l) => state.environments[l]);
    expect(placed.sort()).toEqual(['ground1', 'ground2']);
    expect(state.iidSeq).toBe(before + 2);
    for (const lane of placed) expect(state.environments[lane]!.cardId).toBe('sludge-pool');
  });

  it('leaves unnamed lanes untouched (Heights stay clean for the Plaguebringer)', () => {
    const state = initGame({ registry: base, decks, seed: 1 });
    applyTrialToState(base, state, trialById('boss-plague-fields')!);
    expect(state.environments.heights).toBeUndefined();
    expect(state.environments.water).toBeUndefined();
  });

  it('the Drowned King freezes the Grounds and opens the Water with Shallows', () => {
    const state = initGame({ registry: base, decks, seed: 1 });
    applyTrialToState(base, state, trialById('boss-drowned-tide')!);
    for (const lane of ['ground1', 'ground2'] as LaneId[]) {
      expect(state.environments[lane]!.cardId).toBe('tundra');
    }
    expect(state.environments.water!.cardId).toBe('shallows');
    expect(state.environments.heights).toBeUndefined();
  });

  // The runtime backstop: even if data drifts, an illegal lane is skipped rather than
  // producing a board the player could never legally create.
  it('skips placements the engine would reject (illegal lane)', () => {
    const state = initGame({ registry: base, decks, seed: 1 });
    applyTrialToState(base, state, {
      id: 'x', name: 'X', blurb: '', kind: 'fixedEnvironments',
      places: [{ lane: 'water', cardId: 'tundra' }], // tundra is Ground-only
    });
    expect(state.environments.water).toBeUndefined();
  });

  it('is fully deterministic — same twist, same result, no seed involved', () => {
    const twist = trialById('scorched-ground')!;
    const a = initGame({ registry: base, decks, seed: 2 });
    const b = initGame({ registry: base, decks, seed: 2 });
    applyTrialToState(base, a, twist);
    applyTrialToState(base, b, twist);
    expect(a.environments).toEqual(b.environments);
  });

  it('registry-based twists leave the state alone', () => {
    const state = initGame({ registry: base, decks, seed: 3 });
    const snapshot = JSON.stringify(state);
    applyTrialToState(base, state, trialById('surge')!);
    applyTrialToState(base, state, trialById('thorned-world')!);
    expect(JSON.stringify(state)).toBe(snapshot);
  });

  it('fixedUnits places the named card in every default lane, both sides, without clobbering', () => {
    const twist: TrialTwist = { id: 'x', name: 'X', blurb: '', kind: 'fixedUnits', cardId: 'coal-runner' };
    const state = initGame({ registry: base, decks, seed: 1 });
    const before = state.iidSeq;
    applyTrialToState(base, state, twist);
    for (const side of [0, 1] as const) {
      for (const lane of LANES) {
        expect(state.players[side].lanes[lane].front?.cardId).toBe('coal-runner');
      }
    }
    expect(state.iidSeq).toBe(before + 8);
  });

  it('fixedUnits respects an explicit lanes/sides subset and never overwrites an occupied slot', () => {
    const twist: TrialTwist = { id: 'x', name: 'X', blurb: '', kind: 'fixedUnits', cardId: 'coal-runner', lanes: ['water'], sides: [0] };
    const state = initGame({ registry: base, decks, seed: 1 });
    state.players[1].lanes.water.front = state.players[0].lanes.water.front; // pretend occupied
    applyTrialToState(base, state, twist);
    expect(state.players[0].lanes.water.front?.cardId).toBe('coal-runner');
    expect(state.players[0].lanes.ground1.front).toBeUndefined();
    expect(state.players[1].lanes.water.front?.cardId).not.toBe('coal-runner');
  });

  it('fixedUnits drowns a non-swimmer placed in Water', () => {
    const twist: TrialTwist = { id: 'x', name: 'X', blurb: '', kind: 'fixedUnits', cardId: 'coal-runner', lanes: ['water'], sides: [0] };
    const state = initGame({ registry: base, decks, seed: 1 });
    applyTrialToState(base, state, twist);
    expect(state.players[0].lanes.water.front?.status.drowning).toBe(true);
  });

  // Regression: fixedUnits used to derive water compatibility inline from the card's own
  // aquatic/airborne keywords, which ignored Environment grants entirely — so a composite
  // twist that opens the Water with Shallows still drowned the units it placed there.
  // Routing through refreshEnvironmentGrants + reconcileDrowning is what fixes it.
  it('fixedUnits does NOT drown a unit whose lane a composite twist opened with Shallows', () => {
    const twist: TrialTwist = {
      id: 'x', name: 'X', blurb: '', kind: 'composite',
      twists: [
        { id: 'x-env', name: 'X', blurb: '', kind: 'fixedEnvironments', places: [{ lane: 'water', cardId: 'shallows' }] },
        { id: 'x-units', name: 'X', blurb: '', kind: 'fixedUnits', cardId: 'coal-runner', lanes: ['water'], sides: [0] },
      ],
    };
    const state = initGame({ registry: base, decks, seed: 1 });
    applyTrialToState(base, state, twist);
    const unit = state.players[0].lanes.water.front;
    expect(unit?.cardId).toBe('coal-runner');
    expect(unit?.status.drowning).toBeFalsy();
    // ...and its real attack is intact rather than parked in predrownAttack.
    expect(unit!.attack).toBeGreaterThan(0);
  });
});

describe('boss-ignorance-is-bliss (cult-follower, end-to-end)', () => {
  it('places 8 followers (4 lanes × 2 sides) that self-sacrifice and mill on their owner\'s next turn', () => {
    const twist = trialById('boss-ignorance-is-bliss')!;
    const state = initGame({ registry: base, decks, seed: 1 });
    applyTrialToState(base, state, twist);
    for (const side of [0, 1] as const) {
      for (const lane of LANES) expect(state.players[side].lanes[lane].front?.cardId).toBe('cult-follower');
    }

    const deckBefore = state.players[0].deck.length;
    const res = beginTurn(state, 0, base);

    // Every side-0 follower self-destructed (damage 99 → death → processDeaths clears the slot).
    for (const lane of LANES) expect(res.state.players[0].lanes[lane].front).toBeUndefined();
    // The normal per-turn draw (1) plus one mill per surviving follower (4 lanes).
    expect(res.state.players[0].deck.length).toBe(deckBefore - 1 - 4);
    expect(res.events.filter((e) => e.t === 'forget' && e.player === 0).length).toBe(4);
    // Side 1's followers are untouched — it wasn't their turn.
    for (const lane of LANES) expect(res.state.players[1].lanes[lane].front?.cardId).toBe('cult-follower');
  });
});

describe('flattenTwist', () => {
  it('flattens a composite into its leaf twists; passes a leaf through unchanged', () => {
    const leaf: TrialTwist = { id: 'a', name: 'A', blurb: '', kind: 'globalBuff', stat: { hp: 1 } };
    expect(flattenTwist(leaf)).toEqual([leaf]);
    const composite: TrialTwist = { id: 'c', name: 'C', blurb: '', kind: 'composite', twists: [leaf, trialById('surge')!] };
    expect(flattenTwist(composite)).toEqual([leaf, trialById('surge')!]);
  });
});

describe('globalOnPlayStatus (via buildRunRegistry)', () => {
  it('appends an applyStatus onPlay effect to every unit without clobbering existing onPlay', () => {
    const twist: TrialTwist = { id: 'x', name: 'X', blurb: '', kind: 'globalOnPlayStatus', status: 'poison' };
    const reg = buildRunRegistry(base, { deck: [], twist });
    for (const card of reg.cards.values()) {
      if (card.type !== 'unit') continue;
      expect(card.onPlay?.some((e) => e.kind === 'applyStatus' && e.status === 'poison'), card.id).toBe(true);
    }
    // A card that already had onPlay effects (e.g. brood-mother summons) keeps them.
    const broodMother = reg.cards.get('brood-mother');
    if (broodMother?.type === 'unit') {
      expect(broodMother.onPlay?.some((e) => e.kind === 'summon')).toBe(true);
    }
  });

  it('composes with globalBuff via a composite twist (The NICE Curse)', () => {
    const twist = trialById('boss-nice-curse')!;
    const reg = buildRunRegistry(base, { deck: [], twist });
    const coal = reg.cards.get('coal-runner')!;
    if (coal.type !== 'unit') throw new Error('expected unit');
    const baseCoal = base.cards.get('coal-runner')!;
    if (baseCoal.type !== 'unit') throw new Error('expected unit');
    expect(coal.hp).toBe(baseCoal.hp + 3);
    expect(coal.attack).toBe(baseCoal.attack); // +0/+3, attack untouched
    expect(coal.onPlay?.some((e) => e.kind === 'applyStatus' && e.status === 'poison')).toBe(true);
  });
});
