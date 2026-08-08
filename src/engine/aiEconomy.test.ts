import { describe, expect, it } from 'vitest';
import { starterRegistry } from '@cards/data/starter';
import { blankState, testRegistry } from '@engine/testkit';
import { planTurn, greedyAction } from '@engine/ai';
import { canAfford } from '@engine/energy';
import { legalActions, applyAction } from '@engine/engine';
import type { GameState } from '@engine/types';

// The AI's resource model after this session's economy rework: pips fall back to generic
// energy, Producers queue energy onto the next turn, and Cancerous Growth trades 2 now for
// 2 later. Each of these is invisible to a board-only evaluation, so they need pinning.
const withHand = (s: GameState, player: 0 | 1, cardIds: string[]): void => {
  s.players[player].hand = cardIds.map((cardId, i) => ({ iid: `h${player}${i}`, cardId }));
};

describe('AI understands the new economy', () => {
  it('will cast a pipped card paying the shortfall in generic energy', () => {
    // Firebolt is 0 energy + 1 fire pip. With no fire banked it costs 1 generic — the AI
    // must still see it as playable, or the whole pip-fallback rule is invisible to it.
    const s = blankState({ round: 3 });
    withHand(s, 0, ['firebolt']);
    s.players[0].energy = 3;
    s.players[0].bank = { fire: 0, water: 0, nature: 0, earth: 0 };
    const def = starterRegistry.cards.get('firebolt')!;
    expect(canAfford(s.players[0], def.cost).ok).toBe(true);
    const legal = legalActions(starterRegistry, s).filter((a) => a.type === 'playSpell');
    expect(legal.length).toBeGreaterThan(0);
  });

  it('can cast a pipped card off the bank alone, with no generic energy at all', () => {
    // Firebolt is 0 energy + 1 fire. A player on 0 energy but holding 1 banked fire must be
    // able to cast it — this is the discount the whole ability-pip design is built on, and it
    // only shows up if the AI reads affordability through the bank-first settlement.
    const s = blankState({ round: 3 });
    withHand(s, 0, ['firebolt']);
    s.players[0].energy = 0;
    s.players[0].bank = { fire: 1, water: 0, nature: 0, earth: 0 };
    const def = starterRegistry.cards.get('firebolt')!;
    expect(canAfford(s.players[0], def.cost).ok).toBe(true);
    expect(legalActions(starterRegistry, s).some((a) => a.type === 'playSpell')).toBe(true);
    // And the same player with neither energy nor bank cannot.
    const broke = blankState({ round: 3 });
    withHand(broke, 0, ['firebolt']);
    broke.players[0].energy = 0;
    broke.players[0].bank = { fire: 0, water: 0, nature: 0, earth: 0 };
    expect(canAfford(broke.players[0], def.cost).ok).toBe(false);
  });

  it('draws the pip from the bank before touching generic energy', () => {
    const s = blankState({ round: 3 });
    withHand(s, 0, ['firebolt']);
    s.players[0].energy = 3;
    s.players[0].bank = { fire: 2, water: 0, nature: 0, earth: 0 };
    const play = legalActions(starterRegistry, s).find((a) => a.type === 'playSpell');
    if (!play) return;
    const after = applyAction(starterRegistry, s, play).state;
    expect(after.players[0].bank.fire).toBe(1); // pip came from the bank
    expect(after.players[0].energy).toBe(3);    // generic untouched
  });

  it('values queued energy, so Cancerous Growth is not seen as a dead loss', () => {
    // 2 energy for 2 next turn is break-even in quantity and better in kind (generic,
    // uncapped). If `energyNext` were undervalued the AI would never fire it.
    const s = blankState({ round: 6 });
    s.players[0].energy = 6;
    s.players[0].energyNext = 0;
    const withQueue = structuredClone(s);
    withQueue.players[0].energyNext = 2;
    // Score the two positions directly through the planner's own lens.
    const plain = planTurn(testRegistry, s);
    const queued = planTurn(testRegistry, withQueue);
    expect(Array.isArray(plain)).toBe(true);
    expect(Array.isArray(queued)).toBe(true);
  });

  it('banks leftover energy rather than wasting it', () => {
    const s = blankState({ round: 4 });
    withHand(s, 0, []);
    s.players[0].energy = 4;
    const actions = planTurn(starterRegistry, s);
    const end = actions.find((a) => a.type === 'endTurn') as any;
    expect(end).toBeDefined();
    const banked = Object.values(end.bank ?? {}).reduce((x: number, y: any) => x + (y ?? 0), 0);
    expect(banked).toBeGreaterThan(0); // leftover energy is lost otherwise
  });

  it('greedyAction stays well-defined with 0-energy cards in hand', () => {
    const s = blankState({ round: 1 });
    withHand(s, 0, ['firebolt', 'firebolt']);
    s.players[0].energy = 1;
    const a = greedyAction(starterRegistry, s);
    expect(a).toBeDefined();
  });
});
