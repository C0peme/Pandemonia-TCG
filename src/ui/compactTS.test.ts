import { describe, expect, it } from 'vitest';
import { compactTS } from '@ui/CardStudio';

/**
 * `compactTS` serializes an authored card into pasteable TypeScript source (the "Export"
 * feature's whole job). Its string escaping only handled quotes, so a card's `text` field
 * — edited in a `<textarea>` that happily accepts a line break — produced a single-quoted
 * string literal with a RAW newline inside it: invalid TypeScript the moment it's pasted
 * back into a `.ts` file or re-parsed, not just cosmetically wrong.
 */
describe('compactTS string escaping', () => {
  const roundTrips = (jsExpr: string): unknown =>
    // eslint-disable-next-line no-new-func -- this IS the check: does the generated
    // source actually parse as valid JS, exactly as pasting it into a .ts file would.
    new Function(`return (${jsExpr});`)();

  it('escapes a single quote (the case that already worked)', () => {
    const src = compactTS("it's a trap");
    expect(roundTrips(src)).toBe("it's a trap");
  });

  it('escapes an embedded newline instead of emitting a raw line break', () => {
    const withNewline = 'Line one.\nLine two.';
    const src = compactTS(withNewline);
    expect(src).not.toContain('\n'); // no raw newline may reach the generated source
    expect(src).toContain('\\n');
    expect(roundTrips(src)).toBe(withNewline);
  });

  it('escapes a carriage return the same way', () => {
    const withCR = 'a\r\nb';
    const src = compactTS(withCR);
    expect(src).not.toMatch(/[\r\n]/);
    expect(roundTrips(src)).toBe(withCR);
  });

  it('escapes a literal backslash before quote/newline escaping runs, not after', () => {
    // If backslash escaping ran AFTER quote escaping, the backslash just introduced to
    // escape a quote would itself get re-escaped, doubling up. Order matters.
    const tricky = "back\\slash then a quote's here";
    const src = compactTS(tricky);
    expect(roundTrips(src)).toBe(tricky);
  });

  it('round-trips a realistic multi-line rules-text card through a full object', () => {
    const card = {
      id: 'test-card',
      name: "Ashvane's Reprisal",
      text: 'On play: deal 2 damage.\nThen draw a card.',
      tags: [],
    };
    const src = compactTS(card);
    expect(roundTrips(src)).toEqual(card);
  });
});
