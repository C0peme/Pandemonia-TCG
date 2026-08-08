import { useMemo } from 'react';
import { useContent, RegistryProvider } from '@ui/useContent';
import { PlayArea, type Detail } from '@ui/App';
import { useGame } from '@ui/useGame';
import { ELEMENT_SYMBOL } from '@ui/ElementRune';
import type { RunState } from '@adventure/schema';
import { rollEncounter, playerDeck, buildEncounterState } from '@adventure/encounters';
import { buildRunRegistry } from '@adventure/runRegistry';
import { aggregateMods, applyRelicsToState, applyDeckBuffs } from '@adventure/relics';
import { heroStateMods, applyHeroModsToState } from '@adventure/hero';
import { subSeed } from '@adventure/seed';
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
  const { registry, initial, enc } = useMemo(() => {
    const node = run.map.nodes[nodeId]!;
    const mods = aggregateMods(run.relics);
    const enc = rollEncounter(base, node, run.act, mods.enemyHpDelta);
    // Element-conditional relic buffs are transient stat enhancements on the player's
    // deck; both the registry (which materializes the buffed defs) and the deck-list
    // must see the same buffed copies, so derive it once and pass it to both.
    const buffedDeck = applyDeckBuffs(base, run.deck, mods);
    const registry = buildRunRegistry(base, {
      deck: buffedDeck,
      enemyLeaderId: enc.enemyLeaderId,
      enemyLeaderHp: enc.enemyHp,
      playerLeaderId: run.leaderId,
      heroUpgrades: run.heroUpgrades,
      signatureBuff: run.signatureBuff,
      ...(enc.twist ? { twist: enc.twist } : {}),
      ...(enc.boss?.heroPowerOverride ? { enemyHeroPowerOverride: enc.boss.heroPowerOverride } : {}),
    });
    let initial = buildEncounterState(registry, playerDeck(run.leaderId, buffedDeck), enc, fightSeed, run.hp);
    initial = applyRelicsToState(registry, initial, mods, subSeed(run.seed, run.act, 'relicstate', nodeId));
    // Leader upgrades that can't live on the hero power: Attune's element caps and
    // any unique's cost discount (Naife's Environments).
    applyHeroModsToState(initial, heroStateMods(run.leaderId, run.heroUpgrades));

    // Boss curses that aren't twists: a fixed-energy override and/or an asymmetric
    // per-turn card modifier (player mills, boss draws extra). `initGame` already ran
    // round 1's beginTurn before we get here, so the override must also be patched
    // onto the opening player's energy directly — every later turn reads it live.
    if (enc.boss?.energyOverride !== undefined) {
      initial.energyOverride = enc.boss.energyOverride;
      // Take the HIGHER of the two: a flat assignment here silently erased any
      // start-energy relic `applyRelicsToState` just added on the line above, so the
      // one boss with an override was also the one boss that quietly disabled a relic.
      const opener = initial.players[initial.active];
      opener.energy = Math.max(opener.energy, enc.boss.energyOverride);
    }
    if (enc.boss?.curse?.playerMillPerTurn) {
      initial.players[0].turnCardMod = { ...initial.players[0].turnCardMod, millSelf: enc.boss.curse.playerMillPerTurn };
    }
    if (enc.boss?.curse?.bossExtraDrawPerTurn) {
      initial.players[1].turnCardMod = { ...initial.players[1].turnCardMod, extraDraws: enc.boss.curse.bossExtraDrawPerTurn };
    }

    return { registry, initial, enc };
    // Mount-scoped: the parent keys this component per encounter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
