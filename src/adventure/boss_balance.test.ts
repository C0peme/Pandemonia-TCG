import { describe, it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { buildRegistry } from '@cards/registry';
import { starterCards, starterLeaders, starterDecks } from '@cards/data/starter';
import { expandDeck } from '@cards/registry';
import { RULES } from '@engine/constants';
import { initGame } from '@engine/setup';
import { playOutGame } from '@engine/sim';
import { buildRunRegistry, ENEMY_LEADER_ID } from '@adventure/runRegistry';
import { applyTrialToState, trialById } from '@adventure/trials';
import { BOSSES, type Boss } from '@adventure/data/bosses';
import type { OwnedCard } from '@adventure/schema';
import type { PlayerId } from '@engine/types';

/**
 * Per-boss difficulty report — the boss-level counterpart to `adventure_sim.test.ts`.
 *
 * OPT-IN ONLY, and deliberately NOT run inside a Claude Code session: this is exactly
 * the kind of long balance sweep meant to run on GitHub's free hosted runners
 * (`.github/workflows/boss-balance.yml`) instead of a session's own compute.
 *
 * Every boss fights every leader's own full 30-card starter archetype at act-1 boss
 * HP/deck terms, no relics, no run buffs — a fair, apples-to-apples comparison isolated
 * from run-attrition/permadeath sampling bias. `win` is always the PLAYER's win rate, so a
 * low number is a hard boss.
 *
 * Configs (each written as its own row kind):
 *   full            the real boss: bonusHp + twist + curse + hero override, player first
 *                   (Adventure always seats the player first — see buildEncounterState)
 *   bare            archetype only, base HP, player first           (BOSS_BARE=1)
 *   bare-bossfirst  archetype only, base HP, BOSS first             (BOSS_SWAP=1)
 * bare vs bare-bossfirst isolates the seat-order effect per archetype.
 *
 * Each row also carries per-opponent results (`vs`), mean game length, and `stalls` — games
 * that hit playOutGame's action guard without a winner. playOutGame reports those as a
 * seat-0 (player) win, so a stall-prone archetype reads as an easier boss than it is.
 *
 *   RUN_BOSS_BALANCE=1 npx vitest run src/adventure/boss_balance.test.ts \
 *     --reporter=verbose --disable-console-intercept
 *
 * Knobs: BOSS_COMP (second-player compensation variant), BOSS_SEEDS (seeds per
 * pairing), BOSS_BARE, BOSS_SWAP, BOSS_ONLY (comma-separated
 * boss ids — lets the workflow shard one boss per runner), BOSS_OUT_DIR (JSON per row for
 * scripts/boss-combine.mjs).
 */
const RUN_BOSS_BALANCE = process.env.RUN_BOSS_BALANCE === '1';
const SEEDS = Number(process.env.BOSS_SEEDS ?? 2);
const RUN_BARE = process.env.BOSS_BARE === '1';
const RUN_SWAP = process.env.BOSS_SWAP === '1';
const ONLY = (process.env.BOSS_ONLY ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const OUT_DIR = process.env.BOSS_OUT_DIR;
// Candidate seat-order compensation for whoever moves second: 'none', 'card' (+1 opening
// card), 'energy' (+1 energy on their first turn), or 'both'. Applies to every kind.
const COMP = process.env.BOSS_COMP ?? 'none';
const SECOND_BONUS = {
  none: undefined,
  card: { cards: 1 },
  energy: { energy: 1 },
  both: { cards: 1, energy: 1 },
}[COMP];
if (COMP !== 'none' && !SECOND_BONUS) throw new Error(`unknown BOSS_COMP ${COMP}`);

const base = buildRegistry(starterCards, starterLeaders);
const ACT = 1;
const bossHp = RULES.LEADER_HP + 6 * (ACT - 1);

const asOwned = (leaderId: string): OwnedCard[] => {
  const deck = starterDecks.find((d) => d.leaderId === leaderId)!;
  return expandDeck(deck).map((cardId, i) => ({ uid: `${leaderId}-${i}`, cardId, enhancements: [] }));
};

type Kind = 'full' | 'bare' | 'bare-bossfirst';
interface Row {
  id: string;
  comp: string;
  kind: Kind;
  win: number;
  n: number;
  stalls: number;
  avgTurns: number;
  vs: Record<string, { w: number; n: number }>;
}
interface Outcome { playerWon: boolean; stalled: boolean; turns: number }

const fightOnce = (
  playerLeaderId: string,
  enemyLeaderId: string,
  enemyDeckLiteral: { name: string; leaderId: string; cards: { cardId: string; count: number }[] },
  enemyHp: number,
  seed: number,
  first: PlayerId,
  opts: Pick<Boss, 'twistId' | 'energyOverride' | 'curse' | 'heroPowerOverride'>,
): Outcome => {
  const playerOwned = asOwned(playerLeaderId);
  const twist = opts.twistId ? trialById(opts.twistId) : undefined;
  const registry = buildRunRegistry(base, {
    deck: playerOwned,
    enemyLeaderId,
    enemyLeaderHp: enemyHp,
    playerLeaderId,
    ...(twist ? { twist } : {}),
    ...(opts.heroPowerOverride ? { enemyHeroPowerOverride: opts.heroPowerOverride } : {}),
  });
  const playerDeckLiteral = { name: 'test', leaderId: playerLeaderId, cards: playerOwned.map((c) => ({ cardId: c.cardId, count: 1 })) };
  let initial = initGame({
    registry,
    decks: [playerDeckLiteral, { ...enemyDeckLiteral, leaderId: ENEMY_LEADER_ID }],
    seed,
    first,
    ...(SECOND_BONUS ? { secondPlayerBonus: SECOND_BONUS } : {}),
  });
  if (twist) initial = applyTrialToState(registry, initial, twist);
  if (opts.energyOverride !== undefined) {
    initial.energyOverride = opts.energyOverride;
    const opener = initial.players[initial.active];
    opener.energy = Math.max(opener.energy, opts.energyOverride);
  }
  if (opts.curse?.playerMillPerTurn) {
    initial.players[0].turnCardMod = { ...initial.players[0].turnCardMod, millSelf: opts.curse.playerMillPerTurn };
  }
  if (opts.curse?.bossExtraDrawPerTurn) {
    initial.players[1].turnCardMod = { ...initial.players[1].turnCardMod, extraDraws: opts.curse.bossExtraDrawPerTurn };
  }
  const r = playOutGame(registry, initial, true);
  return { playerWon: r.winner === 0, stalled: r.finalHp[0] > 0 && r.finalHp[1] > 0, turns: r.turns };
};

const runConfig = (boss: Boss, kind: Kind): Row => {
  const deck = starterDecks.find((d) => d.leaderId === boss.leaderId)!;
  const dressed = kind === 'full';
  const enemyHp = dressed ? bossHp + boss.bonusHp : RULES.LEADER_HP;
  const first: PlayerId = kind === 'bare-bossfirst' ? 1 : 0;
  const opts = dressed
    ? { twistId: boss.twistId, energyOverride: boss.energyOverride, curse: boss.curse, heroPowerOverride: boss.heroPowerOverride }
    : {};
  const vs: Row['vs'] = {};
  let won = 0, total = 0, stalls = 0, turns = 0;
  for (const leader of starterLeaders) {
    vs[leader.id] = { w: 0, n: 0 };
    for (let seed = 1; seed <= SEEDS; seed++) {
      const o = fightOnce(leader.id, boss.leaderId, deck, enemyHp, seed * 10007 + boss.id.length, first, opts);
      total++; vs[leader.id]!.n++; turns += o.turns;
      if (o.stalled) stalls++;
      if (o.playerWon) { won++; vs[leader.id]!.w++; }
    }
  }
  return { id: boss.id, comp: COMP, kind, win: (won / total) * 100, n: total, stalls, avgTurns: turns / total, vs };
};

const writeRow = (row: Row): void => {
  if (!OUT_DIR) return;
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(`${OUT_DIR}/${COMP}-${row.kind}-${row.id}.json`, JSON.stringify(row), 'utf8');
};

const bosses = ONLY.length ? BOSSES.filter((b) => ONLY.includes(b.id)) : BOSSES;
const kinds: Kind[] = ['full', ...(RUN_BARE ? ['bare' as const] : []), ...(RUN_SWAP ? ['bare-bossfirst' as const] : [])];

describe.skipIf(!RUN_BOSS_BALANCE)('boss balance', () => {
  it('reports each boss win rate against every leader own starter deck', { timeout: 36_000_000 }, () => {
    for (const kind of kinds) {
      for (const boss of bosses) {
        const row = runConfig(boss, kind);
        writeRow(row);
        console.log(`${kind.padEnd(15)} ${boss.id.padEnd(28)} win=${row.win.toFixed(1).padStart(5)}%  n=${row.n}  stalls=${row.stalls}  turns=${row.avgTurns.toFixed(1)}`);
      }
    }
  });
});
