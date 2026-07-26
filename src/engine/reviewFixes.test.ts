import { describe, expect, it } from 'vitest';
import { resolveCombat } from '@engine/combat';
import { applyAction } from '@engine/engine';
import { applyEffects } from '@engine/effects';
import { blankState, place, unit, foundationUnit, testRegistry } from '@engine/testkit';
import { expandKeywordEffects } from '@cards/registry';
import { parseCard } from '@cards/schema';
import type { GameEvent } from '@engine/events';

const run = (s: ReturnType<typeof blankState>) => resolveCombat(s).state;

describe('review fixes', () => {
  it('Spike fires even when the hit is fully absorbed by Shield', () => {
    const s = blankState();
    place(s, 0, 'ground1', unit({ owner: 0, attack: 5, hp: 5 }));
    place(s, 1, 'ground1', unit({ owner: 1, attack: 0, hp: 5, keywords: { shield: 1, spike: 2 } }));
    const r = run(s);
    const defender = r.players[1].lanes.ground1.front!;
    expect(defender.hp).toBe(5); // Shield absorbed the blow — no damage
    expect(r.players[0].lanes.ground1.front!.hp).toBe(3); // …but Spike still pricked the attacker for 2
  });

  it('a standalone Foundation honors True Shield like any unit', () => {
    const s = blankState();
    place(s, 0, 'ground1', unit({ owner: 0, attack: 5, hp: 5 }));
    const sf = foundationUnit({ owner: 1, cardId: 'stone-footing', attack: 0, hp: 3, keywords: { trueShield: true } });
    sf.iid = 'f1';
    s.players[1].lanes.ground1.standaloneFoundation = sf;
    const r = run(s);
    expect(r.players[1].lanes.ground1.standaloneFoundation?.hp).toBe(3); // True Shield blocked all damage
  });

  it('a standalone Foundation honors Tough against SPELL damage, like in combat', () => {
    const s = blankState();
    const sf = foundationUnit({ owner: 1, cardId: 'stone-footing', attack: 0, hp: 5, keywords: { tough: 2 } });
    sf.iid = 'f1';
    s.players[1].lanes.ground1.standaloneFoundation = sf;
    const events: GameEvent[] = [];
    // A 3-damage spell on a Tough-2 Foundation should land 1 — same as a combat hit would.
    applyEffects(s, 0, [{ kind: 'damage', amount: 3, target: 'any' }], [{ kind: 'unit', iid: 'f1' }], undefined, events, testRegistry);
    expect(s.players[1].lanes.ground1.standaloneFoundation?.hp).toBe(4); // 3 − Tough 2 = 1
  });

  it('a standalone Foundation Shield blocks a spell entirely, like in combat', () => {
    const s = blankState();
    const sf = foundationUnit({ owner: 1, cardId: 'stone-footing', attack: 0, hp: 5, keywords: { shield: 1 } });
    sf.iid = 'f1';
    s.players[1].lanes.ground1.standaloneFoundation = sf;
    const events: GameEvent[] = [];
    applyEffects(s, 0, [{ kind: 'damage', amount: 9, target: 'any' }], [{ kind: 'unit', iid: 'f1' }], undefined, events, testRegistry);
    const after = s.players[1].lanes.ground1.standaloneFoundation;
    expect(after?.hp).toBe(5); // Shield absorbed the spell
    expect(after?.keywords.shield).toBeUndefined(); // …and was consumed
  });

  it('moving a land unit into Water induces drowning (and restores attack leaving Water)', () => {
    const s = blankState();
    place(s, 0, 'ground1', unit({ owner: 0, attack: 5, hp: 5, cardId: 'v0' }));
    const iid = s.players[0].lanes.ground1.front!.iid;
    const inWater = applyAction(testRegistry, s, { type: 'moveUnit', targetIid: iid, toLane: 'water' }).state;
    const drowned = inWater.players[0].lanes.water.front!;
    expect(drowned.status.drowning).toBe(true);
    expect(drowned.attack).toBe(0);
    const back = applyAction(testRegistry, inWater, { type: 'moveUnit', targetIid: iid, toLane: 'ground2' }).state;
    const out = back.players[0].lanes.ground2.front!;
    expect(out.status.drowning).toBeUndefined();
    expect(out.attack).toBe(5); // attack restored on leaving Water
  });

  it('expands a debuff keyword into an onPlay effect and strips the keyword', () => {
    const card = parseCard({
      id: 't', name: 'T', type: 'unit', element: 'fire', cost: { energy: 1 }, attack: 1, hp: 1,
      keywords: { debuff: { attack: 1, target: 'enemy' } },
    });
    const expanded = expandKeywordEffects(card);
    expect(expanded.type).toBe('unit');
    if (expanded.type !== 'unit') return;
    expect(expanded.keywords.debuff).toBeUndefined();
    expect(expanded.onPlay?.some((e) => e.kind === 'debuff')).toBe(true);
  });

  it('expands every mover scope (incl. self) and healer/producer into trigger effects', () => {
    const enemyMover = parseCard({
      id: 'm1', name: 'M1', type: 'unit', element: 'fire', cost: { energy: 1 }, attack: 1, hp: 1,
      keywords: { mover: { scope: 'enemy', trigger: 'endOfTurn' } },
    });
    const ex = expandKeywordEffects(enemyMover);
    if (ex.type !== 'unit') throw new Error('unit');
    expect(ex.keywords.mover).toBeUndefined();
    expect(ex.endOfTurn?.some((e) => e.kind === 'move')).toBe(true);

    const selfMover = parseCard({
      id: 'm2', name: 'M2', type: 'unit', element: 'fire', cost: { energy: 1 }, attack: 1, hp: 1,
      keywords: { mover: { scope: 'self', trigger: 'endOfTurn' } },
    });
    const ex2 = expandKeywordEffects(selfMover);
    if (ex2.type !== 'unit') throw new Error('unit');
    expect(ex2.keywords.mover).toBeUndefined(); // self-movers are expanded too — no native handler
    expect(ex2.endOfTurn?.some((e) => e.kind === 'move')).toBe(true);

    const support = parseCard({
      id: 'm3', name: 'M3', type: 'unit', element: 'fire', cost: { energy: 1 }, attack: 1, hp: 1,
      keywords: { healer: { amount: 2, target: 'leader', trigger: 'endOfTurn' }, producer: { amount: 1, element: 'fire' } },
    });
    const ex3 = expandKeywordEffects(support);
    if (ex3.type !== 'unit') throw new Error('unit');
    expect(ex3.keywords.healer).toBeUndefined();
    expect(ex3.keywords.producer).toBeUndefined();
    expect(ex3.endOfTurn?.some((e) => e.kind === 'heal')).toBe(true);
    expect(ex3.endOfTurn?.some((e) => e.kind === 'energy')).toBe(true);
  });
});
