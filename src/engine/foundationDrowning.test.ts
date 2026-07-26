/**
 * Foundation grants vs Water drowning.
 *
 * Foundations predate the drowning rule, so nothing re-decided water compatibility when a
 * Foundation handed out Aquatic/Airborne (or when it was destroyed and took the grant with
 * it), and Foundation stat grants wrote `attack` directly — clobbering the `predrownAttack`
 * shadow copy that drowning relies on.
 */
import { describe, expect, it } from 'vitest';
import { buildRegistry } from '@cards/registry';
import { starterCards, starterLeaders } from '@cards/data/starter';
import { blankState, unit } from '@engine/testkit';
import { applyFoundation, revertFoundation } from '@engine/foundation';
import { reconcileDrowning, addAttack } from '@engine/drowning';
import { buffUnit } from '@engine/board';
import type { FoundationCard } from '@cards/schema';
import type { GameEvent } from '@engine/events';

const registry = buildRegistry(starterCards, starterLeaders);
const foundation = (id: string): FoundationCard => {
  const c = registry.cards.get(id);
  if (!c || c.type !== 'foundation') throw new Error(`not a foundation: ${id}`);
  return c;
};

describe('a Foundation that grants water compatibility', () => {
  it.each(['tidal-dock', 'freds-boat'])('%s un-drowns its host', (id) => {
    const u = unit({ owner: 0, attack: 3, hp: 5 });
    reconcileDrowning(u, 'water');
    expect(u.status.drowning).toBe(true);
    expect(u.attack).toBe(0);

    u.foundation = applyFoundation(u, foundation(id), 'f1', 'water');
    expect(u.keywords.aquatic).toBeTruthy();
    expect(u.status.drowning).toBeUndefined();
    // Base attack is back, plus whatever the Foundation granted.
    expect(u.attack).toBe(3 + (foundation(id).grants.stat?.attack ?? 0));
  });

  it('Roost Nest un-drowns via Airborne too', () => {
    const u = unit({ owner: 0, attack: 2, hp: 4 });
    reconcileDrowning(u, 'water');
    u.foundation = applyFoundation(u, foundation('roost-nest'), 'f1', 'water');
    expect(u.status.drowning).toBeUndefined();
    expect(u.attack).toBe(2);
  });

  it('destroying it re-drowns a host that was only afloat on the grant', () => {
    const u = unit({ owner: 0, attack: 3, hp: 5 });
    reconcileDrowning(u, 'water');
    u.foundation = applyFoundation(u, foundation('tidal-dock'), 'f1', 'water');
    expect(u.status.drowning).toBeUndefined();

    revertFoundation(u, u.foundation!, 'water');
    expect(u.status.drowning).toBe(true);
    expect(u.attack).toBe(0);
    // Surfacing later still restores the unit's own attack, not a corrupted value.
    reconcileDrowning(u, 'ground1');
    expect(u.attack).toBe(3);
  });

  it('a natively Aquatic host is unaffected when the Foundation goes', () => {
    const u = unit({ owner: 0, attack: 3, hp: 5, keywords: { aquatic: true } });
    reconcileDrowning(u, 'water');
    u.foundation = applyFoundation(u, foundation('tidal-dock'), 'f1', 'water');
    revertFoundation(u, u.foundation!, 'water');
    expect(u.status.drowning).toBeUndefined();
    expect(u.attack).toBe(3);
  });

  it('omitting the lane leaves drowning alone (non-Water callers)', () => {
    const u = unit({ owner: 0, attack: 3, hp: 5 });
    u.foundation = applyFoundation(u, foundation('tidal-dock'), 'f1', 'ground1');
    expect(u.status.drowning).toBeUndefined();
    expect(u.attack).toBe(3);
  });
});

describe('stat changes while submerged', () => {
  it('a buff banks into predrownAttack instead of breaking the 0-attack invariant', () => {
    const u = unit({ owner: 0, attack: 2, hp: 5 });
    reconcileDrowning(u, 'water');
    const events: GameEvent[] = [];
    buffUnit(u, { attack: 3 }, events);
    expect(u.attack).toBe(0); // still submerged — cannot swing
    expect(u.predrownAttack).toBe(5);
    // The buff is no longer lost on surfacing (it used to be an accepted edge).
    reconcileDrowning(u, 'ground1');
    expect(u.attack).toBe(5);
  });

  it('addAttack never drives either store negative', () => {
    const dry = unit({ owner: 0, attack: 1, hp: 4 });
    addAttack(dry, -5);
    expect(dry.attack).toBe(0);

    const wet = unit({ owner: 0, attack: 1, hp: 4 });
    reconcileDrowning(wet, 'water');
    addAttack(wet, -5);
    expect(wet.predrownAttack).toBe(0);
    expect(wet.attack).toBe(0);
  });

  it('HP grants still apply normally while drowning', () => {
    const u = unit({ owner: 0, attack: 2, hp: 5 });
    reconcileDrowning(u, 'water');
    buffUnit(u, { hp: 2 }, []);
    expect(u.maxHp).toBe(7);
  });
});

describe('end-to-end through the real board', () => {
  it('a unit bonded onto Tidal Dock in Water can act', () => {
    const s = blankState();
    const u = unit({ owner: 0, attack: 3, hp: 5 });
    s.players[0].lanes.water.front = u;
    reconcileDrowning(u, 'water');
    u.foundation = applyFoundation(u, foundation('tidal-dock'), 'f1', 'water');
    u.justPlaced = false;
    expect(u.status.drowning).toBeUndefined();
    expect(u.attack).toBeGreaterThan(0);
  });
});
