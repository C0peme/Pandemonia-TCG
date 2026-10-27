import { describe, expect, it } from 'vitest';
import { resolveCombat } from '@engine/combat';
import { blankState, place, unit } from '@engine/testkit';
import { RULES } from '@engine/constants';
import { NULL_CARD, NULL_CARD_ID, NULL_KAMIKAZE_DAMAGE, NULL_VARIANTS } from '@cards/special';
import type { Card } from '@cards/schema';

const kw = (card: Card) => (card.type === 'unit' ? card.keywords : {});
const asUnit = (card: Card) => {
  if (card.type !== 'unit') throw new Error('Null must be a unit');
  // Mover is left out: it relocates at end of turn, which this combat-only test never reaches.
  return unit({ owner: 0, cardId: NULL_CARD_ID, attack: card.attack, hp: card.hp, keywords: { ...card.keywords, mover: undefined } });
};

describe('Null variants', () => {
  it('keeps the live Null as the current variant', () => {
    expect(NULL_VARIANTS.current).toBe(NULL_CARD);
  });

  it('legacy keeps Taunt; noTaunt and the live Null drop it but keep the body, Airborne and the self-damage', () => {
    expect(kw(NULL_VARIANTS.legacy!).taunt).toBe(true);
    for (const v of [NULL_VARIANTS.noTaunt!, NULL_CARD]) {
      expect(v.id).toBe(NULL_CARD_ID);
      expect(v.type === 'unit' && v.attack).toBe(4);
      expect(kw(v).taunt).toBeUndefined();
      expect(kw(v).airborne).toBe(true);
      expect(kw(v).kamikaze).toEqual(kw(NULL_VARIANTS.legacy!).kamikaze);
    }
    expect(kw(NULL_CARD).brittle).toBe(true);
    expect(kw(NULL_VARIANTS.noTaunt!).brittle).toBeUndefined();
  });

  it('the live Null trades 4 for 4: it hits once, crumbles, and bleeds its own leader', () => {
    const s = blankState();
    place(s, 0, 'ground1', asUnit(NULL_CARD));
    const r = resolveCombat(s).state;
    expect(r.players[1].leaderHp).toBe(RULES.LEADER_HP - 4);
    expect(r.players[0].lanes.ground1.front).toBeUndefined();
    expect(r.players[0].leaderHp).toBe(RULES.LEADER_HP - NULL_KAMIKAZE_DAMAGE);
  });
});
