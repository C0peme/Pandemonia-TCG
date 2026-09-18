import { useMemo, useState } from 'react';
import { useContent } from '@ui/useContent';
import { MiniCard, type Detail } from '@ui/App';
import { Scene } from '@ui/adventure/Scene';
import type { RunState } from '@adventure/schema';
import { rollEnhanceOffers, rerollCost, canApply } from '@adventure/enhance';
import { ownedCardDef } from '@adventure/runRegistry';
import { attuneCost } from '@adventure/economy';
import { elementCap } from '@adventure/run';
import { runMods } from '@adventure/relics';
import { ELEMENT_SYMBOL } from '@ui/ElementRune';
import { ELEMENTS } from '@engine/constants';
import * as adv from '@adventure/store';

type Choice = 'buff' | 'attune';

/**
 * Enhance node: take one of THREE free workings on an owned card, and/or attune.
 *
 * The working is one per visit. ATTUNING is unlimited and does not consume the visit —
 * it is a pure coin sink whose escalating, cap-scaled price is its own limit, which is
 * what makes it worth anything now that the working itself is free.
 *
 * Coins buy rerolls here, not the upgrade, so the panel leads with the row of offers
 * and the price sits on the reroll button beneath it. The selected offer drives which
 * cards below are eligible, which is why picking an offer and picking a target are two
 * separate clicks rather than one grid of every combination.
 */
export function EnhanceView({ run, nodeId, onDetail }: { run: RunState; nodeId: string; onDetail: (d: Detail) => void }) {
  const { registry } = useContent();
  const [choice, setChoice] = useState<Choice>('buff');
  const [sel, setSel] = useState(0);
  const node = run.map.nodes[nodeId];
  const rerolls = node?.enhanceRerolls ?? 0;
  const offers = useMemo(
    () => (node ? rollEnhanceOffers(node.seed, run.act, rerolls) : []),
    [node?.seed, run.act, rerolls],
  );
  if (!node || offers.length === 0) return null;
  const used = node.enhanceUsed === true;
  const relicMods = runMods(run, registry);
  const discount = relicMods.enhanceDiscount;
  const reroll = Math.round(rerollCost(rerolls) * discount);
  // Priced per ELEMENT, off the cap being raised — so a cheap element stays cheap while a
  // deep one gets steep, and each column shows its own price.
  const attunePrice = (el: (typeof ELEMENTS)[number]): number =>
    Math.round(attuneCost(elementCap(run, registry, el)) * discount);
  const offer = offers[Math.min(sel, offers.length - 1)]!;

  return (
    <Scene
      kind="enhance"
      icon="✧"
      title="Enhancement"
      flavour={used
        ? 'The altar is cold. Its working is spent — but the attunement stones are always lit.'
        : 'An altar that asks no gold for its work — only that you choose. One working per visit.'}
    >
      {/* The working is one-per-visit, but ATTUNING is not — so a spent altar still has
          something to sell, and the tabs stay up rather than the whole panel closing. */}
      {(
        <>
          <div className="advrest__tabs">
            <button className={choice === 'buff' ? 'advrest__tab advrest__tab--on' : 'advrest__tab'} onClick={() => setChoice('buff')}>
              ✧ Working <em>free</em>
            </button>
            <button className={choice === 'attune' ? 'advrest__tab advrest__tab--on' : 'advrest__tab'} onClick={() => setChoice('attune')}>
              ↯ Attune <em>unlimited</em>
            </button>
          </div>

          {choice === 'buff' ? (
            used ? (
              <p className="muted">The altar's working is spent for tonight — but you may still attune.</p>
            ) : (
            <>
              <div className="advenh__offers">
                {offers.map((o, i) => (
                  <button
                    key={o.id}
                    className={`advenh__offer advenh__offer--${o.rarity}${i === sel ? ' advenh__offer--sel' : ''}`}
                    onClick={() => setSel(i)}
                  >
                    {o.rarity === 'rare' && <span className="advenh__rare">Rare</span>}
                    <span className="advenh__label">{o.label}</span>
                    <span className="advenh__blurb muted">{o.blurb}</span>
                  </button>
                ))}
              </div>

              <div className="advenh__rerollrow">
                <button
                  className="advenh__reroll"
                  disabled={run.coins < reroll}
                  onClick={() => { adv.enhanceReroll(); setSel(0); }}
                >
                  ↻ Reroll offers · {reroll === 0 ? 'free' : `⊙ ${reroll}`}
                </button>
                <span className="muted">
                  {reroll === 0
                    ? 'Your first reroll here costs nothing.'
                    : run.coins < reroll
                      ? `⊙ ${reroll - run.coins} short — you have ⊙ ${run.coins}.`
                      : `Rerolled ${rerolls}× · the next costs more.`}
                </span>
              </div>

              <p className="muted">
                {offer.sort === 'duplicate'
                  ? 'Choose a card to copy.'
                  : 'Choose a card to receive this working.'}
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
                        disabled={!eligible}
                        onClick={() => adv.applyEnhancement(registry, owned.uid, sel)}
                      >
                        {eligible ? (offer.sort === 'duplicate' ? 'Copy' : 'Enhance') : 'Not eligible'}
                        {!eligible && <span className="advshop__why">{offer.label} can't apply to this card</span>}
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
            )
          ) : (
            <>
              <p className="muted">
                Permanently raise an element's banking cap. Buy as many as you can afford —
                each point costs more than the last, and attuning does not use up the
                altar's working.
              </p>
              <div className="advpanel__grid">
                {ELEMENTS.map((el) => {
                  const cap = elementCap(run, registry, el);
                  const aCost = attunePrice(el);
                  const short = aCost - run.coins;
                  return (
                    <div key={el} className="advshop__slot">
                      <div className="advtrain__opt">
                        <span className="advtrain__icon">{ELEMENT_SYMBOL[el]}</span>
                        <span className="advtrain__label">Attune · {el}</span>
                        <span className="advtrain__desc muted">Banking cap {cap} → {cap + 1}.</span>
                      </div>
                      <button className="advshop__buy" disabled={short > 0} onClick={() => adv.enhanceAttune(registry, el)}>
                        Attune · ⊙ {aCost}
                        {short > 0 && <span className="advshop__why">⊙ {short} short</span>}
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
    </Scene>
  );
}
