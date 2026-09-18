import { describe, expect, it } from 'vitest';
import { buildRegistry } from '@cards/registry';
import { starterCards, starterLeaders } from '@cards/data/starter';
import { LANES, DEFAULT_LANE_LAYOUT, isHeights, isGround, isWater, laneAllowed, type LaneLayout } from '@engine/constants';
import { initGame } from '@engine/setup';
import { applyAction } from '@engine/engine';
import { applyLaneLayout } from '@engine/bossRules';
import type { Deck } from '@cards/schema';
import type { GameState } from '@engine/types';

const base = buildRegistry(starterCards, starterLeaders);
const units = starterCards.filter((c) => c.type === 'unit' && !c.wip).slice(0, 20).map((c) => ({ cardId: c.id, count: 1 }));
const decks: [Deck, Deck] = [
  { name: 'P', leaderId: 'orsyric', cards: units },
  { name: 'E', leaderId: 'kedou', cards: units },
];
const fresh = (): GameState => initGame({ registry: base, decks, seed: 11, first: 0 });

/** Naife's board: Water on the flanks, three silted Grounds in the middle. */
const DROWNED_COAST: LaneLayout = {
  heights: 'water', ground1: 'ground', water: 'ground', ground2: 'ground', heights2: 'water',
};

describe('lane layout: identity is fixed, TYPE is per-fight', () => {
  it('an absent layout is exactly the printed board', () => {
    // Every existing caller passes no layout, so the default has to be the old behaviour
    // literally rather than approximately.
    expect(isHeights('heights')).toBe(true);
    expect(isHeights('heights2')).toBe(true);
    expect(isGround('ground1')).toBe(true);
    expect(isGround('ground2')).toBe(true);
    expect(isWater('water')).toBe(true);
    for (const lane of LANES) {
      expect(isHeights(lane, DEFAULT_LANE_LAYOUT)).toBe(isHeights(lane));
      expect(isGround(lane, DEFAULT_LANE_LAYOUT)).toBe(isGround(lane));
      expect(isWater(lane, DEFAULT_LANE_LAYOUT)).toBe(isWater(lane));
    }
  });

  it('keeps the five columns and their order — only what they MEAN changes', () => {
    const s = fresh();
    applyLaneLayout(base, s, DROWNED_COAST);
    // The ids and the left-to-right order are what `adjacentLanes` indexes for splash and
    // collateral, and what every saved state and animation addresses. They never move.
    expect(Object.keys(s.players[0].lanes)).toEqual([...LANES]);
    expect(isWater('heights', s.laneTypes)).toBe(true);
    expect(isGround('water', s.laneTypes)).toBe(true);
    expect(isHeights('heights', s.laneTypes)).toBe(false);
  });

  it('sinks units standing in a column that just became Water, and surfaces the reverse', () => {
    const s = fresh();
    // A grounded body in the printed Heights, and one in the printed Water (drowning).
    s.players[0].lanes.heights.front = {
      iid: 'a', cardId: 'coal-runner', owner: 0, attack: 4, hp: 4, maxHp: 4,
      keywords: {}, status: {}, turnsInPlay: 1, justPlaced: false,
    };
    s.players[0].lanes.water.front = {
      iid: 'b', cardId: 'coal-runner', owner: 0, attack: 0, hp: 4, maxHp: 4,
      keywords: {}, status: { drowning: true }, predrownAttack: 3, turnsInPlay: 1, justPlaced: false,
    };
    applyLaneLayout(base, s, DROWNED_COAST);
    // heights -> water: it sinks, and its real attack is parked, not lost.
    const sunk = s.players[0].lanes.heights.front!;
    expect(sunk.status.drowning).toBe(true);
    expect(sunk.attack).toBe(0);
    expect(sunk.predrownAttack).toBe(4);
    // water -> ground: it surfaces, and gets its parked attack back.
    const surfaced = s.players[0].lanes.water.front!;
    expect(surfaced.status.drowning).toBeFalsy();
    expect(surfaced.attack).toBe(3);
  });

  it('re-lays BOTH boards, not just the player\'s', () => {
    const s = fresh();
    s.players[1].lanes.heights.front = {
      iid: 'e', cardId: 'coal-runner', owner: 1, attack: 2, hp: 2, maxHp: 2,
      keywords: {}, status: {}, turnsInPlay: 1, justPlaced: false,
    };
    applyLaneLayout(base, s, DROWNED_COAST);
    expect(s.players[1].lanes.heights.front!.status.drowning).toBe(true);
  });

  it('an Airborne body is untouched by the water moving under it', () => {
    const s = fresh();
    s.players[0].lanes.heights.front = {
      iid: 'f', cardId: 'coal-runner', owner: 0, attack: 3, hp: 3, maxHp: 3,
      keywords: { airborne: true }, status: {}, turnsInPlay: 1, justPlaced: false,
    };
    applyLaneLayout(base, s, DROWNED_COAST);
    expect(s.players[0].lanes.heights.front!.status.drowning).toBeFalsy();
    expect(s.players[0].lanes.heights.front!.attack).toBe(3);
  });

  it('Environment legality follows the TYPE, not the column name', () => {
    // Tundra is ground-only (`lanes: []`). On the printed board it cannot go in 'water';
    // on the Drowned Coast that column IS ground, so it can — and the printed Heights,
    // now water, refuses it.
    expect(laneAllowed([], 'water')).toBe(false);
    expect(laneAllowed([], 'water', DROWNED_COAST)).toBe(true);
    expect(laneAllowed([], 'heights', DROWNED_COAST)).toBe(false);
    // An environment that opts into water follows the water.
    expect(laneAllowed(['water'], 'heights', DROWNED_COAST)).toBe(true);
  });

  it('pre-places Environments into the new lanes, and refuses illegal ones', () => {
    const s = fresh();
    applyLaneLayout(base, s, DROWNED_COAST, [
      { lane: 'ground1', cardId: 'tundra' },
      { lane: 'water', cardId: 'tundra' },
      { lane: 'heights', cardId: 'tundra' }, // now Water — ground-only Tundra cannot go here
    ]);
    expect(s.environments.ground1?.cardId).toBe('tundra');
    expect(s.environments.water?.cardId).toBe('tundra');
    expect(s.environments.heights).toBeUndefined();
  });

  it('a unit played into a re-laid Water column drowns, through the normal play path', () => {
    const s = fresh();
    applyLaneLayout(base, s, DROWNED_COAST);
    s.players[0].energy = 99;
    const grounded = s.players[0].hand.find((c) => {
      const d = base.cards.get(c.cardId)!;
      return d.type === 'unit' && !d.keywords.airborne && !d.keywords.aquatic;
    })!;
    const res = applyAction(base, s, { type: 'playUnit', iid: grounded.iid, lane: 'heights' });
    expect(res.state.players[0].lanes.heights.front!.status.drowning).toBe(true);
  });
});
