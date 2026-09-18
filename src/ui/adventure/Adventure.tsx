import { useState } from 'react';
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
import { TrialView } from '@ui/adventure/TrialView';
import { GainView } from '@ui/adventure/GainView';
import { TrimPicker } from '@ui/adventure/TrimPicker';
import { CombatView } from '@ui/adventure/CombatView';
import { ELEMENT_SYMBOL } from '@ui/ElementRune';
import { relicById } from '@adventure/data/relics';
import { boonById } from '@adventure/data/boons';
import { leaderUpgrade, signatureUpgrade } from '@adventure/hero';
<<<<<<< Updated upstream
=======
import { COPPER_MECH_HP, COPPER_MECH_ICON, COPPER_MECH_NAME } from '@adventure/data/copperMech';
import type { RunState } from '@adventure/schema';
>>>>>>> Stashed changes
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
      {phase.t === 'trial' && <TrialView run={run} nodeId={phase.nodeId} />}
      {phase.t === 'gain' && <GainView run={run} onDetail={onDetail} />}
      {phase.t === 'reward' && (
        <div className="advpanel advpanel--center">
          <h2>{bossReward ? '♛ Boss defeated!' : '♛ Victory!'}</h2>
          <p className="advreward">
            + ⊙ {phase.coins}
            {phase.healed ? <span className="advreward__heal"> · + ❤ {phase.healed}</span> : null}
          </p>
          {/* `.length`, not truthiness. An EMPTY choices array is still an array, so a
              gate that rolled nothing to offer (e.g. a boss relic roll when every rare
              and boss relic is already owned) rendered an empty grid with no way
              forward — a screen where clicking does nothing and Continue never appears. */}
          {phase.cardChoices?.length ? (
            <CardPick choices={phase.cardChoices} onDetail={onDetail} />
          ) : run.pendingTrim ? (
            <TrimPicker run={run} onDetail={onDetail} />
          ) : phase.relicChoices?.length ? (
            <div className="advrelicpick">
              <p className="muted">Choose a relic to claim:</p>
              <div className="advrelicpick__grid">
                {phase.relicChoices.map((id) => {
                  const relic = relicById(id);
                  return relic ? (
                    // Rarity has always been in RelicDef and was never drawn — a boss
                    // relic rendered identically to a coin pouch.
                    <button key={id} className={`advrelic advrelic--${relic.rarity}`} onClick={() => adv.pickRelic(id, registry)}>
                      <span className="advrelic__band">{relic.rarity}</span>
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
                      <span className="advunlock__icon">{unique.icon}</span>
                      <strong>{unique.name}</strong>
                      {/* The run's biggest beat: spell out what the power was and what it
                          becomes, instead of one grey line of description. */}
                      <div className="advunlock__diff">
                        <span className="advunlock__was">
                          <span className="advunlock__tag">Was</span>
                          <span>
                            ↯ {leader?.heroPower.name}
                            {leader?.heroPower.text ? ` — ${leader.heroPower.text}` : ''}
                          </span>
                        </span>
                        <span className="advunlock__now">
                          <span className="advunlock__tag">Now</span>
                          <span>{unique.desc}</span>
                        </span>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <p className="muted">The boss falls — your Signature card is permanently empowered.</p>
                  {sigBuff && (
                    <div className="advunlock__card">
                      <span className="advunlock__icon">{sigBuff.icon}</span>
                      <strong>{sigBuff.name}</strong>
                      <span className="advunlock__desc">{sigBuff.desc}</span>
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
<<<<<<< Updated upstream
=======
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
          {phase.tiers?.length ? (
            <p className="advreward__heal">
              ★ Milestone reached: {phase.tiers.map((t) => `${t}%`).join(', ')}
            </p>
          ) : null}
          <p className="muted">
            {phase.actReset
              ? 'Your deck, coins, relics and HP are untouched — but Act ' + run.act +
                ' has been reset, and its map redrawn. Walk it again.'
              : 'The run is untouched — your map, deck, coins and HP are exactly as you left them.'}
          </p>
          {phase.relicChoices?.length ? (
            <div className="advrelicpick">
              <p className="muted">The wreckage yields a relic — claim one:</p>
              <div className="advrelicpick__grid">
                {phase.relicChoices.map((id) => {
                  const relic = relicById(id);
                  return relic ? (
                    <button key={id} className={`advrelic advrelic--${relic.rarity}`} onClick={() => adv.pickCopperRelic(id, registry)}>
                      <span className="advrelic__band">{relic.rarity}</span>
                      <span className="advrelic__icon">{relic.icon}</span>
                      <span className="advrelic__name">{relic.name}</span>
                      <span className="advrelic__blurb">{relic.blurb}</span>
                    </button>
                  ) : null;
                })}
              </div>
            </div>
          ) : (
            <button className="btn-end" onClick={() => adv.leaveCopperMech()}>Back to the map →</button>
          )}
        </div>
      )}
>>>>>>> Stashed changes
      {phase.t === 'dead' && (
        <div className="advpanel advpanel--center">
          <h2>☠ The run is over</h2>
          <p className="muted">
            {leader ? `${ELEMENT_SYMBOL[leader.element]} ${leader.name}` : run.leaderId} fell in Act {phase.act}.
          </p>
          <RunSummary run={run} act={phase.act} />
          <button className="btn-end" onClick={() => adv.clearRun()}>Start a new run</button>
        </div>
      )}
    </div>
  );
}

/**
 * What the run amounted to. `RunState` has always held all of this; the death screen
 * reported three fields of it.
 */
/**
 * Card reward pick: select, THEN confirm.
 *
 * A card's single click used to pick it immediately — the same click that would open
 * its detail panel elsewhere in the app. That made "let me read this card first" and
 * "take this card" the same action, so there was no way to inspect a choice without
 * already spending it. Clicking now only highlights a candidate; a separate Confirm
 * button commits it, and double-clicking still opens the full detail view.
 */
function CardPick({ choices, onDetail }: { choices: string[]; onDetail: (d: Detail) => void }) {
  const { registry } = useContent();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  return (
    <div className="advcardpick">
      <p className="muted">Choose a card to add (double-click to inspect it), then confirm:</p>
      <div className="advcardpick__grid">
        {choices.map((id) => {
          const card = registry.cards.get(id);
          if (!card) return null;
          const sel = selectedId === id;
          return (
            <span
              key={id}
              className={sel ? 'advcardpick__opt advcardpick__opt--sel' : 'advcardpick__opt'}
              onDoubleClick={() => onDetail({ kind: 'card', card })}
            >
              <MiniCard card={card} onClick={() => setSelectedId(id)} />
            </span>
          );
        })}
      </div>
      <div className="advcardpick__actions">
        <button className="advcardpick__skip" onClick={() => adv.skipRewardCard()}>Skip — no card</button>
        <button className="btn-end" disabled={!selectedId} onClick={() => selectedId && adv.pickRewardCard(selectedId)}>
          Confirm pick →
        </button>
      </div>
    </div>
  );
}

function RunSummary({ run, act }: { run: RunState; act: number }) {
  const enhanced = run.deck.reduce((n, c) => n + c.enhancements.length, 0);
  const boon = run.boonId ? boonById(run.boonId) : undefined;
  const attunes = run.heroUpgrades.filter((u) => u.kind === 'attune').length;
  return (
    <>
      <div className="advsummary">
        <div className="advsummary__cell">
          <span className="advsummary__k">Act reached</span>
          <span className="advsummary__v">{act}</span>
        </div>
        <div className="advsummary__cell">
          <span className="advsummary__k">Deck</span>
          <span className="advsummary__v">{run.deck.length}</span>
        </div>
        <div className="advsummary__cell">
          <span className="advsummary__k">Enhancements</span>
          <span className="advsummary__v">{enhanced}</span>
        </div>
        <div className="advsummary__cell">
          <span className="advsummary__k">Attunes</span>
          <span className="advsummary__v">{attunes}</span>
        </div>
        <div className="advsummary__cell">
          <span className="advsummary__k">Mend</span>
          <span className="advsummary__v">×{run.mendLevel}</span>
        </div>
        <div className="advsummary__cell">
          <span className="advsummary__k">Coins left</span>
          <span className="advsummary__v">{run.coins}</span>
        </div>
        {boon && (
          <div className="advsummary__cell">
            <span className="advsummary__k">Boon</span>
            <span className="advsummary__v" title={boon.blurb}>{boon.icon} {boon.name}</span>
          </div>
        )}
        {run.copperBest > 0 && (
          <div className="advsummary__cell">
            <span className="advsummary__k">{COPPER_MECH_NAME}</span>
            <span className="advsummary__v" style={{ color: 'var(--copper)' }}>
              {Math.round((run.copperBest / COPPER_MECH_HP) * 100)}%
            </span>
          </div>
        )}
      </div>
      {run.relics.length > 0 && (
        <div className="advsummary__relics">
          {run.relics.map((id) => {
            const relic = relicById(id);
            return relic ? (
              <span key={id} className={`advhud__relic advhud__relic--${relic.rarity}`} title={`${relic.name} — ${relic.blurb}`}>
                {relic.icon}
              </span>
            ) : null;
          })}
        </div>
      )}
    </>
  );
}
