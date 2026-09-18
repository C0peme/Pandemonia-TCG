import { useEffect, useRef, useState } from 'react';
import type { NodeKind, RunState, MapNode } from '@adventure/schema';
import { reachableNodeIds } from '@adventure/run';
import { trialById } from '@adventure/trials';
import { bossForAct } from '@adventure/data/bosses';
<<<<<<< Updated upstream
=======
import { eliteForNode } from '@adventure/data/elites';
import { combatReward, ECON } from '@adventure/economy';
import { COPPER_MECH_HP, COPPER_MECH_ICON, COPPER_MECH_NAME } from '@adventure/data/copperMech';
>>>>>>> Stashed changes
import * as adv from '@adventure/store';

const KIND_ICON: Record<NodeKind, string> = {
  combat: '⚔',
  store: '⌸',
  enhance: '✧',
  trial: '⌂',
  boss: '♛',
  elite: '☠',
  rest: '☾',
  event: '?',
};
const KIND_LABEL: Record<NodeKind, string> = {
  combat: 'Battle',
  store: 'Store',
  enhance: 'Enhancement',
  trial: 'Trial',
  boss: 'BOSS',
  elite: 'Elite',
  rest: 'Rest Site',
  event: 'Event',
};
/** What each node is FOR — the line the hover card leads with. */
const KIND_BLURB: Record<NodeKind, string> = {
  combat: 'A standard fight. Win to heal, take coins and pick a card.',
  store: 'Buy cards of any element; yours are cheaper. Sell as many as you like.',
  enhance: 'Permanently upgrade one owned card, or attune an element for +1 banking cap.',
  trial: 'A normal-strength fight under a fixed twist. The twist is the difficulty.',
  boss: 'The act finale.',
  elite: 'A named champion — more HP and a fuller deck. Pays double, and a wider card pick.',
  rest: 'Recover HP, take a free card, or Mend to raise every future battle heal.',
  event: 'An unknown encounter. Something will be asked of you.',
};

/* Fixed geometry in REAL pixels. The map used to scale a 700-wide viewBox to fill its
   container, so a wider window produced a TALLER map (1239px inside a 900px viewport)
   and pushed everything below it off-screen. Nodes now keep a chosen size and the
   frame scrolls instead. */
const COL_W = 128;
const ROW_H = 88;
const PAD_X = 54;
const PAD_Y = 46;
const R = 20;
const R_BOSS = 25;

/** The act map: layered nodes, start at the bottom, boss on top. */
export function MapView({ run }: { run: RunState }) {
  const { layers, nodes } = run.map;
  const [hover, setHover] = useState<string | null>(null);
  const [copperOpen, setCopperOpen] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);

  const widest = Math.max(...layers.map((l) => l.length));
  const W = Math.max(560, widest * COL_W + PAD_X * 2);
  const H = PAD_Y * 2 + (layers.length - 1) * ROW_H;
  const pos = (id: string): { x: number; y: number } => {
    const n = nodes[id]!;
    const width = layers[n.layer]!.length;
    return { x: ((n.col + 1) / (width + 1)) * W, y: H - PAD_Y - n.layer * ROW_H };
  };

  const reachable = new Set(reachableNodeIds(run));
  const boss = bossForAct(run.seed, run.act);
  const cleared = layers.filter((row) => row.some((id) => nodes[id]!.visited)).length;
  const hovered = hover ? nodes[hover] : undefined;

  // The map draws layer 0 (the start) at the BOTTOM and the boss at the top, but the
  // scroll frame used to open scrolled to its top — showing the boss first and hiding
  // the row the player actually starts from. Snap to the current position instead: the
  // start row before any node is picked, or the current node once one is.
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    if (run.currentNodeId) {
      const { y } = pos(run.currentNodeId);
      el.scrollTop = Math.max(0, y - el.clientHeight / 2);
    } else {
      el.scrollTop = el.scrollHeight;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.currentNodeId]);

  return (
    <>
      <div className="advmap">
        {/* The boss is declared from the first node, so a route can be planned around
            it — it used to live only in a native <title> on the top node. */}
        <div className="advmap__act">
          <span className="advmap__acticon">{boss.icon}</span>
          <span className="advmap__acttext">
            <span className="advmap__actname">Act {run.act} · {boss.name} waits at the top</span>
            <span className="advmap__actgimmick">{boss.gimmick}</span>
          </span>
          <span className="advmap__actprog">{cleared} / {layers.length} layers</span>
          {/* The endgame challenge, docked as a small corner control rather than a
              full-width rail — it was reachable at any time but ate a fixed slice of
              screen at every window size to say so. A click opens the full pitch. */}
          <button
            className={run.adventureWon ? 'advmap__coppertab advmap__coppertab--won' : 'advmap__coppertab'}
            onClick={() => setCopperOpen(true)}
            title={COPPER_MECH_NAME}
          >
            {COPPER_MECH_ICON}
            {run.copperBest > 0 && <span className="advmap__copperpct">{Math.round((run.copperBest / COPPER_MECH_HP) * 100)}%</span>}
          </button>
        </div>

        <div className="advmap__frame" ref={frameRef}>
          <div className="advmap__canvas" style={{ width: W, height: H }}>
            <svg width={W} height={H} className="advmap__svg" role="img" aria-label={`Act ${run.act} map`}>
              {/* Edges under the nodes, in three states rather than two. */}
              {Object.values(nodes).map((n) =>
                n.next.map((t) => {
                  const a = pos(n.id);
                  const b = pos(t);
                  const lit = run.currentNodeId === n.id && reachable.has(t);
                  const past = n.visited && nodes[t]!.visited;
                  const cls = lit ? 'advmap__edge advmap__edge--lit'
                    : past ? 'advmap__edge advmap__edge--past'
                      : 'advmap__edge advmap__edge--far';
                  return (
                    <line
                      key={`${n.id}->${t}`}
                      x1={a.x} y1={a.y - R - 4} x2={b.x} y2={b.y + R + 4}
                      className={cls}
                    />
                  );
                }),
              )}
              {Object.values(nodes).map((n) => {
                const { x, y } = pos(n.id);
                const canGo = reachable.has(n.id);
                const isCurrent = run.currentNodeId === n.id;
                const cls = [
                  'advmap__node',
                  `advmap__node--${n.kind}`,
                  canGo ? 'advmap__node--go' : '',
                  n.visited ? 'advmap__node--done' : '',
                  !canGo && !n.visited && !isCurrent ? 'advmap__node--far' : '',
                  isCurrent ? 'advmap__node--here' : '',
                ].filter(Boolean).join(' ');
                // A Trial's whole difficulty IS its twist, and some twists are outright
                // hostile to a given deck (Sanctuary's Immunity blanks a poison/burn
                // build). Naming it on the node itself — not only in the hover card —
                // makes routing around one a decision you can make at a glance.
                const nTwist = n.kind === 'trial' && n.twistId ? trialById(n.twistId) : undefined;
                // Before the choice is made a Trial has a shortlist, not a condition, so
                // the node says how many rules it will offer rather than naming one.
                const nChoices = n.kind === 'trial' && !n.twistId ? n.twistChoices?.length ?? 0 : 0;
                const label = n.visited
                  ? '✓'
                  : n.kind === 'boss'
                    ? boss.name
                    : n.kind === 'elite'
                      ? eliteForNode(n.seed).name
                      : nTwist
                        ? nTwist.name
                        : nChoices > 0
                          ? `Trial · ${nChoices} rules`
                          : KIND_LABEL[n.kind];
                const go = (): void => { if (canGo) adv.pickNode(n.id); };
                return (
                  <g
                    key={n.id}
                    className={cls}
                    onClick={go}
                    onMouseEnter={() => setHover(n.id)}
                    onMouseLeave={() => setHover((h) => (h === n.id ? null : h))}
                    onFocus={() => setHover(n.id)}
                    onBlur={() => setHover((h) => (h === n.id ? null : h))}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } }}
                    tabIndex={canGo ? 0 : -1}
                    role={canGo ? 'button' : 'img'}
                    aria-label={`${KIND_LABEL[n.kind]}${nTwist ? `: ${nTwist.name} — ${nTwist.blurb}` : ''}${n.visited ? ' (visited)' : canGo ? ' — available' : ''}`}
                  >
                    <NodeShape kind={n.kind} x={x} y={y} />
                    {isCurrent && <circle className="advmap__ring" cx={x} cy={y} r={R + 6} />}
                    <text x={x} y={y + 1} textAnchor="middle" dominantBaseline="middle" className="advmap__icon">
                      {n.kind === 'boss' ? boss.icon : n.kind === 'elite' ? eliteForNode(n.seed).icon : KIND_ICON[n.kind]}
                    </text>
                    <text x={x} y={y + (n.kind === 'boss' ? R_BOSS + 15 : R + 15)} textAnchor="middle" className="advmap__label">
                      {label}
                    </text>
                  </g>
                );
              })}
            </svg>

            {hovered && <HoverCard node={hovered} run={run} at={pos(hovered.id)} />}
          </div>
        </div>

        <p className="muted advmap__hint">
          {run.currentNodeId === null
            ? 'Choose where to begin — any node on the bottom row.'
            : 'Follow the paths upward. The boss waits at the top.'}
        </p>
      </div>
      {copperOpen && <CopperMechModal run={run} onClose={() => setCopperOpen(false)} />}
    </>
  );
}

/** Shape carries the node KIND, so the map reads without relying on colour alone. */
function NodeShape({ kind, x, y }: { kind: NodeKind; x: number; y: number }) {
  const c = 'advmap__shape';
  if (kind === 'boss') return <circle className={c} cx={x} cy={y} r={R_BOSS} />;
  if (kind === 'event') return <circle className={c} cx={x} cy={y} r={R - 3} strokeDasharray="4 3.5" />;
  if (kind === 'rest') {
    const s = R * 1.5;
    return <rect className={c} x={x - s / 2} y={y - s / 2} width={s} height={s} rx={s / 4} />;
  }
  if (kind === 'trial') {
    // Hexagon.
    const pts = [0, 1, 2, 3, 4, 5]
      .map((i) => { const a = (Math.PI / 3) * i - Math.PI / 2; return `${x + R * Math.cos(a)},${y + R * Math.sin(a)}`; })
      .join(' ');
    return <polygon className={c} points={pts} />;
  }
  if (kind === 'store' || kind === 'enhance') {
    const d = `M${x} ${y - R} L${x + R} ${y} L${x} ${y + R} L${x - R} ${y} Z`;
    return (
      <>
        <path className={c} d={d} />
        {/* Enhance is an inset diamond — same family as Store (both are purchases),
            distinguished by the inner ring. */}
        {kind === 'enhance' && (
          <path className={c} style={{ opacity: 0.5, strokeWidth: 1, fill: 'none' }}
            d={`M${x} ${y - R / 2} L${x + R / 2} ${y} L${x} ${y + R / 2} L${x - R / 2} ${y} Z`} />
        )}
<<<<<<< Updated upstream
        {Object.values(nodes).map((n) => {
          const { x, y } = pos(n.id);
          const canGo = reachable.has(n.id);
          const isCurrent = run.currentNodeId === n.id;
          const twist = n.twistId ? trialById(n.twistId) : undefined;
          const boss = n.kind === 'boss' ? bossForAct(n.seed, run.act) : undefined;
          const tip = boss
            ? `${boss.name} — ${boss.gimmick}`
            : `${KIND_LABEL[n.kind]}${twist ? ` — ${twist.name}: ${twist.blurb}` : ''}`;
          const cls = [
            'advmap__node',
            canGo ? 'advmap__node--go' : '',
            n.visited ? 'advmap__node--done' : '',
            isCurrent ? 'advmap__node--here' : '',
            n.kind === 'boss' ? 'advmap__node--boss' : '',
            n.kind === 'trial' ? 'advmap__node--trial' : '',
            n.kind === 'elite' ? 'advmap__node--elite' : '',
          ].filter(Boolean).join(' ');
          return (
            <g key={n.id} className={cls} onClick={() => canGo && adv.pickNode(n.id)}>
              <title>{tip}</title>
              <circle cx={x} cy={y} r={n.kind === 'boss' ? 30 : 24} />
              <text x={x} y={y + 1} textAnchor="middle" dominantBaseline="middle" className="advmap__icon">
                {n.kind === 'boss' && boss ? boss.icon : KIND_ICON[n.kind]}
              </text>
              <text x={x} y={y + (n.kind === 'boss' ? 46 : 40)} textAnchor="middle" className="advmap__label">
                {n.visited ? '✓' : n.kind === 'boss' && boss ? boss.name : KIND_LABEL[n.kind]}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="muted advmap__hint">
        {run.currentNodeId === null
          ? 'Choose where to begin — any node on the bottom row.'
          : 'Follow the paths upward. The boss waits at the top.'}
      </p>
=======
      </>
    );
  }
  if (kind === 'elite') {
    return (
      <>
        <circle className={c} cx={x} cy={y} r={R} />
        <circle className={c} cx={x} cy={y} r={R - 4} style={{ opacity: 0.55, strokeWidth: 1, fill: 'none' }} />
      </>
    );
  }
  return <circle className={c} cx={x} cy={y} r={R} />;
}

/**
 * Replaces the native `<title>` tooltip, which had a ~1s delay, no styling, and could
 * not present a trial twist or boss gimmick legibly. Lives inside the scrolling canvas
 * so it travels with the map.
 */
function HoverCard({ node, run, at }: { node: MapNode; run: RunState; at: { x: number; y: number } }) {
  const twist = node.twistId ? trialById(node.twistId) : undefined;
  // An unchosen Trial lists what it will offer — the whole point of the node is that the
  // player picks, so the shortlist has to be readable before committing to walk there.
  const offered = !node.twistId
    ? (node.twistChoices ?? []).map(trialById).filter((t) => t !== undefined)
    : [];
  const boss = node.kind === 'boss' ? bossForAct(run.seed, run.act) : undefined;
  const elite = node.kind === 'elite' ? eliteForNode(node.seed) : undefined;
  const flip = at.y < 130;
  const coins = node.kind === 'combat' || node.kind === 'trial' || node.kind === 'elite' || node.kind === 'boss'
    ? combatReward(node.kind, node.layer, run.act)
    : undefined;
  const reward = node.kind === 'elite' ? 'Double coins · pick 1 of 5 cards'
    : node.kind === 'trial' ? 'Double coins · a relic'
      : node.kind === 'boss' ? 'A relic, and the act\'s progression reward'
        : node.kind === 'combat' ? 'Coins · pick 1 of 3 cards'
          : undefined;

  return (
    <div
      className={`advmap__hovercard advmap__node--${node.kind}${flip ? ' advmap__hovercard--flip' : ''}`}
      style={{ left: at.x, top: flip ? at.y + (node.kind === 'boss' ? R_BOSS : R) : at.y - (node.kind === 'boss' ? R_BOSS : R) }}
    >
      <div className="advmap__hovertitle">
        <span>{boss ? boss.icon : elite ? elite.icon : KIND_ICON[node.kind]}</span>
        <span>{boss ? boss.name : elite ? elite.name : KIND_LABEL[node.kind]}</span>
      </div>
      <div className="advmap__hoverbody">
        {boss ? boss.gimmick
          : elite ? elite.gimmick
            : twist ? <><b>{twist.name}:</b> {twist.blurb}</>
              : offered.length > 0 ? (
                <>
                  Choose one condition to fight under:
                  <ul className="advmap__twistlist">
                    {offered.map((t) => <li key={t.id}><b>{t.name}</b> — {t.blurb}</li>)}
                  </ul>
                </>
              ) : KIND_BLURB[node.kind]}
      </div>
      {node.visited ? (
        <div className="advmap__hoverreward muted">Already visited.</div>
      ) : reward ? (
        <div className="advmap__hoverreward">
          {reward}
          {coins !== undefined && <> · <span style={{ color: 'var(--accent)' }}>⊙ {coins}</span></>}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The always-available endgame challenge's full pitch — opened from the corner tab
 * rather than sitting permanently on the map, so it no longer costs a fixed slice of
 * screen at every window size just to advertise that it exists.
 */
function CopperMechModal({ run, onClose }: { run: RunState; onClose: () => void }) {
  const best = run.copperBest;
  const pct = Math.round((best / COPPER_MECH_HP) * 100);
  return (
    <div className="overlay" onClick={onClose}>
      <div
        className={run.adventureWon ? 'overlay__box advcopper advcopper--won' : 'overlay__box advcopper'}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="advcopper__head">
          <span className="advcopper__icon">{COPPER_MECH_ICON}</span>
          <div className="advcopper__title">
            <strong>{COPPER_MECH_NAME}</strong>
            <span className="muted">
              {run.adventureWon
                ? 'Destroyed. The Adventure is won — but it still stands, if you want a cleaner run.'
                : `${COPPER_MECH_HP} HP · every element capped · the whole card pool. Lose and this act resets with a fresh map — your deck, coins and HP survive.`}
            </span>
          </div>
        </div>
        <div className="advcopper__foot">
          {best > 0 ? (
            <span className="advcopper__best" title={`${best} of ${COPPER_MECH_HP} damage`}>
              ★ Best {best} / {COPPER_MECH_HP}
              <span className="advcopper__bar"><span className="advcopper__fill" style={{ width: `${pct}%` }} /></span>
              {pct}%
            </span>
          ) : (
            <span className="muted">No attempt yet.</span>
          )}
          <button
            className="btn-end advcopper__go"
            disabled={run.coins < ECON.COPPER_ATTEMPT_COST}
            onClick={() => adv.startCopperMech()}
          >
            {COPPER_MECH_ICON} {best > 0 ? 'Challenge again' : 'Challenge it'} · ⊙ {ECON.COPPER_ATTEMPT_COST} →
            {run.coins < ECON.COPPER_ATTEMPT_COST && (
              <span className="advshop__why">⊙ {ECON.COPPER_ATTEMPT_COST - run.coins} short</span>
            )}
          </button>
        </div>
        <button className="advcopper__close" onClick={onClose}>Close</button>
      </div>
>>>>>>> Stashed changes
    </div>
  );
}
