import { describe, expect, it } from 'vitest';
import { starterLeaders, starterRegistry } from '@cards/data/starter';
import { applyAction, legalActions } from '@engine/engine';
import { blankState, place, unit } from '@engine/testkit';
import { canUseSkill, isRepeatableSkill, skillCastsAvailable } from '@engine/leaderSkill';
import type { GameState } from '@engine/types';

/** Player 0 seated as `leaderId` with an ally to target and the given bank/energy. */
const seat = (leaderId: string, bank: Partial<GameState['players'][0]['bank']>, energy = 0): GameState => {
  const s = blankState();
  const leader = starterRegistry.leaders.get(leaderId)!;
  s.players[0].leaderId = leaderId;
  s.players[0].elementCaps = { ...leader.elementCaps };
  s.players[0].bank = { fire: 0, water: 0, nature: 0, earth: 0, ...bank };
  s.players[0].energy = energy;
  place(s, 0, 'ground1', { ...unit({ owner: 0, attack: 1, hp: 2 }), iid: 'ally' });
  place(s, 1, 'ground1', { ...unit({ owner: 1, attack: 1, hp: 5 }), iid: 'foe' });
  return s;
};

const fortify = { type: 'heroPower' as const, targets: [{ kind: 'unit' as const, iid: 'ally' }] };

describe('Leader Skill costs', () => {
  it('every standard leader but Orsyric has an elemental (repeatable) skill', () => {
    for (const l of starterLeaders) {
      expect(isRepeatableSkill(l.heroPower), l.id).toBe(l.id !== 'orsyric');
    }
  });

  it('an elemental skill repeats while the bank pays, then stops', () => {
    let s = seat('cleath', { earth: 2 }, 5);
    for (let i = 0; i < 2; i++) {
      const r = applyAction(starterRegistry, s, fortify);
      expect(r.events.some((e) => e.t === 'error')).toBe(false);
      s = r.state;
    }
    expect(s.players[0].bank.earth).toBe(0);
    expect(s.players[0].energy).toBe(5); // generic energy is never touched
    const third = applyAction(starterRegistry, s, fortify);
    expect(third.events.some((e) => e.t === 'error')).toBe(true);
    expect(legalActions(starterRegistry, s).some((a) => a.type === 'heroPower')).toBe(false);
  });

  it('skill pips do NOT fall back to generic energy (unlike card pips)', () => {
    const s = seat('cleath', {}, 10);
    expect(canUseSkill(s.players[0], starterRegistry.leaders.get('cleath')!.heroPower).ok).toBe(false);
    expect(applyAction(starterRegistry, s, fortify).events.some((e) => e.t === 'error')).toBe(true);
  });

  it("Orsyric's Mind Whip stays 2 energy, once per turn", () => {
    const s = seat('orsyric', {}, 6);
    const whip = { type: 'heroPower' as const, targets: [{ kind: 'unit' as const, iid: 'foe' }] };
    const first = applyAction(starterRegistry, s, whip);
    expect(first.events.some((e) => e.t === 'error')).toBe(false);
    expect(first.state.players[0].energy).toBe(4);
    expect(applyAction(starterRegistry, first.state, whip).events.some((e) => e.t === 'error')).toBe(true);
  });

  it('counts the casts the resources allow', () => {
    const s = seat('cleath', { earth: 3 });
    expect(skillCastsAvailable(s.players[0], starterRegistry.leaders.get('cleath')!.heroPower)).toBe(3);
    const screyera = seat('screyera', { earth: 3 });
    screyera.players[0].leaderHp = 2; // HP cost 1 may only be paid while it leaves the leader alive
    expect(skillCastsAvailable(screyera.players[0], starterRegistry.leaders.get('screyera')!.heroPower)).toBe(1);
  });
});
