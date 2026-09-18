/**
 * Opening boons.
 *
 * The risk with a data-driven "apply this table of fields" system is that a field gets
 * declared in the type, written into the table, and then never read by the reducer —
 * silently free power, or silently no power. So every test here drives the real
 * `startRun` and asserts against a plain run of the same seed, rather than testing
 * `applyBoon` in isolation (which is not even exported).
 */
import { describe, expect, it } from 'vitest';
import { buildRegistry } from '@cards/registry';
import { starterCards, starterLeaders } from '@cards/data/starter';
import { startRun, pickGainRelic, leaveGain, leaveNode } from '@adventure/run';
import { BOONS, boonById, rollBoons, BOON_CHOICES, type Boon } from '@adventure/data/boons';
import { hpCeiling, ECON } from '@adventure/economy';
import { relicById } from '@adventure/data/relics';
import type { RunState } from '@adventure/schema';

const base = buildRegistry(starterCards, starterLeaders);
const SEED = 4242;
const plain = (): ReturnType<typeof startRun> => startRun('orsyric', SEED, base);
const withBoon = (id: string): ReturnType<typeof startRun> => startRun('orsyric', SEED, base, id);

describe('boon content', () => {
  it('has unique ids and says what it does', () => {
    const ids = BOONS.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const b of BOONS) {
      expect(b.name.length, b.id).toBeGreaterThan(0);
      expect(b.blurb.length, b.id).toBeGreaterThan(0);
      expect(b.icon.length, b.id).toBeGreaterThan(0);
    }
  });

  it('offers more boons than a single run can take, so the choice is real', () => {
    expect(BOONS.length).toBeGreaterThan(BOON_CHOICES * 2);
  });

  it('gives every boon at least one effect the reducer can act on', () => {
    // A boon whose fields were all absent would be a free click that does nothing.
    for (const b of BOONS) {
      const keys = Object.keys(b).filter((k) => !['id', 'name', 'icon', 'blurb'].includes(k));
      expect(keys.length, `${b.id} has no effect fields`).toBeGreaterThan(0);
    }
  });

  it('only ever charges HP on a boon that also pays out', () => {
    for (const b of BOONS) {
      if ((b.maxHpDelta ?? 0) >= 0) continue;
      const pays = Boolean(b.coins || b.relicBands || b.relicIds || b.randomCards || b.buff || b.mendLevel || b.attune || b.trim);
      expect(pays, `${b.id} costs HP for nothing`).toBe(true);
    }
  });
});

describe('rollBoons', () => {
  it('offers BOON_CHOICES distinct boons, fixed by the seed', () => {
    const a = rollBoons(99);
    expect(a).toHaveLength(BOON_CHOICES);
    expect(new Set(a.map((b) => b.id)).size).toBe(a.length);
    expect(rollBoons(99).map((b) => b.id)).toEqual(a.map((b) => b.id));
  });

  it('does not hand every run the same three', () => {
    const rows = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((s) => rollBoons(s).map((b) => b.id).join()));
    expect(rows.size).toBeGreaterThan(1);
  });
});

describe('startRun applies the chosen boon', () => {
  it('records which boon founded the run', () => {
    expect(withBoon('full-purse').boonId).toBe('full-purse');
    expect(plain().boonId).toBeUndefined();
  });

  it('ignores an unknown boon id rather than throwing', () => {
    const run = startRun('orsyric', SEED, base, 'no-such-boon');
    expect(run.boonId).toBeUndefined();
    expect(run.coins).toBe(ECON.STARTING_COINS);
  });

  it('coins: Full Purse', () => {
    // Magnitude read from the table, not hardcoded: these tests exist to prove the
    // reducer READS each field, and a retune of the number is not a regression.
    expect(withBoon('full-purse').coins - plain().coins).toBe(boonById('full-purse')!.coins);
  });

  it('maxHp: Iron Constitution raises the cap AND heals to it, moving the Signature line', () => {
    const run = withBoon('iron-constitution');
    expect(run.maxHp - plain().maxHp).toBe(boonById('iron-constitution')!.maxHpDelta);
    expect(run.hp).toBe(run.maxHp); // starts full, not short of the new cap
  });

  it('mendLevel: Field Medic', () => {
    expect(withBoon('field-medic').mendLevel).toBe(boonById('field-medic')!.mendLevel);
  });

  it('attune: Deep Attunement grants the LEADER\'s own element', () => {
    const run = withBoon('deep-attunement');
    const element = base.leaders.get('orsyric')!.element;
    const attunes = run.heroUpgrades.filter((u) => u.kind === 'attune');
    expect(attunes).toHaveLength(boonById('deep-attunement')!.attune!);
    for (const a of attunes) expect(a.kind === 'attune' && a.element).toBe(element);
  });

  it('trim: Travelling Light thins the deck without breaking the minimum', () => {
    const run = withBoon('travelling-light');
    expect(plain().deck.length - run.deck.length).toBe(boonById('travelling-light')!.trim);
    expect(run.deck.length).toBeGreaterThanOrEqual(ECON.MIN_DECK_SIZE);
  });

  it('randomCards: Conscription adds real, distinct owned copies', () => {
    const run = withBoon('conscription');
    expect(run.deck.length - plain().deck.length).toBe(boonById('conscription')!.randomCards);
    expect(new Set(run.deck.map((c) => c.uid)).size).toBe(run.deck.length);
    for (const c of run.deck) expect(base.cards.has(c.cardId), c.cardId).toBe(true);
  });

  it('buff: Blessed Steel enhances units, and only units', () => {
    const run = withBoon('blessed-steel');
    const spec = boonById('blessed-steel')!.buff!;
    const buffed = run.deck.filter((c) => c.enhancements.length > 0);
    expect(buffed).toHaveLength(spec.count);
    for (const c of buffed) {
      expect(c.enhancements).toEqual([{ kind: 'stat', attack: spec.attack, hp: spec.hp }]);
      const def = base.cards.get(c.cardId)!;
      expect(def.type === 'unit' || def.type === 'foundation', c.cardId).toBe(true);
    }
  });

  it('relicBands: Heirloom OFFERS a choice of charms rather than assigning one', () => {
    // Which charm is the player's call, exactly as at every other relic payout — and the
    // run opens on the screen that offers it, instead of starting on the map with an
    // unexplained relic already in the tray.
    const run = withBoon('heirloom');
    expect(run.relics, 'nothing is granted until it is chosen').toHaveLength(0);
    if (run.phase.t !== 'gain') throw new Error('expected the opening gain screen');
    expect(run.phase.relicChoices).toHaveLength(3);
    for (const id of run.phase.relicChoices!) {
      const relic = relicById(id)!;
      expect(relic, id).toBeTruthy();
      expect(['common', 'rare']).toContain(relic.rarity);
    }

    // Claiming one grants it and clears the gate.
    const claimed = pickGainRelic(run, run.phase.relicChoices![0]!);
    expect(claimed.relics).toEqual([run.phase.relicChoices![0]]);
    expect(claimed.phase.t === 'gain' && claimed.phase.relicChoices).toBeUndefined();
    // ...and Continue is refused until then.
    expect(leaveGain(run)).toBe(run);
    expect(leaveGain(claimed).phase.t).toBe('map');
  });

  it('Pact of Ash charges its price and pays out, without ever starting the run dead', () => {
    const run = withBoon('pact-of-ash');
    const p = plain();
    const pact = boonById('pact-of-ash')!;
    expect(run.maxHp).toBe(p.maxHp + pact.maxHpDelta!);
    expect(run.hp).toBe(run.maxHp);
    expect(run.hp).toBeGreaterThan(0);
    expect(run.coins - p.coins).toBe(pact.coins);
    // Its charm is offered on the opening screen, like every other relic payout.
    expect(run.phase.t === 'gain' && run.phase.relicChoices).toHaveLength(3);
  });

  it('never starts a run above the overheal ceiling or below 1 HP', () => {
    for (const b of BOONS) {
      const run = withBoon(b.id);
      expect(run.hp, b.id).toBeGreaterThan(0);
      expect(run.hp, b.id).toBeLessThanOrEqual(hpCeiling(run.maxHp));
      expect(run.maxHp, b.id).toBeGreaterThan(0);
    }
  });

  it('is deterministic — the same (leader, seed, boon) builds the same run', () => {
    for (const b of BOONS) {
      expect(JSON.stringify(withBoon(b.id)), b.id).toBe(JSON.stringify(withBoon(b.id)));
    }
  });

  it('leaves the map alone — a boon shapes the deck, not the road', () => {
    for (const b of BOONS) {
      expect(JSON.stringify(withBoon(b.id).map), b.id).toBe(JSON.stringify(plain().map));
    }
  });

  it('every declared Boon field is actually read by the reducer', () => {
    // The failure this guards: a field added to the type and the table, but never wired
    // into `applyBoon` — free power that no test would otherwise notice.
    const fields: (keyof Boon)[] = ['coins', 'coinsPerAct', 'maxHpDelta', 'mendLevel', 'relicBands', 'relicIds', 'randomCards', 'trim', 'attune', 'buff'];
    for (const field of fields) {
      const carrier = BOONS.find((b) => b[field] !== undefined);
      expect(carrier, `no boon exercises ${field}`).toBeTruthy();
      const run = withBoon(carrier!.id);
      const p = plain();
      expect(JSON.stringify(run), `${field} (via ${carrier!.id}) changes nothing`).not.toBe(
        JSON.stringify({ ...p, boonId: carrier!.id }),
      );
    }
  });

  it('boonById resolves every id in the table', () => {
    for (const b of BOONS) expect(boonById(b.id)).toBe(b);
    expect(boonById('nope')).toBeUndefined();
  });
});

describe('the boon table is balanced against one another', () => {
  it('grants a named relic outright rather than offering a roll', () => {
    // A band roll is a lottery the player watches resolve; a NAMED grant is the boon's
    // whole identity, printed on the card before they choose. That distinction is what
    // lets a cursed relic reach a run this way without breaking "a curse is always an
    // act" — the blurb named it, so taking the boon IS the act.
    const run = withBoon('borrowed-dawn');
    expect(run.relics).toEqual(['borrowed-dawn']);
    // No gain screen at all: there is nothing to choose, so the run opens on the map.
    expect(run.phase.t, 'a named grant needs no choice screen').toBe('map');
  });

  it('never lets a cursed relic reach a run through a band ROLL', () => {
    // The named grant is the only exception. Any boon that rolls bands must still be
    // rolling from the reward bands only.
    for (const b of BOONS) {
      for (const band of b.relicBands ?? []) expect(['common', 'rare'], `${b.id}`).toContain(band);
      for (const id of b.relicIds ?? []) expect(relicById(id), `${b.id} names a relic that does not exist`).toBeTruthy();
    }
  });

  it('keeps every boon inside one value unit of the others', () => {
    // The table drifted to a better-than-5x spread because nothing measured it: two
    // attunes are worth ~800 coins, Mend 2 pays +10 HP on every win of the run, and the
    // coin boon gave 150. This prices each boon on one crude scale and asserts the
    // spread has closed. The numbers are deliberately rough — the point is to catch a
    // boon that is three times its neighbours, not to claim they are exactly equal.
    const COIN = 1;
    const PER_MAX_HP = 25;        // a durable point of the pool
    const PER_MEND = 250;         // +5 HP on every win, all run
    const PER_ATTUNE = 295;       // attuneCost from a typical cap of 3
    const PER_TRIM = 90;          // thinning is premium and hard to buy
    const PER_CARD = 60;          // roughly a cheap shop card
    const PER_STAT = 45;          // one point of attack or HP, permanently
    const RELIC = { common: 140, rare: 220 };

    // `coinsPerAct` pays out again every act, but PERMADEATH means later payouts are
    // never guaranteed collected — the same delayed-value discount the header already
    // applies to a store-gated coin boon, just steeper: a run that dies in act 1 (which
    // most act-1 boss deaths in `.tuning/advRun.ts` measurements did) collects only the
    // first payout. 4x approximates "collected roughly this many times, on average,
    // across runs that make real progress" without pretending it is a guaranteed sum.
    const PER_ACT_MULTIPLIER = 4;
    const value = (b: Boon): number =>
      (b.coins ?? 0) * COIN
      + (b.coinsPerAct ?? 0) * COIN * PER_ACT_MULTIPLIER
      + (b.maxHpDelta ?? 0) * PER_MAX_HP
      + (b.mendLevel ?? 0) * PER_MEND
      + (b.attune ?? 0) * PER_ATTUNE
      + (b.trim ?? 0) * PER_TRIM
      + (b.randomCards ?? 0) * PER_CARD
      + (b.buff ? b.buff.count * (b.buff.attack + b.buff.hp) * PER_STAT : 0)
      + (b.relicBands ? (b.relicBands.includes('rare') ? RELIC.rare : RELIC.common) : 0);

    // `borrowed-dawn` is excluded: its entire value is a difficulty curve inside the
    // relic it names, which no coin figure can honestly represent. It is measured by the
    // curve assertions in relicShapes.test.ts instead.
    const priced = BOONS.filter((b) => !b.relicIds);
    const scores = priced.map((b) => ({ id: b.id, v: value(b) }));
    for (const { id, v } of scores) {
      expect(v, `${id} is worth far too little next to its peers`).toBeGreaterThanOrEqual(180);
      expect(v, `${id} is worth far too much next to its peers`).toBeLessThanOrEqual(430);
    }
    const lo = Math.min(...scores.map((x) => x.v));
    const hi = Math.max(...scores.map((x) => x.v));
    expect(hi / lo, `spread too wide: ${JSON.stringify(scores)}`).toBeLessThanOrEqual(2);
  });
});

describe('coinsPerAct: the one boon that pays again', () => {
  it('pays out on the opening act, same as a plain coins grant', () => {
    const run = withBoon('print-more-money');
    const p = plain();
    expect(run.coins - p.coins).toBe(boonById('print-more-money')!.coinsPerAct);
  });

  it('pays out AGAIN every time the run clears an act, reading the same field', () => {
    const run = withBoon('print-more-money');
    const bossReward: RunState = {
      ...run,
      map: { ...run.map, nodes: { ...run.map.nodes, boss1: { id: 'boss1', kind: 'boss', layer: 5, col: 0, next: [], seed: 1, visited: false } } },
      currentNodeId: 'boss1',
      phase: { t: 'reward', nodeId: 'boss1', coins: 0 },
    };
    const advanced = leaveNode(bossReward);
    expect(advanced.act).toBe(run.act + 1);
    expect(advanced.coins - run.coins).toBe(boonById('print-more-money')!.coinsPerAct);
  });

  it('pays nothing extra for a boon without the field', () => {
    const run = withBoon('full-purse');
    const bossReward: RunState = {
      ...run,
      map: { ...run.map, nodes: { ...run.map.nodes, boss1: { id: 'boss1', kind: 'boss', layer: 5, col: 0, next: [], seed: 1, visited: false } } },
      currentNodeId: 'boss1',
      phase: { t: 'reward', nodeId: 'boss1', coins: 0 },
    };
    const advanced = leaveNode(bossReward);
    expect(advanced.coins).toBe(run.coins);
  });
});
