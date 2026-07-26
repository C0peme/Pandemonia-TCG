import { useMemo, useState } from 'react';
import { useContent } from '@ui/useContent';
import { MiniCard, type Detail } from '@ui/App';
import type { RunState } from '@adventure/schema';
import { rollEnhanceOffer, canApply } from '@adventure/enhance';
import { ownedCardDef } from '@adventure/runRegistry';
import { attuneCost } from '@adventure/economy';
import { aggregateMods } from '@adventure/relics';
import { ELEMENT_SYMBOL } from '@ui/ElementRune';
import { ELEMENTS } from '@engine/constants';
import * as adv from '@adventure/store';

type Choice = 'buff' | 'attune';

/** Enhance node: buff one owned card, OR attune (+1 element cap) instead. One purchase per visit. */
export function EnhanceView({ run, nodeId, onDetail }: { run: RunState; nodeId: string; onDetail: (d: Detail) => void }) {
  const { registry } = useContent();
  const [choice, setChoice] = useState<Choice>('buff');
  const node = run.map.nodes[nodeId];
  const offer = useMemo(() => (node ? rollEnhanceOffer(node.seed, run.act) : null), [node, run.act]);
  if (!node || !offer) return null;
  const used = node.enhanceUsed === true;
  const discount = aggregateMods(run.relics).enhanceDiscount;
  const buffPrice = Math.round(offer.price * discount);
  const aCost = Math.round(attuneCost(run.heroUpgrades.filter((u) => u.kind === 'attune').length) * discount);

  return (
    <div className="advpanel">
      <h2>✧ Enhancement</h2>
      {used ? (
        <p className="muted">The altar's power is spent. Continue on your way.</p>
      ) : (
        <>
          <div className="advrest__tabs">
            <button className={choice === 'buff' ? 'advrest__tab advrest__tab--on' : 'advrest__tab'} onClick={() => setChoice('buff')}>
              ✧ {offer.label} · ⊙ {buffPrice}
            </button>
            <button className={choice === 'attune' ? 'advrest__tab advrest__tab--on' : 'advrest__tab'} onClick={() => setChoice('attune')}>
              ↯ Attune · ⊙ {aCost}
            </button>
          </div>

          {choice === 'buff' ? (
            <>
              <p className="muted">
                {run.coins >= buffPrice
                  ? 'Choose a card to receive this permanent upgrade.'
                  : 'You cannot afford this enhancement.'}
              </p>
              <div className="advpanel__grid">
                {run.deck.map((owned) => {
                  const def = ownedCardDef(registry, owned);
                  const base = registry.cards.get(owned.cardId);
                  if (!def || !base) return null;
                  const eligible = canApply(offer, base);
                  return (
                    <div key={owned.uid} className={`advshop__slot${eligible ? '' : ' advshop__slot--sold'}`}>
                      <MiniCard card={def} onClick={() => onDetail({ kind: 'card', card: def })} />
                      <button
                        className="advshop__buy"
                        disabled={!eligible || run.coins < buffPrice}
                        onClick={() => adv.applyEnhancement(registry, owned.uid)}
                      >
                        {eligible ? `Enhance · ⊙ ${buffPrice}` : 'Not eligible'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <p className="muted">
                Permanently raise one element's banking cap by 1.
                {run.coins < aCost && ' — you cannot afford this.'}
              </p>
              <div className="advpanel__grid">
                {ELEMENTS.map((el) => {
                  const owned = run.heroUpgrades.filter((u) => u.kind === 'attune' && u.element === el).length;
                  const base = registry.leaders.get(run.leaderId)?.elementCaps[el] ?? 0;
                  const cap = base + owned;
                  return (
                    <div key={el} className="advshop__slot">
                      <div className="advtrain__opt">
                        <span className="advtrain__icon">{ELEMENT_SYMBOL[el]}</span>
                        <span className="advtrain__label">Attune · {el}</span>
                        <span className="advtrain__desc muted">Banking cap {cap} → {cap + 1}.</span>
                      </div>
                      <button className="advshop__buy" disabled={run.coins < aCost} onClick={() => adv.enhanceAttune(el)}>
                        Attune · ⊙ {aCost}
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}
      <div className="advpanel__actions">
        <button className="btn-end" onClick={() => adv.leaveNode()}>{used ? 'Continue →' : 'Skip →'}</button>
      </div>
    </div>
  );
}
