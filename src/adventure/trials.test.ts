import { describe, expect, it } from 'vitest';
import { buildRegistry } from '@cards/registry';
import { starterCards, starterLeaders, starterDecks } from '@cards/data/starter';
import { initGame } from '@engine/setup';
import { LANES, type LaneId } from '@engine/constants';
import { laneAllowed } from '@engine/engine';
import { applyTrialToState, flattenTwist, TWISTS, TRIAL_TWISTS, trialById, trialCoinMult, trialRewardBands, type TrialTwist } from '@adventure/trials';
import { buildRunRegistry } from '@adventure/runRegistry';

const base = buildRegistry(starterCards, starterLeaders);
const decks: [typeof starterDecks[number], typeof starterDecks[number]] = [starterDecks[1]!, starterDecks[3]!];

describe('twist table', () => {
  it('has unique ids and every id resolves', () => {
    const ids = TWISTS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(trialById(id)).toBeTruthy();
  });

  /**
   * A Trial's difficulty IS its twist, so the pool has to be wide enough that one run
   * doesn't keep meeting the same rule. It shipped with SEVEN rollable twists against
   * nine boss-only ones — the majority of the table was unreachable from the node that
   * exists to show it off.
   */
  it('keeps the trial-rollable pool wide enough to not repeat inside a run', () => {
    expect(TRIAL_TWISTS.length).toBeGreaterThanOrEqual(15);
  });

  it('gives every twist a name and a readable rule — a twist you cannot read is hidden randomness', () => {
    for (const t of TWISTS) {
      if (t.id.includes('-buff') || t.id.includes('-poison')) continue; // composite leaves are never shown alone
      expect(t.name.length, t.id).toBeGreaterThan(0);
      expect(t.blurb.length, t.id).toBeGreaterThan(0);
    }
  });

  it('every rollable twist actually changes the fight', () => {
    // A twist that rewrote nothing would still cost the player a Trial node's difficulty
    // budget while doing nothing — so each one has to be observable somewhere.
    //
    // The STRUCTURAL twists (`fixedEnergy`, `globalDraw`, `shortDecks`, `sided`) change
    // the shape of the fight rather than the board or the card pool, so the comparison
    // has to look at the whole opening state, not just lanes and environments.
    const plainReg = buildRunRegistry(base, { deck: [] });
    const shape = (s: ReturnType<typeof initGame>) => JSON.stringify({
      energyOverride: s.energyOverride ?? null,
      players: ([0, 1] as const).map((i) => ({
        energy: s.players[i].energy,
        hand: s.players[i].hand.length,
        deck: s.players[i].deck.length,
        handCap: s.players[i].handCap ?? null,
        turnCardMod: s.players[i].turnCardMod ?? null,
        lanes: LANES.map((l) => Boolean(s.players[i].lanes[l].front)),
      })),
      environments: LANES.map((l) => s.environments[l]?.cardId ?? null),
      // The commander's rounds are part of the fight's stated rules, so a twist whose
      // only effect is seating them still has to register as a change here.
      autopilot: s.autopilot ?? null,
      // Same reasoning for the BOARD: a `laneLayout` twist may change nothing but which
      // column is Heights, Ground or Water, and that is the whole fight for a deck built
      // around evasion.
      laneTypes: s.laneTypes ?? null,
    });
    for (const t of TRIAL_TWISTS) {
      const reg = buildRunRegistry(base, { deck: [], twist: t });
      const plainState = initGame({ registry: base, decks, seed: 5 });
      const state = initGame({ registry: base, decks, seed: 5 });
      applyTrialToState(base, state, t);
      const registryChanged = [...reg.cards.keys()].some(
        (id) => JSON.stringify(reg.cards.get(id)) !== JSON.stringify(plainReg.cards.get(id)),
      );
      expect(registryChanged || shape(state) !== shape(plainState), `${t.id} changes nothing`).toBe(true);
    }
  });

  it('prices every rollable twist — a Trial pays by the severity of the rule taken', () => {
    // Without this, a Trial is a strictly BETTER combat node: identical enemy HP and deck
    // size, double coins AND a relic, for a rule the player chose off a shortlist. The
    // severity is what turns that shortlist into a wager.
    for (const t of TRIAL_TWISTS) {
      expect([1, 2, 3], `${t.id} has no severity`).toContain(t.severity);
    }
    // All three rungs have to actually exist, or the wager has nothing to bet on.
    for (const sev of [1, 2, 3] as const) {
      expect(TRIAL_TWISTS.filter((t) => t.severity === sev).length, `no severity-${sev} twists`).toBeGreaterThanOrEqual(3);
    }
  });

  it('pays strictly more for a harsher rule', () => {
    expect(trialCoinMult(1)).toBeLessThan(trialCoinMult(2));
    expect(trialCoinMult(2)).toBeLessThan(trialCoinMult(3));
    // Band quality rises with severity, and the gentlest rung must not reach `rare`.
    expect(trialRewardBands(1)).toEqual(['common']);
    expect(trialRewardBands(3)).toContain('boss');
    expect(trialRewardBands(1)).not.toContain('boss');
  });

  it('structural twists leave the run deck alone — only the in-fight draw pile is cut', () => {
    // `shortDecks` is the only twist that touches a deck, and the promise in its blurb is
    // that the run's own cards are never at risk. It edits `GameState`, which is built
    // fresh per encounter, so the guarantee holds by construction — this pins it.
    const state = initGame({ registry: base, decks, seed: 5 });
    const before = state.players[0].deck.length;
    applyTrialToState(base, state, trialById('long-march')!);
    expect(state.players[0].deck.length).toBe(10);
    expect(state.players[1].deck.length).toBe(10);
    expect(before).toBeGreaterThan(10);
  });

  it('fixedEnergy overrides the round curve for both sides, including the opening turn', () => {
    const state = initGame({ registry: base, decks, seed: 5 });
    applyTrialToState(base, state, trialById('rationing')!);
    expect(state.energyOverride).toBe(4);
    // initGame already ran round 1's beginTurn, so the opener has to be topped up by hand
    // or the rule would not start until turn two.
    expect(state.players[state.active].energy).toBeGreaterThanOrEqual(4);
  });

  it('a sided twist adjusts exactly one seat', () => {
    const state = initGame({ registry: base, decks, seed: 5 });
    const before = [state.players[0].hand.length, state.players[1].hand.length];
    applyTrialToState(base, state, trialById('ambush')!);
    // Ambush: the enemy opens with 5 extra cards; the player gets energy, not cards.
    expect(state.players[1].hand.length).toBe(before[1]! + 5);
    expect(state.players[0].hand.length).toBe(before[0]);
    expect(state.players[0].energy).toBeGreaterThan(0);
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
    const twist = trialById('plague-fields')!; // both Ground lanes
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
    applyTrialToState(base, state, trialById('plague-fields')!);
    expect(state.environments.heights).toBeUndefined();
    expect(state.environments.water).toBeUndefined();
  });

  it('the Drowned King freezes the Grounds and opens the Water with Shallows', () => {
    const state = initGame({ registry: base, decks, seed: 1 });
    applyTrialToState(base, state, trialById('drowning-tide')!);
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
    expect(state.iidSeq).toBe(before + LANES.length * 2); // every lane, both sides
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

  it('composes a globalBuff and a globalOnPlayStatus through one composite twist', () => {
    // Was "The NICE Curse", a boss twist that stacked two global rules under one id. Eksana
    // now carries a boss RULE instead (Correction), so the composition itself is what is
    // still worth asserting — built here rather than read off a boss.
    const twist: TrialTwist = {
      id: 'c2', name: 'C2', blurb: '', kind: 'composite',
      twists: [
        { id: 'c2-buff', name: '', blurb: '', kind: 'globalBuff', stat: { hp: 3 } },
        { id: 'c2-poison', name: '', blurb: '', kind: 'globalOnPlayStatus', status: 'poison' },
      ],
    };
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
