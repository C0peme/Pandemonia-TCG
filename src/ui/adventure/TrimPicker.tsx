import { useState } from 'react';
import { useContent } from '@ui/useContent';
import { MiniCard, type Detail } from '@ui/App';
import { ownedCardDef } from '@adventure/runRegistry';
import type { RunState } from '@adventure/schema';
import * as adv from '@adventure/store';

/**
 * The picker for a `RunState.pendingTrim` — choosing exactly which cards a relic's
 * deck-trim removes, instead of the reducer picking at random.
 *
 * Random removal (Empty Reliquary's original shape) made the relic strictly worse than
 * simply walking to a shop and selling exactly the cards you didn't want, for coins on
 * top — a boss reward should never lose that comparison. Shares the "select, then
 * confirm" rule every other pick screen in Adventure uses, so highlighting a card to
 * reconsider it is never the same click as spending it.
 *
 * Rendered from both the `reward` screen (Adventure.tsx) and the `gain` screen
 * (GainView.tsx), since a relic carrying a trim can be claimed from either — the state
 * itself lives on `RunState`, not on either phase, for exactly that reason.
 */
export function TrimPicker({ run, onDetail }: { run: RunState; onDetail: (d: Detail) => void }) {
  const { registry } = useContent();
  const [selected, setSelected] = useState<string[]>([]);
  if (!run.pendingTrim) return null;
  const { count: want, coinsPerCard, buffPerCard } = run.pendingTrim;

  const toggle = (uid: string): void => {
    setSelected((sel) => (sel.includes(uid) ? sel.filter((u) => u !== uid) : sel.length < want ? [...sel, uid] : sel));
  };

  return (
    <div className="advcardpick">
      <p className="muted">
        Burn {want} card{want === 1 ? '' : 's'} from your deck, forever — choose which
        {selected.length < want ? ` (${want - selected.length} more)` : ''}.
        {(coinsPerCard || buffPerCard) && (
          <> For each: {coinsPerCard ? `⊙ ${coinsPerCard}` : ''}{coinsPerCard && buffPerCard ? ' and ' : ''}
          {buffPerCard ? `a random surviving card gains +${buffPerCard.attack}/+${buffPerCard.hp}` : ''}.</>
        )}
      </p>
      <div className="advcardpick__grid">
        {run.deck.map((owned) => {
          const def = ownedCardDef(registry, owned);
          if (!def) return null;
          const sel = selected.includes(owned.uid);
          return (
            <span
              key={owned.uid}
              className={sel ? 'advcardpick__opt advcardpick__opt--sel' : 'advcardpick__opt'}
              onDoubleClick={() => onDetail({ kind: 'card', card: def })}
            >
              <MiniCard card={def} onClick={() => toggle(owned.uid)} />
            </span>
          );
        })}
      </div>
      <div className="advcardpick__actions">
        <button
          className="btn-end"
          disabled={selected.length !== want}
          onClick={() => adv.resolveTrim(registry, selected)}
        >
          Burn {want === 1 ? 'it' : 'them'} →
        </button>
      </div>
    </div>
  );
}
