import { describe, expect, it } from 'vitest';
import { buildRegistry } from '@cards/registry';
import { starterCards, starterLeaders } from '@cards/data/starter';
import { startRun, pickNode, resolveCombat, leaveNode } from '@adventure/run';
import { rollRelicChoices } from '@adventure/relics';
import { RELICS } from '@adventure/data/relics';
import type { MapNode, RunState } from '@adventure/schema';

const registry = buildRegistry(starterCards, starterLeaders);

/** Inject a battle node and travel to it (test-only surgery, as in run.test.ts). */
const teleportTo = (run: RunState, kind: MapNode['kind']): RunState => {
  const next = structuredClone(run);
  const id = `inj-${kind}`;
  next.map.nodes[id] = { id, kind, layer: 0, col: 99, next: [], seed: 4242, visited: false };
  next.map.layers[0] = [...next.map.layers[0]!, id];
  return pickNode(next, id);
};

/**
 * A long run eventually owns every relic a reward band can offer. When that happens the
 * roll comes back EMPTY — and an empty array is truthy, so it used to be stored on the
 * reward phase and then block `leaveNode` forever: the screen showed no relics to pick
 * (the view gates on `.length`) and no way out. A softlock, at the latest possible point
 * in a run.
 */
describe('a reward whose relic bands are exhausted', () => {
  it('rollRelicChoices really can come back empty', () => {
    const everything = RELICS.map((r) => r.id);
    expect(rollRelicChoices(1, ['rare', 'boss'], everything)).toEqual([]);
  });

  it('does not store an empty relicChoices on the reward phase', () => {
    let run = startRun('orsyric', 99, registry);
    run = teleportTo(run, 'boss');
    run.relics = RELICS.map((r) => r.id); // owns the shelf
    run.act = 4; // act 3+ boss: no unlock left, so the relic pick is the whole reward

    const after = resolveCombat(run, registry, true, 20);
    expect(after.phase.t).toBe('reward');
    if (after.phase.t !== 'reward') throw new Error('unreachable');
    expect(after.phase.relicChoices ?? []).toEqual([]);
    // Stored as absent, not as an empty array.
    expect(after.phase.relicChoices).toBeUndefined();
  });

  it('lets the player leave a reward that has an empty relic roll', () => {
    // A Trial is the clean case: its reward is coins + a relic and NO card pick, so once the
    // relic roll comes back empty there is genuinely nothing left to resolve.
    let run = startRun('orsyric', 99, registry);
    run = teleportTo(run, 'trial');
    run.relics = RELICS.map((r) => r.id);
    run.act = 4;

    const rewarded = resolveCombat(run, registry, true, 20);
    if (rewarded.phase.t !== 'reward') throw new Error('expected a reward phase');
    expect(rewarded.phase.relicChoices).toBeUndefined();
    expect(rewarded.phase.cardChoices).toBeUndefined();

    const left = leaveNode(rewarded);
    expect(left).not.toBe(rewarded); // the transition was accepted, not refused
    expect(left.phase.t).toBe('map');
  });

  it('un-sticks a run already SAVED in the empty-choices state', () => {
    // Persisted runs outlive the fix, so `leaveNode` has to tolerate the bad shape too.
    let run = startRun('orsyric', 99, registry);
    run = teleportTo(run, 'combat');
    const stuck: RunState = {
      ...run,
      phase: { t: 'reward', nodeId: 'inj-combat', coins: 0, relicChoices: [], cardChoices: [] },
    };
    expect(leaveNode(stuck)).not.toBe(stuck);
  });
});
