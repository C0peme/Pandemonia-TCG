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
  // Signature threshold — half of it — is always a clean integer. An odd relic delta
  // would silently break that invariant, so guard it here at the data level.
  it('every enemyHpDelta is even', () => {
    for (const r of RELICS) {
      if (r.mods.enemyHpDelta !== undefined) {
        expect(Math.abs(r.mods.enemyHpDelta % 2), `${r.id}: ${r.mods.enemyHpDelta}`).toBe(0);
      }
    }
  });

  it('every relic has a valid rarity and a non-empty mods object', () => {
    for (const r of RELICS) {
      expect(['common', 'rare', 'boss'], r.id).toContain(r.rarity);
      expect(Object.keys(r.mods).length, `${r.id} has no mods`).toBeGreaterThan(0);
      expect(r.icon.length, r.id).toBeGreaterThan(0);
    }
  });

  it('offers a spread across all three rarity bands', () => {
    for (const band of ['common', 'rare', 'boss'] as const) {
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
    const m = aggregateMods(['ember-cache', 'war-drums', 'veterans-draw', 'full-quiver', 'merchants-seal', 'whetstone', 'banked-reserves-fire', 'standing-stone', 'prophets-coin', 'wide-market', 'coin-pouch']);
    expect(m.enemyHpDelta).toBe(-12); // -4 + -8
    expect(m.startingHandDelta).toBe(3); // 1 + 2
    expect(m.storeBuyMult).toBeCloseTo(0.75);
    expect(m.enhanceDiscount).toBeCloseTo(0.8);
    expect(m.extraStoreSlots).toBe(2);
    expect(m.startCoinsDelta).toBe(40);
    expect(m.startWithSignature).toBe(true);
    expect(m.elementCapDeltas).toEqual([{ element: 'fire', amount: 1 }]);
    expect(m.prePlaceFoundations).toEqual(['random']);
  });

  it('ignores unknown ids and empty list', () => {
    expect(aggregateMods(['nonexistent'])).toEqual(emptyMods());
    expect(aggregateMods([])).toEqual(emptyMods());
  });

  it('collects start-banks and sums start-energy bursts', () => {
    const m = aggregateMods(['deep-cistern', 'worldtree-seed', 'iron-ration', 'runic-battery']);
    expect(m.startBanks).toEqual([
      { element: 'leader', amount: 2 },
      { element: 'leader', amount: 4 },
    ]);
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
    applyRelicsToState(base, state, aggregateMods(['full-quiver']), 5); // +2
    expect(state.players[0].hand.length).toBe(before + 2);
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
    applyRelicsToState(base, state, aggregateMods(['deep-cistern']), 5); // +2 in leader element
    expect(state.players[0].bank[leaderEl]).toBe(Math.min(cap, 2));
  });

  it('start-bank never exceeds the (relic-boosted) element cap', () => {
    // World-Tree Seed banks 4; most caps are below 4, so it must clamp — and it must
    // clamp to the cap AFTER any reservoir raised it, since caps apply first.
    const state = initGame({ registry: base, decks, seed: 1 });
    const leaderEl = base.leaders.get(state.players[0].leaderId)!.element;
    const boostRelic = ({ fire: 'banked-reserves-fire', water: 'banked-reserves-water', nature: 'banked-reserves-nature', earth: 'banked-reserves-earth' } as const)[leaderEl];
    applyRelicsToState(base, state, aggregateMods(['worldtree-seed', boostRelic]), 5);
    const cap = state.players[0].elementCaps[leaderEl]; // already includes the +1
    expect(state.players[0].bank[leaderEl]).toBe(Math.min(cap, 4));
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
    applyRelicsToState(base, state, aggregateMods(['drill-sergeant', 'quartermaster-general']), 5);
    expect(state.players[0].costBase?.unit).toBe(-2); // -1 + -1
    expect(state.players[0].costBase?.spell).toBe(-1); // from quartermaster-general
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
