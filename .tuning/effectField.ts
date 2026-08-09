/**
 * Effect price probe — the same field-based A/B as `keywordField`, but for SPELLS.
 *
 * `effectCostBase` (damage, heal, draw, applyStatus, forget, expel, move, ...) prices every
 * spell in the game and has never been validated. Deck composition says it is wrong:
 * correlation(spell count, win rate) = -0.57, i.e. spell-heavy decks systematically lose.
 *
 * Method: take a real deck, swap a fixed number of copies of ONE vanilla unit for a probe
 * spell carrying a single effect at its formula price, and compare field win rate against the
 * other twelve decks. Deliberately converts only a few copies, not the whole deck — the
 * whole-deck conversion is what made the keyword sweep over-read compounding keywords.
 */
import { parseCard, parseDeck, type Card, type Deck, type Effect } from '@cards/schema';
import { buildRegistry } from '@cards/registry';
import { starterCards, starterDecks, starterLeaders } from '@cards/data/starter';
import { recommendedEnergy, recommendedPips } from '@cards/budget';
import { runField } from '@engine/sim';

const lookup = (id: string) => (starterCards as any[]).find((c) => c.id === id);

export interface EffectProbe { label: string; cost: string; control: number; variant: number; delta: number; games: number }

/**
 * @param swapId   vanilla unit in the base deck whose copies get replaced
 * @param effects  the probe spell's effect list
 */
export const probeEffectField = (
  label: string, effects: Effect[], swapId = 'gravel-hound', baseName = 'Midrange', gamesPer = 30,
): EffectProbe => {
  const base = (starterDecks as any[]).find((d) => d.name === baseName) as Deck;
  const opponents = (starterDecks as any[]).filter((d) => d.name !== baseName).map((d) => ({ deck: d as Deck, name: d.name }));

  const draft: any = { id: 'probe-spell', name: 'Probe Spell', element: 'earth', tags: [], wip: false,
    type: 'spell', cost: { energy: 1 }, effects };
  const priced = parseCard(draft);
  const e = recommendedEnergy(priced, lookup), p = recommendedPips(priced, lookup);
  draft.cost = p > 0 ? { energy: e, elements: [{ type: 'earth', amount: p }] } : { energy: e };
  const probe: Card = parseCard(draft);

  const registry = buildRegistry([...(starterCards as any[]), probe], starterLeaders as any[]);
  const variantDeck = parseDeck({
    name: `${baseName}+fx`, leaderId: base.leaderId,
    cards: base.cards.map((x) => (x.cardId === swapId ? { ...x, cardId: 'probe-spell' } : x)),
  });

  const c = runField(registry, base, opponents, gamesPer, 1);
  const v = runField(registry, variantDeck, opponents, gamesPer, 1);
  const rate = (r: any) => r.totalWins / r.totalGames;
  return { label, cost: `${e}e+${p}p`, control: rate(c), variant: rate(v), delta: rate(v) - rate(c), games: c.totalGames };
};
