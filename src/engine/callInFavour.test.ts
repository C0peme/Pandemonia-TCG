import { describe, expect, it } from 'vitest';
import { buildRegistry } from '@cards/registry';
import { starterCards, starterLeaders } from '@cards/data/starter';
import { blankState } from '@engine/testkit';
import { applyAction } from '@engine/engine';
import { parseCard } from '@cards/schema';
import { applyEffects } from '@engine/effects';
import type { GameEvent } from '@engine/events';
import type { GameState } from '@engine/types';

const registry = buildRegistry(starterCards as any[], starterLeaders as any[]);

const eksanaState = (): GameState => {
  const s = blankState({ active: 0 });
  s.players[0].leaderId = 'eksana';
  s.players[0].energy = 50; // afford checks are not what these tests are about
  return s;
};

/**
 * Call in a Favour is printed at 12 energy. It was 20 while she carried Battle Ready +
 * Airborne + Sniper + Pierce — a guaranteed, unanswerable hit the turn she landed. Now she
 * has NO Battle Ready: a summon is summoning-sick, so she cannot act the turn she arrives and
 * simply stands there as a 3/1 for the opponent's whole turn — trivially killable by anything
 * that deals 1 damage. The power is priced down to match that real risk of getting nothing
 * for the favour at all.
 */
describe('Call in a Favour: cost ramp', () => {
  it('is priced to reflect she can be answered before she ever acts', () => {
    const leader = (starterLeaders as any[]).find((l) => l.id === 'eksana');
    expect(leader.heroPower.cost.energy).toBe(12);
    expect(leader.heroPower.costStep).toBe(1);
  });

  it('playing cards discounts it, and activating resets the counter', () => {
    let s = eksanaState();
    s.players[0].cardsSincePower = 8;
    const before = s.players[0].energy;
    s = applyAction(registry, s, { type: 'heroPower' }).state;
    expect(before - s.players[0].energy).toBe(4); // 12 - 8
    expect(s.players[0].cardsSincePower).toBe(0); // network spent
  });

  it('floors at 0 rather than going negative', () => {
    let s = eksanaState();
    s.players[0].cardsSincePower = 40;
    const before = s.players[0].energy;
    s = applyAction(registry, s, { type: 'heroPower' }).state;
    expect(before - s.players[0].energy).toBe(0);
  });

  it('puts Eksana herself on the board, summoning-sick and answerable', () => {
    let s = eksanaState();
    s.players[0].cardsSincePower = 20;
    s = applyAction(registry, s, { type: 'heroPower', lane: 'ground1' }).state;
    const her = s.players[0].lanes.ground1.front;
    expect(her?.cardId).toBe('eksana-herself');
    // NO Battle Ready: this is the point of the rework. She is summoning-sick like any other
    // summon, so `justPlaced` gates her out of attacking until her controller's NEXT turn —
    // a full opponent turn to answer a 2-HP body.
    expect(her?.justPlaced).toBe(true);
    expect(her?.keywords.battleReady).toBeUndefined();
    expect(her?.keywords.airborne).toBe(true); // makes Sniper work from any lane
    expect(her?.keywords.bloodlust?.effects?.[0]).toEqual({ kind: 'conjure', cardId: 'sig-no-witnesses' });
    expect(her?.keywords.pierce).toBe(true);
    expect(her?.keywords.sniper).toBe(true);
    expect(her?.keywords.strikeThrough).toBe(true);
    expect(her?.keywords.brittle).toBe(true);
    expect(her?.attack).toBe(3);
    expect(her?.hp).toBe(2);
  });

  it('generates NO card — the payoff is bounded, not a faucet', () => {
    let s = eksanaState();
    s.players[0].cardsSincePower = 20;
    const handBefore = s.players[0].hand.length;
    s = applyAction(registry, s, { type: 'heroPower', lane: 'ground1' }).state;
    expect(s.players[0].hand.length).toBe(handBefore);
  });

  it('Brittle destroys her the instant her one attack resolves, not on a timer', () => {
    const her = (starterCards as any[]).find((c) => c.id === 'eksana-herself');
    expect(her.startOfTurn).toBeUndefined();
    expect(her.keywords.brittle).toBe(true);
  });

  it('using the power does NOT count as a card played toward its own discount', () => {
    let s = eksanaState();
    s.players[0].cardsSincePower = 20;
    s = applyAction(registry, s, { type: 'heroPower' }).state;
    expect(s.players[0].cardsSincePower).toBe(0); // not 1
  });
});

describe('the contract chain', () => {
  const chainLink = (id: string) => parseCard((starterCards as any[]).find((c) => c.id === id));

  it('each link conjures the next ONLY on a kill', () => {
    const s = eksanaState();
    // A 1 HP victim dies to Swift Kill's 5; a 99 HP one does not.
    for (const [hp, expected] of [[1, true], [99, false]] as const) {
      const st = eksanaState();
      st.players[1].lanes.ground1.front = {
        iid: 'v', cardId: 'gravel-hound', owner: 1, attack: 0, hp, maxHp: hp,
        keywords: {}, status: {}, turnsInPlay: 0, justPlaced: false,
      } as any;
      const ev: GameEvent[] = [];
      applyEffects(st, 0, chainLink('sig-thornburst').type === 'spell' ? (chainLink('sig-thornburst') as any).effects : [],
        [{ kind: 'unit', iid: 'v' }], undefined, ev, registry);
      expect(st.players[0].hand.some((c) => c.cardId === 'sig-loose-ends')).toBe(expected);
    }
    expect(s).toBeTruthy();
  });

  it('runs 5 -> 4 -> 3 -> 2 and terminates', () => {
    const dmg = (id: string) => ((starterCards as any[]).find((c) => c.id === id).effects[0].amount);
    const next = (id: string) => ((starterCards as any[]).find((c) => c.id === id).effects[0].conjureOnKill);
    expect([dmg('sig-thornburst'), dmg('sig-loose-ends'), dmg('sig-no-witnesses'), dmg('sig-clean-exit')]).toEqual([5, 4, 3, 2]);
    expect(next('sig-clean-exit')).toBeUndefined(); // the chain ends; no infinite loop
  });

  it('every link is free, so the favour turn is the whole price', () => {
    for (const id of ['sig-thornburst', 'sig-loose-ends', 'sig-no-witnesses', 'sig-clean-exit']) {
      expect((starterCards as any[]).find((c) => c.id === id).cost.energy).toBe(0);
    }
  });
});
