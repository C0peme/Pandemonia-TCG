import { useMemo, useState, useSyncExternalStore } from 'react';
import type { Leader } from '@cards/schema';
import { useContent } from '@ui/useContent';
import { MiniCard, type Detail } from '@ui/App';
import { LeaderCard } from '@ui/CardStudio';
import { ELEMENT_SYMBOL } from '@ui/ElementRune';
import { ADVENTURE_STARTERS } from '@adventure/data/starters';
import { rollBoons } from '@adventure/data/boons';
import * as adv from '@adventure/store';

/**
 * Run start: pick a leader, then preview their hero power and starting cards.
 *
 * Picking a leader used to append a preview panel BELOW the grid, so on a full 13-leader
 * grid the reaction to a click was invisible without scrolling — clicking looked like it
 * did nothing. Selecting now transitions to a dedicated preview screen instead, so the
 * click's effect is immediately on screen.
 */
export function LeaderPicker({ onDetail }: { onDetail: (d: Detail) => void }) {
  const { registry } = useContent();
  const leaders = [...registry.leaders.values()].filter((l) => ADVENTURE_STARTERS[l.id]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = selectedId ? registry.leaders.get(selectedId) : undefined;

  if (selected) {
    return <LeaderPreview leader={selected} onBack={() => setSelectedId(null)} onDetail={onDetail} />;
  }

  return (
    <div className="advpicker">
      <h2>✦ Adventure</h2>
      <SavedRuns />
      <p className="muted">
        Pick a leader and set out with a small deck. Fight through the map, grow your deck at
        stores and enhancement altars, and defeat the boss at the top. Lose a single battle and
        the run is over.
      </p>
      {/* The full LeaderCard, not a text chip: element caps and the signature card are
          run-defining, and this is the one screen where the choice is still open. */}
      <div className="advpicker__grid">
        {leaders.map((l) => (
          <button
            key={l.id}
            className="advpicker__pick"
            onClick={() => setSelectedId(l.id)}
          >
            <LeaderCard leader={l} registry={registry} />
          </button>
        ))}
      </div>
    </div>
  );
}

function LeaderPreview({ leader, onBack, onDetail }: {
  leader: Leader;
  onBack: () => void;
  onDetail: (d: Detail) => void;
}) {
  const { registry } = useContent();
  const starter = ADVENTURE_STARTERS[leader.id] ?? [];
  // The seed is fixed HERE, not at the moment of the click: the boons on offer are rolled
  // from it, so a seed chosen later would hand the run a different set than the one the
  // player just chose from.
  const [seed] = useState(() => Date.now() & 0xffff);
  const boons = useMemo(() => rollBoons(seed), [seed]);
  const [boonId, setBoonId] = useState<string | null>(null);

  return (
    <div className="advpicker">
      <button className="advpicker__back" onClick={onBack}>← Choose a different leader</button>
      <div className="advpicker__previewgrid">
        <LeaderCard leader={leader} registry={registry} />
        <div className="advpicker__preview">
          <h3>{ELEMENT_SYMBOL[leader.element]} {leader.name} — starting deck ({starter.length} cards)</h3>
          <p className="muted">
            ↯ <strong>{leader.heroPower.name}</strong>
            {leader.heroPower.text ? ` — ${leader.heroPower.text}` : ''}
          </p>
          <div className="advpicker__starter">
            {starter.map((cardId, i) => {
              const card = registry.cards.get(cardId);
              return card ? <MiniCard key={`${cardId}-${i}`} card={card} onClick={() => onDetail({ kind: 'card', card })} /> : null;
            })}
          </div>
          {/* The run's first real decision, made before the first node rather than five
              nodes in — and the reason two runs on the same leader diverge immediately. */}
          <h3 className="advpicker__boonhead">Choose an opening boon</h3>
          <div className="advpicker__boons">
            {boons.map((b) => (
              <button
                key={b.id}
                className={`advpicker__boon${boonId === b.id ? ' advpicker__boon--sel' : ''}`}
                onClick={() => setBoonId(b.id)}
              >
                <span className="advpicker__boonicon">{b.icon}</span>
                <strong>{b.name}</strong>
                <span className="muted">{b.blurb}</span>
              </button>
            ))}
          </div>
          <button
            className="btn-end advpicker__start"
            disabled={!boonId}
            onClick={() => boonId && adv.startRun(leader.id, seed, registry, boonId)}
          >
            {boonId ? '⚔ Begin the adventure' : 'Choose a boon to begin'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Runs banked with the HUD's Save button, plus importing one from a file exported with
 * the HUD's Export button.
 *
 * The CURRENT run auto-persists on every commit, so closing the tab never loses progress
 * — but starting a second run overwrote it. Slots are explicit checkpoints a player can
 * come back to; a file is the same idea but portable — it can move to another browser or
 * machine, survive a cleared profile, or be handed to someone else, none of which a slot
 * (bound to one browser's storage) can do.
 */
function SavedRuns() {
  const { registry } = useContent();
  const slots = useSyncExternalStore(adv.subscribe, adv.getSlots, adv.getSlots);
  const [importError, setImportError] = useState<string | null>(null);

  const handleImportFile = (file: File): void => {
    file.text().then((text) => {
      const ok = adv.importRunFromText(text);
      setImportError(ok ? null : `"${file.name}" is not a valid Pandemonia run file.`);
    });
  };

  if (slots.length === 0) {
    return <ImportRun onFile={handleImportFile} error={importError} />;
  }
  return (
    <div className="advpicker__saves">
      <h3>Saved runs</h3>
      <ImportRun onFile={handleImportFile} error={importError} />
      <div className="advpicker__savelist">
        {slots.map((slot) => {
          const leader = registry.leaders.get(slot.run.leaderId);
          return (
            <div key={slot.id} className="advpicker__save">
              <span className="advpicker__saveicon">{leader ? ELEMENT_SYMBOL[leader.element] : '✦'}</span>
              <span className="advpicker__savemeta">
                <strong>{leader?.name ?? slot.run.leaderId}</strong>
                <span className="muted">
                  Act {slot.run.act} · ❤ {slot.run.hp}/{slot.run.maxHp} · ⊙ {slot.run.coins} · {slot.run.deck.length} cards
                </span>
              </span>
              <button className="btn-end" onClick={() => adv.loadRunFromSlot(slot.id)}>Resume →</button>
              <button
                className="advpicker__savedel"
                title="Delete this save"
                onClick={() => { if (window.confirm('Delete this saved run?')) adv.deleteSlot(slot.id); }}
              >
                ✖
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Pick up a run exported with the HUD's ⬇ Export button — a file, unlike a local save
 * slot, can move between browsers and machines, survive a cleared profile, or be handed
 * to someone else. This is also how a run reaches anyone who was not the one playing it.
 */
function ImportRun({ onFile, error }: { onFile: (file: File) => void; error: string | null }) {
  return (
    <div className="advpicker__import">
      <label className="advpicker__importlabel">
        ⬆ Import a run…
        <input
          type="file"
          accept="application/json,.json"
          className="advpicker__importinput"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFile(file);
            e.target.value = ''; // so re-selecting the SAME file still fires onChange
          }}
        />
      </label>
      {error && <p className="advpicker__importerror">{error}</p>}
    </div>
  );
}
