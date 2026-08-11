import { it } from 'vitest';
import { buildRegistry } from '@cards/registry';
import { starterCards, starterDecks, starterLeaders } from '@cards/data/starter';
import { runField } from '@engine/sim';
import { heroPowerValue } from '@cards/budget';
import type { Deck } from '@cards/schema';

const lookup = (id: string) => (starterCards as any[]).find((c) => c.id === id);

/**
 * Activations per game — the term the cost formula structurally cannot see. A power's real
 * contribution is value x how often it is actually cast; the formula only prices the first.
 */
it('hero power activations per game', () => {
  const registry = buildRegistry(starterCards as any[], starterLeaders as any[]);
  console.log('\n| Leader      | Power              | acts/g | value | value*acts |');
  console.log('|-------------|--------------------|--------|-------|------------|');
  for (const l of starterLeaders as any[]) {
    const base = (starterDecks as any[]).find((d) => d.leaderId === l.id) as Deck;
    if (!base) continue;
    const opponents = (starterDecks as any[])
      .filter((d) => d.leaderId !== l.id).map((d) => ({ deck: d as Deck, name: d.name }));
    const r = runField(registry, base, opponents, 16, 1);
    const acts = r.heroPowers / r.totalGames;
    const val = heroPowerValue(l, lookup);
    console.log(
      `| ${l.name.padEnd(11)} | ${l.heroPower.name.padEnd(18)} |` +
      ` ${acts.toFixed(2).padStart(6)} | ${val.toFixed(2).padStart(5)} | ${(val * acts).toFixed(2).padStart(10)} |`,
    );
  }
}, 3_600_000);
