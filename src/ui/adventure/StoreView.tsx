import { useMemo, useState } from 'react';
import { useContent } from '@ui/useContent';
import { MiniCard, type Detail } from '@ui/App';
import type { RunState } from '@adventure/schema';
import { rollStoreOffer, buyPrice, sellPrice } from '@adventure/economy';
import { ownedCardDef } from '@adventure/runRegistry';
import * as adv from '@adventure/store';

export function StoreView({ run, nodeId, onDetail }: { run: RunState; nodeId: string; onDetail: (d: Detail) => void }) {
  const { registry } = useContent();
  const [selling, setSelling] = useState(false);
  const node = run.map.nodes[nodeId];
  const leader = registry.leaders.get(run.leaderId);
  const offer = useMemo(
    () => (node && leader ? rollStoreOffer(registry, node.seed, leader.element) : []),
    [registry, node, leader],
  );
  if (!node || !leader) return null;
  const bought = node.bought ?? [];

  return (
    <div className="advpanel">
      <h2>⌸ Store</h2>
      <p className="muted">Cards of your element ({leader.element}) are cheaper. You may sell one card per visit.</p>
      <div className="advpanel__grid">
        {offer.map((cardId, idx) => {
          const card = registry.cards.get(cardId);
          if (!card) return null;
          const price = buyPrice(card, leader.element);
          const sold = bought.includes(idx);
          return (
            <div key={idx} className={`advshop__slot${sold ? ' advshop__slot--sold' : ''}`}>
              <MiniCard card={card} onClick={() => onDetail({ kind: 'card', card })} />
              <button
                className="advshop__buy"
                disabled={sold || run.coins < price}
                onClick={() => adv.buyCard(registry, idx)}
              >
                {sold ? 'Sold out' : `Buy · ⊙ ${price}`}
              </button>
            </div>
          );
        })}
      </div>

      <div className="advpanel__actions">
        <button onClick={() => setSelling((s) => !s)} disabled={node.soldThisVisit}>
          {node.soldThisVisit ? '✓ Sold this visit' : selling ? 'Hide sell list' : '⊙ Sell a card…'}
        </button>
        <button className="btn-end" onClick={() => adv.leaveNode()}>Leave store →</button>
      </div>

      {selling && !node.soldThisVisit && (
        <div className="advpanel__grid">
          {run.deck.map((owned) => {
            const def = ownedCardDef(registry, owned);
            const base = registry.cards.get(owned.cardId);
            if (!def || !base) return null;
            const price = sellPrice(base, owned, leader.element);
            return (
              <div key={owned.uid} className="advshop__slot">
                <MiniCard card={def} onClick={() => onDetail({ kind: 'card', card: def })} />
                <button
                  className="advshop__buy"
                  disabled={run.deck.length <= 1}
                  onClick={() => { adv.sellCard(registry, owned.uid); setSelling(false); }}
                >
                  Sell · ⊙ {price}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
