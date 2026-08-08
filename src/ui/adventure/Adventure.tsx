import { useContent } from '@ui/useContent';
import { MiniCard, type Detail } from '@ui/App';
import { useAdventure } from '@ui/adventure/useAdventure';
import { LeaderPicker } from '@ui/adventure/LeaderPicker';
import { RunHud } from '@ui/adventure/RunHud';
import { MapView } from '@ui/adventure/MapView';
import { StoreView } from '@ui/adventure/StoreView';
import { EnhanceView } from '@ui/adventure/EnhanceView';
import { RestView } from '@ui/adventure/RestView';
import { EventView } from '@ui/adventure/EventView';
import { CombatView } from '@ui/adventure/CombatView';
import { CopperMechView } from '@ui/adventure/CopperMechView';
import { ELEMENT_SYMBOL } from '@ui/ElementRune';
import { relicById } from '@adventure/data/relics';
import { leaderUpgrade, signatureUpgrade } from '@adventure/hero';
import { COPPER_MECH_HP, COPPER_MECH_ICON, COPPER_MECH_NAME } from '@adventure/data/copperMech';
import * as adv from '@adventure/store';

/** The ✦ Adventure tab — routes on the run phase. */
export function Adventure({ onDetail }: { onDetail: (d: Detail) => void }) {
  const run = useAdventure();
  const { registry } = useContent();
  if (!run) return <LeaderPicker onDetail={onDetail} />;

  const phase = run.phase;
  if (phase.t === 'combat') {
    return <CombatView key={`${run.act}:${phase.nodeId}`} run={run} nodeId={phase.nodeId} fightSeed={phase.fightSeed} onDetail={onDetail} />;
  }
  if (phase.t === 'copper') {
    // Keyed by attempt so a retry remounts into a genuinely fresh fight.
    return <CopperMechView key={`copper:${run.copperAttempts}`} run={run} fightSeed={phase.fightSeed} onDetail={onDetail} />;
  }

  const leader = registry.leaders.get(run.leaderId);
  const bossReward = phase.t === 'reward' && run.map.nodes[phase.nodeId]?.kind === 'boss';
  const unique = leaderUpgrade(run.leaderId);
  const sigBuff = signatureUpgrade(run.leaderId);

  return (
    <div className="adventure">
      <RunHud run={run} onDetail={onDetail} />
      {phase.t === 'map' && <MapView run={run} />}
      {phase.t === 'store' && <StoreView run={run} nodeId={phase.nodeId} onDetail={onDetail} />}
      {phase.t === 'enhance' && <EnhanceView run={run} nodeId={phase.nodeId} onDetail={onDetail} />}
      {phase.t === 'rest' && <RestView run={run} nodeId={phase.nodeId} onDetail={onDetail} />}
      {phase.t === 'event' && <EventView run={run} nodeId={phase.nodeId} />}
      {phase.t === 'reward' && (
        <div className="advpanel advpanel--center">
          <h2>{bossReward ? '♛ Boss defeated!' : '♛ Victory!'}</h2>
          <p className="advreward">+ ⊙ {phase.coins}</p>
          {phase.cardChoices ? (
            <div className="advcardpick">
              <p className="muted">Choose a card to add (or skip to stay lean):</p>
              <div className="advcardpick__grid">
                {phase.cardChoices.map((id) => {
                  const card = registry.cards.get(id);
                  return card ? (
                    <MiniCard key={id} card={card} onClick={() => adv.pickRewardCard(id)} />
                  ) : null;
                })}
              </div>
              <button onClick={() => adv.skipRewardCard()}>Skip — no card</button>
            </div>
          ) : phase.relicChoices ? (
            <div className="advrelicpick">
              <p className="muted">Choose a charm to claim:</p>
              <div className="advrelicpick__grid">
                {phase.relicChoices.map((id) => {
                  const relic = relicById(id);
                  return relic ? (
                    <button key={id} className="advrelic" onClick={() => adv.pickRelic(id)}>
                      <span className="advrelic__icon">{relic.icon}</span>
                      <span className="advrelic__name">{relic.name}</span>
                      <span className="advrelic__blurb">{relic.blurb}</span>
                    </button>
                  ) : null;
                })}
              </div>
            </div>
          ) : phase.unlock ? (
            <div className="advunlock">
              {phase.unlock === 'unique' ? (
                <>
                  <p className="muted">The boss falls — you've earned {leader?.name ?? 'your leader'}'s signature technique.</p>
                  {unique && (
                    <div className="advunlock__card">
                      <span className="advtrain__icon">{unique.icon}</span>
                      <strong>{unique.name}</strong>
                      <span className="muted">{unique.desc}</span>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <p className="muted">The boss falls — your Signature card is permanently empowered.</p>
                  {sigBuff && (
                    <div className="advunlock__card">
                      <span className="advtrain__icon">{sigBuff.icon}</span>
                      <strong>{sigBuff.name}</strong>
                      <span className="muted">{sigBuff.desc}</span>
                    </div>
                  )}
                </>
              )}
              <button className="btn-end" onClick={() => adv.claimUnlock()}>Claim</button>
            </div>
          ) : (
            <>
              {bossReward && <p className="muted">A new, harder map lies ahead. Your deck and coins travel with you.</p>}
              <button className="btn-end" onClick={() => adv.leaveNode()}>
                {bossReward ? `Onward to Act ${run.act + 1} →` : 'Back to the map →'}
              </button>
            </>
          )}
        </div>
      )}
      {phase.t === 'copperResult' && (
        <div className="advpanel advpanel--center">
          <h2>
            {phase.killed
              ? `♛ ${COPPER_MECH_NAME} falls!`
              : `${COPPER_MECH_ICON} Attempt recorded`}
          </h2>
          {phase.killed ? (
            <p className="advreward">
              You ground all {COPPER_MECH_HP} HP off it. The Adventure is won.
            </p>
          ) : (
            <>
              <p className="advreward">
                {phase.damage} / {COPPER_MECH_HP} damage
                {phase.record && <span className="advcopper__record"> ★ new best</span>}
              </p>
              <p className="muted">
                {phase.damage === 0
                  ? 'You never landed a blow. Strengthen the deck and come back.'
                  : phase.record
                    ? `Your best this run. ${COPPER_MECH_HP - phase.damage} HP still stood.`
                    : `Short of your best of ${run.copperBest}. Strengthen the deck and come back.`}
              </p>
            </>
          )}
          <p className="muted">The run is untouched — your map, deck, coins and HP are exactly as you left them.</p>
          <button className="btn-end" onClick={() => adv.leaveCopperMech()}>Back to the map →</button>
        </div>
      )}
      {phase.t === 'dead' && (
        <div className="advpanel advpanel--center">
          <h2>☠ The run is over</h2>
          <p className="muted">
            {leader ? `${ELEMENT_SYMBOL[leader.element]} ${leader.name}` : run.leaderId} fell in Act {phase.act} with{' '}
            {run.deck.length} cards and ⊙ {run.coins}.
          </p>
          <button className="btn-end" onClick={() => adv.clearRun()}>Start a new run</button>
        </div>
      )}
    </div>
  );
}
