/**
 * Deck Builder — assemble a 40-card deck from the live card pool, pick a leader, save
 * it, and choose which decks the two hotseat players use.
 *
 * Navigation aids: rich filters (type / element / ability / cost / "matches my leader"),
 * a pool grouped by type or cost, a deck-insights panel (mana curve + type/element mix),
 * and pool cards that show stats + ability icons and open full details on click.
 */
import { useMemo, useRef, useState } from 'react';
import { ELEMENTS, CARD_ELEMENTS, RULES, type Element, type CardElement } from '@engine/constants';
import { formatCost, ABILITY_INFO } from '@cards/abilities';
import { ElementRune, ELEMENT_SYMBOL } from '@ui/ElementRune';
import type { Card, Deck, Keywords } from '@cards/schema';
import { decodeDeck, deckToJson, encodeDeck } from '@cards/deckCodec';
import { cardAbilityLine, CardDetail } from '@ui/App';
import * as store from '@cards/store';
import { useContent, useRegistry } from '@ui/useContent';

const CARD_TYPES = ['unit', 'foundation', 'spell', 'environment'] as const;
type CardType = (typeof CARD_TYPES)[number];
const TYPE_LABEL: Record<CardType, string> = { unit: 'Units', foundation: 'Foundations', spell: 'Spells', environment: 'Environments' };
const TYPE_ICON: Record<CardType, string> = { unit: '⚔', foundation: '⌂', spell: '✧', environment: '⬡' };

type SortBy = 'cost' | 'name' | 'hp' | 'atk';
type GroupBy = 'type' | 'cost' | 'none';

interface Draft {
  name: string;
  leaderId: string;
  /** cardId -> count */
  entries: Record<string, number>;
}

const draftFromDeck = (deck: Deck): Draft => ({
  name: deck.name,
  leaderId: deck.leaderId,
  entries: Object.fromEntries(deck.cards.map((e) => [e.cardId, e.count])),
});

const emptyDraft = (leaderId: string): Draft => ({ name: '', leaderId, entries: {} });

/** Cost bucket for the mana curve / cost grouping (7 covers 7+). */
const costBucket = (c: Card): number => Math.min(7, c.cost.energy);
const cardStats = (c: Card): string =>
  c.type === 'unit' ? `${c.attack}/${c.hp}` : c.type === 'foundation' ? `${c.attack}/${c.hp}` : c.type;

export function DeckBuilder() {
  const content = useContent();
  const { decks } = content;
  // Card pool comes from useRegistry so a RegistryProvider override (multiplayer host pool)
  // lets a joining player build decks against the HOST's cards. Saved decks still persist to
  // the player's own local store (they never touch the actual game pool).
  const registry = useRegistry();
  const leaders = useMemo(() => [...registry.leaders.values()], [registry]);

  const [editingOriginalName, setEditingOriginalName] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(leaders[0]?.id ?? ''));
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');
  const [detailCard, setDetailCard] = useState<Card | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [filterType, setFilterType] = useState<'all' | CardType>('all');
  const [filterElem, setFilterElem] = useState<'all' | Element>('all');
  const [filterTag, setFilterTag] = useState('all');
  const [filterAbility, setFilterAbility] = useState<'all' | string>('all');
  const [filterCost, setFilterCost] = useState<'all' | number>('all');
  const [matchesLeader, setMatchesLeader] = useState(false);
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('cost');
  const [groupBy, setGroupBy] = useState<GroupBy>('type');

  const total = Object.values(draft.entries).reduce((a, b) => a + b, 0);
  const leader = registry.leaders.get(draft.leaderId);
  const leaderElem = leader?.element;

  const playableCards = useMemo(
    () => [...registry.cards.values()].filter((c) => c.id !== '__null__' && !(c as { tags: string[] }).tags.includes('signature')),
    [registry],
  );

  const tags = useMemo(() => {
    const set = new Set<string>();
    for (const c of playableCards) for (const a of (c as { tags: string[] }).tags) set.add(a);
    return [...set].sort();
  }, [playableCards]);

  // Abilities actually present in the pool, for the ability filter dropdown.
  const abilityKeys = useMemo(() => {
    const set = new Set<string>();
    for (const c of playableCards) if (c.type === 'unit' || c.type === 'foundation') for (const k of Object.keys(c.keywords)) set.add(k);
    return [...set].sort((a, b) => (ABILITY_INFO[a as keyof Keywords]?.name ?? a).localeCompare(ABILITY_INFO[b as keyof Keywords]?.name ?? b));
  }, [playableCards]);

  const sortFn = (a: Card, b: Card): number => {
    if (sortBy === 'name') return a.name.localeCompare(b.name);
    if (sortBy === 'hp') {
      const ah = 'hp' in a ? (a as { hp: number }).hp : -1;
      const bh = 'hp' in b ? (b as { hp: number }).hp : -1;
      return bh - ah || a.name.localeCompare(b.name);
    }
    if (sortBy === 'atk') {
      const aa = a.type === 'unit' || a.type === 'foundation' ? a.attack : -1;
      const ba = b.type === 'unit' || b.type === 'foundation' ? b.attack : -1;
      return ba - aa || a.name.localeCompare(b.name);
    }
    return a.cost.energy - b.cost.energy || a.name.localeCompare(b.name);
  };

  const pool = useMemo(() => {
    const q = query.toLowerCase();
    return playableCards
      .filter(
        (c) =>
          (filterType === 'all' || c.type === filterType) &&
          (filterElem === 'all' || c.element === filterElem) &&
          (filterTag === 'all' || (filterTag === '__wip__' ? (c as { wip?: boolean }).wip : (c as { tags: string[] }).tags.includes(filterTag))) &&
          (filterAbility === 'all' || ((c.type === 'unit' || c.type === 'foundation') && filterAbility in c.keywords)) &&
          (filterCost === 'all' || costBucket(c) === filterCost) &&
          (!matchesLeader || !leaderElem || c.element === leaderElem) &&
          (q === '' || c.name.toLowerCase().includes(q)),
      )
      .sort(sortFn);
  }, [playableCards, filterType, filterElem, filterTag, filterAbility, filterCost, matchesLeader, leaderElem, query, sortBy]);

  // Group the filtered pool for display.
  const groups = useMemo((): { key: string; label: string; cards: Card[] }[] => {
    if (groupBy === 'none') return [{ key: 'all', label: `${pool.length} cards`, cards: pool }];
    if (groupBy === 'cost') {
      const out: { key: string; label: string; cards: Card[] }[] = [];
      for (let i = 0; i <= 7; i++) {
        const cards = pool.filter((c) => costBucket(c) === i);
        if (cards.length) out.push({ key: `c${i}`, label: `${i === 7 ? '7+' : i} cost`, cards });
      }
      return out;
    }
    return CARD_TYPES.map((t) => ({ key: t, label: `${TYPE_ICON[t]} ${TYPE_LABEL[t]}`, cards: pool.filter((c) => c.type === t) })).filter((g) => g.cards.length);
  }, [pool, groupBy]);

  const startNew = () => { setEditingOriginalName(null); setDraft(emptyDraft(leaders[0]?.id ?? '')); setError(''); };
  const startEdit = (d: Deck) => { setEditingOriginalName(d.name); setDraft(draftFromDeck(d)); setError(''); };

  const add = (id: string) => {
    setError('');
    setDraft((d) => {
      const cur = d.entries[id] ?? 0;
      const sum = Object.values(d.entries).reduce((a, b) => a + b, 0);
      if (cur >= RULES.MAX_COPIES || sum >= RULES.DECK_SIZE) return d;
      return { ...d, entries: { ...d.entries, [id]: cur + 1 } };
    });
  };
  const sub = (id: string) => {
    setDraft((d) => {
      const cur = d.entries[id] ?? 0;
      const next = { ...d.entries };
      if (cur <= 1) delete next[id];
      else next[id] = cur - 1;
      return { ...d, entries: next };
    });
  };

  /** Fill the remaining slots: round-robin add copies (leader's element first) up to MAX_COPIES. */
  const autoFill = () => {
    setError('');
    setDraft((d) => {
      const entries = { ...d.entries };
      let sum = Object.values(entries).reduce((a, b) => a + b, 0);
      if (sum >= RULES.DECK_SIZE) return d;
      const ordered = [...playableCards].sort((a, b) => {
        const am = leaderElem && a.element === leaderElem ? 0 : 1;
        const bm = leaderElem && b.element === leaderElem ? 0 : 1;
        return am - bm || a.cost.energy - b.cost.energy || a.name.localeCompare(b.name);
      });
      // Round-robin so the fill is varied rather than 4-ofs of the first card.
      let progressed = true;
      while (sum < RULES.DECK_SIZE && progressed) {
        progressed = false;
        for (const c of ordered) {
          if (sum >= RULES.DECK_SIZE) break;
          const cur = entries[c.id] ?? 0;
          if (cur < RULES.MAX_COPIES) { entries[c.id] = cur + 1; sum += 1; progressed = true; }
        }
      }
      return { ...d, entries };
    });
  };

  const clearCards = () => { setError(''); setDraft((d) => ({ ...d, entries: {} })); };

  const issues = useMemo(() => {
    const out: string[] = [];
    if (!draft.name.trim()) out.push('Give the deck a name.');
    if (!registry.leaders.has(draft.leaderId)) out.push('Choose a leader.');
    if (total !== RULES.DECK_SIZE) out.push(`Deck has ${total}/${RULES.DECK_SIZE} cards.`);
    for (const [id, count] of Object.entries(draft.entries)) {
      if (!registry.cards.has(id)) out.push(`Unknown card: ${id}`);
      if (count > RULES.MAX_COPIES) out.push(`Too many copies of ${id}.`);
    }
    return out;
  }, [draft, total, registry]);

  const save = () => {
    setError('');
    try {
      const newName = draft.name.trim();
      const deck: Deck = {
        name: newName,
        leaderId: draft.leaderId,
        cards: Object.entries(draft.entries).map(([cardId, count]) => ({ cardId, count })),
      };
      if (editingOriginalName !== null && editingOriginalName !== newName && store.isCustomDeck(editingOriginalName)) {
        store.deleteDeck(editingOriginalName);
      }
      store.saveDeck(deck);
      setEditingOriginalName(newName);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  /** The deck currently in the editor (may be incomplete — export/copy work on it as-is). */
  const currentDeck = (): Deck => ({
    name: draft.name.trim() || 'deck',
    leaderId: draft.leaderId,
    cards: Object.entries(draft.entries).map(([cardId, count]) => ({ cardId, count })),
  });

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(encodeDeck(currentDeck()));
      setFlash('Deck code copied — paste it to import elsewhere.');
      setError('');
    } catch {
      setFlash(''); setError('Could not access the clipboard.');
    }
  };

  const exportFile = () => {
    const deck = currentDeck();
    const blob = new Blob([deckToJson(deck)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${deck.name.replace(/[^\w.-]+/g, '_') || 'deck'}.deck.json`;
    a.click();
    URL.revokeObjectURL(url);
    setFlash(`Downloaded ${a.download}`); setError('');
  };

  /** Load a deck from a pasted code / JSON or a file into the editor (review, then Save). */
  const loadFrom = (text: string) => {
    try {
      const deck = decodeDeck(text);
      setDraft(draftFromDeck(deck));
      setEditingOriginalName(null);
      setError('');
      const unknown = deck.cards.filter((c) => !registry.cards.has(c.cardId)).length;
      setFlash(unknown > 0
        ? `Imported "${deck.name}" — ${unknown} card(s) aren't in the current pool. Review, then Save.`
        : `Imported "${deck.name}" — review, then Save to keep it.`);
    } catch (e) {
      setFlash(''); setError('Import failed: ' + (e instanceof Error ? e.message : String(e)));
    }
  };

  const importFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) file.text().then(loadFrom);
    e.target.value = '';
  };

  const pasteCode = () => {
    const text = window.prompt('Paste a deck code or JSON:');
    if (text) loadFrom(text);
  };

  const deleteDeck = (name: string) => {
    const label = store.isBaseDeck(name) ? `Revert "${name}" to its shipped version?` : `Delete deck "${name}"?`;
    if (confirm(label)) {
      store.deleteDeck(name);
      if (editingOriginalName === name) startNew();
    }
  };

  const entryList = Object.entries(draft.entries).sort((a, b) => {
    const ca = registry.cards.get(a[0]);
    const cb = registry.cards.get(b[0]);
    return (ca?.cost.energy ?? 0) - (cb?.cost.energy ?? 0) || (ca?.name ?? '').localeCompare(cb?.name ?? '');
  });

  const isEditing = editingOriginalName !== null;
  const full = total >= RULES.DECK_SIZE;

  return (
    <div className="deckbuilder">
      <div className="db__grid">
        {/* ---- Left: the deck being built ---- */}
        <div className="db__deck">
          <div className="db__decklist">
            <div className="db__decklist-head">
              <span className="subhead">Your decks</span>
              <button onClick={startNew}>+ New deck</button>
            </div>
            <div className="db__decklist-rows">
              {decks.map((d) => (
                <div key={d.name} className={`db__deckrow ${editingOriginalName === d.name ? 'db__deckrow--active' : ''}`}>
                  <span className="db__deckrow-name">{d.name}{store.isBaseDeck(d.name) && !store.isCustomDeck(d.name) ? ' (base)' : ''}</span>
                  <button onClick={() => startEdit(d)}>Edit</button>
                  {store.isCustomDeck(d.name) && (
                    <button className="btn-cancel" onClick={() => deleteDeck(d.name)}>{store.isBaseDeck(d.name) ? 'Revert' : 'Delete'}</button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="db__panel">
            <div className="db__editor-head">
              <span className="subhead">{isEditing ? `Editing: ${editingOriginalName}` : 'New deck'}</span>
              <span className="db__headbtns">
                <button onClick={autoFill} disabled={full} title={`Fill the remaining ${RULES.DECK_SIZE - total} slot(s), favouring your leader's element`}>✧ Auto-fill</button>
                <button onClick={clearCards} disabled={total === 0} title="Remove all cards from the deck">Clear</button>
              </span>
              <span className={`db__count ${total === RULES.DECK_SIZE ? 'db__count--ok' : ''}`}>{total} / {RULES.DECK_SIZE}</span>
            </div>

            <input className="db__nameinput" placeholder="Deck name…" value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />

            <LeaderPick leaders={leaders} value={draft.leaderId} onChange={(id) => setDraft((d) => ({ ...d, leaderId: id }))} />

            <DeckInsights entries={draft.entries} registry={registry} leaderElem={leaderElem} />

            <div className="db__entries">
              {entryList.map(([id, count]) => {
                const c = registry.cards.get(id);
                if (!c) return null;
                return (
                  <div key={id} className="db__entry" onDoubleClick={() => setDetailCard(c)} title="Double-click for details">
                    <span className={`chip chip--${c.element}`}>{formatCost(c.cost)}</span>
                    <span className="db__entry-elem"><ElementRune element={c.element} size={15} /></span>
                    <span className="db__entry-name">{c.name}</span>
                    <span className="db__entry-ct">×{count}</span>
                    <button onClick={() => sub(id)}>−</button>
                    <button onClick={() => add(id)} disabled={count >= RULES.MAX_COPIES || full}>+</button>
                  </div>
                );
              })}
              {entryList.length === 0 && <p className="muted db__empty">Add cards from the pool →</p>}
            </div>

            {issues.length > 0 ? (
              <ul className="db__issues">{issues.map((i) => <li key={i}>{i}</li>)}</ul>
            ) : (
              <p className="hint">Deck is legal ✓</p>
            )}
            {error && <div className="errmsg">{error}</div>}
            {flash && <div className="hint db__flash">{flash}</div>}

            <div className="db__actions">
              <button className="btn-end" disabled={issues.length > 0} onClick={save}>⤓ Save deck</button>
              {isEditing && <button onClick={startNew}>Cancel</button>}
            </div>
            <div className="db__io" title="Save decks outside local storage, or bring one in">
              <button onClick={copyCode} disabled={total === 0} title="Copy a shareable deck code to the clipboard">⧉ Copy code</button>
              <button onClick={exportFile} disabled={total === 0} title="Download this deck as a .json file">⤓ Export file</button>
              <button onClick={() => fileRef.current?.click()} title="Load a deck from a .json file">⇩ Import file</button>
              <button onClick={pasteCode} title="Paste a deck code or JSON to import">▤ Paste code</button>
              <input ref={fileRef} type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={importFile} />
            </div>
          </div>
        </div>

        {/* ---- Right: the card pool ---- */}
        <div className="db__pool">
          <div className="db__filters">
            <input className="db__search" placeholder="⚲ Search cards…" value={query} onChange={(e) => setQuery(e.target.value)} />
            <div className="db__typechips">
              <button className={filterType === 'all' ? 'chipbtn chipbtn--on' : 'chipbtn'} onClick={() => setFilterType('all')}>All</button>
              {CARD_TYPES.map((t) => (
                <button key={t} className={filterType === t ? 'chipbtn chipbtn--on' : 'chipbtn'} onClick={() => setFilterType(t)} title={TYPE_LABEL[t]}>
                  {TYPE_ICON[t]} {TYPE_LABEL[t]}
                </button>
              ))}
            </div>
            <div className="db__filterrow">
              <select value={filterElem} onChange={(e) => setFilterElem(e.target.value as typeof filterElem)}>
                <option value="all">All elements</option>
                {ELEMENTS.map((el) => <option key={el} value={el}>{ELEMENT_SYMBOL[el]} {el[0]!.toUpperCase() + el.slice(1)}</option>)}
              </select>
              <select value={filterAbility} onChange={(e) => setFilterAbility(e.target.value)}>
                <option value="all">All abilities</option>
                {abilityKeys.map((k) => <option key={k} value={k}>{ABILITY_INFO[k as keyof Keywords]?.name ?? k}</option>)}
              </select>
              <select value={String(filterCost)} onChange={(e) => setFilterCost(e.target.value === 'all' ? 'all' : Number(e.target.value))}>
                <option value="all">Any cost</option>
                {[0, 1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{n === 7 ? '7+' : n} cost</option>)}
              </select>
              <select value={filterTag} onChange={(e) => setFilterTag(e.target.value)}>
                <option value="all">All tags</option>
                <option value="__wip__">⚠ WIP</option>
                {tags.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
              <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)}>
                <option value="type">Group: Type</option>
                <option value="cost">Group: Cost</option>
                <option value="none">Group: None</option>
              </select>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)}>
                <option value="cost">Sort: Cost</option>
                <option value="name">Sort: Name</option>
                <option value="hp">Sort: HP</option>
                <option value="atk">Sort: ATK</option>
              </select>
              {leaderElem && (
                <label className="db__matchtoggle" title={`Show only ${leaderElem} cards (your leader's element)`}>
                  <input type="checkbox" checked={matchesLeader} onChange={(e) => setMatchesLeader(e.target.checked)} />
                  <ElementRune element={leaderElem} size={14} /> match leader
                </label>
              )}
            </div>
          </div>

          <div className="db__poolscroll">
            {groups.map((g) => (
              <div key={g.key} className="db__group">
                <div className="db__grouphead">{g.label} <span className="muted">({g.cards.length})</span></div>
                <div className="db__poollist">
                  {g.cards.map((c) => (
                    <PoolCard
                      key={c.id}
                      card={c}
                      count={draft.entries[c.id] ?? 0}
                      full={full}
                      offElement={Boolean(leaderElem) && c.element !== leaderElem}
                      onAdd={() => add(c.id)}
                      onSub={() => sub(c.id)}
                      onDetail={() => setDetailCard(c)}
                    />
                  ))}
                </div>
              </div>
            ))}
            {pool.length === 0 && <p className="muted" style={{ padding: 12 }}>No cards match the current filters.</p>}
          </div>
        </div>
      </div>

      {detailCard && <CardDetail detail={{ kind: 'card', card: detailCard }} onClose={() => setDetailCard(null)} />}
    </div>
  );
}

/** A leader picker that shows the chosen leader's element and skill at a glance. */
function LeaderPick({ leaders, value, onChange }: { leaders: import('@cards/schema').Leader[]; value: string; onChange: (id: string) => void }) {
  const l = leaders.find((x) => x.id === value);
  return (
    <div className={`db__leaderpick ${l ? `db__leaderpick--${l.element}` : ''}`}>
      <span className="db__leadericon">{l ? <ElementRune element={l.element} size={20} /> : '★'}</span>
      <div className="db__leaderinfo">
        <select className="db__leadersel" value={value} onChange={(e) => onChange(e.target.value)}>
          {leaders.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
        {l && <span className="db__leaderskill muted">{l.heroPower.name} · caps {Object.entries(l.elementCaps).filter(([, n]) => n > 0).map(([el, n]) => `${el[0]!.toUpperCase()}${n}`).join(' ')}</span>}
      </div>
    </div>
  );
}

/** Mana curve + type / element breakdown for the current deck. */
function DeckInsights({ entries, registry, leaderElem }: { entries: Record<string, number>; registry: ReturnType<typeof useContent>['registry']; leaderElem?: Element }) {
  const rows = Object.entries(entries).map(([id, ct]) => ({ c: registry.cards.get(id), ct })).filter((x): x is { c: Card; ct: number } => Boolean(x.c));
  const total = rows.reduce((s, x) => s + x.ct, 0);
  const curve = Array(8).fill(0) as number[];
  const byType: Record<CardType, number> = { unit: 0, foundation: 0, spell: 0, environment: 0 };
  const byElem: Record<CardElement, number> = { fire: 0, water: 0, nature: 0, earth: 0, neutral: 0 };
  let costSum = 0;
  for (const { c, ct } of rows) {
    const b = costBucket(c);
    curve[b] = (curve[b] ?? 0) + ct;
    byType[c.type] += ct;
    byElem[c.element] = (byElem[c.element] ?? 0) + ct;
    costSum += c.cost.energy * ct;
  }
  const maxCurve = Math.max(1, ...curve);
  const avg = total ? costSum / total : 0;

  return (
    <div className="db__insights">
      <div className="db__curve">
        {curve.map((n, i) => (
          <div key={i} className="db__curvecol" title={`${n} card(s) at ${i === 7 ? '7+' : i} cost`}>
            <span className="db__curveval">{n || ''}</span>
            <div className="db__curvebar" style={{ height: `${(n / maxCurve) * 100}%` }} />
            <span className="db__curvelabel">{i === 7 ? '7+' : i}</span>
          </div>
        ))}
      </div>
      <div className="db__breakdown">
        {CARD_TYPES.filter((t) => byType[t] > 0).map((t) => (
          <span key={t} className="db__bdchip" title={TYPE_LABEL[t]}>{TYPE_ICON[t]} {byType[t]}</span>
        ))}
        <span className="db__bdspace" />
        {CARD_ELEMENTS.filter((el) => (byElem[el] ?? 0) > 0).map((el) => (
          <span key={el} className={`db__bdchip chip--${el} ${leaderElem && el !== leaderElem ? 'db__bdchip--off' : ''}`} title={`${byElem[el] ?? 0} ${el} card(s)`}>
            <ElementRune element={el} size={14} /> {byElem[el]}
          </span>
        ))}
        {total > 0 && <span className="db__bdchip db__bdavg" title="Average energy cost">⌀ {avg.toFixed(1)}</span>}
      </div>
    </div>
  );
}

function PoolCard({ card, count, onAdd, onSub, onDetail, full, offElement }: {
  card: Card; count: number; onAdd: () => void; onSub: () => void; onDetail: () => void; full: boolean; offElement: boolean;
}) {
  const maxed = count >= RULES.MAX_COPIES;
  const kwLine = cardAbilityLine(card);
  return (
    <div className={`poolcard poolcard--${card.element} ${count > 0 ? 'poolcard--in' : ''} ${offElement ? 'poolcard--off' : ''}`}>
      <button className="poolcard__body" onClick={onAdd} disabled={maxed || full} title={maxed ? 'Max copies' : full ? 'Deck full' : `Add ${card.name}`}>
        <span className="poolcard__top">
          <span className="poolcard__cost">{formatCost(card.cost)}</span>
          <span className="poolcard__elem"><ElementRune element={card.element} size={14} /></span>
          <span className="poolcard__name">{card.name}</span>
          <span className="poolcard__stats">{cardStats(card)}</span>
        </span>
        {kwLine && <span className="poolcard__kw">{kwLine}</span>}
      </button>
      <div className="poolcard__side">
        <button className="poolcard__info" onClick={onDetail} title="Card details">ⓘ</button>
        {count > 0 && (
          <div className="poolcard__qty">
            <button onClick={onSub} title="Remove one">−</button>
            <span className="poolcard__ct">{count}</span>
            <button onClick={onAdd} disabled={maxed || full} title="Add one">+</button>
          </div>
        )}
      </div>
    </div>
  );
}
