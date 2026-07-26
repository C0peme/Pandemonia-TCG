import { useState } from 'react';
import { useContent } from '@ui/useContent';
import { MiniCard, type Detail } from '@ui/App';
import type { RunState } from '@adventure/schema';
import { restHealAmount, kindleHealAmount, ECON } from '@adventure/economy';
import { restCardOffer } from '@adventure/run';
import { ownedCardDef } from '@adventure/runRegistry';
import * as adv from '@adventure/store';

type Service = 'rest' | 'card' | 'kindle';

/**
 * Rest Site: one small, low-stakes service per visit — recover HP, take a free card,
 * or Kindle (burn 2 owned cards for a bigger heal). The leader's run-defining unique
 * upgrade is NOT sold here; it is earned from the act 1 boss (see the boss reward
 * screen). Attune lives at Enhance nodes instead, not here.
 */
export function RestView({ run, nodeId, onDetail }: { run: RunState; nodeId: string; onDetail: (d: Detail) => void }) {
  const { registry } = useContent();
  const wounded = run.hp < run.maxHp;
  // Default to the fork the player most likely needs: recovery when hurt.
  const [service, setService] = useState<Service>(wounded ? 'rest' : 'card');
  const [burnSel, setBurnSel] = useState<string[]>([]);
  const node = run.map.nodes[nodeId];
  if (!node) return null;
  const used = node.restUsed === true;
  const heal = restHealAmount(run.maxHp);
  const kindleHeal = kindleHealAmount(run.maxHp);
  const cardOffer = restCardOffer(registry, run, nodeId);
  const canKindle = wounded && run.deck.length - ECON.KINDLE_BURN_COUNT >= 1;

  const toggleBurn = (uid: string): void => {
    setBurnSel((sel) => (sel.includes(uid) ? sel.filter((u) => u !== uid) : sel.length < ECON.KINDLE_BURN_COUNT ? [...sel, uid] : sel));
  };

  return (
    <div className="advpanel">
      <h2>☾ Rest Site</h2>
      {used ? (
        <p className="muted">You've already made use of this camp. Continue on your way.</p>
      ) : (
        <>
          <div className="advrest__tabs">
            <button className={service === 'rest' ? 'advrest__tab advrest__tab--on' : 'advrest__tab'} onClick={() => setService('rest')}>
              ❤ Rest · +{heal} HP
            </button>
            <button className={service === 'card' ? 'advrest__tab advrest__tab--on' : 'advrest__tab'} onClick={() => setService('card')}>
              ♠ Take a card
            </button>
            <button className={service === 'kindle' ? 'advrest__tab advrest__tab--on' : 'advrest__tab'} onClick={() => setService('kindle')}>
              ♨ Kindle · +{kindleHeal} HP
            </button>
          </div>

          {service === 'rest' ? (
            <>
              <p className="muted">
                {wounded
                  ? `Sleep off your wounds — recover ${heal} HP (you are at ${run.hp}/${run.maxHp}). This uses up the camp.`
                  : `You are unhurt at ${run.hp}/${run.maxHp} — spend this camp on a card instead.`}
              </p>
              <div className="advpanel__actions">
                <button className="btn-end" disabled={!wounded} onClick={() => adv.restHeal()}>
                  ❤ Rest · +{heal} HP
                </button>
              </div>
            </>
          ) : service === 'card' ? (
            <>
              <p className="muted">Take one of these cards into your deck, free.</p>
              <div className="advpanel__grid">
                {cardOffer.map((cardId) => {
                  const def = registry.cards.get(cardId);
                  if (!def) return null;
                  return (
                    <div key={cardId} className="advshop__slot">
                      <MiniCard card={def} onClick={() => onDetail({ kind: 'card', card: def })} />
                      <button className="advshop__buy" onClick={() => adv.restTakeCard(registry, cardId)}>
                        Take
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <p className="muted">
                {!wounded
                  ? `You are unhurt at ${run.hp}/${run.maxHp} — Kindle would burn 2 cards for nothing.`
                  : !canKindle
                    ? 'Not enough cards to spare — Kindle needs at least 3 in your deck.'
                    : `Pick 2 cards to burn for good — a bigger heal than plain Rest (+${kindleHeal} HP instead of +${heal} HP).`}
              </p>
              <div className="advpanel__grid">
                {run.deck.map((owned) => {
                  const def = ownedCardDef(registry, owned);
                  if (!def) return null;
                  const selected = burnSel.includes(owned.uid);
                  return (
                    <div key={owned.uid} className={selected ? 'advshop__slot advshop__slot--selected' : 'advshop__slot'}>
                      <MiniCard card={def} onClick={() => (canKindle ? toggleBurn(owned.uid) : onDetail({ kind: 'card', card: def }))} />
                      <span className="muted">{selected ? 'Selected to burn' : ''}</span>
                    </div>
                  );
                })}
              </div>
              <div className="advpanel__actions">
                <button
                  className="btn-end"
                  disabled={!canKindle || burnSel.length !== ECON.KINDLE_BURN_COUNT}
                  onClick={() => adv.restKindle(burnSel[0]!, burnSel[1]!)}
                >
                  ♨ Kindle · +{kindleHeal} HP
                </button>
              </div>
            </>
          )}
        </>
      )}
      <div className="advpanel__actions">
        <button className="btn-end" onClick={() => adv.leaveNode()}>{used ? 'Continue →' : 'Leave camp →'}</button>
      </div>
    </div>
  );
}
