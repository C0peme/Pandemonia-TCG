import { type Element } from '@engine/constants';
import { ELEMENT_NAME } from '@cards/abilities';

/** Carved Unicode sigil per element (BMP glyphs — reliable, heraldic, shape-distinct):
 *  Fire = rising triangle, Water = falling triangle, Nature = blossom, Earth = cut gem. */
export const ELEMENT_SYMBOL: Record<Element, string> = { fire: '△', water: '▽', nature: '✿', earth: '◆' };

/**
 * A carved, element-coloured rune sigil — the stylised replacement for element emoji.
 * `size` is the box edge in px. Always carries the element name for accessibility + hover,
 * so a new player reads what it is without prior knowledge.
 */
export function ElementRune({ element, size = 16, className = '' }: { element: Element; size?: number; className?: string }) {
  return (
    <span
      className={`erune erune--${element} ${className}`}
      style={{ ['--er-size' as string]: `${size}px` }}
      title={ELEMENT_NAME[element]}
      aria-label={ELEMENT_NAME[element]}
    >
      {ELEMENT_SYMBOL[element]}
    </span>
  );
}
