import { describe, expect, it } from 'vitest';
import { buildRegistry } from '@cards/registry';
import { starterCards, starterLeaders } from '@cards/data/starter';
import { buildRunRegistry, ownedCardDef, advCardId, ENEMY_LEADER_ID } from '@adventure/runRegistry';
import type { OwnedCard } from '@adventure/schema';

const base = buildRegistry(starterCards, starterLeaders);

const owned = (cardId: string, enhancements: OwnedCard['enhancements']): OwnedCard => ({
  uid: 'u7',
  cardId,
  enhancements,
});

describe('buildRunRegistry', () => {
  it('materializes enhanced copies as derived defs and leaves the base untouched', () => {
    const copy = owned('coal-runner', [
      { kind: 'stat', attack: 1, hp: 2 },
      { kind: 'cost', energy: 1 },
      { kind: 'keyword', keywords: { taunt: true } },
    ]);
    const baseDef = base.cards.get('coal-runner')!;
    if (baseDef.type !== 'unit') throw new Error('expected unit');
    const reg = buildRunRegistry(base, { deck: [copy] });

    const def = reg.cards.get(advCardId('u7'))!;
    if (def.type !== 'unit') throw new Error('expected unit');
    expect(def.attack).toBe(baseDef.attack + 1);
    expect(def.hp).toBe(baseDef.hp + 2);
    expect(def.cost.energy).toBe(Math.max(0, baseDef.cost.energy - 1));
    expect(def.keywords.taunt).toBe(true);
    expect(def.name).toContain('+');
    // Base def unchanged (both the map entry and the object).
    expect(reg.cards.get('coal-runner')).toBe(baseDef);
    expect(base.cards.has(advCardId('u7'))).toBe(false);
  });

  it('never overwrites an existing keyword and never drops cost below 0', () => {
    // galatian-spirit has taunt; granting taunt again must not clobber it.
    const spirit = base.cards.get('galatian-spirit')!;
    if (spirit.type !== 'unit') throw new Error('expected unit');
    expect(spirit.keywords.taunt).toBe(true);
    const reg = buildRunRegistry(base, {
      deck: [owned('galatian-spirit', [{ kind: 'keyword', keywords: { taunt: true } }, { kind: 'cost', energy: 99 }])],
    });
    const def = reg.cards.get(advCardId('u7'))!;
    if (def.type !== 'unit') throw new Error('expected unit');
    expect(def.keywords.taunt).toBe(true);
    expect(def.cost.energy).toBe(0);
  });

  it('skips owned cards whose base def is missing', () => {
    const reg = buildRunRegistry(base, { deck: [owned('deleted-custom-card', [{ kind: 'cost', energy: 1 }])] });
    expect(reg.cards.has(advCardId('u7'))).toBe(false);
  });

  it('clones the enemy leader at reduced HP, including leader-unit leaders', () => {
    const reg = buildRunRegistry(base, { deck: [], enemyLeaderId: 'ringleader', enemyLeaderHp: 18 });
    const enemy = reg.leaders.get(ENEMY_LEADER_ID)!;
    expect(enemy.hp).toBe(18);
    expect(enemy.leaderUnitCardId).toBe('ringleader-avatar');
    // Original untouched (player may pick the same leader at full HP).
    expect(reg.leaders.get('ringleader')!.hp).toBe(base.leaders.get('ringleader')!.hp);
  });

  it('applies hero-power upgrades to the player leader without leaking to a same-archetype enemy', () => {
    // Enemy also plays skarn (Aggro) — its clone must keep the BASE hero power.
    const reg = buildRunRegistry(base, {
      deck: [],
      enemyLeaderId: 'orsyric',
      enemyLeaderHp: 20,
      playerLeaderId: 'orsyric',
      heroUpgrades: [{ kind: 'unique' }],
    });
    const baseSkarn = base.leaders.get('orsyric')!;
    const player = reg.leaders.get('orsyric')!;
    // Orsyric's unique (Psychic Lash) adds a second 1-damage strike.
    expect(player.heroPower.effects.length).toBe(baseSkarn.heroPower.effects.length + 1);
    expect(player.heroPower.effects.filter((e) => e.kind === 'damage')).toHaveLength(2);
    // Enemy clone unaffected.
    const enemy = reg.leaders.get(ENEMY_LEADER_ID)!;
    expect(enemy.heroPower.cost.energy).toBe(baseSkarn.heroPower.cost.energy);
    expect(enemy.heroPower.effects[0]!.amount).toBe(baseSkarn.heroPower.effects[0]!.amount);
  });

  it('globalBuff twist bumps every unit def on both resolution paths', () => {
    const reg = buildRunRegistry(base, {
      deck: [owned('coal-runner', [{ kind: 'stat', attack: 1, hp: 0 }])],
      twist: { id: 't', name: 'T', blurb: '', kind: 'globalBuff', stat: { attack: 1, hp: 1 } },
    });
    for (const [id, card] of reg.cards) {
      if (card.type !== 'unit') continue;
      const baseDef = id === advCardId('u7') ? base.cards.get('coal-runner')! : base.cards.get(id);
      if (!baseDef || baseDef.type !== 'unit') continue;
      const extra = id === advCardId('u7') ? 1 : 0; // the enhancement stacks on the twist
      expect(card.attack, id).toBe(Math.max(0, baseDef.attack + 1 + extra));
      expect(card.hp, id).toBe(Math.max(1, baseDef.hp + 1));
    }
  });

  it('globalKeyword twist grants the keyword to EVERY unit (no hidden randomness)', () => {
    const twist = { id: 't', name: 'T', blurb: '', kind: 'globalKeyword', keyword: 'spike', value: 1 } as const;
    const reg = buildRunRegistry(base, { deck: [], twist });
    const units = [...reg.cards.values()].filter((c) => c.type === 'unit');
    expect(units.length).toBeGreaterThan(0);
    for (const c of units) {
      if (c.type !== 'unit') continue;
      expect(c.keywords.spike, `${c.id} missing spike`).toBeDefined();
    }
    // Base registry untouched.
    expect([...base.cards.values()].some((c) => c.type === 'unit' && c.keywords.spike === undefined)).toBe(true);
  });

  it('globalKeyword never downgrades a unit that already has a stronger value', () => {
    // barbed-sentinel prints Spike 2; a Spike 1 twist must not overwrite it.
    const printed = base.cards.get('barbed-sentinel')!;
    if (printed.type !== 'unit') throw new Error('expected unit');
    expect(printed.keywords.spike).toBe(2);
    const reg = buildRunRegistry(base, {
      deck: [],
      twist: { id: 't', name: 'T', blurb: '', kind: 'globalKeyword', keyword: 'spike', value: 1 },
    });
    const after = reg.cards.get('barbed-sentinel')!;
    if (after.type !== 'unit') throw new Error('expected unit');
    expect(after.keywords.spike).toBe(2);
  });

  it('globalKeyword supports StatMod payloads (Growth)', () => {
    const reg = buildRunRegistry(base, {
      deck: [],
      twist: { id: 't', name: 'T', blurb: '', kind: 'globalKeyword', keyword: 'growth', value: { attack: 1, hp: 1 } },
    });
    const coal = reg.cards.get('coal-runner')!;
    if (coal.type !== 'unit') throw new Error('expected unit');
    expect(coal.keywords.growth).toEqual({ attack: 1, hp: 1 });
  });
});

describe('ownedCardDef', () => {
  it('returns the base def for unenhanced copies', () => {
    expect(ownedCardDef(base, owned('coal-runner', []))).toBe(base.cards.get('coal-runner'));
  });
});
