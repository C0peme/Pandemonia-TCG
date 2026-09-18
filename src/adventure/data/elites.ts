/**
 * Named Elite encounters — the mid-act spikes, given an identity.
 *
 * Elites used to be anonymous: `+6 HP` and a deeper deck, with no name, no icon and no
 * stated rule, while the `Boss` data shape that would have given them all three was
 * already built and tested one file over. This is that shape reused at a smaller scale —
 * pure content, no new machinery.
 *
 * The same constraint bosses have applies here: every Elite must map to an EXISTING
 * leader, because `leaderId` is what selects the archetype deck it plays
 * (`rollEncounter` throws rather than silently substituting). Elites therefore draw from
 * the same 13 archetypes bosses do; they are lesser champions of the same factions, not a
 * new roster.
 *
 * Differences from a Boss, deliberately:
 *  - 1.5x the normal HP pool rather than a boss's 2x (a spike, not a finale),
 *  - a twist is OPTIONAL and, where present, a mild one — an Elite's edge is its stats
 *    and deck depth, so a twist on top is a garnish rather than the whole fight,
 *  - no `energyOverride`, no `curse`, no hero-power rewrite: those are boss-scale tools.
 */
import { subSeed } from '@adventure/seed';

export interface Elite {
  id: string;
  name: string;
  icon: string;
  /** One-line telegraph shown on the map and in the fight bar. */
  gimmick: string;
  /** Archetype deck/leader this Elite plays (a starterDecks leaderId). */
  leaderId: string;
  /** A TWISTS id, if this Elite fights under one. Kept mild — see the note above. */
  twistId?: string;
}

export const ELITES: Elite[] = [
  {
    id: 'ember-sergeant', name: 'Ember Sergeant', icon: '🔥',
    gimmick: 'Drills her line hard: every unit hits for 2 more.',
    leaderId: 'kedou', twistId: 'stampede',
  },
  {
    id: 'tide-warden', name: 'Tide Warden', icon: '🌊',
    gimmick: 'The Shallows fill the Water lane — everything there swims.',
    leaderId: 'naife', twistId: 'open-shallows',
  },
  {
    id: 'thornback', name: 'Thornback', icon: '🌵',
    gimmick: 'Every unit has Spike 1. Attacking is never free.',
    leaderId: 'corpselock', twistId: 'thorned-world',
  },
  {
    id: 'the-quartermaster', name: 'The Quartermaster', icon: '📦',
    gimmick: 'Fields a deeper, better-supplied deck than anything you have met.',
    leaderId: 'screyera',
  },
  {
    id: 'stone-serjeant', name: 'Stone Serjeant', icon: '⛰',
    gimmick: 'Every unit has Tough 1 — chip damage will not get through.',
    leaderId: 'cleath', twistId: 'hardened',
  },
  {
    id: 'the-understudy', name: 'The Understudy', icon: '🎭',
    gimmick: 'Wears a borrowed face and a borrowed deck. No tricks — just a better hand.',
    leaderId: 'phantom',
  },
  {
    id: 'kite-marshal', name: 'Kite Marshal', icon: '🪁',
    gimmick: 'Every unit is Airborne. The ground will not hold them.',
    leaderId: 'autopus', twistId: 'winged-omen',
  },
  {
    id: 'the-collector', name: 'The Collector', icon: '🏷',
    gimmick: 'Every unit has +1/+1. Nothing on this field is ordinary.',
    leaderId: 'aleph', twistId: 'surge',
  },
  {
    id: 'cinderfield-reaver', name: 'Cinderfield Reaver', icon: '♨',
    gimmick: 'Molten Floor covers both Ground lanes — the ground burns what stands on it.',
    leaderId: 'orsyric', twistId: 'scorched-ground',
  },
  {
    id: 'the-bailiff', name: 'The Bailiff', icon: '⚖',
    gimmick: 'Collects on every debt. A straight, punishing fight.',
    leaderId: 'eksana',
  },
];

/**
 * The Elite at a node, chosen from the node's own seed.
 *
 * Unlike `bossForAct` this does NOT need a run-stable permutation: several Elites appear
 * per act and repeats between them are unremarkable, whereas a boss is the act's single
 * headline and repeating one back-to-back was worth engineering away.
 */
export const eliteForNode = (seed: number): Elite =>
  ELITES[Math.abs(subSeed(seed, 'elite')) % ELITES.length]!;
