/**
 * Deck surgery probe — can a spell-heavy deck be rescued by DECK EDITS alone?
 *
 * correlation(spell count, win rate) = -0.57. Two explanations fit: spells are mispriced by the
 * formula (a primitive problem), or these particular lists just hold too many spells (a deck
 * problem). This distinguishes them: swap N spell copies for efficient units of similar cost
 * and re-measure the field win rate, changing NO card definitions at all.
 *
 * A big gain means the lists are the problem and can be fixed by editing them; little gain
 * means the spells themselves are underpowered for their price and the formula has to change.
 *
 * NOTE: deck-list edits do not propagate to player-built custom decks, so they are a weaker
 * fix than repricing. This is a diagnostic, not a recommendation.
 */
import { parseDeck, type Deck } from '@cards/schema';
import { buildRegistry } from '@cards/registry';
import { starterCards, starterDecks, starterLeaders } from '@cards/data/starter';
import { runField } from '@engine/sim';

const lookup = (id: string) => (starterCards as any[]).find((c) => c.id === id);
const registry = () => buildRegistry(starterCards as any[], starterLeaders as any[]);

/** Efficient vanilla-ish units available to swap in, by rough cost tier. */
const FILLER_BY_COST: Record<number, string[]> = {
  1: ['field-mouse', 'pebble-pup', 'river-minnow'],
  2: ['gravel-hound', 'briar-colt', 'reef-darter'],
  3: ['current-rider', 'oak-sentry'],
  4: ['granite-ox', 'mountain-bull'],
};

const pickReplacement = (cost: number, exclude: Set<string>): string | undefined => {
  for (const tier of [cost, cost - 1, cost + 1, cost - 2, cost + 2]) {
    for (const id of FILLER_BY_COST[tier] ?? []) if (!exclude.has(id)) return id;
  }
  return undefined;
};

export interface SurgeryResult { deck: string; swapped: number; before: number; after: number; delta: number; swaps: string[] }

/** Replace up to `maxSwap` spell copies (most expensive spells first) with efficient units. */
export const deckSurgery = (deckName: string, maxSwap = 8, gamesPer = 30): SurgeryResult => {
  const base = (starterDecks as any[]).find((d) => d.name === deckName) as Deck;
  const opponents = (starterDecks as any[]).filter((d) => d.name !== deckName).map((d) => ({ deck: d as Deck, name: d.name }));
  const reg = registry();

  const spells = base.cards
    .map((e) => ({ e, c: lookup(e.cardId) }))
    .filter((x) => x.c?.type === 'spell')
    .sort((a, b) => (b.c.cost.energy ?? 0) - (a.c.cost.energy ?? 0));

  const used = new Set(base.cards.map((e) => e.cardId));
  const swaps: string[] = [];
  let left = maxSwap;
  const next = base.cards.map((e) => ({ ...e }));
  for (const { e, c } of spells) {
    if (left <= 0) break;
    const rep = pickReplacement(c.cost.energy ?? 2, used);
    if (!rep) continue;
    const take = Math.min(e.count, left);
    const idx = next.findIndex((x) => x.cardId === e.cardId);
    if (idx < 0) continue;
    next[idx]!.count -= take;
    const exist = next.find((x) => x.cardId === rep);
    if (exist) exist.count += take; else next.push({ cardId: rep, count: take });
    used.add(rep);
    swaps.push(`${take}x ${e.cardId} -> ${rep}`);
    left -= take;
  }
  const variant = parseDeck({ name: `${deckName}*`, leaderId: base.leaderId, cards: next.filter((x) => x.count > 0) });

  const b = runField(reg, base, opponents, gamesPer, 1);
  const a = runField(reg, variant, opponents, gamesPer, 1);
  const rate = (r: any) => r.totalWins / r.totalGames;
  return { deck: deckName, swapped: maxSwap - left, before: rate(b), after: rate(a), delta: rate(a) - rate(b), swaps };
};
