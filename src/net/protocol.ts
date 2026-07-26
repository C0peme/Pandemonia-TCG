/**
 * Multiplayer wire protocol: the JSON message types exchanged between the browser clients
 * and the authoritative WebSocket server. Shared by both sides so the shapes never drift.
 *
 * Transport is plain JSON over a single WebSocket. All game payloads (`Action`, `GameState`,
 * `GameEvent`) are the engine's own serializable types — the server is authoritative and every
 * `state` it sends is already redacted for its recipient (see `@net/redact`).
 */
import type { Action } from '@engine/actions';
import type { GameEvent } from '@engine/events';
import type { GameState, PlayerId } from '@engine/types';
import type { Deck } from '@cards/schema';
import type { ContentSnapshot } from '@cards/snapshot';

export const MP_PORT = 8787;

/** Host owns content/editing and seat 0; a player joins into seat 1. */
export type Role = 'host' | 'player';

/** Match lifecycle. */
export type Phase = 'lobby' | 'playing' | 'ended';

/** Public per-seat lobby info (no hidden content). */
export interface SeatInfo {
  seat: PlayerId;
  role: Role;
  name: string;
  connected: boolean;
  /** Name of the deck this seat has chosen, or null if not yet chosen. */
  deckName: string | null;
  ready: boolean;
}

// --- Client -> Server ----------------------------------------------------------------

export type ClientMsg =
  /** First message on connect: declare intended role and display name. */
  | { t: 'hello'; role: Role; name: string }
  /** Host uploads its effective card content (the shared pool). Host only. */
  | { t: 'content'; snapshot: ContentSnapshot }
  /** Choose the deck this seat will play (a full Deck object referencing the host pool). */
  | { t: 'chooseDeck'; deck: Deck }
  /** Host starts the match (requires both seats present and ready). Host only. */
  | { t: 'start' }
  /** Submit a game action for the active seat. */
  | { t: 'action'; action: Action }
  /** Host requests a fresh game after one ends. Host only. */
  | { t: 'rematch' };

// --- Server -> Client ----------------------------------------------------------------

export type ServerMsg =
  /** Assigned seat + role on successful hello. */
  | { t: 'welcome'; seat: PlayerId; role: Role }
  /** Current lobby roster + whether the host has uploaded content yet. */
  | { t: 'lobby'; seats: SeatInfo[]; phase: Phase; contentReady: boolean }
  /** Relayed host content, sent to a joining player so it can build the shared registry. */
  | { t: 'content'; snapshot: ContentSnapshot }
  /**
   * Authoritative game update, already redacted for THIS recipient. `action` is the action
   * that produced it (null for the initial state on match start / rematch); `you` is the
   * recipient's seat so the client knows which side is its point of view.
   */
  | { t: 'state'; action: Action | null; state: GameState; events: GameEvent[]; you: PlayerId; phase: Phase }
  /** A recoverable problem (rejected action, wrong turn, etc.). */
  | { t: 'error'; message: string }
  /** The peer in the given seat disconnected. */
  | { t: 'peerLeft'; seat: PlayerId };

/** Narrowing helper: parse an incoming JSON string into a typed message (or null). */
export const parseMsg = <T>(raw: string): T | null => {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};
