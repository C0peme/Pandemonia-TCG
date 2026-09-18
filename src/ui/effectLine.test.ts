/**
 * effectLine must not silently drop a mechanic.
 *
 * Three separate "the card doesn't explain what it does" bugs all had the same shape: the data
 * carried a mechanic and the renderer had no path for it — `{kind:'custom'}` printed the word
 * "custom", a keyword-granting buff printed a bare "Buff", and `amountFrom` printed the literal
 * word "undefined". Rather than wait for the next one to surface in play, this walks EVERY
 * effect on every card, foundation grant and hero power in the real content and asserts the
 * rendered line actually reflects the data.
 */
import { describe, it, expect } from 'vitest';
import { effectLine } from '@ui/App';
import { buildRegistry } from '@cards/registry';
import { starterCards, starterLeaders } from '@cards/data/starter';

const reg = buildRegistry(starterCards, starterLeaders);

/** Every authored effect in the game, tagged with where it lives. */
function allEffects(): { src: string; e: Record<string, unknown> }[] {
  const out: { src: string; e: Record<string, unknown> }[] = [];
  const push = (src: string, arr: unknown) => {
    if (Array.isArray(arr)) for (const e of arr) out.push({ src, e: e as Record<string, unknown> });
  };
  for (const c of reg.cards.values()) {
    const a = c as unknown as Record<string, unknown>;
    push(c.id, a.effects); push(c.id, a.onPlay); push(c.id, a.onAttack);
    push(c.id, a.endOfTurn); push(c.id, a.startOfTurn);
    const g = a.grants as Record<string, unknown> | undefined;
    if (g) { push(c.id + '.grants', g.onAttack); push(c.id + '.grants', g.endOfTurn); push(c.id + '.grants', g.startOfTurn); }
  }
  for (const l of reg.leaders.values()) push('leader:' + l.id, (l.heroPower as unknown as Record<string, unknown>).effects);
  return out;
}

const effects = allEffects();
const render = (e: Record<string, unknown>) => effectLine(e as never);

describe('effectLine — every authored effect', () => {
  it('sweeps a real, non-trivial body of content', () => {
    expect(effects.length).toBeGreaterThan(100);
  });

  it('never renders empty', () => {
    for (const { src, e } of effects) {
      expect(render(e).trim(), `${src} (${String(e.kind)})`).not.toBe('');
    }
  });

  it('never leaks a placeholder or a broken value', () => {
    // "custom" is the placeholder kind whose note must be shown instead of the kind name.
    const bad = /undefined|NaN|\[object Object\]|\bcustom\b/i;
    for (const { src, e } of effects) {
      expect(render(e), `${src} (${String(e.kind)})`).not.toMatch(bad);
    }
  });

  it('shows a status magnitude above 1', () => {
    for (const { src, e } of effects) {
      if (e.kind !== 'applyStatus') continue;
      const n = e.amount as number | undefined;
      if (!n || n <= 1) continue; // 1 is the implicit default and reads better unstated
      expect(render(e), `${src} status amount`).toContain(String(n));
    }
  });

  it('shows a damage amount, or what it derives from', () => {
    for (const { src, e } of effects) {
      if (e.kind !== 'damage') continue;
      const out = render(e);
      if (e.amountFrom) expect(out, `${src} derived damage`).toMatch(/⚔/);
      else expect(out, `${src} damage amount`).toContain(String(e.amount ?? 0));
    }
  });

  it('shows granted keywords on a buff or debuff', () => {
    for (const { src, e } of effects) {
      if (e.kind !== 'buff' && e.kind !== 'debuff') continue;
      const kw = e.keywords as Record<string, unknown> | undefined;
      if (!kw) continue;
      const out = render(e).toLowerCase();
      for (const k of Object.keys(kw)) {
        // Names are title-cased words ("Double Strike" for doubleStrike); match the stem.
        expect(out, `${src} grants ${k}`).toContain(k.slice(0, 4).toLowerCase());
      }
    }
  });

  it('names the card type a cost modifier applies to', () => {
    for (const { src, e } of effects) {
      if (e.kind !== 'costMod') continue;
      const ct = e.cardType as string | undefined;
      if (!ct || ct === 'all') continue;
      expect(render(e).toLowerCase(), `${src} costMod type`).toContain(ct.toLowerCase());
    }
  });

  it('names the mechanic behind chain and pierce damage', () => {
    for (const { src, e } of effects) {
      if (e.kind !== 'damage') continue;
      const out = render(e).toLowerCase();
      if (e.chainDiminish || e.chain) expect(out, `${src} chain`).toContain('chain');
      if (e.pierce) expect(out, `${src} pierce`).toContain('pierce');
    }
  });
});

describe('effectLine — every schema kind renders', () => {
  // Mirrors the `kind` enum in cards/schema.ts. A new kind added there without a case here
  // falls through to the default branch and this fails.
  const KINDS = ['damage', 'heal', 'draw', 'buff', 'debuff', 'summon', 'conjure', 'applyStatus',
    'energy', 'energyNext', 'bankMax', 'move', 'expel', 'forget', 'cleanse', 'extraAction',
    'costMod', 'setStats', 'custom'] as const;

  for (const kind of KINDS) {
    it(`${kind} renders without leaking its kind name`, () => {
      const e: Record<string, unknown> = { kind, amount: 2, status: 'burn', note: 'does a thing' };
      const out = render(e);
      expect(out.trim()).not.toBe('');
      expect(out).not.toBe(kind); // the default branch returns the bare kind
    });
  }
});
