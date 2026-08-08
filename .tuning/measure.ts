// Shared measurement helper for the overnight tuning loop.
import { starterCards } from '@cards/data/starter';
import { cardBudgetValue } from '@cards/budget';
export const lookup = (id: string) => starterCards.find((c: any) => c.id === id) as any;
export const realCards = () => (starterCards as any[]).filter((c) => {
  const t: string[] = c.tags ?? []; return !t.includes('token') && !t.includes('signature');
});
export const poolBudget = () => realCards().reduce((s, c) =>
  s + c.cost.energy + 0.5 * (c.cost.elements ?? []).reduce((a: number, x: any) => a + x.amount, 0), 0);
export const poolValue = () => realCards().reduce((s, c) => s + cardBudgetValue(c, lookup), 0);
