import { useState } from 'react';
import { useContent } from '@ui/useContent';
import { MiniCard, type Detail } from '@ui/App';
import { ELEMENT_SYMBOL } from '@ui/ElementRune';
import type { RunState } from '@adventure/schema';
import { ownedCardDef } from '@adventure/runRegistry';
import { relicById } from '@adventure/data/relics';
import { COPPER_MECH_HP, COPPER_MECH_ICON, COPPER_MECH_NAME } from '@adventure/data/copperMech';
import * as adv from '@adventure/store';

/** Persistent strip above every non-combat Adventure screen: act, coins, deck drawer. */
export function RunHud({ run, onDetail }: { run: RunState; onDetail: (d: Detail) => void }) {
  const { registry } = useContent();
  const [deckOpen, setDeckOpen] = useState(false);
  const leader = registry.leaders.get(run.leaderId);
  return (
    <div className="advhud">
      <span className="advhud__leader">
        {leader ? `${ELEMENT_SYMBOL[leader.element]} ${leader.name}` : run.leaderId}
      </span>
      <span className="advhud__stat">✦ Act {run.act}</span>
      <span
        className={run.hp <= run.maxHp / 2 ? 'advhud__stat advhud__stat--low' : 'advhud__stat'}
        title={`Run HP — carried between fights. Signature unlocks at ${Math.floor(run.maxHp / 2)} HP.`}
      >
        ❤ {run.hp}/{run.maxHp}
      </span>
      <span className="advhud__stat">⊙ {run.coins}</span>
      {run.heroUpgrades.length > 0 && (
        <span className="advhud__stat" title={`Hero power upgraded ${run.heroUpgrades.length}×`}>↯×{run.heroUpgrades.length}</span>
      )}
      {run.copperBest > 0 && (
        <span className="advhud__stat" title={`Best damage dealt to ${COPPER_MECH_NAME}: ${run.copperBest} of ${COPPER_MECH_HP}.`}>
          {COPPER_MECH_ICON} {run.copperBest}
        </span>
      )}
      {run.adventureWon && <span className="advhud__stat advhud__stat--won" title="You destroyed the Copper Mech.">♛ VICTOR</span>}
      {run.relics.length > 0 && (
        <span className="advhud__relics">
          {run.relics.map((id) => {
            const relic = relicById(id);
            return relic ? (
              <span key={id} className="advhud__relic" title={`${relic.name} — ${relic.blurb}`}>{relic.icon}</span>
            ) : null;
          })}
        </span>
      )}
      <button className="advhud__deckbtn" onClick={() => setDeckOpen((o) => !o)}>
        ♠ Deck ({run.deck.length}) {deckOpen ? '▾' : '▸'}
      </button>
      <span className="advhud__spacer" />
      <button
        className="advhud__abandon"
        onClick={() => {
          if (window.confirm('Abandon this run? All progress is lost.')) adv.clearRun();
        }}
      >
        ✖ Abandon run
      </button>
      {deckOpen && (
        <div className="advhud__deck">
          {run.deck.map((owned) => {
            const def = ownedCardDef(registry, owned);
            if (!def) return null;
            return <MiniCard key={owned.uid} card={def} onClick={() => onDetail({ kind: 'card', card: def })} />;
          })}
        </div>
      )}
    </div>
  );
}
