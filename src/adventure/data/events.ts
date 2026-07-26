/**
 * Event definitions — the choose-your-outcome encounters on '?' map nodes.
 *
 * Each choice carries a pure, non-interactive `EventOutcome` the run reducer applies
 * (see run.ts `chooseEventOption`). Random selection is used wherever a card is
 * involved, so no mid-event targeting sub-step is needed. Events are picked by the
 * node's seed, so a reload can't reroll them.
 */
import type { RelicRarity } from '@adventure/data/relics';

export type EventOutcome =
  | { kind: 'coins'; amount: number } // + or −
  | { kind: 'relic'; bands: RelicRarity[] }
  | { kind: 'card'; cardId: string | 'random' }
  | { kind: 'sacrificeEnhance' } // destroy up to 2 random owned → heavily enhance 1 other
  | { kind: 'combat'; twistId?: string } // route into a fight via this node
  | { kind: 'nothing' };

export interface EventChoice {
  label: string;
  /** Coins spent to take this choice (also the affordability gate). */
  cost?: number;
  /** Requires the deck to have at least this many cards (for sacrifice choices). */
  requiresDeck?: number;
  outcome: EventOutcome;
  /** Short result line shown after choosing. */
  result: string;
}

export interface AdventureEvent {
  id: string;
  title: string;
  icon: string;
  body: string;
  choices: EventChoice[];
}

export const EVENTS: AdventureEvent[] = [
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
    body: 'A moss-covered shrine hums faintly. A coin slot glints beneath a carved charm.',
    choices: [
      { label: 'Offer 50 coins for a charm', cost: 50, outcome: { kind: 'relic', bands: ['common', 'rare'] }, result: 'The charm floats into your pack.' },
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
      { label: 'Stake 50 coins', cost: 50, outcome: { kind: 'coins', amount: 90 }, result: 'The cup lifts — a pile of coins!' },
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
      { label: 'Buy a charm (60)', cost: 60, outcome: { kind: 'relic', bands: ['common'] }, result: 'You trade coins for a charm.' },
      { label: 'Move along', outcome: { kind: 'nothing' }, result: 'The merchant shrugs and packs up.' },
    ],
  },
  {
    id: 'cursed-hoard',
    title: 'The Cursed Hoard',
    icon: '💀',
    body: 'A glittering pile of coins sits beneath a cracked idol. Something about it feels wrong.',
    choices: [
      { label: 'Grab the coins', outcome: { kind: 'coins', amount: 80 }, result: 'You scoop the hoard — the idol watches.' },
      { label: 'Take a charm instead', outcome: { kind: 'relic', bands: ['rare'] }, result: 'You pry a charm from the idol.' },
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
];

const BY_ID = new Map(EVENTS.map((e) => [e.id, e]));
export const eventById = (id: string): AdventureEvent | undefined => BY_ID.get(id);

/** Deterministic event pick for a node, from its seed. */
export const eventForNode = (seed: number): AdventureEvent => EVENTS[Math.abs(seed) % EVENTS.length]!;
