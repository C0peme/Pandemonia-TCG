import { useMemo } from 'react';
import { useContent, RegistryProvider } from '@ui/useContent';
import { PlayArea, type Detail } from '@ui/App';
import { useGame } from '@ui/useGame';
import { ELEMENT_SYMBOL } from '@ui/ElementRune';
import type { RunState } from '@adventure/schema';
import { buildFight } from '@adventure/encounters';
import * as adv from '@adventure/store';

/**
 * One Adventure fight, embedding the regular board. MUST be mounted with a
 * per-encounter `key` — useGame reads `initialState` on first mount only, and
 * this component derives everything in a mount-scoped useMemo.
 */
export function CombatView({ run, nodeId, fightSeed, onDetail }: {
  run: RunState;
  nodeId: string;
  fightSeed: number;
  onDetail: (d: Detail) => void;
}) {
  const base = useContent().registry;
  // The whole encounter construction lives in `buildFight` (encounters.ts) so the headless
  // run simulator seats a run at exactly the board a player gets. Keep it there: anything
  // added here instead is invisible to every measurement of Adventure.
  const { registry, initial, enc } = useMemo(
    () => buildFight(base, run, nodeId, fightSeed),
    // Mount-scoped: the parent keys this component per encounter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const g = useGame({ registry, initialState: initial, fixedPov: 0, aiSides: { 0: false, 1: true } });
  const enemyLeader = base.leaders.get(enc.enemyLeaderId);
  const node = run.map.nodes[nodeId];

  return (
    <RegistryProvider value={registry}>
      <div className="advcombat__bar">
        <span>
          {enc.boss
            ? `${enc.boss.icon} ${enc.boss.name} — `
            : node?.kind === 'elite'
              ? '☠ ELITE — '
              : node?.kind === 'trial'
                ? '⌂ Trial — '
                : '⚔ '}
          {enc.boss ? '' : enemyLeader ? `${ELEMENT_SYMBOL[enemyLeader.element]} ${enemyLeader.name}` : 'Enemy'}
          {` · ❤ ${enc.enemyHp} HP`}
        </span>
        {enc.boss ? (
          <span className="advcombat__twist" title={enc.boss.gimmick}>↯ {enc.boss.gimmick}</span>
        ) : enc.twist ? (
          <span className="advcombat__twist" title={enc.twist.blurb}>↯ {enc.twist.name}: {enc.twist.blurb}</span>
        ) : null}
        <span className="advhud__spacer" />
        <span className="advhud__stat" title="Your run HP carries over to the next fight.">
          ❤ You {run.hp}/{run.maxHp}
        </span>
        <span className="advhud__stat">Reward: ⊙ {enc.coinReward}</span>
        <button
          className="advhud__abandon"
          onClick={() => {
            if (window.confirm('Concede this fight? Losing ends the run.')) adv.resolveCombat(registry, false);
          }}
        >
          ⚐ Concede
        </button>
      </div>
      <PlayArea
        g={g}
        onDetail={onDetail}
        onPlayAgain={() => adv.resolveCombat(registry, g.game.winner === 0, g.game.players[0].leaderHp)}
        playAgainLabel="Continue →"
      />
    </RegistryProvider>
  );
}
