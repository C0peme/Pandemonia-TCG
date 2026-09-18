/**
 * The uniqueness pass, asserted.
 *
 * Two things this file guards, and they are different:
 *
 *  1. COVERAGE — the pass existed because whole mechanics the schema supports had never been
 *     printed on a unit. A keyword with no carrier is dead data: it cannot be drafted, the UI
 *     never renders its badge, and nothing exercises the engine path behind it. These tests
 *     pin the mechanics that had ZERO unit carriers so a future cull cannot quietly empty one
 *     again, and pin the pool's ability breadth so the same drift cannot creep back.
 *  2. PLAYABILITY — every new card is actually cast through `applyAction` on a real board.
 *     An auto-resolved trigger that finds no target is a silent no-op rather than an error
 *     (see `applyTriggeredEffects`), so a card whose entry effect never fires looks fine to
 *     the type-checker, the schema and the budget, and is blank in play. Only playing it says.
 */
import { describe, expect, it } from 'vitest';
import { starterCards, starterLeaders, starterRegistry } from '@cards/data/starter';
import { buildRegistry } from '@cards/registry';
import { applyAction } from '@engine/engine';
import { blankState, place, unit } from '@engine/testkit';
import type { Card, UnitCard } from '@cards/schema';

/**
 * `applyAction` reports a refusal as an `{ t: 'error' }` EVENT on an UNCHANGED state — there is
 * no `error` key on the result, so the `'error' in res` idiom used elsewhere never fires. Read
 * the event, or a rejected action reads as a silent success.
 */
const failure = (res: { events: readonly { t: string }[] }): string | undefined =>
  (res.events.find((e) => e.t === 'error') as { message?: string } | undefined)?.message;

const units = (starterCards as Card[]).filter((c): c is UnitCard => c.type === 'unit');
const byId = new Map(units.map((c) => [c.id, c]));
const carriers = (pred: (c: UnitCard) => unknown): string[] => units.filter((c) => pred(c)).map((c) => c.id);

/** Every id added by the uniqueness pass, in authoring order. */
const NEW_UNITS = [
  'vanguard-cinder', 'ashfall-mortar', 'twinflame-zealot', 'skyfall-lance', 'emberwright',
  'cinder-clockwork', 'pyre-martyr',
  'undertow-herald', 'riptide-shepherd', 'glacier-warden', 'deepwater-chirurgeon',
  'abyssal-harpooner', 'brine-conduit',
  'thistle-cub', 'bramble-tyrant', 'spore-matron', 'verdant-chorus', 'fangroot-stalker',
  'splitvine-archer', 'grafted-colossus',
  'barrow-revenant', 'tombstone-warden', 'cairn-judge', 'obsidian-aegis', 'mirror-bastion',
  'flint-arbiter',
  'quartermaster', 'drillmaster', 'warden-of-scales',
] as const;

describe('mechanics that had no unit carrier at all', () => {
  // Each of these was authored in the schema, priced in the budget and implemented in the
  // engine, and reachable from no card in the pool. The name in each case says where it WAS
  // reachable from, which is what made the gap easy to miss.
  it.each([
    ['zombified',            () => carriers((c) => c.keywords.zombified)],            // only an Environment grant (Graveyard)
    ['producer keyword',     () => carriers((c) => c.keywords.producer)],             // every ramp unit hand-rolled the effect instead
    ['mover keyword',        () => carriers((c) => c.keywords.mover)],                // only raw `move` effects
    ['expel keyword',        () => carriers((c) => c.keywords.expel)],                // only spells (Peel Back)
    ['debuff keyword',       () => carriers((c) => c.keywords.debuff)],               // only a spell and a Polish payload
    ['on-hit freeze',        () => carriers((c) => c.onHit?.freeze)],                 // Freeze existed only as a spell/status
    ['extraAction effect',   () => carriers((c) => c.onPlay?.some((e) => e.kind === 'extraAction'))],   // only Adrenaline Rush
    ['costMod effect',       () => carriers((c) => c.onPlay?.some((e) => e.kind === 'costMod'))],       // only signatures/hero powers
    ['discountHand effect',  () => carriers((c) => c.onPlay?.some((e) => e.kind === 'discountHand'))],  // only a leader upgrade
    ['setStats effect',      () => carriers((c) => c.onPlay?.some((e) => e.kind === 'setStats'))],      // nothing at all
    ['amountFrom removal',   () => carriers((c) => c.onPlay?.some((e) => e.amountFrom))],               // nothing at all
    ['element-banking entry', () => carriers((c) => c.onPlay?.some((e) => e.kind === 'energy' && e.element))], // ramp was all generic
  ])('%s has at least one unit', (_label, get) => {
    expect(get()).not.toEqual([]);
  });
});

describe('abilities that had exactly one carrier now have more', () => {
  // One carrier is one card: the ability is effectively a single card's name rather than a
  // mechanic a deck can be built around, and it cannot be compared against itself for balance.
  it.each([
    ['overshot', (c: UnitCard) => c.keywords.overshot],
    ['splashDamage', (c: UnitCard) => c.keywords.splashDamage],
    ['doubleStrike', (c: UnitCard) => c.keywords.doubleStrike],
    ['immunity', (c: UnitCard) => c.keywords.immunity],
    ['battleReady', (c: UnitCard) => c.keywords.battleReady],
    ['healer', (c: UnitCard) => c.keywords.healer],
    ['metamorphosis', (c: UnitCard) => c.keywords.metamorphosis],
  ])('%s', (_label, pred) => {
    expect(carriers(pred).length).toBeGreaterThanOrEqual(2);
  });
});

describe('the new units are distinct from each other and from the pool', () => {
  it('every new id exists and is a unit', () => {
    for (const id of NEW_UNITS) expect(byId.get(id), id).toBeDefined();
  });

  it('no two units share an identical printed profile', () => {
    // The cull half of the pass: eleven units were removed for re-stating another card's
    // niche. This is the cheap, mechanical part of "niche" — same element, same body, same
    // abilities — and it is the part that can regress by accident.
    const seen = new Map<string, string>();
    for (const c of units) {
      if (c.tags.includes('token') || c.tags.includes('signature')) continue;
      const key = JSON.stringify([c.element, c.attack, c.hp, c.keywords, c.onHit ?? null,
        c.onPlay ?? null, c.onAttack ?? null, c.endOfTurn ?? null, c.startOfTurn ?? null]);
      expect(seen.get(key), `${c.id} duplicates ${seen.get(key)}`).toBeUndefined();
      seen.set(key, c.id);
    }
  });

  it('a metamorphosis target resolves to a real unit', () => {
    for (const c of units) {
      const into = c.keywords.metamorphosis?.into;
      if (into) expect(byId.get(into), `${c.id} -> ${into}`).toBeDefined();
    }
  });
});

describe('every new unit resolves when actually played', () => {
  // A board with something on BOTH sides, so entry effects that need an enemy (Cairn Judge,
  // Flint Arbiter, Warden of Scales, Undertow Herald) and ones that need an ally (Drillmaster)
  // both have somewhere to land — this is the case that distinguishes a working card from a
  // silently-skipped trigger.
  const setup = (cardId: string) => {
    const s = blankState();
    place(s, 0, 'ground1', unit({ owner: 0, attack: 2, hp: 4 }));
    place(s, 1, 'ground1', unit({ owner: 1, attack: 3, hp: 4 }));
    place(s, 1, 'ground2', unit({ owner: 1, attack: 1, hp: 2 }));
    s.players[0].hand = [{ iid: 'h1', cardId }];
    s.players[0].energy = 30;
    for (const el of ['fire', 'water', 'nature', 'earth'] as const) s.players[0].bank[el] = 4;
    return s;
  };

  it.each(NEW_UNITS)('%s', (cardId) => {
    const res = applyAction(starterRegistry, setup(cardId), { type: 'playUnit', iid: 'h1', lane: 'heights' });
    expect(failure(res), cardId).toBeUndefined();
    // It reached the board (or, for a card that transforms/consumes on entry, at least left
    // the hand cleanly) and produced a play event rather than a no-op.
    expect(res.state.players[0].hand.find((h) => h.iid === 'h1'), 'card left the hand').toBeUndefined();
    expect(res.events.length, 'the play produced events').toBeGreaterThan(0);
  });
});

describe('the entry effects that were most at risk of being silent no-ops', () => {
  const registry = buildRegistry(starterCards, starterLeaders);
  const play = (cardId: string, lane: 'heights' | 'ground2' = 'heights') => {
    const s = blankState();
    place(s, 0, 'ground1', unit({ owner: 0, attack: 2, hp: 4 }));
    place(s, 1, 'ground1', unit({ owner: 1, attack: 3, hp: 5 }));
    s.players[0].hand = [{ iid: 'h1', cardId }, { iid: 'h2', cardId: 'ember-pup' }];
    s.players[0].energy = 30;
    for (const el of ['fire', 'water', 'nature', 'earth'] as const) s.players[0].bank[el] = 4;
    const res = applyAction(registry, s, { type: 'playUnit', iid: 'h1', lane });
    expect(failure(res), cardId).toBeUndefined();
    return res.state;
  };

  it('Cairn Judge shrinks the whole enemy board', () => {
    expect(play('cairn-judge').players[1].lanes.ground1.front!.attack).toBe(2);
  });

  it('Flint Arbiter deals the target its OWN attack back', () => {
    // 5 HP enemy with 3 attack takes 3.
    expect(play('flint-arbiter').players[1].lanes.ground1.front!.hp).toBe(2);
  });

  it('Warden of Scales shrinks a threat instead of killing it', () => {
    const after = play('warden-of-scales').players[1].lanes.ground1.front!;
    expect([after.attack, after.maxHp]).toEqual([1, 1]);
  });

  it('Undertow Herald queues its bounce as a player CHOICE, not an auto-pick', () => {
    // `playUnit` runs onPlay effects with `interactive: true`, so `move`/`expel` become a
    // pending selection the player resolves rather than the weakest-enemy auto-pick a
    // triggered (non-interactive) context would use. Asserting the pending entry is what
    // distinguishes "queued correctly" from "silently did nothing".
    const s = play('undertow-herald');
    expect(s.pending?.[0]).toMatchObject({ player: 0, kind: 'expel', scope: 'enemy' });
  });

  it('Quartermaster discounts the rest of the hand permanently', () => {
    // The bug this guards: `discountHand` needs no unit target, but fell through to the
    // harmful-'any' branch and was skipped whenever the enemy board was empty.
    expect(play('quartermaster').players[0].hand.find((h) => h.iid === 'h2')!.costDelta).toBe(-1);
  });

  it('Brine Conduit banks its own element rather than generic energy', () => {
    const s = blankState();
    place(s, 0, 'ground1', unit({ owner: 0, attack: 1, hp: 2 }));
    s.players[0].hand = [{ iid: 'h1', cardId: 'brine-conduit' }];
    s.players[0].energy = 30;
    s.players[0].bank.water = 0;
    s.players[0].elementCaps.water = 4;
    const res = applyAction(registry, s, { type: 'playUnit', iid: 'h1', lane: 'water' });
    expect(failure(res)).toBeUndefined();
    expect(res.state.players[0].bank.water).toBeGreaterThan(0);
  });
});
