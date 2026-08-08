/**
 * Keyword price probe, v2 — measures a keyword's MARGINAL value against the real field.
 *
 * v1 pitted a keyworded deck against a mirror of pure vanilla bodies. That environment has no
 * removal, no fliers, no answers of any kind, so evasion and protection keywords were simply
 * unanswerable there: raising True Shield's price from 5e to 10e still left it winning 60%.
 * The search saturated because price was never the binding constraint — the vacuum was.
 *
 * v2 fixes the environment. It takes a REAL starter deck, converts its vanilla bodies to carry
 * one keyword (repriced by the formula), and measures the field win rate against all twelve
 * other starter decks — which do have removal, taunts, fliers and AOE. The delta between the
 * control deck's field rate and the variant's is the keyword's marginal worth AT ITS CURRENT
 * PRICE. Near zero means correctly priced; positive means underpriced.
 */
import { parseCard, parseDeck, type Card, type Deck, type Keywords } from '@cards/schema';
import { buildRegistry } from '@cards/registry';
import { starterCards, starterDecks, starterLeaders } from '@cards/data/starter';
import { recommendedEnergy, recommendedPips } from '@cards/budget';
import { runField } from '@engine/sim';

const lookup = (id: string) => (starterCards as any[]).find((c) => c.id === id);

/** Vanilla units in a deck — no keywords at all, so adding one is a clean single variable. */
export const vanillaUnitsIn = (deck: Deck): string[] => {
  const out: string[] = [];
  for (const e of deck.cards) {
    const c: any = lookup(e.cardId);
    if (c?.type === 'unit' && Object.keys(c.keywords ?? {}).length === 0) out.push(c.id);
  }
  return [...new Set(out)];
};

export interface FieldProbe { label: string; control: number; variant: number; delta: number; games: number; repriced: string[] }

/**
 * Convert every vanilla unit in `baseName` to carry `keywords`, repriced by the formula, then
 * compare field win rates. `gamesPer` is per opponent (12 opponents).
 */
export const probeKeywordField = (label: string, keywords: Keywords, baseName = 'Midrange', gamesPer = 24): FieldProbe => {
  const base = (starterDecks as any[]).find((d) => d.name === baseName) as Deck;
  const opponents = (starterDecks as any[]).filter((d) => d.name !== baseName).map((d) => ({ deck: d as Deck, name: d.name }));
  const targets = vanillaUnitsIn(base);

  const variants: Card[] = [];
  for (const id of targets) {
    const src: any = lookup(id);
    const draft: any = { ...structuredClone(src), id: `${id}--kw`, keywords: { ...keywords } };
    const probe = parseCard({ ...draft, cost: { energy: 1 } });
    const e = recommendedEnergy(probe, lookup), p = recommendedPips(probe, lookup);
    draft.cost = p > 0 ? { energy: e, elements: [{ type: src.element, amount: p }] } : { energy: e };
    variants.push(parseCard(draft));
  }
  const registry = buildRegistry([...(starterCards as any[]), ...variants], starterLeaders as any[]);
  const variantDeck = parseDeck({
    name: `${baseName}+kw`, leaderId: base.leaderId,
    cards: base.cards.map((e) => targets.includes(e.cardId) ? { ...e, cardId: `${e.cardId}--kw` } : e),
  });

  const c = runField(registry, base, opponents, gamesPer, 1);
  const v = runField(registry, variantDeck, opponents, gamesPer, 1);
  const rate = (r: any) => r.totalWins / r.totalGames;
  return { label, control: rate(c), variant: rate(v), delta: rate(v) - rate(c), games: c.totalGames,
    repriced: variants.map((x) => `${x.id.replace('--kw','')} ${x.cost.energy}e+${(x.cost.elements ?? []).reduce((s: number, q: any) => s + q.amount, 0)}p`) };
};
