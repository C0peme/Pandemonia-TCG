/**
 * Guards the two mechanics that had full engine support and ZERO cards. These assert the CARDS
 * work end to end, not the engine internals (metamorphosis.test.ts covers those).
 */
import { describe, expect, it } from 'vitest';
import { buildRegistry } from '@cards/registry';
import { starterCards, starterLeaders } from '@cards/data/starter';

const registry = buildRegistry(starterCards as any[], starterLeaders as any[]);

describe('previously-dead mechanics now have cards', () => {
  it('metamorphosis names a target that EXISTS — a missing `into` is a silent no-op', () => {
    const withMeta = (starterCards as any[]).filter((c) => c.keywords?.metamorphosis);
    expect(withMeta.length).toBeGreaterThan(0);
    for (const c of withMeta) {
      const into = c.keywords.metamorphosis.into;
      expect(into, `${c.id} must name an evolved form`).toBeTruthy();
      const target = registry.cards.get(into);
      expect(target, `${c.id} evolves into missing card ${into}`).toBeDefined();
      expect(target!.type).toBe('unit');
    }
  });

  it('smelt uses a PLAYER-scoped effect — unit-targeting ones are dropped by the trigger dispatch', () => {
    const withSmelt = (starterCards as any[]).filter((c) => c.keywords?.smelt);
    expect(withSmelt.length).toBeGreaterThan(0);
    for (const c of withSmelt) {
      expect(['draw', 'energy', 'energyNext', 'bankMax', 'forget'],
        `${c.id} smelt effect must be player-scoped`).toContain(c.keywords.smelt.effect.kind);
      expect(c.keywords.smelt.hpCost).toBeGreaterThan(0);
    }
  });

  it('Lethal is obtainable on a printed card, not only via Earth grants', () => {
    const printed = (starterCards as any[]).filter(
      (c) => c.keywords?.lethal && !(c.tags ?? []).includes('token'));
    expect(printed.length).toBeGreaterThan(0);
  });

  it('every grantable keyword has both a foundation and an environment source', () => {
    const GRANTABLE = ['lethal','overshot','pierce','sniper','branchShot','splashDamage',
      'strikeThrough','doubleStrike','airborne','battleReady','taunt','trueShield','immunity',
      'spike','tough','zombified','brittle','growth','bloodlust'];
    const missing: string[] = [];
    for (const k of GRANTABLE) {
      const f = (starterCards as any[]).some((c) => c.type === 'foundation' && c.grants?.keywords?.[k] !== undefined);
      const e = (starterCards as any[]).some((c) => c.type === 'environment' && c.grantKeywords?.[k] !== undefined);
      if (!f) missing.push(`${k}: no foundation`);
      if (!e) missing.push(`${k}: no environment`);
    }
    expect(missing).toEqual([]);
  });
});
