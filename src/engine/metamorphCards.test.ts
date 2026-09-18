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

  it('countdown carries at least one effect and a positive timer', () => {
    const withCd = (starterCards as any[]).filter((c) => c.keywords?.countdown);
    expect(withCd.length).toBeGreaterThan(0);
    for (const c of withCd) {
      const cd = c.keywords.countdown;
      expect(cd.turns, `${c.id} needs a positive timer`).toBeGreaterThan(0);
      expect(cd.effects.length, `${c.id} needs an effect to fire`).toBeGreaterThan(0);
    }
  });

  it("the countdown cards cover the keyword's range — one-shot, repeating, self-consuming", () => {
    const cds = (starterCards as any[]).filter((c) => c.keywords?.countdown).map((c) => c.keywords.countdown);
    expect(cds.some((cd: any) => cd.repeat), 'a repeating timer').toBe(true);
    expect(cds.some((cd: any) => cd.consume), 'a self-consuming bomb').toBe(true);
  });

  it('Lethal is obtainable on a printed card, not only via Earth grants', () => {
    const printed = (starterCards as any[]).filter(
      (c) => c.keywords?.lethal && !(c.tags ?? []).includes('token'));
    expect(printed.length).toBeGreaterThan(0);
  });

  it('every grantable keyword has both a foundation and an environment source', () => {
    // battleReady is excluded from the foundation side: EVERY Foundation already grants it
    // for free to a unit bonding onto ground placed a prior turn (the prepared-position rule
    // in engine.ts `playUnit`/`playFoundation`) — a universal engine rule, not a per-card
    // ability, so authoring a dedicated "grants Battle Ready" Foundation (Springboard) was
    // pure duplication and was removed.
    const GRANTABLE = ['lethal','overshot','pierce','sniper','branchShot','splashDamage',
      'strikeThrough','doubleStrike','airborne','taunt','trueShield','immunity',
      'spike','tough','zombified','brittle','growth','bloodlust'];
    const missing: string[] = [];
    for (const k of GRANTABLE) {
      const f = (starterCards as any[]).some((c) => c.type === 'foundation' && c.grants?.keywords?.[k] !== undefined);
      if (!f) missing.push(`${k}: no foundation`);
    }
    for (const k of [...GRANTABLE, 'battleReady']) {
      const e = (starterCards as any[]).some((c) => c.type === 'environment' && c.grantKeywords?.[k] !== undefined);
      if (!e) missing.push(`${k}: no environment`);
    }
    expect(missing).toEqual([]);
  });
});
