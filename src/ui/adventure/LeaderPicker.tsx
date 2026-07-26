import { useState } from 'react';
import { useContent } from '@ui/useContent';
import { MiniCard, type Detail } from '@ui/App';
import { ELEMENT_SYMBOL } from '@ui/ElementRune';
import { ADVENTURE_STARTERS } from '@adventure/data/starters';
import * as adv from '@adventure/store';

/** Run start: pick a leader, preview their hero power and starting cards. */
export function LeaderPicker({ onDetail }: { onDetail: (d: Detail) => void }) {
  const { registry } = useContent();
  const leaders = [...registry.leaders.values()].filter((l) => ADVENTURE_STARTERS[l.id]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = selectedId ? registry.leaders.get(selectedId) : undefined;
  const starter = selected ? (ADVENTURE_STARTERS[selected.id] ?? []) : [];

  return (
    <div className="advpicker">
      <h2>✦ Adventure</h2>
      <p className="muted">
        Pick a leader and set out with a small deck. Fight through the map, grow your deck at
        stores and enhancement altars, and defeat the boss at the top. Lose a single battle and
        the run is over.
      </p>
      <div className="advpicker__grid">
        {leaders.map((l) => (
          <button
            key={l.id}
            className={`advpicker__leader chip--${l.element}${selectedId === l.id ? ' advpicker__leader--sel' : ''}`}
            onClick={() => setSelectedId(l.id)}
          >
            <span className="advpicker__name">{ELEMENT_SYMBOL[l.element]} {l.name}</span>
            <span className="muted">❤ {l.hp} HP</span>
            <span className="advpicker__power">↯ {l.heroPower.name}</span>
          </button>
        ))}
      </div>
      {selected && (
        <div className="advpicker__preview">
          <h3>{ELEMENT_SYMBOL[selected.element]} {selected.name}</h3>
          <p className="muted">
            ↯ <strong>{selected.heroPower.name}</strong>
            {selected.heroPower.text ? ` — ${selected.heroPower.text}` : ''}
          </p>
          <div className="advpicker__starter">
            {starter.map((cardId, i) => {
              const card = registry.cards.get(cardId);
              return card ? <MiniCard key={`${cardId}-${i}`} card={card} onClick={() => onDetail({ kind: 'card', card })} /> : null;
            })}
          </div>
          <button className="btn-end advpicker__start" onClick={() => adv.startRun(selected.id, Date.now() & 0xffff, registry)}>
            ⚔ Begin the adventure
          </button>
        </div>
      )}
    </div>
  );
}
