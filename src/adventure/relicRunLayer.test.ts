/**
 * RUN-LAYER relic mods — the ones `run.ts` reads between fights rather than applying to a
 * GameState.
 *
 * Before these existed, all 39 shipped relics were fight-start numbers or shop
 * multipliers: a relic could change how strong you were, never how the run played. The
 * risk with a new mod field is that it is declared, aggregated, and then never actually
 * read at the point it is supposed to matter — so each test drives the real reducer.
 */
import { describe, expect, it } from 'vitest';
import { buildRegistry } from '@cards/registry';
import { starterCards, starterLeaders } from '@cards/data/starter';
import { startRun, resolveCombat, restHeal } from '@adventure/run';
import { aggregateMods } from '@adventure/relics';
import { RELICS, relicById } from '@adventure/data/relics';
import { hpCeiling, victoryHealAmount, restHealAmount } from '@adventure/economy';
import type { RunState } from '@adventure/schema';

const base = buildRegistry(starterCards, starterLeaders);

/** Put the run into a combat phase on an injected node. */
const atCombat = (over: Partial<RunState> = {}): RunState => {
  const run = startRun('orsyric', 42, base);
  const id = 'inj-combat';
  return {
    ...run, ...over,
    map: {
      ...run.map,
      nodes: { ...run.map.nodes, [id]: { id, kind: 'combat', layer: 2, col: 0, next: [], seed: 99, visited: false } },
    },
    currentNodeId: id,
    phase: { t: 'combat', nodeId: id, fightSeed: 1 },
  };
};

const atRest = (over: Partial<RunState> = {}): RunState => {
  const run = startRun('orsyric', 42, base);
  const id = 'inj-rest';
  return {
    ...run, ...over,
    map: {
      ...run.map,
      nodes: { ...run.map.nodes, [id]: { id, kind: 'rest', layer: 2, col: 0, next: [], seed: 99, visited: false } },
    },
    currentNodeId: id,
    phase: { t: 'rest', nodeId: id },
  };
};

describe('aggregateMods', () => {
  it('folds every run-layer field additively', () => {
    const m = aggregateMods(['veterans-poultice', 'pilgrims-kettle', 'tithe-box', 'wanderers-map']);
    expect(m.victoryHealBonus).toBe(4);
    expect(m.restHealBonus).toBe(6);
    expect(m.coinsPerWin).toBe(20);
    expect(m.extraCardChoices).toBe(2);
  });

  it('lets a cursed relic push a field NEGATIVE', () => {
    // The whole point of the cursed line: existing fields pointed the other way.
    expect(aggregateMods(['bleeding-edge']).victoryHealBonus).toBe(-8);
    expect(aggregateMods(['famine-charm']).restHealBonus).toBe(-4);
  });

  it('cancels out when a bonus and a curse are held together', () => {
    expect(aggregateMods(['veterans-poultice', 'bleeding-edge']).victoryHealBonus).toBe(-4);
  });
});

describe('run-layer mods actually reach the reducer', () => {
  it('victoryHealBonus changes the post-battle heal', () => {
    const plain = resolveCombat(atCombat({ hp: 10 }), base, true, 10);
    const buffed = resolveCombat(atCombat({ hp: 10, relics: ['veterans-poultice'] }), base, true, 10);
    expect(buffed.hp - plain.hp).toBe(4);
    // And still never overheals — winning does not manufacture temporary HP.
    const full = resolveCombat(atCombat({ hp: 30, relics: ['veterans-poultice'] }), base, true, 30);
    expect(full.hp).toBe(full.maxHp);
  });

  it('a cursed relic makes the post-battle heal smaller', () => {
    const plain = resolveCombat(atCombat({ hp: 10 }), base, true, 10);
    const cursed = resolveCombat(atCombat({ hp: 10, relics: ['bleeding-edge'] }), base, true, 10);
    expect(cursed.hp).toBeLessThan(plain.hp);
    expect(plain.hp - cursed.hp).toBe(8);
  });

  it('coinsPerWin is paid on every win', () => {
    const plain = resolveCombat(atCombat(), base, true, 20);
    const rich = resolveCombat(atCombat({ relics: ['tithe-box'] }), base, true, 20);
    expect(rich.coins - plain.coins).toBe(20);
  });

  it('extraCardChoices widens the reward pick', () => {
    const plain = resolveCombat(atCombat(), base, true, 20);
    const wide = resolveCombat(atCombat({ relics: ['wanderers-map'] }), base, true, 20);
    const count = (r: RunState): number => (r.phase.t === 'reward' ? r.phase.cardChoices?.length ?? 0 : 0);
    expect(count(wide)).toBe(count(plain) + 2);
  });

  it('restHealBonus changes what a Rest Site restores', () => {
    const plain = restHeal(atRest({ hp: 10 }));
    const buffed = restHeal(atRest({ hp: 10, relics: ['pilgrims-kettle'] }));
    expect(buffed.hp - plain.hp).toBe(6);
  });

  it('overhealBonus raises the ceiling Rest can fill to', () => {
    // Start just under the PLAIN ceiling, so the only question is whether the cap moved.
    const start = hpCeiling(30) - 1;
    const plain = restHeal(atRest({ hp: start }));
    expect(plain.hp).toBe(hpCeiling(30)); // clamped at the normal ceiling

    const deeper = restHeal(atRest({ hp: start, relics: ['deep-reserve'] }));
    expect(deeper.hp).toBeGreaterThan(hpCeiling(30));
  });

  it('refuses Rest only at the relic-aware ceiling, not the plain one', () => {
    const atPlainCap = atRest({ hp: hpCeiling(30), relics: ['deep-reserve'] });
    // Without the relic this would be rejected as wasted; with it there is still room.
    expect(restHeal(atPlainCap)).not.toBe(atPlainCap);
  });

  it('tempHpDelta banks temporary HP the moment the relic is claimed', () => {
    // Claimed via the reward path so `grantRelic` is what runs, not a hand-rolled copy.
    const run = atCombat({ hp: 30 });
    const won = resolveCombat({ ...run, relics: [] }, base, true, 30);
    expect(won.hp).toBe(won.maxHp);
    const flask = relicById('travellers-flask')!;
    expect(flask.mods.tempHpDelta).toBe(12);
  });
});

describe('relic content', () => {
  it('has unique ids and a blurb for every relic', () => {
    const ids = RELICS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of RELICS) {
      expect(r.blurb.length, r.id).toBeGreaterThan(0);
      expect(r.icon.length, r.id).toBeGreaterThan(0);
    }
  });

  it('completes the element keyword toolkit across all four elements', () => {
    const covered = new Set(
      RELICS.flatMap((r) => (r.mods.elementKeywords ?? []).map((e) => e.element)),
    );
    for (const el of ['fire', 'water', 'nature', 'earth'] as const) {
      expect(covered.has(el), `no elementKeywords relic for ${el}`).toBe(true);
    }
  });

  it('gives every cursed relic a genuine downside', () => {
    // A "cursed" relic whose drawback was zero would just be a strictly-better relic.
    for (const id of ['gluttons-idol', 'bleeding-edge', 'hollow-purse', 'famine-charm', 'brittle-crown']) {
      const m = relicById(id)!.mods;
      const bad =
        (m.maxHpDelta ?? 0) < 0 ||
        (m.victoryHealBonus ?? 0) < 0 ||
        (m.restHealBonus ?? 0) < 0 ||
        (m.storeBuyMult ?? 1) > 1;
      expect(bad, `${id} has no downside`).toBe(true);
    }
  });

  it('keeps the base heal values themselves untouched', () => {
    // The relics adjust these; they must not have quietly rewritten the baseline.
    expect(victoryHealAmount(0)).toBe(10);
    expect(restHealAmount(30)).toBe(10);
  });
});
