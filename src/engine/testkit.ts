/**
 * Test fixtures and builders. Not shipped in the game; used only by engine tests to
 * construct precise registries, decks, board states, and units.
 */
import { buildRegistry, expandKeywordEffects, type Registry } from '@cards/registry';
import { parseCard, parseDeck, parseLeader, type Card, type Deck, type Effect, type Keywords, type OnHit } from '@cards/schema';
import { LANES, RULES, type Element, type LaneId } from '@engine/constants';
import { createRng } from '@engine/rng';
import {
  emptyBank,
  type GameState,
  type Lanes,
  type PlayerId,
  type PlayerState,
  type StatusState,
  type UnitInstance,
} from '@engine/types';

const leader = parseLeader({
  id: 'pyra',
  name: 'Pyra',
  element: 'fire',
  heroPower: { name: 'Spark', cost: { energy: 1 }, effects: [{ kind: 'damage', amount: 1 }] },
  signatureCardId: 'v0',
});

/** A pool of simple, cheap cards plus a few keyworded ones, enough to build decks. */
const cardDefs: Card[] = [
  ...Array.from({ length: 10 }, (_, i) =>
    parseCard({
      id: `v${i}`,
      name: `Vanilla ${i}`,
      type: 'unit',
      element: 'fire',
      cost: { energy: 1 },
      attack: 1 + (i % 3),
      hp: 1 + (i % 3),
    }),
  ),
  parseCard({
    id: 'eel',
    name: 'Eel',
    type: 'unit',
    element: 'water',
    cost: { energy: 1 },
    attack: 2,
    hp: 2,
    keywords: { aquatic: true },
  }),
  parseCard({
    id: 'finny', // aquatic with a Water bonus
    name: 'Finny',
    type: 'unit',
    element: 'water',
    cost: { energy: 1 },
    attack: 2,
    hp: 2,
    keywords: { aquatic: [{ kind: 'buff', stat: { attack: 2 }, target: 'self' }] },
  }),
  parseCard({
    id: 'skyfin', // aquatic + airborne: Airborne cancels the Water-entry effects
    name: 'Skyfin',
    type: 'unit',
    element: 'water',
    cost: { energy: 1 },
    attack: 2,
    hp: 2,
    keywords: { aquatic: [{ kind: 'buff', stat: { attack: 2 }, target: 'self' }], airborne: true },
  }),
  parseCard({
    id: 'twins',
    name: 'Twins',
    type: 'unit',
    element: 'fire',
    cost: { energy: 2 },
    attack: 2,
    hp: 2,
    keywords: { doubleTeam: true },
  }),
  parseCard({
    id: 'titan',
    name: 'Titan',
    type: 'unit',
    element: 'fire',
    cost: { energy: 5, elements: [{ type: 'fire', amount: 2 }] },
    attack: 6,
    hp: 6,
  }),
  parseCard({
    id: 'firebolt',
    name: 'Firebolt',
    type: 'spell',
    element: 'fire',
    cost: { energy: 1 },
    effects: [{ kind: 'damage', amount: 3, target: 'enemy' }],
  }),
  parseCard({
    id: 'mend',
    name: 'Mend',
    type: 'spell',
    element: 'nature',
    cost: { energy: 1 },
    effects: [{ kind: 'heal', amount: 3, target: 'ally' }],
  }),
  parseCard({
    id: 'lull', // mirrors Hypnotic Patterns: sleep any unit (disables an attacker for a turn)
    name: 'Lull',
    type: 'spell',
    element: 'water',
    cost: { energy: 2 },
    effects: [{ kind: 'applyStatus', amount: 2, target: 'any', status: 'sleep' }],
  }),
  parseCard({
    id: 'rally',
    name: 'Rally',
    type: 'spell',
    element: 'earth',
    cost: { energy: 1 },
    effects: [{ kind: 'buff', stat: { attack: 1, hp: 1 }, target: 'ally' }],
  }),
  parseCard({
    id: 'scorched-field',
    name: 'Scorched Field',
    type: 'environment',
    element: 'fire',
    cost: { energy: 2 },
    lanes: ['ground'],
    effects: [{ kind: 'applyStatus', status: 'burn', amount: 1, target: 'any' }],
  }),
  parseCard({
    id: 'overshot-field',
    name: 'Overshot Field',
    type: 'environment',
    element: 'fire',
    cost: { energy: 2 },
    lanes: ['ground'],
    effects: [{ kind: 'custom', note: 'All units gain Overshot' }],
    grantKeywords: { overshot: true },
  }),
  parseCard({
    id: 'shallow-field', // Water only: grants Aquatic, so non-swimmers stop drowning
    name: 'Shallow Field',
    type: 'environment',
    element: 'water',
    cost: { energy: 2 },
    lanes: ['water'],
    effects: [{ kind: 'custom', note: 'All units gain Aquatic' }],
    grantKeywords: { aquatic: true },
  }),
  parseCard({
    id: 'footing',
    name: 'Footing',
    type: 'foundation',
    element: 'earth',
    cost: { energy: 1 },
    hp: 3,
    grants: { stat: { hp: 3 }, keywords: { tough: 1 } },
  }),
  parseCard({
    id: 'reaper',
    name: 'Reaper',
    type: 'unit',
    element: 'fire',
    cost: { energy: 2 },
    attack: 2,
    hp: 2,
    keywords: { sacrifice: { max: 1, buff: { attack: 3, hp: 3 } } },
  }),
  parseCard({
    id: 'larva',
    name: 'Larva',
    type: 'unit',
    element: 'nature',
    cost: { energy: 1 },
    attack: 1,
    hp: 2,
    keywords: { metamorphosis: { everyTurns: 1, into: 'dragon' } },
  }),
  parseCard({ id: 'dragon', name: 'Dragon', type: 'unit', element: 'nature', cost: { energy: 5 }, attack: 5, hp: 5 }),
  parseCard({
    id: 'medic',
    name: 'Medic',
    type: 'unit',
    element: 'nature',
    cost: { energy: 2 },
    attack: 1,
    hp: 2,
    keywords: { healer: { amount: 2, target: 'leader', trigger: 'onPlay' } },
  }),
  parseCard({
    id: 'kiln', // Producer: banks 1 fire at end of each turn (fires during resolveEndOfTurn)
    name: 'Kiln',
    type: 'unit',
    element: 'fire',
    cost: { energy: 1 },
    attack: 0,
    hp: 3,
    keywords: { producer: { amount: 1, element: 'fire' } },
  }),
  parseCard({
    id: 'icebreaker',
    name: 'Icebreaker',
    type: 'unit',
    element: 'water',
    cost: { energy: 2 },
    attack: 1,
    hp: 2,
    onPlay: [{ kind: 'applyStatus', status: 'freeze', target: 'enemy' }],
  }),
  parseCard({
    id: 'sleeper',
    name: 'Sleeper',
    type: 'unit',
    element: 'water',
    cost: { energy: 2 },
    attack: 1,
    hp: 3,
    onPlay: [{ kind: 'applyStatus', status: 'sleep', amount: 1, target: 'self' }],
  }),
  parseCard({
    id: 'shover',
    name: 'Shover',
    type: 'unit',
    element: 'earth',
    cost: { energy: 1 },
    attack: 1,
    hp: 2,
    onPlay: [{ kind: 'move', target: 'enemy' }],
  }),
  parseCard({
    id: 'sniper-entry',
    name: 'Sniper Entry',
    type: 'unit',
    element: 'fire',
    cost: { energy: 2 },
    attack: 1,
    hp: 2,
    onPlay: [{ kind: 'damage', amount: 2, target: 'any' }],
  }),
];

export const testRegistry: Registry = buildRegistry(cardDefs, [leader]);

/** Build a legal deck from exactly 10 card ids, distributing DECK_SIZE copies evenly. */
export const makeDeck = (cardIds: string[], name = 'Test Deck'): Deck => {
  if (cardIds.length !== 10) throw new Error('makeDeck expects 10 distinct card ids');
  const counts = cardIds.map(() => 0);
  for (let i = 0; i < RULES.DECK_SIZE; i++) counts[i % cardIds.length]! += 1;
  return parseDeck({
    name,
    leaderId: 'pyra',
    cards: cardIds.map((cardId, i) => ({ cardId, count: counts[i]! })),
  });
};

export const tenVanilla = Array.from({ length: 10 }, (_, i) => `v${i}`);

const emptyLanes = (): Lanes =>
  LANES.reduce((acc, lane: LaneId) => {
    acc[lane] = {};
    return acc;
  }, {} as Lanes);

const blankPlayer = (id: PlayerId): PlayerState => ({
  id,
  leaderId: 'pyra',
  leaderHp: 30,
  signatureUnlocked: false,
  signatureCardId: 'v0',
  signaturePending: false,
  signatureGranted: false,
  energy: 0,
  bank: emptyBank(),
  elementCaps: { fire: 2, water: 2, nature: 2, earth: 2 },
  hand: [],
  deck: [],
  discard: [],
  lanes: emptyLanes(),
  heroPowerUsed: false,
  costMods: { unit: 0, spell: 0, foundation: 0, environment: 0 },
});

/** A board with no cards anywhere; tweak the returned state in tests. */
export const blankState = (overrides: Partial<GameState> = {}): GameState => ({
  rng: createRng(1),
  round: 1,
  turn: 0,
  active: 0,
  first: 0,
  players: { 0: blankPlayer(0), 1: blankPlayer(1) },
  phase: 'main',
  winner: null,
  environments: {},
  iidSeq: 0,
  ...overrides,
});

let iidCounter = 1000;
export const unit = (
  partial: {
    owner: PlayerId;
    attack?: number;
    hp?: number;
    cardId?: string;
    keywords?: Keywords;
    status?: StatusState;
    onHit?: OnHit;
    shield?: number;
  },
): UnitInstance => {
  const hp = partial.hp ?? 2;
  // Mirror registry expansion so fixtures match real in-play units: the effect-keywords
  // (healer/producer/mover/expel/debuff) become trigger effects, never live keywords.
  const expanded = expandKeywordEffects({ type: 'unit', keywords: partial.keywords ?? {} } as unknown as Card);
  const keywords = expanded.type === 'unit' ? expanded.keywords : partial.keywords ?? {};
  const triggers = (expanded.type === 'unit' ? expanded : {}) as {
    onAttack?: Effect[];
    endOfTurn?: Effect[];
    startOfTurn?: Effect[];
  };
  const nonEmpty = (e?: Effect[]): Effect[] | undefined => (e && e.length ? e : undefined);
  return {
    iid: `u${iidCounter++}`,
    cardId: partial.cardId ?? 'v0',
    owner: partial.owner,
    attack: partial.attack ?? 2,
    hp,
    maxHp: hp,
    keywords,
    onHit: partial.onHit,
    onAttack: nonEmpty(triggers.onAttack),
    endOfTurn: nonEmpty(triggers.endOfTurn),
    startOfTurn: nonEmpty(triggers.startOfTurn),
    status: partial.status ?? {},
    shield: partial.shield ?? keywords.shield,
    turnsInPlay: 0,
    justPlaced: false,
  };
};

/** A standalone Foundation as a full UnitInstance (flagged isFoundation), for board fixtures.
 *  Mirrors what the engine's `makeFoundationUnit` produces from a played Foundation card. */
export const foundationUnit = (
  partial: Parameters<typeof unit>[0] & { justPlaced?: boolean },
): UnitInstance => ({
  ...unit(partial),
  attack: partial.attack ?? 0,
  isFoundation: true,
  justPlaced: partial.justPlaced ?? false,
});

export const place = (
  state: GameState,
  player: PlayerId,
  lane: LaneId,
  u: UnitInstance,
  slot: 'front' | 'back' | 'foundation' = 'front',
): void => {
  const field = slot === 'foundation' ? 'standaloneFoundation' : slot;
  state.players[player].lanes[lane][field] = u;
};

export const ELEMENTS_LIST: Element[] = ['fire', 'water', 'nature', 'earth'];
