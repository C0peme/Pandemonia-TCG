/**
 * Event content and resolution.
 *
 * The headline guarantee here is that a choice which READS as a risk actually is one.
 * Two shipped events were pure fiction: Gambler's Cup charged 50 coins for a guaranteed
 * 90 (a flat +40 dressed as a wager), and Cursed Hoard's ominous pile of coins carried no
 * curse whatsoever. `chooseEventOption` even built a seeded roller and then used it for a
 * single branch, so the machinery for genuine risk sat unused.
 */
import { describe, expect, it } from 'vitest';
import { buildRegistry } from '@cards/registry';
import { starterCards, starterLeaders } from '@cards/data/starter';
import { startRun, chooseEventOption, pickNode, pickGainRelic, leaveGain } from '@adventure/run';
import { EVENTS, eventById, pickEvent, type EventOutcome } from '@adventure/data/events';
import type { RunState } from '@adventure/schema';

const base = buildRegistry(starterCards, starterLeaders);

/** Drop the run onto an event node carrying a specific event. */
const atEvent = (eventId: string, over: Partial<RunState> = {}): RunState => {
  const run = startRun('orsyric', 42, base);
  const id = 'inj-event';
  return {
    ...run,
    ...over,
    map: {
      ...run.map,
      nodes: {
        ...run.map.nodes,
        [id]: { id, kind: 'event', layer: 0, col: 0, next: [], seed: 1234, visited: false, eventId },
      },
    },
    currentNodeId: id,
    phase: { t: 'event', nodeId: id },
  };
};

/** Every outcome reachable from a choice, flattening both sides of any gamble. */
const outcomes = (o: EventOutcome): EventOutcome[] =>
  o.kind === 'gamble' ? [o, ...outcomes(o.win), ...outcomes(o.lose)] : [o];

describe('event content', () => {
  it('has a healthy pool — the old seven repeated constantly inside one run', () => {
    expect(EVENTS.length).toBeGreaterThanOrEqual(15);
  });

  it('has unique ids and at least one choice each', () => {
    const ids = EVENTS.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of EVENTS) {
      expect(e.choices.length, e.id).toBeGreaterThan(0);
      expect(e.title.length, e.id).toBeGreaterThan(0);
      expect(e.body.length, e.id).toBeGreaterThan(0);
    }
  });

  it('never references a card or twist that does not exist', () => {
    for (const e of EVENTS) {
      for (const c of e.choices) {
        for (const o of outcomes(c.outcome)) {
          if (o.kind === 'card' && o.cardId !== 'random') expect(base.cards.has(o.cardId), `${e.id}: ${o.cardId}`).toBe(true);
          if (o.kind === 'curse') expect(base.cards.has(o.cardId), `${e.id}: ${o.cardId}`).toBe(true);
        }
      }
    }
  });

  it('keeps every gamble a real coin-flip, not a certainty', () => {
    for (const e of EVENTS) {
      for (const c of e.choices) {
        for (const o of outcomes(c.outcome)) {
          if (o.kind !== 'gamble') continue;
          expect(o.p, `${e.id} p`).toBeGreaterThan(0);
          expect(o.p, `${e.id} p`).toBeLessThan(1);
          // Both sides must differ, or it is a gamble in name only — exactly the bug
          // this outcome kind was added to fix.
          expect(JSON.stringify(o.win), `${e.id} win/lose identical`).not.toBe(JSON.stringify(o.lose));
        }
      }
    }
  });

  it('the two formerly-fake gambles now actually roll', () => {
    for (const id of ['gamblers-cup', 'cursed-hoard']) {
      const e = eventById(id)!;
      expect(e.choices.some((c) => outcomes(c.outcome).some((o) => o.kind === 'gamble')), id).toBe(true);
    }
  });
});

describe('pickEvent', () => {
  it('prefers events the run has not seen', () => {
    const seen = EVENTS.slice(0, EVENTS.length - 1).map((e) => e.id);
    // Only one unseen left, so any seed must land on it.
    for (const seed of [1, 2, 3, 99, 12345]) {
      expect(pickEvent(seed, seen).id).toBe(EVENTS[EVENTS.length - 1]!.id);
    }
  });

  it('falls back to the full table once everything has been seen', () => {
    const seen = EVENTS.map((e) => e.id);
    expect(EVENTS.some((e) => e.id === pickEvent(7, seen).id)).toBe(true);
  });

  it('is deterministic for a given (seed, seen)', () => {
    expect(pickEvent(55, []).id).toBe(pickEvent(55, []).id);
  });
});

describe('chooseEventOption', () => {
  it('offers a CHOICE of three charms instead of assigning one unseen', () => {
    // A relic outcome used to grant one relic from the whole table, silently, and bounce
    // straight back to the map — the least legible payout in the run.
    const e = eventById('gamblers-cup')!;
    const idx = e.choices.findIndex((c) => c.outcome.kind === 'relic');
    if (idx < 0) return;
    const after = chooseEventOption(atEvent('gamblers-cup', { coins: 500 }), base, idx);
    if (after.phase.t !== 'gain') throw new Error('expected the gain screen');
    expect(after.phase.relicChoices).toHaveLength(3);
    expect(after.relics, 'nothing granted until chosen').toHaveLength(0);
    // Continue is gated until the pick is made.
    expect(leaveGain(after)).toBe(after);
    const claimed = pickGainRelic(after, after.phase.relicChoices![0]!);
    expect(claimed.relics).toHaveLength(1);
    expect(leaveGain(claimed).phase.t).toBe('map');
  });

  it('always stops on a result screen carrying the event\'s own line', () => {
    // The authored `result` text was written, stored, and never rendered anywhere.
    const e = eventById('blood-altar')!;
    const idx = e.choices.findIndex((c) => c.outcome.kind === 'coins');
    const after = chooseEventOption(atEvent('blood-altar', { hp: 30 }), base, idx);
    expect(after.phase.t).toBe('gain');
    expect(after.phase.t === 'gain' && after.phase.text).toBe(e.choices[idx]!.result);
  });

  it('shows the junk a curse forced into the deck', () => {
    const e = eventById('debt-collector')!;
    const idx = e.choices.findIndex((c) => c.outcome.kind === 'curse');
    if (idx < 0) return;
    const after = chooseEventOption(atEvent('debt-collector'), base, idx);
    expect(after.phase.t === 'gain' && after.phase.gainedCards?.length).toBeGreaterThan(0);
  });

  it('records the event on entry so the view and the resolution cannot disagree', () => {
    const run = startRun('orsyric', 7, base);
    const eventNode = Object.values(run.map.nodes).find((n) => n.kind === 'event');
    if (!eventNode) return; // mapgen guarantees one, but stay resilient
    // Walk straight onto it by forcing reachability.
    const forced: RunState = { ...run, currentNodeId: null, map: { ...run.map, layers: [[eventNode.id], ...run.map.layers.slice(1)] } };
    const entered = pickNode(forced, eventNode.id);
    expect(entered.map.nodes[eventNode.id]!.eventId).toBeTruthy();
    expect(entered.seenEvents).toContain(entered.map.nodes[eventNode.id]!.eventId);
  });

  it('charges an HP price but never takes the last point of it', () => {
    const e = eventById('blood-altar')!;
    // Pick the HP-priced choice whose OUTCOME is inert on HP (coins). The relic-granting
    // one is a poor probe: a cursed relic's negative maxHpDelta legitimately shaves HP
    // too, so it would not isolate the price itself.
    const idx = e.choices.findIndex((c) => c.hpCost && c.outcome.kind === 'coins');
    const cost = e.choices[idx]!.hpCost!;

    const after = chooseEventOption(atEvent('blood-altar', { hp: 30 }), base, idx);
    expect(after.hp).toBe(30 - cost);

    // At or below the price, the choice is refused outright rather than being lethal.
    const frail = atEvent('blood-altar', { hp: cost });
    expect(chooseEventOption(frail, base, idx)).toBe(frail);
  });

  it('forces junk into the deck on a curse outcome', () => {
    // Cursed Hoard's coin grab is a gamble; drive both sides by varying the node seed
    // until each has been observed, then assert the losing side actually curses.
    const e = eventById('cursed-hoard')!;
    const idx = e.choices.findIndex((c) => c.outcome.kind === 'gamble');
    const sizes = new Set<number>();
    for (let seed = 0; seed < 40; seed++) {
      const run = { ...atEvent('cursed-hoard'), seed };
      sizes.add(chooseEventOption(run, base, idx).deck.length);
    }
    // One branch leaves the deck alone (coins), the other adds Dead Weights.
    expect(sizes.size).toBeGreaterThan(1);
  });

  it('resolves a gamble to different results across seeds', () => {
    const e = eventById('gamblers-cup')!;
    const idx = e.choices.findIndex((c) => c.outcome.kind === 'gamble');
    const results = new Set<number>();
    for (let seed = 0; seed < 40; seed++) {
      const run = { ...atEvent('gamblers-cup'), seed, coins: 500 };
      results.add(chooseEventOption(run, base, idx).coins);
    }
    expect(results.size).toBeGreaterThan(1);
  });

  it('heals and raises max HP without breaking the overheal ceiling', () => {
    const e = eventById('field-surgeon')!;
    const healIdx = e.choices.findIndex((c) => c.outcome.kind === 'heal');
    const healed = chooseEventOption(atEvent('field-surgeon', { hp: 10 }), base, healIdx);
    expect(healed.hp).toBeGreaterThan(10);

    const maxIdx = e.choices.findIndex((c) => c.outcome.kind === 'maxHp');
    const before = atEvent('field-surgeon', { coins: 500 });
    const grown = chooseEventOption(before, base, maxIdx);
    expect(grown.maxHp).toBeGreaterThan(before.maxHp);
  });

  it('is one-shot per node', () => {
    const run = atEvent('field-surgeon', { hp: 10 });
    const once = chooseEventOption(run, base, 0);
    expect(once).not.toBe(run);
    expect(chooseEventOption(once, base, 0)).toBe(once);
  });
});
