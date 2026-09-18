/**
 * The Foundry — the enemy enhances too.
 *
 * Past act 3 a run's own deck starts to compound in a way nothing on the other side of
 * the board did: enhancements stack without limit, keywords merge without conflict, cost
 * floors at zero and Perfect Copy replicates the whole stack. The end state is a "God
 * Unit" — one free, airborne, immune body carrying every ability in the game — and the
 * acts after it stop being fights.
 *
 * The answer here is deliberately NOT to cap that. Building it is the point of the mode.
 * The answer is that the enemy is running the same machinery: from `FOUNDRY_START_ACT`
 * their decks arrive with workings on them, and the workings get denser, deeper and rarer
 * every act — until, late enough, some enemy card has accidentally become a God Unit too.
 * Difficulty comes from the other side getting better, never from the player getting less.
 *
 * DERIVED, NOT STORED, AND GENUINELY CUMULATIVE. `foundryStack` seeds ONE roller from the
 * run seed and takes the first `n` draws, where `n` grows with the act. So act 7's stack
 * is literally act 6's stack plus one more working — the enemy's build visibly grows
 * across the run, continuously, with no `RunState` field to persist and nothing a reload
 * can reroll. It is the same guarantee `rollEnhanceOffers` and `rollStoreOffer` give, used
 * for continuity rather than just for reproducibility.
 *
 * They also scale FASTER than the player does, on purpose (`FOUNDRY_ACT_GAIN` vs the
 * altar's one working per visit). The player's curve is bounded by node visits — you get
 * one working per Enhance node and there are only so many on a map — while this one is
 * bounded by the act number alone, so the gap opens gradually from act 4 and is wide by
 * act 8. That is where the late-game challenge is supposed to come from.
 */
import type { Registry } from '@cards/registry';
import type { Deck } from '@cards/schema';
import type { Enhancement, OwnedCard } from '@adventure/schema';
import { makeRoller } from '@adventure/seed';
import { rollFoundryEnhancement } from '@adventure/enhance';

/** The act enemies start arriving pre-enhanced. Acts 1-3 are the introduction. */
export const FOUNDRY_START_ACT = 4;

/**
 * Workings added to the enemy's pool per act past the start.
 *
 * The player's own curve is one working per Enhance node visited — call it ~2 an act, and
 * bounded by how many the map happens to offer. This is deliberately steeper AND
 * unconditional, which is the whole "enemies scale faster than you after act 3" lever: by
 * act 8 the enemy pool is ~15 workings deep against a player who has had to walk to every
 * one of theirs.
 */
export const FOUNDRY_ACT_GAIN = 3;

/** Share of an enemy's deck that may carry workings at all, rising with the act. */
const density = (act: number): number => Math.min(0.55, 0.15 + 0.06 * (act - FOUNDRY_START_ACT));

/**
 * Hard ceiling on how many DISTINCT cards may carry workings, whatever `density` says.
 *
 * This is what turns breadth into depth. Enemy decks grow with the act too, so a pure
 * percentage kept finding new carriers as fast as the stack grew — measured at act 12 the
 * pool was 27 workings spread over 13 cards, i.e. two each, forever. Capping the carriers
 * means the stack has nowhere to go but deeper once it outgrows them, which is exactly how
 * the player's own God Unit happens: not by a rule that builds one, but by more workings
 * than places to put them.
 */
const FOUNDRY_MAX_CARRIERS = 6;

/** Odds any one working is drawn from the RARE pool (pairs, high magnitudes). */
const rarity = (act: number): number => Math.min(0.5, 0.05 + 0.07 * (act - FOUNDRY_START_ACT));

/** How many workings the enemy's pool holds at this act. Zero before the Foundry opens. */
export const foundrySize = (act: number): number =>
  act < FOUNDRY_START_ACT ? 0 : FOUNDRY_ACT_GAIN * (act - FOUNDRY_START_ACT + 1);

/**
 * The run's accumulated enemy workings at this act, oldest first.
 *
 * One roller, `foundrySize(act)` draws — so the act-N list is a PREFIX-EXTENSION of the
 * act-(N−1) list and the enemy's build carries forward instead of being re-rolled into
 * something unrecognisable every act. Rarity rises with the act, so the workings added
 * late are the big ones, which is also what makes the tail of the list the interesting
 * part rather than more of the same.
 */
export const foundryStack = (runSeed: number, act: number): Enhancement[] => {
  const n = foundrySize(act);
  if (n <= 0) return [];
  const roll = makeRoller(runSeed ^ 0x5f0d);
  const out: Enhancement[] = [];
  for (let i = 0; i < n; i++) {
    // The act each working was ADDED at drives its rarity, not the current act — that is
    // what makes the list an extension rather than a re-roll: an early working must draw
    // the same way it did when the run first met it.
    const addedAct = FOUNDRY_START_ACT + Math.floor(i / FOUNDRY_ACT_GAIN);
    out.push(rollFoundryEnhancement(roll, rarity(addedAct), addedAct));
  }
  return out;
};

/**
 * Distribute the run's Foundry stack across an enemy deck.
 *
 * Returns owned-card records for the whole deck (unenhanced entries included) so the
 * caller can hand one list to both `buildRunRegistry` and the deck literal, exactly the
 * way the player's side already works — the two must agree on ids or the materialized def
 * and the deck entry silently drift apart.
 *
 * Spread rather than concentrated: `density(act)` decides how many DISTINCT cards may
 * carry workings, and the stack is dealt round-robin across them. That means depth arrives
 * on its own as the stack outgrows the carriers — at act 5 most carriers hold one working,
 * by act 9 they hold three or four each — rather than being a separate dial. The God Unit
 * on their side is an emergent consequence of the same curve, not a special case.
 *
 * Spells and environments are skipped: only units and foundations have stats or grantable
 * keywords, the same restriction `applyDeckBuffs` and the altar's `canApply` observe.
 */
export const foundryDeck = (
  base: Registry,
  deck: Deck,
  runSeed: number,
  act: number,
): OwnedCard[] => {
  const ids = deck.cards.flatMap((c) => Array.from({ length: c.count }, () => c.cardId));
  const owned: OwnedCard[] = ids.map((cardId, i) => ({ uid: `e${i}`, cardId, enhancements: [] }));
  const stack = foundryStack(runSeed, act);
  if (stack.length === 0) return owned;

  const eligible = owned.filter((o) => {
    const def = base.cards.get(o.cardId);
    return def?.type === 'unit' || def?.type === 'foundation';
  });
  if (eligible.length === 0) return owned;

  // Which copies carry them is rolled from the run seed AND the act, so the carriers are
  // stable for a given act but are not the same five cards for the whole run.
  const roll = makeRoller(runSeed ^ (act * 7919));
  const want = Math.min(FOUNDRY_MAX_CARRIERS, Math.round(eligible.length * density(act)));
  const carriers = roll.shuffle(eligible).slice(0, Math.max(1, want));
  for (let i = 0; i < stack.length; i++) {
    const target = carriers[i % carriers.length]!;
    target.enhancements = [...target.enhancements, stack[i]!];
  }
  return owned;
};
