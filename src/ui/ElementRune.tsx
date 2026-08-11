import { type CardElement, type Element } from '@engine/constants';
import { ELEMENT_NAME } from '@cards/abilities';

/** Carved Unicode sigil per element (BMP glyphs — reliable, heraldic, shape-distinct):
 *  Fire = rising triangle, Water = falling triangle, Nature = blossom, Earth = cut gem. */
export const ELEMENT_SYMBOL: Record<Element, string> = { fire: '△', water: '▽', nature: '✿', earth: '◆' };

/** Neutral is a card class, not an element — a plain ring, deliberately unlike the four sigils. */
export const CARD_ELEMENT_SYMBOL: Record<CardElement, string> = { ...ELEMENT_SYMBOL, neutral: '◇' };

/**
 * A carved, element-coloured rune sigil — the stylised replacement for element emoji.
 * `size` is the box edge in px. Always carries the element name for accessibility + hover,
 * so a new player reads what it is without prior knowledge.
 */
export function ElementRune({ element, size = 16, className = '' }: { element: CardElement; size?: number; className?: string }) {
  return (
    <span
      className={`erune erune--${element} ${className}`}
      style={{ ['--er-size' as string]: `${size}px` }}
      title={ELEMENT_NAME[element]}
      aria-label={ELEMENT_NAME[element]}
    >
      {CARD_ELEMENT_SYMBOL[element]}
    </span>
  );
}
