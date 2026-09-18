/**
 * The run's MEMORY — chains, deferred payoffs, state-gated choices, and the outcome kinds
 * that read or rewrite what the run already owns.
 *
 * Before these, every event was one screen, one choice, one payout, and the run forgot it
 * happened. That single missing capability is what ruled out an NPC you meet again, a
 * reward you have to walk back for, and a choice that exists because of what you are
 * carrying. Each test below pins one of those structures.
 */
import { describe, expect, it } from 'vitest';
import { buildRegistry } from '@cards/registry';
import { starterCards, starterLeaders } from '@cards/data/starter';
import { startRun, chooseEventOption, requirementMet, leaveGain, pickGainRelic } from '@adventure/run';
import { relicById } from '@adventure/data/relics';
import { EVENTS, eventById, pickEvent, outcomeSummary, choiceSummary, type EventOutcome } from '@adventure/data/events';
import { ECON } from '@adventure/economy';
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
      nodes: { ...run.map.nodes, [id]: { id, kind: 'event', layer: 0, col: 0, next: [], seed: 1234, visited: false, eventId } },
    },
    currentNodeId: id,
    phase: { t: 'event', nodeId: id },
  };
};

const choiceIdx = (eventId: string, label: string): number => {
  const idx = eventById(eventId)!.choices.findIndex((c) => c.label.startsWith(label));
  expect(idx, `${eventId} has no choice starting "${label}"`).toBeGreaterThanOrEqual(0);
  return idx;
};

/** Every outcome reachable from a choice, flattening gambles and multis. */
const outcomes = (o: EventOutcome): EventOutcome[] =>
  o.kind === 'gamble' ? [o, ...outcomes(o.win), ...outcomes(o.lose)]
    : o.kind === 'multi' ? [o, ...o.outcomes.flatMap(outcomes)]
      : [o];

describe('chain gating', () => {
  it('a later chain part is unreachable until the earlier one has opened it', () => {
    const gated = EVENTS.filter((e) => e.requiresFlag);
    expect(gated.length, 'no chains authored').toBeGreaterThan(0);
    for (const e of gated) {
      // Some other event must actually be able to set the flag, or the part is dead content.
      const opener = EVENTS.some((other) =>
        other.choices.some((c) => outcomes(c.outcome).some((o) => o.kind === 'flag' && o.flag === e.requiresFlag)));
      expect(opener, `${e.id} requires "${e.requiresFlag}" which nothing sets`).toBe(true);
    }
    // And the picker honours it: with no flags, no gated event can ever be drawn.
    for (let seed = 0; seed < 60; seed++) {
      expect(pickEvent(seed, [], []).requiresFlag).toBeUndefined();
    }
  });

  it('opens the next part once the flag is set', () => {
    const flag = EVENTS.find((e) => e.requiresFlag)!.requiresFlag!;
    // Mark everything else seen so the unseen filter has to reach for the gated part.
    const seen = EVENTS.filter((e) => e.requiresFlag !== flag).map((e) => e.id);
    const picked = pickEvent(3, seen, [flag]);
    expect(picked.requiresFlag).toBe(flag);
  });

  it('the Tinker remembers you, and the reckoning can clear the debt he created', () => {
    // Part 1: take the relic and the ballast; the flag opens part 2.
    const first = chooseEventOption(atEvent('tinker-1'), base, choiceIdx('tinker-1', 'Take a relic'));
    expect(first.eventFlags).toContain('tinker');
    const junk = (r: RunState): number => r.deck.filter((c) => c.cardId === 'dead-weight').length;
    expect(junk(first)).toBe(1);

    // Part 3: handing everything back removes every copy of the junk.
    const owed = atEvent('tinker-3', { deck: [...first.deck], eventFlags: ['tinker', 'tinker2'] });
    const settled = chooseEventOption(owed, base, choiceIdx('tinker-3', 'Give back'));
    expect(junk(settled)).toBe(0);
    // And it pays a boss-band relic for the trouble.
    expect(settled.phase.t).toBe('gain');
    if (settled.phase.t === 'gain') expect(settled.phase.relicChoices?.length).toBeGreaterThan(0);
  });
});

describe('deferred payoff', () => {
  it('banks on deposit and pays out at a later event', () => {
    const run = atEvent('ossuary-bank', { coins: 300 });
    const deposited = chooseEventOption(run, base, choiceIdx('ossuary-bank', 'Deposit 60'));
    expect(deposited.coins).toBe(240); // the cost was taken
    expect(deposited.eventBank).toBe(150);

    // Walking back to a bank later collects it.
    const returning = atEvent('ossuary-bank', { coins: deposited.coins, eventBank: deposited.eventBank });
    const withdrawn = chooseEventOption(returning, base, choiceIdx('ossuary-bank', 'Withdraw'));
    expect(withdrawn.coins).toBe(240 + 150);
    expect(withdrawn.eventBank).toBe(0);
  });

  it('refuses the withdrawal when nothing is held', () => {
    const empty = atEvent('ossuary-bank', { coins: 300, eventBank: 0 });
    const idx = choiceIdx('ossuary-bank', 'Withdraw');
    expect(requirementMet(empty, eventById('ossuary-bank')!.choices[idx]!.requires)).toBe(false);
    expect(chooseEventOption(empty, base, idx)).toBe(empty); // and the reducer agrees
  });
});

describe('state-gated choices', () => {
  it('reads relics, flags, bank and held cards', () => {
    const run = startRun('orsyric', 42, base);
    expect(requirementMet({ ...run, relics: ['ember-cache'] }, { relicsAtLeast: 2 })).toBe(false);
    expect(requirementMet({ ...run, relics: ['ember-cache', 'iron-ration'] }, { relicsAtLeast: 2 })).toBe(true);
    expect(requirementMet({ ...run, eventFlags: ['tinker'] }, { flag: 'tinker' })).toBe(true);
    expect(requirementMet({ ...run, eventFlags: ['tinker'] }, { notFlag: 'tinker' })).toBe(false);
    expect(requirementMet({ ...run, eventBank: 40 }, { bankAtLeast: 1 })).toBe(true);
    expect(requirementMet(run, { cardsOwned: { cardId: 'dead-weight', count: 1 } })).toBe(false);
  });

  it('the reducer refuses a gated choice, so a stale UI cannot take it', () => {
    // The Fence's sell option needs two relics; with none it must be a no-op transition
    // rather than a payout for nothing.
    const broke = atEvent('the-fence', { relics: [] });
    expect(chooseEventOption(broke, base, choiceIdx('the-fence', 'Sell him'))).toBe(broke);
  });
});

describe('outcomes that read or rewrite what the run owns', () => {
  it('sellRelic removes a relic and pays for it', () => {
    const run = atEvent('the-fence', { relics: ['ember-cache', 'iron-ration'], coins: 0 });
    const after = chooseEventOption(run, base, choiceIdx('the-fence', 'Sell him'));
    expect(after.relics.length).toBe(1);
    expect(after.coins).toBe(200);
  });

  it('tradeRelic gives one up and offers a replacement to CHOOSE', () => {
    const run = atEvent('the-fence', { relics: ['ember-cache', 'iron-ration'], coins: 200 });
    const after = chooseEventOption(run, base, choiceIdx('the-fence', 'Trade a relic'));
    expect(after.relics.length).toBe(1);
    expect(after.phase.t).toBe('gain');
    if (after.phase.t !== 'gain') return;
    const offered = after.phase.relicChoices ?? [];
    expect(offered.length).toBeGreaterThan(0);
    // Claiming closes the gate, and only then can the screen be left.
    expect(leaveGain(after)).toBe(after);
    const claimed = pickGainRelic(after, offered[0]!, base);
    expect(claimed.relics).toContain(offered[0]);
    expect(leaveGain(claimed).phase.t).toBe('map');
  });

  it('trimDeck and purge both floor at the minimum playable deck', () => {
    const tiny = startRun('orsyric', 42, base).deck.slice(0, ECON.MIN_DECK_SIZE + 1);
    const run = atEvent('the-culling', { deck: tiny });
    const idx = choiceIdx('the-culling', 'Burn three');
    // `requiresDeck: 9` should refuse outright rather than trimming to the floor silently.
    expect(chooseEventOption(run, base, idx)).toBe(run);

    // With a big enough deck it cuts exactly what it promises.
    const big = atEvent('the-culling');
    const burned = chooseEventOption(big, base, idx);
    expect(burned.deck.length).toBe(big.deck.length - 3);
  });

  it('temper only ever buffs cards that have stats', () => {
    const run = atEvent('tinker-3', { eventFlags: ['tinker', 'tinker2'] });
    const after = chooseEventOption(run, base, choiceIdx('tinker-3', 'Keep the lot'));
    const buffed = after.deck.filter((c) => c.enhancements.length > 0);
    expect(buffed.length).toBe(2);
    for (const c of buffed) {
      const def = base.cards.get(c.cardId);
      expect(def?.type === 'unit' || def?.type === 'foundation', c.cardId).toBe(true);
    }
  });

  it('a multi outcome resolves every part in order', () => {
    const run = atEvent('the-vigil');
    const before = run.coins;
    const after = chooseEventOption(run, base, choiceIdx('the-vigil', 'Take everything'));
    expect(after.coins).toBe(before + 130);
    expect(after.deck.filter((c) => c.cardId === 'dead-weight').length).toBe(1);
  });
});

describe('the whole event table still holds its old guarantees', () => {
  it('never references a card, twist or flag that does not exist', () => {
    const settableFlags = new Set(
      EVENTS.flatMap((e) => e.choices.flatMap((c) => outcomes(c.outcome)))
        .flatMap((o) => (o.kind === 'flag' ? [o.flag] : [])),
    );
    for (const e of EVENTS) {
      if (e.requiresFlag) expect(settableFlags, `${e.id}`).toContain(e.requiresFlag);
      for (const c of e.choices) {
        if (c.requires?.flag) expect(settableFlags, `${e.id}`).toContain(c.requires.flag);
        for (const o of outcomes(c.outcome)) {
          if (o.kind === 'card' && o.cardId !== 'random') expect(base.cards.has(o.cardId), `${e.id}: ${o.cardId}`).toBe(true);
          if (o.kind === 'curse') expect(base.cards.has(o.cardId), `${e.id}: ${o.cardId}`).toBe(true);
          if (o.kind === 'purge') expect(base.cards.has(o.cardId), `${e.id}: ${o.cardId}`).toBe(true);
        }
      }
    }
  });

  it('keeps every gamble a real coin-flip, including inside a multi', () => {
    for (const e of EVENTS) {
      for (const c of e.choices) {
        for (const o of outcomes(c.outcome)) {
          if (o.kind !== 'gamble') continue;
          expect(o.p, `${e.id} p`).toBeGreaterThan(0);
          expect(o.p, `${e.id} p`).toBeLessThan(1);
          expect(JSON.stringify(o.win), `${e.id} win/lose identical`).not.toBe(JSON.stringify(o.lose));
        }
      }
    }
  });

  it('every deposit is worth more than it costs, or nobody would ever bank', () => {
    for (const e of EVENTS) {
      for (const c of e.choices) {
        for (const o of outcomes(c.outcome)) {
          if (o.kind !== 'deposit') continue;
          // The payout has to beat the stake — the risk being paid for is that the run
          // may never reach another '?' node, not a bad exchange rate.
          expect(o.payout, `${e.id} banks at a loss`).toBeGreaterThan(c.cost ?? 0);
        }
      }
    }
  });
});

describe('mending: an event can buy out a broken relic\u2019s debt', () => {
  it('repairs broken relics before relighting spent ones', () => {
    // Broken first because a broken relic is actively costing the player something,
    // where a spent one is merely inert.
    const run = atEvent('the-wick-trimmer', {
      coins: 500,
      relics: ['corrupted-code', 'phoenix-ember'],
      relicRepair: { 'corrupted-code': 3 },
      spentRelics: ['phoenix-ember'],
    });
    const after = chooseEventOption(run, base, choiceIdx('the-wick-trimmer', 'Have them mend what you carry'));
    expect(after.relicRepair['corrupted-code'], 'the broken relic should be fixed').toBeUndefined();
    expect(after.spentRelics, 'and the spent one relit by the second charge').toEqual([]);
    expect(after.coins).toBe(410);
  });

  it('hides the offer entirely when there is nothing to mend', () => {
    // A repair shop with nothing to repair is a dead door; `requirementMet` hides it.
    const whole = atEvent('the-wick-trimmer', { coins: 500, relics: ['ember-cache'] });
    const idx = choiceIdx('the-wick-trimmer', 'Have them mend what you carry');
    expect(requirementMet(whole, eventById('the-wick-trimmer')!.choices[idx]!.requires)).toBe(false);
    expect(chooseEventOption(whole, base, idx)).toBe(whole);
  });

  it('selling a broken relic takes its debt with it', () => {
    // Otherwise re-acquiring the relic later would inherit a countdown from a life the
    // player no longer remembers owning.
    const run = atEvent('the-wick-trimmer', {
      relics: ['corrupted-code', 'ember-cache'],
      relicRepair: { 'corrupted-code': 3 },
    });
    const after = chooseEventOption(run, base, choiceIdx('the-wick-trimmer', 'Sell them a charm'));
    const soldTheBrokenOne = !after.relics.includes('corrupted-code');
    if (soldTheBrokenOne) expect(after.relicRepair['corrupted-code']).toBeUndefined();
    else expect(after.relicRepair['corrupted-code']).toBe(3);
  });
});

describe('every choice states exactly what it does', () => {
  it('summarises every outcome kind the table actually uses', () => {
    // The failure this guards: a choice whose flavour label says nothing about the
    // effect, so the player is picking blind. `outcomeSummary` is DERIVED from the same
    // outcome the reducer applies, so the only way to ship an unexplained option is to
    // add an outcome kind — and the exhaustiveness guard in the switch makes that a
    // compile error. This asserts the runtime half: nothing renders blank.
    const kinds = new Set<string>();
    for (const e of EVENTS) {
      for (const c of e.choices) {
        const text = choiceSummary(c, base);
        expect(text.length, `${e.id} / "${c.label}" explains nothing`).toBeGreaterThan(0);
        for (const o of outcomes(c.outcome)) kinds.add(o.kind);
      }
    }
    // And each kind in isolation, so a kind used only inside a gamble is still covered.
    for (const kind of kinds) {
      const sample = EVENTS.flatMap((e) => e.choices.flatMap((c) => outcomes(c.outcome))).find((o) => o.kind === kind)!;
      expect(outcomeSummary(sample, base).length, `${kind} renders blank`).toBeGreaterThan(0);
    }
  });

  it('names real cards rather than raw ids, and survives having no registry', () => {
    const curse = EVENTS.flatMap((e) => e.choices).map((c) => c.outcome).find((o) => o.kind === 'curse')!;
    expect(outcomeSummary(curse, base)).not.toContain('dead-weight');
    // Without a registry it degrades to the id: ugly, but never wrong.
    expect(outcomeSummary(curse).length).toBeGreaterThan(0);
  });

  it('brackets a nested gamble so each "otherwise" binds to its own roll', () => {
    // Flat, a press-your-luck chain reads "80%: 60%: X — otherwise Y — otherwise Z",
    // which gives the reader no way to pair an outcome with the roll that caused it.
    const chained = eventById('the-turning-card')!.choices.find((c) => c.label.includes('third'))!;
    const text = outcomeSummary(chained.outcome, base);
    expect(text).toContain('(');
    expect(text).toContain('else');
    // Balanced, or the brackets are worse than none.
    expect(text.split('(').length).toBe(text.split(')').length);
  });

  it('spells out BOTH halves of a gamble, with the real odds', () => {
    // A gamble whose downside is not on screen is not a gamble the player agreed to.
    const gamble = EVENTS.flatMap((e) => e.choices).map((c) => c.outcome).find((o) => o.kind === 'gamble')!;
    const text = outcomeSummary(gamble, base);
    expect(text).toMatch(/%/);
    expect(text).toContain('otherwise');
  });

  it('puts the price before the payout on a costed choice', () => {
    const costed = EVENTS.flatMap((e) => e.choices).find((c) => c.cost)!;
    expect(choiceSummary(costed, base).startsWith('Pay ⊙')).toBe(true);
    const bloody = EVENTS.flatMap((e) => e.choices).find((c) => c.hpCost)!;
    expect(choiceSummary(bloody, base)).toContain('HP');
  });
});

describe('currency events: named grants, explicit choices, live percentages', () => {
  it('The Adjudicator grants the exact named relic, with no choice screen', () => {
    const run = atEvent('the-adjudicator');
    const after = chooseEventOption(run, base, choiceIdx('the-adjudicator', 'Accept the harder terms'));
    expect(after.relics).toContain('overclock-contract');
    expect(after.phase.t).toBe('gain');
    if (after.phase.t === 'gain') {
      expect(after.phase.relicChoices, 'no choice — the acceptance already was the act').toBeUndefined();
      expect(after.phase.gainedRelics).toContain('overclock-contract');
    }
  });

  it('The Underwriters offers exactly its own two relics, not a band roll', () => {
    const run = atEvent('the-underwriters');
    const after = chooseEventOption(run, base, choiceIdx('the-underwriters', 'Sign both contracts'));
    expect(after.phase.t).toBe('gain');
    if (after.phase.t !== 'gain') return;
    expect(after.phase.relicChoices).toEqual(['underwriters-bond', 'underwriters-payout']);
    const claimed = pickGainRelic(after, 'underwriters-payout', base);
    expect(claimed.relics).toEqual(['underwriters-payout']);
    expect(claimed.relics).not.toContain('underwriters-bond'); // choosing one does not grant both
  });

  it('a chooseRelic offer never re-offers a relic already owned', () => {
    const run = atEvent('the-underwriters', { relics: ['underwriters-bond'] });
    const after = chooseEventOption(run, base, choiceIdx('the-underwriters', 'Sign both contracts'));
    if (after.phase.t !== 'gain') throw new Error('expected the gain screen');
    expect(after.phase.relicChoices).toEqual(['underwriters-payout']);
  });

  it('The Investment Office resolves its stakes LIVE against the purse, not a fixed number', () => {
    const rich = atEvent('the-investment-office', { coins: 400 });
    const poor = atEvent('the-investment-office', { coins: 40 });
    const idx = choiceIdx('the-investment-office', 'Invest cautiously');
    expect(chooseEventOption(rich, base, idx).coins).toBe(600); // +50% of 400
    expect(chooseEventOption(poor, base, idx).coins).toBe(60); // +50% of 40 — same RATE, different money
  });

  it('the reckless tier can wipe the purse to zero, and never below it', () => {
    const run = atEvent('the-investment-office', { coins: 200 });
    const idx = choiceIdx('the-investment-office', 'Invest recklessly');
    // Seed-deterministic: whichever way this particular roll falls, coins must land on
    // exactly double or exactly zero — never negative, never a partial amount.
    const after = chooseEventOption(run, base, idx);
    expect([0, 400]).toContain(after.coins);
  });

  it('walks away with nothing changed, and every reachable option resolves to a real relic', () => {
    const run = atEvent('the-investment-office', { coins: 200 });
    const idx = choiceIdx('the-investment-office', 'Keep your coin');
    expect(chooseEventOption(run, base, idx).coins).toBe(200);

    for (const id of ['overclock-contract', 'underwriters-bond', 'underwriters-payout']) {
      expect(relicById(id), id).toBeTruthy();
    }
  });
});

describe('The Ossuary Bank: a third tier that pays a bonus relic, Ka-ching-style', () => {
  it('deposits the top tier and offers a bonus relic in the same motion', () => {
    const run = atEvent('ossuary-bank', { coins: 300 });
    const idx = choiceIdx('ossuary-bank', 'Deposit 220');
    const after = chooseEventOption(run, base, idx);
    expect(after.coins).toBe(300 - 220); // the deposit's cost was taken
    expect(after.eventBank).toBe(640); // banked for later, same as the other tiers
    expect(after.phase.t).toBe('gain');
    if (after.phase.t === 'gain') expect(after.phase.relicChoices?.length).toBeGreaterThan(0);
  });
});
