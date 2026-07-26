/**
 * Browser-side WebSocket client for multiplayer. A thin, framework-free hub: it owns the
 * socket, encodes/decodes the JSON protocol, fans incoming server messages out to listeners,
 * and caches the latest message of each type so a component that subscribes late (e.g. the game
 * board mounting once the match starts) is immediately brought up to date.
 */
import type { Action } from '@engine/actions';
import type { PlayerId } from '@engine/types';
import type { Deck } from '@cards/schema';
import type { ContentSnapshot } from '@cards/snapshot';
import { MP_PORT, parseMsg, type ClientMsg, type Role, type ServerMsg } from '@net/protocol';

/**
 * The seam `useGame` drives state through. In local play there is no transport (the hook
 * applies actions directly); in net play `send` ships the action to the authoritative server
 * and the resulting state arrives via `subscribe`.
 */
export interface Transport {
  mode: 'net';
  role: Role;
  seat: PlayerId;
  /** Submit a game action for this client's seat. */
  send(action: Action): void;
  /** Listen for authoritative server messages. Returns an unsubscribe fn. */
  subscribe(cb: (msg: ServerMsg) => void): () => void;
}

type Listener = (msg: ServerMsg) => void;

/** Derive the server URL from the page origin (host serves app + ws from the same machine). */
const defaultUrl = (): string => {
  const host = typeof location !== 'undefined' && location.hostname ? location.hostname : 'localhost';
  return `ws://${host}:${MP_PORT}`;
};

export class NetClient {
  role: Role;
  seat: PlayerId | null = null;
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  /** Last message of each type, replayed to new subscribers so they sync immediately. */
  private cache = new Map<ServerMsg['t'], ServerMsg>();
  private readonly url: string;

  constructor(role: Role, name: string, url = defaultUrl()) {
    this.role = role;
    this.url = url;
    this.open(name);
  }

  private open(name: string): void {
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => this.rawSend({ t: 'hello', role: this.role, name });
    ws.onmessage = (ev) => {
      const msg = parseMsg<ServerMsg>(typeof ev.data === 'string' ? ev.data : '');
      if (!msg) return;
      if (msg.t === 'welcome') this.seat = msg.seat;
      this.cache.set(msg.t, msg);
      for (const l of this.listeners) l(msg);
    };
  }

  private rawSend(msg: ClientMsg): void {
    const ws = this.ws;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    else if (ws) ws.addEventListener('open', () => ws.send(JSON.stringify(msg)), { once: true });
  }

  // --- Lobby / host operations (used by the Multiplayer UI) ---
  shareContent(snapshot: ContentSnapshot): void { this.rawSend({ t: 'content', snapshot }); }
  chooseDeck(deck: Deck): void { this.rawSend({ t: 'chooseDeck', deck }); }
  start(): void { this.rawSend({ t: 'start' }); }
  rematch(): void { this.rawSend({ t: 'rematch' }); }

  /** Subscribe to server messages; the latest cached message of each type is replayed first. */
  subscribe(cb: Listener): () => void {
    this.listeners.add(cb);
    for (const msg of this.cache.values()) cb(msg);
    return () => { this.listeners.delete(cb); };
  }

  /** Build the game Transport for a seated client (seat must be known). */
  transport(seat: PlayerId): Transport {
    return {
      mode: 'net',
      role: this.role,
      seat,
      send: (action) => this.rawSend({ t: 'action', action }),
      subscribe: (cb) => this.subscribe(cb),
    };
  }

  close(): void {
    this.listeners.clear();
    this.ws?.close();
    this.ws = null;
  }
}
