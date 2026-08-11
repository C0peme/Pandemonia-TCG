/**
 * Card Studio — create new cards, edit existing ones to rebalance, duplicate, hide,
 * and revert base cards. All changes flow through the content store (localStorage),
 * so they immediately appear in the Collection, Deck Builder, and the game itself.
 */
import { useMemo, useState, useRef } from 'react';
import { ELEMENTS, CARD_ELEMENTS, type Element, type CardElement } from '@engine/constants';
import { formatCost, ABILITY_INFO } from '@cards/abilities';
import { ElementRune } from '@ui/ElementRune';
import { cardAbilityLine, effectLine, MiniCard } from '@ui/App';
import type {
  Card,
  Cost,
  Effect,
  ElementCaps,
  Keywords,
  Leader,
  OnHit,
  StatMod,
  TargetScope,
} from '@cards/schema';
import { RULES } from '@engine/constants';
import * as store from '@cards/store';
import { useContent } from '@ui/useContent';
import { cardBudgetValue, recommendedEnergy, recommendedPips, recommendedElements } from '@cards/budget';

const CARD_TYPES = ['unit', 'foundation', 'spell', 'environment'] as const;
type CardType = (typeof CARD_TYPES)[number];

// The four trigger sections in the editor: each holds a list of effects the card runs.
const TRIGGER_SECTIONS = ['onPlay', 'onAttack', 'endOfTurn', 'startOfTurn'] as const;
type TriggerSection = (typeof TRIGGER_SECTIONS)[number];
const TRIGGER_SECTION_LABEL: Record<TriggerSection, string> = {
  onPlay: 'At entry',
  onAttack: 'Before attacking',
  endOfTurn: 'At end of turn',
  startOfTurn: 'At start of turn',
};
const TRIGGER_SECTION_HINT: Record<TriggerSection, string> = {
  onPlay: 'Runs once, when this unit enters play.',
  onAttack: 'Runs just before this unit attacks each turn.',
  endOfTurn: 'Runs at the end of every turn, for as long as this unit is in play.',
  startOfTurn: "Runs at the start of this unit's owner's turn.",
};
const SCOPES: TargetScope[] = [
  'self',
  'ally',
  'enemy',
  'any',
  'leader',
  'all-ally',
  'all-enemy',
  'lane-ally',
  'lane-enemy',
  'killer',
];
// Triggers a Healer can fire on (the ones the engine honours for the healer keyword).
const HEALER_TRIGGERS = ['onPlay', 'endOfTurn', 'startOfTurn'] as const;
const EFFECT_KINDS = ['damage', 'heal', 'draw', 'buff', 'debuff', 'setStats', 'summon', 'conjure', 'applyStatus', 'energy', 'move', 'expel', 'forget', 'cleanse', 'extraAction', 'costMod', 'custom'] as const;
const EFFECT_STATUSES = ['burn', 'poison', 'sleep', 'freeze', 'shield', 'zombified', 'trueShield', 'taunt'] as const;
/** Keywords a `buff` effect can grant to its target (matches effectGrantKeywordsSchema). */
const BUFF_GRANT_KEYS = ['immunity', 'pierce', 'overshot', 'lethal', 'taunt', 'trueShield', 'airborne', 'battleReady', 'doubleStrike'] as const;
const ENV_LANE_OPTIONS = ['ground', 'heights', 'water'] as const;
const SUMMON_LANES = ['', 'heights', 'ground1', 'ground2', 'water'] as const;
/** Human labels for the effect kinds in the editor dropdown. */
const EFFECT_KIND_LABEL: Record<(typeof EFFECT_KINDS)[number], string> = {
  damage: 'Damage', heal: 'Heal', draw: 'Draw', buff: 'Buff (+stats)', debuff: 'Debuff (−stats)',
  setStats: 'Set stats (exact)',
  summon: 'Summon (unit to board)', conjure: 'Conjure (card to hand)', applyStatus: 'Apply status',
  energy: 'Energy / Bank', move: 'Move', expel: 'Expel (to hand)', forget: 'Forget (remove)',
  cleanse: 'Cleanse statuses', extraAction: 'Extra attack', costMod: 'Spell cost modifier', custom: 'Custom (note only)',
};

// Keywords grouped by editor shape.
const FLAG_KEYWORDS: (keyof Keywords)[] = [
  'lethal', 'overshot', 'pierce', 'sniper', 'branchShot', 'splashDamage', 'strikeThrough',
  'doubleStrike', 'airborne', 'battleReady', 'trueShield', 'taunt', 'immunity', 'doubleTeam',
  'zombified', 'brittle',
];
const NUM_KEYWORDS: (keyof Keywords)[] = ['shield', 'spike', 'tough'];
const STAT_KEYWORDS: (keyof Keywords)[] = ['growth'];

const KW_LABEL: Partial<Record<keyof Keywords, string>> = {
  lethal: 'Lethal', overshot: 'Overshot', pierce: 'Pierce', sniper: 'Sniper',
  branchShot: 'Branch Shot', splashDamage: 'Splash DMG', strikeThrough: 'Strike Through',
  doubleStrike: 'Double Strike', airborne: 'Airborne', battleReady: 'Battle Ready',
  trueShield: 'True Shield', taunt: 'Taunt',
  immunity: 'Immunity', doubleTeam: 'Double Team', zombified: 'Zombified',
  brittle: 'Brittle', shield: 'Shield', spike: 'Spike', tough: 'Tough',
  polish: 'Polish', growth: 'Growth',
};

// --- The editor's working form (forgiving: numbers held as the values themselves) ---

interface ElementCostEntry { type: Element; amount: number }

interface Form {
  id: string; // empty for a brand-new card (id minted on save)
  name: string;
  type: CardType;
  element: CardElement;
  text: string;
  costEnergy: number;
  costElements: ElementCostEntry[];
  attack: number;
  hp: number;
  keywords: Keywords;
  onHit: OnHit;
  grantStat: StatMod;
  grantKeywords: Keywords;
  effects: Effect[];
  /** Unit trigger sections: effects fired at entry / before attacking / end / start of turn. */
  triggers: Record<TriggerSection, Effect[]>;
  lanes: string[];
  tags: string[];
  wip: boolean;
}

const emptyTriggers = (): Record<TriggerSection, Effect[]> => ({
  onPlay: [], onAttack: [], endOfTurn: [], startOfTurn: [],
});

const blankForm = (type: CardType): Form => ({
  id: '',
  name: '',
  type,
  element: 'fire',
  text: '',
  costEnergy: 1,
  costElements: [],
  attack: 1,
  hp: 1,
  keywords: {},
  onHit: {},
  grantStat: {},
  grantKeywords: {},
  effects: type === 'spell' || type === 'environment' ? [{ kind: 'damage', amount: 2, target: 'enemy' }] : [],
  triggers: emptyTriggers(),
  lanes: [],
  tags: [],
  wip: false,
});

/**
 * Build the four trigger sections for a unit, folding the legacy keyword "effects"
 * (healer / debuff / mover / expel / producer) into the right section and stripping
 * them from `kw` (they are effects, not abilities). Mutates `kw`.
 */
const triggersFromCard = (card: Card, kw: Keywords): Record<TriggerSection, Effect[]> => {
  const t = emptyTriggers();
  // Already-authored trigger arrays on the card.
  for (const section of TRIGGER_SECTIONS) {
    const arr = (card as Record<string, unknown>)[section];
    if (Array.isArray(arr)) t[section] = structuredClone(arr) as Effect[];
  }
  const intoSection = (trigger: unknown, fallback: TriggerSection): TriggerSection =>
    (TRIGGER_SECTIONS as readonly string[]).includes(trigger as string) ? (trigger as TriggerSection) : fallback;
  const mapScope = (scope: string): TargetScope => (scope === 'either' ? 'any' : (scope as TargetScope));

  if (kw.healer) {
    t[intoSection(kw.healer.trigger, 'onPlay')].push({ kind: 'heal', amount: kw.healer.amount, target: kw.healer.target });
    delete kw.healer;
  }
  if (kw.producer) {
    t.endOfTurn.push({ kind: 'energyNext', amount: kw.producer.amount });
    delete kw.producer;
  }
  if (kw.debuff) {
    t.onPlay.push({ kind: 'debuff', stat: { attack: kw.debuff.attack ?? 0, hp: kw.debuff.hp ?? 0 }, target: kw.debuff.target ?? 'enemy' });
    delete kw.debuff;
  }
  if (kw.mover) {
    t[intoSection(kw.mover.trigger, 'onPlay')].push({ kind: 'move', target: mapScope(kw.mover.scope) });
    delete kw.mover;
  }
  if (kw.expel) {
    t.onPlay.push({ kind: 'expel', target: mapScope(kw.expel.scope) });
    delete kw.expel;
  }
  return t;
};

const formFromCard = (card: Card): Form => {
  const f = blankForm(card.type);
  f.id = card.id;
  f.name = card.name;
  f.element = card.element;
  f.text = card.text ?? '';
  f.costEnergy = card.cost.energy;
  f.costElements = card.cost.elements ? card.cost.elements.map((e) => ({ type: e.type, amount: e.amount })) : [];
  if (card.type === 'unit') {
    f.attack = card.attack;
    f.hp = card.hp;
    f.keywords = structuredClone(card.keywords);
    f.onHit = card.onHit ? structuredClone(card.onHit) : {};
    f.triggers = triggersFromCard(card, f.keywords);
  } else if (card.type === 'foundation') {
    f.attack = card.attack;
    f.hp = card.hp;
    f.keywords = structuredClone(card.keywords);
    f.onHit = card.onHit ? structuredClone(card.onHit) : {};
    f.grantStat = card.grants.stat ? structuredClone(card.grants.stat) : {};
    f.grantKeywords = card.grants.keywords ? structuredClone(card.grants.keywords) : {};
  } else {
    f.effects = structuredClone(card.effects);
    if (card.type === 'environment') {
      f.lanes = [...card.lanes];
      f.grantKeywords = card.grantKeywords ? structuredClone(card.grantKeywords) : {};
    }
  }
  f.tags = [...((card as { tags?: string[] }).tags ?? [])];
  f.wip = (card as { wip?: boolean }).wip ?? false;
  return f;
};

// --- Assemble a validated card object from the form ---------------------------

const compactStat = (s: StatMod): StatMod | undefined => {
  const out: StatMod = {};
  if (typeof s.attack === 'number') out.attack = s.attack;
  if (typeof s.hp === 'number') out.hp = s.hp;
  return Object.keys(out).length ? out : undefined;
};

const compactEffect = (e: Effect): Effect => {
  const out: Effect = { kind: e.kind };
  if (typeof e.amount === 'number') out.amount = e.amount;
  if (e.target) out.target = e.target;
  if (e.element) out.element = e.element;
  if (e.status) out.status = e.status;
  if (e.cardId) out.cardId = e.cardId;
  if (e.lane) out.lane = e.lane;
  if (typeof e.chain === 'number') out.chain = e.chain;
  if (e.chainDiminish) out.chainDiminish = true;
  if (e.cardType) out.cardType = e.cardType;
  if (e.chooseElement) out.chooseElement = true;
  if (e.keywords && Object.keys(e.keywords).length) out.keywords = e.keywords;
  const stat = e.stat ? compactStat(e.stat) : undefined;
  if (stat) out.stat = stat;
  if (e.note && e.note.trim()) out.note = e.note.trim();
  return out;
};

const buildCost = (f: Form): Cost => {
  const cost: Cost = { energy: f.costEnergy };
  if (f.costElements.length) cost.elements = f.costElements.map((e) => ({ type: e.type, amount: e.amount }));
  return cost;
};

const buildCard = (f: Form): Record<string, unknown> => {
  const base: Record<string, unknown> = {
    id: f.id,
    name: f.name.trim(),
    element: f.element,
    type: f.type,
    tags: f.tags.filter((a) => a.trim()),
    wip: f.wip,
  };
  if (f.text.trim()) base.text = f.text.trim();
  const cost = buildCost(f);

  if (f.type === 'unit') {
    const card: Record<string, unknown> = { ...base, cost, attack: f.attack, hp: f.hp, keywords: f.keywords };
    const onHit = compactOnHit(f.onHit);
    if (onHit) card.onHit = onHit;
    for (const section of TRIGGER_SECTIONS) {
      const arr = f.triggers[section].map(compactEffect);
      if (arr.length) card[section] = arr;
    }
    return card;
  }
  if (f.type === 'foundation') {
    const grants: Record<string, unknown> = {};
    const stat = compactStat(f.grantStat);
    if (stat) grants.stat = stat;
    if (Object.keys(f.grantKeywords).length) grants.keywords = f.grantKeywords;
    const card: Record<string, unknown> = { ...base, cost, attack: f.attack, hp: f.hp, keywords: f.keywords, grants };
    const onHit = compactOnHit(f.onHit);
    if (onHit) card.onHit = onHit;
    return card;
  }
  if (f.type === 'spell') {
    return { ...base, cost, effects: f.effects.map(compactEffect) };
  }
  // Environments need at least one effect; a keyword-grant-only environment gets a placeholder.
  const envEffects = f.effects.length
    ? f.effects.map(compactEffect)
    : [{ kind: 'custom', note: 'Persistent lane keyword grant' } as Effect];
  const env: Record<string, unknown> = { ...base, cost, lanes: f.lanes, effects: envEffects };
  if (Object.keys(f.grantKeywords).length) env.grantKeywords = f.grantKeywords;
  return env;
};

const compactOnHit = (o: OnHit): OnHit | undefined => {
  const out: OnHit = {};
  if (typeof o.burn === 'number') out.burn = o.burn;
  if (o.poison) out.poison = true;
  if (typeof o.sleep === 'number') out.sleep = o.sleep;
  if (o.freeze) out.freeze = true;
  return Object.keys(out).length ? out : undefined;
};

// =============================================================================
// --- Source export serializer -------------------------------------------------

/** Serialize a value into a compact inline TypeScript literal (matching starter.ts style). */
function compactTS(val: unknown, depth = 0): string {
  if (val === null) return 'null';
  if (typeof val === 'boolean') return String(val);
  if (typeof val === 'number') return String(val);
  if (typeof val === 'string') return `'${val.replace(/'/g, "\\'")}'`;
  if (Array.isArray(val)) {
    if (val.length === 0) return '[]';
    const items = val.map((v) => compactTS(v, depth + 1)).join(', ');
    return `[${items}]`;
  }
  if (typeof val === 'object') {
    const entries = Object.entries(val as Record<string, unknown>).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return '{}';
    const pairs = entries.map(([k, v]) => `${k}: ${compactTS(v, depth + 1)}`).join(', ');
    return `{ ${pairs} }`;
  }
  return String(val);
}

const SPECIAL_PREFIXES = ['__'];
const isSpecial = (id: string) => SPECIAL_PREFIXES.some((p) => id.startsWith(p));

/** Generate a rawCards TypeScript array string from the effective registry. */
function generateSourceTS(registry: import('@cards/registry').Registry): string {
  const cards = [...registry.cards.values()].filter((c) => !isSpecial(c.id));
  const lines = cards.map((c) => `  ${compactTS(c)},`);
  return `const rawCards = [\n${lines.join('\n')}\n];\n`;
}

// =============================================================================

type EditTarget =
  | { mode: 'new'; type: CardType }
  | { mode: 'edit'; card: Card }
  | { mode: 'duplicate'; card: Card }
  | { mode: 'editLeader'; leader: Leader };

type StudioSort = 'name' | 'cost' | 'hp' | 'atk';

const ABILITY_FILTER_KEYS: (keyof Keywords)[] = [
  'airborne','aquatic','bloodlust','branchShot','doubleStrike','doubleTeam',
  'expel','growth','healer','immunity','kamikaze','lethal','metamorphosis',
  'mover','overshot','polish','producer','sacrifice','shield','sniper',
  'smelt','spike','splashDamage','strikeThrough','taunt','tough','trueShield',
  'pierce','brittle','zombified',
];

function studioSortFn(sort: StudioSort) {
  return (a: Card, b: Card): number => {
    if (sort === 'name') return a.name.localeCompare(b.name);
    if (sort === 'cost') return (a.cost.energy - b.cost.energy) || a.name.localeCompare(b.name);
    if (sort === 'hp') {
      const ah = 'hp' in a ? (a as { hp: number }).hp : -1;
      const bh = 'hp' in b ? (b as { hp: number }).hp : -1;
      return bh - ah || a.name.localeCompare(b.name);
    }
    if (sort === 'atk') {
      const aa = (a.type === 'unit' || a.type === 'foundation') ? a.attack : -1;
      const ba = (b.type === 'unit' || b.type === 'foundation') ? b.attack : -1;
      return ba - aa || a.name.localeCompare(b.name);
    }
    return 0;
  };
}

export function CardStudio() {
  const { registry } = useContent();
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [copied, setCopied] = useState(false);
  const [section, setSection] = useState<'leaders' | 'cards'>('cards');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [query, setQuery] = useState('');
  const [filterElem, setFilterElem] = useState<'all' | Element>('all');
  const [filterType, setFilterType] = useState<'all' | CardType>('all');
  const [filterAbility, setFilterAbility] = useState<'all' | keyof Keywords>('all');
  const [filterTag, setFilterTag] = useState('all');
  const [sortBy, setSortBy] = useState<StudioSort>('name');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const allCards = useMemo(
    () => [...registry.cards.values()].filter((c) => c.id !== '__null__'),
    [registry],
  );

  const tags = useMemo(() => {
    const set = new Set<string>();
    for (const c of allCards) for (const a of (c as { tags: string[] }).tags) set.add(a);
    return [...set].sort();
  }, [allCards]);

  const cards = useMemo(() => {
    const q = query.toLowerCase();
    return allCards
      .filter((c) =>
        (filterType === 'all' || c.type === filterType) &&
        (filterElem === 'all' || c.element === filterElem) &&
        (filterAbility === 'all' || ((c.type === 'unit' || c.type === 'foundation') && filterAbility in c.keywords)) &&
        (filterTag === 'all' || (filterTag === '__wip__' ? (c as { wip?: boolean }).wip : (c as { tags: string[] }).tags.includes(filterTag))) &&
        (q === '' || c.name.toLowerCase().includes(q)),
      )
      .sort(studioSortFn(sortBy));
  }, [allCards, query, filterElem, filterType, filterAbility, filterTag, sortBy]);

  const exportSrc = useMemo(() => (showExport ? generateSourceTS(registry) : ''), [showExport, registry]);

  // Every hook must run on every render — this one sits above the `editing` early
  // return below, or opening an editor renders fewer hooks and React throws.
  const leaders = useMemo(() => [...registry.leaders.values()], [registry]);

  const handleCopy = () => {
    void navigator.clipboard.writeText(exportSrc).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (editing) {
    if (editing.mode === 'editLeader') {
      return <LeaderEditor leader={editing.leader} onClose={() => setEditing(null)} />;
    }
    const initial =
      editing.mode === 'new'
        ? blankForm(editing.type)
        : editing.mode === 'duplicate'
          ? { ...formFromCard(editing.card), id: '', name: `${editing.card.name} Copy` }
          : formFromCard(editing.card);
    return <CardEditor initial={initial} isEditExisting={editing.mode === 'edit'} onClose={() => setEditing(null)} />;
  }

  const grouped = filterType !== 'all'
    ? { [filterType]: cards } as Partial<Record<CardType, Card[]>>
    : Object.fromEntries(CARD_TYPES.map((t) => [t, cards.filter((c) => c.type === t)])) as Partial<Record<CardType, Card[]>>;

  return (
    <div className="studio">
      {showExport && (
        <div className="export-modal" onClick={(e) => { if (e.target === e.currentTarget) setShowExport(false); }}>
          <div className="export-modal__box">
            <div className="export-modal__head">
              <strong>Export to Source</strong>
              <span className="muted" style={{ fontSize: '0.8em' }}>
                Replace the <code>rawCards</code> array in <code>src/cards/data/starter.ts</code> with this.
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={handleCopy}>{copied ? '✓ Copied!' : 'Copy to Clipboard'}</button>
                <button className="btn-cancel" onClick={() => setShowExport(false)}>Close</button>
              </div>
            </div>
            <textarea ref={textareaRef} className="export-modal__ta" readOnly value={exportSrc} onClick={() => textareaRef.current?.select()} />
          </div>
        </div>
      )}

      {/* Top bar */}
      <div className="studio__head">
        {/* Section toggle */}
        <div className="studio__segtabs">
          <button className={section === 'leaders' ? 'studio__segtab studio__segtab--active' : 'studio__segtab'} onClick={() => setSection('leaders')}>
            Leaders <span className="studio__segtab-count">{leaders.length}</span>
          </button>
          <button className={section === 'cards' ? 'studio__segtab studio__segtab--active' : 'studio__segtab'} onClick={() => setSection('cards')}>
            Cards <span className="studio__segtab-count">{allCards.length}</span>
          </button>
        </div>

        <span style={{ flex: 1 }} />

        {/* Contextual action buttons */}
        {section === 'cards' && (
          <div className="studio__newbtns">
            {CARD_TYPES.map((t) => (
              <button key={t} onClick={() => setEditing({ mode: 'new', type: t })}>+ {t[0]!.toUpperCase() + t.slice(1)}</button>
            ))}
            <button onClick={() => { setShowExport(true); setCopied(false); }} title="Generate TypeScript source for all cards">Export</button>
            <button
              className="btn-cancel"
              title="Revert all edited base cards to their shipped versions"
              onClick={() => {
                const n = [...registry.cards.values()].filter((c) => store.isOverridden(c.id)).length;
                if (n === 0) { alert('No overridden cards to revert.'); return; }
                if (confirm(`Revert all ${n} edited base card(s) to their shipped versions?`)) store.revertAllOverrides();
              }}
            >Revert All</button>
          </div>
        )}

        {/* View toggle (cards only) */}
        {section === 'cards' && (
          <div className="studio__viewtoggle">
            <button className={viewMode === 'list' ? 'studio__viewbtn studio__viewbtn--active' : 'studio__viewbtn'} onClick={() => setViewMode('list')} title="List view">☰</button>
            <button className={viewMode === 'grid' ? 'studio__viewbtn studio__viewbtn--active' : 'studio__viewbtn'} onClick={() => setViewMode('grid')} title="Grid view">⊞</button>
          </div>
        )}
      </div>

      {/* ── LEADERS ── */}
      {section === 'leaders' && (
        <div className="studio__leadergrid">
          {leaders.map((l) => (
            <LeaderCard key={l.id} leader={l} registry={registry} onEdit={() => setEditing({ mode: 'editLeader', leader: l })} />
          ))}
        </div>
      )}

      {/* ── CARDS ── */}
      {section === 'cards' && (
        <>
          <div className="studio__filters">
            <input className="db__search" placeholder="Search by name…" value={query} onChange={(e) => setQuery(e.target.value)} />
            <select value={filterType} onChange={(e) => setFilterType(e.target.value as typeof filterType)}>
              <option value="all">All types</option>
              {CARD_TYPES.map((t) => <option key={t} value={t}>{t[0]!.toUpperCase() + t.slice(1)}</option>)}
            </select>
            <select value={filterElem} onChange={(e) => setFilterElem(e.target.value as typeof filterElem)}>
              <option value="all">All elements</option>
              {ELEMENTS.map((el) => <option key={el} value={el}>{el[0]!.toUpperCase() + el.slice(1)}</option>)}
            </select>
            <select value={filterAbility} onChange={(e) => setFilterAbility(e.target.value as typeof filterAbility)}>
              <option value="all">All abilities</option>
              {ABILITY_FILTER_KEYS.map((k) => <option key={k} value={k}>{ABILITY_INFO[k]?.name ?? k}</option>)}
            </select>
            <select value={filterTag} onChange={(e) => setFilterTag(e.target.value)}>
              <option value="all">All tags</option>
              <option value="__wip__">⚠ WIP</option>
              {tags.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as StudioSort)}>
              <option value="name">Sort: Name</option>
              <option value="cost">Sort: Cost</option>
              <option value="hp">Sort: HP</option>
              <option value="atk">Sort: ATK</option>
            </select>
          </div>

          {cards.length === 0 && <p className="muted" style={{ padding: '12px 0' }}>No cards match the current filters.</p>}

          {viewMode === 'list'
            ? (Object.entries(grouped) as [CardType, Card[]][])
                .filter(([, list]) => list.length > 0)
                .map(([t, list]) => (
                  <div key={t}>
                    <h3 className="studio__group">{t[0]!.toUpperCase() + t.slice(1)}s ({list.length})</h3>
                    <div className="studio__list">
                      {list.map((c) => (
                        <StudioRow key={c.id} card={c} onEdit={() => setEditing({ mode: 'edit', card: c })} onDup={() => setEditing({ mode: 'duplicate', card: c })} />
                      ))}
                    </div>
                  </div>
                ))
            : (Object.entries(grouped) as [CardType, Card[]][])
                .filter(([, list]) => list.length > 0)
                .map(([t, list]) => (
                  <div key={t}>
                    <h3 className="studio__group">{t[0]!.toUpperCase() + t.slice(1)}s ({list.length})</h3>
                    <div className="studio__cardgrid">
                      {list.map((c) => (
                        <StudioGridCard key={c.id} card={c} onEdit={() => setEditing({ mode: 'edit', card: c })} onDup={() => setEditing({ mode: 'duplicate', card: c })} />
                      ))}
                    </div>
                  </div>
                ))
          }
        </>
      )}
    </div>
  );
}

function StudioRow({ card, onEdit, onDup }: { card: Card; onEdit: () => void; onDup: () => void }) {
  const custom = store.isCustomCard(card.id);
  const overridden = store.isOverridden(card.id);
  const stats = card.type === 'unit' ? `${card.attack}/${card.hp}` : card.type === 'foundation' ? `${card.attack}/${card.hp}` : card.type;
  const kwLine = cardAbilityLine(card);
  return (
    <div className="studiorow">
      <span className={`chip chip--${card.element}`}>{formatCost(card.cost)}</span>
      <span className="studiorow__name">{card.name}</span>
      <span className="studiorow__stats muted">{stats}</span>
      {kwLine && <span className="studiorow__kw">{kwLine}</span>}
      {custom && <span className="tag tag--custom">custom</span>}
      {overridden && <span className="tag tag--edited">edited</span>}
      <span className="studiorow__spacer" />
      <button onClick={onEdit}>Edit</button>
      <button onClick={onDup}>Duplicate</button>
      {overridden && <button onClick={() => store.resetCard(card.id)} title="Revert to the shipped version">Revert</button>}
      <button
        className="btn-cancel"
        onClick={() => {
          if (confirm(`Delete ${card.name}? ${store.isBaseCard(card.id) ? 'Base cards are hidden and can be restored by reverting.' : ''}`))
            store.deleteCard(card.id);
        }}
      >
        Delete
      </button>
    </div>
  );
}

function LeaderCard({ leader, registry, onEdit }: { leader: Leader; registry: import('@cards/registry').Registry; onEdit: () => void }) {
  const overridden = store.isOverriddenLeader(leader.id);
  const sig = registry.cards.get(leader.signatureCardId);
  const skillText = leader.heroPower.text ?? leader.heroPower.effects.map(effectLine).join('; ');

  return (
    <div className={`leadercard leadercard--${leader.element}`}>
      <div className="leadercard__header">
        <span className="leadercard__icon"><ElementRune element={leader.element} size={20} /></span>
        <span className="leadercard__name">{leader.name}</span>
        {overridden && <span className="tag tag--edited">edited</span>}
        <button className="leadercard__editbtn" onClick={onEdit}>Edit</button>
        {overridden && <button className="leadercard__revertbtn" onClick={() => store.resetLeader(leader.id)}>Revert</button>}
      </div>

      <div className="leadercard__body">
        <div className="leadercard__stats">
          <span className="leadercard__hp">{leader.hp} HP</span>
          <span className="leadercard__sig-unlock">Sig @ ≤15 HP</span>
        </div>

        {/* Element banking caps */}
        <div className="leadercard__caps">
          {ELEMENTS.map((el) => (
            <div key={el} className={`leadercard__cap leadercard__cap--${el}`}>
              <span className="leadercard__cap-icon"><ElementRune element={el} size={15} /></span>
              <span className="leadercard__cap-val">{leader.elementCaps[el]}</span>
            </div>
          ))}
        </div>

        {/* Hero power */}
        <div className="leadercard__skill">
          <div className="leadercard__skill-head">
            <span className="leadercard__skill-name">{leader.heroPower.name}</span>
            <span className="leadercard__skill-cost">↯{leader.heroPower.cost.energy}</span>
          </div>
          <div className="leadercard__skill-text">{skillText}</div>
        </div>

        {/* Signature card */}
        <div className="leadercard__sigcard">
          <span className="leadercard__sigcard-label">★ Signature</span>
          {sig
            ? <span className={`leadercard__sigcard-name chip chip--${sig.element}`}>{sig.name}</span>
            : <span className="muted">{leader.signatureCardId}</span>
          }
        </div>
      </div>
    </div>
  );
}

function StudioGridCard({ card, onEdit, onDup }: { card: Card; onEdit: () => void; onDup: () => void }) {
  const custom = store.isCustomCard(card.id);
  const overridden = store.isOverridden(card.id);
  return (
    <div className="studio-gridcard">
      <MiniCard card={card} />
      <div className="studio-gridcard__actions">
        <button onClick={onEdit}>Edit</button>
        <button onClick={onDup}>Dup</button>
        {(custom || overridden) && (
          <button className="btn-cancel" onClick={() => {
            if (confirm(`Delete ${card.name}?`)) store.deleteCard(card.id);
          }}>Del</button>
        )}
      </div>
      <div className="studio-gridcard__tags">
        {custom && <span className="tag tag--custom">custom</span>}
        {overridden && <span className="tag tag--edited">edited</span>}
      </div>
    </div>
  );
}

// --- Small input helpers ------------------------------------------------------

function Num({ label, value, onChange, min, step = 1 }: { label: string; value: number; onChange: (n: number) => void; min?: number; step?: number }) {
  return (
    <label className="fld">
      <span>{label}</span>
      <input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        min={min}
        step={step}
        onChange={(e) => onChange(e.target.value === '' ? 0 : Math.trunc(Number(e.target.value)))}
      />
    </label>
  );
}

function Text({ label, value, onChange, area }: { label: string; value: string; onChange: (s: string) => void; area?: boolean }) {
  return (
    <label className="fld fld--text">
      <span>{label}</span>
      {area ? (
        <textarea value={value} rows={2} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </label>
  );
}

function Sel<T extends string>({ label, value, options, onChange, labels }: { label: string; value: T; options: readonly T[]; onChange: (v: T) => void; labels?: Partial<Record<T, string>> }) {
  return (
    <label className="fld">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o} value={o}>{labels?.[o] ?? o}</option>
        ))}
      </select>
    </label>
  );
}

// Optional stat-mod pair (attack / hp) with a master toggle.
function StatModFields({ value, onChange }: { value: StatMod; onChange: (v: StatMod) => void }) {
  return (
    <div className="statmod">
      <Num label="+ATK" value={value.attack ?? 0} onChange={(n) => onChange({ ...value, attack: n })} />
      <Num label="+HP" value={value.hp ?? 0} onChange={(n) => onChange({ ...value, hp: n })} />
    </div>
  );
}

// =============================================================================

function ElementCostEditor({ value, onChange }: { value: ElementCostEntry[]; onChange: (v: ElementCostEntry[]) => void }) {
  const add = () => onChange([...value, { type: 'fire', amount: 1 }]);
  const remove = (i: number) => onChange(value.filter((_, j) => j !== i));
  const update = (i: number, patch: Partial<ElementCostEntry>) =>
    onChange(value.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  return (
    <div className="elemcost">
      <div className="elemcost__head">
        <span className="muted" style={{ fontSize: 12 }}>Element costs (banked)</span>
        <button onClick={add}>+ Add element cost</button>
      </div>
      {value.map((e, i) => (
        <div key={i} className="elemcost__row">
          <Sel label="Type" value={e.type} options={ELEMENTS} onChange={(v) => update(i, { type: v })} />
          <Num label="Amount" value={e.amount} min={1} onChange={(n) => update(i, { amount: Math.max(1, n) })} />
          <button className="btn-cancel" onClick={() => remove(i)}>✕</button>
        </div>
      ))}
      {value.length === 0 && <p className="muted" style={{ fontSize: 12, margin: '2px 0' }}>None — generic energy only.</p>}
    </div>
  );
}

/**
 * Auto cost calculator panel: shows the card's estimated budget value, the suggested
 * energy cost (net of element pips), and a button to apply it to the Energy field.
 */
function CostEstimate({
  estimate,
  costEnergy,
  onApply,
}: {
  estimate: { value: number; energy: number; pips: number; elements: { type: string; amount: number }[] } | null;
  costEnergy: number;
  onApply: (energy: number) => void;
}) {
  if (!estimate) {
    return (
      <div className="cost-estimate cost-estimate--na">
        <span className="muted" style={{ fontSize: 12 }}>Cost estimate unavailable for this card.</span>
      </div>
    );
  }
  const matches = costEnergy === estimate.energy;
  return (
    <div className="cost-estimate" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', margin: '6px 0' }}>
      <span title="Total budget value computed from this card's stats, keywords, on-hit, and effects">
        ⚖ Estimated value: <strong>{estimate.value.toFixed(2)}</strong>
      </span>
      <span className="muted">→ suggested energy: <strong>{estimate.energy}</strong></span>
      <span
        className="muted"
        title="One pip per ability, charged in that ABILITY's element (see the ability->element map in docs/card-creation-guide.txt) — so a Fire body with Taunt pays an Earth pip. Off-element abilities make a card expensive for the wrong leader, never uncastable: generic energy covers any shortfall."
      >
        · suggested pips:{' '}
        <strong>
          {estimate.elements.length
            ? estimate.elements.map((e) => `${e.amount}${e.type[0]!.toUpperCase()}`).join(' + ')
            : estimate.pips}
        </strong>
      </span>
      <button type="button" onClick={() => onApply(estimate.energy)} disabled={matches}>
        {matches ? '✓ Energy matches' : `Apply ${estimate.energy} energy`}
      </button>
      {!matches && (
        <span className="muted" style={{ fontSize: 12 }}>
          (currently {costEnergy})
        </span>
      )}
    </div>
  );
}

/** A collapsible editor section with a header that toggles its body. */
function Section({ title, children, defaultOpen = true, summary }: { title: string; children: React.ReactNode; defaultOpen?: boolean; summary?: string }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`editor__section ${open ? '' : 'editor__section--collapsed'}`}>
      <button type="button" className="editor__sectionhead" onClick={() => setOpen((o) => !o)}>
        <span className="editor__caret">{open ? '▾' : '▸'}</span>
        <span className="editor__sectitle">{title}</span>
        {summary && !open && <span className="editor__secsummary muted">{summary}</span>}
      </button>
      {open && <div className="editor__secbody">{children}</div>}
    </section>
  );
}

/** Live card-face preview built from the editor form (re-renders as you type). */
function StudioCardPreview({ form }: { form: Form }) {
  let card: Card | null = null;
  try {
    card = buildCard({ ...form, id: form.id || '__preview__', name: form.name || 'Unnamed' }) as unknown as Card;
  } catch {
    card = null;
  }
  const kwLine = card ? cardAbilityLine(card) : '';
  const isUnitish = form.type === 'unit' || form.type === 'foundation';
  const triggerLines: { label: string; effects: Effect[] }[] = form.type === 'unit'
    ? TRIGGER_SECTIONS.map((s) => ({ label: TRIGGER_SECTION_LABEL[s], effects: form.triggers[s] })).filter((t) => t.effects.length)
    : [];
  const onHitKeys = Object.entries(form.onHit).filter(([, v]) => v !== undefined && v !== false);
  return (
    <div className={`cardpreview cardpreview--${form.element}`}>
      <div className="cardpreview__top">
        <span className={`chip chip--${form.element}`}>{formatCost(buildCost(form))}</span>
        <span className="cardpreview__type"><ElementRune element={form.element} size={14} /> {form.type}</span>
        {form.wip && <span className="chip chip--wip">⚠ WIP</span>}
      </div>
      <div className="cardpreview__name">{form.name || <span className="muted">Unnamed</span>}</div>
      {isUnitish && (
        <div className="cardpreview__stats">
          <span className="stat stat--atk"><span className="stat__icon">⚔</span><span className="stat__num stat__num--atk">{form.attack}</span></span>
          <span className="stat stat--hp"><span className="stat__icon">❤</span><span className="stat__num stat__num--hp">{form.hp}</span></span>
        </div>
      )}
      {kwLine && <div className="cardpreview__kw">{kwLine}</div>}
      {onHitKeys.length > 0 && (
        <div className="cardpreview__line">✦ On-hit: {onHitKeys.map(([k, v]) => `${k}${typeof v === 'number' && v > 0 ? ` ${v}` : ''}`).join(', ')}</div>
      )}
      {triggerLines.map((t) => (
        <div key={t.label} className="cardpreview__line"><b>{t.label}:</b> {t.effects.map(effectLine).join(' · ')}</div>
      ))}
      {form.type === 'foundation' && (form.grantStat.attack || form.grantStat.hp || Object.keys(form.grantKeywords).length > 0) && (
        <div className="cardpreview__line"><b>Grants:</b> {[form.grantStat.attack ? `+${form.grantStat.attack} atk` : '', form.grantStat.hp ? `+${form.grantStat.hp} hp` : '', ...Object.keys(form.grantKeywords).map((k) => KW_LABEL[k as keyof Keywords] ?? k)].filter(Boolean).join(', ')}</div>
      )}
      {form.text.trim() && <div className="cardpreview__text">{form.text}</div>}
      {form.tags.length > 0 && <div className="cardpreview__tags">{form.tags.map((t) => <span key={t} className="chip chip--archetype">{t}</span>)}</div>}
      {!card && <div className="cardpreview__invalid">Preview unavailable — finish required fields.</div>}
    </div>
  );
}

function CardEditor({ initial, isEditExisting, onClose }: { initial: Form; isEditExisting: boolean; onClose: () => void }) {
  const { registry } = useContent();
  const [f, setF] = useState<Form>(initial);
  const [error, setError] = useState('');
  const set = <K extends keyof Form>(key: K, val: Form[K]) => setF((prev) => ({ ...prev, [key]: val }));

  const setKw = (next: Keywords) => set('keywords', next);
  const setGrantKw = (next: Keywords) => set('grantKeywords', next);

  // Live cost estimate from the balancing table (src/cards/budget.ts).
  const estimate = useMemo(() => {
    try {
      const built = buildCard({ ...f, id: f.id || '__preview__' });
      const lookup = (id: string) => registry.cards.get(id);
      return {
        value: cardBudgetValue(built, lookup),
        energy: recommendedEnergy(built, lookup),
        pips: recommendedPips(built, lookup),
        elements: recommendedElements(built, lookup),
      };
    } catch {
      return null;
    }
  }, [f, registry]);

  const save = () => {
    const id = f.id || store.makeCardId(f.name || 'card');
    try {
      const card = store.saveCard(buildCard({ ...f, id }));
      void card;
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const isUnit = f.type === 'unit';
  const isFoundation = f.type === 'foundation';
  const isSpellish = f.type === 'spell' || f.type === 'environment';

  return (
    <div className="editor editor--split">
      <div className="editor__form">
        <div className="editor__head">
          <h2>{isEditExisting ? `Edit ${initial.name}` : `New ${f.type}`}</h2>
          <span className="editor__spacer" />
          <button onClick={onClose}>Cancel</button>
        </div>
        {error && <div className="errmsg editor__err">{error}</div>}

        <Section title="Basics">
          <div className="fldrow">
            <Text label="Name" value={f.name} onChange={(v) => set('name', v)} />
            {!isEditExisting && <Sel label="Type" value={f.type} options={CARD_TYPES} onChange={(v) => set('type', v)} />}
            {/* CARD_ELEMENTS, not ELEMENTS: a card may be Neutral. Cost pips and effect elements
                below stay to the four real elements — there is no neutral pip to pay or bank. */}
            <Sel label="Element" value={f.element} options={CARD_ELEMENTS} onChange={(v) => set('element', v)} />
          </div>
          <div className="fldrow">
            <Num label="Energy cost" value={f.costEnergy} min={0} onChange={(n) => set('costEnergy', n)} />
          </div>
          <ElementCostEditor value={f.costElements} onChange={(v) => set('costElements', v)} />
          <Text label="Rules text (optional)" value={f.text} onChange={(v) => set('text', v)} area />
        </Section>

        {(isUnit || isFoundation) && (
          <Section title="Stats" summary={`${f.attack} / ${f.hp}`}>
            <div className="fldrow">
              <Num label="Attack" value={f.attack} min={0} onChange={(n) => set('attack', n)} />
              <Num label="HP" value={f.hp} min={1} onChange={(n) => set('hp', n)} />
            </div>
          </Section>
        )}

        {(isUnit || isFoundation) && (
          <>
            <Section title="Keywords" summary={summarizeKeywords(f.keywords)}>
              <KeywordsEditor kw={f.keywords} onChange={setKw} />
            </Section>
            <Section title="On Hit" summary="status inflicted when it strikes" defaultOpen={false}>
              <OnHitEditor value={f.onHit} onChange={(v) => set('onHit', v)} />
            </Section>
          </>
        )}

        {isUnit && (
          <Section title="Triggered effects" summary="entry / attack / turn effects" defaultOpen={false}>
            <p className="muted" style={{ marginTop: 0, fontSize: 12 }}>
              Add effects under the trigger when they should fire (heal, debuff, move, expel, produce energy, damage, buff, draw…).
            </p>
            {TRIGGER_SECTIONS.map((section) => (
              <TriggerEffectsBlock
                key={section}
                section={section}
                effects={f.triggers[section]}
                onChange={(v) => set('triggers', { ...f.triggers, [section]: v })}
              />
            ))}
          </Section>
        )}

        {isFoundation && (
          <Section title="Grants to the unit on top">
            <div className="subhead">Stat bonus</div>
            <StatModFields value={f.grantStat} onChange={(v) => set('grantStat', v)} />
            <div className="subhead">Granted keywords &amp; abilities</div>
            <KeywordsEditor kw={f.grantKeywords} onChange={setGrantKw} passives />
          </Section>
        )}

        {isSpellish && (
          <Section title={f.type === 'environment' ? 'Environment' : 'Spell effects'}>
            {f.type === 'environment' && (
              <div className="fldrow" style={{ flexDirection: 'column', gap: 4 }}>
                <span className="muted" style={{ fontSize: 12 }}>
                  Lane restrictions — leave all unchecked for <strong>Ground only</strong> (the default).
                  Water and Heights must be opted into explicitly.
                </span>
                <div style={{ display: 'flex', gap: 12 }}>
                  {ENV_LANE_OPTIONS.map((opt) => (
                    <label key={opt} className="kwflag">
                      <input
                        type="checkbox"
                        checked={f.lanes.includes(opt)}
                        onChange={(e) => set('lanes', e.target.checked ? [...f.lanes, opt] : f.lanes.filter((l) => l !== opt))}
                      />
                      {opt[0]!.toUpperCase() + opt.slice(1)}
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div className="subhead">{f.type === 'environment' ? 'On-enter effects (applied to each unit entering the lane)' : 'Effects'}</div>
            <EffectsEditor effects={f.effects} onChange={(v) => set('effects', v)} allowEmpty={f.type === 'environment'} />
            {f.type === 'environment' && (
              <>
                <div className="subhead" style={{ marginTop: 12 }}>Granted keywords (persist on every unit in the lane)</div>
                <KeywordsEditor kw={f.grantKeywords} onChange={(v) => set('grantKeywords', v)} passives />
              </>
            )}
          </Section>
        )}

        <Section title="Tags &amp; status" defaultOpen={false} summary={[...f.tags, f.wip ? 'WIP' : ''].filter(Boolean).join(', ') || 'none'}>
          <TagsEditor value={f.tags} onChange={(v) => set('tags', v)} />
          <label className="kwflag" style={{ marginTop: 8 }}>
            <input type="checkbox" checked={f.wip} onChange={(e) => set('wip', e.target.checked)} />
            Mark as WIP (mechanic not yet fully implemented)
          </label>
        </Section>
      </div>

      <aside className="editor__side">
        <StudioCardPreview form={f} />
        <CostEstimate estimate={estimate} costEnergy={f.costEnergy} onApply={(energy) => set('costEnergy', energy)} />
        <div className="editor__actions">
          <button className="btn-end" onClick={save}>⤓ Save {f.type}</button>
          <button onClick={onClose}>Cancel</button>
        </div>
      </aside>
    </div>
  );
}

/** One-line summary of which keywords are set, for a collapsed section header. */
function summarizeKeywords(kw: Keywords): string {
  const names = Object.keys(kw).map((k) => KW_LABEL[k as keyof Keywords] ?? ABILITY_INFO[k as keyof Keywords]?.name ?? k);
  return names.length ? names.join(', ') : 'none';
}

// --- Archetype editor ---------------------------------------------------------

function TagsEditor({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [input, setInput] = useState('');
  const add = () => {
    const tag = input.trim();
    if (!tag || value.includes(tag)) return;
    onChange([...value, tag]);
    setInput('');
  };
  const remove = (tag: string) => onChange(value.filter((a) => a !== tag));
  return (
    <div className="archetype-editor">
      <div className="archetype-editor__tags">
        {value.map((a) => (
          <span key={a} className="chip chip--archetype archetype-editor__tag">
            {a}
            <button className="archetype-editor__remove" onClick={() => remove(a)} title="Remove">×</button>
          </span>
        ))}
        {value.length === 0 && <span className="muted">No tags</span>}
      </div>
      <div className="fldrow" style={{ marginTop: 6 }}>
        <input
          className="db__search"
          placeholder="Add tag…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          style={{ flex: 1 }}
        />
        <button onClick={add}>Add</button>
      </div>
    </div>
  );
}

// --- Keyword editor -----------------------------------------------------------

function KeywordsEditor({ kw, onChange, passives }: { kw: Keywords; onChange: (k: Keywords) => void; passives?: boolean }) {
  const toggleFlag = (key: keyof Keywords) => {
    const next = { ...kw };
    if (next[key]) delete next[key];
    else (next as Record<string, unknown>)[key] = true;
    onChange(next);
  };
  const setKey = (key: keyof Keywords, value: unknown) => {
    const next = { ...kw };
    if (value === undefined) delete next[key];
    else (next as Record<string, unknown>)[key] = value;
    onChange(next);
  };

  return (
    <div className="kwedit">
      <div className="kwflags">
        {FLAG_KEYWORDS.map((k) => (
          <label key={k} className="kwflag">
            <input type="checkbox" checked={Boolean(kw[k])} onChange={() => toggleFlag(k)} />
            {KW_LABEL[k]}
          </label>
        ))}
      </div>

      <div className="kwnums">
        {NUM_KEYWORDS.map((k) => {
          const on = typeof kw[k] === 'number';
          return (
            <div key={k} className="kwparam">
              <label className="kwflag">
                <input type="checkbox" checked={on} onChange={() => setKey(k, on ? undefined : 1)} />
                {KW_LABEL[k]}
              </label>
              {on && <Num label="N" value={kw[k] as number} min={1} onChange={(n) => setKey(k, Math.max(1, n))} />}
            </div>
          );
        })}
        {STAT_KEYWORDS.map((k) => {
          const on = Boolean(kw[k]);
          const val = (kw[k] as StatMod) ?? {};
          return (
            <div key={k} className="kwparam">
              <label className="kwflag">
                <input type="checkbox" checked={on} onChange={() => setKey(k, on ? undefined : { attack: 0, hp: 1 })} />
                {KW_LABEL[k]}
              </label>
              {on && <StatModFields value={val} onChange={(v) => setKey(k, v)} />}
            </div>
          );
        })}
      </div>

      <SpecialKeywords kw={kw} setKey={setKey} passives={passives} />
    </div>
  );
}

function SpecialKeywords({ kw, setKey, passives }: { kw: Keywords; setKey: (k: keyof Keywords, v: unknown) => void; passives?: boolean }) {
  const { registry } = useContent();
  const unitCards = useMemo(
    () => [...registry.cards.values()].filter((c) => c.type === 'unit' && c.id !== '__null__').sort((a, b) => a.name.localeCompare(b.name)),
    [registry],
  );
  const sacrifice = kw.sacrifice;
  const bloodlust = kw.bloodlust;
  const polish = kw.polish;
  const meta = kw.metamorphosis;
  const smelt = kw.smelt;
  const healer = kw.healer;
  const producer = kw.producer;

  return (
    <div className="kwspecial">
      {/* Aquatic — can use Water lane; optional effects fire on entering Water */}
      <ToggleBlock
        label="Aquatic"
        on={Boolean(kw.aquatic)}
        onToggle={(on) => setKey('aquatic', on || undefined)}
      >
        {kw.aquatic && (
          <>
            <p className="muted" style={{ margin: '2px 0 4px', fontSize: 12 }}>Effects on entering Water lane (optional):</p>
            <EffectsEditor
              effects={Array.isArray(kw.aquatic) ? kw.aquatic : []}
              onChange={(effs) => setKey('aquatic', effs.length ? effs : true)}
              allowEmpty
            />
          </>
        )}
      </ToggleBlock>

      {/* Sacrifice */}
      <ToggleBlock label="Sacrifice" on={Boolean(sacrifice)} onToggle={(on) => setKey('sacrifice', on ? { max: 1, buff: { attack: 1, hp: 1 } } : undefined)}>
        {sacrifice && (
          <div className="fldrow">
            <Num label="Max" value={sacrifice.max} min={1} onChange={(n) => setKey('sacrifice', { ...sacrifice, max: Math.max(1, n) })} />
            <StatModFields value={sacrifice.buff} onChange={(v) => setKey('sacrifice', { ...sacrifice, buff: v })} />
          </div>
        )}
      </ToggleBlock>

      {/* Polish — stat gained + effects run every time this unit takes damage */}
      <ToggleBlock label="Polish (on damage)" on={Boolean(polish)} onToggle={(on) => setKey('polish', on ? { stat: { attack: 0, hp: 1 } } : undefined)}>
        {polish && (
          <>
            <div className="subhead">Stat gain</div>
            <StatModFields value={polish.stat ?? {}} onChange={(v) => setKey('polish', { ...polish, stat: v })} />
            <div className="subhead" style={{ marginTop: 6 }}>Effects (optional)</div>
            <EffectsEditor
              effects={polish.effects ?? []}
              onChange={(effs) => setKey('polish', { ...polish, effects: effs.length ? effs : undefined })}
              allowEmpty
            />
          </>
        )}
      </ToggleBlock>

      {/* Bloodlust — stat buff + effects run on each kill */}
      <ToggleBlock label="Bloodlust (on kill)" on={Boolean(bloodlust)} onToggle={(on) => setKey('bloodlust', on ? { buff: { attack: 1, hp: 1 } } : undefined)}>
        {bloodlust && (
          <>
            <div className="subhead">Stat buff per kill</div>
            <StatModFields value={bloodlust.buff ?? {}} onChange={(v) => setKey('bloodlust', { ...bloodlust, buff: v })} />
            <div className="subhead" style={{ marginTop: 6 }}>Effects (optional)</div>
            <EffectsEditor
              effects={bloodlust.effects ?? []}
              onChange={(effs) => setKey('bloodlust', { ...bloodlust, effects: effs.length ? effs : undefined })}
              allowEmpty
            />
          </>
        )}
      </ToggleBlock>

      {/* Metamorphosis */}
      <ToggleBlock label="Metamorphosis (transforms over time)" on={Boolean(meta)} onToggle={(on) => setKey('metamorphosis', on ? { everyTurns: 2 } : undefined)}>
        {meta && (
          <>
            <div className="fldrow">
              <Num label="Every N turns" value={meta.everyTurns} min={1} onChange={(n) => setKey('metamorphosis', { ...meta, everyTurns: Math.max(1, n) })} />
              <CardSelect label="Into (transform target)" value={meta.into} cards={unitCards} onChange={(v) => setKey('metamorphosis', { ...meta, into: v || undefined })} />
            </div>
            <div className="subhead">Stat gain on transform (optional)</div>
            <StatModFields value={meta.gains ?? {}} onChange={(v) => setKey('metamorphosis', { ...meta, gains: (v.attack || v.hp) ? v : undefined })} />
          </>
        )}
      </ToggleBlock>

      {/* Kamikaze — a single effect on death */}
      <ToggleBlock label="Kamikaze (effect on death)" on={Boolean(kw.kamikaze)} onToggle={(on) => setKey('kamikaze', on ? { kind: 'damage', amount: 2, target: 'enemy' } : undefined)}>
        {kw.kamikaze && <EffectRow effect={kw.kamikaze} onChange={(e) => setKey('kamikaze', e)} onRemove={() => setKey('kamikaze', undefined)} hideRemove />}
      </ToggleBlock>

      {/* Smelt — pay HP each turn to run an effect */}
      <ToggleBlock
        label="Smelt (pay HP each turn for an effect)"
        on={Boolean(smelt)}
        onToggle={(on) => setKey('smelt', on ? { hpCost: 1, effect: { kind: 'damage', amount: 2, target: 'enemy' } } : undefined)}
      >
        {smelt && (
          <>
            <Num label="HP cost / turn" value={smelt.hpCost} min={1} onChange={(n) => setKey('smelt', { ...smelt, hpCost: Math.max(1, n) })} />
            <EffectRow effect={smelt.effect} onChange={(e) => setKey('smelt', { ...smelt, effect: e })} onRemove={() => {}} hideRemove />
          </>
        )}
      </ToggleBlock>

      {/* Passive abilities — only meaningful as keywords on a body or a grant (Healer/Producer). */}
      {passives && (
        <>
          <ToggleBlock
            label="Healer (heals on a trigger)"
            on={Boolean(healer)}
            onToggle={(on) => setKey('healer', on ? { amount: 2, target: 'leader', trigger: 'endOfTurn' } : undefined)}
          >
            {healer && (
              <div className="fldrow">
                <Num label="Amount" value={healer.amount} min={1} onChange={(n) => setKey('healer', { ...healer, amount: Math.max(1, n) })} />
                <Sel label="Target" value={healer.target} options={SCOPES} onChange={(v) => setKey('healer', { ...healer, target: v })} />
                <Sel label="Trigger" value={healer.trigger as (typeof HEALER_TRIGGERS)[number]} options={HEALER_TRIGGERS} onChange={(v) => setKey('healer', { ...healer, trigger: v })} />
              </div>
            )}
          </ToggleBlock>

          <ToggleBlock
            label="Producer (produces energy each turn)"
            on={Boolean(producer)}
            onToggle={(on) => setKey('producer', on ? { amount: 1 } : undefined)}
          >
            {producer && (
              <div className="fldrow">
                <Num label="Amount" value={producer.amount} min={1} onChange={(n) => setKey('producer', { ...producer, amount: Math.max(1, n) })} />
              </div>
            )}
          </ToggleBlock>
        </>
      )}
    </div>
  );
}

function ToggleBlock({ label, on, onToggle, children }: { label: string; on: boolean; onToggle: (on: boolean) => void; children?: React.ReactNode }) {
  return (
    <div className="toggleblock">
      <label className="kwflag">
        <input type="checkbox" checked={on} onChange={(e) => onToggle(e.target.checked)} />
        <b>{label}</b>
      </label>
      {on && <div className="toggleblock__body">{children}</div>}
    </div>
  );
}

function OnHitEditor({ value, onChange }: { value: OnHit; onChange: (v: OnHit) => void }) {
  const set = (patch: Partial<OnHit>) => onChange({ ...value, ...patch });
  return (
    <div className="kwparam onhit">
      <div className="kwparam">
        <label className="kwflag">
          <input type="checkbox" checked={typeof value.burn === 'number'} onChange={(e) => set({ burn: e.target.checked ? 1 : undefined })} />
          Burn
        </label>
        {typeof value.burn === 'number' && <Num label="N" value={value.burn} min={1} onChange={(n) => set({ burn: Math.max(1, n) })} />}
      </div>
      <label className="kwflag">
        <input type="checkbox" checked={Boolean(value.poison)} onChange={(e) => set({ poison: e.target.checked || undefined })} />
        Poison
      </label>
      <div className="kwparam">
        <label className="kwflag">
          <input type="checkbox" checked={typeof value.sleep === 'number'} onChange={(e) => set({ sleep: e.target.checked ? 0 : undefined })} />
          Sleep
        </label>
        {typeof value.sleep === 'number' && <Num label="heal/turn" value={value.sleep} min={0} onChange={(n) => set({ sleep: Math.max(0, n) })} />}
      </div>
      <label className="kwflag">
        <input type="checkbox" checked={Boolean(value.freeze)} onChange={(e) => set({ freeze: e.target.checked || undefined })} />
        Freeze
      </label>
    </div>
  );
}

// --- Effects editor -----------------------------------------------------------

function EffectsEditor({ effects, onChange, allowEmpty }: { effects: Effect[]; onChange: (e: Effect[]) => void; allowEmpty?: boolean }) {
  const update = (i: number, e: Effect) => onChange(effects.map((x, j) => (j === i ? e : x)));
  const remove = (i: number) => onChange(effects.filter((_, j) => j !== i));
  const add = () => onChange([...effects, { kind: 'damage', amount: 2, target: 'enemy' }]);
  return (
    <div className="effects">
      {effects.map((e, i) => (
        <EffectRow key={i} effect={e} onChange={(ne) => update(i, ne)} onRemove={() => remove(i)} />
      ))}
      <button onClick={add}>+ Add effect</button>
      {effects.length === 0 && !allowEmpty && <span className="errmsg">At least one effect is required.</span>}
    </div>
  );
}

/** One of the four trigger sections ("At entry", etc.) holding a list of effects. */
function TriggerEffectsBlock({ section, effects, onChange }: { section: TriggerSection; effects: Effect[]; onChange: (e: Effect[]) => void }) {
  return (
    <div className="toggleblock">
      <div className="subhead" style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <b>{TRIGGER_SECTION_LABEL[section]}</b>
        <span className="muted" style={{ fontSize: 11 }}>{TRIGGER_SECTION_HINT[section]}</span>
      </div>
      <div className="toggleblock__body">
        {effects.length === 0 && <p className="muted" style={{ margin: '2px 0', fontSize: 12 }}>No effects.</p>}
        <EffectsEditor effects={effects} onChange={onChange} allowEmpty />
      </div>
    </div>
  );
}

/** A dropdown of card ids (optionally filtered), showing card names. */
function CardSelect({ label, value, cards, onChange }: { label: string; value: string | undefined; cards: Card[]; onChange: (v: string) => void }) {
  return (
    <label className="fld">
      <span>{label}</span>
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">— pick a card —</option>
        {cards.map((c) => (
          <option key={c.id} value={c.id}>{c.name} ({formatCost(c.cost)})</option>
        ))}
      </select>
    </label>
  );
}

// Recipient (which side a summon/conjure goes to). Maps to the effect's `target` field.
const RECIPIENTS = ['self', 'enemy'] as const;
const RECIPIENT_LABELS: Record<(typeof RECIPIENTS)[number], string> = { self: 'You', enemy: 'Opponent' };

function EffectRow({ effect, onChange, onRemove, hideRemove }: { effect: Effect; onChange: (e: Effect) => void; onRemove: () => void; hideRemove?: boolean }) {
  const { registry } = useContent();
  const set = (patch: Partial<Effect>) => onChange({ ...effect, ...patch });

  const isSummon = effect.kind === 'summon';
  const isConjure = effect.kind === 'conjure';
  const showAmount = ['damage', 'heal', 'draw', 'energy', 'applyStatus', 'costMod'].includes(effect.kind);
  const showStatus = effect.kind === 'applyStatus';
  const showStat = effect.kind === 'buff' || effect.kind === 'debuff' || effect.kind === 'setStats';
  const showElement = effect.kind === 'energy';
  // These effects choose a player side (You / Opponent), not a unit target.
  const showRecipient = isSummon || isConjure || effect.kind === 'costMod' || effect.kind === 'draw' || effect.kind === 'energy';
  const showTarget = !showRecipient && effect.kind !== 'custom';

  const unitCards = useMemo(
    () => [...registry.cards.values()].filter((c) => c.type === 'unit' && c.id !== '__null__').sort((a, b) => a.name.localeCompare(b.name)),
    [registry],
  );
  const allCards = useMemo(
    () => [...registry.cards.values()].filter((c) => c.id !== '__null__').sort((a, b) => a.name.localeCompare(b.name)),
    [registry],
  );

  return (
    <div className="effectrow">
      <Sel label="Kind" value={effect.kind} options={EFFECT_KINDS} labels={EFFECT_KIND_LABEL} onChange={(v) => set({ kind: v })} />
      {showAmount && <Num label="Amount" value={effect.amount ?? 0} onChange={(n) => set({ amount: n })} />}
      {showStatus && <Sel label="Status" value={effect.status ?? 'burn'} options={EFFECT_STATUSES} onChange={(v) => set({ status: v })} />}
      {showElement && <Sel label="Element" value={effect.element ?? 'fire'} options={ELEMENTS} onChange={(v) => set({ element: v })} />}
      {isSummon && <CardSelect label="Unit to summon" value={effect.cardId} cards={unitCards} onChange={(v) => set({ cardId: v || undefined })} />}
      {isSummon && (
        <Sel
          label="Lane"
          value={(effect.lane ?? '') as (typeof SUMMON_LANES)[number]}
          options={SUMMON_LANES}
          labels={{ '': '(auto / player picks)' }}
          onChange={(v) => set({ lane: (v || undefined) as Effect['lane'] })}
        />
      )}
      {isConjure && <CardSelect label="Card to conjure" value={effect.cardId} cards={allCards} onChange={(v) => set({ cardId: v || undefined })} />}
      {showRecipient && (
        <Sel label="Recipient" value={(effect.target === 'enemy' ? 'enemy' : 'self')} options={RECIPIENTS} labels={RECIPIENT_LABELS} onChange={(v) => set({ target: v })} />
      )}
      {showTarget && <Sel label="Target" value={effect.target ?? 'any'} options={SCOPES} onChange={(v) => set({ target: v })} />}
      {showStat && <StatModFields value={effect.stat ?? {}} onChange={(v) => set({ stat: v })} />}
      {effect.kind === 'energy' && (
        <label className="kwflag" style={{ gap: 4 }} title="Player chooses which element to bank at cast time (e.g. Golun's Cultivate)">
          <input type="checkbox" checked={Boolean(effect.chooseElement)} onChange={(e) => set({ chooseElement: e.target.checked || undefined })} />
          Player picks element
        </label>
      )}
      {effect.kind === 'damage' && (
        <label className="kwflag" style={{ gap: 4 }}>
          <input
            type="checkbox"
            checked={typeof effect.chain === 'number'}
            onChange={(e) => set({ chain: e.target.checked ? 1 : undefined, chainDiminish: undefined })}
          />
          Chain on kill
          {typeof effect.chain === 'number' && (
            <input type="number" min={1} value={effect.chain} style={{ width: 48 }}
              onChange={(e) => set({ chain: Math.max(1, Math.trunc(Number(e.target.value) || 1)) })} />
          )}
        </label>
      )}
      {effect.kind === 'damage' && (
        <label className="kwflag" style={{ gap: 4 }} title="On a kill, hit the next-weakest enemy for amount−1, then −2, … until a hit fails to kill">
          <input type="checkbox" checked={Boolean(effect.chainDiminish)} onChange={(e) => set({ chainDiminish: e.target.checked || undefined, chain: undefined })} />
          Diminishing chain
        </label>
      )}
      {effect.kind === 'buff' && (
        <div className="effectrow__grants">
          <span className="subhead" style={{ margin: 0 }}>Grant keywords</span>
          <div className="kwflags" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))' }}>
            {BUFF_GRANT_KEYS.map((k) => {
              const on = Boolean((effect.keywords as Record<string, unknown> | undefined)?.[k]);
              return (
                <label key={k} className="kwflag">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={(ev) => {
                      const next = { ...(effect.keywords ?? {}) } as Record<string, unknown>;
                      if (ev.target.checked) next[k] = true; else delete next[k];
                      set({ keywords: Object.keys(next).length ? (next as Effect['keywords']) : undefined });
                    }}
                  />
                  {KW_LABEL[k] ?? k}
                </label>
              );
            })}
          </div>
        </div>
      )}
      {effect.kind === 'costMod' && (
        <Sel
          label="Card type"
          value={(effect.cardType ?? 'spell') as 'unit' | 'spell' | 'foundation' | 'all'}
          options={['unit', 'spell', 'foundation', 'all'] as const}
          labels={{ unit: 'Units', spell: 'Spells', foundation: 'Foundations', all: 'All cards' }}
          onChange={(v) => set({ cardType: v as Effect['cardType'] })}
        />
      )}
      {effect.kind === 'custom' && <Text label="Note" value={effect.note ?? ''} onChange={(v) => set({ note: v })} />}
      {!hideRemove && <button className="btn-cancel" onClick={onRemove}>✕</button>}
    </div>
  );
}

// --- Leader editor ------------------------------------------------------------

const ELEMENTS_ALL = ['fire', 'water', 'nature', 'earth'] as const;

function ElementCapsEditor({ value, onChange }: { value: ElementCaps; onChange: (v: ElementCaps) => void }) {
  const total = value.fire + value.water + value.nature + value.earth;
  const ok = total === RULES.ELEMENT_CAP_TOTAL;
  return (
    <div>
      <div className="fldrow">
        {ELEMENTS_ALL.map((el) => (
          <Num
            key={el}
            label={el[0]!.toUpperCase() + el.slice(1)}
            value={value[el]}
            min={RULES.ELEMENT_CAP_MIN}
            onChange={(n) => onChange({ ...value, [el]: Math.min(RULES.ELEMENT_CAP_MAX, Math.max(RULES.ELEMENT_CAP_MIN, n)) })}
          />
        ))}
      </div>
      <p className={ok ? 'muted' : 'errmsg'} style={{ fontSize: 12, margin: '2px 0' }}>
        Total: {total} / {RULES.ELEMENT_CAP_TOTAL} (each 1–{RULES.ELEMENT_CAP_MAX}, must sum to {RULES.ELEMENT_CAP_TOTAL})
      </p>
    </div>
  );
}

interface LeaderForm {
  id: string;
  name: string;
  element: typeof ELEMENTS_ALL[number];
  elementCaps: ElementCaps;
  heroPowerName: string;
  heroPowerText: string;
  heroPowerCostEnergy: number;
  heroPowerCostElements: ElementCostEntry[];
  heroPowerHpCost: number;
  heroPowerEffects: Effect[];
  signatureCardId: string;
  leaderUnitCardId: string;
}

const leaderToForm = (l: Leader): LeaderForm => ({
  id: l.id,
  name: l.name,
  element: l.element as typeof ELEMENTS_ALL[number],
  elementCaps: { ...l.elementCaps },
  heroPowerName: l.heroPower.name,
  heroPowerText: l.heroPower.text ?? '',
  heroPowerCostEnergy: l.heroPower.cost.energy,
  heroPowerCostElements: l.heroPower.cost.elements
    ? l.heroPower.cost.elements.map((e) => ({ type: e.type as typeof ELEMENTS_ALL[number], amount: e.amount }))
    : [],
  heroPowerHpCost: l.heroPower.hpCost ?? 0,
  heroPowerEffects: structuredClone(l.heroPower.effects),
  signatureCardId: l.signatureCardId,
  leaderUnitCardId: l.leaderUnitCardId ?? '',
});

function LeaderEditor({ leader, onClose }: { leader: Leader; onClose: () => void }) {
  const { registry } = useContent();
  const [f, setF] = useState<LeaderForm>(() => leaderToForm(leader));
  const [error, setError] = useState('');
  const set = <K extends keyof LeaderForm>(key: K, val: LeaderForm[K]) => setF((prev) => ({ ...prev, [key]: val }));

  const allCardIds = useMemo(() => [...registry.cards.keys()].sort(), [registry]);

  const save = () => {
    const cost: Cost = { energy: f.heroPowerCostEnergy };
    if (f.heroPowerCostElements.length) cost.elements = f.heroPowerCostElements;
    const data = {
      id: f.id,
      name: f.name,
      element: f.element,
      elementCaps: f.elementCaps,
      heroPower: {
        name: f.heroPowerName,
        cost,
        ...(f.heroPowerHpCost > 0 ? { hpCost: f.heroPowerHpCost } : {}),
        effects: f.heroPowerEffects,
        ...(f.heroPowerText.trim() ? { text: f.heroPowerText.trim() } : {}),
      },
      signatureCardId: f.signatureCardId,
      ...(f.leaderUnitCardId ? { leaderUnitCardId: f.leaderUnitCardId } : {}),
    };
    try {
      store.saveLeader(data);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="editor">
      <div className="editor__head">
        <h2>Edit Leader: {leader.name}</h2>
        <span className="editor__spacer" />
        <button className="btn-end" onClick={save}>⤓ Save</button>
        <button onClick={onClose}>Cancel</button>
      </div>
      {error && <div className="errmsg editor__err">{error}</div>}

      <section className="editor__section">
        <h4>Identity</h4>
        <div className="fldrow">
          <Text label="Name" value={f.name} onChange={(v) => set('name', v)} />
          <Sel label="Element" value={f.element} options={ELEMENTS_ALL} onChange={(v) => set('element', v)} />
        </div>
      </section>

      <section className="editor__section">
        <h4>Element Caps</h4>
        <p className="muted" style={{ marginTop: 0, fontSize: 12 }}>
          How many of each element can be banked. Must total {RULES.ELEMENT_CAP_TOTAL}, each value {RULES.ELEMENT_CAP_MIN}–{RULES.ELEMENT_CAP_MAX}.
        </p>
        <ElementCapsEditor value={f.elementCaps} onChange={(v) => set('elementCaps', v)} />
      </section>

      <section className="editor__section">
        <h4>Hero Power (Leader Skill)</h4>
        <div className="fldrow">
          <Text label="Skill name" value={f.heroPowerName} onChange={(v) => set('heroPowerName', v)} />
          <Num label="Energy cost" value={f.heroPowerCostEnergy} min={0} onChange={(n) => set('heroPowerCostEnergy', n)} />
          <Num label="HP cost (optional)" value={f.heroPowerHpCost} min={0} onChange={(n) => set('heroPowerHpCost', n)} />
        </div>
        <ElementCostEditor value={f.heroPowerCostElements} onChange={(v) => set('heroPowerCostElements', v)} />
        <Text label="Rules text (optional)" value={f.heroPowerText} onChange={(v) => set('heroPowerText', v)} area />
        <div style={{ marginTop: 8 }}>
          <div className="subhead">Effects</div>
          <EffectsEditor effects={f.heroPowerEffects} onChange={(v) => set('heroPowerEffects', v)} />
        </div>
      </section>

      <section className="editor__section">
        <h4>Signature Card</h4>
        <p className="muted" style={{ marginTop: 0, fontSize: 12 }}>
          Delivered to hand when this leader's HP drops to HALF its maximum (≤{RULES.SIGNATURE_HP_THRESHOLD} for the standard {RULES.LEADER_HP} HP baseline).
        </p>
        <label className="fld">
          <span>Signature card</span>
          <select value={f.signatureCardId} onChange={(e) => set('signatureCardId', e.target.value)}>
            {allCardIds.map((id) => (
              <option key={id} value={id}>{registry.cards.get(id)?.name ?? id} ({id})</option>
            ))}
          </select>
        </label>
      </section>

      <section className="editor__section">
        <h4>Leader-Unit (optional)</h4>
        <p className="muted" style={{ marginTop: 0, fontSize: 12 }}>
          A unit spawned on this leader's board at game start whose HP mirrors the leader's (Riku-style). If it dies, the leader loses. Leave as "None" for a normal leader.
        </p>
        <label className="fld">
          <span>Leader-unit card</span>
          <select value={f.leaderUnitCardId} onChange={(e) => set('leaderUnitCardId', e.target.value)}>
            <option value="">— None —</option>
            {allCardIds.map((id) => (
              <option key={id} value={id}>{registry.cards.get(id)?.name ?? id} ({id})</option>
            ))}
          </select>
        </label>
      </section>

      <div className="editor__foot">
        <button className="btn-end" onClick={save}>⤓ Save leader</button>
        {store.isOverriddenLeader(leader.id) && (
          <button className="btn-cancel" onClick={() => { store.resetLeader(leader.id); onClose(); }}>
            Revert to default
          </button>
        )}
      </div>
    </div>
  );
}
