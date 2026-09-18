/**
 * Noctua's Cocoon — the power is a bet on three engine behaviours, and it is worthless if any
 * one of them is not true. All three are incidental properties of code that was written for
 * other reasons, so none of them is safe to assume:
 *
 *  1. Growth ticks at end of turn with NO status check (`resolveEndOfTurn` step 3), so a
 *     dormant unit keeps growing. This is the entire premise: the power buys TIME for a body
 *     whose offence comes from Growth. If a future change skips frozen/asleep units there,
 *     Cocoon silently becomes "your unit does nothing for two turns".
 *  2. Sleep heals `sleepHeal` per turn while asleep, and `applyStatus`'s `amount` is what sets
 *     it — the heal is not a separate effect.
 *  3. `wakeOnHit` clears BOTH statuses on the first hit and the freeze absorbs that hit
 *     entirely. That is what bounds the power: it protects against exactly one attack, so it
 *     cannot lock a lane, and it is why the two statuses are one package rather than two.
 *
 * It also consumes TWO target refs, which no other hero power in the game does — see the
 * `heroTargets` flow in useGame.ts for why that needed UI work to not fail silently.
 */
import { describe, expect, it } from 'vitest';
import { starterRegistry } from '@cards/data/starter';
import { applyAction } from '@engine/engine';
import { targetRefsNeeded } from '@engine/effects';
import { resolveEndOfTurn } from '@engine/endOfTurn';
import { wakeOnHit } from '@engine/status';
import { blankState, place, unit } from '@engine/testkit';
import { GRANTABLE_KEYWORD_KEYS, effectGrantKeywordsSchema } from '@cards/schema';
import type { GameEvent } from '@engine/events';

const noctua = starterRegistry.leaders.get('noctua')!;

/**
 * `applyAction` reports a refusal as an `{ t: 'error' }` EVENT on an UNCHANGED state — there is
 * no `error` key on the result, so the `'error' in res` idiom reads every refusal as a success.
 */
const failure = (res: { events: readonly { t: string }[] }): string | undefined =>
  (res.events.find((e) => e.t === 'error') as { message?: string } | undefined)?.message;

/** A board with Noctua seated and one growing body of her own to aim at. */
const setup = () => {
  const s = blankState({ round: 5 });
  s.players[0].leaderId = 'noctua';
  s.players[0].energy = 10;
  place(s, 0, 'ground1', unit({ owner: 0, attack: 1, hp: 5, keywords: { growth: { attack: 1, hp: 0 } } }));
  place(s, 1, 'ground1', unit({ owner: 1, attack: 3, hp: 4 }));
  return s;
};

/** Activate Cocoon on the caster's own unit, supplying a ref per targeted effect. */
const cocoon = (s: ReturnType<typeof setup>) => {
  const iid = s.players[0].lanes.ground1.front!.iid;
  const refs = Array.from({ length: targetRefsNeeded(noctua.heroPower.effects) }, () => ({ kind: 'unit' as const, iid }));
  const res = applyAction(starterRegistry, s, { type: 'heroPower', targets: refs });
  expect(failure(res)).toBeUndefined();
  return res.state;
};

describe('Cocoon applies both halves to one ally', () => {
  it('consumes exactly two target refs — the first hero power in the game that does', () => {
    expect(targetRefsNeeded(noctua.heroPower.effects)).toBe(2);
  });

  it('leaves the ally frozen AND asleep', () => {
    const u = cocoon(setup()).players[0].lanes.ground1.front!;
    expect(u.status.freeze, 'frozen').toBeGreaterThan(0);
    expect(u.status.sleep, 'asleep').toBeGreaterThan(0);
    expect(u.status.sleepHeal, 'the heal rides on applyStatus `amount`').toBe(2);
  });

  it('is aimed at an ALLY — it cannot be pointed at the enemy board', () => {
    const s = setup();
    const enemy = s.players[1].lanes.ground1.front!.iid;
    const res = applyAction(starterRegistry, s, {
      type: 'heroPower',
      targets: [{ kind: 'unit', iid: enemy }, { kind: 'unit', iid: enemy }],
    });
    expect(failure(res), 'an enemy target is refused').toBe('Target must be an ally');
  });
});

describe('the premise: a cocooned unit keeps growing', () => {
  it('Growth still ticks while frozen and asleep', () => {
    // If this ever fails, the power is worthless rather than merely weaker — the whole point
    // is that the turns it buys are turns the body is still improving.
    const s = cocoon(setup());
    const before = s.players[0].lanes.ground1.front!.attack;
    const events: GameEvent[] = [];
    resolveEndOfTurn(s, 0, events, starterRegistry);
    expect(s.players[0].lanes.ground1.front!.attack, 'grew while dormant').toBe(before + 1);
  });

  it('and heals for the sleep amount over the same turn', () => {
    const s = cocoon(setup());
    const u0 = s.players[0].lanes.ground1.front!;
    u0.hp = 1;
    const events: GameEvent[] = [];
    resolveEndOfTurn(s, 0, events, starterRegistry);
    expect(s.players[0].lanes.ground1.front!.hp, 'healed by sleepHeal').toBeGreaterThan(1);
  });
});

describe('the cost and the bound', () => {
  it('the freeze absorbs exactly ONE hit, and that hit ends the cocoon', () => {
    // The bound on the power: one attack of protection, not a lane lock. `wakeOnHit` is the
    // mechanism combat routes every incoming hit through — it reports the block AND clears both
    // statuses together, so the healing stops the moment the shield is spent.
    const target = cocoon(setup()).players[0].lanes.ground1.front!;
    const events: GameEvent[] = [];
    expect(wakeOnHit(target, false, events, 3), 'the hit is blocked in full').toBe(true);
    expect(target.status.freeze, 'freeze spent').toBeFalsy();
    expect(target.status.sleep, 'sleep ends with it').toBeFalsy();
    // ...and the next hit is not blocked, because there is no cocoon left to spend.
    expect(wakeOnHit(target, false, events, 3), 'no longer protected').toBe(false);
  });

  it('but Pierce goes straight through it', () => {
    // Same exception the Pierce keyword makes everywhere else: the cocoon is a defence, and
    // Pierce is the answer to defences. Worth pinning — it is the counterplay to the power.
    const target = cocoon(setup()).players[0].lanes.ground1.front!;
    expect(wakeOnHit(target, true, [], 3), 'pierced, not blocked').toBe(false);
  });
});

/**
 * A GRANTED Countdown, end to end.
 *
 * Countdown was the one effect-carrying keyword kept out of the grantable subset, and the
 * stated reason was the general one: effect-carrying keywords need wiring a shallow
 * `Object.assign` cannot do. For Countdown that turned out to be false — it holds no per-unit
 * state at all, because `resolveEndOfTurn` drives it from `turnsInPlay`, which every unit
 * already counts. The real blocker was a TypeScript cycle in the schema, not the engine.
 *
 * These tests are the proof of that claim, which is the only thing that justifies moving it:
 * a Countdown merged onto a live unit by a plain `buff` has to actually tick and fire.
 */
describe('a granted Countdown fires like a printed one', () => {
  const grantTo = (u: { keywords: Record<string, unknown> }) => {
    u.keywords.countdown = {
      turns: 2,
      repeat: true,
      effects: [{ kind: 'applyStatus', amount: 1, target: 'self', status: 'shield' }],
    };
  };

  it('ticks off turnsInPlay and resolves its effects', () => {
    const s = setup();
    const u = s.players[0].lanes.ground1.front!;
    grantTo(u);
    u.turnsInPlay = 1; // resolveEndOfTurn ages it to 2, which is due for a `turns: 2` repeat
    const events: GameEvent[] = [];
    resolveEndOfTurn(s, 0, events, starterRegistry);
    expect(events.some((e) => e.t === 'countdown'), 'the timer fired').toBe(true);
    expect(s.players[0].lanes.ground1.front!.shield, 'and its payload landed').toBeGreaterThan(0);
  });

  it('does NOT fire on a turn it is not due', () => {
    const s = setup();
    const u = s.players[0].lanes.ground1.front!;
    grantTo(u);
    u.turnsInPlay = 0; // ages to 1 — odd, so not due for a `turns: 2` repeat
    const events: GameEvent[] = [];
    resolveEndOfTurn(s, 0, events, starterRegistry);
    expect(events.some((e) => e.t === 'countdown')).toBe(false);
  });

  it('is reachable through the schema — a `buff` may now carry it', () => {
    // The schema half of the change: `effectGrantKeywordsSchema` is what a buff's `keywords`
    // field is validated against, and Countdown being absent from it is what made the grant
    // impossible to author at all, regardless of what the engine could do with it.
    expect(GRANTABLE_KEYWORD_KEYS).toContain('countdown');
    const parsed = effectGrantKeywordsSchema.safeParse({
      countdown: { turns: 2, repeat: true, effects: [{ kind: 'draw', amount: 1 }] },
    });
    expect(parsed.success, 'a valid granted countdown parses').toBe(true);
    // ...and its payload is still validated in full, despite being typed loosely to break the
    // schema cycle — the runtime check really does run each entry through `effectSchema`.
    const bad = effectGrantKeywordsSchema.safeParse({
      countdown: { turns: 2, effects: [{ kind: 'not-a-real-effect' }] },
    });
    expect(bad.success, 'a bogus payload is still rejected').toBe(false);
  });
});
