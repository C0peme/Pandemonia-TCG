/**
 * Maps engine `GameEvent`s to SFX clip names. This is the single source of truth for
 * *which* sound each event makes; `audio.ts` owns *how* sounds play. `useGame` walks the
 * same event stream that drives the visual flourishes and calls `playSound` for each hit.
 *
 * Clip files live in `public/sfx/<name>.ogg` (with `.mp3` fallback). Any name here that
 * has no file is simply silent — add clips incrementally without touching this map.
 */
import type { GameEvent } from '@engine/events';
import type { AttackFx } from '@ui/combatFx';

/** Every clip name referenced below — used to warm the decode cache after unlock. */
export const SOUND_NAMES = [
  'attack_melee',
  'attack_sniper',
  'attack_lethal',
  'unit_summon',
  'spell_cast',
  'hero_power',
  'environment_play',
  'leader_hit',
  'unit_death',
  'burn',
  'poison',
  'heal',
  'buff',
  'debuff',
  'shield_block',
  'transform',
  'signature',
  'draw',
  'bank',
  'game_over',
  'ui_deny',
  'move',
  'kamikaze',
  'sacrifice_select',
  'sacrifice_confirm',
  'end_turn',
  'expel',
] as const;

/**
 * One clip per event type. Events with no entry make no sound. Combat `attack` sounds
 * are chosen from the richer `AttackFx` instead (see `soundForAttack`), so `attack` is
 * intentionally absent here to avoid double-firing.
 */
const SOUND_FOR: Partial<Record<GameEvent['t'], string>> = {
  playUnit: 'unit_summon',
  foundationPlaced: 'unit_summon',
  foundationBonded: 'unit_summon',
  castSpell: 'spell_cast',
  heroPower: 'hero_power',
  playEnvironment: 'environment_play',
  damageLeader: 'leader_hit',
  unitDestroyed: 'unit_death',
  burnTick: 'burn',
  poisonTick: 'poison',
  heal: 'heal',
  buff: 'buff',
  statusApplied: 'debuff',
  shieldBlock: 'shield_block',
  blocked: 'shield_block',
  transform: 'transform',
  moved: 'move',
  signatureGranted: 'signature',
  signatureUnlocked: 'signature',
  drawNull: 'draw',
  draw: 'draw',
  bank: 'bank',
  gameOver: 'game_over',
  error: 'ui_deny',
  retaliate: 'attack_melee',
  spike: 'attack_melee',
  expel: 'expel',
  // The engine's actual sac-consumption event, not the UI click ritual — reuses that clip
  // so the "confirm" sting lands at the moment a unit is genuinely spent as fuel.
  sacrifice: 'sacrifice_confirm',
  growth: 'buff',
  produce: 'bank',
  cleanse: 'heal',
  zombieRevive: 'transform',
};

/** Clip for a single event, or `undefined` for silence. */
export const soundForEvent = (e: GameEvent): string | undefined => SOUND_FOR[e.t];

/** Combat strikes pick their clip from the attack's flavour (sniper / lethal / melee). */
export const soundForAttack = (fx: AttackFx): string =>
  fx.lethal ? 'attack_lethal' : fx.sniper ? 'attack_sniper' : 'attack_melee';
