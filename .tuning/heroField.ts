/**
 * Hero-power disparity table (Phase 1 — measurement only, nothing repriced).
 *
 * Leaders have never been run through the cost formula. This prints, for every leader:
 * the value one activation delivers, what it costs, and the ratio between them — then
 * correlates that ratio against the measured field win rate of the deck built around it.
 *
 * A strong correlation means hero powers, not cards, are what sort the meta.
 */
import { starterCards, starterLeaders, starterDecks } from '@cards/data/starter';
import { heroPowerValue, heroPowerCost, heroPowerRatio } from '@cards/budget';

const lookup = (id: string) => (starterCards as any[]).find((c) => c.id === id);

/** Measured field win rates, IT7 (see .tuning/LOG.md). Reference column, not re-simulated. */
export const IT7_WINRATE: Record<string, number> = {
  Combo: 64, Ramp: 60, 'Lane Control': 57, Stall: 56, Snowball: 54, Attrition: 53,
  Swarm: 51, Guardian: 50, Aggro: 49, DoT: 47, Control: 42, Midrange: 41, 'Deck Out': 26,
};

export interface HeroRow {
  leader: string; deck: string; power: string;
  cost: number; value: number; ratio: number; winRate: number;
}

export const heroTable = (): HeroRow[] => {
  const deckFor = (leaderId: string) =>
    (starterDecks as any[]).find((d) => d.leaderId === leaderId);
  return (starterLeaders as any[])
    .map((l) => {
      const deck = deckFor(l.id);
      return {
        leader: l.name,
        deck: deck?.name ?? '—',
        power: l.heroPower.name,
        cost: heroPowerCost(l),
        value: heroPowerValue(l, lookup),
        ratio: heroPowerRatio(l, lookup),
        winRate: IT7_WINRATE[deck?.name] ?? NaN,
      };
    })
    .sort((a, b) => b.ratio - a.ratio);
};

/** Pearson correlation, ignoring rows with a missing win rate. */
export const correlate = (rows: HeroRow[], key: 'ratio' | 'value'): number => {
  const pts = rows.filter((r) => !Number.isNaN(r.winRate));
  const n = pts.length;
  const mx = pts.reduce((s, r) => s + r[key], 0) / n;
  const my = pts.reduce((s, r) => s + r.winRate, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (const r of pts) {
    const a = r[key] - mx, b = r.winRate - my;
    num += a * b; dx += a * a; dy += b * b;
  }
  return num / Math.sqrt(dx * dy);
};
