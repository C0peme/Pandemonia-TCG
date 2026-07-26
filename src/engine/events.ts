/**
 * Game events: a structured, human-readable record of everything the engine did
 * while applying an action. The UI renders these in the event-log panel and they
 * make rules behaviour easy to assert in tests.
 */
import type { Element, LaneId } from '@engine/constants';
import type { PlayerId } from '@engine/types';

export type GameEvent =
  | { t: 'turnStart'; player: PlayerId; round: number }
  | { t: 'draw'; player: PlayerId; iid: string; cardId: string }
  | { t: 'deckOut'; player: PlayerId }
  | { t: 'drawNull'; player: PlayerId }
  | { t: 'foundationPlaced'; player: PlayerId; cardId: string; hostIid: string }
  | { t: 'foundationBonded'; player: PlayerId; foundationCardId: string; hostIid: string }
  | { t: 'foundationDestroyed'; iid: string; hostIid: string }
  | { t: 'playUnit'; player: PlayerId; cardId: string; lane: LaneId; position: 'front' | 'back' }
  | { t: 'drowning'; player: PlayerId; cardId: string }
  | { t: 'attack'; attacker: string; lane: LaneId; targetUnit?: string; targetLeader?: PlayerId; amount: number }
  | { t: 'retaliate'; unit: string; target: string; amount: number }
  | { t: 'damageUnit'; iid: string; amount: number; hpAfter: number; victim?: PlayerId }
  /** Damage absorbed by mitigation (Tough/Shield/True Shield/Freeze) — for match stats. */
  | { t: 'mitigated'; victim: PlayerId; amount: number }
  | { t: 'damageLeader'; player: PlayerId; amount: number; hpAfter: number }
  | { t: 'blocked'; iid: string; source: 'shield' | 'trueShield' | 'immunity' | 'freeze'; amount?: number; victim?: PlayerId }
  | { t: 'zombieRevive'; iid: string }
  | { t: 'transform'; iid: string; into: string }
  | { t: 'sacrifice'; iid: string; forIid: string }
  | { t: 'wake'; iid: string; from: 'sleep' | 'freeze' }
  | { t: 'burnTick'; iid: string; amount: number; hpAfter: number; victim?: PlayerId }
  | { t: 'growth'; iid: string; attack: number; hp: number }
  | { t: 'produce'; player: PlayerId; element: Element; amount: number }
  | { t: 'poisonTick'; iid: string; amount: number; hpAfter: number; victim?: PlayerId }
  | { t: 'drownTick'; iid: string; amount: number; hpAfter: number; victim?: PlayerId }
  | { t: 'spike'; attacker: string; defender: string; amount: number }
  | { t: 'lethal'; source: string; target: string }
  | { t: 'brittle'; iid: string }
  | { t: 'intercept'; by: string; kind: 'airborne' | 'taunt' }
  | { t: 'unitDestroyed'; iid: string; cardId: string }
  | { t: 'signatureUnlocked'; player: PlayerId }
  | { t: 'signatureGranted'; player: PlayerId; cardId: string }
  | { t: 'bank'; player: PlayerId; element: Element; amount: number }
  | { t: 'castSpell'; player: PlayerId; cardId: string }
  | { t: 'heroPower'; player: PlayerId }
  | { t: 'playEnvironment'; player: PlayerId; cardId: string; lane: LaneId }
  | { t: 'heal'; iid?: string; player?: PlayerId; amount: number; victim?: PlayerId; source?: 'sleep' }
  | { t: 'buff'; iid: string; attack: number; hp: number }
  | { t: 'statusApplied'; iid: string; status: 'burn' | 'poison' | 'sleep' | 'freeze' | 'shield' | 'zombified' | 'trueShield' | 'taunt'; victim?: PlayerId }
  | { t: 'shieldBlock'; iid: string; remaining: number }
  | { t: 'costMod'; player: PlayerId; amount: number }
  | { t: 'extraAction'; iid: string }
  | { t: 'expel'; iid: string; cardId: string; victim?: PlayerId }
  | { t: 'forget'; player: PlayerId; cardId: string; iid?: string }
  | { t: 'summon'; player: PlayerId; cardId: string; lane?: LaneId }
  | { t: 'conjure'; player: PlayerId; cardId: string }
  | { t: 'cleanse'; iid: string }
  /** A keyword-backed status wore off on its own (distinct from being applied or cleansed). */
  | { t: 'statusExpired'; iid: string; status: 'trueShield'; victim?: PlayerId }
  | { t: 'moved'; iid: string; lane: LaneId }
  | { t: 'endTurn'; player: PlayerId }
  | { t: 'gameOver'; winner: PlayerId }
  | { t: 'error'; message: string };

export type ApplyResult = {
  state: import('@engine/types').GameState;
  events: GameEvent[];
};
