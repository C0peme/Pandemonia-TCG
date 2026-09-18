/**
 * Named boss encounters — curated, telegraphed act finales.
 *
 * A boss is pure data that recombines systems already built: a themed archetype deck (by
 * leaderId) plus ONE signature — a BOSS RULE (`rule`, see below). `bossForAct` walks a
 * per-run permutation of the table, so an act's finale is deterministic from the run seed
 * and no boss repeats within a cycle.
 *
 * There used to be five channels: a trial `twistId`, `energyOverride`, an asymmetric
 * per-turn `curse`, a `heroPowerOverride`, and `rule`. Every boss originally on one of the
 * first four was eventually redesigned onto `rule`, at which point all four described a
 * shape nothing in the table used any more — `twistId` included, once the last six bosses
 * still on one were retrofitted onto their own leader's archetype instead. Deleted rather
 * than kept "in case": an unused authoring channel is a standing invitation to reach for
 * the weaker tool.
 *
 * THE ROUND-ONE RULE. Adventure fights are short and a great many never reach round 3, so
 * a signature with a wind-up is a signature that does not exist in the fights that decide
 * the run. Every boss rule here bites on round 1: the prophets arrive on round 1, the
 * bulwarks are already standing, the seal takes your first turn's best card. Two designs
 * were cut for failing exactly this — "your Signature never arrives" (most fights never
 * reach half HP) and "from round 3 a lane closes" (most fights are over).
 */
import { subSeed, makeRoller } from '@adventure/seed';
import type { BossRules } from '@engine/types';

/**
 * ONE SIGNATURE PER BOSS: `rule` is required — `bosses.test.ts` enforces every boss has
 * one, and there is nothing else on this shape left for it to conflict with.
 *
 * Four bosses used to stack two or three signature channels on top of a full 30-card
 * archetype, bonus HP and the act curve, which is five advantages scaling together
 * against a player who scales on roughly two. Measured under the real AI, bosses caused
 * 23 of 34 run deaths at EVERY act. A boss should be one idea the player can read, plan
 * against and beat — not three simultaneous ones.
 *
 * A two-phase reveal (signature withheld until the boss was first brought down) was
 * built and then removed: it handed the boss its Signature card TWICE, once per bar, and
 * the remount it needed disagreed with the combat audio. A boss is one fight under one
 * stated rule. Act 1 still withholds the rule entirely (see `rollEncounter`), which is
 * the early-game relief the phases were reaching for.
 */
export interface Boss {
  id: string;
  name: string;
  icon: string;
  /** One-line telegraph shown on the map and pre-fight. */
  gimmick: string;
  /**
   * Earliest act this boss may headline. Absent = act 1.
   *
   * Act-1 withholding (`rollEncounter`) softens a signature but cannot soften an
   * ARCHETYPE, and the decks are not equally lethal against a 15-card starter: a mill
   * clock or a board-filling cult is a different kind of fight from "every unit is a bit
   * bigger". `bossForAct` draws the early acts from the eligible subset, so the run's
   * first finales are the readable ones and the rule-breakers arrive once there is a deck
   * to answer them with.
   */
  minAct?: number;
  /** Archetype deck/leader the boss plays (a starterDecks leaderId). Its own name may
   *  differ from the boss's display name (e.g. False Hydra plays John Pork's deck). */
  leaderId: string;
  /**
   * The BOSS RULE — the channel that makes a boss something a Trial can never be
   * (`GameState.bossRules`, resolved in `engine/bossRules.ts`).
   *
   * A Trial twist adjusts the board. This breaks a rule of the game: a card in your hand
   * you cannot play, a death that does not stick, a play that is copied onto the other
   * side. That distinction is why it exists — the table used to lean on a `twistId`
   * channel whose kind was drawn from the same table ordinary Trials roll from, so a
   * "boss gimmick" and a "trial condition" were literally the same object, and the
   * finales read as interchangeable with the mid-act nodes. `twistId` was removed once
   * every boss had a `rule` of its own and nothing referenced it any more.
   *
   * Player ids here are Adventure's seating — the player is 0, the boss is 1 — the same
   * convention `autopilot` and `applyTrialToState` already author against.
   */
  rule: BossRules;
}

/**
 * Every gimmick is deterministic and fully stated — the player reads the rule on the
 * map and can plan a route, a deck, and a line of play around it before committing.
 */
export const BOSSES: Boss[] = [
  {
    id: 'warhost', name: 'Failed Heir', icon: '⚔',
    gimmick: 'Charge: his whole board attacks TWICE every round. Aggro is more attack steps than the game allows — at his scale, that is the literal rule.',
    leaderId: 'orsyric',
    rule: { doubleCombat: 1 },
  },
  {
    id: 'drowned-king', name: 'Guardian of Ruin', icon: '🌊',
    gimmick: 'The Drowned Coast: the flanks are open Water and the middle three columns are silt, choked with Tundra. There is no high ground here.',
    leaderId: 'naife', minAct: 3,
    // Naife is the LANE CONTROL leader — move x4 and a hero power that relocates. His
    // signature is therefore the board itself: he does not move your units one at a time,
    // he decides what the columns ARE. The flanks become Water (anything without Aquatic
    // or Airborne that lands there drowns), the middle silts up into three Grounds, and
    // the Heights — Sniper's free targeting — stop existing for the whole fight.
    rule: {
      laneLayout: {
        types: { heights: 'water', ground1: 'ground', water: 'ground', ground2: 'ground', heights2: 'water' },
        places: [
          { lane: 'ground1', cardId: 'tundra' },
          { lane: 'water', cardId: 'tundra' },
          { lane: 'ground2', cardId: 'tundra' },
        ],
      },
    },
  },
  {
    id: 'overgrowth', name: 'The Final Stage', icon: '🌿',
    gimmick: 'Metastasis: every unit you play hands him 1 energy for his next turn. He does not ramp on a clock — he ramps on what you build.',
    leaderId: 'corpselock',
    // His own hero power already borrows energy from HIS future (+3 now, -2 next round).
    // The boss rule borrows from YOURS instead, off the thing Ramp actually does — play
    // bodies — rather than off a flat per-turn number a Trial twist could equally give him.
    rule: { feedOnPlay: { player: 0, energy: 1 } },
  },
  {
    id: 'kedou-revolutionist', name: 'Revolutionist Monk', icon: '🔥',
    gimmick: 'The Cauldron: Burn and Poison on you never stop, cannot be cleansed, and Immunity does not answer them. There is no cure for what she gives you.',
    leaderId: 'kedou', minAct: 3,
    // Kedou's deck is almost entirely Burn/Poison (13 of 30 cards). The rule doesn't add
    // a new mechanic — it removes the two-card answer (Immunity, cleanse) that would
    // otherwise blank her whole archetype outright the moment the altar starts selling
    // Immunity as a common working. Her gimmick finally lands as what her deck already is.
    rule: { cauldron: 0 },
  },
  {
    id: 'aleph-infinitude', name: 'Infinitude', icon: '☠',
    gimmick: 'Discipline: your units cannot be buffed, healed, or grow. Everything you play fights at exactly the size it entered at.',
    leaderId: 'aleph', minAct: 3,
    // Her own hero power's real text is "Poison an enemy unit — it can no longer be
    // buffed": a growth-lock is already Aleph's whole identity, on one card. The boss
    // rule generalises it to the entire fight rather than inventing something new. It
    // deliberately does not touch printed enhancements — those are baked into the card
    // def before the fight starts, so a built God Unit still shows up at full size; what
    // it blocks is compounding DURING the fight (Growth, Bloodlust, healer effects).
    rule: { disciplined: 0 },
  },
  {
    id: 'phantom-warlords-daughter', name: "Warlord's Daughter", icon: '💧',
    gimmick: 'Behind the Mask: at the start of each of your turns, she takes your most expensive card into her own hand.',
    leaderId: 'phantom', minAct: 4,
    // Control's whole identity (freeze, sleep, expel, mill) is denying the opponent a
    // resource. This aims that denial at the hand itself, rather than at the board — the
    // one resource none of her existing keywords touch — and she keeps what she takes.
    rule: { steal: 0 },
  },
  {
    id: 'screyera-all-seeing', name: 'The All-Seeing', icon: '🔮',
    gimmick: 'Foresight: she has already seen the card you most wanted. Every turn, the most expensive card in your hand is sealed and cannot be played.',
    leaderId: 'screyera', minAct: 3,
    rule: { seal: 0 },
  },
  {
    id: 'ringleader-executioner', name: "King's Personal Executioner", icon: '🐍',
    gimmick: 'Execution: at the end of every one of your turns, your most expensive unit in play is destroyed. It gets one swing first.',
    leaderId: 'ringleader', minAct: 2,
    rule: { execute: 0 },
  },
  {
    id: 'false-hydra', name: 'Ignorance is Bliss', icon: '🎭',
    gimmick: 'On every odd round, False Prophets fill her every empty lane. Any still standing at the end of the round dissolve — and each one puts a Null into your hand. Every unit fights the turn it lands.',
    leaderId: 'johnpork', minAct: 2,
    rule: { placements: [{ cardId: 'cult-follower', side: 1, everyRounds: 2 }], battleReady: true },
  },
  {
    id: 'cleath-architect', name: 'The Architect and the Builder', icon: '⛰',
    gimmick: 'His board is already built: a Bulwark stands in every one of his lanes from round one. Siege it down.',
    leaderId: 'cleath', minAct: 2,
    rule: { placements: [{ cardId: 'bulwark-wall', side: 1, everyRounds: 0 }] },
  },
  {
    id: 'autopus-overflow', name: 'Integer Overflow', icon: '🐙',
    gimmick: 'The Mirror: every unit you play is copied into his matching lane, at whatever size you made it. Your best card is his best card.',
    leaderId: 'autopus', minAct: 3,
    rule: { mirror: 0 },
  },
  {
    id: 'eksana-nice', name: 'Leader of NICE', icon: '🗡',
    gimmick: 'Correction: NICE brings everything to spec. Every unit you play enters with 2 less attack.',
    leaderId: 'eksana', minAct: 2,
    rule: { dampen: { player: 0, attack: 2 } },
  },
  {
    id: 'noctua-death-artificer', name: 'Death Artificer', icon: '🦉',
    gimmick: 'Recursion: every unit that dies — yours or hers — rises again under her control, once.',
    leaderId: 'noctua', minAct: 4,
    rule: { recursion: 1 },
  },
];

const byId = new Map(BOSSES.map((b) => [b.id, b]));
export const bossById = (id: string): Boss | undefined => byId.get(id);

/**
 * The act's boss, drawn from a per-RUN PERMUTATION of the table rather than sampled
 * independently each act.
 *
 * The previous version sampled each act on its own (`subSeed(seed,'boss') + act`, fed the
 * boss NODE's seed, which already varies per act). That was effectively a uniform draw, so
 * the same boss could headline two acts back to back — measured at 7.1% of consecutive act
 * pairs across 500 runs, i.e. exactly the 1/13 a uniform draw implies. Shuffling once per
 * run and walking the result means every boss is faced before any repeats, so a 13-act run
 * sees 13 different finales.
 *
 * `seed` must be the RUN master seed, not a node seed: the permutation has to be stable
 * across acts, and node seeds are salted per act by construction. Past 13 acts a fresh
 * permutation is drawn per cycle; a repeat can still land exactly on a cycle boundary,
 * which is rare enough at that depth to leave alone.
 */
export const bossForAct = (seed: number, act: number): Boss => {
  const i = Math.max(0, act - 1);
  const cycle = Math.floor(i / BOSSES.length);
  const order = makeRoller(subSeed(seed, 'bossorder', cycle)).shuffle(BOSSES);
  // Assign the WHOLE cycle in one deterministic pass, then index it — rather than
  // filtering per act, which would repartition the order on every call and could hand the
  // same boss two acts running, the exact bug the per-run permutation exists to prevent.
  //
  // Greedy by slot: each slot takes the first unused boss the shuffle offers that is
  // eligible for it, falling back to the first unused one if none is (so the table can
  // never run dry, whatever `minAct` values are authored). Eligibility is measured against
  // the slot's position in the CYCLE, not the absolute act: a second cycle beginning at
  // act 14 has already earned every boss, and re-gating the table there would strand the
  // late-act rule-breakers forever.
  const used = new Set<string>();
  const cycleOrder: Boss[] = [];
  for (let slot = 1; slot <= BOSSES.length; slot++) {
    const pick =
      order.find((b) => !used.has(b.id) && (b.minAct ?? 1) <= slot) ??
      order.find((b) => !used.has(b.id))!;
    used.add(pick.id);
    cycleOrder.push(pick);
  }
  return cycleOrder[i % BOSSES.length]!;
};
