import { useState } from 'react';
import { useContent } from '@ui/useContent';
import { MiniCard, type Detail } from '@ui/App';
import { Scene } from '@ui/adventure/Scene';
import type { RunState } from '@adventure/schema';
import { relicById } from '@adventure/data/relics';
import { TrimPicker } from '@ui/adventure/TrimPicker';
import * as adv from '@adventure/store';

/**
 * The result screen for anything gained outside a battle.
 *
 * Events used to resolve straight back to the map. The authored `result` line was never
 * rendered, and a relic or card just appeared somewhere in the deck or the relic tray —
 * so the payout was something the player had to go and find. Now: a rolled grant is a
 * pick-one-of-three (the same shape a battle reward uses), and a fixed grant is shown.
 */
export function GainView({ run, onDetail }: { run: RunState; onDetail: (d: Detail) => void }) {
  const { registry } = useContent();
  const [selected, setSelected] = useState<string | null>(null);
  if (run.phase.t !== 'gain') return null;
  const { text, relicChoices, cardChoices, gainedRelics, gainedCards } = run.phase;
  const pending = Boolean(relicChoices?.length || cardChoices?.length || run.pendingTrim);

  return (
    <Scene kind="event" icon="✦" title={pending ? 'Choose your reward' : 'What you found'}>
      {text && <p className="advevent__body">{text}</p>}

      {relicChoices?.length ? (
        <div className="advrelicpick">
          <p className="muted">Choose a relic to claim:</p>
          <div className="advrelicpick__grid">
            {relicChoices.map((id) => {
              const relic = relicById(id);
              return relic ? (
                <button key={id} className={`advrelic advrelic--${relic.rarity}`} onClick={() => adv.pickGainRelic(id, registry)}>
                  <span className="advrelic__band">{relic.rarity}</span>
                  <span className="advrelic__icon">{relic.icon}</span>
                  <span className="advrelic__name">{relic.name}</span>
                  <span className="advrelic__blurb">{relic.blurb}</span>
                </button>
              ) : null;
            })}
          </div>
        </div>
      ) : null}

      {run.pendingTrim ? <TrimPicker run={run} onDetail={onDetail} /> : null}

      {cardChoices?.length ? (
        <div className="advcardpick">
          {/* Select, THEN confirm — the same rule the battle reward follows, so that
              reading a card and taking it are not the same click. */}
          <p className="muted">Choose a card to add (double-click to inspect it), then confirm:</p>
          <div className="advcardpick__grid">
            {cardChoices.map((id) => {
              const card = registry.cards.get(id);
              if (!card) return null;
              return (
                <span
                  key={id}
                  className={selected === id ? 'advcardpick__opt advcardpick__opt--sel' : 'advcardpick__opt'}
                  onDoubleClick={() => onDetail({ kind: 'card', card })}
                >
                  <MiniCard card={card} onClick={() => setSelected(id)} />
                </span>
              );
            })}
          </div>
          <div className="advcardpick__actions">
            <button className="btn-end" disabled={!selected} onClick={() => selected && adv.pickGainCard(selected)}>
              Confirm pick →
            </button>
          </div>
        </div>
      ) : null}

      {/* Already granted — named event cards, curse junk, and whatever was just picked. */}
      {gainedRelics?.length ? (
        <div className="advrelicpick__grid">
          {gainedRelics.map((id) => {
            const relic = relicById(id);
            return relic ? (
              <div key={id} className={`advrelic advrelic--${relic.rarity}`}>
                <span className="advrelic__band">{relic.rarity}</span>
                <span className="advrelic__icon">{relic.icon}</span>
                <span className="advrelic__name">{relic.name}</span>
                <span className="advrelic__blurb">{relic.blurb}</span>
              </div>
            ) : null;
          })}
        </div>
      ) : null}

      {gainedCards?.length ? (
        <>
          <p className="muted">Added to your deck:</p>
          <div className="advcardpick__grid">
            {gainedCards.map((id, i) => {
              const card = registry.cards.get(id);
              return card ? <MiniCard key={`${id}-${i}`} card={card} onClick={() => onDetail({ kind: 'card', card })} /> : null;
            })}
          </div>
        </>
      ) : null}

      <div className="advpanel__actions">
        <button className="btn-end" disabled={pending} onClick={() => adv.leaveGain()}>
          {pending ? 'Claim your reward first' : 'Back to the map →'}
        </button>
      </div>
    </Scene>
  );
}
