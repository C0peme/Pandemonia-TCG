/**
 * Human-readable reference for keywords and statuses: full names + brief, simplified
 * descriptions (edge cases are handled by the engine, not explained here). Used by the
 * UI for labels, tooltips, and the card detail popup.
 */
import type { Cost, Keywords, CardElement } from '@cards/schema';
import type { StatusState } from '@engine/types';

export interface AbilityInfo {
  name: string;
  /** A distinct monochrome Unicode glyph, so abilities/statuses are recognisable at a glance
   *  and render as engraved text rather than colour emoji. */
  icon: string;
  describe: (value: unknown) => string;
}

const n = (v: unknown): number => (typeof v === 'number' ? v : 0);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});

export const ABILITY_INFO: Record<keyof Keywords, AbilityInfo> = {
  lethal: { name: 'Lethal', icon: '☠', describe: () => 'Destroys any unit it damages (then this is used up).' },
  overshot: { name: 'Overshot', icon: '⤴', describe: () => 'Attacks the enemy leader directly, past blockers. No retaliation.' },
  pierce: { name: 'Pierce', icon: '⤵', describe: () => 'Ignores Shield, Taunt, Spike and Tough; hits the deepest unit.' },
  sniper: { name: 'Sniper', icon: '◎', describe: () => 'From the Heights lane, may attack any lane.' },
  branchShot: { name: 'Branch Shot', icon: '↔', describe: () => 'Attacks both neighbouring lanes instead of its own. No retaliation.' },
  splashDamage: { name: 'Splash DMG', icon: '≋', describe: () => 'Hits its own lane and both neighbours at once.' },
  strikeThrough: { name: 'Strike Through', icon: '⇥', describe: () => 'Damages the blocking unit and the leader at the same time.' },
  doubleStrike: { name: 'Double Strike', icon: '⚔', describe: () => 'Attacks twice each turn.' },
  airborne: { name: 'Airborne', icon: '⇧', describe: () => 'Counts as a Heights unit and can intercept Overshot attacks.' },
  battleReady: { name: 'Battle Ready', icon: '»', describe: () => 'Ignores summoning sickness — can attack the turn it enters play.' },
  shield: { name: 'Shield', icon: '▣', describe: (v) => `Blocks the next ${n(v)} incoming hit(s) entirely.` },
  trueShield: { name: 'True Shield', icon: '◈', describe: () => 'Blocks all damage for the turn.' },
  taunt: { name: 'Taunt', icon: '⚓', describe: () => 'Enemy attacks aimed at the leader hit this unit instead.' },
  spike: { name: 'Spike', icon: '✳', describe: (v) => `Deals ${n(v)} damage back to anything that hits it.` },
  immunity: { name: 'Immunity', icon: '⊘', describe: () => 'Unaffected by spells, abilities and status effects.' },
  tough: { name: 'Tough', icon: '⬢', describe: (v) => `Reduces all incoming damage by ${n(v)}.` },
  polish: { name: 'Polish', icon: '✧', describe: () => 'Triggers whenever it takes damage of any kind (combat, Spike, Burn, Poison, spells…).' },
  doubleTeam: { name: 'Double Team', icon: '‖', describe: () => 'A second unit may share this lane (front and back).' },
  healer: { name: 'Healer', icon: '✚', describe: (v) => `Restores ${n(obj(v).amount)} HP to a ${String(obj(v).target ?? 'target')}.` },
  debuff: { name: 'Debuff', icon: '▼', describe: () => 'Lowers a target unit’s attack and/or HP.' },
  mover: {
    name: 'Mover',
    icon: '⇄',
    describe: (v) => {
      if (obj(v).scope === 'self') return 'Wanders to a random open lane at the end of each turn.';
      const timing = obj(v).trigger === 'endOfTurn' ? ' at end of turn' : obj(v).trigger === 'startOfTurn' ? ' at start of turn' : ' on entry';
      return `Moves a ${String(obj(v).scope ?? 'unit')} unit to another lane${timing}.`;
    },
  },
  expel: { name: 'Expel', icon: '↩', describe: (v) => `Returns a ${String(obj(v).scope ?? 'unit')} unit to its owner’s hand.` },
  sacrifice: { name: 'Sacrifice', icon: '†', describe: (v) => `Optionally destroy up to ${n(obj(v).max)} of your own units to buff this card.` },
  bloodlust: { name: 'Bloodlust', icon: '‡', describe: () => 'Triggers each time it destroys a unit (gains stats and/or an effect).' },
  kamikaze: { name: 'Kamikaze', icon: '✺', describe: () => 'Triggers a final effect when it is destroyed.' },
  zombified: { name: 'Zombified', icon: '↺', describe: () => 'Revives once at 1 HP when destroyed.' },
  growth: { name: 'Growth', icon: '↥', describe: () => 'Gains stats at the end of each turn.' },
  brittle: { name: 'Brittle', icon: '✘', describe: () => 'Attacks once, then destroys itself.' },
  aquatic: { name: 'Aquatic', icon: '≈', describe: (v) => Array.isArray(v) && v.length ? `Triggers effects on entering the Water lane (forfeited if Airborne).` : 'Can be placed in the Water lane.' },
  producer: { name: 'Producer', icon: '⌁', describe: (v) => `Produces ${n(obj(v).amount)} energy each turn.` },
  metamorphosis: { name: 'Metamorphosis', icon: '⧖', describe: (v) => `Transforms every ${n(obj(v).everyTurns)} turns.` },
  smelt: { name: 'Smelt', icon: '⚒', describe: (v) => `Loses ${n(obj(v).hpCost)} HP each turn in exchange for an effect.` },
};

export const STATUS_INFO: Record<keyof StatusState, AbilityInfo> = {
  burn: { name: 'Burn', icon: '♨', describe: (v) => `Takes ${n(v)} damage just before it attacks or retaliates; clears at end of turn.` },
  poisoned: { name: 'Poison', icon: '☣', describe: (v) => `Takes ${n(v)} damage each turn, cannot be healed, and cannot gain stats. Lasts until removed.` },
  sleep: { name: 'Sleep', icon: '☾', describe: () => 'Cannot act and heals each turn; wakes if attacked.' },
  sleepHeal: { name: 'Sleep Heal', icon: '♡', describe: (v) => `Heals ${n(v)} HP per turn while asleep.` },
  freeze: { name: 'Freeze', icon: '❄', describe: () => 'Cannot act and blocks the first hit; wakes if attacked.' },
  drowning: { name: 'Drowning', icon: '⇊', describe: () => 'In Water without water-walking: 0 attack, and takes 1 damage at the start of your turn. It can still block.' },
};

export interface NamedAbility {
  key: string;
  name: string;
  icon: string;
  description: string;
}

/** Full ability list for a unit/card's keywords, with names and descriptions. */
/** Keywords that are implementation details and should not be shown as ability badges. */
const HIDDEN_KEYWORDS = new Set<keyof Keywords>();

export const listAbilities = (keywords: Keywords): NamedAbility[] => {
  const out: NamedAbility[] = [];
  for (const key of Object.keys(keywords) as (keyof Keywords)[]) {
    if (HIDDEN_KEYWORDS.has(key)) continue;
    const value = keywords[key];
    if (value === undefined || value === false) continue;
    const info = ABILITY_INFO[key];
    if (!info) continue;
    out.push({ key, name: info.name, icon: info.icon, description: info.describe(value) });
  }
  return out;
};

/** Active statuses on a unit, with names and descriptions. */
export const listStatuses = (status: StatusState): NamedAbility[] => {
  const out: NamedAbility[] = [];
  for (const key of Object.keys(status) as (keyof StatusState)[]) {
    const value = status[key];
    if (value === undefined || value === false || value === 0) continue;
    if (key === 'sleepHeal') continue; // shown as part of Sleep
    const info = STATUS_INFO[key];
    if (!info) continue;
    out.push({ key, name: info.name, icon: info.icon, description: info.describe(value) });
  }
  return out;
};

// Keyed by CardElement, not Element: `neutral` is a card class (no bank, no cap, no pip), and
// these labels are used for CARD chips as well as bank tiles.
const ELEMENT_NAME: Record<CardElement, string> = { fire: 'Fire', water: 'Water', nature: 'Nature', earth: 'Earth', neutral: 'Neutral' };
/* Element glyphs now live in `@ui/ElementRune` (ELEMENT_SYMBOL / <ElementRune/>) — the old
   emoji ELEMENT_ICON map was removed once every call site moved to the carved rune sigils. */

/** "3" or "5 + 2 Fire" or "4 + 1 Fire + 1 Nature". */
export const formatCost = (cost: Cost): string => {
  const parts = (cost.elements ?? []).map((e) => `${e.amount} ${ELEMENT_NAME[e.type]}`);
  return parts.length ? `${cost.energy} + ${parts.join(' + ')}` : `${cost.energy}`;
};

export { ELEMENT_NAME };
