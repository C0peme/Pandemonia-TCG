/**
 * Authoritative match state machine (transport-agnostic — no WebSocket here).
 *
 * The Node server wires sockets to a single `Match`; the match owns the content snapshot,
 * the registry, the two seats, and the authoritative `GameState`. It validates every action
 * through the real engine (`applyAction`) so a client can never drive an illegal move, and it
 * refuses debug actions from non-host seats. Redaction of outgoing state is the server's job
 * (see `@net/redact`); the match always holds the full, unredacted truth.
 */
import { applyAction } from '@engine/engine';
import { initGame } from '@engine/setup';
import type { Registry } from '@cards/registry';
import { validateDeck } from '@cards/registry';
import type { Action } from '@engine/actions';
import type { GameEvent } from '@engine/events';
import { opponentOf, type GameState, type PlayerId } from '@engine/types';
import type { Deck } from '@cards/schema';
import { registryFromSnapshot, type ContentSnapshot } from '@cards/snapshot';
import type { Phase, Role, SeatInfo } from '@net/protocol';

interface SeatState {
  role: Role;
  name: string;
  deck: Deck | null;
  ready: boolean;
  connected: boolean;
}

/** Result of an operation that can be rejected with a readable reason. */
export type OpResult<T = void> = { ok: true; value: T } | { ok: false; error: string };
const ok = <T>(value: T): OpResult<T> => ({ ok: true, value });
const fail = (error: string): OpResult<never> => ({ ok: false, error });

const isDebugAction = (a: Action): boolean => a.type.startsWith('debug');

export class Match {
  content: ContentSnapshot | null = null;
  registry: Registry | null = null;
  phase: Phase = 'lobby';
  state: GameState | null = null;
  private seats: Record<PlayerId, SeatState | null> = { 0: null, 1: null };

  /** Claim a seat for a connecting client. Host takes seat 0, a player takes seat 1. */
  join(role: Role, name: string): OpResult<PlayerId> {
    const seat: PlayerId = role === 'host' ? 0 : 1;
    const existing = this.seats[seat];
    if (existing?.connected) return fail(`The ${role} seat is already taken`);
    // Reuse a disconnected seat's chosen deck on reconnect; otherwise start fresh.
    this.seats[seat] = {
      role,
      name,
      deck: existing?.deck ?? null,
      ready: existing?.ready ?? false,
      connected: true,
    };
    return ok(seat);
  }

  /** Mark a seat disconnected (kept so it can reconnect / so the peer is notified). */
  leave(seat: PlayerId): void {
    const s = this.seats[seat];
    if (s) s.connected = false;
  }

  hasSeat(seat: PlayerId): boolean {
    return Boolean(this.seats[seat]?.connected);
  }

  contentReady(): boolean {
    return this.content !== null;
  }

  /** Host uploads the shared card pool; builds the authoritative registry. */
  setContent(snapshot: ContentSnapshot): OpResult {
    this.content = snapshot;
    this.registry = registryFromSnapshot(snapshot);
    return ok(undefined);
  }

  /** A seat chooses its deck (validated against the shared pool). Marks the seat ready. */
  chooseDeck(seat: PlayerId, deck: Deck): OpResult {
    const s = this.seats[seat];
    if (!s) return fail('No such seat');
    if (!this.registry) return fail('Host has not shared content yet');
    const check = validateDeck(this.registry, deck);
    if (!check.ok) return fail(`Invalid deck: ${check.errors.join('; ')}`);
    s.deck = deck;
    s.ready = true;
    return ok(undefined);
  }

  /** Both seats present with a chosen deck? */
  private bothReady(): boolean {
    return (
      Boolean(this.seats[0]?.connected && this.seats[0]?.deck) &&
      Boolean(this.seats[1]?.connected && this.seats[1]?.deck)
    );
  }

  /** Host starts (or restarts) the match. */
  start(seed = (Date.now() & 0xffff) >>> 0): OpResult {
    if (!this.registry) return fail('Host has not shared content yet');
    if (!this.bothReady()) return fail('Both players must join and pick a deck first');
    const d0 = this.seats[0]!.deck!;
    const d1 = this.seats[1]!.deck!;
    this.state = initGame({ registry: this.registry, decks: [d0, d1], seed });
    this.phase = 'playing';
    return ok(undefined);
  }

  /** Apply a game action from `seat`, authoritatively. Rejects illegal / out-of-turn moves. */
  apply(seat: PlayerId, action: Action): OpResult<{ events: GameEvent[] }> {
    if (this.phase !== 'playing' || !this.state || !this.registry) return fail('No game in progress');
    if (isDebugAction(action)) return fail('Debug actions are host-sandbox only and not allowed in a match');
    if (this.state.active !== seat) return fail('It is not your turn');
    const res = applyAction(this.registry, this.state, action);
    const error = res.events.find((e) => e.t === 'error');
    if (error && error.t === 'error') return fail(error.message);
    this.state = res.state;
    if (res.state.phase === 'ended') this.phase = 'ended';
    return ok({ events: res.events });
  }

  /** Public lobby roster. */
  seatInfos(): SeatInfo[] {
    return ([0, 1] as PlayerId[])
      .filter((seat) => this.seats[seat] !== null)
      .map((seat) => {
        const s = this.seats[seat]!;
        return {
          seat,
          role: s.role,
          name: s.name,
          connected: s.connected,
          deckName: s.deck?.name ?? null,
          ready: s.ready,
        };
      });
  }

  /** The seat opposite the given one (helper for peer notifications). */
  static peerOf(seat: PlayerId): PlayerId {
    return opponentOf(seat);
  }
}
