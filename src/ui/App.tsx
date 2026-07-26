import { useState, useMemo, useEffect, useRef, Fragment } from 'react';
import { LANES, RULES, type Element, type LaneId } from '@engine/constants';
import type { GameEvent } from '@engine/events';
import type { Card, Effect, Keywords } from '@cards/schema';
import type { EnvironmentInstance, GameState, Lane, PlayerId, PlayerState, UnitInstance } from '@engine/types';
import { formatCost, listAbilities, listStatuses, STATUS_INFO, ELEMENT_NAME, type NamedAbility } from '@cards/abilities';
import { ElementRune } from '@ui/ElementRune';
import { useGame, type CombatAnim, type CombatPhase } from '@ui/useGame';
import { useRegistry, useContent } from '@ui/useContent';
import * as store from '@cards/store';
import { DeckBuilder } from '@ui/DeckBuilder';
import { CardStudio } from '@ui/CardStudio';
import { BalanceLab } from '@ui/BalanceLab';
import { Multiplayer } from '@ui/Multiplayer';
import { Adventure } from '@ui/adventure/Adventure';
import { getMuted, getVolume, setMuted, setVolume, getMusicMuted, setMusicMuted } from '@ui/audio';

const LANE_LABEL: Record<LaneId, string> = { heights: 'Heights', ground1: 'Ground', ground2: 'Ground', water: 'Water' };
const COMBAT_PHASE_LABEL: Record<CombatPhase, string> = {
  skip: '— skip —',
  effects: '♨ Effects',
  attack: '⚔ Attack',
  retaliate: '▣ Retaliate',
  onhit: '✦ On-Hit',
};
const ELEMENTS: Element[] = ['fire', 'water', 'nature', 'earth'];

export type Detail = { kind: 'card'; card: Card } | { kind: 'unit'; unit: UnitInstance };
type DragKind = 'place' | 'target' | 'env' | null;

type View = 'board' | 'adventure' | 'deckbuilder' | 'studio' | 'lab' | 'multiplayer';

/** Per-menu identity for the framed masthead (composed heading above each menu screen). */
const MENU_META: Partial<Record<View, { icon: string; title: string; sub: string }>> = {
  deckbuilder: { icon: '⚒', title: 'Forge Deck', sub: 'Assemble and hone your decks of war' },
  studio: { icon: '❦', title: 'The Codex', sub: 'Every card and leader in the realm' },
  lab: { icon: '⚗', title: 'Balance Lab', sub: 'Simulate matchups and tune the meta' },
  multiplayer: { icon: '⚑', title: 'Duel', sub: 'Face another player across the network' },
};

/** A framed carved-stone masthead giving each menu a title, rune crest and subtitle. */
function MenuMasthead({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  return (
    <div className="masthead">
      <span className="masthead__crest" aria-hidden="true">{icon}</span>
      <div className="masthead__body">
        <h1 className="masthead__title">{title}</h1>
        <p className="masthead__sub">{sub}</p>
      </div>
    </div>
  );
}

export function App() {
  const g = useGame();
  const { game } = g;
  const [detail, setDetail] = useState<Detail | null>(null);
  const [view, setView] = useState<View>('board');
  const [showDeckPicker, setShowDeckPicker] = useState(false);

  const NAV: { id: View; label: string }[] = [
    { id: 'board', label: '⚔ Battle' },
    { id: 'adventure', label: '✦ Adventure' },
    { id: 'deckbuilder', label: '⚒ Forge Deck' },
    { id: 'studio', label: '❦ Codex' },
    { id: 'multiplayer', label: '⚑ Duel' },
  ];

  return (
    <div className={`game ${view === 'board' ? 'theme-gothic' : 'theme-stone'}`}>
      <header className="topbar">
        <strong>Pandemonia</strong>
        {view === 'board' && (
          <span className="muted">
            Round {game.round} · Player {game.active + 1} to act
          </span>
        )}
        <span className="topbar__spacer" />
        <nav className="topnav">
          {NAV.map((n) => (
            <button key={n.id} className={view === n.id ? 'topnav--active' : ''} onClick={() => setView(n.id)}>
              {n.label}
            </button>
          ))}
          <details className="topnav__tools">
            <summary title="Tools & developer options">⚙ Tools</summary>
            <div className="topnav__toolsmenu">
              <button className={view === 'lab' ? 'topnav--active' : ''} onClick={() => setView('lab')}>⚗ Balance Lab</button>
              <button
                className={g.debugMode ? 'btn-debug btn-debug--on' : 'btn-debug'}
                onClick={g.toggleDebug}
                title="Toggle debug/sandbox mode: unlimited energy, card injector, board setup"
              >※ {g.debugMode ? 'Sandbox ON' : 'Sandbox'}</button>
              {view === 'board' && (
                <>
                  <div className="topnav__toolsdivider" />
                  <span className="topnav__toolslabel">AI opponent</span>
                  {([0, 1] as PlayerId[]).map((p) => (
                    <button
                      key={p}
                      className={g.aiSides[p] ? 'btn-ai btn-ai--on' : 'btn-ai'}
                      onClick={() => g.toggleAi(p)}
                      title={`Player ${p + 1} is controlled by ${g.aiSides[p] ? 'the AI' : 'you'}`}
                    >P{p + 1}: {g.aiSides[p] ? 'AI' : 'You'}</button>
                  ))}
                </>
              )}
            </div>
          </details>
        </nav>
        <button onClick={() => setShowDeckPicker(true)}>New game</button>
      </header>

      {MENU_META[view] && <MenuMasthead {...MENU_META[view]!} />}

      {view === 'adventure' ? (
        <Adventure onDetail={setDetail} />
      ) : view === 'deckbuilder' ? (
        <DeckBuilder />
      ) : view === 'studio' ? (
        <CardStudio />
      ) : view === 'lab' ? (
        <BalanceLab />
      ) : view === 'multiplayer' ? (
        <Multiplayer />
      ) : (
        <PlayArea g={g} onDetail={setDetail} />
      )}

      {showDeckPicker && (
        <DeckPicker
          onCancel={() => setShowDeckPicker(false)}
          onStart={() => {
            setShowDeckPicker(false);
            g.reset();
          }}
        />
      )}

      {detail && <CardDetail detail={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

/** Locate a unit (or standalone foundation) on the board by iid, for the hover-inspect peek. */
function findUnitByIid(game: GameState, iid: string): UnitInstance | undefined {
  for (const p of Object.values(game.players)) {
    for (const lane of Object.values(p.lanes)) {
      for (const slot of ['front', 'back'] as const) {
        const u = lane[slot];
        if (u?.iid === iid) return u;
      }
      const sf = lane.standaloneFoundation as UnitInstance | undefined;
      if (sf?.iid === iid) return sf;
    }
  }
  return undefined;
}

/**
 * The play experience for one game — the log, the board (field + hand + debug), and the
 * controls — driven by a `useGame` result. Reused for both local/hotseat play and a networked
 * match; the only difference is which `g` (and, via RegistryProvider, which registry) it's given.
 */
export function PlayArea({ g, onDetail, onPlayAgain, playAgainLabel }: { g: ReturnType<typeof useGame>; onDetail: (d: Detail) => void; onPlayAgain?: () => void; playAgainLabel?: string }) {
  const { game } = g;
  const registry = useRegistry();
  // Local play restarts via g.reset; net play uses an explicit rematch handler (host only).
  const playAgain = onPlayAgain ?? (g.isNet ? undefined : g.reset);
  const me = game.players[g.pov];
  const opp = game.players[g.opponent];
  const leaderName = (p: PlayerState) => registry.leaders.get(p.leaderId)?.name ?? p.leaderId;
  const dragKind: DragKind = g.drag
    ? g.drag.card.type === 'spell'
      ? 'target'
      : g.drag.card.type === 'environment'
        ? 'env'
        : 'place'
    : null;
  // The ledger (log rail) should end around the bottom of the leader UI / lanes — the
  // "field" — not stretch the full board height (which also includes the hand below it,
  // where it'd crowd the fanned cards). Measure the field live so the cap tracks the
  // field's own responsive/viewport-scaled height instead of a guessed constant.
  const playRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const fieldEl = fieldRef.current;
    const playEl = playRef.current;
    if (!fieldEl || !playEl) return;
    const ro = new ResizeObserver(([entry]) => {
      const h = entry?.contentRect.height;
      if (h) playEl.style.setProperty('--field-h', `${Math.round(h)}px`);
    });
    ro.observe(fieldEl);
    return () => ro.disconnect();
  }, []);

  // Hover-inspect: after a short dwell on a board unit or hand card, float a full detail panel
  // beside it so any unit can be read without opening the modal. Event-delegated off `.play`.
  const [peek, setPeek] = useState<{ detail: Detail; rect: DOMRect } | null>(null);
  const gameRef = useRef(game); gameRef.current = game;
  useEffect(() => {
    const el = playRef.current; if (!el) return;
    let timer: number | undefined; let anchor: HTMLElement | null = null;
    const clear = (): void => { if (timer) window.clearTimeout(timer); timer = undefined; };
    const over = (e: Event): void => {
      const t = e.target as HTMLElement;
      const unit = (t.closest?.('.unit[data-iid]') ?? null) as HTMLElement | null;
      const hand = (t.closest?.('.handcard[data-cardiid]') ?? null) as HTMLElement | null;
      const target = unit ?? hand;
      if (!target || target === anchor) return;
      anchor = target; clear();
      timer = window.setTimeout(() => {
        const gm = gameRef.current;
        if (unit) {
          const iid = unit.getAttribute('data-iid');
          const u = iid ? findUnitByIid(gm, iid) : undefined;
          if (u) setPeek({ detail: { kind: 'unit', unit: u }, rect: unit.getBoundingClientRect() });
        } else if (hand) {
          const iid = hand.getAttribute('data-cardiid');
          const inst = iid ? gm.players[gm.active].hand.find((c) => c.iid === iid) : undefined;
          const def = inst && registry.cards.get(inst.cardId);
          if (def) setPeek({ detail: { kind: 'card', card: def }, rect: hand.getBoundingClientRect() });
        }
      }, 320);
    };
    const out = (e: Event): void => {
      const to = (e as MouseEvent).relatedTarget as Node | null;
      if (anchor && (!to || !anchor.contains(to))) { clear(); anchor = null; setPeek(null); }
    };
    el.addEventListener('mouseover', over);
    el.addEventListener('mouseout', out);
    return () => { el.removeEventListener('mouseover', over); el.removeEventListener('mouseout', out); clear(); };
  }, [registry]);
  return (
    <>
      <div
        ref={playRef}
        className={`play ${g.animating ? 'play--resolving' : ''}`}
        onContextMenu={(e) => {
          // Right-click anywhere on the board disengages from the current action (targeting a
          // spell/hero/sniper, a queued move, an in-progress drag) instead of committing it.
          if (g.sel.kind !== 'none' || g.drag) {
            e.preventDefault();
            g.cancelSelection();
            g.endDrag();
          }
        }}
      >
        <div className="scene-bg" aria-hidden="true"><span className="scene-bg__shaft" /><span className="scene-bg__motes" /></div>
        <TurnBanner key={`turn-${game.active}-${game.round}`} active={game.active} round={game.round} myTurn={g.myTurn} isNet={g.isNet} over={game.winner !== null} />
        <TargetingArrow g={g} />
        <LogPanel log={g.log} game={game} pov={g.pov} />
        <div className="board">
          <div className="field" ref={fieldRef}>
            <OpponentHand count={opp.hand.length} />
            <LeaderBox who="Opponent" label={leaderName(opp)} player={opp} isMe={false} isMyTurn={false} g={g} dragKind={dragKind} handCount={opp.hand.length} isActive={game.active === opp.id} />
            <div className="field__lanes">
              {LANES.map((lane) => (
                <LaneColumn
                  key={lane}
                  lane={lane}
                  game={game}
                  g={g}
                  dragKind={dragKind}
                  onUnitDetail={(u) => onDetail({ kind: 'unit', unit: u })}
                  sniperTargeting={g.sel.kind === 'sniperPhase'}
                  combatAnim={g.combatAnim}
                  declaring={g.declareLanes?.includes(lane) ?? false}
                />
              ))}
            </div>
            <LeaderBox who={g.isNet ? 'You' : `You (P${g.pov + 1})`} label={leaderName(me)} player={me} isMe isMyTurn={g.myTurn} g={g} dragKind={dragKind} handCount={null} isActive={game.active === me.id} />
          </div>
          <Hand g={g} active={me} onDetail={(card) => onDetail({ kind: 'card', card })} />
          {g.debugMode && <DebugPanel g={g} />}
        </div>
        <Controls g={g} active={me} />
      </div>

      <HoverPeek peek={peek} />
      {game.winner !== null && !g.animating && <GameSummary g={g} onPlayAgain={playAgain} playAgainLabel={playAgainLabel} />}
      {g.passing && game.winner === null && (
        <Overlay>
          <h2>Pass the device</h2>
          <p>Player {game.active + 1}, it’s your turn.</p>
          <button onClick={g.confirmPass}>Ready</button>
        </Overlay>
      )}
    </>
  );
}

/**
 * A transient "whose turn" flourish that sweeps across the stage on each hand-off, plus a
 * persistent corner tag. Purely presentational — driven by the active-player index changing.
 */
function TurnBanner({ active, round, myTurn, isNet, over }: { active: PlayerId; round: number; myTurn: boolean; isNet: boolean; over: boolean }) {
  if (over) return null;
  const title = isNet ? (myTurn ? 'Your Turn' : "Opponent's Turn") : `Player ${active + 1}'s Turn`;
  // Keying by active+round remounts the element each hand-off, replaying the CSS flourish —
  // no JS timers to fight the render pipeline.
  return (
    <div className={`turnbanner turnbanner--play ${myTurn || !isNet ? 'turnbanner--you' : 'turnbanner--foe'}`} aria-hidden="true">
      <span className="turnbanner__rule" />
      <span className="turnbanner__text">{title}</span>
      <span className="turnbanner__sub">Round {round}</span>
      <span className="turnbanner__rule" />
    </div>
  );
}

/**
 * A drawn targeting arrow (Hearthstone-style) that follows the cursor whenever the player is
 * choosing a target — a hero power, a sniper's lane, a queued move/expel, or a dragged spell.
 * It arcs from the source (the leader's sigil, the sniper unit, the picked unit, the dragged
 * card) to the pointer and brightens to gilt over a valid target. Drawn imperatively via refs
 * so cursor tracking never re-renders React (mirrors the combatFx overlay style).
 */
function TargetingArrow({ g }: { g: ReturnType<typeof useGame> }) {
  const sel = g.sel;
  const dragTarget = !!g.drag && (g.drag.card.type === 'spell' || g.drag.card.type === 'environment');
  const active =
    sel.kind === 'hero' || sel.kind === 'sniperPhase' || sel.kind === 'spellMove' ||
    (sel.kind === 'pending' && Boolean(sel.pickedUnit)) || dragTarget;
  const svgRef = useRef<SVGSVGElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const headRef = useRef<SVGPolygonElement>(null);

  useEffect(() => {
    if (!active) return;
    const sourceEl = () => {
      if (sel.kind === 'hero') return document.querySelector(`[data-leader="${g.game.active}"] .leader__skill`) ?? document.querySelector(`[data-leader="${g.game.active}"]`);
      if (sel.kind === 'sniperPhase') { const nxt = sel.pending.find((p) => !sel.choices[p.iid]); return nxt ? document.querySelector(`[data-iid="${CSS.escape(nxt.iid)}"]`) : null; }
      if (sel.kind === 'pending' && sel.pickedUnit) return document.querySelector(`[data-iid="${CSS.escape(sel.pickedUnit)}"]`);
      if (sel.kind === 'spellMove' && sel.target.kind === 'unit') return document.querySelector(`[data-iid="${CSS.escape(sel.target.iid)}"]`);
      if (dragTarget && g.drag) return document.querySelector(`[data-cardiid="${CSS.escape(g.drag.iid)}"]`);
      return null;
    };
    const draw = (x: number, y: number): void => {
      const svg = svgRef.current, path = pathRef.current, head = headRef.current;
      const el = sourceEl();
      if (!svg || !path || !head || !el) { svgRef.current?.style.setProperty('opacity', '0'); return; }
      svg.style.opacity = '1';
      const r = el.getBoundingClientRect();
      const sx = r.left + r.width / 2, sy = r.top + r.height / 2;
      const dx = x - sx, dy = y - sy, dist = Math.hypot(dx, dy) || 1;
      const nx = -dy / dist, ny = dx / dist, arc = Math.min(70, dist * 0.2);
      const cx = (sx + x) / 2 + nx * arc, cy = (sy + y) / 2 + ny * arc;
      path.setAttribute('d', `M ${sx} ${sy} Q ${cx} ${cy} ${x} ${y}`);
      const tang = Math.atan2(y - cy, x - cx);
      head.setAttribute('transform', `translate(${x} ${y}) rotate(${(tang * 180) / Math.PI})`);
      const under = document.elementFromPoint(x, y);
      const valid = !!under?.closest('.targetable, .lane--drop, .lane--sniper-target, .lane--dtplace, .lanecol__mid--drop, .lane__poszone');
      svg.classList.toggle('targetarrow--valid', valid);
    };
    const onMove = (e: MouseEvent): void => draw(e.clientX, e.clientY);
    const onDrag = (e: DragEvent): void => { if (e.clientX || e.clientY) draw(e.clientX, e.clientY); };
    window.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('dragover', onDrag, { passive: true });
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('dragover', onDrag); };
  }, [active, sel.kind, sel.kind === 'pending' ? sel.pickedUnit : null, dragTarget, g.drag?.iid, g.game.active]);

  if (!active) return null;
  return (
    <svg ref={svgRef} className="targetarrow" aria-hidden="true">
      <path ref={pathRef} className="targetarrow__line" fill="none" />
      <polygon ref={headRef} className="targetarrow__head" points="0,0 -18,-8 -13,0 -18,8" />
    </svg>
  );
}

function LeaderBox({
  who,
  label,
  player,
  isMe,
  isMyTurn,
  g,
  dragKind,
  handCount,
  isActive,
}: {
  who: string;
  label: string;
  player: PlayerState;
  /** True for the point-of-view player's bar (bottom): styles as "me", hides its hand count. */
  isMe: boolean;
  /** True when this player is the one to act now (enables the Leader Skill button). */
  isMyTurn: boolean;
  g: ReturnType<typeof useGame>;
  dragKind: DragKind;
  /** Opponent's hand size to display (null = your own hand, don't show). */
  handCount: number | null;
  /** True when it is this player's turn — lights the banner so the active side is obvious. */
  isActive: boolean;
}) {
  const registry = useRegistry();
  const leaderDef = registry.leaders.get(player.leaderId);
  const leaderElem = leaderDef?.element;
  const heroTargeting = g.sel.kind === 'hero';
  const canUseSkill = isMe && isMyTurn;
  const leaderSkill = canUseSkill ? leaderDef?.heroPower : undefined;
  const heroActive = g.sel.kind === 'hero';
  const heroEffect = leaderSkill?.text ?? leaderSkill?.effects.map(effectLine).join('; ') ?? '';
  return (
    <div
      data-leader={player.id}
      className={`leader ${isMe ? 'leader--me' : 'leader--foe'} ${isActive ? 'leader--active' : ''} ${heroTargeting || dragKind === 'target' ? 'targetable' : ''}`}
      onClick={() => g.clickLeader(player.id)}
      onDragOver={(e) => dragKind === 'target' && e.preventDefault()}
      onDrop={() => g.dropOnTarget({ kind: 'leader', player: player.id })}
    >
      <div className="leader__crest" aria-hidden="true">
        {leaderElem && <ElementRune element={leaderElem} size={30} />}
      </div>
      <div className="leader__ident">
        <div className="leader__name">{who}{isActive && <span className="leader__toact" title="This player is to act">◆</span>}</div>
        <div className="leader__sub">{label}</div>
      </div>
      <div
        className="leader__hp"
        style={{ ['--hp-pct' as string]: `${Math.max(0, Math.min(100, (player.leaderHp / (player.leaderMaxHp ?? 30)) * 100))}%` }}
        title={`${player.leaderHp} / ${player.leaderMaxHp ?? 30} HP`}
      >
        <span className="leader__hp-fill" aria-hidden="true" />
        <span className="leader__hp-num">{player.leaderHp}<span className="leader__hp-unit"> HP</span></span>
      </div>
      {player.signatureUnlocked && <div className="leader__sig">★ Sig</div>}
      <div className="leader__res">
        {/* Banked elements deliberately omitted here — the Altar's ELEMENT BANKS panel already
            shows both players' banks in full, and duplicating them bloated this banner. */}
        <span className="leader__energy" title={`${player.energy} energy available`}>↯{player.energy}</span>
        {handCount !== null && (
          <span className="leader__handcount" title={`Opponent has ${handCount} card(s) in hand`}>
            ▤ {handCount}
          </span>
        )}
        <span className="deckpile" data-deck={player.id} title={`Draw pile: ${player.deck.length} card(s)`}>
          <span className="deckpile__icon" aria-hidden="true">▤</span>
          <span className="deckpile__count">{player.deck.length}</span>
        </span>
      </div>
      {canUseSkill && leaderSkill && (
        <button
          className={`leader__skill${player.heroPowerUsed ? ' leader__skill--used' : ''}${heroActive ? ' leader__skill--active' : ''}${g.hintMode && !player.heroPowerUsed ? ' leader__skill--hint' : ''}`}
          disabled={player.heroPowerUsed}
          onClick={(e) => { e.stopPropagation(); g.selectHero(); }}
          title={`${leaderSkill.name} — ${heroEffect} (cost ${formatCost(leaderSkill.cost)})`}
        >
          <span className="leader__skill-icon">{heroSkillIcon(leaderSkill.effects)}</span>
          <span className="leader__skill-body">
            <span className="leader__skill-name">{leaderSkill.name}</span>
            <span className="leader__skill-effect">{heroEffect}</span>
          </span>
          <span className="leader__skill-cost">
            {player.heroPowerUsed
              ? <span className="leader__skill-used">✓ Used</span>
              : <span className="herocost__energy">↯{leaderSkill.cost.energy}</span>}
          </span>
        </button>
      )}
    </div>
  );
}

/**
 * Lane-control ribbon (PvZ-Heroes-style): a two-sided tug bar in the mid-band showing total
 * attack the opponent (top) vs you (bottom) muster in this lane, so board pressure reads at a
 * glance. The fill splits proportionally; the leading side's number is emphasised.
 */
function LaneControl({ opp, me }: { opp: number; me: number }) {
  const total = opp + me;
  const oppPct = total > 0 ? Math.round((opp / total) * 100) : 50;
  const lead = me > opp ? 'me' : opp > me ? 'opp' : 'even';
  return (
    <div className={`lanectrl lanectrl--${lead}`} title={`Lane pressure — opponent ${opp} vs you ${me}`}>
      <span className={`lanectrl__num lanectrl__num--opp ${lead === 'opp' ? 'lanectrl__num--lead' : ''}`}>{opp}</span>
      <span className="lanectrl__bar">
        <span className="lanectrl__fill lanectrl__fill--opp" style={{ width: `${oppPct}%` }} />
        <span className="lanectrl__fill lanectrl__fill--me" style={{ width: `${100 - oppPct}%` }} />
      </span>
      <span className={`lanectrl__num lanectrl__num--me ${lead === 'me' ? 'lanectrl__num--lead' : ''}`}>{me}</span>
    </div>
  );
}

/**
 * One lane rendered as a single continuous rectangle spanning both players: the opponent's
 * half on top, a middle band (lane label + Environment), and your half at the bottom. The
 * Environment tints the whole column's background.
 */
function LaneColumn({
  lane,
  game,
  g,
  dragKind,
  onUnitDetail,
  sniperTargeting,
  combatAnim,
  declaring,
}: {
  lane: LaneId;
  game: GameState;
  g: ReturnType<typeof useGame>;
  dragKind: DragKind;
  onUnitDetail: (u: UnitInstance) => void;
  sniperTargeting: boolean;
  combatAnim: CombatAnim | null;
  declaring: boolean;
}) {
  const registry = useRegistry();
  const env = game.environments[lane];
  const envDroppable = dragKind === 'env';
  const envElement = env ? registry.cards.get(env.cardId)?.element : undefined;
  const combatActive = combatAnim?.lane === lane;
  const combatPhase = combatActive ? combatAnim!.phase : undefined;
  const opp = game.players[g.opponent];
  const me = game.players[g.pov];
  // Lane pressure: total attack each side musters in this lane, for the control ribbon.
  const laneAtk = (l: Lane): number => {
    let a = 0;
    for (const slot of ['front', 'back'] as const) { const u = l[slot]; if (u) a += Math.max(0, u.attack); }
    if (l.standaloneFoundation) a += Math.max(0, l.standaloneFoundation.attack);
    return a;
  };
  const oppAtk = laneAtk(opp.lanes[lane]);
  const myAtk = laneAtk(me.lanes[lane]);

  const half = (player: PlayerState, isActive: boolean) => {
    const heroTargeting = g.sel.kind === 'hero';
    const sacMode = g.sel.kind === 'sacrifice' && !g.sel.confirmed;
    const sacSet = g.sel.kind === 'sacrifice' ? g.sel.sac : [];
    const sandboxBrush = g.debugMode && Boolean(g.sandbox.brush);
    const unitClickable = heroTargeting || (sacMode && isActive) || sandboxBrush;
    const laneDroppable = dragKind === 'place' && isActive;
    return (
      <LaneView
        lane={player.lanes[lane]}
        laneId={lane}
        droppable={laneDroppable}
        dragCard={g.drag?.card ?? null}
        unitClickable={unitClickable}
        spellTarget={dragKind === 'target'}
        sacSet={sacSet}
        isOpponent={!isActive}
        sniperTarget={!isActive && sniperTargeting}
        onDropLane={(pos) => g.dropOnLane(player.id, lane, pos)}
        onSniperTarget={() => g.pickSniperTarget(lane)}
        onUnit={(iid) => g.clickUnit(iid, player.id)}
        onUnitDrop={(iid) => g.dropOnTarget({ kind: 'unit', iid })}
        onUnitDetail={onUnitDetail}
      />
    );
  };

  return (
    <div
      data-lane={lane}
      className={`lanecol lanecol--${lane}` +
        (env ? ` lanecol--env lanecol--env-${envElement}` : '') +
        (declaring ? ' lanecol--declare' : '') +
        (combatActive ? ` lanecol--combat lanecol--combat-${combatPhase}` : '')}
    >
      {half(opp, false)}
      <div
        className={`lanecol__mid ${envDroppable ? 'lanecol__mid--drop' : ''}`}
        onDragOver={(e) => envDroppable && e.preventDefault()}
        onDrop={envDroppable ? () => g.dropEnvironment(lane) : undefined}
      >
        <span className="lanecol__label">
          {LANE_LABEL[lane]}{lane === 'heights' ? ' ▲' : lane === 'water' ? ' ≈' : ''}
        </span>
        {(oppAtk > 0 || myAtk > 0) && <LaneControl opp={oppAtk} me={myAtk} />}
        {combatActive && combatPhase && (
          <span className={`lanecol__phase lane__phase--${combatPhase}`}>{COMBAT_PHASE_LABEL[combatPhase]}</span>
        )}
        {env ? <EnvironmentTile env={env} /> : envDroppable ? <span className="lanecol__hint">＋ drop environment</span> : null}
      </div>
      {half(me, true)}
    </div>
  );
}

function LaneView({
  lane,
  laneId,
  droppable,
  dragCard,
  unitClickable,
  spellTarget,
  sacSet,
  isOpponent,
  sniperTarget = false,
  onDropLane,
  onUnit,
  onUnitDrop,
  onUnitDetail,
  onSniperTarget,
}: {
  lane: Lane;
  laneId: LaneId;
  droppable: boolean;
  dragCard: Card | null;
  unitClickable: boolean;
  spellTarget: boolean;
  sacSet: string[];
  /** True for the opponent's half (top); orders units so the front rank sits toward centre. */
  isOpponent: boolean;
  /** When true, clicking the half selects this lane as a sniper target. */
  sniperTarget?: boolean;
  onDropLane: (pos?: 'front' | 'back') => void;
  onUnit: (iid: string) => void;
  onUnitDrop: (iid: string) => void;
  onUnitDetail: (u: UnitInstance) => void;
  onSniperTarget?: () => void;
}) {
  const renderUnit = (u: UnitInstance, slot: 'front' | 'back') => (
    <UnitView
      u={u}
      slot={slot}
      clickable={unitClickable}
      spellTarget={spellTarget}
      sacSelected={sacSet.includes(u.iid)}
      onClick={() => onUnit(u.iid)}
      onDropSpell={() => onUnitDrop(u.iid)}
      onDetail={onUnitDetail}
    />
  );

  // Double-Team placement: when a single ally unit holds the lane and the dragged unit (or the
  // resident) can Double Team, open a front/back slot so the new card can be placed either side.
  const draggedHasDT = dragCard?.type === 'unit' && Boolean((dragCard as { keywords?: Keywords }).keywords?.doubleTeam);
  const laneHasDT = Boolean(lane.front?.keywords?.doubleTeam);
  const showPositionZones = droppable && Boolean(lane.front) && !lane.back && (draggedHasDT || laneHasDT);

  // The middle band sits between the halves: the FRONT rank renders nearest it. So the
  // opponent's half (above) puts front last (bottom), your half (below) puts front first (top).
  const units = isOpponent
    ? [lane.back && renderUnit(lane.back, 'back'), lane.front && renderUnit(lane.front, 'front')]
    : [lane.front && renderUnit(lane.front, 'front'), lane.back && renderUnit(lane.back, 'back')];

  return (
    <div
      className={`lane lane--${laneId} lane--${isOpponent ? 'foe' : 'me'} ${droppable && !showPositionZones ? 'lane--drop' : ''} ${showPositionZones ? 'lane--dtplace' : ''} ${sniperTarget ? 'lane--sniper-target' : ''}`}
      onClick={sniperTarget ? onSniperTarget : undefined}
      onDragOver={(e) => droppable && !showPositionZones && e.preventDefault()}
      onDrop={showPositionZones ? undefined : () => onDropLane()}
    >
      {showPositionZones ? (
        <>
          <div className="lane__poszone lane__poszone--front"
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => onDropLane('front')}
            title="Place in the front rank (closer to the enemy)"
          >＋ Front</div>
          {renderUnit(lane.front!, 'front')}
          <div className="lane__poszone lane__poszone--back"
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => onDropLane('back')}
            title="Place in the back rank"
          >＋ Back</div>
        </>
      ) : (
        <>
          {units[0]}
          {units[1]}
          {!lane.front && lane.standaloneFoundation && renderUnit(lane.standaloneFoundation, 'front')}
          {!lane.front && !lane.back && !lane.standaloneFoundation && <div className="lane__empty">{droppable ? '＋' : '·'}</div>}
        </>
      )}
    </div>
  );
}

function EnvironmentTile({ env }: { env: EnvironmentInstance }) {
  const registry = useRegistry();
  const card = registry.cards.get(env.cardId);
  const name = card?.name ?? env.cardId;
  const text = card?.text ?? '';
  return (
    <div className="unit unit--environment" title={text ? `${name} — ${text}` : name}>
      <div className="unit__name">⬡ {name}</div>
      {text && <div className="unit__envtext">{text}</div>}
      <div className="unit__kw"><span className="kwbadge">Environment</span></div>
    </div>
  );
}

/** Numeric value carried by a keyword (e.g. Shield 3), or null for flag abilities. */
function abilityValue(a: NamedAbility, kw: Keywords): number | null {
  const v = kw[a.key as keyof Keywords];
  return typeof v === 'number' ? v : null;
}

/** Human-readable badge: icon + full ability name + numeric value where applicable. */
function shortBadge(a: NamedAbility, kw: Keywords): string {
  const v = abilityValue(a, kw);
  return v !== null ? `${a.icon} ${a.name} ${v}` : `${a.icon} ${a.name}`;
}

/** Ability names line for any card definition (units, foundations, spells). */
export function cardAbilityLine(card: Card): string {
  const kw = card.type === 'unit' ? card.keywords : card.type === 'foundation' ? (card.grants.keywords ?? {}) : {};
  const abilities = listAbilities(kw);
  const onHit = card.type === 'unit' && card.onHit ? Object.keys(card.onHit).map((k) => `✦ On-hit ${STATUS_INFO[k as keyof typeof STATUS_INFO]?.icon ?? ''} ${k}`) : [];
  // Spells and environments are defined by their effects — show those as icon lines too.
  const effects = card.type === 'spell' || card.type === 'environment' ? card.effects.map(effectLine) : [];
  return [...abilities.map((a) => shortBadge(a, kw)), ...onHit, ...effects].join(' · ');
}

/**
 * A stat number that flashes (green/gold up, red down) whenever its value changes — so any
 * buff, Growth, Bloodlust, debuff, heal or damage is visibly "shown" without reading the log.
 */
function StatNum({ value, kind }: { value: number; kind: 'atk' | 'hp' }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(value);
  useEffect(() => {
    if (prev.current === value) return;
    const up = value > prev.current;
    prev.current = value;
    const el = ref.current;
    if (!el) return;
    el.classList.remove('stat__num--up', 'stat__num--down');
    void el.offsetWidth; // force reflow so the animation restarts on repeat changes
    el.classList.add(up ? 'stat__num--up' : 'stat__num--down');
  }, [value]);
  return <span ref={ref} className={`stat__num stat__num--${kind}`}>{value}</span>;
}

/** The glyph shown behind a stat: a meaningful single ability, or the default sword/heart. */
interface StatGlyph { icon: string; title: string; val?: number | null }

/** Bottom-left ATK/HP block. The glyph behind each number conveys a single relevant ability
 *  (e.g. ◎ Sniper behind ATK, ▣ Shield behind HP) instead of the generic sword/heart. */
function StatBlock({ attack, hp, maxHp, atk, def }: {
  attack: number; hp: number; maxHp?: number; atk?: StatGlyph; def?: StatGlyph;
}) {
  const a: StatGlyph = atk ?? { icon: '⚔', title: `Attack: ${attack}` };
  const d: StatGlyph = def ?? { icon: '❤', title: maxHp !== undefined ? `HP: ${hp} / ${maxHp}` : `HP: ${hp}` };
  return (
    <div className="unit__stats">
      <span className="stat stat--atk" title={a.title}>
        <span className="stat__icon" aria-hidden="true">{a.icon}</span>
        <StatNum value={attack} kind="atk" />
        {a.val != null && <span className="stat__kw" title={a.title}>{a.val}</span>}
      </span>
      <span className="stat stat--hp" title={d.title}>
        <span className="stat__icon" aria-hidden="true">{d.icon}</span>
        <StatNum value={hp} kind="hp" />
        {d.val != null && <span className="stat__kw" title={d.title}>{d.val}</span>}
      </span>
    </div>
  );
}

/** Keywords that read as "attack" abilities (glyph goes behind ATK) and "HP" abilities (behind HP). */
const OFFENSIVE_KEYS = new Set<string>([
  'sniper', 'branchShot', 'splashDamage', 'strikeThrough', 'undershot', 'overshot',
  'doubleStrike', 'lethal', 'brittle', 'bloodlust', 'battleReady',
]);
const DEFENSIVE_KEYS = new Set<string>([
  'trueShield', 'taunt', 'immunity', 'zombified', 'shield', 'spike', 'tough', 'kamikaze', 'polish',
]);

/**
 * Decide what shows behind each stat and what stays as side badges. A single attack ability
 * (or summoning sickness) takes the ATK glyph; a single HP ability takes the HP glyph. With
 * more than one in a category, the default sword/heart stays and they all go to the side.
 */
function unitStatGlyphs(u: UnitInstance, abilities: NamedAbility[]): { atk: StatGlyph; def: StatGlyph; side: NamedAbility[] } {
  const valueOf = (a: NamedAbility): number | null => {
    const v = u.keywords[a.key as keyof Keywords];
    return typeof v === 'number' ? v : null;
  };
  const offensive = abilities.filter((a) => OFFENSIVE_KEYS.has(a.key));
  const defensive = abilities.filter((a) => DEFENSIVE_KEYS.has(a.key));
  const neutral = abilities.filter((a) => !OFFENSIVE_KEYS.has(a.key) && !DEFENSIVE_KEYS.has(a.key));

  // On-hit effects count as an attack ability (the icon is the inflicted status's).
  const onHitKeys = u.onHit ? Object.keys(u.onHit) : [];
  const onHit: NamedAbility | null = onHitKeys.length
    ? { key: '__onhit__', name: `On-hit: ${onHitKeys.join(', ')}`, icon: STATUS_INFO[onHitKeys[0] as keyof typeof STATUS_INFO]?.icon ?? '✦', description: 'Applies a status when it deals damage.' }
    : null;
  const atkCandidates = onHit ? [...offensive, onHit] : offensive;

  const sick = u.justPlaced && !u.keywords.battleReady;
  let atk: StatGlyph = { icon: '⚔', title: `Attack: ${u.attack}` };
  let atkUsed: NamedAbility | null = null;
  if (sick) {
    atk = { icon: '⏳', title: 'Summoning sickness — cannot attack this turn' };
  } else if (atkCandidates.length === 1) {
    const c = atkCandidates[0]!;
    atk = { icon: c.icon, title: `${c.name} — ${c.description}`, val: valueOf(c) };
    atkUsed = c;
  }

  let def: StatGlyph = { icon: '❤', title: u.maxHp !== undefined ? `HP: ${u.hp} / ${u.maxHp}` : `HP: ${u.hp}` };
  let defUsed: NamedAbility | null = null;
  if (defensive.length === 1) {
    const c = defensive[0]!;
    def = { icon: c.icon, title: `${c.name} — ${c.description}`, val: valueOf(c) };
    defUsed = c;
  }

  // Side badges = neutrals + any category abilities not promoted behind a stat (incl. on-hit).
  const side = [
    ...offensive.filter((a) => a !== atkUsed),
    ...(onHit && onHit !== atkUsed ? [onHit] : []),
    ...defensive.filter((a) => a !== defUsed),
    ...neutral,
  ];
  return { atk, def, side };
}

function statusBadges(u: UnitInstance): { icon: string; label: string; title: string }[] {
  return listStatuses(u.status).map((s) => {
    const val = u.status[s.key as keyof typeof u.status];
    const numericVal = typeof val === 'number' && val > 1 ? ` ${val}` : '';
    return { icon: s.icon, label: `${s.icon}${numericVal}`, title: `${s.name}${numericVal} — ${s.description}` };
  });
}

function UnitView({
  u,
  slot,
  clickable,
  spellTarget,
  sacSelected,
  onClick,
  onDropSpell,
  onDetail,
}: {
  u: UnitInstance;
  slot: 'front' | 'back';
  clickable: boolean;
  spellTarget: boolean;
  sacSelected: boolean;
  onClick: () => void;
  onDropSpell: () => void;
  onDetail: (u: UnitInstance) => void;
}) {
  const registry = useRegistry();
  const abilities = listAbilities(u.keywords);
  const { atk, def, side } = unitStatGlyphs(u, abilities);
  const frozen = (u.status.freeze ?? 0) > 0;
  const asleep = (u.status.sleep ?? 0) > 0;
  const burning = (u.status.burn ?? 0) > 0;
  const poisoned = (u.status.poisoned ?? 0) > 0;
  const drowning = Boolean(u.status.drowning);
  // Airborne units bob gently as if hovering — but a drowning/frozen body shouldn't fly.
  const flying = Boolean(u.keywords.airborne) && !drowning && !frozen;
  const stateClass = [
    frozen ? 'unit--frozen' : '',
    asleep ? 'unit--asleep' : '',
    burning ? 'unit--burning' : '',
    poisoned ? 'unit--poisoned' : '',
    drowning ? 'unit--drowning' : '',
    flying ? 'unit--flying' : '',
    // Persistent keyword states, readable on the body without parsing the badges.
    u.keywords.taunt ? 'unit--taunt' : '',
    ((u.keywords.shield ?? 0) > 0 || u.keywords.trueShield) ? 'unit--shielded' : '',
    u.keywords.immunity ? 'unit--immune' : '',
  ].filter(Boolean).join(' ');
  return (
    <div
      data-iid={u.iid}
      className={`unit unit--${slot} ${u.isFoundation ? 'unit--foundation' : ''} ${stateClass} ${clickable || spellTarget ? 'targetable' : ''} ${sacSelected ? 'unit--sac' : ''}`}
      title="Double-click for details"
      onClick={(e) => {
        e.stopPropagation();
        if (clickable) onClick();
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onDetail(u);
      }}
      onDragOver={(e) => spellTarget && e.preventDefault()}
      onDrop={(e) => {
        e.stopPropagation();
        onDropSpell();
      }}
    >
      {/* Persistent status visuals — recognisable at a glance without reading the badges. */}
      {burning && <div className="fx-flames" aria-hidden="true"><span>♨</span><span>♨</span><span>♨</span></div>}
      {poisoned && <div className="fx-poison" aria-hidden="true" />}
      {asleep && <div className="fx-zzz" aria-hidden="true"><span>Z</span><span>z</span><span>z</span></div>}
      {frozen && <div className="fx-ice" aria-hidden="true"><span className="fx-ice__crystal">❄</span></div>}
      {sacSelected && <div className="unit__dagger" title="Marked for sacrifice">†</div>}
      <div className="unit__name">{u.isFoundation ? '⌂ ' : ''}{registry.cards.get(u.cardId)?.name ?? u.cardId}</div>
      <div className="unit__body">
        <StatBlock attack={u.attack} hp={u.hp} maxHp={u.maxHp} atk={atk} def={def} />
        <div className="unit__meta">
          <div className="unit__kw">
            {side.map((a) => {
              const v = abilityValue(a, u.keywords);
              return (
                <span key={a.key} className="kwbadge" title={`${a.name} — ${a.description}`}>
                  <span className="kwbadge__icon" aria-hidden="true">{a.icon}</span>
                  {v !== null && <span className="kwbadge__val">{v}</span>}
                </span>
              );
            })}
          </div>
          <div className="unit__status">
            {statusBadges(u).map((s, i) => (
              <span key={i} className="statusbadge" title={s.title}>
                {s.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The opponent's hand rendered as face-down card backs (count only — never their identities).
 * Used in Adventure and multiplayer where the local player controls a single fixed side, so the
 * far hand should feel present without ever leaking cards. Purely presentational, count-driven.
 */
function OpponentHand({ count }: { count: number }) {
  if (count <= 0) return null;
  const center = (count - 1) / 2;
  return (
    <div className="ophand" style={{ ['--hand-n' as string]: count }} aria-label={`Opponent hand — ${count} card${count === 1 ? '' : 's'}`}>
      {Array.from({ length: count }, (_, i) => {
        const off = i - center;
        return (
          <div
            key={i}
            className="handback"
            aria-hidden="true"
            style={{ ['--rot' as string]: `${off * 3.4}deg`, ['--lift' as string]: `${-(off * off * 1.3)}px`, zIndex: 10 + i }}
          >
            <div className="handback__frame"><span className="handback__crest">✦</span></div>
          </div>
        );
      })}
    </div>
  );
}

function Hand({ g, active, onDetail }: { g: ReturnType<typeof useGame>; active: PlayerState; onDetail: (card: Card) => void }) {
  const registry = useRegistry();
  if (g.passing) return <div className="hand hand--hidden">Hand hidden — pass the device</div>;
  const n = active.hand.length;
  const center = (n - 1) / 2;
  return (
    <div className="hand" style={{ ['--hand-n' as string]: n }}>
      {active.hand.map((c, i) => {
        const def = registry.cards.get(c.cardId);
        if (!def) return null;
        const affordable = g.canAffordCard(c.iid);
        const armed = g.sel.kind === 'sacrifice' && g.sel.iid === c.iid;
        const draggable = affordable && g.canDrag(c.iid) && g.myTurn;
        // Fan the hand: rotate each card around its base and drop the edges into an arc.
        const off = i - center;
        const rot = off * 3.4;
        const lift = off * off * 1.6;
        const fan = {
          ['--rot' as string]: `${rot}deg`,
          ['--lift' as string]: `${lift}px`,
          zIndex: 10 + i,
        };
        return (
          <button
            key={c.iid}
            data-cardiid={c.iid}
            style={fan}
            className={`handcard chip--${def.element} ${armed ? 'handcard--armed' : ''} ${affordable ? '' : 'handcard--disabled'} ${g.hintMode && affordable ? 'handcard--playable' : ''} ${draggable ? 'handcard--drag' : ''}`}
            draggable={draggable}
            onDragStart={() => g.startDrag(c.iid)}
            onDragEnd={g.endDrag}
            onClick={() => g.clickHand(c.iid)}
            onDoubleClick={() => onDetail(def)}
            title={draggable ? 'Drag onto the board' : 'Double-click for details'}
          >
            <CardFace def={def} />
          </button>
        );
      })}
      {active.hand.length === 0 && <span className="muted">(empty hand)</span>}
    </div>
  );
}

function Controls({ g, active }: { g: ReturnType<typeof useGame>; active: PlayerState }) {
  const registry = useRegistry();
  const [bank, setBank] = useState<Partial<Record<Element, number>>>({});
  const [muted, setMutedUI] = useState(getMuted());
  const [volume, setVolumeUI] = useState(getVolume());
  const [musicMuted, setMusicMutedUI] = useState(getMusicMuted());
  const banked = ELEMENTS.reduce((s, e) => s + (bank[e] ?? 0), 0);
  // Banking is a commit that only happens on End Turn, so queuing it is meaningless when it
  // isn't your turn — drop any queued banking the moment the turn hands off so the counter
  // doesn't strand energy that can never be committed.
  useEffect(() => { if (!g.myTurn) setBank({}); }, [g.myTurn]);
  const addBank = (e: Element) => setBank((b) => ({ ...b, [e]: (b[e] ?? 0) + 1 }));
  const subBank = (e: Element) => setBank((b) => ({ ...b, [e]: Math.max(0, (b[e] ?? 0) - 1) }));
  const leader = registry.leaders.get(active.leaderId);
  const leaderSkill = leader?.heroPower;
  const heroNeedsElement = leaderSkill?.effects.some((e) => e.kind === 'energy' && e.chooseElement) ?? false;
  const sac = g.sel.kind === 'sacrifice' ? g.sel : null;
  const cardSel = g.sel.kind === 'card' ? g.sel : null;
  const energyLeft = active.energy - banked;
  const opp = g.game.players[g.opponent];
  const oppName = registry.leaders.get(opp.leaderId)?.name ?? 'Opp';

  return (
    <div className="controls">

      {/* Enemy reserves — the opponent's banked elements. Your own banks aren't duplicated
          here; they live in the Banking tiles below. */}
      <div className="enemybanks">
        <span className="bankview__label">{oppName}’s Reserves</span>
        <div className="enemybanks__row">
          {ELEMENTS.map((e) => {
            const theirs = opp.bank[e];
            const theirCap = opp.elementCaps[e];
            return (
              <span key={e} className={`enemybank enemybank--${e} ${theirs > 0 ? 'enemybank--stocked' : ''}`} title={`${oppName} has ${theirs}/${theirCap} ${ELEMENT_NAME[e]} banked`}>
                <ElementRune element={e} size={15} />
                <span className="enemybank__amt">{theirs}<span className="enemybank__cap">/{theirCap}</span></span>
              </span>
            );
          })}
        </div>
      </div>

      <div className="controls__divider" />

      {/* Banking */}
      <div className="bankpanel">
        <div className="bankpanel__head">
          <span className="bankpanel__label">Banking</span>
          <span className="bankpanel__energy">↯{energyLeft} left</span>
        </div>
        <div className="bankpanel__grid">
          {ELEMENTS.map((e) => {
            const cap = active.elementCaps[e];
            const current = active.bank[e];
            const pending = bank[e] ?? 0;
            const total = current + pending;
            const atCap = total >= cap;
            return (
              <div key={e} className={`banktile banktile--${e}${pending > 0 ? ' banktile--active' : ''}`}>
                <span className="banktile__icon"><ElementRune element={e} size={18} /> <span className="banktile__elname">{ELEMENT_NAME[e]}</span></span>
                <span className="banktile__fraction">{total}<span className="banktile__cap">/{cap}</span></span>
                {pending > 0 && <span className="banktile__pending">+{pending}</span>}
                <div className="banktile__btns">
                  <button className="banktile__btn" disabled={!g.myTurn || pending === 0} onClick={() => subBank(e)} title={`Unqueue 1 ${e}`}>−</button>
                  <button className="banktile__btn" disabled={!g.myTurn || energyLeft <= 0 || atCap} onClick={() => addBank(e)} title={`Queue 1 ${e}`}>+</button>
                </div>
              </div>
            );
          })}
        </div>
        {banked > 0 && <button className="bankpanel__clear" onClick={() => setBank({})}>Clear</button>}
      </div>

      <div className="controls__divider" />

      {/* End Turn */}
      <button
        className="btn-end"
        disabled={g.animating || !g.myTurn}
        onClick={() => { g.endTurn(banked > 0 ? bank : undefined); setBank({}); }}
      >
        {g.animating ? 'Resolving…' : !g.myTurn ? 'Opponent’s turn…' : 'End Turn ▶'}
      </button>
      {g.sel.kind !== 'none' && (
        <button className="btn-cancel" onClick={g.cancelSelection} title="Or right-click anywhere on the board">Cancel <span className="muted" style={{ fontSize: 11 }}>(or right-click)</span></button>
      )}

      {/* Sound */}
      <div className="audioctl">
        <button
          className="audioctl__toggle"
          onClick={() => { const m = !muted; setMuted(m); setMutedUI(m); }}
          title={muted ? 'Unmute sound' : 'Mute sound'}
        >
          {muted ? '⊘' : '♪'}
        </button>
        <input
          className="audioctl__slider"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={volume}
          disabled={muted}
          onChange={(ev) => { const v = Number(ev.target.value); setVolume(v); setVolumeUI(v); }}
          title="Sound volume"
        />
        <button
          className={`audioctl__toggle${musicMuted ? ' audioctl__toggle--off' : ''}`}
          onClick={() => { const m = !musicMuted; setMusicMuted(m); setMusicMutedUI(m); }}
          title={musicMuted ? 'Enable music' : 'Mute music'}
        >
          ♫
        </button>
      </div>

      {/* Context: card selected, sacrifice, hero target, etc. */}
      <div className="controls__ctx">
        {cardSel && (
          <div className="selinfo">
            <b>{cardSel.card.name}</b>
            <div className="selinfo__abilities">
              {abilitiesForCard(cardSel.card).map((a) => (
                <span key={a.key} className="ability" title={a.description}>{a.name}</span>
              ))}
              {cardSel.card.type === 'spell' && cardSel.card.effects.map((e, i) => (
                <span key={i} className="ability">{effectLine(e)}</span>
              ))}
              {abilitiesForCard(cardSel.card).length === 0 && cardSel.card.type !== 'spell' && (
                <span className="muted">No special abilities.</span>
              )}
            </div>
          </div>
        )}
        {sac && !sac.confirmed && (
          <>
            <span className="hint">† Sacrifice up to {sac.sacNeed} ({sac.sac.length}/{sac.sacNeed}) then confirm.</span>
            <button className="btn-sac" disabled={sac.sac.length > sac.sacNeed} onClick={g.confirmSacrifice}>
              {sac.sac.length === 0 ? 'Play Without Sacrifice' : 'Confirm Sacrifice'}
            </button>
          </>
        )}
        {sac && sac.confirmed && <span className="hint">Armed — drag {sac.card.name} to a lane.</span>}
        {g.sel.kind === 'hero' && heroNeedsElement && (
          <div className="selinfo selinfo--col">
            <span className="hint">Choose element to bank:</span>
            <div className="selinfo__row">
              {ELEMENTS.map((e) => (
                <button key={e} className={`chip chip--${e}`} onClick={() => g.pickHeroElement(e)}><ElementRune element={e} size={16} /> {ELEMENT_NAME[e]}</button>
              ))}
            </div>
          </div>
        )}
        {g.sel.kind === 'hero' && !heroNeedsElement && (
          <span className="hint">Click a target unit or leader.</span>
        )}
        {g.sel.kind === 'spellMove' && (
          <div className="selinfo selinfo--col">
            <span className="hint">⌖ Destination for <b>{g.sel.card.name}</b>:</span>
            <div className="selinfo__row">
              {LANES.map((l) => (
                <button key={l} className="chip" onClick={() => g.pickMoveLane(l)}>{LANE_LABEL[l]}</button>
              ))}
            </div>
          </div>
        )}
        {g.sel.kind === 'sniperPhase' && (() => {
          const current = g.sel.pending[0];
          return current ? (
            <span className="hint">
              ◎ <b>{current.name}</b>: click an enemy lane.
              {g.sel.pending.length > 1 ? ` (${g.sel.pending.length - 1} more)` : ''}
            </span>
          ) : null;
        })()}
        {g.sel.kind === 'pending' && (() => {
          const pc = g.game.pending?.[0];
          if (!pc) return null;
          const label = g.registry.cards.get(findUnitCardId(g.game, pc.sourceIid))?.name ?? 'Effect';
          const scopeWord = pc.scope === 'enemy' ? 'an enemy' : pc.scope === 'ally' ? 'an ally' : pc.scope === 'self' ? 'this' : 'any';
          const verb = pc.kind === 'expel' ? 'expel' : 'move';
          return (
            <div className="selinfo selinfo--col">
              {!g.sel.pickedUnit ? (
                <span className="hint">⇄ <b>{label}</b>: click {scopeWord} unit to {verb}.</span>
              ) : (
                <div className="selinfo selinfo--col">
                  <span className="hint">⌖ Move to which lane?</span>
                  <div className="selinfo__row">
                    {LANES.map((l) => (
                      <button key={l} className="chip" onClick={() => g.pickPendingLane(l)}>{LANE_LABEL[l]}</button>
                    ))}
                  </div>
                </div>
              )}
              <button className="chip" onClick={g.skipPending}>Skip</button>
            </div>
          );
        })()}
        {g.message && <span className="errmsg">{g.message}</span>}
      </div>
    </div>
  );
}

/** Find the cardId of a unit on the board by its instance id (for prompt labelling). */
function findUnitCardId(game: GameState, iid: string): string {
  for (const p of [0, 1] as const) {
    for (const lane of LANES) {
      for (const slot of ['front', 'back'] as const) {
        const u = game.players[p].lanes[lane][slot];
        if (u?.iid === iid) return u.cardId;
      }
    }
  }
  return '';
}

export function effectLine(e: Effect): string {
  const t = e.target ? ` (${e.target})` : '';
  switch (e.kind) {
    case 'damage': return `✸ Deal ${e.amount}${t}`;
    case 'heal': return `✚ Heal ${e.amount}${t}`;
    case 'buff': return `↑ Buff ${e.stat?.attack ? `+${e.stat.attack} atk ` : ''}${e.stat?.hp ? `+${e.stat.hp} hp` : ''}${t}`;
    case 'debuff': return `▼ Debuff${t}`;
    case 'draw': return `♠ Draw ${e.amount}`;
    case 'applyStatus': return `${STATUS_INFO[e.status as keyof typeof STATUS_INFO]?.icon ?? '✧'} Apply ${STATUS_INFO[e.status as keyof typeof STATUS_INFO]?.name ?? e.status}${t}`;
    case 'energy': return `↯ Gain ${e.amount} energy`;
    case 'move': return `⇄ Move${t}`;
    case 'expel': return `↩ Expel${t}`;
    case 'forget': return `⌫ Forget${t}`;
    case 'summon': return `♟ Summon ${e.cardId ?? ''}${e.lane ? ` in ${e.lane}` : ''}`;
    case 'conjure': return `♢ Conjure ${e.cardId ?? ''}${t}`;
    case 'extraAction': return `↯ Bonus action${t}`;
    case 'costMod': return `¤ Spell cost ${(e.amount ?? 0) >= 0 ? '+' : ''}${e.amount}${t}`;
    default: return e.kind;
  }
}

/** Icon representing what an effect does (matches the glyphs used in effectLine). */
const EFFECT_ICON: Partial<Record<Effect['kind'], string>> = {
  damage: '✸', heal: '✚', buff: '↑', debuff: '▼', draw: '♠', applyStatus: '✧',
  energy: '↯', move: '⇄', expel: '↩', forget: '⌫', summon: '♟', conjure: '♢',
  extraAction: '↯', costMod: '¤', cleanse: '✧', setStats: '⚙',
};

/** Pick an icon for a Leader Skill from what it does (its first/primary effect). */
function heroSkillIcon(effects: Effect[]): string {
  const e = effects[0];
  if (!e) return '✧';
  if (e.kind === 'applyStatus') return STATUS_INFO[e.status as keyof typeof STATUS_INFO]?.icon ?? '✧';
  return EFFECT_ICON[e.kind] ?? '✧';
}

function abilitiesForCard(card: Card): NamedAbility[] {
  if (card.type === 'unit') return listAbilities(card.keywords);
  if (card.type === 'foundation') return listAbilities(card.grants.keywords ?? {});
  return [];
}

const SANDBOX_BRUSHES: { key: NonNullable<ReturnType<typeof useGame>['sandbox']['brush']>; label: string }[] = [
  { key: 'burn', label: '♨ Burn' },
  { key: 'poison', label: '☠ Poison' },
  { key: 'sleep', label: '☾ Sleep' },
  { key: 'freeze', label: '❄ Freeze' },
  { key: 'drowning', label: '⇊ Drown' },
  { key: 'clear', label: '✧ Clear' },
  { key: 'remove', label: '⌫ Remove' },
];

function DebugPanel({ g }: { g: ReturnType<typeof useGame> }) {
  const registry = useRegistry();
  const [query, setQuery] = useState('');
  const { sandbox } = g;
  const q = query.toLowerCase();
  const allCards = [...registry.cards.values()].filter(
    (c) => c.id !== '__null__' && !c.id.startsWith('sig-') &&
           (q === '' || c.name.toLowerCase().includes(q) || c.type.includes(q)),
  );
  return (
    <div className="debug-panel">
      <div className="debug-panel__head">
        ※ <b>Sandbox</b> — <span className="muted">Unlimited energy · inject cards · place units · paint statuses</span>
      </div>

      <div className="sandbox__row">
        <label className={`sandbox__mode ${!sandbox.placeMode ? 'sandbox__mode--on' : ''}`}>
          <input type="radio" checked={!sandbox.placeMode} onChange={() => g.setSandbox({ placeMode: false })} /> Add to hand
        </label>
        <label className={`sandbox__mode ${sandbox.placeMode ? 'sandbox__mode--on' : ''}`}>
          <input type="radio" checked={sandbox.placeMode} onChange={() => g.setSandbox({ placeMode: true })} /> Place on board
        </label>
        {sandbox.placeMode && (
          <>
            <select value={sandbox.target} onChange={(e) => g.setSandbox({ target: e.target.value as 'me' | 'foe' })}>
              <option value="me">Your side</option>
              <option value="foe">Opponent</option>
            </select>
            <select value={sandbox.lane} onChange={(e) => g.setSandbox({ lane: e.target.value as LaneId })}>
              {LANES.map((l) => <option key={l} value={l}>{LANE_LABEL[l]}</option>)}
            </select>
            <select value={sandbox.pos} onChange={(e) => g.setSandbox({ pos: e.target.value as 'front' | 'back' })}>
              <option value="front">Front</option>
              <option value="back">Back</option>
            </select>
          </>
        )}
      </div>

      <div className="sandbox__row">
        <span className="muted" style={{ fontSize: 11 }}>Status brush (then click a unit):</span>
        {SANDBOX_BRUSHES.map((b) => (
          <button
            key={b.key}
            className={`sandbox__brush ${sandbox.brush === b.key ? 'sandbox__brush--on' : ''}`}
            onClick={() => g.setSandbox({ brush: sandbox.brush === b.key ? null : b.key })}
          >{b.label}</button>
        ))}
        <span className="sandbox__row-spacer" />
        <button className="btn-cancel" onClick={g.clearBoard}>Clear board</button>
      </div>

      <input
        className="debug-panel__search"
        placeholder="Search cards…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="debug-panel__list">
        {allCards.map((c) => {
          const placeable = !sandbox.placeMode || c.type === 'unit';
          return (
            <button
              key={c.id}
              className={`debug-card chip--${c.element} ${placeable ? '' : 'debug-card--disabled'}`}
              disabled={!placeable}
              onClick={() => g.debugInject(c.id)}
              title={sandbox.placeMode ? (c.type === 'unit' ? `Place ${c.name} on ${sandbox.target === 'me' ? 'your' : "opponent's"} ${LANE_LABEL[sandbox.lane]} (${sandbox.pos})` : 'Only units can be placed') : `Add ${c.name} to hand`}
            >
              <span className="debug-card__type">{c.type[0]!.toUpperCase()}</span>
              <span className="debug-card__name">{c.name}</span>
              <span className="debug-card__cost muted">{c.cost.energy}E</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** The inner content of a card/unit detail — head, stats, abilities, effects, statuses, text.
 *  Shared by the click-to-open modal (`CardDetail`) and the hover peek (`HoverPeek`). */
export function DetailBody({ detail }: { detail: Detail }) {
  const registry = useRegistry();
  const def = detail.kind === 'unit' ? registry.cards.get(detail.unit.cardId) : detail.card;
  const name = detail.kind === 'unit' ? def?.name ?? detail.unit.cardId : detail.card.name;
  const type = def?.type ?? 'unit';
  const abilities = detail.kind === 'unit' ? listAbilities(detail.unit.keywords) : def ? abilitiesForCard(def) : [];
  const statuses = detail.kind === 'unit' ? listStatuses(detail.unit.status) : [];
  const effects = def && (def.type === 'spell' || def.type === 'environment') ? def.effects : [];
  return (
    <>
        <div className="detail__head">
          <h3>{name}</h3>
          {def?.element && <span className={`chip chip--${def.element}`}><ElementRune element={def.element} size={15} /> {ELEMENT_NAME[def.element]}</span>}
          <span className="chip">{type}</span>
          {def && 'tags' in def && (def.tags as string[]).map((a) => (
            <span key={a} className="chip chip--archetype">{a}</span>
          ))}
          {def && 'wip' in def && (def as { wip?: boolean }).wip && (
            <span className="chip chip--wip">⚠ Unfinished</span>
          )}
        </div>
        <div className="detail__stats">
          {def && <span><b>Cost:</b> {formatCost(def.cost)}</span>}
          {detail.kind === 'unit' && <span><b>ATK:</b> {detail.unit.attack} · <b>HP:</b> {detail.unit.hp}/{detail.unit.maxHp}</span>}
          {detail.kind === 'card' && def?.type === 'unit' && <span><b>ATK:</b> {def.attack} · <b>HP:</b> {def.hp}</span>}
          {detail.kind === 'card' && def?.type === 'foundation' && <span><b>ATK:</b> {def.attack} · <b>HP:</b> {def.hp}</span>}
        </div>
        {abilities.length > 0 && (
          <div className="detail__section">
            <h4>Abilities</h4>
            {abilities.map((a) => (
              <div key={a.key} className="detail__ability"><span className="detail__icon" aria-hidden="true">{a.icon}</span> <b>{a.name}</b> — {a.description}</div>
            ))}
          </div>
        )}
        {effects.length > 0 && (
          <div className="detail__section">
            <h4>Effect</h4>
            {effects.map((e, i) => (
              <div key={i} className="detail__ability">{effectLine(e)}</div>
            ))}
          </div>
        )}
        {statuses.length > 0 && (
          <div className="detail__section">
            <h4>Status effects</h4>
            {statuses.map((s) => {
              const u = detail.kind === 'unit' ? detail.unit : null;
              const val = u ? u.status[s.key as keyof typeof u.status] : undefined;
              const numericVal = typeof val === 'number' && val > 0 ? ` ${val}` : '';
              return (
                <div key={s.key} className="detail__ability">
                  <span className="detail__icon" aria-hidden="true">{s.icon}</span> <b>{s.name}{numericVal}</b> — {s.description}
                </div>
              );
            })}
          </div>
        )}
        {def?.text && <p className="detail__text">{def.text}</p>}
    </>
  );
}

export function CardDetail({ detail, onClose }: { detail: Detail; onClose: () => void }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="detail" onClick={(e) => e.stopPropagation()}>
        <DetailBody detail={detail} />
        <button onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

/** A non-modal, hover-triggered inspect panel floated beside the hovered unit/card, so any
 *  board unit can be read fully without opening the modal. */
function HoverPeek({ peek }: { peek: { detail: Detail; rect: DOMRect } | null }) {
  if (!peek) return null;
  const { rect } = peek;
  const W = 300, gap = 12;
  let left = rect.right + gap;
  if (left + W > window.innerWidth - 4) left = rect.left - W - gap;
  left = Math.max(6, Math.min(left, window.innerWidth - W - 6));
  const top = Math.max(6, Math.min(rect.top, window.innerHeight - 340));
  return (
    <div className="peek" style={{ left, top, width: W }} aria-hidden="true">
      <div className="detail detail--peek"><DetailBody detail={peek.detail} /></div>
    </div>
  );
}

/**
 * The visual anatomy of a playing card: cost jewel + element rune pips, an art window with a
 * large element rune, name banner, type line, rules text, and ATK/HP plaques. Shared by the
 * hand and every MiniCard so cards read identically everywhere.
 */
export function CardFace({ def }: { def: Card }) {
  const kwLine = cardAbilityLine(def);
  const hasBody = 'attack' in def && 'hp' in def;
  const pips = (def.cost.elements ?? []).flatMap((e) => Array(e.amount).fill(e.type) as Element[]);
  return (
    <span className="card__frame">
      <span className="card__top">
        <span className="card__cost" title="Energy cost">{def.cost.energy}</span>
        {pips.length > 0 && (
          <span className="card__pips" title="Element cost">
            {pips.map((el, i) => <ElementRune key={i} element={el} size={15} />)}
          </span>
        )}
        <ElementRune element={def.element} size={20} className="card__gem" />
      </span>
      <span className="card__art">
        <ElementRune element={def.element} size={38} className="card__sigil" />
      </span>
      <span className="card__name">{def.name}</span>
      <span className="card__type">{ELEMENT_NAME[def.element]} · {def.type}</span>
      {kwLine && <span className="card__text">{kwLine}</span>}
      {hasBody && (
        <span className="card__stats">
          <span className="card__atk" title="Attack">{(def as { attack: number }).attack}</span>
          <span className="card__hp" title="Health">{(def as { hp: number }).hp}</span>
        </span>
      )}
    </span>
  );
}

export function MiniCard({ card, onClick }: { card: Card; onClick?: () => void }) {
  const isWip = 'wip' in card && (card as { wip?: boolean }).wip;
  return (
    <button className={`handcard chip--${card.element}${isWip ? ' handcard--wip' : ''}`} onClick={onClick} title="Click for details">
      <CardFace def={card} />
    </button>
  );
}

/** Merge every iid→cardId we can see (all zones) into `map`, so units that have since died
 *  or left play still resolve to a readable name in the log. */
function mergeNameMap(map: Map<string, string>, game: GameState): void {
  for (const player of Object.values(game.players)) {
    for (const lane of Object.values(player.lanes)) {
      for (const slot of ['front', 'back'] as const) {
        const u = lane[slot];
        if (u) {
          map.set(u.iid, u.cardId);
          if (u.foundation) map.set(u.foundation.iid, u.foundation.cardId);
        }
      }
      if (lane.standaloneFoundation) map.set(lane.standaloneFoundation.iid, lane.standaloneFoundation.cardId);
    }
    for (const c of [...player.hand, ...player.deck, ...player.discard]) map.set(c.iid, c.cardId);
  }
}

/** Sub-events that read as nested details of the preceding headline (combat hits, ticks…). */
const DETAIL_EVENTS = new Set<GameEvent['t']>([
  'damageUnit', 'damageLeader', 'retaliate', 'blocked', 'shieldBlock', 'spike', 'lethal', 'intercept',
  'unitDestroyed', 'foundationBonded', 'foundationDestroyed', 'heal', 'buff', 'statusApplied', 'burnTick',
  'poisonTick', 'drownTick', 'growth', 'brittle', 'zombieRevive', 'transform', 'sacrifice', 'wake', 'cleanse', 'moved', 'statusExpired',
  'expel', 'forget', 'summon', 'conjure', 'extraAction', 'costMod', 'drowning', 'mitigated',
]);

function LogPanel({ log, game, pov }: { log: GameEvent[]; game: GameState; pov: PlayerId }) {
  const registry = useRegistry();
  const nameMapRef = useRef<Map<string, string>>(new Map());
  useMemo(() => mergeNameMap(nameMapRef.current, game), [game]);
  const resolve = (iid: string): string => {
    const cardId = nameMapRef.current.get(iid);
    return (cardId && registry.cards.get(cardId)?.name) || cardId || 'a unit';
  };
  const cardName = (cardId: string): string => registry.cards.get(cardId)?.name ?? cardId;

  const you = game.players[pov];
  const opp = game.players[pov === 0 ? 1 : 0];
  const youName = registry.leaders.get(you.leaderId)?.name ?? 'You';
  const oppName = registry.leaders.get(opp.leaderId)?.name ?? 'Opp';

  return (
    <div className="logpanel">
      {/* Game stats */}
      <div className="gamestats">
        <div className="gamestats__round">Round {game.round}</div>
        <table className="gamestats__table">
          <thead>
            <tr>
              <th />
              <th className="gamestats__col gamestats__col--you">{youName}</th>
              <th className="gamestats__col gamestats__col--opp">{oppName}</th>
            </tr>
          </thead>
          {/* Energy and HP intentionally omitted — both are shown prominently on the leader
              banners (and energy again on the Altar). Only the side-by-side counts that have
              no other paired display are kept here. */}
          <tbody>
            <tr>
              <td className="gamestats__label">Hand</td>
              <td className="gamestats__val">{you.hand.length}</td>
              <td className="gamestats__val gamestats__val--opp">{opp.hand.length}</td>
            </tr>
            <tr>
              <td className="gamestats__label">Deck</td>
              <td className="gamestats__val">{you.deck.length}</td>
              <td className="gamestats__val gamestats__val--opp">{opp.deck.length}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="logpanel__head">Event Log</div>
      <div className="logpanel__body">
        {log
          .slice(-200)
          .map((e, i) => (
            <div key={i} className={`logline logline--${e.t} ${DETAIL_EVENTS.has(e.t) ? 'logline--detail' : 'logline--head'}`}>
              {fmt(e, resolve, cardName)}
            </div>
          ))
          .reverse()}
      </div>
    </div>
  );
}

/** Deck-selection menu shown when starting a new game. Each player picks their deck,
 *  the choices are persisted to the content store, then the caller starts the game. */
function DeckPicker({ onStart, onCancel }: { onStart: () => void; onCancel: () => void }) {
  const { registry, decks, selected } = useContent();
  const leaderName = (id: string) => registry.leaders.get(id)?.name ?? id;
  return (
    <Overlay>
      <h2>Choose decks</h2>
      <div className="deckpicker">
        {([0, 1] as const).map((side) => {
          const deck = decks.find((d) => d.name === selected[side]);
          return (
            <label key={side} className="fld">
              <span>Player {side + 1}</span>
              <select value={selected[side]} onChange={(e) => store.setSelectedDeck(side, e.target.value)}>
                {decks.map((d) => <option key={d.name} value={d.name}>{d.name}</option>)}
              </select>
              {deck && <span className="muted deckpicker__leader">Leader: {leaderName(deck.leaderId)}</span>}
            </label>
          );
        })}
      </div>
      <div className="deckpicker__actions">
        <button className="btn-end" onClick={onStart}>Start game</button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    </Overlay>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="overlay">
      <div className="overlay__box">{children}</div>
    </div>
  );
}

type StatusKey = 'burn' | 'poison' | 'sleep' | 'freeze';
interface PlayerSummary {
  damageDealt: number; unitDmgDealt: number; expelled: number;
  dmgTanked: number; dmgMitigated: number; healingDone: number;
  burnDmg: number; poisonDmg: number; sleepHealed: number; freezeBlocked: number;
  statusInflicted: Record<StatusKey, number>;
  unitsPlayed: number; foundationsPlaced: number; tokensMade: number;
  spellsCast: number; environmentsPlayed: number; drew: number;
  banked: number; produced: number; heroPowers: number;
  milled: number; nulls: number; sigUnlocked: number;
}

/** Tally per-player match stats from the event log. Damage/statuses/expels are attributed via
 *  each affected unit/leader's `victim` owner (the dealer is the opponent). `timeline` samples
 *  both leaders' HP at the start of every turn (plus a final point) for the per-turn graph. */
interface CardGameStats { plays: number; dmg: number }

function summarizeGame(log: GameEvent[], nameMap?: Map<string, string>): { turns: number; stats: [PlayerSummary, PlayerSummary]; timeline: [number, number][]; cardStats: [Record<string, CardGameStats>, Record<string, CardGameStats>] } {
  const blank = (): PlayerSummary => ({
    damageDealt: 0, unitDmgDealt: 0, expelled: 0, dmgTanked: 0, dmgMitigated: 0, healingDone: 0,
    burnDmg: 0, poisonDmg: 0, sleepHealed: 0, freezeBlocked: 0,
    statusInflicted: { burn: 0, poison: 0, sleep: 0, freeze: 0 },
    unitsPlayed: 0, foundationsPlaced: 0, tokensMade: 0, spellsCast: 0, environmentsPlayed: 0, drew: 0,
    banked: 0, produced: 0, heroPowers: 0, milled: 0, nulls: 0, sigUnlocked: 0,
  });
  const stats: [PlayerSummary, PlayerSummary] = [blank(), blank()];
  const leaderTaken: [number, number] = [0, 0];
  const foe = (v: PlayerId): PlayerId => (v === 0 ? 1 : 0);
  const hp: [number, number] = [RULES.LEADER_HP, RULES.LEADER_HP];
  const timeline: [number, number][] = [[hp[0], hp[1]]];
  const cardStats: [Record<string, CardGameStats>, Record<string, CardGameStats>] = [{}, {}];
  const cardSt = (p: PlayerId, cardId: string): CardGameStats => (cardStats[p][cardId] ??= { plays: 0, dmg: 0 });
  let turns = 0;
  let activePlayer: PlayerId = 0;
  for (const e of log) {
    switch (e.t) {
      case 'turnStart': turns += 1; activePlayer = e.player; timeline.push([hp[0], hp[1]]); break;
      case 'damageLeader': leaderTaken[e.player] += e.amount; hp[e.player] = e.hpAfter; break;
      case 'heal':
        // Sleep's heal benefits the SLEEPING unit's owner (whether you sleep an ally or an enemy).
        if (e.source === 'sleep') { if (e.victim !== undefined) stats[e.victim].sleepHealed += e.amount; }
        else if (e.victim !== undefined) stats[e.victim].healingDone += e.amount;
        else if (e.player !== undefined) { stats[e.player].healingDone += e.amount; hp[e.player] = Math.min(RULES.LEADER_HP, hp[e.player] + e.amount); }
        break;
      case 'damageUnit': if (e.victim !== undefined) { stats[foe(e.victim)].unitDmgDealt += e.amount; stats[e.victim].dmgTanked += e.amount; } break;
      case 'mitigated': stats[e.victim].dmgMitigated += e.amount; break;
      // Freeze's block protects the FROZEN unit's owner (a self-cast Freeze defends your unit).
      case 'blocked': if (e.source === 'freeze' && e.victim !== undefined && e.amount) stats[e.victim].freezeBlocked += e.amount; break;
      case 'burnTick': if (e.victim !== undefined) stats[foe(e.victim)].burnDmg += e.amount; break;
      case 'poisonTick': if (e.victim !== undefined) stats[foe(e.victim)].poisonDmg += e.amount; break;
      case 'statusApplied':
        if (e.victim !== undefined && (e.status === 'burn' || e.status === 'poison' || e.status === 'sleep' || e.status === 'freeze'))
          stats[foe(e.victim)].statusInflicted[e.status] += 1;
        break;
      case 'expel': if (e.victim !== undefined) stats[foe(e.victim)].expelled += 1; break;
      case 'playUnit': stats[e.player].unitsPlayed += 1; cardSt(e.player, e.cardId).plays += 1; break;
      case 'foundationPlaced': stats[e.player].foundationsPlaced += 1; cardSt(e.player, e.cardId).plays += 1; break;
      case 'summon': case 'conjure': stats[e.player].tokensMade += 1; cardSt(e.player, e.cardId).plays += 1; break;
      case 'castSpell': stats[e.player].spellsCast += 1; cardSt(e.player, e.cardId).plays += 1; break;
      case 'playEnvironment': stats[e.player].environmentsPlayed += 1; cardSt(e.player, e.cardId).plays += 1; break;
      case 'attack': { const cid = nameMap?.get(e.attacker); if (cid) cardSt(activePlayer, cid).dmg += e.amount; break; }
      case 'draw': stats[e.player].drew += 1; break;
      case 'bank': stats[e.player].banked += e.amount; break;
      case 'produce': stats[e.player].produced += e.amount; break;
      case 'heroPower': stats[e.player].heroPowers += 1; break;
      case 'forget': stats[e.player].milled += 1; break;
      case 'drawNull': stats[e.player].nulls += 1; break;
      case 'signatureUnlocked': stats[e.player].sigUnlocked = 1; break;
    }
  }
  timeline.push([hp[0], hp[1]]);
  stats[0].damageDealt = leaderTaken[1];
  stats[1].damageDealt = leaderTaken[0];
  return { turns, stats, timeline, cardStats };
}

const SUMMARY_SECTIONS: { title: string; rows: { key: keyof PlayerSummary; label: string; icon: string; bool?: boolean }[] }[] = [
  { title: 'Offense', rows: [
    { key: 'damageDealt', label: 'Leader damage dealt', icon: '✸' },
    { key: 'unitDmgDealt', label: 'Unit damage dealt', icon: '⚔' },
    { key: 'expelled', label: 'Units expelled', icon: '↩' },
  ] },
  { title: 'Defense & sustain', rows: [
    { key: 'dmgTanked', label: 'Damage taken (units)', icon: '†' },
    { key: 'dmgMitigated', label: 'Damage absorbed', icon: '▣' },
    { key: 'healingDone', label: 'Healing done', icon: '✚' },
  ] },
  { title: 'Board', rows: [
    { key: 'unitsPlayed', label: 'Units played', icon: '♙' },
    { key: 'foundationsPlaced', label: 'Foundations placed', icon: '⌂' },
    { key: 'tokensMade', label: 'Summoned / conjured', icon: '✧' },
  ] },
  { title: 'Cards & resources', rows: [
    { key: 'spellsCast', label: 'Spells cast', icon: '❋' },
    { key: 'environmentsPlayed', label: 'Environments placed', icon: '⬡' },
    { key: 'drew', label: 'Cards drawn', icon: '♠' },
    { key: 'banked', label: 'Energy banked', icon: '⌁' },
    { key: 'produced', label: 'Energy produced', icon: '↯' },
    { key: 'heroPowers', label: 'Leader skills used', icon: '✵' },
  ] },
  { title: 'Library', rows: [
    { key: 'milled', label: 'Cards milled (Forget)', icon: '⌫' },
    { key: 'nulls', label: 'NULLs drawn (decked out)', icon: '∅' },
    { key: 'sigUnlocked', label: 'Signature unlocked', icon: '★', bool: true },
  ] },
];

const ELEMENT_HEX: Record<Element, string> = { fire: '#e2563b', water: '#3b82e2', nature: '#3bb273', earth: '#c9943b' };

/** Per-status detail: the secondary metric shown when the status row is expanded. */
const STATUS_DETAILS: { status: StatusKey; icon: string; name: string; metric: keyof PlayerSummary; metricLabel: string }[] = [
  { status: 'burn', icon: '♨', name: 'Burn', metric: 'burnDmg', metricLabel: 'Damage it dealt' },
  { status: 'poison', icon: '☠', name: 'Poison', metric: 'poisonDmg', metricLabel: 'Damage it dealt' },
  { status: 'sleep', icon: '☾', name: 'Sleep', metric: 'sleepHealed', metricLabel: 'HP it healed (the sleeper)' },
  { status: 'freeze', icon: '❄', name: 'Freeze', metric: 'freezeBlocked', metricLabel: 'Damage it blocked (the frozen)' },
];

/** A status row that expands to reveal its secondary metric (damage dealt / healed / blocked). */
function StatusDrop({ d, stats }: { d: (typeof STATUS_DETAILS)[number]; stats: [PlayerSummary, PlayerSummary] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr className="summary__statusrow" onClick={() => setOpen((o) => !o)}>
        <td><span className="summary__caret">{open ? '▾' : '▸'}</span> {d.icon} {d.name} inflicted</td>
        {([0, 1] as PlayerId[]).map((p) => <td key={p}>{stats[p].statusInflicted[d.status]}</td>)}
      </tr>
      {open && (
        <tr className="summary__statusdetail">
          <td>↳ {d.metricLabel}</td>
          {([0, 1] as PlayerId[]).map((p) => <td key={p}>{stats[p][d.metric] as number}</td>)}
        </tr>
      )}
    </>
  );
}

/** A small line chart of both leaders' HP over the turns of the match. */
function HpGraph({ timeline, colors }: { timeline: [number, number][]; colors: [string, string] }) {
  const W = 340, H = 96, pad = 4;
  const n = timeline.length;
  const max = RULES.LEADER_HP;
  const x = (i: number) => pad + (i / Math.max(1, n - 1)) * (W - 2 * pad);
  const y = (hp: number) => pad + (1 - Math.max(0, hp) / max) * (H - 2 * pad);
  const line = (side: 0 | 1) => timeline.map((t, i) => `${x(i).toFixed(1)},${y(t[side]).toFixed(1)}`).join(' ');
  return (
    <svg className="summary__graph" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label="Leader HP over time">
      {[0, 0.5, 1].map((f) => <line key={f} x1={pad} x2={W - pad} y1={pad + f * (H - 2 * pad)} y2={pad + f * (H - 2 * pad)} stroke="rgba(255,255,255,0.08)" />)}
      <polyline points={line(0)} fill="none" stroke={colors[0]} strokeWidth="2" />
      <polyline points={line(1)} fill="none" stroke={colors[1]} strokeWidth="2" />
    </svg>
  );
}

function GameSummary({ g, onPlayAgain, playAgainLabel }: { g: ReturnType<typeof useGame>; onPlayAgain?: () => void; playAgainLabel?: string }) {
  const registry = useRegistry();
  const { selected } = useContent();
  const { game, log } = g;
  const winner = game.winner;
  const nameMap = useMemo(() => { const m = new Map<string, string>(); mergeNameMap(m, game); return m; }, [game]);
  const { turns, stats, timeline, cardStats } = useMemo(() => summarizeGame(log, nameMap), [log, nameMap]);
  const [cardTabOpen, setCardTabOpen] = useState(false);
  const leaderName = (p: PlayerId) => registry.leaders.get(game.players[p].leaderId)?.name ?? `Player ${p + 1}`;
  const leaderColor = (p: PlayerId): string => ELEMENT_HEX[registry.leaders.get(game.players[p].leaderId)?.element ?? 'fire'];
  const cell = (p: PlayerId, row: { key: keyof PlayerSummary; bool?: boolean }) => {
    const v = stats[p][row.key];
    if (row.bool) return v ? '✓' : '—';
    return typeof v === 'number' ? v : 0;
  };

  return (
    <Overlay>
      <div className="summary">
        <h2 className="summary__title">♛ {winner !== null ? leaderName(winner) : '—'} wins!</h2>
        <p className="muted summary__sub">Player {winner !== null ? winner + 1 : '?'} · {game.round} rounds · {turns} turns</p>
        <div className="summary__graphwrap">
          <div className="summary__graphhead muted">Leader HP over the match</div>
          <HpGraph timeline={timeline} colors={[leaderColor(0), leaderColor(1)]} />
          <div className="summary__legend">
            {([0, 1] as PlayerId[]).map((p) => (
              <span key={p}><span className="summary__swatch" style={{ background: leaderColor(p) }} /> {leaderName(p)}</span>
            ))}
          </div>
        </div>
        <table className="summary__table">
          <thead>
            <tr>
              <th></th>
              {([0, 1] as PlayerId[]).map((p) => (
                <th key={p} className={winner === p ? 'summary__win' : ''}>
                  <div>{winner === p ? '♛ ' : ''}{leaderName(p)}</div>
                  <div className="summary__deck muted">{selected[p] ?? `Player ${p + 1}`}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="summary__hprow">
              <td>❤ Final HP</td>
              {([0, 1] as PlayerId[]).map((p) => (
                <td key={p} className={winner === p ? 'summary__win' : ''}>{Math.max(0, game.players[p].leaderHp)}</td>
              ))}
            </tr>
            {SUMMARY_SECTIONS.map((sec) => (
              <Fragment key={sec.title}>
                <tr className="summary__sectionrow"><td colSpan={3}>{sec.title}</td></tr>
                {sec.rows.map((row) => (
                  <tr key={row.key}>
                    <td>{row.icon} {row.label}</td>
                    {([0, 1] as PlayerId[]).map((p) => <td key={p}>{cell(p, row)}</td>)}
                  </tr>
                ))}
              </Fragment>
            ))}
            <tr className="summary__sectionrow"><td colSpan={3}>Statuses (click to expand)</td></tr>
            {STATUS_DETAILS.map((d) => <StatusDrop key={d.status} d={d} stats={stats} />)}
            <tr className="summary__sectionrow summary__cardtoggle" onClick={() => setCardTabOpen((o) => !o)}>
              <td colSpan={3}><span className="summary__caret">{cardTabOpen ? '▾' : '▸'}</span> Per-card breakdown</td>
            </tr>
            {cardTabOpen && ([0, 1] as PlayerId[]).map((p) => {
              const rows = Object.entries(cardStats[p])
                .map(([cardId, s]) => ({ cardId, name: registry.cards.get(cardId)?.name ?? cardId, ...s }))
                .sort((a, b) => b.dmg - a.dmg || b.plays - a.plays || a.name.localeCompare(b.name));
              if (!rows.length) return null;
              return (
                <Fragment key={p}>
                  <tr className="summary__cardhead"><td colSpan={3}>{leaderName(p)} — {selected[p] ?? `Player ${p + 1}`}</td></tr>
                  <tr className="summary__cardcols"><td></td><td>Played</td><td>Atk Dmg</td></tr>
                  {rows.map((r) => (
                    <tr key={r.cardId} className="summary__cardrow">
                      <td>{r.name}</td>
                      <td>{r.plays}</td>
                      <td>{r.dmg > 0 ? r.dmg : '—'}</td>
                    </tr>
                  ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {onPlayAgain
          ? <button className="btn-end" onClick={onPlayAgain}>{playAgainLabel ?? 'Play again'}</button>
          : <p className="muted">Waiting for the host to start a rematch…</p>}
      </div>
    </Overlay>
  );
}

/** Icon + label for a status named in a `statusApplied` event. */
const STATUS_EVENT: Record<string, { icon: string; label: string; good?: boolean }> = {
  burn: { icon: '♨', label: 'Burn' },
  poison: { icon: '☠', label: 'Poison' },
  sleep: { icon: '☾', label: 'Sleep' },
  freeze: { icon: '❄', label: 'Freeze' },
  shield: { icon: '▣', label: 'Shield', good: true },
  trueShield: { icon: '◈', label: 'True Shield', good: true },
  taunt: { icon: '⚓', label: 'Taunt', good: true },
  zombified: { icon: '↺', label: 'Zombified', good: true },
};

/** Render one game event as a clear, human-readable log line. `name` resolves a unit instance
 *  id to its card name; `cardName` resolves a raw card id. Two leading spaces nest a detail. */
function fmt(
  e: GameEvent,
  name: (iid: string) => string = (iid) => iid,
  cardName: (cardId: string) => string = (id) => id,
): string {
  const P = (p: number): string => `Player ${p + 1}`;
  const L = (l: LaneId): string => LANE_LABEL[l];
  const I = '  '; // indent for nested detail lines
  switch (e.t) {
    case 'turnStart': return `▶ ${P(e.player)} — Round ${e.round}`;
    case 'draw': return `${P(e.player)} drew ${cardName(e.cardId)}`;
    case 'deckOut': return `${P(e.player)} decked out`;
    case 'drawNull': return `${P(e.player)} decked out — drew a Null (404)`;
    case 'foundationPlaced': return `${P(e.player)} placed foundation ${cardName(e.cardId)}`;
    case 'foundationBonded': return `${I}⌂ ${cardName(e.foundationCardId)} bonded to ${name(e.hostIid)}`;
    case 'foundationDestroyed': return `${I}⌂ Foundation under ${name(e.hostIid)} destroyed`;
    case 'playUnit': return `${P(e.player)} played ${cardName(e.cardId)} → ${L(e.lane)} (${e.position})`;
    case 'drowning': return `${I}⇊ ${cardName(e.cardId)} is drowning`;
    case 'attack': return `⚔ ${name(e.attacker)} attacks for ${e.amount}`;
    case 'retaliate': return `${I}↩ ${name(e.unit)} strikes back for ${e.amount}`;
    case 'damageUnit': return `${I}✸ ${name(e.iid)} takes ${e.amount} → ${Math.max(0, e.hpAfter)} HP`;
    case 'mitigated': return `${I}▣ ${e.amount} damage absorbed`;
    case 'damageLeader': return `${I}✸ ${P(e.player)}'s leader takes ${e.amount} → ${Math.max(0, e.hpAfter)} HP`;
    case 'blocked': return `${I}▣ ${name(e.iid)} blocks the hit (${e.source})`;
    case 'shieldBlock': return `${I}▣ ${name(e.iid)}'s Shield absorbs it (${e.remaining} left)`;
    case 'spike': return `${I}✳ Spike hits ${name(e.attacker)} for ${e.amount}`;
    case 'extraAction': return `${I}↯ ${name(e.iid)} takes a bonus action`;
    case 'costMod': return `${I}¤ ${P(e.player)}'s spells cost ${e.amount >= 0 ? '+' : ''}${e.amount}`;
    case 'lethal': return `${I}☠ Lethal — ${name(e.target)} destroyed`;
    case 'brittle': return `${I}✘ ${name(e.iid)} crumbles (Brittle)`;
    case 'intercept': return `${I}${e.kind === 'taunt' ? '⚓' : '⇧'} ${name(e.by)} intercepts the attack (${e.kind})`;
    case 'unitDestroyed': return `${I}✖ ${cardName(e.cardId)} destroyed`;
    case 'signatureUnlocked': return `★ ${P(e.player)}'s Signature unlocked!`;
    case 'signatureGranted': return `★ ${P(e.player)} drew Signature: ${cardName(e.cardId)}`;
    case 'bank': return `${P(e.player)} banked ${e.amount} ${e.element}`;
    case 'castSpell': return `✧ ${P(e.player)} cast ${cardName(e.cardId)}`;
    case 'heroPower': return `✧ ${P(e.player)} used their Leader Skill`;
    case 'playEnvironment': return `⬡ ${P(e.player)} placed ${cardName(e.cardId)} in ${L(e.lane)}`;
    case 'heal': return `${I}✚ ${e.iid ? name(e.iid) : e.player !== undefined ? `${P(e.player)}'s leader` : 'target'} heals ${e.amount}`;
    case 'buff': {
      const parts = [e.attack ? `${e.attack >= 0 ? '+' : ''}${e.attack} atk` : '', e.hp ? `${e.hp >= 0 ? '+' : ''}${e.hp} HP` : ''].filter(Boolean).join(', ');
      const up = e.attack >= 0 && e.hp >= 0;
      return `${I}${up ? '↑' : '▼'} ${name(e.iid)} ${parts || 'stats changed'}`;
    }
    case 'statusApplied': {
      const s = STATUS_EVENT[e.status] ?? { icon: '✧', label: e.status };
      return `${I}${s.icon} ${name(e.iid)} ${s.good ? 'gains' : 'is afflicted with'} ${s.label}`;
    }
    // Expiry has its own event now. It used to reuse `statusApplied`, which meant actually
    // GAINING True Shield also logged it as fading.
    case 'statusExpired': {
      const s = STATUS_EVENT[e.status] ?? { icon: '✧', label: e.status };
      return `${I}${s.icon} ${name(e.iid)}'s ${s.label} fades`;
    }
    case 'expel': return `${I}↩ ${cardName(e.cardId)} returned to its owner's hand`;
    case 'forget': return `${I}⌫ ${P(e.player)} forgets ${cardName(e.cardId)}`;
    case 'summon': return `${I}✧ ${P(e.player)} summoned ${cardName(e.cardId)}${e.lane ? ` in ${L(e.lane)}` : ''}`;
    case 'conjure': return `${I}♢ ${P(e.player)} conjured ${cardName(e.cardId)} to hand`;
    case 'moved': return `${I}⇄ ${name(e.iid)} moved to ${L(e.lane)}`;
    case 'burnTick': return `${I}♨ Burn — ${name(e.iid)} takes ${e.amount} → ${Math.max(0, e.hpAfter)} HP`;
    case 'growth': return `${I}↥ Growth — ${name(e.iid)} +${e.attack}/+${e.hp}`;
    case 'produce': return `⌁ ${P(e.player)} produced ${e.amount} ${e.element}`;
    case 'poisonTick': return `${I}☠ Poison — ${name(e.iid)} takes ${e.amount} → ${Math.max(0, e.hpAfter)} HP`;
    case 'drownTick': return `${I}⇊ Drowning — ${name(e.iid)} takes ${e.amount} → ${Math.max(0, e.hpAfter)} HP`;
    case 'zombieRevive': return `${I}↺ ${name(e.iid)} revives (Zombified)`;
    case 'transform': return `${I}⧖ ${name(e.iid)} transformed into ${cardName(e.into)}`;
    case 'sacrifice': return `${I}† ${name(e.iid)} sacrificed`;
    case 'wake': return `${I}${e.from === 'freeze' ? '❄' : '☾'} ${name(e.iid)} wakes (${e.from})`;
    case 'cleanse': return `${I}✧ ${name(e.iid)} cleansed of statuses`;
    case 'endTurn': return `${P(e.player)} ends turn`;
    case 'gameOver': return `♛ ${P(e.winner)} wins!`;
    case 'error': return `! ${e.message}`;
    default: return JSON.stringify(e);
  }
}
