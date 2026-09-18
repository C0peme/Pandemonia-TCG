import { useMemo } from 'react';
import { useContent, RegistryProvider } from '@ui/useContent';
import { PlayArea, type Detail } from '@ui/App';
import { useGame } from '@ui/useGame';
import { ELEMENT_SYMBOL } from '@ui/ElementRune';
import { HpBar } from '@ui/adventure/RunHud';
import { relicById } from '@adventure/data/relics';
import type { RunState } from '@adventure/schema';
import { rollEncounter, playerDeck, buildEncounterState } from '@adventure/encounters';
import { buildRunRegistry } from '@adventure/runRegistry';
import { runMods, applyRelicsToState, applyDeckBuffs, effectiveAct } from '@adventure/relics';
import { heroStateMods, applyHeroModsToState } from '@adventure/hero';
import { subSeed } from '@adventure/seed';
import * as adv from '@adventure/store';

/**
 * One Adventure fight, embedding the regular board. MUST be mounted with a
 * per-encounter `key` — useGame reads `initialState` on first mount only, and
 * this component derives everything in a mount-scoped useMemo.
 */
/** "3rd", "4th" — the interval reads as a rule, not as a raw number. */
const ordinalSuffix = (n: number): string =>
  n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th';

/** The next round the commander will seize, given where the fight currently stands. */
const nextAutopilotRound = (round: number, every: number): number => (Math.floor(round / every) + 1) * every;

export function CombatView({ run, nodeId, fightSeed, onDetail }: {
  run: RunState;
  nodeId: string;
  fightSeed: number;
  onDetail: (d: Detail) => void;
}) {
  const base = useContent().registry;
  const { registry, initial, enc } = useMemo(() => {
    const node = run.map.nodes[nodeId]!;
    // `runMods` (not the bare `aggregateMods`) so conditional relics are judged against
    // this run's deck and HP, and spent one-shots contribute nothing.
    const mods = runMods(run, base);
    // The real act still picks the boss; `effectiveAct` scales the HP and deck behind
    // it, so The Lesser Road makes act 5 FIGHT like act 3 without changing who is
    // standing there. The matching payout cut lives in `resolveCombat`.
    const enc = rollEncounter(base, node, run.act, mods.enemyHpMult, run.seed, effectiveAct(run.act, mods));
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
      // The Foundry's enhanced enemy copies. `enc.enemyDeck` already points at their
      // `adve:` ids, so this is not optional decoration — without it those entries
      // resolve to nothing and the enemy draws a deck full of holes.
      ...(enc.enemyOwned ? { enemyDeck: enc.enemyOwned } : {}),
      ...(enc.twist ? { twist: enc.twist } : {}),
      // Boss rules that need the REGISTRY rather than the state (the Hydra's Battle Ready).
      ...(enc.bossRules ? { bossRules: enc.bossRules } : {}),
    });
    let initial = buildEncounterState(registry, playerDeck(run.leaderId, buffedDeck), enc, fightSeed, run.hp, run.maxHp);
    initial = applyRelicsToState(registry, initial, mods, subSeed(run.seed, run.act, 'relicstate', nodeId));
    // Leader upgrades that can't live on the hero power: Attune's element caps and
    // any unique's cost discount (Naife's Environments).
    applyHeroModsToState(initial, heroStateMods(run.leaderId, run.heroUpgrades));

<<<<<<< Updated upstream
    // Boss curses that aren't twists: a fixed-energy override and/or an asymmetric
    // per-turn card modifier (player mills, boss draws extra). `initGame` already ran
    // round 1's beginTurn before we get here, so the override must also be patched
    // onto the opening player's energy directly — every later turn reads it live.
    if (enc.boss?.energyOverride !== undefined) {
      initial.energyOverride = enc.boss.energyOverride;
      initial.players[initial.active].energy = enc.boss.energyOverride;
    }
    if (enc.boss?.curse?.playerMillPerTurn) {
      initial.players[0].turnCardMod = { ...initial.players[0].turnCardMod, millSelf: enc.boss.curse.playerMillPerTurn };
    }
    if (enc.boss?.curse?.bossExtraDrawPerTurn) {
      initial.players[1].turnCardMod = { ...initial.players[1].turnCardMod, extraDraws: enc.boss.curse.bossExtraDrawPerTurn };
    }

=======
>>>>>>> Stashed changes
    return { registry, initial, enc };
    // Mount-scoped: the parent keys this component per encounter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const g = useGame({ registry, initialState: initial, fixedPov: 0, aiSides: { 0: false, 1: true } });
  const enemyLeader = base.leaders.get(enc.enemyLeaderId);
  const node = run.map.nodes[nodeId];

  return (
    <RegistryProvider value={registry}>
      {/* The run's own HUD carried into the fight — same HP bar, same relic tray — so a
          battle reads as a step in the run rather than a separate application. */}
      <div className={`advcombat__bar${enc.boss ? ' advcombat__bar--boss' : node?.kind === 'elite' ? ' advcombat__bar--elite' : node?.kind === 'trial' ? ' advcombat__bar--trial' : ''}`}>
        <span className="advcombat__foe">
          <span className="advcombat__foeicon">
            {enc.boss ? enc.boss.icon : enc.elite ? enc.elite.icon : node?.kind === 'trial' ? '⌂' : '⚔'}
          </span>
          <span>
            <span className="advcombat__foename">
              {enc.boss ? enc.boss.name : enc.elite ? enc.elite.name : enemyLeader ? `${ELEMENT_SYMBOL[enemyLeader.element]} ${enemyLeader.name}` : 'Enemy'}
            </span>
            <span className="advcombat__foekind">
              {enc.boss ? 'Boss' : node?.kind === 'elite' ? 'Elite' : node?.kind === 'trial' ? 'Trial' : 'Battle'}
              {` · ❤ ${enc.enemyHp} HP · ⊙ ${enc.coinReward}`}
            </span>
          </span>
        </span>
        {enc.boss ? (
          // The gimmick line IS the rule, stated in full before the player commits — see
          // the statedness doctrine in bosses.ts. In act 1 the rule is withheld from the
          // fight but the line still reads as what this boss is.
          <span className="advcombat__twist" title={enc.boss.gimmick}>↯ {enc.boss.gimmick}</span>
        ) : enc.elite ? (
          <span className="advcombat__twist" title={enc.elite.gimmick}>↯ {enc.elite.gimmick}</span>
        ) : enc.twist ? (
          <span className="advcombat__twist" title={enc.twist.blurb}>↯ {enc.twist.name}: {enc.twist.blurb}</span>
        ) : null}
        <span className="advcombat__spacer" />
        <span className="advcombat__hp">
          <HpBar hp={run.hp} maxHp={run.maxHp} compact />
        </span>
        {run.relics.length > 0 && (
          <span className="advhud__relics">
            {run.relics.map((id) => {
              const relic = relicById(id);
              return relic ? (
                <span key={id} className={`advhud__relic advhud__relic--${relic.rarity}`} title={`${relic.name} — ${relic.blurb}`}>
                  {relic.icon}
                </span>
              ) : null;
            })}
          </span>
        )}
        <button
          className="advhud__abandon"
          onClick={() => {
            if (window.confirm('Concede this fight? Losing ends the run.')) adv.resolveCombat(registry, false);
          }}
        >
          ⚐ Concede
        </button>
      </div>
      {/* AUTOPILOT (a cursed relic or the Field Commander twist). Two states, both of
          which have to be on screen: which round is coming, so the player can arrange a
          hand around losing it, and the fact that it is happening RIGHT NOW, so a board
          moving on its own reads as the rule rather than as a bug. */}
      {g.game.autopilot && (
        <div className={`advcombat__autopilot${g.autopilot ? ' advcombat__autopilot--live' : ''}`}>
          {g.autopilot ? (
            <>⚑ <strong>The commander has the field.</strong> Round {g.game.round} is being played for you.</>
          ) : (
            <>
              ⚑ The commander takes every {g.game.autopilot.everyRounds}
              {ordinalSuffix(g.game.autopilot.everyRounds)} round — next is round{' '}
              <strong>{nextAutopilotRound(g.game.round, g.game.autopilot.everyRounds)}</strong>.
            </>
          )}
        </div>
      )}
      <PlayArea
        g={g}
        onDetail={onDetail}
        onPlayAgain={() => adv.resolveCombat(registry, g.game.winner === 0, g.game.players[0].leaderHp)}
        playAgainLabel="Continue →"
      />
    </RegistryProvider>
  );
}
