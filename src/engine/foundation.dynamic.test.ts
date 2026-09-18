/**
 * A Foundation lends the unit above it HALF of the body it ACTUALLY has — buffs, Growth and
 * damage included — plus the abilities it carries, not the printed base of its card.
 */
import { describe, it, expect } from 'vitest';
import { applyFoundation, revertFoundation, foundationLiveState } from '@engine/foundation';
import { buffUnit, makeFoundationUnit } from '@engine/board';
import { unit } from '@engine/testkit';
import { parseCard, type FoundationCard } from '@cards/schema';

const found = (over: Partial<Record<string, unknown>> = {}): FoundationCard =>
  parseCard({
    id: 'dyn-found', name: 'dyn-found', type: 'foundation', element: 'earth',
    cost: { energy: 2 }, attack: 4, hp: 6, keywords: {}, grants: {}, ...over,
  }) as FoundationCard;

const standalone = (card: FoundationCard) => makeFoundationUnit(card, { iid: 'f1', cardId: card.id }, 0);

describe('foundation grants scale with the foundation itself', () => {
  it('grants half its printed body when nothing has changed it', () => {
    const host = unit({ owner: 0, attack: 2, hp: 3 });
    host.foundation = applyFoundation(host, found(), 'f1', undefined, foundationLiveState(standalone(found())));
    expect([host.attack, host.maxHp]).toEqual([4, 6]); // +2/+3
  });

  it('carries a buff landed on the standalone foundation up into the grant', () => {
    const card = found();
    const sf = standalone(card);
    buffUnit(sf, { attack: 4, hp: 4 }, []); // now an 8/10 body

    const host = unit({ owner: 0, attack: 2, hp: 3 });
    host.foundation = applyFoundation(host, card, 'f1', undefined, foundationLiveState(sf));
    expect([host.attack, host.maxHp]).toEqual([6, 8]); // +4/+5, not the base +2/+3

    revertFoundation(host, host.foundation!);
    expect([host.attack, host.maxHp]).toEqual([2, 3]);
  });

  it('lends less when the foundation has been chewed up', () => {
    const card = found();
    const sf = standalone(card);
    sf.hp = 2;
    const host = unit({ owner: 0, attack: 2, hp: 3 });
    host.foundation = applyFoundation(host, card, 'f1', undefined, foundationLiveState(sf));
    expect(host.maxHp).toBe(4); // +1, from 2 live HP
  });

  it('supersedes an authored grants.stat with the live half-body', () => {
    const card = found({ grants: { stat: { attack: 1, hp: 2 } } });
    const host = unit({ owner: 0, attack: 2, hp: 3 });
    host.foundation = applyFoundation(host, card, 'f1', undefined, foundationLiveState(standalone(card)));
    expect([host.attack, host.maxHp]).toEqual([4, 6]); // +2/+3, the authored 1/2 is not added
  });

  it("passes the foundation's OWN grantable keywords up, live ones included", () => {
    const card = found({ keywords: { taunt: true }, grants: { keywords: { spike: 1 } } });
    const sf = standalone(card);
    sf.keywords.lethal = true;            // gained while standing alone
    sf.keywords.doubleTeam = true;        // structural, must NOT be granted

    const host = unit({ owner: 0, attack: 2, hp: 3 });
    host.foundation = applyFoundation(host, card, 'f1', undefined, foundationLiveState(sf));
    expect(host.keywords.taunt).toBe(true);
    expect(host.keywords.lethal).toBe(true);
    expect(host.keywords.spike).toBe(1);
    expect(host.keywords.doubleTeam).toBeUndefined();

    revertFoundation(host, host.foundation!);
    expect(host.keywords.taunt).toBeUndefined();
    expect(host.keywords.lethal).toBeUndefined();
    expect(host.keywords.spike).toBeUndefined();
  });
});
