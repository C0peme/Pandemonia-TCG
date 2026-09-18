/**
 * Multiplayer (LAN) UI: host/join entry, lobby with deck selection, and the networked match.
 *
 * The host uploads its live card content to the server on connect; a joining player receives
 * that shared content and builds an identical registry from it (they cannot edit cards — only
 * pick a deck and play). Once the host starts, both sides render the normal board via `PlayArea`,
 * driven by a `useGame` bound to the network transport and wrapped in a `RegistryProvider` so
 * card ids resolve against the host's shared pool.
 */
import { useEffect, useMemo, useState } from 'react';
import type { GameState, PlayerId } from '@engine/types';
import { validateDeck, type Registry } from '@cards/registry';
import type { Deck } from '@cards/schema';
import { snapshotContent } from '@cards/store';
import { registryFromSnapshot, parseSnapshot, type ContentSnapshot } from '@cards/snapshot';
import type { Phase, Role, SeatInfo } from '@net/protocol';
import { NetClient } from '@ui/net/NetClient';
import { useGame } from '@ui/useGame';
import { useContent, useRegistry, RegistryProvider } from '@ui/useContent';
import { DeckBuilder } from '@ui/DeckBuilder';
import { PlayArea, CardDetail, type Detail } from '@ui/App';

export function Multiplayer() {
  const [session, setSession] = useState<{ client: NetClient; role: Role } | null>(null);
  if (!session) {
    return <MultiplayerEntry onStart={(client, role) => setSession({ client, role })} />;
  }
  return (
    <MultiplayerSession
      client={session.client}
      role={session.role}
      onLeave={() => { session.client.close(); setSession(null); }}
    />
  );
}

function MultiplayerEntry({ onStart }: { onStart: (client: NetClient, role: Role) => void }) {
  const [name, setName] = useState('');
  const connect = (role: Role): void => {
    onStart(new NetClient(role, name.trim() || (role === 'host' ? 'Host' : 'Player')), role);
  };
  return (
    <div className="mp mp-entry">
      <h2>⬡ Multiplayer (LAN)</h2>
      <label className="mp-field">
        Your name
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Adrian" />
      </label>
      <div className="mp-entry__buttons">
        <button className="btn-end" onClick={() => connect('host')}>▭ Host a game</button>
        <button onClick={() => connect('player')}>◈ Join a game</button>
      </div>
      <div className="mp-help muted">
        <p><strong>Host:</strong> start the server once with <code>npm run server</code>, then click “Host a game”. Your cards become the shared pool.</p>
        <p><strong>Players:</strong> open this same page from the host’s address (e.g. <code>http://&lt;host-ip&gt;:5173</code>), go to Multiplayer, and click “Join a game”.</p>
      </div>
    </div>
  );
}

function MultiplayerSession({ client, role, onLeave }: { client: NetClient; role: Role; onLeave: () => void }) {
  const localContent = useContent();
  const localRegistry = useRegistry();
  const [seat, setSeat] = useState<PlayerId | null>(null);
  const [seats, setSeats] = useState<SeatInfo[]>([]);
  const [phase, setPhase] = useState<Phase>('lobby');
  const [snapshot, setSnapshot] = useState<ContentSnapshot | null>(null);
  const [initialState, setInitialState] = useState<GameState | null>(null);
  const [deckName, setDeckName] = useState('');
  const [error, setError] = useState('');
  const [building, setBuilding] = useState(false);

  useEffect(() => {
    return client.subscribe((msg) => {
      switch (msg.t) {
        case 'welcome':
          setSeat(msg.seat);
          if (role === 'host') client.shareContent(snapshotContent());
          break;
        case 'lobby': setSeats(msg.seats); setPhase(msg.phase); break;
        // Schema-checked at the boundary for the same reason the server does it: nothing
        // between the socket and `registryFromSnapshot` validates, and an unparseable card
        // throws there rather than being ignored.
        case 'content': setSnapshot(parseSnapshot(msg.snapshot)); break;
        case 'state': setPhase(msg.phase); setInitialState((s) => s ?? msg.state); break;
        case 'error': setError(msg.message); break;
        case 'peerLeft': setError('Your opponent disconnected.'); break;
      }
    });
  }, [client, role]);

  // Host resolves cards with its own live registry; a player builds one from the shared snapshot.
  const registry: Registry | null = useMemo(
    () => (role === 'host' ? localRegistry : snapshot ? registryFromSnapshot(snapshot) : null),
    [role, localRegistry, snapshot],
  );
  // Deck options are the player's OWN decks (base pool + custom), kept only if they are valid
  // against the shared registry (host's pool). This is how a joiner gets "the base decks to
  // start" plus any decks they build or import — all built against the host's cards.
  const decks: Deck[] = useMemo(
    () => (registry ? localContent.decks.filter((d) => validateDeck(registry, d).ok) : []),
    [registry, localContent.decks],
  );

  if ((phase === 'playing' || phase === 'ended') && seat !== null && registry && initialState) {
    return (
      <NetGame
        client={client}
        seat={seat}
        role={role}
        phase={phase}
        registry={registry}
        initialState={initialState}
        onLeave={onLeave}
      />
    );
  }

  // Build/import decks against the host's shared pool (RegistryProvider override). Saved decks
  // land in this device's local store and then appear in the picker below (valid ones only).
  if (building && registry) {
    return (
      <RegistryProvider value={registry}>
        <div className="mp-build">
          <div className="mp-game__bar">
            <span className="muted">Building from {role === 'host' ? 'your' : 'the host’s'} card pool — decks save to this device.</span>
            <span className="topbar__spacer" />
            <button className="btn-end" onClick={() => setBuilding(false)}>← Back to lobby</button>
          </div>
          <DeckBuilder />
        </div>
      </RegistryProvider>
    );
  }

  const chooseDeck = (name: string): void => {
    const d = decks.find((x) => x.name === name);
    if (d) { client.chooseDeck(d); setDeckName(name); }
  };
  const bothReady = seats.length === 2 && seats.every((s) => s.connected && s.ready);

  return (
    <div className="mp mp-lobby">
      <h2>⬡ Multiplayer Lobby</h2>
      {error && <div className="mp-error">{error}</div>}
      <p className="muted">
        Share this address with your opponent: <code>{typeof location !== 'undefined' ? location.origin : ''}</code>
      </p>

      <div className="mp-seats">
        {seats.length === 0 && <div className="muted">Connecting…</div>}
        {seats.map((s) => (
          <div key={s.seat} className={`mp-seat${s.connected ? '' : ' mp-seat--offline'}`}>
            <span className="mp-seat__role">{s.role === 'host' ? '▭ Host' : '◈ Player'}</span>
            <span className="mp-seat__name">{s.name}{s.seat === seat ? ' (you)' : ''}</span>
            <span className="mp-seat__deck muted">{s.ready ? `✓ ${s.deckName}` : 'choosing deck…'}</span>
          </div>
        ))}
      </div>

      {registry ? (
        <div className="mp-deckpick">
          <label className="mp-field">
            Your deck
            <select value={deckName} onChange={(e) => chooseDeck(e.target.value)}>
              <option value="" disabled>Pick a deck…</option>
              {decks.map((d) => <option key={d.name} value={d.name}>{d.name}</option>)}
            </select>
          </label>
          <button onClick={() => setBuilding(true)} title="Build or import a deck from the host's card pool">
            ♠ Build / import decks
          </button>
        </div>
      ) : (
        <p className="muted">Waiting for the host to share card content…</p>
      )}

      {role === 'host' ? (
        <button className="btn-end" disabled={!bothReady} onClick={() => client.start()}>
          {bothReady ? 'Start match ▶' : 'Waiting for both players to pick a deck…'}
        </button>
      ) : (
        <p className="muted">Waiting for the host to start the match…</p>
      )}

      <button className="mp-leave" onClick={onLeave}>Leave</button>
    </div>
  );
}

function NetGame({
  client,
  seat,
  role,
  phase,
  registry,
  initialState,
  onLeave,
}: {
  client: NetClient;
  seat: PlayerId;
  role: Role;
  phase: Phase;
  registry: Registry;
  initialState: GameState;
  onLeave: () => void;
}) {
  const transport = useMemo(() => client.transport(seat), [client, seat]);
  const g = useGame({ transport, registry, initialState });
  const [detail, setDetail] = useState<Detail | null>(null);
  const onPlayAgain = role === 'host' ? () => client.rematch() : undefined;

  return (
    <RegistryProvider value={registry}>
      <div className="mp-game">
        <div className="mp-game__bar">
          <span className="muted">You are {role === 'host' ? 'the Host' : 'a Player'} · Seat {seat + 1}</span>
          <span className="topbar__spacer" />
          {phase === 'ended' && role === 'host' && (
            <button onClick={() => client.rematch()}>Rematch</button>
          )}
          <button className="mp-leave" onClick={onLeave}>Leave match</button>
        </div>
        <PlayArea g={g} onDetail={setDetail} onPlayAgain={onPlayAgain} />
        {detail && <CardDetail detail={detail} onClose={() => setDetail(null)} />}
      </div>
    </RegistryProvider>
  );
}
