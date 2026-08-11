/** Price candidate Control cards through the real formula (no guessing). */
import { parseCard } from '@cards/schema';
import { starterCards } from '@cards/data/starter';
import { cardBudgetValue, recommendedEnergy, recommendedPips } from '@cards/budget';

const lookup = (id: string) => (starterCards as any[]).find((c) => c.id === id);

export const price = (draft: any) => {
  const base = { tags: [], wip: false, cost: { energy: 1 }, ...draft };
  const card = parseCard(base);
  const e = recommendedEnergy(card, lookup);
  const p = recommendedPips(card, lookup);
  return { id: draft.id, value: cardBudgetValue(card, lookup), energy: e, pips: p,
    cost: p > 0 ? `${e}e + ${p}${draft.element[0].toUpperCase()}` : `${e}e` };
};
