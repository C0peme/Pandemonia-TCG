/**
 * Pandemonia multiplayer server (LAN, authoritative).
 *
 * A single Node process that owns one 1v1 match. Clients connect over a WebSocket, the host
 * (seat 0) uploads its card content and starts the game, a player (seat 1) joins and picks a
 * deck. Every action is validated through the real engine inside `Match`, and every state
 * broadcast is redacted per-recipient so neither side sees the other's hidden cards.
 *
 * Run with:  npm run server    (uses tsx to execute this TypeScript directly)
 * Exposed on 0.0.0.0 so LAN peers can reach it at ws://<host-LAN-ip>:8787.
 */
import { WebSocketServer, type WebSocket } from 'ws';
import type { Action } from '@engine/actions';
import type { GameEvent } from '@engine/events';
import type { PlayerId } from '@engine/types';
import { Match } from '@net/match';
import { redactEventsFor, redactStateFor } from '@net/redact';
import { MP_PORT, parseMsg, type ClientMsg, type ServerMsg } from '@net/protocol';
import { parseSnapshot } from '@cards/snapshot';

const match = new Match();
/** Live sockets by seat (a seat may be temporarily empty between disconnect/reconnect). */
const sockets: Record<PlayerId, WebSocket | null> = { 0: null, 1: null };
/** Every connected socket's assigned seat, before/after seating. */
const seatOf = new WeakMap<WebSocket, PlayerId>();

const send = (ws: WebSocket | null, msg: ServerMsg): void => {
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
};

const eachSeat = (fn: (seat: PlayerId, ws: WebSocket | null) => void): void => {
  ([0, 1] as PlayerId[]).forEach((seat) => fn(seat, sockets[seat]));
};

/** Push the current lobby roster to everyone. */
const broadcastLobby = (): void => {
  const seats = match.seatInfos();
  const contentReady = match.contentReady();
  eachSeat((_seat, ws) => send(ws, { t: 'lobby', seats, phase: match.phase, contentReady }));
};

/** Broadcast the authoritative state, redacted per recipient. */
const broadcastState = (action: Action | null, events: GameEvent[]): void => {
  if (!match.state) return;
  const state = match.state;
  eachSeat((seat, ws) => {
    if (!ws) return;
    send(ws, {
      t: 'state',
      action,
      state: redactStateFor(state, seat),
      events: redactEventsFor(events, seat),
      you: seat,
      phase: match.phase,
    });
  });
};

const handle = (ws: WebSocket, msg: ClientMsg): void => {
  switch (msg.t) {
    case 'hello': {
      const res = match.join(msg.role, msg.name || (msg.role === 'host' ? 'Host' : 'Player'));
      if (!res.ok) { send(ws, { t: 'error', message: res.error }); return; }
      const seat = res.value;
      sockets[seat] = ws;
      seatOf.set(ws, seat);
      send(ws, { t: 'welcome', seat, role: msg.role });
      // A joining player receives the shared content immediately if the host already uploaded it.
      if (msg.role === 'player' && match.content) send(ws, { t: 'content', snapshot: match.content });
      // A reconnecting seat mid-game gets the current (redacted) state back.
      if (match.state) broadcastState(null, []);
      broadcastLobby();
      return;
    }
    case 'content': {
      if (seatOf.get(ws) !== 0) { send(ws, { t: 'error', message: 'Only the host can share content' }); return; }
      // `parseMsg` is a JSON.parse plus a type ASSERTION — it validates nothing. This is the
      // trust boundary, so the snapshot is schema-checked here before it can reach
      // `registryFromSnapshot`, where a non-object card throws inside `expandKeywordEffects`
      // and takes the server process down. Malformed entries are dropped, not fatal.
      const snapshot = parseSnapshot(msg.snapshot);
      match.setContent(snapshot);
      send(sockets[1], { t: 'content', snapshot }); // relay the SANITIZED copy, so both sides
      // build their registry from exactly the content the server did
      broadcastLobby();
      return;
    }
    case 'chooseDeck': {
      const seat = seatOf.get(ws);
      if (seat === undefined) return;
      const res = match.chooseDeck(seat, msg.deck);
      if (!res.ok) { send(ws, { t: 'error', message: res.error }); return; }
      broadcastLobby();
      return;
    }
    case 'start':
    case 'rematch': {
      if (seatOf.get(ws) !== 0) { send(ws, { t: 'error', message: 'Only the host can start the match' }); return; }
      const res = match.start();
      if (!res.ok) { send(ws, { t: 'error', message: res.error }); return; }
      broadcastState(null, []);
      broadcastLobby();
      return;
    }
    case 'action': {
      const seat = seatOf.get(ws);
      if (seat === undefined) return;
      const res = match.apply(seat, msg.action);
      if (!res.ok) { send(ws, { t: 'error', message: res.error }); return; }
      broadcastState(msg.action, res.value.events);
      if (match.phase === 'ended') broadcastLobby();
      return;
    }
  }
};

const wss = new WebSocketServer({ host: '0.0.0.0', port: MP_PORT });

wss.on('connection', (ws) => {
  ws.on('message', (data) => {
    const msg = parseMsg<ClientMsg>(data.toString());
    if (msg) handle(ws, msg);
  });
  ws.on('close', () => {
    const seat = seatOf.get(ws);
    if (seat === undefined) return;
    if (sockets[seat] === ws) sockets[seat] = null;
    match.leave(seat);
    send(sockets[Match.peerOf(seat)], { t: 'peerLeft', seat });
    broadcastLobby();
  });
  ws.on('error', () => { /* ignore socket-level errors; close handler cleans up */ });
});

wss.on('listening', () => {
  console.log(`Pandemonia MP server listening on ws://0.0.0.0:${MP_PORT}`);
});

wss.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n✗ Port ${MP_PORT} is already in use — a Pandemonia server is probably already running.\n` +
      `  Use the existing one, or stop it first. On Windows:\n` +
      `    netstat -ano | findstr :${MP_PORT}      (find the PID)\n` +
      `    taskkill /PID <pid> /F                  (stop it)\n`);
  } else {
    console.error('Server error:', err.message);
  }
  process.exit(1);
});
