/**
 * Game setup: build the initial GameState from two decks, shuffle, deal opening
 * hands, and begin the first player's turn.
 */
import { LANES, RULES, type LaneId } from '@engine/constants';
import type { Registry } from '@cards/registry';
import { expandDeck } from '@cards/registry';
import type { Deck } from '@cards/schema';
import { createRng, shuffle, type Rng } from '@engine/rng';
import { createUnitInstance } from '@engine/board';
import { beginTurn } from '@engine/turn';
import {
  emptyBank,
  type CardInstance,
  type GameState,
  type Lanes,
  type PlayerId,
  type PlayerState,
} from '@engine/types';

export interface SetupOptions {
  registry: Registry;
  decks: [Deck, Deck];
  seed?: number;
  first?: PlayerId;
}

const emptyLanes = (): Lanes =>
  LANES.reduce((acc, lane: LaneId) => {
    acc[lane] = {};
    return acc;
  }, {} as Lanes);

const buildPlayer = (
  id: PlayerId,
  deck: Deck,
  registry: Registry,
  rng: Rng,
  iidStart: number,
): { player: PlayerState; rng: Rng; nextIid: number } => {
  let iid = iidStart;
  const instances: CardInstance[] = expandDeck(deck).map((cardId) => ({
    iid: `c${iid++}`,
    cardId,
  }));
  const { rng: rng2, result: shuffled } = shuffle(rng, instances);
  const hand = shuffled.slice(0, RULES.STARTING_HAND);
  const library = shuffled.slice(RULES.STARTING_HAND);

  const leader = registry.leaders.get(deck.leaderId);
  if (!leader) throw new Error(`Deck references unknown leader: ${deck.leaderId}`);

  const lanes = emptyLanes();
  // Riku-style leaders manifest as a board unit at game start: its HP mirrors leaderHp
  // (set to the leader's starting HP) and its death ends the game.
  if (leader.leaderUnitCardId) {
    const card = registry.cards.get(leader.leaderUnitCardId);
    if (!card || card.type !== 'unit') {
      throw new Error(`Leader ${leader.id} references invalid leaderUnitCardId: ${leader.leaderUnitCardId}`);
    }
    const lu = createUnitInstance(card, { iid: `lu${iid++}`, cardId: card.id }, id, false);
    lu.isLeaderUnit = true;
    lu.hp = leader.hp;
    lu.maxHp = leader.hp;
    lu.justPlaced = false;
    lanes.ground1.front = lu;
  }

  return {
    player: {
      id,
      leaderId: leader.id,
      leaderHp: leader.hp,
      leaderMaxHp: leader.hp,
      signatureUnlocked: false,
      signatureCardId: leader.signatureCardId,
      signaturePending: false,
      signatureGranted: false,
      energy: 0,
      bank: emptyBank(),
      elementCaps: { ...leader.elementCaps },
      hand,
      deck: library,
      discard: [],
      lanes,
      heroPowerUsed: false,
      costMods: { unit: 0, spell: 0, foundation: 0, environment: 0 },
    },
    rng: rng2,
    nextIid: iid,
  };
};

export const initGame = (opts: SetupOptions): GameState => {
  const first = opts.first ?? 0;
  let rng = createRng(opts.seed ?? 1);

  const p0 = buildPlayer(0, opts.decks[0], opts.registry, rng, 0);
  rng = p0.rng;
  const p1 = buildPlayer(1, opts.decks[1], opts.registry, rng, p0.nextIid);
  rng = p1.rng;

  const base: GameState = {
    rng,
    round: 1,
    turn: 0,
    active: first,
    first,
    players: { 0: p0.player, 1: p1.player },
    phase: 'main',
    winner: null,
    environments: {},
    iidSeq: p1.nextIid,
  };

  // Begin the first player's turn (sets energy, draws). Events are discarded here;
  // callers that want them should call beginTurn themselves.
  return beginTurn(base, first).state;
};
