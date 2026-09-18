import { useState } from 'react';
import { useContent } from '@ui/useContent';
import { MiniCard, type Detail } from '@ui/App';
import { Scene } from '@ui/adventure/Scene';
import type { RunState } from '@adventure/schema';
import { restHealAmount, kindleHealAmount, victoryHealAmount, hpCeiling, ECON } from '@adventure/economy';
import { ownedCardDef } from '@adventure/runRegistry';
import * as adv from '@adventure/store';

type Service = 'rest' | 'mend';

/**
 * Rest Site: one small, low-stakes service per visit — recover HP (optionally Kindled,
 * see below), take a free card, or Mend (permanently raise the heal every battle win
 * pays out). The leader's run-defining unique upgrade is NOT sold here; it is earned
 * from the act 1 boss (see the boss reward screen). Attune lives at Enhance nodes
 * instead, not here.
 *
 * Rest and Kindle are the game's ONLY source of temporary HP: both clamp to the
 * overheal ceiling, not to maxHp, so neither is wasted at full health — the post-battle
 * win heal clamps at maxHp and never overheals, which is what makes Rest worth routing
 * to instead of just winning the next fight. Rest is only truly wasted once the ceiling
 * itself is reached.
 *
 * Kindle used to be its own fourth tab; it is really just "a bigger Rest, paid in cards
 * instead of free", so it now lives as a toggle INSIDE the Rest tab rather than a whole
 * separate service competing for attention.
 */
export function RestView({ run, nodeId, onDetail }: { run: RunState; nodeId: string; onDetail: (d: Detail) => void }) {
  const { registry } = useContent();
  const wounded = run.hp < run.maxHp;
  const ceiling = hpCeiling(run.maxHp);
  const canOverheal = run.hp < ceiling;
  // Default to the fork the player most likely needs: recovery when hurt.
  const [service, setService] = useState<Service>(wounded ? 'rest' : 'mend');
  const [kindle, setKindle] = useState(false);
  const [burnSel, setBurnSel] = useState<string[]>([]);
  const node = run.map.nodes[nodeId];
  if (!node) return null;
  const used = node.restUsed === true;
  const heal = restHealAmount(run.maxHp);
  const kindleHeal = kindleHealAmount(run.maxHp);
  const victoryHeal = victoryHealAmount(run.mendLevel);
  const mendedHeal = victoryHealAmount(run.mendLevel + 1);
  const canKindle = canOverheal && run.deck.length - ECON.KINDLE_BURN_COUNT >= 1;
  const kindling = kindle && canKindle;

  const toggleBurn = (uid: string): void => {
    setBurnSel((sel) => (sel.includes(uid) ? sel.filter((u) => u !== uid) : sel.length < ECON.KINDLE_BURN_COUNT ? [...sel, uid] : sel));
  };

  return (
    <Scene
      kind="rest"
      icon="☾"
      title="Rest Site"
      flavour={used ? 'The fire has burned down. Nothing more here tonight.' : 'A banked fire, and one night to spend on it.'}
    >
      {used ? (
        <p className="muted">You've already made use of this camp. Continue on your way.</p>
      ) : (
        <>
          <div className="advrest__tabs">
            <button className={service === 'rest' ? 'advrest__tab advrest__tab--on' : 'advrest__tab'} onClick={() => setService('rest')}>
              ❤ Rest <em>+{heal} HP</em>
            </button>
            <button className={service === 'mend' ? 'advrest__tab advrest__tab--on' : 'advrest__tab'} onClick={() => setService('mend')}>
              ✚ Mend <em>+{ECON.MEND_HEAL_STEP} per win</em>
            </button>
          </div>

          {service === 'rest' ? (
            <>
              <p className="muted">
                {wounded
                  ? `Sleep off your wounds — recover ${heal} HP (you are at ${run.hp}/${run.maxHp}). This uses up the camp.`
                  : canOverheal
                    ? `You are unhurt at ${run.hp}/${run.maxHp} — resting now banks ${heal} HP as temporary HP instead (up to ${ceiling}).`
                    : `You're already carrying the most HP you can hold (${run.hp}/${ceiling}) — spend this camp on a card or Mend instead.`}
              </p>
              <label className={`advrest__kindle${canKindle ? '' : ' advrest__kindle--disabled'}`}>
                <input
                  type="checkbox"
                  checked={kindling}
                  disabled={!canKindle}
                  onChange={(e) => { setKindle(e.target.checked); setBurnSel([]); }}
                />
                ♨ Kindle: burn {ECON.KINDLE_BURN_COUNT} cards for a bigger heal — +{kindleHeal} HP instead of +{heal} HP
                {!canOverheal ? ' (already at the overheal ceiling)' : !canKindle ? ' (needs a bigger deck to spare the cards)' : ''}
              </label>
              {kindling && (
                <>
                  <p className="muted">Pick {ECON.KINDLE_BURN_COUNT} cards to burn for good:</p>
                  <div className="advpanel__grid">
                    {run.deck.map((owned) => {
                      const def = ownedCardDef(registry, owned);
                      if (!def) return null;
                      const selected = burnSel.includes(owned.uid);
                      return (
                        <div
                          key={owned.uid}
                          className={selected ? 'advshop__slot advshop__slot--selected' : 'advshop__slot'}
                          // Burning a card is irreversible, so inspecting one before
                          // picking it has to be possible without selecting it.
                          onDoubleClick={() => onDetail({ kind: 'card', card: def })}
                        >
                          <MiniCard card={def} onClick={() => toggleBurn(owned.uid)} />
                          <span className="muted">{selected ? 'Selected to burn' : ''}</span>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
              <div className="advpanel__actions">
                {kindling ? (
                  <button
                    className="btn-end"
                    disabled={burnSel.length !== ECON.KINDLE_BURN_COUNT}
                    onClick={() => adv.restKindle(burnSel)}
                  >
                    ♨ Kindle · +{kindleHeal} HP
                    {burnSel.length !== ECON.KINDLE_BURN_COUNT && (
                      <span className="advshop__why">Pick {ECON.KINDLE_BURN_COUNT - burnSel.length} more</span>
                    )}
                  </button>
                ) : (
                  <button className="btn-end" disabled={!canOverheal} onClick={() => adv.restHeal()}>
                    ❤ Rest · +{heal} HP
                    {!canOverheal && (
                      <span className="advshop__why">At the overheal ceiling</span>
                    )}
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <p className="muted">
                Bind your wounds for the road instead of for tonight. Every battle you win
                already restores <b>{victoryHeal} HP</b> (never past your maximum); Mend
                raises that to <b>{mendedHeal} HP</b>, permanently, for the rest of the run.
              </p>
              <p className="muted">
                Worth taking even at full health: the payoff lands the next time a win leaves
                you wounded, not now. You are at {run.hp}/{run.maxHp}
                {run.hp > run.maxHp ? ` (+${run.hp - run.maxHp} temporary, from an earlier Rest)` : ''}.
              </p>
              <div className="advpanel__actions">
                <button className="btn-end" onClick={() => adv.restMend()}>
                  ✚ Mend · post-battle heal +{ECON.MEND_HEAL_STEP} (now {mendedHeal} HP)
                </button>
              </div>
            </>
          )}
        </>
      )}
      <div className="advpanel__actions">
        <button className="btn-end" onClick={() => adv.leaveNode()}>{used ? 'Continue →' : 'Leave camp →'}</button>
      </div>
    </Scene>
  );
}
