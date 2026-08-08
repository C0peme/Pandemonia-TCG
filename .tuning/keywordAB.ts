/**
 * Keyword price probe — a controlled A/B that the meta sim cannot do.
 *
 * The meta sim tells you which DECK is winning; it cannot tell you whether SNIPER is priced
 * correctly, because every deck differs in a hundred ways at once. This builds two decks that
 * are identical except for one variable: the control runs a vanilla body, the test runs the
 * same body carrying one keyword, each priced by the formula. Same leader, same everything.
 *
 * If the keyword's price is right the match should land near 50%. Consistently above means the
 * keyword is UNDERPRICED (you get more than you pay for); below means OVERPRICED.
 */
import { parseCard, parseDeck, type Card, type Keywords } from '@cards/schema';
import { buildRegistry } from '@cards/registry';
import { starterLeaders } from '@cards/data/starter';
import { recommendedEnergy, recommendedPips } from '@cards/budget';
import { simulateGame } from '@engine/sim';

const BODY = { attack: 2, hp: 3 } as const;

/** A card priced by the formula for whatever keywords it carries. */
const makeCard = (id: string, keywords: Keywords): Card => {
  const draft: any = {
    id, name: id, element: 'earth', tags: [], wip: false, type: 'unit',
    cost: { energy: 1 }, attack: BODY.attack, hp: BODY.hp, keywords,
  };
  const probe = parseCard(draft);
  const e = recommendedEnergy(probe, () => undefined);
  const p = recommendedPips(probe, () => undefined);
  draft.cost = p > 0 ? { energy: e, elements: [{ type: 'earth', amount: p }] } : { energy: e };
  return parseCard(draft);
};

/** Filler so both decks have an identical, neutral remainder. 30-card decks, max 4 copies:
 *  4 of the probe card + 26 filler across a spread of vanilla bodies. */
const FILLERS: Card[] = [1, 2, 3, 4, 5, 6, 7].map((n) =>
  parseCard({ id: `ab-filler-${n}`, name: `Filler ${n}`, element: 'earth', tags: [], wip: false,
    type: 'unit', cost: { energy: n }, attack: n, hp: n + 1, keywords: {} }));
/** counts summing with 4 probe copies to exactly DECK_SIZE (30): 4 + 4+4+4+4+4+3+3 = 30 */
const FILLER_COUNTS = [4, 4, 4, 4, 4, 3, 3];

export interface KeywordResult { keyword: string; cost: string; winRate: number; games: number }

/**
 * Same A/B, but the test card is priced MANUALLY rather than by the formula. Sweeping the
 * price and finding where the win rate crosses 50% gives the keyword's FAIR cost empirically,
 * which is what the budget table should have charged all along.
 */
export const probeAtCost = (keywords: Keywords, energy: number, pips: number, games = 120): number => {
  const control = makeCard('ab-control', {});
  const draft: any = { id: 'ab-test', name: 'ab-test', element: 'earth', tags: [], wip: false,
    type: 'unit', attack: BODY.attack, hp: BODY.hp, keywords,
    cost: pips > 0 ? { energy, elements: [{ type: 'earth', amount: pips }] } : { energy } };
  const test = parseCard(draft);
  const leader = (starterLeaders as any[]).find((l) => l.id === 'cleath');
  const registry = buildRegistry([control, test, ...FILLERS], [leader]);
  const list = (id: string) => parseDeck({ name: id, leaderId: 'cleath', cards: [
    { cardId: id, count: 4 },
    ...FILLERS.map((f, i) => ({ cardId: f.id, count: FILLER_COUNTS[i]! })),
  ] });
  let wins = 0;
  for (let i = 0; i < games; i++) {
    const swap = i % 2 === 1;
    const decks: [any, any] = swap ? [list('ab-control'), list('ab-test')] : [list('ab-test'), list('ab-control')];
    const w = simulateGame(registry, decks, i + 1).winner;
    if ((w === 0 && !swap) || (w === 1 && swap)) wins++;
  }
  return wins / games;
};

export const probeKeyword = (label: string, keywords: Keywords, games = 120): KeywordResult => {
  const control = makeCard('ab-control', {});
  const test = makeCard('ab-test', keywords);
  const cards = [control, test, ...FILLERS];
  const leader = (starterLeaders as any[]).find((l) => l.id === 'cleath');
  const registry = buildRegistry(cards, [leader]);
  const list = (id: string) => parseDeck({ name: id, leaderId: 'cleath', cards: [
    { cardId: id, count: 4 },
    ...FILLERS.map((f, i) => ({ cardId: f.id, count: FILLER_COUNTS[i]! })),
  ] });
  let wins = 0;
  for (let i = 0; i < games; i++) {
    // Alternate seats so first-player advantage cancels out.
    const swap = i % 2 === 1;
    const decks: [any, any] = swap ? [list('ab-control'), list('ab-test')] : [list('ab-test'), list('ab-control')];
    const w = simulateGame(registry, decks, i + 1).winner;
    if ((w === 0 && !swap) || (w === 1 && swap)) wins++;
  }
  const p = recommendedPips(test, () => undefined);
  return { keyword: label, cost: `${recommendedEnergy(test, () => undefined)}e+${p}p`, winRate: wins / games, games };
};
