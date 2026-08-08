/**
 * Combat visual effects — DOM-driven attack animations played during the combat phase.
 *
 * These run imperatively against the live board DOM (units carry `data-iid`, leaders carry
 * `data-leader`) using the Web Animations API, so they stay off React's render path and can
 * be awaited by the combat-phase orchestrator in `useGame`. Nothing here mutates game state;
 * it only moves pixels. The orchestrator shows the pre-strike board while the attacker leaps
 * (so its target is still on screen), then reveals the resolved board once the lunge lands.
 */

import { ELEMENT_SYMBOL } from '@ui/ElementRune';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** A single melee lunge (out and back). */
const MELEE_DURATION = 360;
/** Bullet travel + impact for a sniper shot. */
const SNIPER_DURATION = 340;
/** How far toward the target the attacker actually travels (0..1). */
const LUNGE_REACH = 0.62;

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Resolve when the animation finishes OR after `ms` — whichever comes first. The timeout
 * guard matters because the Web Animations clock pauses in a backgrounded tab while
 * `setTimeout` keeps firing; without it, the combat orchestrator (which awaits this) would
 * hang until the tab is refocused. `ms` is set above the animation's own duration, so a
 * visible tab always finishes first and the timeout never truncates the motion.
 */
const settle = (anim: Animation, ms: number): Promise<void> =>
  Promise.race([anim.finished.then(() => undefined).catch(() => undefined), wait(ms)]);

const prefersReduced = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const unitEl = (iid: string): HTMLElement | null =>
  document.querySelector<HTMLElement>(`[data-iid="${CSS.escape(iid)}"]`);
const leaderEl = (player: 0 | 1): HTMLElement | null =>
  document.querySelector<HTMLElement>(`[data-leader="${player}"]`);

interface Point { x: number; y: number }
const centerOf = (el: Element): Point => {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};

/** Describes one attacker's strike, derived from combat events by the caller. */
export interface AttackFx {
  attackerIid: string;
  /** iids of struck units/foundations (may be empty for a pure leader hit). */
  targetIids: string[];
  /** Set when the strike hit a leader; aim toward that leader when no unit was struck. */
  leaderTarget?: 0 | 1;
  /** Snipers fire a bullet line instead of leaping into the target. */
  sniper?: boolean;
  /** Lethal attackers wind up slowly then snap, emphasising the instant kill. */
  lethal?: boolean;
}

/**
 * Board-level impact shake, PROPORTIONAL to the weight of the hit (game-feel canon: a small
 * move gets a small reaction, a big moment a big one). `intensity` is 0..1. Shakes the whole
 * war-table (`.field`), composing over any per-unit lunge transforms beneath it.
 */
export function shakeBoard(intensity: number): void {
  if (prefersReduced() || intensity <= 0) return;
  const el = document.querySelector<HTMLElement>('.field');
  if (!el) return;
  const a = 2 + intensity * 8; // 2px chip → 10px lethal
  el.animate(
    [
      { transform: 'translate(0,0)' },
      { transform: `translate(${a}px, ${-a * 0.6}px)` },
      { transform: `translate(${-a * 0.85}px, ${a * 0.5}px)` },
      { transform: `translate(${a * 0.5}px, ${a * 0.35}px)` },
      { transform: `translate(${-a * 0.3}px, 0)` },
      { transform: 'translate(0,0)' },
    ],
    { duration: 170 + intensity * 170, easing: 'ease-out' },
  );
}

/** A short brightness + glow pulse on a unit that just got hit. */
const flashImpact = (el: HTMLElement): void => {
  el.animate(
    [
      { filter: 'brightness(1)', boxShadow: '0 0 0 0 rgba(255,120,80,0)' },
      { filter: 'brightness(1.85)', boxShadow: '0 0 18px 5px rgba(255,120,80,0.85)', offset: 0.3 },
      { filter: 'brightness(1)', boxShadow: '0 0 0 0 rgba(255,120,80,0)' },
    ],
    { duration: 340, easing: 'ease-out' },
  );
};

/** Resolve the on-screen elements (and centres) this strike should aim at. */
const targetPoints = (fx: AttackFx): { el: HTMLElement; c: Point }[] => {
  const els: HTMLElement[] = [];
  for (const iid of fx.targetIids) {
    const e = unitEl(iid);
    if (e) els.push(e);
  }
  // Always aim at the leader when the strike actually hit it — not just as a fallback.
  // This fixes branch-shot and splash where unit targets and a leader hit coexist.
  if (fx.leaderTarget !== undefined) {
    const e = leaderEl(fx.leaderTarget);
    if (e) els.push(e);
  }
  return els.map((el) => ({ el, c: centerOf(el) }));
};

/** Attacker leaps toward each target in turn (and back), flashing each on contact. */
async function playMelee(fx: AttackFx): Promise<void> {
  const el = unitEl(fx.attackerIid);
  if (!el) {
    await wait(MELEE_DURATION);
    return;
  }
  const start = centerOf(el);
  // Unit bodies are struck where they stand. A LEADER hit, though, becomes a straight jab up the
  // lane toward the enemy side — NOT a diagonal lunge at the leader portrait — so Branch/Splash
  // (which reach the leader through empty lanes) read as attacks down their lanes. The leader
  // banner still flashes on contact and takes its damage number; only the attacker's motion changes.
  const targets: { el: HTMLElement; c: Point }[] = [];
  for (const iid of fx.targetIids) { const e = unitEl(iid); if (e) targets.push({ el: e, c: centerOf(e) }); }
  if (fx.leaderTarget !== undefined) {
    const e = leaderEl(fx.leaderTarget);
    if (e) { const lc = centerOf(e); const dir = Math.sign(lc.y - start.y) || -1; targets.push({ el: e, c: { x: start.x, y: start.y + dir * 70 } }); }
  }
  // No rendered target (leader off-screen / already gone) — lunge forward toward the foe.
  const aims = targets.length > 0 ? targets.map((t) => t.c) : [{ x: start.x, y: start.y - 44 }];
  // Lethal winds up slowly then snaps — a longer, heavier strike that emphasises the kill.
  const dur = fx.lethal ? 560 : MELEE_DURATION;
  el.style.zIndex = '60';
  try {
    for (let i = 0; i < aims.length; i++) {
      const p = aims[i]!;
      const dx = (p.x - start.x) * LUNGE_REACH;
      const dy = (p.y - start.y) * LUNGE_REACH;
      const frames: Keyframe[] = fx.lethal
        ? [
            { transform: 'translate(0px,0px) scale(1)', easing: 'cubic-bezier(.6,0,.9,.2)' },
            { transform: `translate(${-dx * 0.18}px,${-dy * 0.18}px) scale(0.94)`, offset: 0.55, easing: 'cubic-bezier(.2,.9,.2,1)' }, // slow wind-up (pull back)
            { transform: `translate(${dx}px,${dy}px) scale(1.2)`, offset: 0.68 }, // snap into the target
            { transform: 'translate(0px,0px) scale(1)' },
          ]
        : [
            { transform: 'translate(0px,0px) scale(1)' },
            { transform: `translate(${dx}px,${dy}px) scale(1.1)`, offset: 0.45 },
            { transform: 'translate(0px,0px) scale(1)' },
          ];
      const anim = el.animate(frames, { duration: dur, easing: 'cubic-bezier(.3,.7,.4,1)' });
      const hit = targets[i];
      if (hit) setTimeout(() => flashImpact(hit.el), dur * (fx.lethal ? 0.66 : 0.4));
      await settle(anim, dur + 80);
    }
  } finally {
    el.style.zIndex = '';
  }
}

/** A full-viewport overlay SVG for drawing sniper tracers in client coordinates. */
const makeOverlay = (): SVGSVGElement => {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', String(window.innerWidth));
  svg.setAttribute('height', String(window.innerHeight));
  Object.assign(svg.style, {
    position: 'fixed',
    left: '0',
    top: '0',
    width: '100vw',
    height: '100vh',
    pointerEvents: 'none',
    zIndex: '70',
  } as Partial<CSSStyleDeclaration>);
  document.body.appendChild(svg);
  return svg;
};

/** Draw a tracer line and send a glowing bullet from `from` to `to`, then flash the target. */
const fireBullet = (svg: SVGSVGElement, from: Point, to: Point, onHit: () => void): Promise<void> => {
  const line = document.createElementNS(SVG_NS, 'line');
  line.setAttribute('x1', String(from.x));
  line.setAttribute('y1', String(from.y));
  line.setAttribute('x2', String(to.x));
  line.setAttribute('y2', String(to.y));
  line.setAttribute('stroke', '#ffe49a');
  line.setAttribute('stroke-width', '2');
  line.setAttribute('stroke-linecap', 'round');
  line.setAttribute('stroke-dasharray', '7 7');
  line.style.filter = 'drop-shadow(0 0 4px rgba(255,210,122,0.9))';
  svg.appendChild(line);

  const dot = document.createElementNS(SVG_NS, 'circle');
  dot.setAttribute('cx', String(from.x));
  dot.setAttribute('cy', String(from.y));
  dot.setAttribute('r', '4.5');
  dot.setAttribute('fill', '#fff');
  dot.style.filter = 'drop-shadow(0 0 6px rgba(255,210,122,1))';
  svg.appendChild(dot);

  line.animate([{ opacity: 0.95 }, { opacity: 0.95, offset: 0.6 }, { opacity: 0 }], {
    duration: SNIPER_DURATION,
    easing: 'ease-out',
  });
  const travel = dot.animate(
    [
      { transform: 'translate(0px,0px)', opacity: 1 },
      { transform: `translate(${to.x - from.x}px,${to.y - from.y}px)`, opacity: 1, offset: 0.78 },
      { transform: `translate(${to.x - from.x}px,${to.y - from.y}px)`, opacity: 0 },
    ],
    { duration: SNIPER_DURATION, easing: 'cubic-bezier(.2,.5,.3,1)' },
  );
  // Drive impact + resolution off setTimeout (not the WAAPI clock, which pauses when
  // backgrounded) so the bullet always "lands" and the orchestrator never stalls.
  setTimeout(onHit, SNIPER_DURATION * 0.78);
  return settle(travel, SNIPER_DURATION + 60);
};

/** Sniper: a bullet line from the shooter to each target (no leap). */
async function playSniper(fx: AttackFx): Promise<void> {
  const el = unitEl(fx.attackerIid);
  const targets = targetPoints(fx);
  if (!el || targets.length === 0) {
    await wait(SNIPER_DURATION);
    return;
  }
  const start = centerOf(el);
  const svg = makeOverlay();
  try {
    await Promise.all(targets.map((t) => fireBullet(svg, start, t.c, () => flashImpact(t.el))));
  } finally {
    svg.remove();
  }
}

// --- Ability / status activation flourishes -------------------------------------------
//
// One-shot, fire-and-forget animations played on a unit when an ability or status fires
// (driven by the combat / end-of-turn events). Stat-number glows are handled separately by
// the StatNum component in the React tree; these add the card-level flair (sparks, grow-pop,
// coloured glow) the events deserve.

/** A coloured glow + brightness pulse on a unit card. */
const glow = (el: HTMLElement, color: string, ms = 560): void => {
  el.animate(
    [
      { boxShadow: '0 0 0 0 transparent', filter: 'brightness(1)' },
      { boxShadow: `0 0 16px 5px ${color}`, filter: 'brightness(1.4)', offset: 0.4 },
      { boxShadow: '0 0 0 0 transparent', filter: 'brightness(1)' },
    ],
    { duration: ms, easing: 'ease-out' },
  );
};

/** Spawn a small burst of particles over a unit (sparks, motes…), flying `dir` (−1 up). */
const spawnParticles = (el: HTMLElement, colors: string[], count: number, dir = -1): void => {
  for (let i = 0; i < count; i++) {
    const p = document.createElement('span');
    p.className = 'fx-particle';
    p.style.background = colors[i % colors.length]!;
    el.appendChild(p);
    const spread = (Math.random() - 0.5) * 30;
    const dist = 16 + Math.random() * 24;
    const a = p.animate(
      [
        { transform: 'translate(-50%,-50%) translate(0,0) scale(1)', opacity: 1 },
        { transform: `translate(-50%,-50%) translate(${spread}px, ${dir * dist}px) scale(0.3)`, opacity: 0 },
      ],
      { duration: 420 + Math.random() * 240, easing: 'ease-out' },
    );
    const cleanup = (): void => p.remove();
    a.finished.then(cleanup).catch(cleanup);
    setTimeout(cleanup, 800); // belt-and-braces if the WAAPI clock is paused
  }
};

/** A glyph that pops above a unit (▣, ⚓, ✸, ⧖…), then scales down and fades. */
const popGlyph = (el: HTMLElement, glyph: string, color?: string): void => {
  const g = document.createElement('span');
  g.className = 'fx-glyph';
  g.textContent = glyph;
  if (color) g.style.color = color;
  el.appendChild(g);
  const a = g.animate(
    [
      { transform: 'translate(-50%,-50%) scale(0.5)', opacity: 0 },
      { transform: 'translate(-50%,-50%) scale(1.35)', opacity: 1, offset: 0.4 },
      { transform: 'translate(-50%,-50%) scale(1.1)', opacity: 0 },
    ],
    { duration: 720, easing: 'ease-out' },
  );
  const done = (): void => g.remove();
  a.finished.then(done).catch(done);
  setTimeout(done, 900);
};

/**
 * A floating combat number that rises off a unit or leader and fades — the running feedback of
 * how much a hit/heal/tick actually did (Hearthstone's damage splats, in this game's gilt-woodcut
 * key). Appended to <body> at fixed coords so it never clips against the unit/lane overflow.
 */
type FloatVariant = 'dmg' | 'dmg-leader' | 'heal' | 'burn' | 'poison';
function floatNumber(el: HTMLElement, text: string, variant: FloatVariant, stagger = 0, stack = 0): void {
  const r = el.getBoundingClientRect();
  const x = r.left + r.width / 2;
  // Numbers landing on the SAME target (a Branch/Splash pair on one leader, a Double Strike) start
  // progressively higher and lean alternately left/right so each hit reads as its own beat rather
  // than merging into one lump.
  const y = r.top + r.height * 0.34 - stack * 18;
  const span = document.createElement('span');
  span.className = `fx-dmgnum fx-dmgnum--${variant}`;
  span.textContent = text;
  Object.assign(span.style, {
    position: 'fixed', left: `${x}px`, top: `${y}px`, zIndex: '88', pointerEvents: 'none',
  } as Partial<CSSStyleDeclaration>);
  document.body.appendChild(span);
  const dx = (stack % 2 === 0 ? 1 : -1) * (10 + stack * 4) + (Math.random() - 0.5) * 10;
  const a = span.animate(
    [
      { transform: 'translate(-50%,-50%) scale(0.5)', opacity: 0 },
      { transform: `translate(calc(-50% + ${dx}px),-150%) scale(1.15)`, opacity: 1, offset: 0.3 },
      { transform: `translate(calc(-50% + ${dx * 1.5}px),-270%) scale(1)`, opacity: 0 },
    ],
    { duration: 900, delay: stagger, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'backwards' },
  );
  const done = (): void => span.remove();
  a.finished.then(done).catch(done);
  setTimeout(done, 1000 + stagger);
}

/** An expanding ring pulse over a unit (used for Shield / Immunity blocks). */
const ring = (el: HTMLElement, color: string): void => {
  const r = document.createElement('span');
  r.className = 'fx-ring';
  r.style.borderColor = color;
  el.appendChild(r);
  const a = r.animate(
    [
      { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0.9 },
      { transform: 'translate(-50%,-50%) scale(1.7)', opacity: 0 },
    ],
    { duration: 520, easing: 'ease-out' },
  );
  const done = (): void => r.remove();
  a.finished.then(done).catch(done);
  setTimeout(done, 700);
};

export type FlourishKind =
  | 'burn' | 'grow' | 'buff' | 'heal' | 'poison'
  | 'polish' | 'shield' | 'immunity' | 'taunt' | 'zombie' | 'smelt';

/** Play a single ability/status activation flourish on one unit. */
export function playUnitFlourish(iid: string, kind: FlourishKind): void {
  if (prefersReduced()) return;
  const el = unitEl(iid);
  if (!el) return;
  switch (kind) {
    case 'burn':
      glow(el, 'rgba(255,140,40,0.9)');
      spawnParticles(el, ['#ffae42', '#ff5e3a', '#ffd27a'], 8);
      break;
    case 'grow':
      el.animate(
        [{ transform: 'scale(1)' }, { transform: 'scale(1.22)', offset: 0.4 }, { transform: 'scale(1)' }],
        { duration: 540, easing: 'ease-in-out' },
      );
      glow(el, 'rgba(90,230,140,0.9)', 600);
      spawnParticles(el, ['#7ad6a0', '#bfffd8'], 6);
      break;
    case 'buff': // bloodlust / stat buff — red-gold surge
      glow(el, 'rgba(255,80,60,0.95)', 620);
      spawnParticles(el, ['#ff7a5e', '#ffd27a'], 6);
      break;
    case 'heal':
      glow(el, 'rgba(90,230,140,0.9)');
      spawnParticles(el, ['#7ad6a0', '#bfffd8'], 5);
      break;
    case 'poison':
      glow(el, 'rgba(130,200,60,0.85)');
      spawnParticles(el, ['#9bd64a', '#5a8f2a'], 6, -1);
      break;
    case 'polish': // shrugs off a hit and triggers — cyan shimmer
      glow(el, 'rgba(120,220,255,0.9)');
      spawnParticles(el, ['#bfe9ff', '#7fd0ff', '#ffffff'], 6);
      break;
    case 'shield': // Shield / True Shield absorbs a hit
      ring(el, 'rgba(120,180,255,0.95)');
      popGlyph(el, '▣');
      break;
    case 'immunity': // shrugs off an ability/effect
      ring(el, 'rgba(255,255,255,0.95)');
      popGlyph(el, '⊘', '#ffffff');
      break;
    case 'taunt': // pulls an attack onto itself
      glow(el, 'rgba(220,120,255,0.85)');
      popGlyph(el, '⚓', '#e59bff');
      break;
    case 'zombie': // rises from death at 1 HP
      el.animate([{ transform: 'translateY(8px)', opacity: 0.3 }, { transform: 'translateY(0)', opacity: 1 }], { duration: 620, easing: 'ease-out' });
      glow(el, 'rgba(120,220,120,0.9)', 650);
      popGlyph(el, '↺', '#9be89b');
      break;
    case 'smelt': // forges an effect at the cost of HP
      glow(el, 'rgba(255,160,60,0.9)');
      spawnParticles(el, ['#ffae42', '#ffd27a'], 6);
      popGlyph(el, '⚒', '#ffd27a');
      break;
  }
}

/**
 * Kamikaze detonation. Captures the unit's position now (it is about to be removed from the
 * board) and spawns the blast into a detached body overlay, so the explosion keeps playing
 * after the dying unit's element is gone.
 */
export function playKamikazeFx(iid: string): void {
  if (prefersReduced()) return;
  const el = unitEl(iid);
  if (!el) return;
  const { x, y } = centerOf(el);
  const layer = document.createElement('div');
  Object.assign(layer.style, {
    position: 'fixed', left: `${x}px`, top: `${y}px`, width: '0', height: '0', zIndex: '85', pointerEvents: 'none',
  } as Partial<CSSStyleDeclaration>);
  document.body.appendChild(layer);
  const g = document.createElement('span');
  g.className = 'fx-glyph';
  g.textContent = '✸';
  g.style.color = '#ff7a3a';
  layer.appendChild(g);
  g.animate(
    [
      { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0 },
      { transform: 'translate(-50%,-50%) scale(1.7)', opacity: 1, offset: 0.4 },
      { transform: 'translate(-50%,-50%) scale(1.2)', opacity: 0 },
    ],
    { duration: 620, easing: 'ease-out' },
  );
  for (let i = 0; i < 16; i++) {
    const p = document.createElement('span');
    p.className = 'fx-particle';
    p.style.background = ['#ff5e3a', '#ffae42', '#fff2a8'][i % 3]!;
    layer.appendChild(p);
    const ang = Math.random() * Math.PI * 2;
    const dist = 22 + Math.random() * 42;
    p.animate(
      [
        { transform: 'translate(-50%,-50%) translate(0,0) scale(1)', opacity: 1 },
        { transform: `translate(-50%,-50%) translate(${Math.cos(ang) * dist}px,${Math.sin(ang) * dist}px) scale(0.3)`, opacity: 0 },
      ],
      { duration: 500 + Math.random() * 320, easing: 'ease-out' },
    );
  }
  setTimeout(() => layer.remove(), 1050);
}

/**
 * Death crumble. A dying unit is about to be removed from the board (setGame follows this
 * call), so we clone its card into a detached overlay at the same spot and let the copy
 * desaturate, tip over and fall away — the board reads WHY a unit vanished. Kamikaze has its
 * own detonation (`playKamikazeFx`); this is the default death.
 */
export function playDeathFx(iid: string): void {
  if (prefersReduced()) return;
  const el = unitEl(iid);
  if (!el) return;
  const r = el.getBoundingClientRect();
  const clone = el.cloneNode(true) as HTMLElement;
  clone.removeAttribute('data-iid'); // never let the corpse clone answer unit selectors
  Object.assign(clone.style, {
    position: 'fixed', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`,
    margin: '0', zIndex: '55', pointerEvents: 'none', animation: 'none', // don't re-run the unit-enter pop on the corpse
  } as Partial<CSSStyleDeclaration>);
  document.body.appendChild(clone);
  const a = clone.animate(
    [
      { transform: 'translateY(0) rotate(0deg) scale(1)', opacity: 1, filter: 'brightness(1) grayscale(0)' },
      { transform: 'translateY(4px) rotate(-4deg) scale(0.98)', opacity: 1, filter: 'brightness(0.55) grayscale(0.7)', offset: 0.3 },
      { transform: 'translateY(30px) rotate(10deg) scale(0.88)', opacity: 0, filter: 'brightness(0.15) grayscale(1)' },
    ],
    { duration: 480, easing: 'cubic-bezier(.4,.1,.7,1)' },
  );
  const done = (): void => clone.remove();
  a.finished.then(done).catch(done);
  setTimeout(done, 720);
  // a little ashen dust kicked up from the collapse
  const { x, y } = centerOf(el);
  const layer = document.createElement('div');
  Object.assign(layer.style, { position: 'fixed', left: `${x}px`, top: `${y}px`, width: '0', height: '0', zIndex: '56', pointerEvents: 'none' } as Partial<CSSStyleDeclaration>);
  document.body.appendChild(layer);
  for (let i = 0; i < 7; i++) {
    const p = document.createElement('span');
    p.className = 'fx-particle';
    p.style.background = ['#6b6258', '#8a8073', '#4a443c'][i % 3]!;
    layer.appendChild(p);
    const ang = Math.PI + (Math.random() - 0.5) * Math.PI; // downward-ish spray
    const dist = 12 + Math.random() * 22;
    p.animate(
      [
        { transform: 'translate(-50%,-50%) translate(0,0) scale(1)', opacity: 0.9 },
        { transform: `translate(-50%,-50%) translate(${Math.cos(ang) * dist}px,${Math.abs(Math.sin(ang)) * dist}px) scale(0.3)`, opacity: 0 },
      ],
      { duration: 460 + Math.random() * 260, easing: 'ease-out' },
    );
  }
  setTimeout(() => layer.remove(), 820);
}

/**
 * Card-play travel: a card flies from its spot in the hand onto the lane it was played into,
 * so a play reads as a physical placement. `from` is the hand card's rect (captured before the
 * state swap removed it); `laneEl` is the destination lane column.
 */
export function playPlayFx(from: DOMRect, laneEl: HTMLElement, label: string, variant: string): void {
  if (prefersReduced()) return;
  const to = laneEl.getBoundingClientRect();
  const t = makeToken(label, from, variant);
  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);
  const a = t.animate(
    [
      { transform: 'translate(0,0) scale(1) rotate(-2deg)', opacity: 0.95 },
      { transform: `translate(${dx * 0.5}px,${dy * 0.5}px) scale(0.92) rotate(2deg)`, opacity: 1, offset: 0.6 },
      { transform: `translate(${dx}px,${dy}px) scale(0.66) rotate(0deg)`, opacity: 0 },
    ],
    { duration: 360, easing: 'cubic-bezier(.3,.6,.3,1)' },
  );
  const done = (): void => t.remove();
  a.finished.then(done).catch(done);
  setTimeout(done, 560);
}

/**
 * Opponent play reveal — a face-down card lifts from the opponent's hand, FLIPS to reveal its
 * face, then either travels to the lane it was placed in (units/foundations/environments) or
 * holds centre-stage for a beat before fading (spells, which leave no board body). Driven from
 * public play events, so it works in Adventure and multiplayer alike without any hidden info.
 * Purely presentational; a no-op under reduced motion.
 */
export interface RevealCard {
  name: string;
  element: string;
  typeLabel: string;
  energy: number;
  /** Element-cost runes already resolved to glyphs, e.g. "△△". */
  pips: string;
  body?: { atk: number; hp: number };
}

const REVEAL_W = 118;
const REVEAL_H = 152;

export function playRevealFx(card: RevealCard, from: DOMRect, to: DOMRect | null): void {
  if (prefersReduced()) return;
  const esc = (s: string): string => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] ?? c));
  const wrap = document.createElement('div');
  wrap.className = 'fx-reveal';
  const bodyHtml = card.body
    ? `<span class="card__stats"><span class="card__atk">${card.body.atk}</span><span class="card__hp">${card.body.hp}</span></span>`
    : '';
  wrap.innerHTML =
    `<div class="fx-reveal__inner">` +
      `<div class="fx-reveal__back handback"><div class="handback__frame"><span class="handback__crest">✦</span></div></div>` +
      `<div class="fx-reveal__face handcard chip--${card.element}"><span class="card__frame">` +
        `<span class="card__top"><span class="card__cost">${card.energy}</span>` +
          `<span class="card__pips">${esc(card.pips)}</span></span>` +
        `<span class="card__art"><span class="card__sigil erune">${ELEMENT_SYMBOL[card.element as keyof typeof ELEMENT_SYMBOL] ?? ''}</span></span>` +
        `<span class="card__name">${esc(card.name)}</span>` +
        `<span class="card__type">${esc(card.typeLabel)}</span>` +
        bodyHtml +
      `</span></div>` +
    `</div>`;
  Object.assign(wrap.style, {
    position: 'fixed', left: '0', top: '0', width: `${REVEAL_W}px`, height: `${REVEAL_H}px`,
    zIndex: '85', pointerEvents: 'none',
  } as Partial<CSSStyleDeclaration>);
  document.body.appendChild(wrap);

  const at = (cx: number, cy: number): string => `translate(${cx - REVEAL_W / 2}px, ${cy - REVEAL_H / 2}px)`;
  const startX = from.left + from.width / 2, startY = from.top + from.height / 2;
  const stageX = window.innerWidth / 2, stageY = window.innerHeight * 0.44;
  const inner = wrap.firstElementChild as HTMLElement;

  if (to) {
    const toX = to.left + to.width / 2, toY = to.top + to.height / 2;
    const outer = wrap.animate([
      { transform: `${at(startX, startY)} scale(0.5)`, opacity: 0.9 },
      { transform: `${at(stageX, stageY)} scale(1.02)`, opacity: 1, offset: 0.34 },
      { transform: `${at(stageX, stageY)} scale(1.02)`, opacity: 1, offset: 0.6 },
      { transform: `${at(toX, toY)} scale(0.5)`, opacity: 0 },
    ], { duration: 1050, easing: 'cubic-bezier(.3,.6,.3,1)' });
    inner.animate([
      { transform: 'rotateY(180deg)' }, { transform: 'rotateY(0deg)', offset: 0.34 }, { transform: 'rotateY(0deg)' },
    ], { duration: 1050, easing: 'ease-out' });
    const done = (): void => wrap.remove();
    outer.finished.then(done).catch(done);
    setTimeout(done, 1300);
  } else {
    const outer = wrap.animate([
      { transform: `${at(startX, startY)} scale(0.5)`, opacity: 0.9 },
      { transform: `${at(stageX, stageY)} scale(1.06)`, opacity: 1, offset: 0.28 },
      { transform: `${at(stageX, stageY)} scale(1.06)`, opacity: 1, offset: 0.78 },
      { transform: `${at(stageX, stageY - 30)} scale(0.94)`, opacity: 0 },
    ], { duration: 1350, easing: 'cubic-bezier(.3,.6,.3,1)' });
    inner.animate([
      { transform: 'rotateY(180deg)' }, { transform: 'rotateY(0deg)', offset: 0.28 }, { transform: 'rotateY(0deg)' },
    ], { duration: 1350, easing: 'ease-out' });
    const done = (): void => wrap.remove();
    outer.finished.then(done).catch(done);
    setTimeout(done, 1600);
  }
}

/** Metamorphosis: fade the unit to black (before reveal of its new form). */
export function metaFadeOut(iid: string): void {
  if (prefersReduced()) return;
  const el = unitEl(iid);
  if (!el) return;
  el.animate([{ filter: 'brightness(1)', opacity: 1 }, { filter: 'brightness(0)', opacity: 0.12 }], { duration: 300, easing: 'ease-in', fill: 'forwards' });
}
/** Metamorphosis: fade the new card form back in (after reveal), with a butterfly pop. */
export function metaFadeIn(iid: string): void {
  if (prefersReduced()) return;
  const el = unitEl(iid);
  if (!el) return;
  popGlyph(el, '⧖', '#c9a0ff');
  el.animate(
    [{ filter: 'brightness(0)', opacity: 0.12 }, { filter: 'brightness(1.7)', opacity: 1, offset: 0.6 }, { filter: 'brightness(1)', opacity: 1 }],
    { duration: 540, easing: 'ease-out' },
  );
}

/** A floating card-shaped token used for cards leaving play (Expel, Forget). */
const makeToken = (label: string, from: DOMRect, variant: string): HTMLElement => {
  const t = document.createElement('div');
  t.className = `fx-card-token fx-card-token--${variant}`;
  t.textContent = label;
  Object.assign(t.style, {
    position: 'fixed',
    left: `${from.left}px`,
    top: `${from.top}px`,
    width: `${Math.max(from.width, 54)}px`,
    height: `${Math.max(from.height, 70)}px`,
    zIndex: '80',
  } as Partial<CSSStyleDeclaration>);
  document.body.appendChild(t);
  return t;
};

/** Expel: the unit's card lifts off the board and flies back toward its owner's hand. */
export function playExpelFx(iid: string, label: string, ownerSide: 'top' | 'bottom'): void {
  if (prefersReduced()) return;
  const el = unitEl(iid);
  if (!el) return;
  const r = el.getBoundingClientRect();
  const t = makeToken(label, r, 'expel');
  const toY = ownerSide === 'bottom' ? window.innerHeight + 60 : -160;
  const dy = toY - r.top;
  const a = t.animate(
    [
      { transform: 'translate(0,0) scale(1) rotate(0deg)', opacity: 1 },
      { transform: `translate(0,${dy * 0.55}px) scale(0.75) rotate(-8deg)`, opacity: 0.95, offset: 0.6 },
      { transform: `translate(0,${dy}px) scale(0.4) rotate(-16deg)`, opacity: 0 },
    ],
    { duration: 600, easing: 'ease-in' },
  );
  const done = (): void => t.remove();
  a.finished.then(done).catch(done);
  setTimeout(done, 950);
}

/** Forget: a card lifts off the deck pile, drifts to the centre and fades away. */
export function playForgetFx(player: 0 | 1, label: string): void {
  if (prefersReduced()) return;
  const pile = document.querySelector<HTMLElement>(`[data-deck="${player}"]`);
  const from = pile
    ? pile.getBoundingClientRect()
    : ({ left: window.innerWidth / 2 - 30, top: player === 0 ? 70 : window.innerHeight - 170, width: 60, height: 80 } as DOMRect);
  const t = makeToken(label, from, 'forget');
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;
  const dx = cx - (from.left + from.width / 2);
  const dy = cy - (from.top + from.height / 2);
  const a = t.animate(
    [
      { transform: 'translate(0,0) scale(0.85)', opacity: 0.25 },
      { transform: `translate(${dx * 0.7}px,${dy * 0.7}px) scale(1.1)`, opacity: 1, offset: 0.5 },
      { transform: `translate(${dx}px,${dy}px) scale(1.25)`, opacity: 0 },
    ],
    { duration: 950, easing: 'ease-out' },
  );
  const done = (): void => t.remove();
  a.finished.then(done).catch(done);
  setTimeout(done, 1300);
}

/** Look up the keywords of a unit referenced by an event (for keyword-gated flourishes). */
export interface FlourishOpts {
  keywordsOf?: (iid: string) => { polish?: unknown; smelt?: unknown } | undefined;
  /** End-of-turn context: enables Smelt detection (self-damage at turn end). */
  eot?: boolean;
}

/** Scan a batch of events and play one post-reveal flourish per (unit, kind). Fire-and-forget. */
export function playEventFlourishes(
  events: { t: string; iid?: string; by?: string; source?: string; attack?: number; hp?: number; amount?: number; player?: 0 | 1 }[],
  opts: FlourishOpts = {},
): void {
  if (prefersReduced()) return;
  // Floating combat numbers — every hit/heal/tick shows what it did. A dying unit is already gone
  // from the DOM by now (its crumble tells that story), so a missing element just skips the number.
  let numIndex = 0;
  const perTarget = new Map<string, number>(); // how many numbers already stacked on each target
  const emit = (el: HTMLElement, text: string, variant: FloatVariant, key: string): void => {
    const stack = perTarget.get(key) ?? 0;
    perTarget.set(key, stack + 1);
    // Global left→right cadence, PLUS extra spacing for repeat hits on the same target so a
    // Branch/Splash pair pops as "−3 … −3", not a simultaneous "−6".
    const stagger = Math.min(numIndex++, 8) * 85 + stack * 150;
    floatNumber(el, text, variant, stagger, stack);
  };
  for (const e of events) {
    const amt = e.amount ?? 0;
    if (amt <= 0 && e.t !== 'heal') continue;
    if (e.t === 'damageUnit') { const el = e.iid ? unitEl(e.iid) : null; if (el) emit(el, `−${amt}`, 'dmg', `u:${e.iid}`); }
    else if (e.t === 'burnTick') { const el = e.iid ? unitEl(e.iid) : null; if (el) emit(el, `−${amt}`, 'burn', `u:${e.iid}`); }
    else if (e.t === 'poisonTick') { const el = e.iid ? unitEl(e.iid) : null; if (el) emit(el, `−${amt}`, 'poison', `u:${e.iid}`); }
    else if (e.t === 'damageLeader') { const el = e.player != null ? leaderEl(e.player) : null; if (el) emit(el, `−${amt}`, 'dmg-leader', `l:${e.player}`); }
    else if (e.t === 'heal' && amt > 0) { const el = e.iid ? unitEl(e.iid) : e.player != null ? leaderEl(e.player) : null; if (el) emit(el, `+${amt}`, 'heal', e.iid ? `u:${e.iid}` : `l:${e.player}`); }
  }
  // Proportional board shake: the biggest hit in this batch decides the jolt (lethal kill >
  // a heavy leader blow > a solid unit hit; small chip damage doesn't shake at all).
  let impact = 0;
  for (const e of events) {
    if (e.t === 'lethal') impact = Math.max(impact, 1);
    else if (e.t === 'damageLeader') impact = Math.max(impact, Math.min(0.9, 0.4 + (e.amount ?? 0) * 0.06));
    else if (e.t === 'damageUnit' && (e.amount ?? 0) >= 4) impact = Math.max(impact, Math.min(0.45, (e.amount ?? 0) * 0.05));
  }
  if (impact > 0) shakeBoard(impact);
  const done = new Set<string>();
  // Stagger simultaneous flourishes so a wave of effects (multi-target spell, mass burn/growth)
  // reads as a followable cascade rather than one indistinct flash. Capped so big waves don't drag.
  let staggerIndex = 0;
  const trigger = (iid: string | undefined, kind: FlourishKind): void => {
    if (!iid) return;
    const key = `${iid}:${kind}`;
    if (done.has(key)) return;
    done.add(key);
    const delay = Math.min(staggerIndex, 8) * 85;
    staggerIndex += 1;
    if (delay === 0) playUnitFlourish(iid, kind);
    else setTimeout(() => playUnitFlourish(iid, kind), delay);
  };
  for (const e of events) {
    switch (e.t) {
      case 'burnTick': trigger(e.iid, 'burn'); break;
      case 'growth': trigger(e.iid, 'grow'); break;
      case 'buff': if ((e.attack ?? 0) > 0 || (e.hp ?? 0) > 0) trigger(e.iid, 'buff'); break;
      case 'heal': trigger(e.iid, 'heal'); break;
      case 'poisonTick': trigger(e.iid, 'poison'); break;
      case 'zombieRevive': trigger(e.iid, 'zombie'); break;
      case 'shieldBlock': trigger(e.iid, 'shield'); break;
      case 'blocked':
        trigger(e.iid, e.source === 'immunity' ? 'immunity' : 'shield');
        break;
      case 'intercept':
        // Taunt pulls an attack onto itself; airborne intercepts read as a normal block.
        if ((e as { kind?: string }).kind === 'taunt') trigger(e.by, 'taunt');
        break;
      case 'damageUnit': {
        const kw = opts.keywordsOf?.(e.iid!);
        if (kw?.polish) trigger(e.iid, 'polish');
        if (opts.eot && kw?.smelt) trigger(e.iid, 'smelt');
        break;
      }
    }
  }
}

/** Play the attack animation for one attacker and resolve when it has landed. */
export async function playAttackFx(fx: AttackFx): Promise<void> {
  if (prefersReduced()) return; // respect reduced-motion: orchestrator still reveals the result
  if (fx.sniper) {
    await playSniper(fx);
    return;
  }
  await playMelee(fx);
}
