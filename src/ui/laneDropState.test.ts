/**
 * The drop-time rule affordances: a lane must show the OUTCOME of a drop before it happens.
 * These lock the two rules the tint teaches — Water drowning and lane capacity — to the same
 * behaviour the engine enforces in `resolvePosition` / `waterCompatible`.
 */
import { describe, it, expect } from 'vitest';
import { laneDropState } from '@ui/App';
import { unit } from '@engine/testkit';
import type { Lane } from '@engine/types';
import type { Card } from '@cards/schema';

const emptyLane = (): Lane => ({} as Lane);
const card = (keywords: Record<string, unknown> = {}): Card =>
  ({ id: 'x', name: 'X', type: 'unit', element: 'fire', cost: { energy: 1 }, attack: 1, hp: 1, keywords } as unknown as Card);

describe('laneDropState — capacity', () => {
  it('is ok when the lane is empty', () => {
    expect(laneDropState(emptyLane(), 'ground1', card(), undefined)).toBe('ok');
  });

  it('is full when the front is taken and nothing has Double Team', () => {
    const lane = { front: unit({ owner: 0, attack: 1, hp: 1 }) } as unknown as Lane;
    expect(laneDropState(lane, 'ground1', card(), undefined)).toBe('full');
  });

  it('is ok when the RESIDENT has Double Team and the back is free', () => {
    const lane = { front: unit({ owner: 0, attack: 1, hp: 1, keywords: { doubleTeam: true } }) } as unknown as Lane;
    expect(laneDropState(lane, 'ground1', card(), undefined)).toBe('ok');
  });

  it('is ok when the INCOMING card has Double Team', () => {
    const lane = { front: unit({ owner: 0, attack: 1, hp: 1 }) } as unknown as Lane;
    expect(laneDropState(lane, 'ground1', card({ doubleTeam: true }), undefined)).toBe('ok');
  });

  it('is full when both slots are taken even with Double Team', () => {
    const lane = {
      front: unit({ owner: 0, attack: 1, hp: 1, keywords: { doubleTeam: true } }),
      back: unit({ owner: 0, attack: 1, hp: 1 }),
    } as unknown as Lane;
    expect(laneDropState(lane, 'ground1', card(), undefined)).toBe('full');
  });
});

describe('laneDropState — water', () => {
  it('warns for a plain land unit entering Water', () => {
    expect(laneDropState(emptyLane(), 'water', card(), undefined)).toBe('drown');
  });

  it('does not warn for an Aquatic unit', () => {
    expect(laneDropState(emptyLane(), 'water', card({ aquatic: true }), undefined)).toBe('ok');
  });

  it('does not warn for an Airborne unit', () => {
    expect(laneDropState(emptyLane(), 'water', card({ airborne: true }), undefined)).toBe('ok');
  });

  it('does not warn when the lane Environment grants Aquatic (e.g. Shallows)', () => {
    expect(laneDropState(emptyLane(), 'water', card(), { aquatic: true } as never)).toBe('ok');
  });

  it('reports full before drown when Water is also out of room', () => {
    const lane = { front: unit({ owner: 0, attack: 1, hp: 1 }) } as unknown as Lane;
    expect(laneDropState(lane, 'water', card(), undefined)).toBe('full');
  });
});

describe('laneDropState — non-units', () => {
  it('never blocks a spell (targeting is handled elsewhere)', () => {
    const spell = { id: 's', name: 'S', type: 'spell', element: 'fire', cost: { energy: 1 }, effects: [] } as unknown as Card;
    const lane = { front: unit({ owner: 0, attack: 1, hp: 1 }) } as unknown as Lane;
    expect(laneDropState(lane, 'water', spell, undefined)).toBe('ok');
  });
});
