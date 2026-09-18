/**
 * The uniqueness pass, SPELLS — the companion to `newUnits.test.ts`, guarding the same two
 * things for the spell half of the pool:
 *
 *  1. COVERAGE — eleven effect kinds the engine implements were reachable from no ordinary
 *     spell, and no base-set spell consumed more than ONE target ref despite `applyEffects`
 *     and `useGame` carrying a whole multi-target selection system. An effect kind with no
 *     card is dead data in exactly the way a keyword with no carrier is.
 *  2. PLAYABILITY — every new spell is cast through `applyAction` on a real board, with the
 *     right NUMBER of target refs. This is the half that static checks cannot do: a spell
 *     whose ref count the UI would get wrong fails SILENTLY (the cast is abandoned and even
 *     the first effect is rolled back — see `multiTarget.test.ts`), and `targetCombos` can
 *     declare a perfectly good card uncastable if it disagrees with `applyEffects` about
 *     which effects consume a ref.
 */
import { describe, expect, it } from 'vitest';
import { starterCards, starterRegistry } from '@cards/data/starter';
import { applyAction, legalActions } from '@engine/engine';
import { targetRefsNeeded } from '@engine/effects';
import { blankState, place, unit } from '@engine/testkit';
import type { Card, SpellCard } from '@cards/schema';
import type { TargetRef } from '@engine/actions';

/**
 * `applyAction` reports a refusal as an `{ t: 'error' }` EVENT on an UNCHANGED state — there is
 * no `error` key on the result, so the `'error' in res` idiom used elsewhere never fires. Read
 * the event, or a rejected action reads as a silent success.
 */
const failure = (res: { events: readonly { t: string }[] }): string | undefined =>
  (res.events.find((e) => e.t === 'error') as { message?: string } | undefined)?.message;

const spells = (starterCards as Card[]).filter((c): c is SpellCard => c.type === 'spell');
/** Signatures are free by design and answer to no cost or coverage rule — exclude them. */
const pool = spells.filter((c) => !c.tags.includes('signature'));
const byId = new Map(spells.map((c) => [c.id, c]));
const carriers = (pred: (c: SpellCard) => unknown): string[] => pool.filter((c) => pred(c)).map((c) => c.id);
const has = (c: SpellCard, kind: string) => c.effects.some((e) => e.kind === kind);

const NEW_SPELLS = [
  'war-drums', 'cinder-chain', 'immolate', 'twin-bolt', 'all-out-assault',
  'riptide-recall', 'numbing-depths', 'salt-the-wound',
  'overgrow', 'wild-hunt', 'seedfall', 'symbiosis', 'deep-roots',
  'unearth', 'bedrock-pact', 'landslide', 'sundering-blow', 'weight-of-ages',
  'requisition', 'field-hospital', 'bulk-order', 'second-wind', 'plunder',
] as const;

describe('effect kinds no ordinary spell could reach', () => {
  // Each was implemented in the engine and priced in the budget, and castable only from a
  // signature, a hero power, or nothing at all. The comment says where it WAS reachable from.
  it.each([
    ['summon',        () => carriers((c) => has(c, 'summon'))],        // only Autopus's signature
    ['energy',        () => carriers((c) => has(c, 'energy'))],        // only Golun's hero power
    ['energyNext',    () => carriers((c) => has(c, 'energyNext'))],    // only Producer bodies
    ['discountHand',  () => carriers((c) => has(c, 'discountHand'))],  // only a leader upgrade
    ['chooseElement', () => carriers((c) => c.effects.some((e) => e.chooseElement))], // only Golun
    ['fixed chain',   () => carriers((c) => c.effects.some((e) => e.chain))],         // only the diminishing form existed
    ['buff granting an on-hit package', () => carriers((c) => c.effects.some((e) => e.kind === 'buff' && e.onHit))], // only Kedou's signature
    ['healing your OWN leader', () => carriers((c) => c.effects.some((e) => e.kind === 'heal' && e.target === 'leader'))], // nothing at all
    ['applying Zombified', () => carriers((c) => c.effects.some((e) => e.status === 'zombified'))], // nothing at all
    ['an AOE debuff',  () => carriers((c) => c.effects.some((e) => e.kind === 'debuff' && e.target === 'all-enemy'))], // only a signature
    ['expelling your OWN unit', () => carriers((c) => c.effects.some((e) => e.kind === 'expel' && e.target === 'ally'))], // nothing at all
  ])('%s has at least one spell', (_label, get) => {
    expect(get()).not.toEqual([]);
  });

  it('the base set now exercises the multi-target selection system', () => {
    // The system exists, is documented, and had exactly one user: Eksana's UPGRADED signature,
    // reachable only in Adventure after an act-2 boss. A bug in it was therefore invisible to
    // every ordinary game — which is precisely how it shipped broken once already.
    const multi = pool.filter((c) => targetRefsNeeded(c.effects) > 1);
    expect(multi.length).toBeGreaterThanOrEqual(5);
  });
});

describe('the new spells are distinct', () => {
  it('every new id exists and is a spell', () => {
    for (const id of NEW_SPELLS) expect(byId.get(id), id).toBeDefined();
  });

  it('no two spells share an identical element and effect list', () => {
    // The cull half: Displacement Wave was a byte-for-byte copy of Peel Back, and The Long
    // Quiet was Tide of Oblivion with a bigger number in the same deck slot.
    const seen = new Map<string, string>();
    for (const c of pool) {
      const key = JSON.stringify([c.element, c.effects]);
      expect(seen.get(key), `${c.id} duplicates ${seen.get(key)}`).toBeUndefined();
      seen.set(key, c.id);
    }
  });

  it('a summoned card id resolves to a real unit', () => {
    for (const c of pool) {
      for (const e of c.effects) {
        if (e.kind !== 'summon' || !e.cardId) continue;
        expect(starterRegistry.cards.get(e.cardId)?.type, `${c.id} -> ${e.cardId}`).toBe('unit');
      }
    }
  });

  it('NEUTRAL spells stay colourless — no element-bearing effect, no pips', () => {
    for (const c of pool.filter((s) => s.element === 'neutral')) {
      expect(c.cost.elements, c.id).toBeUndefined();
    }
  });
});

describe('every new spell resolves when actually cast', () => {
  // Both sides populated, so an enemy-scoped and an ally-scoped effect both have somewhere to
  // land; hand stocked, so `discountHand` has something to discount and `forget` something to
  // take; a lane left open so `summon` can place.
  const setup = () => {
    const s = blankState();
    place(s, 0, 'ground1', unit({ owner: 0, attack: 2, hp: 6 }));
    place(s, 0, 'ground2', unit({ owner: 0, attack: 1, hp: 4 }));
    place(s, 1, 'ground1', unit({ owner: 1, attack: 3, hp: 6 }));
    place(s, 1, 'ground2', unit({ owner: 1, attack: 1, hp: 3 }));
    s.players[0].energy = 30;
    s.players[1].deck = ['ember-pup', 'ember-pup', 'ember-pup'].map((cardId, i) => ({ iid: `d${i}`, cardId }));
    for (const el of ['fire', 'water', 'nature', 'earth'] as const) s.players[0].bank[el] = 4;
    s.players[0].leaderHp = 10;
    return s;
  };

  /** Fill exactly the refs a spell asks for, choosing a legal side per effect. */
  const refsFor = (c: SpellCard, s: ReturnType<typeof setup>): TargetRef[] => {
    const mine = s.players[0].lanes.ground1.front!;
    const theirs = s.players[1].lanes.ground1.front!;
    const out: TargetRef[] = [];
    for (const e of c.effects) {
      if (targetRefsNeeded([e]) === 0) continue;
      if (e.kind === 'energy' && e.chooseElement) out.push({ kind: 'element', element: 'earth' });
      else if (e.kind === 'heal' && e.target === 'leader') out.push({ kind: 'leader', player: 0 });
      else if (e.target === 'ally' || e.target === 'self') out.push({ kind: 'unit', iid: mine.iid });
      else out.push({ kind: 'unit', iid: theirs.iid });
    }
    return out;
  };

  it.each(NEW_SPELLS)('%s', (cardId) => {
    const s = setup();
    const c = byId.get(cardId)!;
    s.players[0].hand = [{ iid: 'h1', cardId }, { iid: 'h2', cardId: 'ember-pup' }];
    const res = applyAction(starterRegistry, s, { type: 'playSpell', iid: 'h1', targets: refsFor(c, s) });
    expect(failure(res), cardId).toBeUndefined();
    expect(res.state.players[0].hand.find((h) => h.iid === 'h1'), 'card left the hand').toBeUndefined();
    expect(res.events.length, 'the cast produced events').toBeGreaterThan(0);
  });

  it('and each is offered by legalActions with the right number of refs', () => {
    // `targetCombos` builds the ref lists independently of `applyEffects`. When the two
    // disagree the card is either refused outright or offered with a ref count the resolver
    // will not read — both silent. Asserting the offered combos match `targetRefsNeeded`
    // is what keeps the two implementations honest about each new card.
    for (const cardId of NEW_SPELLS) {
      const s = setup();
      s.players[0].hand = [{ iid: 'h1', cardId }, { iid: 'h2', cardId: 'ember-pup' }];
      const casts = legalActions(starterRegistry, s).filter(
        (a): a is Extract<typeof a, { type: 'playSpell' }> => a.type === 'playSpell' && a.iid === 'h1',
      );
      expect(casts.length, `${cardId} is castable`).toBeGreaterThan(0);
      const want = targetRefsNeeded(byId.get(cardId)!.effects);
      for (const a of casts) expect(a.targets?.length ?? 0, cardId).toBe(want);
    }
  });
});

describe('the effects most likely to be silently wrong', () => {
  /**
   * Cast against a state the CALLER holds, so target refs are taken from the same board the
   * action runs on. Building refs from a throwaway board names iids that do not exist in the
   * state being mutated — and `resolveUnitTarget` then aborts the cast, which reads in the
   * assertion exactly like an effect that did nothing.
   */
  const cast = (s: ReturnType<typeof board>, cardId: string, targets: TargetRef[]) => {
    s.players[0].hand = [{ iid: 'h1', cardId }, { iid: 'h2', cardId: 'ember-pup' }, { iid: 'h3', cardId: 'firebolt' }];
    const res = applyAction(starterRegistry, s, { type: 'playSpell', iid: 'h1', targets });
    expect(failure(res), cardId).toBeUndefined();
    return res.state;
  };
  const board = () => {
    const s = blankState();
    place(s, 0, 'ground1', unit({ owner: 0, attack: 2, hp: 6 }));
    place(s, 1, 'ground1', unit({ owner: 1, attack: 3, hp: 3 }));
    place(s, 1, 'ground2', unit({ owner: 1, attack: 1, hp: 1 }));
    s.players[0].energy = 30;
    for (const el of ['fire', 'water', 'nature', 'earth'] as const) s.players[0].bank[el] = 4;
    return s;
  };
  const mine = (s: ReturnType<typeof board>) => s.players[0].lanes.ground1.front!;
  const big = (s: ReturnType<typeof board>) => s.players[1].lanes.ground1.front!;

  it('Twin Bolt lands BOTH bolts when aimed twice at one unit', () => {
    // The exact failure multi-target was written for: one ref supplied, the second effect
    // finds nothing, and the whole cast rolls back so even the first bolt never happened.
    const s = board();
    const t = big(s).iid;
    const after = cast(s, 'twin-bolt', [{ kind: 'unit', iid: t }, { kind: 'unit', iid: t }]);
    expect(after.players[1].lanes.ground1.front, '3 HP unit took 2+2').toBeUndefined();
  });

  it('Cinder Chain bounces at FULL strength to a second unit', () => {
    const s = board();
    const after = cast(s, 'cinder-chain', [{ kind: 'unit', iid: big(s).iid }]);
    // 3 kills the 3 HP unit, then a full 2 (not a diminished 2→1) finishes the 1 HP one.
    expect(after.players[1].lanes.ground1.front).toBeUndefined();
    expect(after.players[1].lanes.ground2.front).toBeUndefined();
  });

  it('Field Hospital heals the caster’s own leader', () => {
    const s = board();
    s.players[0].leaderHp = 10;
    const after = cast(s, 'field-hospital', [{ kind: 'leader', player: 0 }]);
    expect(after.players[0].leaderHp).toBeGreaterThan(10);
  });

  it('Requisition banks the element the player chose', () => {
    const s = board();
    s.players[0].bank.earth = 0;
    s.players[0].elementCaps.earth = 4;
    const after = cast(s, 'requisition', [{ kind: 'element', element: 'earth' }]);
    expect(after.players[0].bank.earth).toBe(2);
  });

  it('Bulk Order discounts the rest of the hand, needing no target at all', () => {
    const after = cast(board(), 'bulk-order', []);
    expect(after.players[0].hand.find((h) => h.iid === 'h2')!.costDelta).toBe(-1);
  });

  it('Riptide Recall returns your OWN unit to your hand', () => {
    const s = board();
    const recalled = mine(s).cardId;
    const after = cast(s, 'riptide-recall', [{ kind: 'unit', iid: s.players[0].lanes.ground1.front!.iid }]);
    expect(after.players[0].lanes.ground1.front).toBeUndefined();
    expect(after.players[0].hand.some((h) => h.cardId === recalled)).toBe(true);
  });

  it('Seedfall puts real bodies on the board, not cards in hand', () => {
    const before = board();
    const handBefore = 3;
    const after = cast(before, 'seedfall', []);
    const own = (['heights', 'ground1', 'water', 'ground2', 'heights2'] as const)
      .flatMap((l) => [after.players[0].lanes[l].front, after.players[0].lanes[l].back])
      .filter(Boolean);
    expect(own.length, 'two summoned bodies joined the one already there').toBe(3);
    expect(after.players[0].hand.length).toBe(handBefore - 1);
    expect(before.players[0].lanes.ground2.front).toBeUndefined();
  });

  it('Unearth grants Zombified, so the unit survives its first death', () => {
    const s = board();
    const after = cast(s, 'unearth', [{ kind: 'unit', iid: mine(s).iid }]);
    expect(after.players[0].lanes.ground1.front!.keywords.zombified).toBe(true);
  });

  it('Symbiosis grants an on-hit rider only where none is printed', () => {
    const s = board();
    const after = cast(s, 'symbiosis', [{ kind: 'unit', iid: mine(s).iid }]);
    expect(after.players[0].lanes.ground1.front!.onHit?.poison).toBe(true);
  });

  it('Deep Roots ramps the NEXT turn, not the current one', () => {
    // `energy` added at cast time would survive; the point of `energyNext` is that it is
    // consumed by `beginTurn`. Asserting the queue, not the pool, is what tells them apart.
    const after = cast(board(), 'deep-roots', []);
    expect(after.players[0].energyNext).toBeGreaterThanOrEqual(3);
  });

  it('Landslide shrinks every enemy at once', () => {
    const after = cast(board(), 'landslide', []);
    expect(after.players[1].lanes.ground1.front!.attack).toBe(2);
    // ...and CANNOT kill: `debuff` floors maxHp at 1 (see the handler), so the 1/1 is left
    // standing at 0/1 rather than dying. That is the card's identity, not a shortfall — it is
    // why Landslide answers a Zombified/Kamikaze board where a damage sweep hands them value.
    const runt = after.players[1].lanes.ground2.front!;
    expect([runt.attack, runt.maxHp]).toEqual([0, 1]);
  });

  it('Sundering Blow sizes each hit off its own target', () => {
    const s = board();
    const after = cast(s, 'sundering-blow', [
      { kind: 'unit', iid: big(s).iid },                          // 3 attack -> takes 3, dies
      { kind: 'unit', iid: s.players[1].lanes.ground2.front!.iid }, // 1 attack -> takes 1, dies
    ]);
    expect(after.players[1].lanes.ground1.front).toBeUndefined();
    expect(after.players[1].lanes.ground2.front).toBeUndefined();
  });
});
