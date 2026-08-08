import { useMemo } from 'react';
import { useContent, RegistryProvider } from '@ui/useContent';
import { PlayArea, type Detail } from '@ui/App';
import { useGame } from '@ui/useGame';
import type { RunState } from '@adventure/schema';
import { playerDeck, buildCopperMechState } from '@adventure/encounters';
import { buildRunRegistry } from '@adventure/runRegistry';
import { aggregateMods, applyRelicsToState, applyDeckBuffs } from '@adventure/relics';
import { heroStateMods, applyHeroModsToState } from '@adventure/hero';
import { subSeed } from '@adventure/seed';
import {
  copperMechLeader, COPPER_MECH_HP, COPPER_MECH_NAME, COPPER_MECH_ICON, COPPER_MECH_RAID_COUNT,
} from '@adventure/data/copperMech';
import * as adv from '@adventure/store';

/**
 * The Copper Mech fight — Adventure's endgame damage race.
 *
 * Same mount-scoped contract as CombatView: it MUST be mounted with a per-attempt `key`,
 * because `useGame` reads `initialState` on first mount only and everything here is
 * derived in a mount-scoped useMemo.
 */
export function CopperMechView({ run, fightSeed, onDetail }: {
  run: RunState;
  fightSeed: number;
  onDetail: (d: Detail) => void;
}) {
  const base = useContent().registry;
  const { registry, initial } = useMemo(() => {
    const mods = aggregateMods(run.relics);
    const buffedDeck = applyDeckBuffs(base, run.deck, mods);
    // The run's full power comes along: enhancements, relic deck buffs, hero upgrades
    // and the signature buff. That is the whole point — the score measures the deck.
    // The Mech rides the `extraLeaders` seam rather than the enemy-clone path, which
    // exists to re-HP an EXISTING authored leader. This one is its own definition and
    // intentionally sits outside the authored-leader budget.
    const registry = buildRunRegistry(base, {
      deck: buffedDeck,
      playerLeaderId: run.leaderId,
      heroUpgrades: run.heroUpgrades,
      signatureBuff: run.signatureBuff,
      extraLeaders: [copperMechLeader(base)],
    });

    let initial = buildCopperMechState(registry, playerDeck(run.leaderId, buffedDeck), fightSeed);
    initial = applyRelicsToState(registry, initial, mods, subSeed(run.seed, 'coppermech', run.copperAttempts));
    applyHeroModsToState(initial, heroStateMods(run.leaderId, run.heroUpgrades));
    return { registry, initial };
    // Mount-scoped: the parent keys this component per attempt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const g = useGame({ registry, initialState: initial, fixedPov: 0, aiSides: { 0: false, 1: true } });
  const mechHp = Math.max(0, g.game.players[1].leaderHp);
  const dealt = Math.max(0, COPPER_MECH_HP - mechHp);
  const pct = Math.round((dealt / COPPER_MECH_HP) * 100);

  return (
    <RegistryProvider value={registry}>
      <div className="advcombat__bar advcombat__bar--copper">
        <span>
          {COPPER_MECH_ICON} {COPPER_MECH_NAME} · ❤ {mechHp}/{COPPER_MECH_HP}
        </span>
        <span className="advcombat__twist" title={`Every turn it raids a random leader's deck for ${COPPER_MECH_RAID_COUNT} cards and their signature.`}>
          ↯ Salvage Protocol: raids a random archetype every turn — cards and signature
        </span>
        <span className="advhud__spacer" />
        <span className="advhud__stat" title="Damage dealt this attempt. Your best is kept even if you lose.">
          ⚔ Dealt {dealt} ({pct}%)
        </span>
        <span className="advhud__stat" title="Your record across every attempt this run.">
          ★ Best {run.copperBest}
        </span>
        <button
          className="advhud__abandon"
          onClick={() => {
            if (window.confirm('Withdraw? Your damage so far still counts toward your best.')) {
              adv.resolveCopperMech(dealt, false);
            }
          }}
        >
          ⚐ Withdraw
        </button>
      </div>
      <PlayArea
        g={g}
        onDetail={onDetail}
        onPlayAgain={() => adv.resolveCopperMech(
          Math.max(0, COPPER_MECH_HP - Math.max(0, g.game.players[1].leaderHp)),
          g.game.winner === 0,
        )}
        playAgainLabel="Record the attempt →"
      />
    </RegistryProvider>
  );
}
