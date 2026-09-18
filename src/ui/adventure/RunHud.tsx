import { useEffect, useState } from 'react';
import { useContent } from '@ui/useContent';
import { MiniCard, type Detail } from '@ui/App';
import { ELEMENT_SYMBOL } from '@ui/ElementRune';
import type { RunState } from '@adventure/schema';
import { ownedCardDef } from '@adventure/runRegistry';
import { relicById } from '@adventure/data/relics';
<<<<<<< Updated upstream
=======
import { repairsLeft } from '@adventure/relics';
import { COPPER_MECH_HP, COPPER_MECH_ICON, COPPER_MECH_NAME } from '@adventure/data/copperMech';
import { victoryHealAmount } from '@adventure/economy';
>>>>>>> Stashed changes
import * as adv from '@adventure/store';

/**
 * Run HP, drawn rather than described.
 *
 * Two rules used to live only inside a `title` tooltip: the Signature threshold (HALF
 * of MAX HP — the comeback valve) and temporary HP (overheal above the maximum, which
 * the engine's in-fight `healLeader` never tops back up). Both are now marks on the bar.
 *
 * The track spans `max(maxHp, hp)` rather than a fixed ceiling, so an undamaged leader
 * always reads as a full bar; when temporary HP is carried the scale stretches and the
 * overflow shows as its own segment past the maximum.
 */
export function HpBar({ hp, maxHp, mendLevel, compact = false }: {
  hp: number; maxHp: number; mendLevel?: number; compact?: boolean;
}) {
  const span = Math.max(maxHp, hp, 1);
  const solid = Math.min(hp, maxHp);
  const temp = Math.max(0, hp - maxHp);
  const sigAt = maxHp / 2;
  const low = hp <= sigAt;
  const pct = (n: number): string => `${(n / span) * 100}%`;
  const heal = mendLevel === undefined ? undefined : victoryHealAmount(mendLevel);

  return (
<<<<<<< Updated upstream
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
=======
    <div className="advhud__hp">
      <div className="advhud__hprow">
        <span className={low ? 'advhud__hpval advhud__hpval--low' : 'advhud__hpval'}>
          ❤ {solid}<small> / {maxHp}</small>
          {temp > 0 && <b> +{temp}</b>}
        </span>
        {heal !== undefined && (
          <span className="advhud__mend">
            ✚ {heal} HP a win{mendLevel ? ` (Mend ×${mendLevel})` : ''}
          </span>
        )}
      </div>
      <div
        className="advhud__hptrack"
        role="meter"
        aria-valuenow={hp}
        aria-valuemin={0}
        aria-valuemax={maxHp}
        aria-label={`Run HP ${hp} of ${maxHp}${temp > 0 ? `, ${temp} temporary` : ''}`}
>>>>>>> Stashed changes
      >
        <span className={low ? 'advhud__hpfill advhud__hpfill--low' : 'advhud__hpfill'} style={{ width: pct(solid) }} />
        {temp > 0 && <span className="advhud__hptemp" style={{ left: pct(maxHp), width: pct(temp) }} />}
        <span className="advhud__hpsig" style={{ left: pct(sigAt) }} />
      </div>
      {!compact && (
        <div className="advhud__hplegend">
          <span className="advhud__k-sig">▍Signature at {Math.floor(sigAt)}</span>
          {temp > 0 && <span className="advhud__k-temp">▍{temp} temporary</span>}
        </div>
      )}
    </div>
  );
}

/** Persistent strip above every non-combat Adventure screen: act, HP, coins, relics, deck. */
export function RunHud({ run, onDetail }: { run: RunState; onDetail: (d: Detail) => void }) {
  // Momentary confirmation, reset whenever the run moves on — otherwise "Saved" would
  // still be showing three nodes later, claiming a checkpoint that is now stale.
  const [saved, setSaved] = useState(false);
  useEffect(() => setSaved(false), [run.currentNodeId, run.act, run.phase.t]);
  const { registry } = useContent();
  const [deckOpen, setDeckOpen] = useState(false);
  const leader = registry.leaders.get(run.leaderId);
  const here = run.currentNodeId ? run.map.nodes[run.currentNodeId] : undefined;
  const layerNo = here ? here.layer + 1 : 0;
  const enhanced = run.deck.filter((c) => c.enhancements.length > 0).length;

  return (
    <div className="advhud">
      <div className="advhud__id">
        <span className={`advhud__crest advhud__crest--${leader?.element ?? 'fire'}`}>
          {leader ? ELEMENT_SYMBOL[leader.element] : '✦'}
        </span>
        <span>
          <span className="advhud__leader">{leader?.name ?? run.leaderId}</span>
          <span className="advhud__act">
            Act {run.act}
            {layerNo > 0 ? ` · Layer ${layerNo} of ${run.map.layers.length}` : ' · choose a start'}
          </span>
        </span>
      </div>

      <HpBar hp={run.hp} maxHp={run.maxHp} mendLevel={run.mendLevel} />

      <div className="advhud__right">
        <span className="advhud__coins" title="Coins">⊙ {run.coins}</span>

        {run.relics.length > 0 && (
          <span className="advhud__relics">
            {run.relics.map((id) => {
              const relic = relicById(id);
              // A SPENT one-shot keeps its tray slot, greyed. "You already used your
              // safety net" is information the run must not hide — a Phoenix Ember that
              // silently vanished would leave the player planning around a rescue they
              // no longer have.
              const spent = run.spentRelics.includes(id);
              // A BROKEN relic is currently charging its drawback and paying nothing.
              // The countdown has to be on screen: without it the relic reads as simply
              // bad rather than as a debt with a known end, which is the whole appeal.
              const owed = repairsLeft(run, id);
              return relic ? (
                <span
                  key={id}
                  className={`advhud__relic advhud__relic--${relic.rarity}${spent ? ' advhud__relic--spent' : ''}${owed > 0 ? ' advhud__relic--broken' : ''}`}
                  title={`${relic.name} (${relic.rarity})${spent ? ' — SPENT' : ''}${owed > 0 ? ` — BROKEN, ${owed} more ${owed === 1 ? 'win' : 'wins'} to repair` : ''} — ${relic.blurb}`}
                >
                  {relic.icon}
                  {owed > 0 && <span className="advhud__repair">{owed}</span>}
                </span>
              ) : null;
            })}
          </span>
        )}

        {run.copperBest > 0 && (
          <span
            className="advhud__stat"
            title={`Best damage dealt to ${COPPER_MECH_NAME}: ${run.copperBest} of ${COPPER_MECH_HP}.`}
          >
            {COPPER_MECH_ICON} {run.copperBest}
          </span>
        )}
        {run.adventureWon && (
          <span className="advhud__stat advhud__stat--won" title="You destroyed the Copper Mech.">♛ VICTOR</span>
        )}

        <button className="advhud__deckbtn" onClick={() => setDeckOpen((o) => !o)} aria-expanded={deckOpen}>
          ♠ Deck <b>{run.deck.length}</b>
          {enhanced > 0 && <span className="advhud__deckenh" title={`${enhanced} enhanced`}>✧{enhanced}</span>}
          <span aria-hidden="true">{deckOpen ? '▾' : '▸'}</span>
        </button>
        {/* A checkpoint, not a second copy: saving the same run again overwrites its own
            slot, so this can be pressed as often as the player likes. */}
        <button
          className="advhud__save"
          title="Bank this run in THIS browser so you can start another and come back to it later."
          onClick={() => { adv.saveRunToSlot(); setSaved(true); }}
        >
          {saved ? '⛁ Saved' : '⛁ Save run'}
        </button>
        {/* A slot never leaves this browser's storage — it can't move to another machine,
            survive a cleared profile, or be handed to anyone. A file can do all three. */}
        <button
          className="advhud__export"
          title="Download this run as a file you can keep, move to another device, or send to someone."
          onClick={() => adv.exportRunToFile()}
        >
          ⬇ Export
        </button>
        <button
          className="advhud__abandon"
          onClick={() => {
            if (window.confirm('Abandon this run? Progress since your last save is lost.')) adv.clearRun();
          }}
        >
          ✖ Abandon
        </button>
      </div>

      {deckOpen && (
        <div className="advhud__deck">
          {[...run.deck]
            // Group the drawer by cost so the curve is visible at a glance, the way the
            // Deck Builder already shows it — it used to be an unordered wrap.
            .map((owned) => ({ owned, def: ownedCardDef(registry, owned) }))
            .filter((x): x is { owned: typeof x.owned; def: NonNullable<typeof x.def> } => x.def != null)
            .sort((a, b) => {
              const cost = (d: typeof a.def): number =>
                d.cost.energy + (d.cost.elements ?? []).reduce((s, e) => s + e.amount, 0);
              return cost(a.def) - cost(b.def) || a.def.name.localeCompare(b.def.name);
            })
            .map(({ owned, def }) => (
              <span
                key={owned.uid}
                className={owned.enhancements.length > 0 ? 'advhud__deckcard advhud__deckcard--enh' : 'advhud__deckcard'}
                title={owned.enhancements.length > 0 ? 'Enhanced' : undefined}
              >
                <MiniCard card={def} onClick={() => onDetail({ kind: 'card', card: def })} />
              </span>
            ))}
        </div>
      )}
    </div>
  );
}
