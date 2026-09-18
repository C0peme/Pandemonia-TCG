import { describe, expect, it } from 'vitest';
import { buildRegistry } from '@cards/registry';
import { starterCards, starterLeaders, starterDecks } from '@cards/data/starter';
import { initGame } from '@engine/setup';
import { aggregateMods, applyRelicsToState, applyDeckBuffs, rollRelicChoices, emptyMods } from '@adventure/relics';
import { ownedCardDef } from '@adventure/runRegistry';
import { RELICS, relicById } from '@adventure/data/relics';
import type { OwnedCard } from '@adventure/schema';

const base = buildRegistry(starterCards, starterLeaders);
const decks: [typeof starterDecks[number], typeof starterDecks[number]] = [starterDecks[1]!, starterDecks[3]!];

describe('relic table', () => {
  it('has unique ids and every id resolves', () => {
    const ids = RELICS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(relicById(id)).toBeTruthy();
    expect(relicById('nope')).toBeUndefined();
  });

  // Enemy encounter HP is designed to always be even (see encounters.ts) so the
  // Enemy-HP relics are PROPORTIONAL, never flat. A flat cut authored against one HP
  // curve silently becomes a delete button when the curve is re-tuned smaller — which is
  // exactly what happened when `normalHp` was rebuilt (a common -4 became a 40% cut, and
  // a boss -12 removed early enemies outright).
  it('scales enemy HP by a multiplier, never a flat amount', () => {
    for (const r of RELICS) {
      expect(r.mods, `${r.id} still uses a flat enemy-HP delta`).not.toHaveProperty('enemyHpDelta');
      if (r.mods.enemyHpMult === undefined) continue;
      // Bounded both ways. Below 1 is a discount and may never delete an enemy outright;
      // ABOVE 1 is legal and is a PRICE — Covenant Stone buys a permanent energy
      // advantage by making every enemy tougher — but must stay small enough that the
      // relic remains a trade rather than a wall.
      // A relic whose multiplier CLIMBS BACK with the act is exempt from the lower
      // bound, and only that one: the floor exists so a permanent discount can never
      // delete an enemy, and a discount that expires by construction is not permanent.
      // It still may not open at zero, and it has to return above the ordinary floor
      // within a handful of acts or it is a static discount wearing a curve.
      const climbs = (r.scale?.source === 'act') && (r.scale.mods.enemyHpMult ?? 1) > 1;
      if (climbs) {
        expect(r.mods.enemyHpMult, `${r.id} opens at nothing`).toBeGreaterThanOrEqual(0.1);
        const after = (acts: number): number =>
          r.mods.enemyHpMult! * Math.pow(r.scale!.mods.enemyHpMult!, Math.min(r.scale!.maxSteps, acts));
        expect(after(4), `${r.id} never climbs back out of the discount`).toBeGreaterThanOrEqual(0.5);
        expect(after(99), `${r.id} compounds into a wall`).toBeLessThanOrEqual(2);
      } else {
        expect(r.mods.enemyHpMult, r.id).toBeGreaterThanOrEqual(0.5);
        expect(r.mods.enemyHpMult, r.id).toBeLessThanOrEqual(1.3);
      }
      expect(r.mods.enemyHpMult, `${r.id} is a no-op`).not.toBe(1);
      // A relic that makes fights HARDER must be paying for something, or it is simply
      // a bad relic — the failure mode the whole rarity rewrite exists to prevent.
      if (r.mods.enemyHpMult > 1) {
        const paidFor = Object.keys(r.mods).filter((k) => k !== 'enemyHpMult');
        expect(paidFor.length, `${r.id} raises enemy HP and gives nothing back`).toBeGreaterThan(0);
      }
    }
  });

  it('keeps the enemy-HP cut ordered by rarity', () => {
    const mult = (id: string): number => relicById(id)!.mods.enemyHpMult!;
    // A common must not out-cut a rare, nor a rare a boss relic. The ladder is three
    // rungs now, not six: four of the old six differed only in their percentage, which is
    // exactly the "rarity is magnitude" problem the table was rewritten to fix.
    expect(mult('ember-cache')).toBeGreaterThan(mult('siege-ram'));
    expect(mult('siege-ram')).toBeGreaterThan(mult('war-drums'));
  });

  it('every relic has a valid rarity and something to contribute', () => {
    for (const r of RELICS) {
      expect(['common', 'rare', 'boss', 'cursed'], r.id).toContain(r.rarity);
      // A SCALING relic may legitimately declare an empty `mods` — its whole payload
      // lives in `scale.mods` and is folded per step (the Hoard-Ledger does nothing at
      // all until the purse crosses 100 coins, which is the point of it). What is not
      // allowed is a relic with neither.
      const payload = Object.keys(r.mods).length + Object.keys(r.scale?.mods ?? {}).length;
      expect(payload, `${r.id} has no mods`).toBeGreaterThan(0);
      expect(r.icon.length, r.id).toBeGreaterThan(0);
    }
  });

  it('offers a spread across all four rarity bands', () => {
    for (const band of ['common', 'rare', 'boss', 'cursed'] as const) {
      expect(RELICS.filter((r) => r.rarity === band).length, `no ${band} relics`).toBeGreaterThan(0);
    }
  });
});

describe('applyDeckBuffs (element-conditional stat buffs)', () => {
  // ember-pup = fire unit, firebolt = fire spell, tide-serpent = water unit.
  const deck: OwnedCard[] = [
    { uid: 'a', cardId: 'ember-pup', enhancements: [] },
    { uid: 'b', cardId: 'firebolt', enhancements: [] },
    { uid: 'c', cardId: 'tide-serpent', enhancements: [] },
  ];
  const stat = (buffed: OwnedCard[], uid: string) => {
    const def = ownedCardDef(base, buffed.find((c) => c.uid === uid)!)!;
    return def.type === 'unit' || def.type === 'foundation' ? { attack: def.attack, hp: def.hp } : null;
  };
  const baseStat = (uid: string) => stat(deck, uid);

  it("buffs only owned cards of the matching element, and only those with stats", () => {
    const buffed = applyDeckBuffs(base, deck, aggregateMods(['emberbrand'])); // fire +1 atk
    // Fire unit gains +1 attack.
    expect(stat(buffed, 'a')!.attack).toBe(baseStat('a')!.attack + 1);
    expect(stat(buffed, 'a')!.hp).toBe(baseStat('a')!.hp);
    // Fire SPELL is untouched (no stats to buff).
    expect(buffed.find((c) => c.uid === 'b')!.enhancements).toEqual([]);
    // Water unit is a different element — untouched.
    expect(stat(buffed, 'c')).toEqual(baseStat('c'));
  });

  it('applies different buffs per element in one relic (Prismatic Core)', () => {
    const buffed = applyDeckBuffs(base, deck, aggregateMods(['prismatic-core']));
    // Fire → +1 atk, Water → +1 HP.
    expect(stat(buffed, 'a')!.attack).toBe(baseStat('a')!.attack + 1);
    expect(stat(buffed, 'a')!.hp).toBe(baseStat('a')!.hp);
    expect(stat(buffed, 'c')!.hp).toBe(baseStat('c')!.hp + 1);
    expect(stat(buffed, 'c')!.attack).toBe(baseStat('c')!.attack);
  });

  it('stacks with an existing enhancement rather than replacing it', () => {
    const enhanced: OwnedCard[] = [{ uid: 'a', cardId: 'ember-pup', enhancements: [{ kind: 'stat', attack: 2, hp: 0 }] }];
    const buffed = applyDeckBuffs(base, enhanced, aggregateMods(['emberbrand'])); // +1 more atk
    expect(stat(enhanced, 'a')!.attack).toBe(baseStat('a')!.attack + 2); // pre-existing +2
    expect(stat(buffed, 'a')!.attack).toBe(baseStat('a')!.attack + 3); // +2 kept, +1 added
    expect(buffed[0]!.enhancements).toHaveLength(2);
  });

  it('never mutates the input deck, and is a no-op without element buffs', () => {
    const snapshot = JSON.parse(JSON.stringify(deck));
    applyDeckBuffs(base, deck, aggregateMods(['emberbrand']));
    expect(deck).toEqual(snapshot); // transient copy only
    expect(applyDeckBuffs(base, deck, aggregateMods(['war-drums']))).toBe(deck); // no buffs → same ref
  });

  it('grants a keyword to matching-element units only (and not to spells)', () => {
    const buffed = applyDeckBuffs(base, deck, aggregateMods(['warpaint'])); // Fire → Battle Ready
    const fireUnit = ownedCardDef(base, buffed.find((c) => c.uid === 'a')!)!;
    expect(fireUnit.type === 'unit' && fireUnit.keywords.battleReady).toBe(true);
    // Fire spell has no unit keywords to gain — untouched.
    expect(buffed.find((c) => c.uid === 'b')!.enhancements).toEqual([]);
    // Water unit is the wrong element — untouched.
    expect(buffed.find((c) => c.uid === 'c')!.enhancements).toEqual([]);
  });

  it('applies stat AND keyword buffs together when both are present', () => {
    // emberbrand (fire +1 atk) + warpaint (fire Battle Ready) on the same fire unit.
    const buffed = applyDeckBuffs(base, deck, aggregateMods(['emberbrand', 'warpaint']));
    const fireUnit = ownedCardDef(base, buffed.find((c) => c.uid === 'a')!)!;
    expect(fireUnit.type === 'unit' && fireUnit.attack).toBe(baseStat('a')!.attack + 1);
    expect(fireUnit.type === 'unit' && fireUnit.keywords.battleReady).toBe(true);
    expect(buffed.find((c) => c.uid === 'a')!.enhancements).toHaveLength(2); // one stat + one keyword
  });

  it('Elemental Attunement grants a different keyword per element', () => {
    const buffed = applyDeckBuffs(base, deck, aggregateMods(['elemental-attunement']));
    const fire = ownedCardDef(base, buffed.find((c) => c.uid === 'a')!)!;
    const water = ownedCardDef(base, buffed.find((c) => c.uid === 'c')!)!;
    expect(fire.type === 'unit' && fire.keywords.battleReady).toBe(true);
    expect(water.type === 'unit' && water.keywords.taunt).toBe(true);
  });
});

describe('aggregateMods', () => {
  it('sums deltas, multiplies mults, collects caps/foundations', () => {
    const m = aggregateMods(['ember-cache', 'war-drums', 'veterans-draw', 'famine-charm', 'merchants-seal', 'whetstone', 'banked-reserves-fire', 'standing-stone', 'prophets-coin', 'wide-market', 'coin-pouch']);
    // Multiplied, not summed: 0.9 * 0.75. Stacking cuts compounds toward zero rather than
    // racing past it, so no combination can delete an enemy.
    expect(m.enemyHpMult).toBeCloseTo(0.675);
    expect(m.startingHandDelta).toBe(4); // veterans-draw 1 + famine-charm 3
    expect(m.storeBuyMult).toBeCloseTo(0.75);
    expect(m.enhanceDiscount).toBeCloseTo(0.6);
    expect(m.extraStoreSlots).toBe(2);
    expect(m.startCoinsDelta).toBe(120);
    expect(m.startWithSignature).toBe(true);
    expect(m.elementCapDeltas).toEqual([{ element: 'fire', amount: 1 }]);
    expect(m.prePlaceFoundations).toEqual(['random']);
  });

  it('ignores unknown ids and empty list', () => {
    expect(aggregateMods(['nonexistent'])).toEqual(emptyMods());
    expect(aggregateMods([])).toEqual(emptyMods());
  });

  it('collects start-banks and sums start-energy bursts', () => {
    const m = aggregateMods(['deep-cistern', 'banked-reserves-fire', 'iron-ration', 'runic-battery']);
    expect(m.startBanks).toEqual([{ element: 'leader', amount: 3 }]);
    expect(m.startEnergyBonus).toBe(3); // 1 + 2
  });
});

describe('applyRelicsToState', () => {
  it('raises element caps', () => {
    const state = initGame({ registry: base, decks, seed: 1 });
    const before = state.players[0].elementCaps.fire;
    applyRelicsToState(base, state, aggregateMods(['banked-reserves-fire']), 5);
    expect(state.players[0].elementCaps.fire).toBe(before + 1);
  });

  it('draws extra opening cards', () => {
    const state = initGame({ registry: base, decks, seed: 1 });
    const before = state.players[0].hand.length;
    applyRelicsToState(base, state, aggregateMods(['famine-charm']), 5); // +3
    expect(state.players[0].hand.length).toBe(before + 3);
  });

  it('adds the signature card to hand', () => {
    const state = initGame({ registry: base, decks, seed: 1 });
    const sigId = base.leaders.get(state.players[0].leaderId)!.signatureCardId;
    applyRelicsToState(base, state, aggregateMods(['prophets-coin']), 5);
    expect(state.players[0].hand.some((c) => c.cardId === sigId)).toBe(true);
  });

  it("Deep Cistern pre-banks in the leader's own element, clamped to the cap", () => {
    const state = initGame({ registry: base, decks, seed: 1 });
    const leaderEl = base.leaders.get(state.players[0].leaderId)!.element;
    const cap = state.players[0].elementCaps[leaderEl];
    applyRelicsToState(base, state, aggregateMods(['deep-cistern']), 5); // +3 in leader element
    expect(state.players[0].bank[leaderEl]).toBe(Math.min(cap, 3));
  });

  it('start-bank never exceeds the (relic-boosted) element cap', () => {
    // Deep Cistern banks 3; several caps are below that, so it must clamp — and it must
    // clamp to the cap AFTER any reservoir raised it, since caps apply first.
    const state = initGame({ registry: base, decks, seed: 1 });
    const leaderEl = base.leaders.get(state.players[0].leaderId)!.element;
    const boostRelic = ({ fire: 'banked-reserves-fire', water: 'banked-reserves-water', nature: 'banked-reserves-nature', earth: 'banked-reserves-earth' } as const)[leaderEl];
    applyRelicsToState(base, state, aggregateMods(['deep-cistern', boostRelic]), 5);
    const cap = state.players[0].elementCaps[leaderEl]; // already includes the +1
    expect(state.players[0].bank[leaderEl]).toBe(Math.min(cap, 3));
    expect(state.players[0].bank[leaderEl]).toBeLessThanOrEqual(cap);
  });

  it('grants a turn-1 energy burst on top of the round-1 energy', () => {
    const state = initGame({ registry: base, decks, seed: 1 });
    const before = state.players[0].energy;
    applyRelicsToState(base, state, aggregateMods(['runic-battery']), 5); // +2
    expect(state.players[0].energy).toBe(before + 2);
  });

  it('cost-reduction relics write to the persistent costBase (not the wiped costMods)', () => {
    const state = initGame({ registry: base, decks, seed: 1 });
    applyRelicsToState(base, state, aggregateMods(['drill-sergeant', 'spell-focus']), 5);
    expect(state.players[0].costBase).toMatchObject({ unit: -1, spell: -1, foundation: 0, environment: 0 });
    // The temporary lane stays untouched, so nothing is lost at turn-end.
    expect(state.players[0].costMods).toEqual({ unit: 0, spell: 0, foundation: 0, environment: 0 });
  });

  it('stacks multiple cost reductions of the same type', () => {
    const state = initGame({ registry: base, decks, seed: 1 });
    // Skirmisher's Creed cuts every card type by 1, same as The Long Column used to —
    // stacked with Drill Sergeant's unit-only -1, units should stack to -2 while spells
    // (untouched by Drill Sergeant) come only from the Creed.
    applyRelicsToState(base, state, aggregateMods(['drill-sergeant', 'skirmishers-creed']), 5);
    expect(state.players[0].costBase?.unit).toBe(-2); // -1 + -1
    expect(state.players[0].costBase?.spell).toBe(-1); // from skirmishers-creed
  });

  it('pre-places a foundation on an empty player lane, consuming iidSeq', () => {
    const state = initGame({ registry: base, decks, seed: 1 });
    const before = state.iidSeq;
    applyRelicsToState(base, state, aggregateMods(['standing-stone']), 5);
    const placed = ['heights', 'ground1', 'ground2', 'water'].filter((l) => state.players[0].lanes[l as 'heights'].standaloneFoundation);
    expect(placed.length).toBe(1);
    expect(state.iidSeq).toBeGreaterThan(before);
    const sf = state.players[0].lanes[placed[0] as 'heights'].standaloneFoundation!;
    expect(base.cards.get(sf.cardId)!.type).toBe('foundation');
    expect(sf.justPlaced).toBe(false);
  });

  it('is deterministic per seed', () => {
    const a = initGame({ registry: base, decks, seed: 2 });
    const b = initGame({ registry: base, decks, seed: 2 });
    applyRelicsToState(base, a, aggregateMods(['standing-stone']), 33);
    applyRelicsToState(base, b, aggregateMods(['standing-stone']), 33);
    expect(a.players[0].lanes).toEqual(b.players[0].lanes);
  });
});

describe('rollRelicChoices', () => {
  it('returns distinct unowned relics, deterministic per seed', () => {
    const a = rollRelicChoices(7, ['common', 'rare'], []);
    expect(a).toEqual(rollRelicChoices(7, ['common', 'rare'], []));
    expect(new Set(a).size).toBe(a.length);
    expect(a.length).toBe(3);
  });

  it('excludes already-owned relics', () => {
    const owned = RELICS.filter((r) => r.rarity === 'common').map((r) => r.id).slice(0, 2);
    const choices = rollRelicChoices(9, ['common'], owned);
    for (const id of choices) expect(owned).not.toContain(id);
  });

  it('prefers the requested band but falls back when exhausted', () => {
    const allCommon = RELICS.filter((r) => r.rarity === 'common').map((r) => r.id);
    const choices = rollRelicChoices(3, ['common'], allCommon); // no commons left
    expect(choices.length).toBe(3); // filled from other bands
  });
});
