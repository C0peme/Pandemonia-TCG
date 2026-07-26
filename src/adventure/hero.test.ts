import { describe, expect, it } from 'vitest';
import { buildRegistry } from '@cards/registry';
import { starterCards, starterLeaders } from '@cards/data/starter';
import {
  applyHeroUpgrades, applicableUpgrades, leaderUpgrade, hasUnique,
  heroStateMods, applyHeroModsToState, LEADER_UPGRADES,
} from '@adventure/hero';
import { ADVENTURE_STARTERS } from '@adventure/data/starters';
import { initGame } from '@engine/setup';
import { starterDecks } from '@cards/data/starter';
import type { Leader } from '@cards/schema';

const base = buildRegistry(starterCards, starterLeaders);
const leader = (id: string): Leader => base.leaders.get(id)!;
const freshState = () => initGame({ registry: base, decks: [starterDecks[1]!, starterDecks[3]!], seed: 1 });

describe('LEADER_UPGRADES coverage', () => {
  // The point of the rework: the old generic trio reached 13/9/1 leaders, leaving four
  // leaders (Aleph, Autopus, Noctua, Naife) with no path once their power hit 0 energy.
  it('gives every playable leader exactly one unique upgrade', () => {
    for (const l of starterLeaders) {
      if (!ADVENTURE_STARTERS[l.id]) continue;
      expect(LEADER_UPGRADES[l.id], `no unique upgrade for ${l.id}`).toBeTruthy();
      expect(applicableUpgrades(l.id, [])).toContain('unique');
    }
  });

  it('offers attune to everyone always, and unique only until taken', () => {
    expect(applicableUpgrades('orsyric', [])).toEqual(['unique', 'attune']);
    const taken = applicableUpgrades('orsyric', [{ kind: 'unique' }]);
    expect(taken).not.toContain('unique');
    expect(taken).toContain('attune');
    // Attune never runs out, however many are already owned.
    const many = Array.from({ length: 6 }, () => ({ kind: 'attune', element: 'fire' }) as const);
    expect(applicableUpgrades('orsyric', many)).toContain('attune');
  });

  it('has no unique for an unknown leader, but still allows attune', () => {
    expect(leaderUpgrade('nope')).toBeUndefined();
    expect(applicableUpgrades('nope', [])).toEqual(['attune']);
  });
});

describe('applyHeroUpgrades', () => {
  it('is a no-op until the unique is bought, and never mutates the base leader', () => {
    const l = leader('orsyric');
    expect(applyHeroUpgrades(l, [])).toBe(l);
    expect(applyHeroUpgrades(l, [{ kind: 'attune', element: 'fire' }])).toBe(l);
    const before = structuredClone(l.heroPower);
    applyHeroUpgrades(l, [{ kind: 'unique' }]);
    expect(l.heroPower).toEqual(before);
  });

  it('drops the authored text so the UI derives an accurate line', () => {
    expect(applyHeroUpgrades(leader('orsyric'), [{ kind: 'unique' }]).heroPower.text).toBeUndefined();
  });

  it('Kedou — Steam Pressure raises Burn 2 → 3 without adding an effect', () => {
    const l = leader('kedou');
    const up = applyHeroUpgrades(l, [{ kind: 'unique' }]);
    expect(up.heroPower.effects).toHaveLength(l.heroPower.effects.length);
    expect(up.heroPower.effects.find((e) => e.kind === 'applyStatus' && e.status === 'burn')?.amount).toBe(3);
  });

  it('Phantom — Veil of Silence adds a SECOND sleep effect (its own target)', () => {
    const l = leader('phantom');
    const up = applyHeroUpgrades(l, [{ kind: 'unique' }]);
    expect(up.heroPower.effects.filter((e) => e.kind === 'applyStatus' && e.status === 'sleep')).toHaveLength(2);
    expect(up.heroPower.effects.length).toBe(l.heroPower.effects.length + 1);
  });

  it('Ring Leader — Busy Schedule removes the HP cost and adds the portal move', () => {
    const l = leader('ringleader');
    expect(l.heroPower.hpCost).toBe(1); // precondition
    const up = applyHeroUpgrades(l, [{ kind: 'unique' }]);
    expect(up.heroPower.hpCost).toBeUndefined();
    expect(up.heroPower.effects.some((e) => e.kind === 'move' && e.target === 'leaderUnit')).toBe(true);
  });

  it('Autopus — Integer Overflow swaps the summon to the elite token', () => {
    const up = applyHeroUpgrades(leader('autopus'), [{ kind: 'unique' }]);
    expect(up.heroPower.effects.find((e) => e.kind === 'summon')?.cardId).toBe('critter-elite');
    expect(base.cards.has('critter-elite')).toBe(true);
  });

  it('Cleath — The Architect adds attack alongside the existing HP buff', () => {
    const up = applyHeroUpgrades(leader('cleath'), [{ kind: 'unique' }]);
    expect(up.heroPower.effects.find((e) => e.kind === 'buff')?.stat).toEqual({ hp: 1, attack: 1 });
  });

  it('Noctua — Curse Bound keeps Growth and adds Zombified', () => {
    const buff = applyHeroUpgrades(leader('noctua'), [{ kind: 'unique' }]).heroPower.effects.find((e) => e.kind === 'buff');
    expect(buff?.keywords?.growth).toEqual({ attack: 1, hp: 1 });
    expect(buff?.keywords?.zombified).toBe(true);
  });

  it('Naife — Shell Network keeps the enemy move and adds an ally move', () => {
    const up = applyHeroUpgrades(leader('naife'), [{ kind: 'unique' }]);
    const moves = up.heroPower.effects.filter((e) => e.kind === 'move');
    expect(moves.map((m) => m.target).sort()).toEqual(['ally', 'enemy']);
  });

  it("every unique produces a non-empty, well-formed effect list", () => {
    for (const l of starterLeaders) {
      if (!LEADER_UPGRADES[l.id]) continue;
      const up = applyHeroUpgrades(l, [{ kind: 'unique' }]);
      expect(up.heroPower.effects.length, l.id).toBeGreaterThan(0);
      for (const e of up.heroPower.effects) expect(typeof e.kind, `${l.id}: ${JSON.stringify(e)}`).toBe('string');
    }
  });
});

describe('heroStateMods', () => {
  it('turns each attune into a +1 cap delta for its own element', () => {
    const mods = heroStateMods('orsyric', [
      { kind: 'attune', element: 'fire' },
      { kind: 'attune', element: 'fire' },
      { kind: 'attune', element: 'water' },
    ]);
    expect(mods.elementCapDeltas).toEqual([
      { element: 'fire', amount: 1 },
      { element: 'fire', amount: 1 },
      { element: 'water', amount: 1 },
    ]);
  });

  it("carries a unique's cost discount only once the unique is bought", () => {
    expect(heroStateMods('naife', []).costMods).toEqual({});
    expect(heroStateMods('naife', [{ kind: 'unique' }]).costMods).toEqual({ environment: -1 });
    // A leader whose unique is purely power-level contributes no cost mods.
    expect(heroStateMods('kedou', [{ kind: 'unique' }]).costMods).toEqual({});
  });

  it('applies caps and discounts to the player seat only', () => {
    const state = freshState();
    const beforeFire = state.players[0].elementCaps.fire;
    const oppFire = state.players[1].elementCaps.fire;
    applyHeroModsToState(state, heroStateMods('naife', [{ kind: 'unique' }, { kind: 'attune', element: 'fire' }]));
    expect(state.players[0].elementCaps.fire).toBe(beforeFire + 1);
    // The discount lives on the PERSISTENT costBase so it survives turn-end (the bug it
    // fixes was a one-turn-only discount when it lived on costMods).
    expect(state.players[0].costBase?.environment).toBe(-1);
    expect(state.players[0].costMods.environment).toBe(0); // temporary lane untouched
    expect(state.players[1].elementCaps.fire).toBe(oppFire); // opponent untouched
    expect(state.players[1].costBase?.environment ?? 0).toBe(0);
  });

  it('stacks repeated attunes on the same element', () => {
    const state = freshState();
    const before = state.players[0].elementCaps.water;
    applyHeroModsToState(state, heroStateMods('phantom', [
      { kind: 'attune', element: 'water' },
      { kind: 'attune', element: 'water' },
    ]));
    expect(state.players[0].elementCaps.water).toBe(before + 2);
  });
});

describe('hasUnique', () => {
  it('detects the one-time unique among attunes', () => {
    expect(hasUnique([])).toBe(false);
    expect(hasUnique([{ kind: 'attune', element: 'fire' }])).toBe(false);
    expect(hasUnique([{ kind: 'attune', element: 'fire' }, { kind: 'unique' }])).toBe(true);
  });
});
