import { useMemo, useState } from 'react';
import { useContent } from '@ui/useContent';
import { MiniCard, type Detail } from '@ui/App';
import { Scene } from '@ui/adventure/Scene';
import type { RunState } from '@adventure/schema';
import { slotPrice, sellPrice, relicPrice, relicUnbindCost, storeRerollCost, ECON } from '@adventure/economy';
import { enhancementLabel } from '@adventure/enhance';
import { storeStock, storeRelicStock } from '@adventure/run';
import { relicById } from '@adventure/data/relics';
import { repairsLeft } from '@adventure/relics';
import { ownedCardDef } from '@adventure/runRegistry';
import { ELEMENT_NAME } from '@cards/abilities';
import * as adv from '@adventure/store';

type Mode = 'buy' | 'sell';

export function StoreView({ run, nodeId, onDetail }: { run: RunState; nodeId: string; onDetail: (d: Detail) => void }) {
  const { registry } = useContent();
  // Selling used to open a list appended BELOW the buy grid, so on a full-width store
  // it needed a scroll to even notice. It now swaps to its own screen instead, the same
  // treatment as the leader picker's preview.
  const [mode, setMode] = useState<Mode>('buy');
  const node = run.map.nodes[nodeId];
  const leader = registry.leaders.get(run.leaderId);
  // Read the stock through the reducer's own helper: the view used to call
  // `rollStoreOffer` with its own arguments, which desynced from what an index actually
  // bought the moment a relic widened the shop.
  const offer = useMemo(
    () => (node ? storeStock(run, registry, node) : []),
    [registry, run, node],
  );
  // The relic shelf is rolled independently of the card stock (different pool, different
  // seed offset), which is why it has its own helper and its own sold-out list.
  const relicShelf = useMemo(() => (node ? storeRelicStock(run, node) : []), [run, node]);
  if (!node || !leader) return null;
  const bought = node.bought ?? [];
  const boughtRelics = node.boughtRelics ?? [];
  const rerollPrice = storeRerollCost(node.storeRerolls ?? 0);
  // Selling is unlimited per visit; the only stop is the deck-size floor.
  const atFloor = run.deck.length <= ECON.MIN_DECK_SIZE;

  if (mode === 'sell') {
    return (
      <Scene
        kind="store"
        icon="⊙"
        title="Sell &amp; Unbind"
        flavour={`Sell as many cards as you like — the trader is not fussy. Your deck may not drop below ${ECON.MIN_DECK_SIZE} cards.`}
      >
        <button className="advpicker__back" onClick={() => setMode('buy')}>← Back to the store</button>
        {atFloor ? (
          <p className="muted">Your deck is down to {run.deck.length} cards — the trader won't strip it further.</p>
        ) : (
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
                    className="advshop__sell"
                    onClick={() => adv.sellCard(registry, owned.uid)}
                  >
                    Sell · ⊙ {price}
                  </button>
                </div>
              );
            })}
          </div>
        )}
        {/* UNBINDING is the opposite transaction to the one above it — you PAY to be rid
            of a relic rather than being paid for a card — so it gets its own heading and
            its own explanation rather than sitting silently among the sell buttons. It
            exists because a relic can stop fitting a run: a draw engine in a deliberately
            thin deck mills its owner out faster every turn, and until now nothing could
            undo that. */}
        {run.relics.length > 0 && (
          <>
            <h3 className="advshop__shelf">Unbind a relic</h3>
            <p className="muted advshop__unbindnote">
              A charm is bound to you; a smith can strike it off, for a price. Whatever it already
              gave you when you claimed it — coins, maximum HP, a working — stays given.
            </p>
            <div className="advshop__relics">
              {run.relics.map((relicId) => {
                const relic = relicById(relicId);
                if (!relic) return null;
                const price = relicUnbindCost(relic.rarity);
                const short = price - run.coins;
                const owed = repairsLeft(run, relicId);
                const spent = run.spentRelics.includes(relicId);
                return (
                  <div key={relicId} className={`advshop__relic advshop__relic--${relic.rarity}`}>
                    <div className="advshop__relichead">
                      <span className="advshop__relicicon">{relic.icon}</span>
                      <span className="advshop__relicname">{relic.name}</span>
                      <span className="advshop__relicband">
                        {owed > 0 ? `broken · ${owed} to repair` : spent ? 'spent' : relic.rarity}
                      </span>
                    </div>
                    <p className="advshop__relicblurb">{relic.blurb}</p>
                    <button
                      className="advshop__buy"
                      disabled={short > 0}
                      onClick={() => adv.unbindRelic(relicId)}
                    >
                      Unbind · ⊙ {price}
                      {short > 0 && <span className="advshop__why">⊙ {short} short</span>}
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <div className="advpanel__actions">
          <button className="btn-end" onClick={() => adv.leaveNode()}>Leave store →</button>
        </div>
      </Scene>
    );
  }

  return (
    <Scene
      kind="store"
      icon="⌸"
      title="Store"
      flavour={`A trader's stall. ${ELEMENT_NAME[leader.element]} cards come cheaper to you — and you may sell as many as you like before you go.`}
    >
      <div className="advpanel__grid">
        {offer.map((slot, idx) => {
          const card = registry.cards.get(slot.cardId);
          if (!card) return null;
          const price = slotPrice(card, slot, leader.element);
          const sold = bought.includes(idx);
          const short = price - run.coins;
          return (
            <div key={idx} className={`advshop__slot${sold ? ' advshop__slot--sold' : ''}`}>
              {/* Both of a slot's per-visit properties have to be visible on the card
                  itself — a discount the player has to compute, or an enhancement they
                  only discover after buying, may as well not exist. */}
              {slot.discount < 1 && (
                <span className="advshop__tag advshop__tag--sale">−{Math.round((1 - slot.discount) * 100)}%</span>
              )}
              {/* One tag per working, so a three-working body advertises all three rather
                  than hiding two of them behind a single "enhanced" sticker the price is
                  nonetheless charging for. */}
              {(slot.enhancements ?? []).map((e, i) => (
                <span key={i} className="advshop__tag advshop__tag--enh">✧ {enhancementLabel(e)}</span>
              ))}
              <MiniCard card={card} onClick={() => onDetail({ kind: 'card', card })} />
              <button
                className="advshop__buy"
                disabled={sold || short > 0}
                onClick={() => adv.buyCard(registry, idx)}
              >
                {sold ? 'Sold out' : `Buy · ⊙ ${price}`}
                {/* Say WHY it's refused, not just that it is. */}
                {!sold && short > 0 && <span className="advshop__why">⊙ {short} short</span>}
              </button>
            </div>
          );
        })}
      </div>

      {/* The relic shelf. Two ordinary relics and exactly one CURSED one — the cheapest
          thing in the shop and the strongest, which is the whole pitch: the price you
          actually pay for a curse is written on the relic, not on the tag. Boss relics
          are deliberately never stocked; those are won, not bought. */}
      {relicShelf.length > 0 && (
        <>
          <h3 className="advshop__shelf">Relics</h3>
          <div className="advshop__relics">
            {relicShelf.map((relicId, idx) => {
              const relic = relicById(relicId);
              if (!relic) return null;
              const price = relicPrice(relic.rarity);
              const sold = boughtRelics.includes(idx);
              const short = price - run.coins;
              const cursed = relic.rarity === 'cursed';
              return (
                <div
                  key={relicId}
                  className={`advshop__relic advshop__relic--${relic.rarity}${sold ? ' advshop__slot--sold' : ''}`}
                >
                  <div className="advshop__relichead">
                    <span className="advshop__relicicon">{relic.icon}</span>
                    <span className="advshop__relicname">{relic.name}</span>
                    <span className="advshop__relicband">{cursed ? 'cursed' : relic.rarity}</span>
                  </div>
                  <p className="advshop__relicblurb">{relic.blurb}</p>
                  <button
                    className="advshop__buy"
                    disabled={sold || short > 0}
                    onClick={() => adv.buyRelic(registry, idx)}
                  >
                    {sold ? 'Taken' : `Buy · ⊙ ${price}`}
                    {!sold && short > 0 && <span className="advshop__why">⊙ {short} short</span>}
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}

      <div className="advpanel__actions">
        <button
          className="advshop__reroll"
          disabled={run.coins < rerollPrice}
          onClick={() => adv.storeReroll()}
        >
          ↻ Restock · ⊙ {rerollPrice}
          {run.coins < rerollPrice && <span className="advshop__why">⊙ {rerollPrice - run.coins} short</span>}
        </button>
        <button
          className="advshop__selltoggle"
          onClick={() => setMode('sell')}
          disabled={atFloor}
        >
          ⊙ Sell cards &amp; unbind relics…
          {atFloor && <span className="advshop__why">Deck at the {ECON.MIN_DECK_SIZE}-card floor</span>}
        </button>
        <button className="btn-end" onClick={() => adv.leaveNode()}>Leave store →</button>
      </div>
    </Scene>
  );
}

