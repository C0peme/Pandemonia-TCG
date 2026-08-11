import { it } from 'vitest';
import { starterCards, starterDecks, starterLeaders } from '@cards/data/starter';
const RUN = true;
const card = (id: string) => (starterCards as any[]).find((c) => c.id === id);
const json = (c: any) => JSON.stringify([c.effects, c.onPlay, c.onAttack, c.endOfTurn, c.startOfTurn, c.keywords, c.grants, c.grantKeywords]);
const FN: Record<string, (c: any) => boolean> = {
  draw: (c) => /"kind":"draw"/.test(json(c)),
  // Counts POISON as removal too: strangleroot kills over time without ever dealing `damage`,
  // so a damage-only check reports a deck as answer-less when it is not.
  removal: (c) => /"kind":"damage"/.test(json(c)) || /"status":"poison"/.test(json(c)),
  heal: (c) => /"kind":"heal"/.test(json(c)) || /healer":/.test(json(c)),
  cleanse: (c) => /"kind":"cleanse"/.test(json(c)),
  AOE: (c) => /"target":"all-enemy"/.test(json(c)),
};
it.skipIf(!RUN)('deck audit', () => {
  console.log('\n| deck          | n  | draw | rmvl | heal | clns | AOE | off-cap pips |');
  console.log('|---------------|----|------|------|------|------|-----|--------------|');
  for (const d of starterDecks as any[]) {
    const leader = (starterLeaders as any[]).find((l) => l.id === d.leaderId)!;
    const caps = leader.elementCaps;
    let n = 0; const fn: Record<string, number> = { draw: 0, removal: 0, heal: 0, cleanse: 0, AOE: 0 };
    const offCap: string[] = [];
    for (const e of d.cards) {
      const c = card(e.cardId); if (!c) continue;
      n += e.count;
      for (const [k, f] of Object.entries(FN)) if (f(c)) fn[k]! += e.count;
      for (const el of (c.cost.elements ?? [])) {
        if ((caps[el.type] ?? 0) < el.amount) offCap.push(`${c.id}:${el.amount}${el.type[0].toUpperCase()}`);
      }
    }
    const oc = offCap.length ? `${offCap.length} (${[...new Set(offCap.map((x) => x.split(':')[1]))].join(',')})` : '-';
    console.log(`| ${d.name.padEnd(13)} | ${String(n).padStart(2)} |` +
      Object.keys(FN).map((k) => ` ${String(fn[k]).padStart(4)} |`).join('').replace(/\|$/, '|') +
      ` ${oc.padEnd(12)} |`);
  }
  console.log('\n=== cards NEVER used by any deck, by element (candidates) ===');
  const inDeck = new Set<string>();
  for (const d of starterDecks as any[]) for (const e of d.cards) inDeck.add(e.cardId);
  const orphans = (starterCards as any[]).filter((c) => {
    const t: string[] = c.tags ?? []; return !t.includes('token') && !t.includes('signature') && !inDeck.has(c.id);
  });
  console.log(`  ${orphans.length} orphans`);
  for (const el of ['fire','water','nature','earth','neutral']) {
    const os = orphans.filter((c) => c.element === el);
    if (os.length) console.log(`  ${el}: ${os.map((c) => c.id).join(', ')}`);
  }
}, 120_000);
