/**
 * A card must SAY what it does. The card face and the detail panel used to render `effects`
 * for spells and environments only, so every unit or foundation whose mechanic lives in a
 * trigger array or a keyword payload — The Fence's "On play: draw a card", a Kamikaze
 * detonation, a Bloodlust rider, a Foundation's granted end-of-turn tick — printed its stats
 * and nothing else. This asserts the renderer covers every one of those homes, across the
 * real content rather than a fixture.
 */
import { describe, expect, it } from 'vitest';
import { abilitiesForCard, cardAbilityLine, cardTriggerLines } from '@ui/App';
import { listAbilities } from '@cards/abilities';
import { buildRegistry } from '@cards/registry';
import { starterCards, starterLeaders } from '@cards/data/starter';

const reg = buildRegistry(starterCards, starterLeaders);
const card = (id: string) => reg.cards.get(id)!;

describe('cardTriggerLines', () => {
  it('renders a unit trigger the card face used to omit entirely', () => {
    const fence = card('the-fence');
    expect(cardTriggerLines(fence)).toEqual(['▶ On play: ♠ Draw 1']);
    expect(cardAbilityLine(fence)).toContain('On play');
  });

  it('Countdown shows both its timer AND what fires — not just the bare badge', () => {
    // Powder Keg: Countdown 2, deals 3 to all enemies, then destroys itself.
    const keg = card('powder-keg');
    if (keg.type !== 'unit') throw new Error('powder-keg should be a unit');
    const abilities = listAbilities(keg.keywords);
    const cdAbility = abilities.find((a) => a.key === 'countdown')!;
    // The ability badge (shortBadge/abilityValue in App.tsx) must show the turn count, not a
    // bare "Countdown" with no number — `abilityValue` special-cases countdown's magnitude
    // because it's nested (`{turns}`), not a plain number like every other keyword value.
    expect(cardAbilityLine(keg)).toContain('Countdown 2');
    expect(cdAbility).toBeTruthy();
    // And the trigger line must say what actually happens, same as Kamikaze/Bloodlust/Polish.
    const line = cardTriggerLines(keg).find((l) => l.startsWith('⏳'));
    expect(line).toBeTruthy();
    expect(line).toContain('After 2 turn(s)');
    expect(line).toContain('Deal 3');
    expect(line).toContain('then destroyed');
  });

  it('a repeating Countdown says "Every N turn(s)", not "After"', () => {
    // Ember Chronicler: Countdown 1 (repeating), draws a card each turn.
    const chronicler = card('ember-chronicler');
    const line = cardTriggerLines(chronicler).find((l) => l.startsWith('⏳'))!;
    expect(line).toContain('Every 1 turn(s)');
    expect(line).toContain('Draw 1');
    expect(line).not.toContain('then destroyed');
  });

  it('says what a Kamikaze payload actually is, not just that one exists', () => {
    const leech = card('mind-leech');
    const line = cardTriggerLines(leech).find((l) => l.startsWith('✺ Kamikaze'));
    expect(line).toBeTruthy();
    expect(line).toContain('Conjure');
  });

  it('leaves a plain vanilla body with nothing to say', () => {
    const vanilla = [...reg.cards.values()].find(
      (c) => c.type === 'unit' && !c.onPlay && !c.onAttack && !c.endOfTurn && !c.startOfTurn &&
        !c.keywords.kamikaze && !c.keywords.bloodlust && !c.keywords.polish && !c.keywords.sacrifice,
    );
    expect(vanilla).toBeTruthy();
    expect(cardTriggerLines(vanilla!)).toEqual([]);
  });

  it('never renders a raw effect kind or an "undefined" anywhere in the pool', () => {
    for (const c of reg.cards.values()) {
      for (const line of cardTriggerLines(c)) {
        expect(line, `${c.id}: ${line}`).not.toMatch(/undefined|\bNaN\b/);
        // Every line is "<label>: <body>" with a real body, or a self-contained sentence.
        expect(line.endsWith(':'), `${c.id}: ${line}`).toBe(false);
      }
    }
  });

  it('every card carrying a trigger array now shows it', () => {
    const withTriggers = [...reg.cards.values()].filter(
      (c) => c.type === 'unit' && (c.onPlay?.length || c.onAttack?.length || c.endOfTurn?.length || c.startOfTurn?.length),
    );
    // The pool leans on triggers heavily — this was a lot of invisible text.
    expect(withTriggers.length).toBeGreaterThan(10);
    for (const c of withTriggers) expect(cardTriggerLines(c).length, c.id).toBeGreaterThan(0);
  });

  /**
   * `DetailBody` (the full card-detail modal) reads BOTH `abilitiesForCard` and
   * `cardTriggerLines` and has never had this gap. The hand-selection sidebar in
   * `Controls` (`App.tsx`'s `cardSel` info panel) read only `abilitiesForCard` plus a
   * spell-only `.effects` listing — so any card whose ability lives entirely in a
   * trigger array (the `healer`/`producer`/`mover`/`expel`/`debuff` authoring shorthand
   * expands into one, and a Foundation's granted `onAttack`/`endOfTurn`/`startOfTurn`
   * always does) showed "No special abilities" there, in the one panel a player checks
   * immediately before playing a card, despite doing exactly what its printed text says.
   * This asserts the two signals TOGETHER — what the sidebar now checks — are non-empty
   * for every real card that should read as having an ability.
   */
  it('abilitiesForCard + cardTriggerLines together cover every card with a real effect (the sidebar gap)', () => {
    const hasAnySignal = (id: string): boolean => {
      const c = card(id);
      return abilitiesForCard(c).length > 0 || cardTriggerLines(c).length > 0;
    };
    // Reef Nurse: "On play: heal an ally 2", authored via the Healer shorthand — a UNIT
    // whose only ability is a trigger array `abilitiesForCard` cannot see.
    expect(hasAnySignal('reef-nurse')).toBe(true);
    // Foundations whose grant is trigger-based rather than keyword-based:
    // Smuggler's Cache / Mana Geyser (Producer) and Lifewell Base (Healer).
    expect(hasAnySignal('smugglers-cache')).toBe(true);
    expect(hasAnySignal('mana-geyser')).toBe(true);
    expect(hasAnySignal('lifewell-base')).toBe(true);
  });

  it('reef-nurse specifically has NO signal from abilitiesForCard alone (the bug, isolated)', () => {
    // This is the precise gap: abilitiesForCard on its own sees nothing for a unit whose
    // ability was authored via the Healer shorthand, because expandKeywordEffects deletes
    // the shorthand key once it folds it into `onPlay`. cardTriggerLines is what fills it.
    expect(abilitiesForCard(card('reef-nurse'))).toEqual([]);
    expect(cardTriggerLines(card('reef-nurse')).length).toBeGreaterThan(0);
  });
});
