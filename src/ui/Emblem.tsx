import { type CardElement } from '@engine/constants';
import { ELEMENT_NAME } from '@cards/abilities';

/**
 * Procedural woodcut EMBLEMS — the card art window, drawn as element-tinted line-art keyed by
 * the card's element + keywords + type. Zero image assets: every glyph is a short SVG path so
 * authored AND custom (CardStudio) cards get distinct art for free. Replaces the single
 * element-rune placeholder that used to fill `.card__art`. See ElementRune for the small
 * inline element sigil (still used for pips/gems); this is the big central illustration.
 */

/** Short woodcut path vocabulary, viewBox 0 0 100 92, stroked (no fill). */
const GLYPHS: Record<string, string> = {
  // heavy / taunt bodies
  brute: 'M20,74 L28,40 L36,30 L50,24 L64,30 L72,40 L80,74 M40,44 L46,52 M60,44 L54,52 M44,64 L56,64 M50,24 L50,14',
  golem: 'M28,76 L28,40 L40,28 L60,28 L72,40 L72,76 M40,44 L48,44 M52,44 L60,44 M40,58 L60,58 M50,28 L50,18',
  // strikers
  fist: 'M30,64 L30,44 Q30,34 40,34 L40,50 M40,32 Q40,24 48,24 L48,50 M48,26 Q48,20 56,22 L56,50 M56,30 Q64,30 64,42 L64,60 Q64,74 48,76 Q32,76 30,64 Z',
  blade: 'M40,80 L44,64 L58,18 Q62,10 66,16 L56,64 L60,80 M44,64 L60,64 M50,74 L54,74',
  fang: 'M24,26 Q50,20 76,26 L64,40 Q50,34 36,40 Z M40,42 L36,66 M50,44 L50,72 M60,42 L64,66',
  // fliers
  moth: 'M50,20 L50,72 M50,30 Q22,18 16,44 Q22,64 50,48 M50,30 Q78,18 84,44 Q78,64 50,48 M50,20 L44,10 M50,20 L56,10',
  wing: 'M22,58 Q36,30 52,30 Q42,42 40,54 Q56,34 74,36 Q60,48 56,62 M22,58 Q40,64 56,62',
  // aquatics
  serpent: 'M18,30 Q40,30 40,46 Q40,62 60,62 Q82,62 82,44 M76,40 Q80,44 84,42 M20,28 Q16,32 20,36',
  fin: 'M20,70 Q50,66 80,70 M30,68 Q34,40 50,30 Q66,40 70,68 M50,30 L50,68 M40,54 L60,54',
  // nature / heal
  leaf: 'M50,78 L50,34 M50,34 Q30,34 26,54 Q46,52 50,40 M50,42 Q70,40 74,58 Q54,58 50,46 M50,34 Q50,20 62,14',
  chalice: 'M32,26 L68,26 Q68,48 50,52 Q32,48 32,26 M50,52 L50,68 M38,72 L62,72 M40,26 Q50,36 60,26',
  // watchers / snipers
  eye: 'M18,46 Q50,22 82,46 Q50,70 18,46 Z M50,36 A10,10 0 1,0 50,56 A10,10 0 1,0 50,36 M50,44 L50,48',
  bow: 'M34,18 Q64,46 34,74 M34,18 L34,74 M34,46 L74,46 M66,40 L76,46 L66,52',
  // earth / foundation
  menhir: 'M34,78 L30,30 Q30,20 50,18 Q70,20 70,30 L66,78 M40,40 L60,40 M40,54 L60,54',
  // spell / environment
  rune: 'M50,14 L50,78 M28,32 L72,32 M28,60 L72,60 M50,46 L30,46 M50,46 L70,46 M50,14 L36,26 M50,14 L64,26',
  sigil: 'M50,16 L78,40 L66,76 L34,76 L22,40 Z M50,16 L50,76 M22,40 L78,40 M34,76 L66,76',
};

type CardLike = {
  element: CardElement;
  type: string;
  name?: string;
  keywords?: Record<string, unknown>;
  attack?: number;
  hp?: number;
};

/** Stable per-name hash so a card always draws the same glyph within its category. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function pick(keys: string[] | undefined, seed: string): string {
  // Defensive: a missing or empty list must degrade to the neutral sigil, never throw. This
  // component renders every card in hand, so any gap here black-screens the whole game.
  if (!keys || keys.length === 0) return 'sigil';
  return keys[hash(seed) % keys.length] ?? keys[0]!;
}

/**
 * Fallback glyphs per element. Keyed on CardElement (NOT Element): a card may be `neutral`,
 * which has no elemental identity and is not a bankable element. Missing that distinction is
 * what made every neutral unit crash the board — `Record<Element, …>` type-checked fine
 * because the crash only happened for a value the type claimed could not exist.
 */
const ELEM_BEAST: Record<CardElement, string[]> = {
  fire: ['fang', 'blade', 'fist'],
  water: ['serpent', 'fin'],
  nature: ['leaf', 'chalice'],
  earth: ['golem', 'menhir'],
  neutral: ['blade', 'fist', 'menhir'],
};

/** Choose the woodcut glyph from a card's traits — keyword-first, then element flavour. */
export function glyphFor(card: CardLike): string {
  const k = (card.keywords ?? {}) as Record<string, unknown>;
  const seed = card.name ?? card.type;
  if (card.type === 'foundation') return 'menhir';
  if (card.type === 'environment') return 'sigil';
  if (card.type === 'spell') return pick(['rune', 'sigil'], seed);
  // units
  if (k.airborne) return pick(['moth', 'wing'], seed);
  if (k.aquatic) return pick(['serpent', 'fin'], seed);
  if (k.sniper) return pick(['eye', 'bow'], seed);
  if (k.healer) return 'chalice';
  if (k.taunt) return pick(['brute', 'golem'], seed);
  const atk = card.attack ?? 0, hp = card.hp ?? 0;
  if (atk >= hp + 2) return pick(['fist', 'blade', 'fang'], seed);
  return pick(ELEM_BEAST[card.element], seed);
}

/**
 * The card-art emblem: an element-tinted woodcut glyph filling `.card__art`. `size` is unused
 * (the SVG scales to its container) but accepted for parity with ElementRune call sites.
 */
export function Emblem({ card, className = '' }: { card: CardLike; className?: string }) {
  const key = glyphFor(card);
  const d = GLYPHS[key] ?? GLYPHS.sigil;
  return (
    <svg
      className={`emblem emblem--${card.element} ${className}`}
      viewBox="0 0 100 92"
      role="img"
      aria-label={`${ELEMENT_NAME[card.element] ?? card.element} emblem`}
      preserveAspectRatio="xMidYMid meet"
    >
      <path d={d} />
    </svg>
  );
}
