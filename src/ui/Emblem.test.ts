/**
 * The Emblem renders the art window for EVERY card in hand and on the board, so any gap in its
 * glyph lookup black-screens the whole game rather than degrading.
 *
 * That is exactly what happened: `ELEM_BEAST` was typed `Record<Element, …>` (fire/water/
 * nature/earth) while a CARD's element is `CardElement`, which also includes `neutral`. The
 * type checked out because the crash needed a value the type claimed impossible — so the four
 * neutral units in the starter set threw `keys is undefined` the moment one was drawn.
 *
 * These tests walk the real card pool instead of hand-picked fixtures, so a future card with a
 * new element or an unhandled keyword combination fails here rather than in play.
 */
import { describe, it, expect } from 'vitest';
import { glyphFor } from '@ui/Emblem';
import { buildRegistry } from '@cards/registry';
import { starterCards, starterLeaders } from '@cards/data/starter';
import { CARD_ELEMENTS } from '@engine/constants';

const registry = buildRegistry(starterCards, starterLeaders);
const allCards = [...registry.cards.values()];

describe('glyphFor — every real card resolves to a glyph', () => {
  it('the pool is not empty (guards against a vacuous pass)', () => {
    expect(allCards.length).toBeGreaterThan(50);
  });

  it('never throws and never returns empty for any card in the registry', () => {
    for (const c of allCards) {
      const glyph = glyphFor(c as Parameters<typeof glyphFor>[0]);
      expect(typeof glyph, `card ${c.id} (${c.element}/${c.type})`).toBe('string');
      expect(glyph.length, `card ${c.id} (${c.element}/${c.type})`).toBeGreaterThan(0);
    }
  });

  it('covers neutral cards specifically — the element that caused the crash', () => {
    const neutrals = allCards.filter((c) => c.element === 'neutral');
    expect(neutrals.length).toBeGreaterThan(0);
    for (const c of neutrals) expect(glyphFor(c as Parameters<typeof glyphFor>[0]).length).toBeGreaterThan(0);
  });
});

describe('glyphFor — every element/type combination', () => {
  const types = ['unit', 'spell', 'foundation', 'environment'] as const;
  for (const element of CARD_ELEMENTS) {
    for (const type of types) {
      it(`${element} ${type} resolves`, () => {
        const card = { element, type, name: `${element}-${type}`, keywords: {}, attack: 1, hp: 1 };
        expect(glyphFor(card as Parameters<typeof glyphFor>[0]).length).toBeGreaterThan(0);
      });
    }
  }
});

describe('glyphFor — degrades instead of throwing on malformed input', () => {
  it('survives a card with no keywords, name or stats', () => {
    expect(glyphFor({ element: 'neutral', type: 'unit' } as Parameters<typeof glyphFor>[0]).length).toBeGreaterThan(0);
  });

  it('survives an unknown element rather than crashing the board', () => {
    const rogue = { element: 'void', type: 'unit', name: 'Rogue', keywords: {}, attack: 1, hp: 1 };
    expect(glyphFor(rogue as unknown as Parameters<typeof glyphFor>[0]).length).toBeGreaterThan(0);
  });
});
