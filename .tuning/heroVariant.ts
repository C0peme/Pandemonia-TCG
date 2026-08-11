/**
 * Hero-power VARIANT probe: measure one deck's field win rate under alternative versions of
 * its leader's power, all through the same harness so the numbers are directly comparable.
 *
 * The disable probe answers "does this power matter"; this answers "how much does THIS nerf
 * cost the deck". Deck, curve and caps are untouched — the only difference between runs is
 * the power itself.
 */
import { parseDeck, type Deck } from '@cards/schema';
import { buildRegistry } from '@cards/registry';
import { starterCards, starterDecks, starterLeaders } from '@cards/data/starter';
import { runField } from '@engine/sim';

export interface Variant { label: string; power: (hp: any) => any }
export interface VariantRow { label: string; winRate: number; actsPerGame: number; games: number }

export const probeHeroVariants = (
  leaderId: string, variants: Variant[], gamesPer = 16, usePlan = false,
): VariantRow[] => {
  const base = (starterDecks as any[]).find((d) => d.leaderId === leaderId) as Deck;
  const opponents = (starterDecks as any[])
    .filter((d) => d.leaderId !== leaderId)
    .map((d) => ({ deck: d as Deck, name: d.name }));
  const deck = parseDeck({ name: base.name, leaderId: base.leaderId, cards: base.cards });

  return variants.map((v) => {
    const leaders = (starterLeaders as any[]).map((l) =>
      l.id === leaderId ? { ...l, heroPower: v.power(l.heroPower) } : l);
    const registry = buildRegistry(starterCards as any[], leaders);
    const r = runField(registry, deck, opponents, gamesPer, 1, usePlan);
    return {
      label: v.label,
      winRate: (r.totalWins / r.totalGames) * 100,
      actsPerGame: r.heroPowers / r.totalGames,
      games: r.totalGames,
    };
  });
};
