/**
 * The relic table's SHAPE, and the machinery the rewritten table introduced.
 *
 * The old table's problem was not that it was small — it was that all 53 entries were the
 * same kind of thing (a number applied before the fight started) and the rarity bands were
 * magnitudes of that number rather than different kinds of thing. These tests pin the
 * doctrine written at the top of `data/relics.ts` so the bands cannot quietly collapse
 * back into one another as content is added.
 */
import { describe, expect, it } from 'vitest';
import { buildRegistry } from '@cards/registry';
import { starterCards, starterLeaders, starterDecks } from '@cards/data/starter';
import { initGame } from '@engine/setup';
import { beginTurn } from '@engine/turn';
import { autopilotActive } from '@engine/types';
import { applyTrialToState, trialById } from '@adventure/trials';
import { RELICS, ENERGY_PER_TURN_CAP, MIN_HAND_CAP_DELTA, MAX_HP_LOSS, MAX_ENEMY_HP_PRICE, MIN_HEAL_BONUS, relicById, type Relic, type RelicMods, type RelicRarity } from '@adventure/data/relics';
import { aggregateMods, runMods, runContext, applyRelicsToState, rollRelicChoices, rollStoreRelics, brokenRelics, repairsLeft, effectiveAct } from '@adventure/relics';
import { startRun, resolveCombat, pickRelic, buyRelic, unbindRelic, storeRelicStock, storeReroll, resolveTrim, leaveGain } from '@adventure/run';
import { ECON, relicPrice, relicUnbindCost, combatReward } from '@adventure/economy';
import { rollEncounter } from '@adventure/encounters';
import type { MapNode, RunState } from '@adventure/schema';

const base = buildRegistry(starterCards, starterLeaders);
const decks: [typeof starterDecks[number], typeof starterDecks[number]] = [starterDecks[1]!, starterDecks[3]!];

const fresh = (): ReturnType<typeof initGame> => initGame({ registry: base, decks, seed: 1 });

/** Fields inside ONE mods bag that make a relic worse. */
const priceFields = (m: RelicMods): string[] => {
  const prices: string[] = [];
  if ((m.maxHpDelta ?? 0) < 0) prices.push('maxHpDelta');
  if ((m.enemyHpMult ?? 1) > 1) prices.push('enemyHpMult');
  if ((m.extraCardChoices ?? 0) < 0) prices.push('extraCardChoices');
  if ((m.victoryHealBonus ?? 0) < 0) prices.push('victoryHealBonus');
  if ((m.restHealBonus ?? 0) < 0) prices.push('restHealBonus');
  if ((m.storeBuyMult ?? 1) > 1) prices.push('storeBuyMult');
  if (m.turnMill) prices.push('turnMill');
  if (m.consumedAfterBattle) prices.push('consumedAfterBattle');
  if ((m.handCapDelta ?? 0) < 0) prices.push('handCapDelta');
  if (m.autopilotEveryRounds) prices.push('autopilotEveryRounds');
  // A POSITIVE cost reduction makes your cards more expensive — the sign convention is
  // inverted for this field, and a broken relic is the only thing that uses it that way.
  if (Object.values(m.costReduction ?? {}).some((v) => (v ?? 0) > 0)) prices.push('costReduction');
  if ((m.actDelta ?? 0) < 0) prices.push('actDelta');
  return prices;
};

/**
 * Fields that are a price AND a benefit in the same breath.
 *
 * `actDelta` is the only one: shifting the run's act back makes every fight easier and
 * every purse smaller, because `actScale` and `combatReward` read the same number. That
 * self-pricing is the entire design of The Lesser Road, so counting it purely as a cost
 * would declare the relic "all price and no power" while counting it purely as a benefit
 * would declare it a curse that costs nothing. It is both, and the table needs to say so.
 */
const DUAL_NATURED = ['actDelta'];

/**
 * Fields that make a relic WORSE.
 *
 * A BROKEN relic's price lives in `broken`, not in `mods` — its `mods` is the repaired
 * form, which is pure benefit by design. Reading only `mods` would have declared the
 * whole Error Code family "a cursed relic with nothing cursed about it".
 */
const priceOf = (r: Relic): string[] => [
  ...priceFields(r.mods),
  ...(r.broken ? ['broken', ...priceFields(r.broken)] : []),
  // A relic can also hide its price in the SCALE: The Borrowed Dawn opens far below 1
  // and compounds upward every act, so its `mods` read as pure benefit while the debt
  // lives entirely in `scale.mods`. Reading only `mods` called it "a cursed relic with
  // nothing cursed about it".
  ...((r.scale?.mods.enemyHpMult ?? 1) > 1 ? ['scale:enemyHpMult'] : []),
];

/** Fields that make a relic BETTER — its own, plus whatever its scaling half contributes. */
const benefitCount = (r: Relic): number =>
  Object.keys(r.mods).length + Object.keys(r.scale?.mods ?? {}).length
  - priceFields(r.mods).filter((f) => !DUAL_NATURED.includes(f)).length;

describe('rarity means SCOPE, and cursed is where the prices live', () => {
  it('no common, rare or boss relic carries a drawback', () => {
    // The rule the `cursed` band exists to make possible. A boss relic in particular is
    // handed out once or twice a run, after a fight the player already paid for in HP —
    // taxing that reward again is taxing the same win twice.
    for (const r of RELICS.filter((x) => x.rarity !== 'cursed')) {
      expect(priceOf(r), `${r.id} prices a ${r.rarity}`).toEqual([]);
    }
  });

  it('every cursed relic is a real trade: at least one price AND at least one power', () => {
    const cursed = RELICS.filter((r) => r.rarity === 'cursed');
    expect(cursed.length, 'the cursed shelf should be well stocked').toBeGreaterThanOrEqual(10);
    for (const r of cursed) {
      expect(priceOf(r).length, `${r.id} is a cursed relic with nothing cursed about it`).toBeGreaterThan(0);
      expect(benefitCount(r), `${r.id} is all price and no power`).toBeGreaterThan(0);
    }
  });

  it('a cursed relic is never rolled as a reward — it can only be bought', () => {
    // Every reward path funnels through `rollRelicChoices`. Asking it for the boss band
    // (the widest fallback, so the most likely to reach past its own band) must still
    // never surface a curse.
    const cursedIds = new Set(RELICS.filter((r) => r.rarity === 'cursed').map((r) => r.id));
    for (let seed = 0; seed < 80; seed++) {
      for (const bands of [['common'], ['common', 'rare'], ['rare', 'boss']] as RelicRarity[][]) {
        for (const id of rollRelicChoices(seed, bands, [], 5)) {
          expect(cursedIds.has(id), `${id} was offered as a reward`).toBe(false);
        }
      }
    }
    // And the store shelf is the place they DO appear — exactly one per shelf.
    const shelf = rollStoreRelics(1234, 3, 0, []);
    expect(shelf.filter((id) => cursedIds.has(id)).length).toBe(1);
    // A shop never stocks the boss band: those are won, not bought.
    const bossIds = new Set(RELICS.filter((r) => r.rarity === 'boss').map((r) => r.id));
    for (let seed = 0; seed < 60; seed++) {
      for (const id of rollStoreRelics(seed, 6, 0, [])) expect(bossIds.has(id), `${id} for sale`).toBe(false);
    }
  });

  it('a boss relic rewrites the run: it scales, rewrites a rule, or transforms on claim', () => {
    // The three shapes a 3-star is allowed to be. "A rare with a bigger number" is what
    // this band was rewritten to stop being.
    const oneShotFields = ['trimDeck', 'temperRandom', 'grantCards', 'startCoinsDelta', 'tempHpDelta', 'spendAllForBuff'];
    for (const r of RELICS.filter((x) => x.rarity === 'boss')) {
      const scales = Boolean(r.scale);
      // A grant that reaches every element is a RULE ("everything is Battle Ready now"),
      // not a stat line on one archetype — that is what distinguishes The Vanguard Writ
      // from a rare's single-element keyword toolkit.
      const universalGrant = (r.mods.elementKeywords?.length ?? 0) >= 5 || (r.mods.elementBuffs?.length ?? 0) >= 5;
      // A permanent multiplier on ALL future coin income changes the shape of the
      // run's economy rather than bumping one stat, same family as energyPerTurn/
      // startBank — so it counts as a rule rewrite too.
      const economyRewrite = Boolean(r.mods.coinsEarnedMult && r.mods.coinsEarnedMult !== 1);
      const ruleRewrite = Boolean(r.mods.energyPerTurn) || Boolean(r.mods.startBank) || universalGrant || economyRewrite;
      const oneShot = oneShotFields.some((f) => f in r.mods);
      expect(scales || ruleRewrite || oneShot, `${r.id} is a rare with a bigger number`).toBe(true);
    }
    // And scaling is the band signature, not a one-off.
    expect(RELICS.filter((r) => r.scale).length).toBeGreaterThanOrEqual(5);
    for (const r of RELICS.filter((x) => x.scale)) {
      // Scaling is the BOSS band's signature, but the cursed band may borrow it to
      // express a debt that grows — and when it does, the curve must be the PRICE
      // (rising past 1), never a second helping of benefit.
      expect(['boss', 'cursed'], `${r.id} scales outside both bands that may`).toContain(r.rarity);
      if (r.rarity === 'cursed') {
        expect(priceOf(r).length, `${r.id} scales as a curse but costs nothing`).toBeGreaterThan(0);
      }
      // An uncapped multiplier off coins or deck size is how a relic quietly ends the
      // difficulty curve, so the cap is required rather than optional.
      expect(r.scale!.maxSteps, `${r.id} scales without a ceiling`).toBeGreaterThan(0);
      expect(r.scale!.per, `${r.id} has a nonsense step size`).toBeGreaterThan(0);
    }
  });

  it('permanent per-turn energy stays boss-or-cursed, and is capped when stacked', () => {
    // The single largest thing a relic can give: turn energy is the ROUND NUMBER, so +1
    // is a doubling on turn one. The boss band grants it clean; the cursed band grants it
    // WITH a second benefit and a price, so a curse is never just a worse Dawn Engine.
    const carriers = RELICS.filter((r) => r.mods.energyPerTurn);
    expect(carriers.length).toBeGreaterThanOrEqual(4);
    for (const r of carriers) {
      expect(['boss', 'cursed'], `${r.id} grants per-turn energy in the ${r.rarity} band`).toContain(r.rarity);
      if (r.rarity === 'cursed') {
        expect(priceOf(r).length, `${r.id} is a curse that costs nothing`).toBeGreaterThan(0);
        // A PERMANENT price has to buy more than the boss band gives away, or the curse
        // is simply a worse Dawn Engine. A BROKEN relic is exempt, and the exemption is
        // the point of the shape: its price expires, so reaching bare parity with Dawn
        // Engine IS the deal — what you actually bought is access (a shop shelf instead
        // of a boss kill) and the earliness, paid for with a debt you work off.
        if (!r.broken) {
          expect(benefitCount(r), `${r.id} should out-give the clean boss version`).toBeGreaterThanOrEqual(2);
        }
      }
    }
    const stacked = aggregateMods(carriers.map((r) => r.id));
    expect(stacked.energyPerTurn).toBe(ENERGY_PER_TURN_CAP);
  });

  it('prices power with the hand cap only in the cursed band, and never past the floor', () => {
    // A tight hand is the most violent price in the table — with one draw a turn you
    // begin discarding live cards. It is legal, because a relic can pay for it, but only
    // where prices belong and only down to a cap a hand can still be held together at.
    for (const r of RELICS) {
      const delta = r.mods.handCapDelta ?? 0;
      if (delta >= 0) continue;
      expect(r.rarity, `${r.id} prices a ${r.rarity} with the hand cap`).toBe('cursed');
      expect(delta, `${r.id} cuts the hand past the floor`).toBeGreaterThanOrEqual(MIN_HAND_CAP_DELTA);
      // And it has to buy something that changes the game, not a number: a whole-deck
      // discount, a draw engine, or a board-wide buff.
      const m = r.mods;
      const structural = Boolean(m.costReduction) || Boolean(m.turnDraw) || Boolean(m.elementBuffs?.length) || Boolean(m.energyPerTurn);
      expect(structural, `${r.id} charges a hand cap for a rounding error`).toBe(true);
    }
    // Every relic that hands out cards still hands out room to hold them.
    for (const r of RELICS) {
      if (!r.mods.startingHandDelta) continue;
      expect(r.mods.handCapDelta ?? 0, `${r.id} draws cards with no room`).toBeGreaterThanOrEqual(r.mods.startingHandDelta);
    }
  });

  it('every relic actually does something, and every conditional one is reachable', () => {
    for (const r of RELICS) {
      const payload = Object.keys(r.mods).length + Object.keys(r.scale?.mods ?? {}).length;
      expect(payload, `${r.id} has no mods`).toBeGreaterThan(0);
      expect(benefitCount(r), `${r.id} is all price and no power`).toBeGreaterThan(0);
      if (!r.when) continue;
      // A condition nobody can satisfy is a dead relic dressed as a build-around.
      expect(Object.keys(r.when).length, `${r.id} has an empty condition`).toBeGreaterThan(0);
      if (r.when.deckAtMost !== undefined) expect(r.when.deckAtMost).toBeGreaterThanOrEqual(ECON.MIN_DECK_SIZE);
    }
  });

  it('no relic rewrites a lane for both sides — that reads as a wash, not as power', () => {
    // A shared-Environment rewrite still exists in the game, but only as a Trial twist,
    // where the player knowingly picks the rule and is paid for its severity. A relic
    // that quietly bound the enemy too was reported as feeling like dead weight.
    for (const r of RELICS) {
      expect('startEnvironments' in r.mods, `${r.id} rewrites a lane for both sides`).toBe(false);
    }
  });

  it('a cursed price is a matter of degree — never a system switched off, never past its cap', () => {
    // The failure this locks down: Hollow Lantern and Dead Anvil each granted the same
    // clean benefit as a boss relic and then deleted an entire node type (Rest, the
    // altar) for the rest of the run — a price with no natural way to recover from it and
    // no play skilled enough to answer it. Every remaining cursed relic must price a
    // NUMBER, and stay inside the caps that keep a number from drifting back into a
    // deletion by increments.
    const disablingFields: (keyof Relic['mods'])[] = ['noBuy' as never, 'noRest' as never, 'noEnhance' as never];
    for (const r of RELICS) {
      for (const f of disablingFields) expect(f in r.mods, `${r.id} still carries ${String(f)}`).toBe(false);
      if (r.rarity !== 'cursed') continue;
      if ((r.mods.maxHpDelta ?? 0) < 0) {
        expect(r.mods.maxHpDelta!, `${r.id} costs more max HP than the cap allows`).toBeGreaterThanOrEqual(MAX_HP_LOSS);
      }
      if ((r.mods.enemyHpMult ?? 1) > 1) {
        expect(r.mods.enemyHpMult!, `${r.id} taxes every future fight past the cap`).toBeLessThanOrEqual(MAX_ENEMY_HP_PRICE);
      }
      if ((r.mods.victoryHealBonus ?? 0) < 0) {
        expect(r.mods.victoryHealBonus!, `${r.id} cuts the win heal past the cap`).toBeGreaterThanOrEqual(MIN_HEAL_BONUS);
      }
      if ((r.mods.restHealBonus ?? 0) < 0) {
        expect(r.mods.restHealBonus!, `${r.id} cuts Rest past the cap`).toBeGreaterThanOrEqual(MIN_HEAL_BONUS);
      }
    }
  });

  it('every situational common is reachable early and pays off when it lands', () => {
    // "Too niche, too little reward" was the concrete complaint: Monk's Bowl required a
    // deck that had NEVER taken a card reward (practically dead after node one), and
    // Field Tourniquet paid a modest one-fight discount for a condition already spoken
    // for by Ashen Token. Both were cut. What remains must clear two bars: the condition
    // is realistically satisfiable well before the run ends, and the payoff is at least
    // as strong as the unconditional common beside it on the shelf.
    for (const r of RELICS.filter((x) => x.rarity === 'common' && x.when)) {
      if (r.when!.deckAtMost !== undefined) {
        expect(r.when!.deckAtMost, `${r.id}'s deck-size window is too narrow to ever hold`).toBeGreaterThanOrEqual(ECON.MIN_DECK_SIZE + 8);
      }
      if (r.when!.relicsAtLeast !== undefined) {
        expect(r.when!.relicsAtLeast, `${r.id} demands more relics than a run typically holds`).toBeLessThanOrEqual(5);
      }
    }
  });

  it('a conditional relic beats the unconditional peer sitting in its own band', () => {
    // A full pass over the table found three relics that copied an unconditional peer's
    // EXACT numbers behind a real condition — Lean Satchel matched Veteran's Draw,
    // Hoarder's Crest matched Siege Ram, and Gravedigger's Charm matched Second Wind.
    // Reading the condition never paid for itself, so nobody who noticed would ever
    // bother meeting it. Pinned here as concrete pairs rather than a generic dominance
    // checker: the fields being compared mean opposite things across the table (a lower
    // `enemyHpMult` is BETTER, a higher `startingHandDelta` is BETTER), so a general
    // "bigger number wins" comparator would silently get half the fields backwards.
    const satchel = relicById('lean-satchel')!;
    const draw = relicById('veterans-draw')!;
    expect(satchel.mods.startingHandDelta!, 'Lean Satchel no longer beats Veteran’s Draw').toBeGreaterThan(draw.mods.startingHandDelta!);

    const crest = relicById('hoarders-crest')!;
    const ram = relicById('siege-ram')!;
    expect(crest.mods.enemyHpMult!, 'Hoarder’s Crest no longer beats Siege Ram').toBeLessThan(ram.mods.enemyHpMult!);

    const gravedigger = relicById('gravediggers-charm')!;
    const wind = relicById('second-wind')!;
    expect(gravedigger.mods.handCapDelta!, 'Gravedigger’s Charm no longer beats Second Wind').toBeGreaterThan(wind.mods.handCapDelta!);
    // Its draw rate matches Second Wind rather than exceeding it on purpose: doubling the
    // draw rate would have matched The Drowned Library's cursed benefit for free once a
    // run's deck crossed 26 cards, which is common enough by mid-run to make paying for
    // that curse pointless. The extra coin trickle is where its condition pays off instead.
    expect(gravedigger.mods.turnDraw, 'Gravedigger’s Charm now outdraws the cursed Drowned Library for free').toBe(wind.mods.turnDraw);
  });

  it('an equal-price curse never gives strictly less than a milder one beside it', () => {
    // Conscript's Banner and Ashen Pact grant the identical +1 energy/turn, but Ashen
    // Pact's price (a smaller Rest heal) is far milder than losing a quarter of your
    // turns to the commander — so the harsher price has to buy more, or nobody sane
    // would ever pick it.
    const conscript = relicById('conscripts-banner')!;
    const ashen = relicById('ashen-pact')!;
    expect(conscript.mods.energyPerTurn).toBe(ashen.mods.energyPerTurn);
    expect(conscript.mods.startingHandDelta!, 'Conscript’s Banner no longer outpays Ashen Pact for its harsher price').toBeGreaterThan(ashen.mods.startingHandDelta!);
  });
});

describe('boss relics scale off the run, and the run can move them', () => {
  const withRun = (over: Partial<RunState>): RunState => ({ ...startRun('orsyric', 42, base), ...over });

  it('pays the Reliquary Chain more for every relic in the tray', () => {
    const one = withRun({ relics: ['reliquary-chain'] });
    const many = withRun({ relics: ['reliquary-chain', 'ember-cache', 'iron-ration', 'wide-market'] });
    expect(runMods(one, base).coinsPerWin).toBe(15 + 15 * 1);
    expect(runMods(many, base).coinsPerWin).toBe(15 + 15 * 4);
  });

  it('gives the ground back when the Hoard-Ledger purse is spent', () => {
    const rich = withRun({ relics: ['hoard-ledger'], coins: 500 });
    const broke = withRun({ relics: ['hoard-ledger'], coins: 40 });
    // 5 steps of 0.96 while the purse is full; nothing at all once it is not.
    expect(runMods(rich, base).enemyHpMult).toBeCloseTo(Math.pow(0.96, 5));
    expect(runMods(broke, base).enemyHpMult).toBe(1);
  });

  it('caps every scale, so no amount of hoarding deletes the difficulty curve', () => {
    const hoarder = withRun({ relics: ['hoard-ledger'], coins: 99999 });
    expect(runMods(hoarder, base).enemyHpMult).toBeCloseTo(Math.pow(0.96, 8));
  });

  it('counts DOWNWARD for a relic that rewards thinning', () => {
    const run = startRun('orsyric', 42, base);
    const pad = (n: number): RunState => {
      const deck = [...run.deck];
      while (deck.length < n) deck.push({ ...run.deck[deck.length % run.deck.length]!, uid: `pad${deck.length}` });
      return { ...run, relics: ['ascetics-tally'], deck: deck.slice(0, n) };
    };
    expect(runMods(pad(24), base).startEnergyBonus).toBe(0); // at the threshold, nothing
    expect(runMods(pad(16), base).startEnergyBonus).toBe(4); // 8 under / 2 = 4, at the cap
    expect(runMods(pad(20), base).startEnergyBonus).toBe(2);
  });

  it('reads a wound as a comeback, and temporary HP as no wound at all', () => {
    const hurt = withRun({ relics: ['last-stand-standard'], hp: 10, maxHp: 30 });
    expect(runMods(hurt, base).startEnergyBonus).toBe(4);
    // hp ABOVE max (Rest's temporary HP) must not read as a negative wound.
    const over = withRun({ relics: ['last-stand-standard'], hp: 40, maxHp: 30 });
    expect(runMods(over, base).startEnergyBonus).toBe(0);
  });

  it('contributes nothing at all without a context to measure', () => {
    // Same conservative direction conditionals take: a call site that could not measure
    // the run must not be handed free power.
    expect(aggregateMods(['hoard-ledger']).enemyHpMult).toBe(1);
  });
});

describe('autopilot: the price paid in agency', () => {
  it('seats the commander on the fight itself, and fires on the stated rounds', () => {
    const state = fresh();
    applyRelicsToState(base, state, aggregateMods(['generals-seal']), 5);
    expect(state.autopilot).toEqual({ player: 0, everyRounds: 3 });
    // Rounds 3, 6, 9 belong to the commander; nothing else does, and the enemy seat is
    // never affected (it is already the AI's).
    for (const round of [1, 2, 3, 4, 5, 6]) {
      expect(autopilotActive({ ...state, round, active: 0 }), `round ${round}`).toBe(round % 3 === 0);
      expect(autopilotActive({ ...state, round, active: 1 })).toBe(false);
    }
  });

  it('takes the HARSHEST interval when two are carried, never the sum', () => {
    // Two relics that each seize every few rounds must not compound into a seizure every
    // round and a half.
    const both = aggregateMods(['generals-seal', 'conscripts-banner']);
    expect(both.autopilotEveryRounds).toBe(3);
  });

  it('a Trial can hand the turn over too, on the same one engine field', () => {
    const state = fresh();
    applyTrialToState(base, state, trialById('field-commander')!);
    expect(state.autopilot).toEqual({ player: 0, everyRounds: 3 });
  });

  it('is inert when nothing seated it', () => {
    expect(autopilotActive(fresh())).toBe(false);
  });
});

describe('energyPerTurn reaches the engine', () => {
  it('adds to every turn, and to the opening turn that already happened', () => {
    const state = fresh();
    const openingBefore = state.players[0].energy;
    applyRelicsToState(base, state, aggregateMods(['dawn-engine']), 5);
    // `initGame` already ran round 1's beginTurn, so the opener needs a manual top-up or
    // the relic would not pay out until turn two.
    expect(state.players[0].energy).toBe(openingBefore + 1);
    expect(state.players[0].energyPerTurn).toBe(1);
    // And it keeps paying on later turns, through the normal energy formula.
    const later = beginTurn(state, 0).state;
    expect(later.players[0].energy).toBe(later.round + 1);
  });

  it('is additive with a boss energyOverride rather than erased by it', () => {
    const state = fresh();
    applyRelicsToState(base, state, aggregateMods(['dawn-engine']), 5);
    state.energyOverride = 4;
    expect(beginTurn(state, 0).state.players[0].energy).toBe(5);
  });
});

describe('conditional relics are judged against the run, every time', () => {
  // A starter deck is 15 cards, so a "fat" fixture has to be PADDED, not sliced —
  // slicing to 20 silently gives you 15 and both sides of the threshold test pass.
  const withDeck = (n: number, relics: string[], over: Partial<RunState> = {}): RunState => {
    const run = startRun('orsyric', 42, base);
    const deck = [...run.deck];
    while (deck.length < n) deck.push({ ...run.deck[deck.length % run.deck.length]!, uid: `pad${deck.length}` });
    return { ...run, relics, deck: deck.slice(0, n), ...over };
  };

  it('switches a build-around on and off as the deck crosses its threshold', () => {
    const lean = withDeck(12, ['lean-ledger']);
    const fat = withDeck(20, ['lean-ledger']);
    expect(runMods(lean, base).startEnergyBonus).toBe(2);
    expect(runMods(fat, base).startEnergyBonus).toBe(0);
  });

  it('reads HP for a wounded condition', () => {
    const run = startRun('orsyric', 42, base);
    const hurt = { ...run, relics: ['ashen-token'], hp: Math.floor(run.maxHp / 2) };
    const hale = { ...run, relics: ['ashen-token'] };
    expect(runMods(hurt, base).startingHandDelta).toBe(2);
    expect(runMods(hale, base).startingHandDelta).toBe(0);
  });

  it('counts relics for a hoarding condition, spent ones included', () => {
    const few = withDeck(20, ['hoarders-crest', 'ember-cache']);
    const many = withDeck(20, ['hoarders-crest', 'ember-cache', 'iron-ration', 'wide-market', 'coin-pouch', 'whetstone']);
    expect(runMods(few, base).enemyHpMult).toBeCloseTo(0.9); // crest inactive
    expect(runMods(many, base).enemyHpMult).toBeCloseTo(0.9 * 0.8);
  });

  it('needs a registry to answer monoElement, and reads unknown as NOT satisfied', () => {
    const run = { ...startRun('orsyric', 42, base), relics: ['monochrome-banner'] };
    // Without a registry the deck's elements cannot be resolved, so the safe answer is no.
    expect(runContext(run).monoElement).toBeUndefined();
    expect(runMods(run).elementBuffs).toEqual([]);
    // A genuinely mono deck switches it on.
    const mono = { ...run, deck: run.deck.filter((c) => base.cards.get(c.cardId)?.element === 'water').slice(0, 6) };
    if (mono.deck.length > 0) expect(runMods(mono, base).elementBuffs.length).toBeGreaterThan(0);
  });

  it('a spent one-shot contributes nothing but keeps its tray slot', () => {
    const run = { ...startRun('orsyric', 42, base), relics: ['vow-of-ash'], spentRelics: ['vow-of-ash'] };
    expect(runMods(run, base).enemyHpMult).toBe(1);
    expect(run.relics).toContain('vow-of-ash');
  });
});

describe('consumables', () => {
  const atCombat = (over: Partial<RunState> = {}): RunState => {
    const run = startRun('orsyric', 42, base);
    const id = 'inj-fight';
    return {
      ...run, ...over,
      map: { ...run.map, nodes: { ...run.map.nodes, [id]: { id, kind: 'combat', layer: 1, col: 0, next: [], seed: 7, visited: false } } },
      currentNodeId: id,
      phase: { t: 'combat', nodeId: id, fightSeed: 1 },
    };
  };

  it('Phoenix Ember converts the first loss into a survival at 1 HP, once', () => {
    const first = resolveCombat(atCombat({ relics: ['phoenix-ember'], hp: 12 }), base, false);
    expect(first.phase.t).toBe('map'); // not dead
    expect(first.hp).toBe(1);
    expect(first.spentRelics).toContain('phoenix-ember');

    // The second loss is a real one — the ember is out.
    const second = resolveCombat(atCombat({ relics: ['phoenix-ember'], spentRelics: ['phoenix-ember'], hp: 12 }), base, false);
    expect(second.phase.t).toBe('dead');
  });

  it('a Divine relic is spent by the battle it was carried into, win or lose', () => {
    const won = resolveCombat(atCombat({ relics: ['vow-of-ash'], hp: 20 }), base, true, 20);
    expect(won.spentRelics).toContain('vow-of-ash');
    // Losing must spend it too, or holding one would be strictly free.
    const lost = resolveCombat(atCombat({ relics: ['vow-of-ash', 'phoenix-ember'], hp: 20 }), base, false);
    expect(lost.spentRelics).toContain('vow-of-ash');
  });
});

describe('Cracked Diadem: the reward can be narrowed, never to nothing', () => {
  it('Cracked Diadem narrows the card reward but never to nothing', () => {
    const run = startRun('orsyric', 42, base);
    const id = 'inj-fight';
    const at = (relics: string[]): RunState => ({
      ...run, relics,
      map: { ...run.map, nodes: { ...run.map.nodes, [id]: { id, kind: 'combat', layer: 1, col: 0, next: [], seed: 7, visited: false } } },
      currentNodeId: id,
      phase: { t: 'combat', nodeId: id, fightSeed: 1 },
    });
    const count = (r: RunState): number => (r.phase.t === 'reward' ? r.phase.cardChoices?.length ?? 0 : 0);
    const plain = resolveCombat(at([]), base, true, 20);
    const narrowed = resolveCombat(at(['cracked-diadem']), base, true, 20);
    expect(count(narrowed)).toBe(count(plain) - 2);
    expect(count(narrowed)).toBeGreaterThanOrEqual(1);
  });
});

describe('one-shot run transformations', () => {
  const reward = (relicId: string, over: Partial<RunState> = {}): RunState => {
    const run = startRun('orsyric', 42, base);
    return { ...run, ...over, phase: { t: 'reward', nodeId: 'x', coins: 0, relicChoices: [relicId] } };
  };

  it('Empty Reliquary owes a CHOSEN trim rather than resolving one at random', () => {
    // The bug report this fixes: random removal made the relic strictly worse than
    // walking to a shop and selling exactly the cards you didn't want, for coins on top.
    const before = reward('empty-reliquary');
    const claimed = pickRelic(before, 'empty-reliquary', base);
    expect(claimed.relics).toContain('empty-reliquary');
    expect(claimed.deck.length, 'nothing is removed until the player chooses').toBe(before.deck.length);
    expect(claimed.pendingTrim).toEqual({ count: 4, coinsPerCard: 50, buffPerCard: { attack: 1, hp: 1 } });

    const [a, b, c, d] = claimed.deck.map((card) => card.uid);
    const resolved = resolveTrim(claimed, [a!, b!, c!, d!], base);
    expect(resolved.pendingTrim, 'the debt is cleared once resolved').toBeUndefined();
    expect(resolved.deck.length, 'net: 4 burned, 0 added').toBe(before.deck.length - 4);
    expect(resolved.deck.some((card) => card.uid === a)).toBe(false);

    const tiny = reward('empty-reliquary', { deck: startRun('orsyric', 1, base).deck.slice(0, ECON.MIN_DECK_SIZE + 1) });
    const tinyClaimed = pickRelic(tiny, 'empty-reliquary', base);
    // Floored: with only one card above the minimum, the debt owed is 1, not 4 — and the
    // bonus scales down with it, never overpaying for a trim the run couldn't afford.
    expect(tinyClaimed.pendingTrim).toEqual({ count: 1, coinsPerCard: 50, buffPerCard: { attack: 1, hp: 1 } });
  });

  it('gives what a shop sale cannot: coins AND power on the deck that survives', () => {
    // This is the actual fix for "selling already does this, for free, with a choice" —
    // selectability alone was not enough; the relic has to out-give the shop it now
    // resembles. 4 cards x 50 coins = 200 (on par with The Endowment's flat grant),
    // and the buffs land on cards the player is KEEPING.
    const before = reward('empty-reliquary', { coins: 100 });
    const claimed = pickRelic(before, 'empty-reliquary', base);
    const chosen = claimed.deck.slice(0, 4).map((c) => c.uid);
    const resolved = resolveTrim(claimed, chosen, base);
    expect(resolved.coins).toBe(100 + 4 * 50);
    const buffed = resolved.deck.filter((c) => c.enhancements.length > 0);
    expect(buffed).toHaveLength(4);
    for (const c of buffed) {
      expect(c.enhancements).toEqual([{ kind: 'stat', attack: 1, hp: 1 }]);
      expect(chosen, `${c.cardId} was buffed after being burned`).not.toContain(c.uid);
      const def = base.cards.get(c.cardId)!;
      expect(def.type === 'unit' || def.type === 'foundation', c.cardId).toBe(true);
    }
  });

  it('resolveTrim refuses a selection that does not match what is owed', () => {
    const claimed = pickRelic(reward('empty-reliquary'), 'empty-reliquary', base);
    const uids = claimed.deck.map((card) => card.uid);
    expect(resolveTrim(claimed, uids.slice(0, 2), base), 'too few').toBe(claimed);
    expect(resolveTrim(claimed, [uids[0]!, uids[0]!, uids[1]!, uids[2]!], base), 'duplicates').toBe(claimed);
    expect(resolveTrim(claimed, ['not-a-real-uid', uids[1]!, uids[2]!, uids[3]!], base), 'unowned card').toBe(claimed);
    expect(resolveTrim({ ...claimed, pendingTrim: undefined }, uids.slice(0, 4), base), 'nothing owed').toEqual({ ...claimed, pendingTrim: undefined });
  });

  it('blocks leaving the gain screen and the reward screen while a trim is owed', () => {
    const claimed = pickRelic(reward('empty-reliquary'), 'empty-reliquary', base);
    const asGain: RunState = { ...claimed, phase: { t: 'gain', relicChoices: undefined } };
    expect(leaveGain(asGain)).toBe(asGain);
    const resolved = resolveTrim(claimed, claimed.deck.slice(0, 4).map((c) => c.uid), base);
    expect(leaveGain({ ...resolved, phase: { t: 'gain' } }).phase.t).toBe('map');
  });

  it('Masterwork Crucible tempers real cards, and only ones that have stats', () => {
    const after = pickRelic(reward('masterwork-crucible'), 'masterwork-crucible', base);
    const tempered = after.deck.filter((c) => c.enhancements.length > 0);
    expect(tempered.length).toBe(3);
    for (const c of tempered) {
      const def = base.cards.get(c.cardId);
      expect(def?.type === 'unit' || def?.type === 'foundation', `${c.cardId} has no stats to temper`).toBe(true);
      expect(c.enhancements[0]).toEqual({ kind: 'stat', attack: 2, hp: 2 });
    }
  });

  it('a max-HP price can never found an already-dead run', () => {
    const brittle = pickRelic(reward('brittle-crown', { hp: 4, maxHp: 8 }), 'brittle-crown', base);
    expect(brittle.maxHp).toBeGreaterThanOrEqual(2);
    expect(brittle.hp).toBeGreaterThanOrEqual(1);
  });
});

describe('the store sells relics, and the cursed shelf is the only way to a curse', () => {
  const atStore = (over: Partial<RunState> = {}): RunState => {
    const run = startRun('orsyric', 42, base);
    const id = 'inj-store';
    return {
      ...run, ...over,
      map: { ...run.map, nodes: { ...run.map.nodes, [id]: { id, kind: 'store', layer: 2, col: 0, next: [], seed: 55, visited: false } } },
      currentNodeId: id,
      phase: { t: 'store', nodeId: id },
    };
  };
  const nodeOf = (r: RunState) => r.map.nodes['inj-store']!;

  it('hands the relic over, charges for it, and marks the slot taken', () => {
    const run = atStore({ coins: 999, act: 3 });
    const shelf = storeRelicStock(run, nodeOf(run));
    expect(shelf.length).toBe(ECON.STORE_RELIC_SLOTS + 1); // the cursed one is always there
    const wanted = relicById(shelf[0]!)!;
    const after = buyRelic(run, base, 0);
    expect(after.relics).toContain(wanted.id);
    expect(after.coins).toBe(999 - relicPrice(wanted.rarity));
    expect(after.map.nodes['inj-store']!.boughtRelics).toEqual([0]);
    // And the same slot cannot be bought twice.
    expect(buyRelic(after, base, 0)).toBe(after);
  });

  it('refuses when the purse is short, rather than going into debt', () => {
    const run = atStore({ coins: 0 });
    expect(buyRelic(run, base, 0)).toBe(run);
  });

  it('restocking clears the sold-out markers on both shelves at once', () => {
    // The card stock and the relic shelf share the node's reroll counter, so a restock
    // that cleared only one would leave stale markers pointing at new stock.
    const run = atStore({ coins: 9999 });
    const bought = buyRelic(run, base, 0);
    const restocked = storeReroll(bought);
    expect(restocked.map.nodes['inj-store']!.boughtRelics).toEqual([]);
    expect(storeRelicStock(restocked, nodeOf(restocked))).not.toEqual(storeRelicStock(run, nodeOf(run)));
  });

  it('never offers a relic the run already owns, on either shelf', () => {
    const owned = storeRelicStock(atStore(), nodeOf(atStore()));
    const run = atStore({ relics: owned });
    for (const id of storeRelicStock(run, nodeOf(run))) expect(owned).not.toContain(id);
  });

  it('resolves a bought relic’s one-shot exactly as a reward screen would', () => {
    // Buying goes through `grantRelic`, so a max-HP price or a deck trim lands the same
    // way whether the relic was won or paid for.
    const run = atStore({ coins: 9999 });
    const before = run.maxHp;
    const after = buyRelic({ ...run, relics: [] }, base, 0);
    const bought = after.relics[0] ? relicById(after.relics[0]) : undefined;
    if (bought?.mods.maxHpDelta) expect(after.maxHp).toBe(before + bought.mods.maxHpDelta);
    else expect(after.maxHp).toBe(before);
  });
});

describe('broken relics: a debt you work off, not a tax you carry', () => {
  const atCombat = (over: Partial<RunState> = {}): RunState => {
    const run = startRun('orsyric', 42, base);
    const id = 'inj-fight';
    return {
      ...run, ...over,
      map: { ...run.map, nodes: { ...run.map.nodes, [id]: { id, kind: 'combat', layer: 1, col: 0, next: [], seed: 7, visited: false } } },
      currentNodeId: id,
      phase: { t: 'combat', nodeId: id, fightSeed: 1 },
    };
  };
  const reward = (relicId: string, over: Partial<RunState> = {}): RunState => {
    const run = startRun('orsyric', 42, base);
    return { ...run, ...over, phase: { t: 'reward', nodeId: 'x', coins: 0, relicChoices: [relicId] } };
  };

  it('every broken relic declares a repair cost, and repairs into a genuine benefit', () => {
    const brokenOnes = RELICS.filter((r) => r.broken);
    expect(brokenOnes.length, 'the Error Code family should be a real shelf').toBeGreaterThanOrEqual(4);
    for (const r of brokenOnes) {
      expect(r.repairWins, `${r.id} is broken with no way to fix it`).toBeGreaterThan(0);
      expect(r.repairWins!, `${r.id} takes longer to repair than most runs last`).toBeLessThanOrEqual(6);
      // The repaired form must be pure upside — the price already happened.
      expect(priceFields(r.mods), `${r.id} is still bad after being repaired`).toEqual([]);
      expect(Object.keys(r.mods).length, `${r.id} repairs into nothing`).toBeGreaterThan(0);
      // Broken is a CURSED-band shape: it is a price, and prices live in one band.
      expect(r.rarity, `${r.id} hides a drawback outside the cursed band`).toBe('cursed');
    }
  });

  it('a broken relic charges its drawback INSTEAD of its payload, never as well', () => {
    // Folding both would make the relic a wash rather than a loan. The two halves must
    // never coexist: you pay first, then you are paid.
    const claimed = pickRelic(reward('corrupted-code'), 'corrupted-code', base);
    expect(claimed.relicRepair['corrupted-code']).toBe(3);
    expect(runMods(claimed, base).costReduction.unit, 'broken Corrupted Code should COST you').toBe(1);

    const fixed = { ...claimed, relicRepair: {} };
    expect(runMods(fixed, base).costReduction.unit, 'repaired Corrupted Code should pay you').toBe(-1);
  });

  it('works the debt off one win at a time, and only on wins', () => {
    const owed = (r: RunState): number => r.relicRepair['odd-code'] ?? 0;
    let run = pickRelic(reward('odd-code'), 'odd-code', base);
    expect(owed(run)).toBe(3);

    // Three wins clear it, and the entry is deleted rather than left sitting at zero.
    for (const expected of [2, 1, 0]) {
      run = resolveCombat(atCombat({ ...run, phase: run.phase }), base, true, 20);
      expect(owed(run)).toBe(expected);
    }
    expect('odd-code' in run.relicRepair, 'a repaired relic should leave no trace').toBe(false);
    expect(runMods(run, base).victoryHealBonus).toBe(8);
  });

  it('a LOSS never deepens the debt — a curse that punishes struggling cannot be overcome', () => {
    const claimed = pickRelic(reward('odd-code', { hp: 20 }), 'odd-code', base);
    // Phoenix Ember keeps the run alive so the loss path is reachable and observable.
    const lost = resolveCombat(atCombat({ ...claimed, relics: [...claimed.relics, 'phoenix-ember'], hp: 20 }), base, false);
    expect(lost.relicRepair['odd-code'], 'losing must not add to the repair debt').toBe(3);
  });

  it('reads as broken to every consumer, through one shared helper', () => {
    const claimed = pickRelic(reward('mysterious-code'), 'mysterious-code', base);
    expect(brokenRelics(claimed)).toContain('mysterious-code');
    expect(repairsLeft(claimed, 'mysterious-code')).toBe(3);
    // Enemies are TOUGHER while it is broken, and weaker once it is not.
    expect(runMods(claimed, base).enemyHpMult).toBeCloseTo(1.15);
    expect(runMods({ ...claimed, relicRepair: {} }, base).enemyHpMult).toBeCloseTo(0.8);
    expect(repairsLeft({ ...claimed, relicRepair: {} }, 'mysterious-code')).toBe(0);
  });

  it('holds a broken relic to the same price caps as any other curse', () => {
    // The caps exist so a degree-priced curse cannot drift into a de-facto deletion.
    // A temporary price is still a price and gets no exemption from them.
    for (const r of RELICS.filter((x) => x.broken)) {
      const b = r.broken!;
      if ((b.enemyHpMult ?? 1) > 1) expect(b.enemyHpMult!, `${r.id}`).toBeLessThanOrEqual(MAX_ENEMY_HP_PRICE);
      if ((b.victoryHealBonus ?? 0) < 0) expect(b.victoryHealBonus!, `${r.id}`).toBeGreaterThanOrEqual(MIN_HEAL_BONUS);
      if ((b.restHealBonus ?? 0) < 0) expect(b.restHealBonus!, `${r.id}`).toBeGreaterThanOrEqual(MIN_HEAL_BONUS);
      if ((b.handCapDelta ?? 0) < 0) expect(b.handCapDelta!, `${r.id}`).toBeGreaterThanOrEqual(MIN_HAND_CAP_DELTA);
      if ((b.maxHpDelta ?? 0) < 0) expect(b.maxHpDelta!, `${r.id}`).toBeGreaterThanOrEqual(MAX_HP_LOSS);
    }
  });
});

describe('Equations: a two-element deck is a plan', () => {
  const withElements = (fire: number, water: number): RunState => {
    const run = startRun('orsyric', 42, base);
    const pick = (el: string): string | undefined =>
      [...base.cards.values()].find((c) => c.element === el && (c.type === 'unit' || c.type === 'spell'))?.id;
    const deck = [
      ...Array.from({ length: fire }, (_, i) => ({ uid: `f${i}`, cardId: pick('fire')!, enhancements: [] })),
      ...Array.from({ length: water }, (_, i) => ({ uid: `w${i}`, cardId: pick('water')!, enhancements: [] })),
    ];
    return { ...run, relics: ['steamforge-equation'], deck };
  };

  it('switches on only once BOTH halves of the equation are held', () => {
    expect(runMods(withElements(5, 4), base).costReduction.spell, 'one half short').toBe(0);
    expect(runMods(withElements(4, 5), base).costReduction.spell, 'other half short').toBe(0);
    expect(runMods(withElements(5, 5), base).costReduction.spell, 'both halves met').toBe(-1);
    expect(runMods(withElements(9, 9), base).elementBuffs.length).toBeGreaterThan(0);
  });

  it('reads an unresolvable deck as NOT satisfied rather than as free power', () => {
    // Same conservative direction `monoElement` takes: without a registry the deck's
    // elements cannot be counted, so the honest answer is no.
    expect(runMods(withElements(9, 9)).costReduction.spell).toBe(0);
  });

  it('names two different elements in every equation, or it is just a mono deck', () => {
    for (const r of RELICS.filter((x) => x.when?.elementAtLeast)) {
      const els = r.when!.elementAtLeast!.map((e) => e.element);
      expect(new Set(els).size, `${r.id} asks for the same element twice`).toBe(els.length);
      expect(els.length, `${r.id} is not an equation`).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('proportional coins', () => {
  it('grows the purse it finds rather than adding a flat number', () => {
    const at = (coins: number): RunState => ({
      ...startRun('orsyric', 42, base), coins,
      phase: { t: 'reward', nodeId: 'x', coins: 0, relicChoices: ['silver-discord'] },
    });
    expect(pickRelic(at(400), 'silver-discord', base).coins).toBe(600);
    // Worth nothing to a run with nothing — which is the decision it exists to create.
    expect(pickRelic(at(0), 'silver-discord', base).coins).toBe(0);
  });
});

describe('borrowed time: the early acts are cheap and the late ones are the bill', () => {
  const atAct = (act: number): RunState => ({ ...startRun('orsyric', 42, base), act, relics: ['borrowed-dawn'] });
  const mult = (act: number): number => runMods(atAct(act), base).enemyHpMult;

  it('makes acts 1 and 2 nearly free', () => {
    // The point of the boon: an opening the player can actually get through while they
    // learn the deck. Act 1 at ~12% and act 2 at ~19% of normal enemy HP.
    expect(mult(1)).toBeLessThan(0.15);
    expect(mult(2)).toBeLessThan(0.25);
  });

  it('climbs every act, crosses back through full strength, and then costs real money', () => {
    // Monotonic, so the reckoning is visible several acts out and can be routed against.
    // Only up to the step cap: past it the curve is deliberately flat (see below), so
    // asserting monotonicity beyond act 7 would be asserting the cap does not exist.
    for (let act = 1; act < 7; act++) {
      expect(mult(act + 1), `act ${act + 1} should be harsher than act ${act}`).toBeGreaterThan(mult(act));
    }
    // Somewhere in the mid-run it stops being a discount and becomes a debt.
    const crossing = [1, 2, 3, 4, 5, 6, 7, 8].find((a) => mult(a) > 1);
    expect(crossing, 'the debt must actually come due').toBeDefined();
    expect(crossing!).toBeGreaterThanOrEqual(5);
  });

  it('caps the debt rather than compounding it forever', () => {
    // `maxSteps` is what stops an act-scaled multiplier from ending the run outright:
    // an uncapped 1.55 per act would reach 13x by act 8.
    const capped = mult(20);
    expect(capped).toBeLessThanOrEqual(2);
    expect(mult(12)).toBe(capped);
  });
});

describe('The Lesser Road: the difficulty dial itself', () => {
  const withRoad = (act: number): RunState => ({ ...startRun('orsyric', 42, base), act, relics: ['lesser-road'] });

  it('scales the fight as though the run were earlier, and floors at act 1', () => {
    expect(effectiveAct(5, runMods(withRoad(5), base))).toBe(3);
    expect(effectiveAct(2, runMods(withRoad(2), base))).toBe(1);
    // Never below 1: act 0 would run `actScale` under its own baseline and produce
    // enemies weaker than the ones act 1 is balanced around.
    expect(effectiveAct(1, runMods(withRoad(1), base))).toBe(1);
  });

  it('actually softens the encounter it is measured against', () => {
    const node: MapNode = { id: 'n', kind: 'combat', layer: 3, col: 0, next: [], seed: 21, visited: false };
    const hard = rollEncounter(base, node, 5).enemyHp;
    const soft = rollEncounter(base, node, 5, 1, node.seed, 3).enemyHp;
    expect(soft, 'a two-act discount should be a real one').toBeLessThan(hard);
    expect(soft).toBe(rollEncounter(base, node, 3).enemyHp);
  });

  it('keeps the BOSS the act you are actually in put there', () => {
    // Which boss guards act 5 is that act's identity. Softening the numbers must not
    // quietly swap the fight for an earlier act's boss.
    const bossNode: MapNode = { id: 'b', kind: 'boss', layer: 8, col: 0, next: [], seed: 33, visited: false };
    const real = rollEncounter(base, bossNode, 5, 1, 777);
    const softened = rollEncounter(base, bossNode, 5, 1, 777, 3);
    expect(softened.boss?.id).toBe(real.boss?.id);
    expect(softened.enemyHp).toBeLessThan(real.enemyHp);
  });

  it('pays the discount for out of the purse, so it can never be taken for free', () => {
    const mods = runMods(withRoad(5), base);
    expect(combatReward('combat', 3, effectiveAct(5, mods)))
      .toBeLessThan(combatReward('combat', 3, 5));
  });
});

describe('unbinding: a relic that stops fitting the run is a decision, not a sentence', () => {
  const atStore = (over: Partial<RunState> = {}): RunState => {
    const run = startRun('orsyric', 42, base);
    const id = 'inj-store';
    return {
      ...run, ...over,
      map: { ...run.map, nodes: { ...run.map.nodes, [id]: { id, kind: 'store', layer: 2, col: 0, next: [], seed: 55, visited: false } } },
      currentNodeId: id,
      phase: { t: 'store', nodeId: id },
    };
  };

  it('removes the relic and charges for it', () => {
    // The case this exists for: a draw engine in a deliberately thin deck mills its
    // owner out faster every turn, and no amount of good play undoes that.
    const run = atStore({ coins: 999, relics: ['second-wind', 'ember-cache'] });
    expect(runMods(run, base).turnDraw).toBe(1);
    const after = unbindRelic(run, 'second-wind');
    expect(after.relics).toEqual(['ember-cache']);
    expect(runMods(after, base).turnDraw, 'the anti-synergy should actually stop').toBe(0);
    expect(after.coins).toBe(999 - relicUnbindCost('rare'));
  });

  it('charges the most for a curse, so a bargain stays a bargain', () => {
    // If shedding a curse were cheap, every curse would collapse into "take the benefit,
    // pay a small fee, keep the benefit" — which is not a trade at all.
    expect(relicUnbindCost('cursed')).toBeGreaterThan(relicUnbindCost('rare'));
    expect(relicUnbindCost('cursed')).toBeGreaterThan(relicUnbindCost('common'));
    expect(relicUnbindCost('boss')).toBeGreaterThan(relicUnbindCost('rare'));
  });

  it('refuses when the purse is short, and when the relic is not owned', () => {
    const broke = atStore({ coins: 0, relics: ['second-wind'] });
    expect(unbindRelic(broke, 'second-wind')).toBe(broke);
    const rich = atStore({ coins: 999, relics: ['ember-cache'] });
    expect(unbindRelic(rich, 'second-wind')).toBe(rich);
  });

  it('never refunds a one-shot that already resolved', () => {
    // `maxHpDelta` and friends are part of the run's history the moment they are claimed.
    // Refunding them would make "claim it, unbind it" a free tap on every one of them.
    const claimed = pickRelic(
      { ...startRun('orsyric', 42, base), phase: { t: 'reward', nodeId: 'x', coins: 0, relicChoices: ['oaken-heart'] } },
      'oaken-heart', base,
    );
    const raised = claimed.maxHp;
    const after = unbindRelic(atStore({ ...claimed, coins: 999 }), 'oaken-heart');
    expect(after.relics).not.toContain('oaken-heart');
    expect(after.maxHp, 'the max HP it gave stays given').toBe(raised);
  });

  it('unbinding Empty Reliquary after the fact never claws back its trim payout', () => {
    const claimed = pickRelic(
      { ...startRun('orsyric', 42, base), coins: 0, phase: { t: 'reward', nodeId: 'x', coins: 0, relicChoices: ['empty-reliquary'] } },
      'empty-reliquary', base,
    );
    const resolved = resolveTrim(claimed, claimed.deck.slice(0, 4).map((c) => c.uid), base);
    const deckAfterTrim = resolved.deck.length;
    const coinsAfterTrim = resolved.coins;
    const after = unbindRelic(atStore({ ...resolved, coins: resolved.coins + 999 }), 'empty-reliquary');
    expect(after.relics).not.toContain('empty-reliquary');
    expect(after.deck.length, 'the burned cards stay burned').toBe(deckAfterTrim);
    expect(after.coins, 'the coins it paid stay paid').toBe(coinsAfterTrim + 999 - relicUnbindCost('boss'));
  });

  it('takes a broken relic\u2019s repair debt with it', () => {
    const run = atStore({ coins: 999, relics: ['corrupted-code'], relicRepair: { 'corrupted-code': 3 } });
    const after = unbindRelic(run, 'corrupted-code');
    expect(after.relicRepair['corrupted-code'], 'no debt from a life it no longer owns').toBeUndefined();
    expect(runMods(after, base).costReduction.unit).toBe(0);
  });

  it('lets a spent one-shot go, and forgets that it was spent', () => {
    const run = atStore({ coins: 999, relics: ['phoenix-ember'], spentRelics: ['phoenix-ember'] });
    const after = unbindRelic(run, 'phoenix-ember');
    expect(after.relics).toEqual([]);
    expect(after.spentRelics).toEqual([]);
  });

  it('is a store service and nowhere else', () => {
    const onMap = { ...startRun('orsyric', 42, base), coins: 999, relics: ['second-wind'] };
    expect(unbindRelic(onMap, 'second-wind')).toBe(onMap);
  });
});

describe('currency that reads the fight, not just the coin count', () => {
  const atCombat = (over: Partial<RunState> = {}): RunState => {
    const run = startRun('orsyric', 42, base);
    const id = 'inj-fight';
    return {
      ...run, ...over,
      map: { ...run.map, nodes: { ...run.map.nodes, [id]: { id, kind: 'combat', layer: 1, col: 0, next: [], seed: 7, visited: false } } },
      currentNodeId: id,
      phase: { t: 'combat', nodeId: id, fightSeed: 1 },
    };
  };

  it('The Attrition Ledger pays for the HP actually spent to win, not the HP restored after', () => {
    const run = atCombat({ relics: ['attrition-ledger'], hp: 30, coins: 0 });
    // Entered at 30, left the fight at 18 (12 HP spent) — the post-battle heal must not
    // shrink what the relic paid for.
    const after = resolveCombat(run, base, true, 18);
    const plain = resolveCombat(atCombat({ hp: 30, coins: 0 }), base, true, 18);
    expect(after.coins - plain.coins).toBe(4 * 12);
  });

  it('pays nothing for a clean, undamaged win', () => {
    const run = atCombat({ relics: ['attrition-ledger'], hp: 30, coins: 0 });
    const after = resolveCombat(run, base, true, 30);
    const plain = resolveCombat(atCombat({ hp: 30, coins: 0 }), base, true, 30);
    expect(after.coins).toBe(plain.coins);
  });

  it("The Underwriter's Bond multiplies the coin reward, and stacks multiplicatively with itself and peers", () => {
    const one = runMods({ ...startRun('orsyric', 42, base), relics: ['underwriters-bond'] }, base);
    expect(one.coinsEarnedMult).toBeCloseTo(1.5);
    // Two relics multiply together rather than adding percentages, matching every other
    // multiplicative field in the table (enemyHpMult, storeBuyMult, ...).
    const stacked = aggregateMods(['underwriters-bond', 'underwriters-bond']);
    expect(stacked.coinsEarnedMult).toBeCloseTo(1.5 * 1.5);
  });

  it("The Underwriter's Bond actually reaches the reward screen's coin total", () => {
    const run = atCombat({ relics: ['underwriters-bond'], hp: 30, coins: 0 });
    const after = resolveCombat(run, base, true, 30);
    const plain = resolveCombat(atCombat({ hp: 30, coins: 0 }), base, true, 30);
    expect(after.phase.t === 'reward' && after.phase.coins).toBe(
      plain.phase.t === 'reward' ? Math.round(plain.phase.coins * 1.5 / 5) * 5 : NaN,
    );
  });

  it("The Underwriter's Payout hands over its lump sum on claim, nothing more", () => {
    const before = { ...startRun('orsyric', 42, base), coins: 100, phase: { t: 'reward' as const, nodeId: 'x', coins: 0, relicChoices: ['underwriters-payout'] } };
    const after = pickRelic(before, 'underwriters-payout', base);
    expect(after.coins).toBe(360);
    expect(runMods(after, base).coinsEarnedMult).toBe(1); // no ongoing effect at all
  });

  it("The Creditor's Due spends the purse in whole steps, keeps the remainder, and buffs only what survives to keep it", () => {
    const before = {
      ...startRun('orsyric', 42, base), coins: 470,
      phase: { t: 'reward' as const, nodeId: 'x', coins: 0, relicChoices: ['the-creditors-due'] },
    };
    const after = pickRelic(before, 'the-creditors-due', base);
    // 470 / 150 = 3 whole steps (450 spent); 20 left over, untouched.
    expect(after.coins).toBe(20);
    const buffed = after.deck.filter((c) => c.enhancements.length > 0);
    expect(buffed.length).toBeGreaterThan(0);
    for (const c of buffed) {
      expect(c.enhancements).toEqual([{ kind: 'stat', attack: 3, hp: 3 }]);
      const def = base.cards.get(c.cardId)!;
      expect(def.type === 'unit' || def.type === 'foundation', c.cardId).toBe(true);
    }
  });

  it("The Creditor's Due does nothing to a run that cannot afford even one step", () => {
    const before = {
      ...startRun('orsyric', 42, base), coins: 90,
      phase: { t: 'reward' as const, nodeId: 'x', coins: 0, relicChoices: ['the-creditors-due'] },
    };
    const after = pickRelic(before, 'the-creditors-due', base);
    expect(after.coins).toBe(90); // untouched — below one step
    expect(after.deck.every((c) => c.enhancements.length === 0)).toBe(true);
  });

  it("The Creditor's Due caps at 6 steps even for a very wealthy claim", () => {
    const before = {
      ...startRun('orsyric', 42, base), coins: 999999,
      phase: { t: 'reward' as const, nodeId: 'x', coins: 0, relicChoices: ['the-creditors-due'] },
    };
    const after = pickRelic(before, 'the-creditors-due', base);
    expect(after.coins).toBe(999999 - 6 * 150);
    const buffed = after.deck.find((c) => c.enhancements.length > 0);
    expect(buffed?.enhancements).toEqual([{ kind: 'stat', attack: 6, hp: 6 }]);
  });

  it('The Overclock Contract scales the fight and the payout together, like The Lesser Road in reverse', () => {
    const mods = runMods({ ...startRun('orsyric', 42, base), act: 3, relics: ['overclock-contract'] }, base);
    expect(effectiveAct(3, mods)).toBe(5);
  });
});
