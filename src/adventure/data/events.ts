/**
 * Event definitions — the choose-your-outcome encounters on '?' map nodes.
 *
 * Each choice carries a pure, non-interactive `EventOutcome` the run reducer applies
 * (see run.ts `chooseEventOption`). Random selection is used wherever a card or relic is
 * involved, so no mid-event targeting sub-step is needed. Events are picked by the
 * node's seed, so a reload can't reroll them.
 *
 * ---------------------------------------------------------------------------------
 * THE RUN REMEMBERS
 * ---------------------------------------------------------------------------------
 * Every event used to be one screen, one choice, one payout, after which the run forgot
 * it happened. That single missing capability — memory — is what ruled out the three
 * structures that carry most of the interest in comparable games:
 *
 *   CHAINS        an NPC you meet again, whose second offer depends on your first
 *                 (`requiresFlag` gates the later part; the `flag` outcome opens it).
 *   DEFERRED PAY  bank coins here, collect them at your NEXT '?' node — the first reward
 *                 in the run that is a reason to ROUTE somewhere (`deposit`/`withdraw`).
 *   STATE GATES   choices that only appear because of what you are carrying
 *                 (`EventChoice.requires`).
 *
 * And two more things no event could previously do at all: read the relics you own
 * (`sellRelic`/`tradeRelic`), and change the deck structurally rather than by addition
 * (`trimDeck`/`temper`/`purge`).
 */
import type { Registry } from '@cards/registry';
import { relicById, type RelicRarity } from '@adventure/data/relics';

export type EventOutcome =
  | { kind: 'coins'; amount: number } // + or −
  /**
   * Gain (positive) or lose (negative) this fraction of your CURRENT purse, resolved
   * live against `run.coins` rather than a number fixed at authoring time. Distinct from
   * the flat `coins` outcome and from `RelicMods.coinsPercent` (a relic's claim-time,
   * one-shot version of the same idea) — this is what lets an event's stakes actually
   * rise and fall with how rich the run already is, which is the entire point of a
   * proportional gamble: it costs almost nothing early and everything late.
   */
  | { kind: 'coinsPercent'; amount: number }
  | { kind: 'relic'; bands: RelicRarity[] }
  /** Grant this EXACT relic, no choice screen — the event's own choice already was the act. */
  | { kind: 'namedRelic'; relicId: string }
  /**
   * Offer a CHOICE among these EXACT relics — not a band roll. Reuses the same 'gain'
   * screen a rolled relic pick uses (it only ever needed an array of ids to render), so
   * an event can present two or three specific, hand-picked relics side by side without
   * any new UI — only a way to set `relicChoices` that isn't `rollRelicChoices`.
   */
  | { kind: 'chooseRelic'; relicIds: string[] }
  | { kind: 'card'; cardId: string | 'random' }
  | { kind: 'sacrificeEnhance' } // destroy up to 2 random owned → heavily enhance 1 other
  | { kind: 'combat'; twistId?: string } // route into a fight via this node
  /** Heal (or, with a negative amount, wound). Clamped to the run's overheal ceiling. */
  | { kind: 'heal'; amount: number }
  /** Permanently shift max HP, healing by the same amount when positive. */
  | { kind: 'maxHp'; amount: number }
  /** Force a junk card into the deck. The cost side of a bargain. */
  | { kind: 'curse'; cardId: string; count?: number }
  /**
   * A REAL coin-flip. `p` is the chance of `win`; anything else resolves `lose`.
   *
   * Added because two shipped events were pure fiction: Gambler's Cup charged 50 for a
   * guaranteed 90, and Cursed Hoard's "something feels wrong" hoard carried no curse at
   * all. `chooseEventOption` already built a seeded roller and used it for exactly one
   * branch, so the plumbing for genuine risk was sitting there unused.
   */
  | { kind: 'gamble'; p: number; win: EventOutcome; lose: EventOutcome }
  /** Run several outcomes in order — the bargain and its price in one choice. */
  | { kind: 'multi'; outcomes: EventOutcome[] }
  /** Write a flag into the run's memory. Later events gate on it. */
  | { kind: 'flag'; flag: string }
  /**
   * Bank coins now, payable at a LATER event. The coins themselves are taken by the
   * choice's `cost`; this records what is owed.
   */
  | { kind: 'deposit'; payout: number }
  /** Collect everything banked by a previous `deposit`. */
  | { kind: 'withdraw' }
  /** Burn N random cards out of the deck. Never cuts below the minimum deck size. */
  | { kind: 'trimDeck'; count: number }
  /** Remove every copy of one card from the deck (how junk gets cleaned up). */
  | { kind: 'purge'; cardId: string }
  /** Permanently buff N random owned units/foundations. */
  | { kind: 'temper'; count: number; attack: number; hp: number }
  /** Give up a random owned relic for coins. */
  | { kind: 'sellRelic'; coins: number }
  /** Give up a random owned relic and pick a replacement from these bands. */
  | { kind: 'tradeRelic'; bands: RelicRarity[] }
  /**
   * MEND up to `count` relics you are carrying: repair broken ones first, then relight
   * spent one-shots.
   *
   * The interaction point the broken-relic shape needed. A broken relic's debt is
   * otherwise paid in exactly one currency (battles won), which makes the whole family
   * a flat "wait N fights" — this turns a '?' node into a way to buy the wait out, so
   * taking a broken relic late in a run becomes a routing question rather than a
   * strictly worse purchase. Broken is settled before spent because a broken relic is
   * actively costing you something right now, whereas a spent one is merely inert.
   */
  | { kind: 'mendRelics'; count: number }
  | { kind: 'nothing' };

/** Preconditions on a single choice, checked against the run before it is offered. */
export interface EventRequirement {
  /** The run must carry this flag. */
  flag?: string;
  /** The run must NOT carry this flag. */
  notFlag?: string;
  /** At least this many relics owned. */
  relicsAtLeast?: number;
  /** At least this many relics are broken or spent — i.e. there is something to mend. */
  mendableAtLeast?: number;
  /** At least this much banked from an earlier `deposit`. */
  bankAtLeast?: number;
  /** At least this many copies of a specific card in the deck (for junk cleanup). */
  cardsOwned?: { cardId: string; count: number };
}

export interface EventChoice {
  label: string;
  /** Coins spent to take this choice (also the affordability gate). */
  cost?: number;
  /**
   * HP spent to take this choice, gated so it can never be lethal.
   *
   * Events used to trade only in coins and deck size — never in HP, which is the resource
   * an attrition run is actually about. A choice that costs blood is the one currency the
   * player always has and always feels.
   */
  hpCost?: number;
  /** Requires the deck to have at least this many cards (for sacrifice choices). */
  requiresDeck?: number;
  /** Everything else that must hold for this choice to be offered. */
  requires?: EventRequirement;
  outcome: EventOutcome;
  /** Short result line shown after choosing. */
  result: string;
}

export interface AdventureEvent {
  id: string;
  title: string;
  icon: string;
  body: string;
  /**
   * This event is only ever drawn once the run carries this flag — the mechanism behind
   * every chain below. Part one sets the flag; part two requires it, and (via `notFlag`
   * on part one's choices) part one stops re-offering the same bargain.
   */
  requiresFlag?: string;
  choices: EventChoice[];
}

/**
 * Plain-English summary of exactly what an outcome does — the subtext under each choice.
 *
 * DERIVED, never authored. An event's `label` and `result` are flavour written by hand,
 * and hand-written flavour drifts: "the smith offers to see to your gear" tells a player
 * nothing about whether they are about to lose a card, and a hand-written gloss saying
 * "burns 2 cards" silently becomes a lie the moment the outcome is retuned to 3. Reading
 * the summary off the same `EventOutcome` the reducer consumes means the two cannot
 * disagree — if the effect changes, the sentence changes with it.
 *
 * `registry` is optional and only used to name cards; without one the card id is shown,
 * which is ugly but never wrong.
 */
export const outcomeSummary = (o: EventOutcome, registry?: Registry, nested = false): string => {
  const cardName = (id: string): string => registry?.cards.get(id)?.name ?? id;
  const sub = (x: EventOutcome): string => outcomeSummary(x, registry, true);
  const bands = (b: RelicRarity[]): string => b.join('/');
  switch (o.kind) {
    case 'coins':
      return o.amount >= 0 ? `Gain ⊙ ${o.amount}` : `Lose ⊙ ${-o.amount}`;
    case 'coinsPercent':
      return o.amount >= 0
        ? `Gain ${Math.round(o.amount * 100)}% of your current coins`
        : `Lose ${Math.round(-o.amount * 100)}% of your current coins`;
    case 'relic':
      return `Choose 1 of 3 relics (${bands(o.bands)})`;
    case 'namedRelic': {
      const named = relicById(o.relicId);
      return `Gain ${named?.name ?? o.relicId}`;
    }
    case 'chooseRelic': {
      const names = o.relicIds.map((id) => relicById(id)?.name ?? id).join(' or ');
      return `Choose: ${names}`;
    }
    case 'card':
      return o.cardId === 'random' ? 'Add a random card of your element' : `Add ${cardName(o.cardId)}`;
    case 'sacrificeEnhance':
      return 'Destroy up to 2 random owned cards, then heavily enhance another';
    case 'combat':
      return o.twistId ? 'Start a fight, under a twist' : 'Start a fight';
    case 'heal':
      return o.amount >= 0 ? `Heal ${o.amount} HP` : `Lose ${-o.amount} HP`;
    case 'maxHp':
      return o.amount >= 0 ? `Gain ${o.amount} max HP` : `Lose ${-o.amount} max HP`;
    case 'curse':
      return `Add ${o.count ?? 1} × ${cardName(o.cardId)} to your deck`;
    case 'gamble': {
      // Both halves, with the real odds. A gamble whose downside is not spelled out is
      // not a gamble the player agreed to.
      //
      // A NESTED gamble is bracketed, because the flat form is genuinely ambiguous: a
      // press-your-luck chain rendered as "80%: 60%: X — otherwise Y — otherwise Z"
      // gives the reader no way to tell which "otherwise" belongs to which percentage.
      // Brackets bind each half to its own roll.
      const pct = Math.round(o.p * 100);
      return nested
        ? `(${pct}%: ${sub(o.win)}, else ${sub(o.lose)})`
        : `${pct}%: ${sub(o.win)} — otherwise ${sub(o.lose)}`;
    }
    case 'multi':
      return o.outcomes.map(sub).filter(Boolean).join(', then ');
    case 'flag':
      return 'The road remembers this';
    case 'deposit':
      return `Bank it — collect ⊙ ${o.payout} at a later ? node`;
    case 'withdraw':
      return 'Collect everything you have banked';
    case 'trimDeck':
      return `Burn ${o.count} random cards from your deck, forever`;
    case 'purge':
      return `Remove every copy of ${cardName(o.cardId)} from your deck`;
    case 'temper':
      return `${o.count} random owned units gain +${o.attack}/+${o.hp}, permanently`;
    case 'sellRelic':
      return `Give up a random relic for ⊙ ${o.coins}`;
    case 'tradeRelic':
      return `Give up a random relic, then choose a replacement (${bands(o.bands)})`;
    case 'mendRelics':
      return o.count >= 99
        ? 'Repair every broken relic and relight every spent one'
        : `Repair up to ${o.count} broken or spent relic${o.count === 1 ? '' : 's'}`;
    case 'nothing':
      return 'Nothing happens';
    default: {
      // Exhaustiveness guard: a new outcome kind fails to compile here until it has a
      // sentence, which is the only reliable way to stop one shipping unexplained.
      const never: never = o;
      return never;
    }
  }
};

/**
 * The full subtext for one choice: what it costs, then what it does.
 *
 * Costs come first because they are the part a player is deciding against, and because
 * `cost`/`hpCost` are charged by the reducer regardless of how the outcome resolves —
 * including on the losing half of a gamble.
 */
export const choiceSummary = (choice: EventChoice, registry?: Registry): string => {
  const parts: string[] = [];
  if (choice.cost) parts.push(`Pay ⊙ ${choice.cost}`);
  if (choice.hpCost) parts.push(`Pay ${choice.hpCost} HP`);
  const effect = outcomeSummary(choice.outcome, registry);
  if (effect) parts.push(effect);
  return parts.join(' · ');
};

/** Junk card forced into a deck by a bad bargain. */
const JUNK = 'dead-weight';

export const EVENTS: AdventureEvent[] = [
  {
    id: 'the-investment-office',
    title: 'The Investment Office',
    icon: '📊',
    body: 'A clerk in a spotless suit slides a ledger across the counter. "Everyone starts cautious. Everyone I remember started cautious." The pen is already uncapped.',
    choices: [
      {
        label: 'Invest cautiously',
        // A stake that is a FRACTION of the purse rather than a flat number — cheap to
        // risk early, real money late. This tier is a guaranteed return, matching the
        // Investment Device's own first, riskless rung.
        outcome: { kind: 'coinsPercent', amount: 0.5 },
        result: 'The clerk barely looks up. "Sound money never surprised anyone."',
      },
      {
        label: 'Invest boldly',
        outcome: { kind: 'gamble', p: 0.5,
          win: { kind: 'coinsPercent', amount: 0.5 },
          lose: { kind: 'coinsPercent', amount: -0.5 },
        },
        result: 'The pen taps twice against the ledger before you sign.',
      },
      {
        label: 'Invest recklessly',
        outcome: { kind: 'gamble', p: 0.25,
          win: { kind: 'coinsPercent', amount: 1 },
          lose: { kind: 'coinsPercent', amount: -1 },
        },
        result: 'The clerk finally looks up. It is not a friendly look.',
      },
      { label: 'Keep your coin where you can see it', outcome: { kind: 'nothing' }, result: 'The ledger closes on its own.' },
    ],
  },
  {
    id: 'the-adjudicator',
    title: 'The Adjudicator',
    icon: '⚖',
    body: 'A figure in grey reads your standing off a slate before you have said a word. "I can put you further down the road than you have earned. The road does not forget the difference. Neither will your purse."',
    choices: [
      {
        label: 'Accept the harder terms',
        // A single NAMED relic, not a roll — the choice made HERE is the price paid, the
        // same reasoning that lets a boon grant a cursed relic outright. `overclock-
        // contract` prices itself: `actDelta` scales the fight AND the payout together.
        outcome: { kind: 'namedRelic', relicId: 'overclock-contract' },
        result: 'The Adjudicator marks the slate once and says nothing further.',
      },
      { label: 'Walk the road you were given', outcome: { kind: 'coins', amount: 60 }, result: 'A small consolation, paid without comment.' },
    ],
  },
  {
    id: 'the-underwriters',
    title: 'The Underwriters',
    icon: '📑',
    body: 'Two agents wait at a folding table, each with a contract already drawn. "A trickle for the whole road," says one, "or the sum in your hand today," says the other. "We are not going to tell you which is smarter."',
    choices: [
      {
        label: 'Sign both contracts on the table',
        // An explicit, hand-picked pair, not a band roll — the choice IS "which of these
        // two", so the picker only ever needs to offer these two.
        outcome: { kind: 'chooseRelic', relicIds: ['underwriters-bond', 'underwriters-payout'] },
        result: 'Both agents produce the same contract, worded two different ways.',
      },
      { label: 'Sign neither', outcome: { kind: 'nothing' }, result: 'They fold their table without a word of complaint.' },
    ],
  },
  {
    id: 'the-wick-trimmer',
    title: 'The Wick-Trimmer',
    icon: '🕯',
    body: 'A stooped figure works at a bench of half-dismantled charms, trimming wicks that have burned down to nothing. "Bring it here. Nothing is finished until I say it is."',
    choices: [
      {
        label: 'Have them mend what you carry',
        // Gated on actually having damage: a repair shop with nothing to repair is a
        // dead door, and `requirementMet` HIDES a failing choice rather than greying it.
        requires: { mendableAtLeast: 1 },
        cost: 90,
        outcome: { kind: 'mendRelics', count: 2 },
        result: 'They work in silence. Two of your charms come back whole — a broken one repaired, or a spent one relit.',
      },
      {
        label: 'Have them mend everything, for blood',
        requires: { mendableAtLeast: 2 },
        hpCost: 8,
        outcome: { kind: 'mendRelics', count: 99 },
        result: 'They take the payment in red, and do not look up. Everything you carry is whole again.',
      },
      {
        label: 'Sell them a charm instead',
        requires: { relicsAtLeast: 2 },
        outcome: { kind: 'sellRelic', coins: 190 },
        result: 'They weigh it, grunt, and pay without haggling.',
      },
      { label: 'Leave them to their work', outcome: { kind: 'nothing' }, result: 'The bench recedes into the dark.' },
    ],
  },
  {
    id: 'the-codewright',
    title: 'The Codewright',
    icon: '🧬',
    body: 'Something half-machine and half-argument unfolds itself from the rock. "I have WORK. It is FLAWED. It will not be flawed forever. Will you carry it while it mends?"',
    choices: [
      {
        label: 'Take the flawed work',
        // The Error Code bargain in event form: a real relic, and it arrives broken.
        // Rolled from the cursed band because that is where prices live, and this is a
        // price — just one that expires.
        outcome: { kind: 'multi', outcomes: [
          { kind: 'relic', bands: ['cursed'] },
          { kind: 'flag', flag: 'codewright' },
        ] },
        result: 'It presses the thing into your hands, still ticking wrong. "It will come good. Win, and it will come good."',
      },
      {
        label: 'Demand something already finished',
        cost: 170,
        outcome: { kind: 'relic', bands: ['common', 'rare'] },
        result: 'It sighs through a vent and hands over something that simply works.',
      },
      { label: 'Refuse the work', outcome: { kind: 'coins', amount: 70 }, result: 'It pays you a little to go away.' },
    ],
  },
  {
    id: 'the-codewright-again',
    title: 'The Codewright, Again',
    icon: '🧬',
    requiresFlag: 'codewright',
    body: 'The same unfolding thing, further along the road. "You CARRIED it. Few carry it. I have a second draft, and I have a file."',
    choices: [
      {
        label: 'Let it file the flaws out',
        requires: { mendableAtLeast: 1 },
        outcome: { kind: 'mendRelics', count: 99 },
        result: 'It works fast and without ceremony. Every flaw you were carrying closes over.',
      },
      {
        label: 'Take the second draft too',
        outcome: { kind: 'multi', outcomes: [
          { kind: 'relic', bands: ['cursed'] },
          { kind: 'coins', amount: 120 },
        ] },
        result: 'Another flawed thing, and coins for the trouble of carrying it.',
      },
      {
        label: 'Ask what it is building',
        hpCost: 6,
        outcome: { kind: 'relic', bands: ['rare', 'boss'] },
        result: 'It shows you. The showing costs something. What it hands over afterward is finished, and very good.',
      },
    ],
  },
  {
    id: 'the-turning-card',
    title: 'The Turning Card',
    icon: '🃏',
    body: 'A dealer with no face lays a single card face-down. "Turn it, and I deal another. Each one is worth more than the last. Each one is likelier to bite."',
    choices: [
      {
        // The Nildis shape: the reward rises and the odds WORSEN with each flip, so the
        // decision is where to stop rather than whether to start. Expressed as nested
        // gambles — each `win` contains the next, harsher flip.
        label: 'Turn one card',
        outcome: { kind: 'gamble', p: 0.8, win: { kind: 'coins', amount: 120 }, lose: { kind: 'heal', amount: -6 } },
        result: 'One card. The dealer barely looks up.',
      },
      {
        label: 'Turn until the second',
        outcome: { kind: 'gamble', p: 0.8, win: {
          kind: 'gamble', p: 0.6, win: { kind: 'relic', bands: ['common', 'rare'] }, lose: { kind: 'heal', amount: -10 },
        }, lose: { kind: 'heal', amount: -6 } },
        result: 'Two cards. The dealer’s hands slow down.',
      },
      {
        label: 'Turn until the third',
        outcome: { kind: 'gamble', p: 0.8, win: {
          kind: 'gamble', p: 0.6, win: {
            kind: 'gamble', p: 0.4, win: { kind: 'relic', bands: ['rare', 'boss'] }, lose: { kind: 'combat' },
          }, lose: { kind: 'heal', amount: -10 },
        }, lose: { kind: 'heal', amount: -6 } },
        result: 'Three cards. Something behind the dealer starts to stand up.',
      },
      { label: 'Do not touch the card', outcome: { kind: 'coins', amount: 50 }, result: 'The dealer tips you for your sense.' },
    ],
  },
  {
    id: 'the-assayer',
    title: 'The Assayer',
    icon: '⚖',
    body: 'A clerk with a jeweller’s loupe glances at your purse rather than your face. "Coin begets coin. That is not philosophy, it is arithmetic."',
    choices: [
      {
        // The Silver Coin of Discord shape as an event: proportional, so it is a
        // question about WHEN you meet it rather than a flat number.
        label: 'Let them count your purse',
        outcome: { kind: 'gamble', p: 0.7, win: { kind: 'coins', amount: 220 }, lose: { kind: 'coins', amount: -110 } },
        result: 'The loupe comes down. The arithmetic goes one way or the other.',
      },
      {
        label: 'Deposit with them against your return',
        cost: 100,
        outcome: { kind: 'deposit', payout: 260 },
        result: 'A slip of paper, stamped twice. Redeemable at the next such office you pass.',
      },
      {
        label: 'Collect on an earlier slip',
        requires: { bankAtLeast: 1 },
        outcome: { kind: 'withdraw' },
        result: 'They find the record without being asked, and pay it out in full.',
      },
      { label: 'Keep your purse shut', outcome: { kind: 'nothing' }, result: 'The clerk loses interest immediately.' },
    ],
  },
  {
    id: 'wandering-duelist',
    title: 'The Wandering Duelist',
    icon: '⚔',
    body: 'A masked duelist blocks the path and raps their blade against a shield. "Prove yourself — or step aside."',
    choices: [
      { label: 'Accept the duel', outcome: { kind: 'combat', twistId: 'stampede' }, result: 'The duelist draws. Steel meets steel.' },
      { label: 'Walk away', outcome: { kind: 'nothing' }, result: 'You give the duelist a wide berth.' },
    ],
  },
  {
    id: 'wishing-shrine',
    title: 'The Wishing Shrine',
    icon: '⛩',
    body: 'A moss-covered shrine hums faintly. A coin slot glints beneath a carved sigil.',
    choices: [
      { label: 'Offer 50 coins for a relic', cost: 50, outcome: { kind: 'relic', bands: ['common', 'rare'] }, result: 'The relic floats into your pack.' },
      { label: 'Pray for fortune', outcome: { kind: 'coins', amount: 30 }, result: 'Coins spill from the offering bowl.' },
      { label: 'Leave it undisturbed', outcome: { kind: 'nothing' }, result: 'You bow and move on.' },
    ],
  },
  {
    id: 'gamblers-cup',
    title: "The Gambler's Cup",
    icon: '🎲',
    body: 'A grinning trickster rattles three cups. "Stake fifty, walk away with ninety — my hand never lies."',
    choices: [
      // Was `{ kind: 'coins', amount: 90 }` against a cost of 50 — a guaranteed +40 with no
      // roll ever made, on an event whose entire text is about risk.
      { label: 'Stake 50 coins', cost: 50, outcome: { kind: 'gamble', p: 0.5, win: { kind: 'coins', amount: 140 }, lose: { kind: 'nothing' } }, result: 'The cup lifts…' },
      { label: 'Decline', outcome: { kind: 'nothing' }, result: 'You keep your purse closed.' },
    ],
  },
  {
    id: 'forge-of-ruin',
    title: 'The Forge of Ruin',
    icon: '🔨',
    body: 'A dead forge still radiates heat. An anvil promises power — for a sacrifice of steel.',
    choices: [
      { label: 'Melt two cards to temper one', requiresDeck: 4, outcome: { kind: 'sacrificeEnhance' }, result: 'Two cards burn away; one emerges mighty.' },
      { label: 'Salvage scrap', outcome: { kind: 'coins', amount: 20 }, result: 'You pocket some loose metal.' },
    ],
  },
  {
    id: 'traveling-merchant',
    title: 'The Traveling Merchant',
    icon: '🧳',
    body: 'A merchant unrolls a blanket of oddments. "A curiosity, free of charge — care to take one?"',
    choices: [
      { label: 'Accept a free card', outcome: { kind: 'card', cardId: 'random' }, result: 'The merchant tosses you a card.' },
      { label: 'Buy a relic (60)', cost: 60, outcome: { kind: 'relic', bands: ['common'] }, result: 'You trade coins for a relic.' },
      { label: 'Move along', outcome: { kind: 'nothing' }, result: 'The merchant shrugs and packs up.' },
    ],
  },
  {
    id: 'cursed-hoard',
    title: 'The Cursed Hoard',
    icon: '💀',
    body: 'A glittering pile of coins sits beneath a cracked idol. Something about it feels wrong.',
    choices: [
      { label: 'Grab the coins', outcome: { kind: 'gamble', p: 0.55, win: { kind: 'coins', amount: 110 }, lose: { kind: 'curse', cardId: JUNK, count: 2 } }, result: 'You scoop the hoard — the idol watches.' },
      { label: 'Take a relic instead', hpCost: 6, outcome: { kind: 'relic', bands: ['rare'] }, result: 'You pry a relic from the idol. It takes its price in blood.' },
      { label: 'Flee', outcome: { kind: 'nothing' }, result: 'You leave the cursed pile behind.' },
    ],
  },
  {
    id: 'ancient-library',
    title: 'The Ancient Library',
    icon: '📜',
    body: 'Dusty shelves hold forgotten techniques. One scroll still glows with power.',
    choices: [
      { label: 'Study the scroll', requiresDeck: 4, outcome: { kind: 'sacrificeEnhance' }, result: 'You transcribe the technique — at a cost.' },
      { label: 'Pocket a loose page', outcome: { kind: 'card', cardId: 'random' }, result: 'A page folds itself into a card.' },
    ],
  },
  {
    id: 'blood-altar',
    title: 'The Blood Altar',
    icon: '🩸',
    body: 'A basin of dark stone, still warm. The carving above it shows an open hand and an open vein.',
    choices: [
      { label: 'Open a vein for a relic', hpCost: 8, outcome: { kind: 'relic', bands: ['rare'] }, result: 'The basin drinks, and something settles into your pack.' },
      { label: 'Offer a little', hpCost: 4, outcome: { kind: 'coins', amount: 70 }, result: 'Coins well up where the blood ran.' },
      { label: 'Keep your blood', outcome: { kind: 'nothing' }, result: 'You step around the basin.' },
    ],
  },
  {
    id: 'field-surgeon',
    title: 'The Field Surgeon',
    icon: '⚕',
    body: 'A tired woman with clean hands and a full bag. "I can patch you now, or teach you to patch yourself. Not both."',
    choices: [
      { label: 'Be treated', outcome: { kind: 'heal', amount: 14 }, result: 'She works quickly, and well.' },
      { label: 'Learn the trade (60)', cost: 60, outcome: { kind: 'maxHp', amount: 8 }, result: 'You will carry this the rest of the way.' },
      { label: 'Decline', outcome: { kind: 'nothing' }, result: 'She shrugs and repacks her bag.' },
    ],
  },
  {
    id: 'collapsed-mine',
    title: 'The Collapsed Mine',
    icon: '⛏',
    body: 'Timbers groan overhead. Something metal glints under the rubble, a long crawl in.',
    choices: [
      { label: 'Crawl in after it', outcome: { kind: 'gamble', p: 0.6, win: { kind: 'relic', bands: ['common', 'rare'] }, lose: { kind: 'heal', amount: -10 } }, result: 'You squeeze into the dark…' },
      { label: 'Salvage from the mouth', outcome: { kind: 'coins', amount: 35 }, result: 'You take what you can reach.' },
      { label: 'Move on', outcome: { kind: 'nothing' }, result: 'The mine keeps its metal.' },
    ],
  },
  {
    id: 'debt-collector',
    title: 'The Debt Collector',
    icon: '📕',
    body: 'He does not ask your name. He already has it written down. "Someone paid your way here. Settle, or carry it."',
    choices: [
      { label: 'Settle up (100)', cost: 100, outcome: { kind: 'relic', bands: ['rare'] }, result: 'He closes the book and hands you a token.' },
      { label: 'Carry the debt', outcome: { kind: 'curse', cardId: JUNK, count: 2 }, result: 'The weight of it follows you.' },
    ],
  },
  {
    id: 'whetstone-shrine',
    title: 'The Whetstone Shrine',
    icon: '🪨',
    body: 'A rough stone worn into a saddle by a thousand blades. It still hums when touched.',
    choices: [
      { label: 'Sharpen one card (40)', cost: 40, requiresDeck: 3, outcome: { kind: 'sacrificeEnhance' }, result: 'Two blades are ground to nothing; one comes back keen.' },
      { label: 'Take a stone chip', outcome: { kind: 'card', cardId: 'random' }, result: 'A chip of it folds into a card.' },
    ],
  },
  {
    id: 'drowned-chapel',
    title: 'The Drowned Chapel',
    icon: '⛪',
    body: 'Waist-deep water fills the nave. Candles still burn, somehow, below the surface.',
    choices: [
      { label: 'Wade to the altar', hpCost: 6, outcome: { kind: 'gamble', p: 0.7, win: { kind: 'maxHp', amount: 10 }, lose: { kind: 'heal', amount: -6 } }, result: 'The cold closes over your legs…' },
      { label: 'Pray from the door', outcome: { kind: 'heal', amount: 10 }, result: 'Something answers, faintly.' },
      { label: 'Leave it drowned', outcome: { kind: 'nothing' }, result: 'You close the door behind you.' },
    ],
  },
  {
    id: 'twin-merchants',
    title: 'The Twin Merchants',
    icon: '⚖',
    body: 'Two identical stalls, two identical smiles. "Cheap and honest," says one. "Dear and certain," says the other.',
    choices: [
      { label: 'Buy cheap (30)', cost: 30, outcome: { kind: 'gamble', p: 0.5, win: { kind: 'relic', bands: ['common', 'rare'] }, lose: { kind: 'nothing' } }, result: 'You unwrap the parcel…' },
      { label: 'Buy dear (90)', cost: 90, outcome: { kind: 'relic', bands: ['common'] }, result: 'Exactly what was promised, at exactly the price.' },
      { label: 'Buy nothing', outcome: { kind: 'nothing' }, result: 'Both smiles fade at the same rate.' },
    ],
  },
  {
    id: 'hollow-champion',
    title: 'The Hollow Champion',
    icon: '🛡',
    body: 'Armour stands in the road with nobody in it. As you approach, it raises a hand — not to strike. To offer.',
    choices: [
      { label: 'Take up the armour', outcome: { kind: 'maxHp', amount: 12 }, result: 'It settles onto you, and stops being empty.' },
      { label: 'Fight it instead', outcome: { kind: 'combat', twistId: 'hardened' }, result: 'The hand closes into a fist.' },
      { label: 'Walk past', outcome: { kind: 'nothing' }, result: 'It lowers its hand as you pass.' },
    ],
  },
  {
    id: 'tax-collector',
    title: 'The Toll Bridge',
    icon: '🌉',
    body: 'The only bridge for miles, and a bored soldier with a ledger at the near end.',
    choices: [
      { label: 'Pay the toll (70)', cost: 70, outcome: { kind: 'card', cardId: 'random' }, result: 'He waves you through and tosses you something for your trouble.' },
      { label: 'Ford the river', hpCost: 10, outcome: { kind: 'coins', amount: 40 }, result: 'Cold, bruising, and free — you even find coins in the shallows.' },
      { label: 'Argue', outcome: { kind: 'gamble', p: 0.4, win: { kind: 'coins', amount: 60 }, lose: { kind: 'heal', amount: -8 } }, result: 'You explain your position at length…' },
    ],
  },
  {
    id: 'seed-vault',
    title: 'The Seed Vault',
    icon: '🌱',
    body: 'Rows of sealed jars, each labelled in a hand nobody living can read. Most are dust. A few are not.',
    choices: [
      { label: 'Open three jars', outcome: { kind: 'gamble', p: 0.65, win: { kind: 'card', cardId: 'random' }, lose: { kind: 'curse', cardId: JUNK, count: 1 } }, result: 'Dust, dust, and…' },
      { label: 'Sell the intact jars (whole)', outcome: { kind: 'coins', amount: 55 }, result: 'A collector somewhere will pay. You take the coin now.' },
    ],
  },
  {
    id: 'mirror-pool',
    title: 'The Mirror Pool',
    icon: '🪞',
    body: 'Perfectly still water, and your reflection is a half-second late. It is holding something you are not.',
    choices: [
      { label: 'Reach in and take it', hpCost: 5, outcome: { kind: 'relic', bands: ['rare', 'boss'] }, result: 'Your arm comes back holding what the reflection held.' },
      { label: 'Break the surface', outcome: { kind: 'heal', amount: 12 }, result: 'The reflection scatters, and you feel oddly rested.' },
      { label: 'Look away', outcome: { kind: 'nothing' }, result: 'It is still watching when you leave.' },
    ],
  },
  {
    id: 'quartermaster',
    title: "The Quartermaster's Cart",
    icon: '🛒',
    body: 'A cart of unsorted war surplus, and a man who cannot be bothered to sort it. "Fixed price. You dig."',
    choices: [
      { label: 'Dig for 45', cost: 45, outcome: { kind: 'gamble', p: 0.55, win: { kind: 'relic', bands: ['common', 'rare'] }, lose: { kind: 'card', cardId: 'random' } }, result: 'You dig to the elbow…' },
      { label: 'Trade two cards for coin', requiresDeck: 4, outcome: { kind: 'sacrificeEnhance' }, result: 'He takes two off your hands and improves a third out of guilt.' },
      { label: 'Move along', outcome: { kind: 'nothing' }, result: 'He has already stopped looking at you.' },
    ],
  },

  // ===================================================================================
  // THIRD WAVE — the structures the run's new memory makes possible.
  // ===================================================================================

  // --- DEFERRED PAYOFF: the first reward that is a reason to route somewhere ----------
  {
    id: 'ossuary-bank',
    title: 'The Ossuary Bank',
    icon: '🏦',
    body: 'A clerk sits behind a grille built into a wall of stacked bones. "We do not hold coin here. We hold the promise of it. Come back when you next find yourself somewhere strange."',
    choices: [
      // Withdrawal is offered FIRST so a returning player sees their money before they
      // are asked to deposit more — the whole point of the chain is that coming back pays.
      {
        label: 'Withdraw your holdings', requires: { bankAtLeast: 1 },
        outcome: { kind: 'withdraw' }, result: 'The clerk counts it out without once looking up.',
      },
      {
        label: 'Deposit 60', cost: 60, requires: { bankAtLeast: 0 },
        outcome: { kind: 'deposit', payout: 150 }, result: 'A bone token, notched twice. "One hundred and fifty, whenever you like."',
      },
      {
        label: 'Deposit 140', cost: 140,
        outcome: { kind: 'deposit', payout: 380 }, result: 'Three notches. The clerk finally looks up.',
      },
      {
        label: 'Deposit 220', cost: 220,
        // The top tier hands over something on the spot, on top of what it banks — a
        // bigger deposit is a better RATE, not just a bigger number, and a bonus relic
        // is the one thing a bank could offer that a bigger coin figure alone couldn't.
        outcome: { kind: 'multi', outcomes: [
          { kind: 'deposit', payout: 640 },
          { kind: 'relic', bands: ['common', 'rare'] },
        ] },
        result: 'Four notches, and a small token slides across the counter besides. "For the trouble of trusting us."',
      },
      { label: 'Bank nothing', outcome: { kind: 'nothing' }, result: 'You prefer your coin where you can see it.' },
    ],
  },

  // --- A CHAIN: the Tinker, in three parts. Each visit is a better offer and a heavier
  // debt; the last one is the only way out of the ballast he has been handing you.
  {
    id: 'tinker-1',
    title: 'The Tinker',
    icon: '🔧',
    body: 'A small man surrounded by more luggage than one person could possibly carry. "Take something! Take two things! I only ask that you carry a little of the weight."',
    choices: [
      {
        label: 'Take a relic, and the ballast',
        outcome: { kind: 'multi', outcomes: [{ kind: 'relic', bands: ['rare'] }, { kind: 'curse', cardId: JUNK, count: 1 }, { kind: 'flag', flag: 'tinker' }] },
        result: 'He beams, and hands you something heavy you did not agree to.',
      },
      {
        label: 'Take coins instead',
        outcome: { kind: 'multi', outcomes: [{ kind: 'coins', amount: 90 }, { kind: 'flag', flag: 'tinker' }] },
        result: '"Coin! Everyone wants coin." He remembers your face.',
      },
      { label: 'Help him with nothing', outcome: { kind: 'nothing' }, result: 'He is still repacking when you lose sight of him.' },
    ],
  },
  {
    id: 'tinker-2',
    title: 'The Tinker, Again',
    icon: '🔩',
    requiresFlag: 'tinker',
    body: 'The same luggage, a different road. "You! You carried some. Carry a little more and I will make it worth the both of us."',
    choices: [
      {
        label: 'Carry two more, take a boss relic',
        outcome: { kind: 'multi', outcomes: [{ kind: 'relic', bands: ['rare', 'boss'] }, { kind: 'curse', cardId: JUNK, count: 2 }, { kind: 'flag', flag: 'tinker2' }] },
        result: 'The pack settles. So does the debt.',
      },
      {
        label: 'Hand it all back', requires: { cardsOwned: { cardId: JUNK, count: 1 } },
        outcome: { kind: 'multi', outcomes: [{ kind: 'purge', cardId: JUNK }, { kind: 'coins', amount: 60 }] },
        result: 'He takes back every scrap, and pays you for the trouble.',
      },
      { label: 'Pretend not to know him', outcome: { kind: 'nothing' }, result: 'He watches you go, entirely unoffended.' },
    ],
  },
  {
    id: 'tinker-3',
    title: "The Tinker's Reckoning",
    icon: '⚙',
    requiresFlag: 'tinker2',
    body: 'He has unpacked everything. Laid out on the road is exactly as much as you have been carrying for him. "Settle up. Your choice which way."',
    choices: [
      {
        label: 'Give back everything he gave you', requires: { cardsOwned: { cardId: JUNK, count: 1 } },
        outcome: { kind: 'multi', outcomes: [{ kind: 'purge', cardId: JUNK }, { kind: 'relic', bands: ['boss'] }] },
        result: 'The ballast goes back into the luggage. Something better comes out.',
      },
      {
        label: 'Keep the lot — take payment',
        outcome: { kind: 'multi', outcomes: [{ kind: 'coins', amount: 220 }, { kind: 'temper', count: 2, attack: 1, hp: 2 }] },
        result: 'He pays generously for the privilege of never seeing his things again.',
      },
    ],
  },

  // --- RELIC-AWARE: the first events that read what is already in your tray -----------
  {
    id: 'the-fence',
    title: 'The Fence',
    icon: '🕯',
    body: 'No stall, no sign, no goods on display. "I am not selling. I am buying — and occasionally I trade up."',
    choices: [
      {
        label: 'Sell him a relic', requires: { relicsAtLeast: 2 },
        outcome: { kind: 'sellRelic', coins: 200 }, result: 'He does not haggle. He simply pays, and it is gone.',
      },
      {
        label: 'Trade a relic upward', requires: { relicsAtLeast: 2 }, cost: 80,
        outcome: { kind: 'tradeRelic', bands: ['rare', 'boss'] }, result: 'One goes into the coat. Something heavier comes out of it.',
      },
      { label: 'Nothing to sell', outcome: { kind: 'coins', amount: 25 }, result: '"Then take this and remember where I stand."' },
    ],
  },
  {
    id: 'the-culling',
    title: 'The Culling Yard',
    icon: '🔥',
    body: 'A pit of embers, and a keeper who deals only in subtraction. "Everything you carry slows you. Give me the parts you never use."',
    choices: [
      {
        label: 'Burn three cards', requiresDeck: 9,
        outcome: { kind: 'trimDeck', count: 3 }, result: 'Three go into the pit. Your pack is noticeably lighter.',
      },
      {
        label: 'Burn one, temper another', requiresDeck: 7,
        outcome: { kind: 'multi', outcomes: [{ kind: 'trimDeck', count: 1 }, { kind: 'temper', count: 1, attack: 2, hp: 2 }] },
        result: 'One burns. One comes out of the ash improved.',
      },
      { label: 'Keep everything', outcome: { kind: 'coins', amount: 30 }, result: '"Then you will carry it. Here — for the weight."' },
    ],
  },

  // --- PRESS-YOUR-LUCK: an escalating ladder you choose when to step off ---------------
  // The ladder is expressed as nested gambles rather than a multi-step phase: each rung
  // is a strictly worse bet than the one before, so stepping off is always defensible and
  // the decision is real at every level.
  {
    id: 'gilded-ladder',
    title: 'The Gilded Ladder',
    icon: '🪜',
    body: 'A staircase of stacked coin, going up further than the light does. A voice from somewhere near the top: "Every step doubles. Every step is likelier to fall."',
    choices: [
      { label: 'One step (certain)', cost: 60, outcome: { kind: 'coins', amount: 120 }, result: 'The first step holds, as promised.' },
      { label: 'Two steps (even odds)', cost: 60, outcome: { kind: 'gamble', p: 0.5, win: { kind: 'coins', amount: 300 }, lose: { kind: 'nothing' } }, result: 'You climb to the second step…' },
      {
        label: 'To the top (one in four)', cost: 60,
        outcome: { kind: 'gamble', p: 0.25, win: { kind: 'multi', outcomes: [{ kind: 'coins', amount: 400 }, { kind: 'relic', bands: ['rare', 'boss'] }] }, lose: { kind: 'heal', amount: -12 } },
        result: 'You keep climbing…',
      },
      { label: 'Stay on the ground', outcome: { kind: 'nothing' }, result: 'The voice does not try to persuade you.' },
    ],
  },

  // --- GATED ON THE RUN YOU ARE ACTUALLY HAVING ----------------------------------------
  {
    id: 'the-vigil',
    title: 'The Vigil',
    icon: '🕊',
    body: 'A shrine tended by nobody, with a bowl of clean water and a folded blanket left out for whoever needs them more.',
    choices: [
      {
        label: 'Rest here a while', outcome: { kind: 'heal', amount: 22 },
        result: 'You sleep without meaning to, and wake better.',
      },
      {
        label: 'Leave the blanket for the next traveller',
        outcome: { kind: 'multi', outcomes: [{ kind: 'maxHp', amount: 6 }, { kind: 'coins', amount: 40 }] },
        result: 'Something about the choice settles in you and stays.',
      },
      {
        label: 'Take everything not nailed down',
        outcome: { kind: 'multi', outcomes: [{ kind: 'coins', amount: 130 }, { kind: 'curse', cardId: JUNK, count: 1 }] },
        result: 'You leave with more than you came with, and it does not sit well.',
      },
    ],
  },
  {
    id: 'the-understudy',
    title: 'The Understudy',
    icon: '🎭',
    body: 'Someone is wearing your colours badly, in front of a crowd that has not noticed. They freeze when they see you.',
    choices: [
      {
        label: 'Let them keep the part',
        outcome: { kind: 'multi', outcomes: [{ kind: 'coins', amount: 80 }, { kind: 'temper', count: 1, attack: 1, hp: 1 }] },
        result: 'They pay you in coin and in something they had been saving.',
      },
      { label: 'Take the stage yourself', outcome: { kind: 'combat', twistId: 'war-drums' }, result: 'The crowd does not know it is real until it is.' },
      {
        label: 'Demand the costume', hpCost: 4,
        outcome: { kind: 'relic', bands: ['common', 'rare'] }, result: 'It comes off them harder than it should.',
      },
    ],
  },
];

const BY_ID = new Map(EVENTS.map((e) => [e.id, e]));
export const eventById = (id: string): AdventureEvent | undefined => BY_ID.get(id);

/** Deterministic event pick for a node, from its seed (no chain gating — tests/fixtures). */
export const eventForNode = (seed: number): AdventureEvent => EVENTS[Math.abs(seed) % EVENTS.length]!;

/**
 * Pick an event for a node, PREFERRING ones this run has not shown yet and skipping any
 * whose chain has not been opened.
 *
 * `eventForNode` is a bare `seed % EVENTS.length`, so within a single run the same handful
 * recurred however many events were authored — the pool size never actually mattered.
 * Choosing from the unseen set first makes new content visible.
 *
 * `flags` gates the later parts of a chain: `tinker-2` is unreachable until `tinker-1` has
 * set its flag, so meeting "The Tinker, Again" always means you met the Tinker. The
 * gating is applied BEFORE the unseen filter, so an unopened chain part never crowds out
 * a genuinely available event.
 *
 * The result is stored on the node (`MapNode.eventId`) the moment it is entered, NOT
 * recomputed per render: `seen` and `flags` both grow as the run goes, so a live lookup
 * could show one event and resolve a different one.
 */
export const pickEvent = (seed: number, seen: readonly string[], flags: readonly string[] = []): AdventureEvent => {
  const available = EVENTS.filter((e) => !e.requiresFlag || flags.includes(e.requiresFlag));
  // A run whose only unlocked events are all seen still has to be given something.
  const pool = available.length > 0 ? available : EVENTS;
  const unseen = pool.filter((e) => !seen.includes(e.id));
  const from = unseen.length > 0 ? unseen : pool;
  return from[Math.abs(seed) % from.length]!;
};
