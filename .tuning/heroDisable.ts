/**
 * Hero-power CONTRIBUTION probe (Phase 1).
 *
 * The disparity table prices powers with the card formula, which has never been validated on
 * leaders — so a zero correlation there is ambiguous: either powers do not sort the meta, or
 * the formula misprices them. This probe settles it WITHOUT the formula.
 *
 * Method: make one leader's power unaffordable (cost +99) and measure that deck's field win
 * rate against the other twelve. The drop is the power's real contribution in budget-free
 * terms. Also reports activations per game, since a power's contribution is
 * value x how often it actually gets cast — the term the formula cannot see.
 */
import { parseDeck, type Deck } from '@cards/schema';
import { buildRegistry } from '@cards/registry';
import { starterCards, starterDecks, starterLeaders } from '@cards/data/starter';
import { runField } from '@engine/sim';

export interface HeroDisableRow {
  leader: string; deck: string; power: string;
  control: number; disabled: number; delta: number;
  actsPerGame: number; games: number;
}

export const probeHeroDisable = (leaderId: string, gamesPer = 16, usePlan = false): HeroDisableRow => {
  const leader = (starterLeaders as any[]).find((l) => l.id === leaderId);
  const base = (starterDecks as any[]).find((d) => d.leaderId === leaderId) as Deck;
  const opponents = (starterDecks as any[])
    .filter((d) => d.leaderId !== leaderId)
    .map((d) => ({ deck: d as Deck, name: d.name }));

  const registry = buildRegistry(starterCards as any[], starterLeaders as any[]);

  // Same leader id, power priced out of reach — so the deck, curve and caps are untouched
  // and the ONLY difference between the two runs is whether the power can be cast.
  const offLeader = {
    ...leader,
    heroPower: { ...leader.heroPower, cost: { ...leader.heroPower.cost, energy: 99 } },
  };
  const offRegistry = buildRegistry(
    starterCards as any[],
    (starterLeaders as any[]).map((l) => (l.id === leaderId ? offLeader : l)),
  );

  const deck = parseDeck({ name: base.name, leaderId: base.leaderId, cards: base.cards });
  const c = runField(registry, deck, opponents, gamesPer, 1, usePlan);
  const v = runField(offRegistry, deck, opponents, gamesPer, 1, usePlan);
  const rate = (r: any) => (r.totalWins / r.totalGames) * 100;
  return {
    leader: leader.name, deck: base.name, power: leader.heroPower.name,
    control: rate(c), disabled: rate(v), delta: rate(v) - rate(c),
    actsPerGame: c.heroPowers / c.totalGames,
    games: c.totalGames,
  };
};
