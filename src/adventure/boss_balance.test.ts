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

/**
 * Per-boss difficulty report — the boss-level counterpart to `adventure_sim.test.ts`.
 *
 * OPT-IN ONLY, and deliberately NOT run inside a Claude Code session: this is exactly
 * the kind of long balance sweep meant to run on GitHub's free hosted runners
 * (`.github/workflows/boss-balance.yml`) instead of a session's own compute.
 *
 * Every boss fights every leader's own full 30-card starter archetype at act-1 boss
 * HP/deck terms, no relics, no run buffs — a fair, apples-to-apples comparison isolated
 * from run-attrition/permadeath sampling bias. `BARE` additionally strips every boss's
 * own dressing (bonusHp/twist/curse/heroPowerOverride) to separate the archetype's own
 * strength from the boss gimmick layered on top of it.
 *
 *   RUN_BOSS_BALANCE=1 npx vitest run src/adventure/boss_balance.test.ts \
 *     --reporter=verbose --disable-console-intercept
 *
 * Knobs: BOSS_SEEDS (seeds per leader-vs-boss pairing), BOSS_BARE=1 to also run the
 * bare-archetype control (roughly doubles the runtime), BOSS_ONLY (comma-separated boss
 * ids, default all 13 — lets the workflow shard one boss per runner), BOSS_OUT_DIR to
 * additionally write each row as JSON for a combine step to pick up.
 */
const RUN_BOSS_BALANCE = process.env.RUN_BOSS_BALANCE === '1';
const SEEDS = Number(process.env.BOSS_SEEDS ?? 2);
const RUN_BARE = process.env.BOSS_BARE === '1';
const ONLY = (process.env.BOSS_ONLY ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const OUT_DIR = process.env.BOSS_OUT_DIR;

const base = buildRegistry(starterCards, starterLeaders);
const ACT = 1;
const bossHp = RULES.LEADER_HP + 6 * (ACT - 1);

const asOwned = (leaderId: string): OwnedCard[] => {
  const deck = starterDecks.find((d) => d.leaderId === leaderId)!;
  return expandDeck(deck).map((cardId, i) => ({ uid: `${leaderId}-${i}`, cardId, enhancements: [] }));
};

interface Row { id: string; win: number; n: number }

const fightOnce = (
  playerLeaderId: string,
  enemyLeaderId: string,
  enemyDeckLiteral: { name: string; leaderId: string; cards: { cardId: string; count: number }[] },
  enemyHp: number,
  seed: number,
  opts: Pick<Boss, 'twistId' | 'energyOverride' | 'curse' | 'heroPowerOverride'>,
): boolean => {
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
    first: 0,
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
  const result = playOutGame(registry, initial, true);
  return result.winner === 0;
};

const printReport = (title: string, rows: Row[]): void => {
  console.log(`\n${title}`);
  const sorted = [...rows].sort((a, b) => a.win - b.win);
  for (const r of sorted) console.log(`  ${r.id.padEnd(28)} win=${r.win.toFixed(1).padStart(5)}%  n=${r.n}`);
};

const bosses = ONLY.length ? BOSSES.filter((b) => ONLY.includes(b.id)) : BOSSES;

// One file per (kind, boss) — sharded runners each cover a different boss subset, and a
// combine step merges every shard's artifact into one directory, so a shared filename
// like "full.json" would silently overwrite between shards.
const writeRow = (kind: 'full' | 'bare', row: Row): void => {
  if (!OUT_DIR) return;
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(`${OUT_DIR}/${kind}-${row.id}.json`, JSON.stringify(row), 'utf8');
};

describe.skipIf(!RUN_BOSS_BALANCE)('boss balance', () => {
  it('reports each boss win rate against every leader own starter deck', { timeout: 36_000_000 }, () => {
    const fullRows: Row[] = [];
    for (const boss of bosses) {
      const bossDeck = starterDecks.find((d) => d.leaderId === boss.leaderId)!;
      const enemyHp = bossHp + boss.bonusHp;
      let won = 0, total = 0;
      for (const leader of starterLeaders) {
        for (let seed = 1; seed <= SEEDS; seed++) {
          total++;
          if (fightOnce(leader.id, boss.leaderId, bossDeck, enemyHp, seed * 10007 + boss.id.length, {
            twistId: boss.twistId, energyOverride: boss.energyOverride, curse: boss.curse,
            heroPowerOverride: boss.heroPowerOverride,
          })) won++;
        }
      }
      const row: Row = { id: boss.id, win: (won / total) * 100, n: total };
      fullRows.push(row);
      writeRow('full', row);
      console.log(`... ${boss.id} done: ${won}/${total}`);
    }
    printReport('Per-boss win rate (full boss: bonusHp + twist + curse + hero override):', fullRows);

    if (!RUN_BARE) return;
    const bareRows: Row[] = [];
    for (const boss of bosses) {
      const archetypeDeck = starterDecks.find((d) => d.leaderId === boss.leaderId)!;
      let won = 0, total = 0;
      for (const leader of starterLeaders) {
        for (let seed = 1; seed <= SEEDS; seed++) {
          total++;
          if (fightOnce(leader.id, boss.leaderId, archetypeDeck, RULES.LEADER_HP, seed * 10007 + boss.id.length, {})) won++;
        }
      }
      const row: Row = { id: boss.id, win: (won / total) * 100, n: total };
      bareRows.push(row);
      writeRow('bare', row);
      console.log(`... ${boss.id} (bare) done: ${won}/${total}`);
    }
    printReport('Bare-archetype win rate (no bonusHp/twist/curse/hero override):', bareRows);
  });
});
