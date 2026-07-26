/**
 * Balance Lab — run many headless AI-vs-AI games and report per-card stats so cards can be
 * balanced on real data rather than a single noisy match.
 *  - 1v1: two chosen decks, per-card stats for each.
 *  - Field: one deck vs EVERY other deck (sides alternated), per-card stats aggregated across
 *    the whole field — matchup-averaged, the most robust signal — plus a matchup spread.
 *  - Meta: round-robin every deck vs every other → a win-rate matrix + each deck's overall rate.
 * Pure sim lives in `@engine/sim`; this is the UI + chunked, yielding runner.
 */
import { useState, useEffect, useRef } from 'react';
import { useContent } from '@ui/useContent';
import { isCustomDeck } from '@cards/store';
import { simulateGame, playHeroGame, accHeroPlays, type CardAgg } from '@engine/sim';
import { CardDetail, type Detail } from '@ui/App';
import type { Deck } from '@cards/schema';

type Mode = '1v1' | 'field' | 'meta';
type SortKey = 'winRate' | 'playRate' | 'damage' | 'name';
interface CardRow { cardId: string; name: string; inDeck: number; playRate: number; avgCopies: number; avgDmg: number; winRate: number | null }

interface StatAccum {
  games: number; wins: number;
  totalTurns: number;
  totalTurnsWin: number;  // turns sum for games this deck won
  totalTurnsLoss: number; // turns sum for games this deck lost
  hpWinSum: number;       // own HP at game end, summed over wins
  handSizeSum: number;    // hand size at game end (all games)
  bankedSum: number;      // banked energy at game end (all games)
}
const blankAccum = (): StatAccum => ({ games: 0, wins: 0, totalTurns: 0, totalTurnsWin: 0, totalTurnsLoss: 0, hpWinSum: 0, handSizeSum: 0, bankedSum: 0 });
const accumGame = (a: StatAccum, won: boolean, turns: number, ownHp: number, handSize: number, banked: number) => {
  a.games += 1; a.totalTurns += turns;
  if (won) { a.wins += 1; a.hpWinSum += ownHp; a.totalTurnsWin += turns; }
  else { a.totalTurnsLoss += turns; }
  a.handSizeSum += handSize; a.bankedSum += banked;
};

const pct = (n: number): string => `${Math.round(n * 100)}%`;
const aggMap = (deck: Deck): Map<string, CardAgg> => {
  const m = new Map<string, CardAgg>();
  for (const e of deck.cards) m.set(e.cardId, { cardId: e.cardId, inDeck: e.count, gamesPlayedIn: 0, totalCopies: 0, winsWhenPlayed: 0, attackOut: 0 });
  return m;
};
/** Column label for the meta matrix: the archetype in parentheses, or the full name if absent. */
const archetype = (name: string): string => name.match(/\(([^)]+)\)/)?.[1] ?? name;

const f1 = (n: number) => n.toFixed(1);

function buildCopyText(
  mode: Mode,
  oneVone: null | { games: number; wins: [number, number]; rows: [CardRow[], CardRow[]]; stats: [StatAccum, StatAccum] },
  field: null | { hero: string; total: number; wins: number; matchups: { opponent: string; games: number; wins: number; avgTurns: number; avgWinnerHp: number }[]; rows: CardRow[]; stats: StatAccum },
  meta: null | { decks: string[]; gamesPer: number; matrix: number[][]; overall: number[]; deckStats: StatAccum[]; turnsMatrix: number[][] },
): string {
  const lines: string[] = [];
  if (mode === '1v1' && oneVone) {
    const [nA, nB] = ['Deck A', 'Deck B'];
    lines.push(`=== 1v1 · ${oneVone.games} games ===`);
    lines.push(`Win%\t${nA}: ${pct(oneVone.wins[0] / oneVone.games)}\t${nB}: ${pct(oneVone.wins[1] / oneVone.games)}`);
    lines.push('');
    lines.push('Game Stats\tDeck A\tDeck B');
    const s = oneVone.stats;
    lines.push(`Avg rounds\t${s[0].games ? f1(s[0].totalTurns / s[0].games / 2) : '—'}\t${s[1].games ? f1(s[1].totalTurns / s[1].games / 2) : '—'}`);
    lines.push(`HP (win)\t${s[0].wins ? f1(s[0].hpWinSum / s[0].wins) : '—'}\t${s[1].wins ? f1(s[1].hpWinSum / s[1].wins) : '—'}`);
    lines.push(`Hand (end)\t${s[0].games ? f1(s[0].handSizeSum / s[0].games) : '—'}\t${s[1].games ? f1(s[1].handSizeSum / s[1].games) : '—'}`);
    lines.push(`Banked (end)\t${s[0].games ? f1(s[0].bankedSum / s[0].games) : '—'}\t${s[1].games ? f1(s[1].bankedSum / s[1].games) : '—'}`);
    for (const [side, name] of [[0, nA], [1, nB]] as [0 | 1, string][]) {
      lines.push(''); lines.push(`--- ${name} cards ---`);
      lines.push('Card\t#\tPlay%\tAvg\tDmg\tWin%');
      for (const r of oneVone.rows[side]) lines.push(`${r.name}\t${r.inDeck}\t${pct(r.playRate)}\t${r.avgCopies.toFixed(1)}\t${r.avgDmg >= 0.05 ? r.avgDmg.toFixed(1) : '—'}\t${r.winRate === null ? '—' : pct(r.winRate)}`);
    }
  } else if (mode === 'field' && field) {
    lines.push(`=== ${field.hero} vs Field · ${field.total} games ===`);
    lines.push(`Overall win%: ${pct(field.wins / field.total)}`);
    lines.push('');
    lines.push('Game Stats');
    const s = field.stats;
    lines.push(`Avg rounds: ${s.games ? f1(s.totalTurns / s.games / 2) : '—'}`);
    lines.push(`HP (win): ${s.wins ? f1(s.hpWinSum / s.wins) : '—'}`);
    lines.push(`Hand (end): ${s.games ? f1(s.handSizeSum / s.games) : '—'}`);
    lines.push(`Banked (end): ${s.games ? f1(s.bankedSum / s.games) : '—'}`);
    lines.push(''); lines.push('Matchups');
    lines.push('Opponent\tWin%\tRounds\tHP (win)');
    for (const m of [...field.matchups].sort((a, b) => b.wins / b.games - a.wins / a.games))
      lines.push(`${m.opponent}\t${pct(m.wins / m.games)}\t${f1(m.avgTurns / 2)}\t${m.wins > 0 ? f1(m.avgWinnerHp) : '—'}`);
    lines.push(''); lines.push(`--- ${field.hero} cards ---`);
    lines.push('Card\t#\tPlay%\tAvg\tDmg\tWin%');
    for (const r of field.rows) lines.push(`${r.name}\t${r.inDeck}\t${pct(r.playRate)}\t${r.avgCopies.toFixed(1)}\t${r.avgDmg >= 0.05 ? r.avgDmg.toFixed(1) : '—'}\t${r.winRate === null ? '—' : pct(r.winRate)}`);
  } else if (mode === 'meta' && meta) {
    const order = meta.decks.map((_, i) => i).sort((a, b) => meta.overall[b]! - meta.overall[a]!);
    const names = order.map((i) => archetype(meta.decks[i]!));
    lines.push(`=== Meta Matrix · ${meta.gamesPer} games/matchup ===`);
    lines.push(['Deck', ...names, 'Field'].join('\t'));
    for (const i of order) {
      const cells = order.map((j) => i === j ? '—' : pct(meta.matrix[i]![j]! / meta.gamesPer));
      lines.push([meta.decks[i], ...cells, pct(meta.overall[i]!)].join('\t'));
    }
    lines.push(''); lines.push('=== Deck Game Stats ===');
    lines.push('Deck\tAvg rounds\tRounds (win)\tRounds (loss)\tHP (win)\tHand (end)\tBanked (end)');
    for (const i of order) {
      const s = meta.deckStats[i]!;
      const losses = s.games - s.wins;
      lines.push([
        meta.decks[i],
        s.games ? f1(s.totalTurns / s.games / 2) : '—',
        s.wins ? f1(s.totalTurnsWin / s.wins / 2) : '—',
        losses ? f1(s.totalTurnsLoss / losses / 2) : '—',
        s.wins ? f1(s.hpWinSum / s.wins) : '—',
        s.games ? f1(s.handSizeSum / s.games) : '—',
        s.games ? f1(s.bankedSum / s.games) : '—',
      ].join('\t'));
    }
    lines.push(''); lines.push('=== Avg Rounds per Matchup ===');
    lines.push(['Deck', ...names].join('\t'));
    for (const i of order) {
      const cells = order.map((j) => i === j ? '—' : f1(meta.turnsMatrix[i]![j]! / 2));
      lines.push([meta.decks[i], ...cells].join('\t'));
    }
  }
  return lines.join('\n');
}

export function BalanceLab() {
  const { registry, decks: allDecks } = useContent();
  const decks = allDecks; // 1v1 and Field include custom decks; Meta uses starterDecks only (see metaDecks below)
  const metaDecks = allDecks.filter((d) => !isCustomDeck(d.name));
  const [mode, setMode] = useState<Mode>('1v1');
  const [deckAName, setDeckAName] = useState(decks[0]?.name ?? '');
  const [deckBName, setDeckBName] = useState(decks[1]?.name ?? decks[0]?.name ?? '');
  const [games, setGames] = useState(50);
  const [gamesPer, setGamesPer] = useState(10);
  const resetTimer = () => setElapsed(null);
  const [running, setRunning] = useState(false);
  // The AI policy the sims use. Default to the full turn-planning AI (beam + lethal + opponent
  // reply) so the lab reflects how the game actually plays; the fast greedy 1-ply is opt-in.
  const [usePlan, setUsePlan] = useState(true);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [sortBy, setSortBy] = useState<SortKey>('winRate');
  const [detailId, setDetailId] = useState<string | null>(null);

  const [oneVone, setOneVone] = useState<null | { games: number; wins: [number, number]; heroPowers: [number, number]; rows: [CardRow[], CardRow[]]; stats: [StatAccum, StatAccum] }>(null);
  const [field, setField] = useState<null | { hero: string; total: number; wins: number; heroPowers: number; matchups: { opponent: string; games: number; wins: number; avgTurns: number; avgWinnerHp: number }[]; rows: CardRow[]; stats: StatAccum }>(null);
  const [meta, setMeta] = useState<null | { decks: string[]; gamesPer: number; matrix: number[][]; overall: number[]; deckStats: StatAccum[]; turnsMatrix: number[][] }>(null);
  const [simError, setSimError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    if (running) {
      startTimeRef.current = Date.now();
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000)), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [running]);

  const fmtElapsed = (s: number) => s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;

  const nameOf = (id: string) => registry.cards.get(id)?.name ?? id;
  const detail: Detail | null = detailId && registry.cards.get(detailId) ? { kind: 'card', card: registry.cards.get(detailId)! } : null;
  const rowsFrom = (agg: Map<string, CardAgg>, totalGames: number): CardRow[] =>
    [...agg.values()].map((a) => ({
      cardId: a.cardId, name: nameOf(a.cardId), inDeck: a.inDeck,
      playRate: a.gamesPlayedIn / totalGames, avgCopies: a.totalCopies / totalGames,
      avgDmg: a.gamesPlayedIn ? a.attackOut / a.gamesPlayedIn : 0,
      winRate: a.gamesPlayedIn ? a.winsWhenPlayed / a.gamesPlayedIn : null,
    }));

  const run1v1 = async () => {
    const dA = decks.find((d) => d.name === deckAName);
    const dB = decks.find((d) => d.name === deckBName);
    if (!dA || !dB) return;
    setRunning(true); setOneVone(null); setField(null); setMeta(null); setSimError(null); setProgress({ done: 0, total: games });
    const aggs: [Map<string, CardAgg>, Map<string, CardAgg>] = [aggMap(dA), aggMap(dB)];
    const wins: [number, number] = [0, 0];
    const heroPowers: [number, number] = [0, 0];
    const stats: [StatAccum, StatAccum] = [blankAccum(), blankAccum()];
    try {
      for (let i = 0; i < games; i++) {
        const r = simulateGame(registry, [dA, dB], i + 1, usePlan);
        wins[r.winner] += 1;
        heroPowers[0] += r.heroPowers[0]; heroPowers[1] += r.heroPowers[1];
        accHeroPlays(aggs[0], r.winner === 0, r.played[0], r.damageByCard[0]);
        accHeroPlays(aggs[1], r.winner === 1, r.played[1], r.damageByCard[1]);
        for (const s of [0, 1] as const) accumGame(stats[s], r.winner === s, r.turns, r.finalHp[s], r.finalHandSize[s], r.finalBanked[s]);
        setProgress({ done: i + 1, total: games });
        await new Promise((res) => setTimeout(res, 0));
      }
      setOneVone({ games, wins, heroPowers, rows: [rowsFrom(aggs[0], games), rowsFrom(aggs[1], games)], stats });
    } catch (e) {
      setSimError(`Game crashed: ${(e as Error).message}`);
    }
    setRunning(false);
  };

  const runField = async () => {
    const hero = decks.find((d) => d.name === deckAName);
    if (!hero) return;
    const opponents = decks.filter((d) => d.name !== hero.name);
    const total = opponents.length * gamesPer;
    setRunning(true); setOneVone(null); setField(null); setMeta(null); setSimError(null); setProgress({ done: 0, total });
    const agg = aggMap(hero);
    const matchups: { opponent: string; games: number; wins: number; avgTurns: number; avgWinnerHp: number }[] = [];
    const deckStats = blankAccum();
    let done = 0, totalWins = 0, totalHeroPowers = 0;
    try {
      for (const opp of opponents) {
        let wins = 0, turnSum = 0, winHpSum = 0;
        for (let i = 0; i < gamesPer; i++) {
          const r = playHeroGame(registry, hero, opp, (i % 2) as 0 | 1, done + 1, usePlan);
          const { heroWon, heroPlayed, heroDamage, heroPowers, turns, finalHp, finalHandSize, finalBanked } = r;
          const heroSide = (i % 2) as 0 | 1;
          if (heroWon) { wins += 1; totalWins += 1; winHpSum += finalHp[heroSide]; }
          totalHeroPowers += heroPowers;
          turnSum += turns;
          accHeroPlays(agg, heroWon, heroPlayed, heroDamage);
          accumGame(deckStats, heroWon, turns, finalHp[heroSide], finalHandSize[heroSide], finalBanked[heroSide]);
          done += 1;
          setProgress({ done, total });
          await new Promise((res) => setTimeout(res, 0));
        }
        matchups.push({ opponent: opp.name, games: gamesPer, wins, avgTurns: turnSum / gamesPer, avgWinnerHp: wins ? winHpSum / wins : 0 });
      }
      setField({ hero: hero.name, total, wins: totalWins, heroPowers: totalHeroPowers, matchups, rows: rowsFrom(agg, total), stats: deckStats });
    } catch (e) {
      setSimError(`Game crashed (vs ${matchups.length < opponents.length ? opponents[matchups.length]?.name ?? '?' : '?'}): ${(e as Error).message}`);
    }
    setRunning(false);
  };

  const runMeta = async () => {
    const decks = metaDecks;
    const n = decks.length;
    const total = (n * (n - 1) / 2) * gamesPer;
    setRunning(true); setOneVone(null); setField(null); setMeta(null); setSimError(null); setProgress({ done: 0, total });
    const matrix = Array.from({ length: n }, () => Array<number>(n).fill(0));
    const turnsMatrix = Array.from({ length: n }, () => Array<number>(n).fill(0));
    const deckStats: StatAccum[] = Array.from({ length: n }, blankAccum);
    let seed = 1, done = 0;
    let crashLabel = '';
    try {
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          crashLabel = `${decks[i]!.name} vs ${decks[j]!.name}`;
          let iWins = 0, turnSum = 0;
          for (let g = 0; g < gamesPer; g++) {
            const heroSide = (g % 2) as 0 | 1;
            const r = playHeroGame(registry, decks[i]!, decks[j]!, heroSide, seed++, usePlan);
            if (r.heroWon) iWins += 1;
            turnSum += r.turns;
            // Accumulate stats for both decks in this matchup.
            accumGame(deckStats[i]!, r.heroWon, r.turns, r.finalHp[heroSide], r.finalHandSize[heroSide], r.finalBanked[heroSide]);
            const oppSide = (1 - heroSide) as 0 | 1;
            accumGame(deckStats[j]!, !r.heroWon, r.turns, r.finalHp[oppSide], r.finalHandSize[oppSide], r.finalBanked[oppSide]);
            done += 1;
            if (done % 8 === 0) { setProgress({ done, total }); await new Promise((res) => setTimeout(res, 0)); }
          }
          matrix[i]![j] = iWins;
          matrix[j]![i] = gamesPer - iWins;
          turnsMatrix[i]![j] = turnsMatrix[j]![i] = turnSum / gamesPer;
        }
      }
      const overall = matrix.map((row, i) => {
        let w = 0, g = 0;
        for (let j = 0; j < n; j++) { if (j === i) continue; w += row[j]!; g += gamesPer; }
        return g ? w / g : 0;
      });
      setProgress({ done: total, total });
      setMeta({ decks: decks.map((d) => d.name), gamesPer, matrix, overall, deckStats, turnsMatrix });
    } catch (e) {
      setSimError(`Game crashed (${crashLabel}): ${(e as Error).message}`);
    }
    setRunning(false);
  };

  const onRun = mode === '1v1' ? run1v1 : mode === 'field' ? runField : runMeta;

  const sortRows = (rows: CardRow[]): CardRow[] =>
    [...rows].sort((a, b) =>
      sortBy === 'name' ? a.name.localeCompare(b.name)
      : sortBy === 'damage' ? b.avgDmg - a.avgDmg || a.name.localeCompare(b.name)
      : sortBy === 'playRate' ? b.playRate - a.playRate || a.name.localeCompare(b.name)
      : (b.winRate ?? -1) - (a.winRate ?? -1) || a.name.localeCompare(b.name));

  const result = oneVone || field || meta;

  const totalGames = (() => {
    const n = metaDecks.length;
    if (mode === '1v1') return games;
    if (mode === 'field') return (decks.length - 1) * gamesPer;
    return (n * (n - 1) / 2) * gamesPer;
  })();
  const secsPerGame = usePlan ? 12 : 0.35;
  const estSecs = Math.round(totalGames * secsPerGame);
  const estTime = estSecs < 60 ? `~${estSecs}s` : `~${Math.floor(estSecs / 60)}m ${estSecs % 60}s`;

  const copyStats = () => {
    const text = buildCopyText(mode, oneVone, field, meta);
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="lab">
      <div className="lab__head">
        <h2>⚗ Balance Lab</h2>
        <p className="muted">Simulate AI-vs-AI games and see which cards correlate with winning. Cards never played, or with a low win rate when played, are candidates to buff; over-performers to nerf. <b>Field</b> gives the most robust per-card signal; <b>Meta</b> ranks every deck against every other.</p>
      </div>

      <div className="lab__controls">
        <div className="lab__modes">
          {(['1v1', 'field', 'meta'] as Mode[]).map((m) => (
            <button key={m} className={mode === m ? 'chipbtn chipbtn--on' : 'chipbtn'} onClick={() => setMode(m)}>{m === '1v1' ? '⚔ 1v1' : m === 'field' ? '⬡ vs Field' : '✦ Meta'}</button>
          ))}
        </div>
        {mode !== 'meta' && (
          <label className="fld"><span>{mode === 'field' ? 'Deck' : 'Deck A'}</span>
            <select value={deckAName} onChange={(e) => setDeckAName(e.target.value)}>{decks.map((d) => <option key={d.name} value={d.name}>{d.name}</option>)}</select>
          </label>
        )}
        {mode === '1v1' && (
          <>
            <span className="lab__vs">vs</span>
            <label className="fld"><span>Deck B</span>
              <select value={deckBName} onChange={(e) => setDeckBName(e.target.value)}>{decks.map((d) => <option key={d.name} value={d.name}>{d.name}</option>)}</select>
            </label>
            <label className="fld"><span>Games</span>
              <input type="number" min={1} max={10000} value={games} onChange={(e) => { setGames(Math.max(1, Number(e.target.value))); resetTimer(); }} style={{ width: '5rem' }} />
            </label>
          </>
        )}
        {mode !== '1v1' && (
          <label className="fld"><span>Games / matchup</span>
            <input type="number" min={1} max={1000} value={gamesPer} onChange={(e) => { setGamesPer(Math.max(1, Number(e.target.value))); resetTimer(); }} style={{ width: '5rem' }} />
          </label>
        )}
        <label className="fld"><span>AI</span>
          <select value={usePlan ? 'plan' : 'greedy'} onChange={(e) => setUsePlan(e.target.value === 'plan')} disabled={running}
            title="Planning = full turn search (beam + lethal + opponent reply), how the game really plays but slower. Greedy = fast 1-ply, for quick rough reads.">
            <option value="plan">❈ Planning (accurate)</option>
            <option value="greedy">↯ Greedy (fast)</option>
          </select>
        </label>
        <button className="btn-end" onClick={onRun} disabled={running}>
          {running ? `Running… ${progress.done}/${progress.total}` : '▶ Run'}
        </button>
        {running && elapsed !== null && (
          <span className="muted" style={{ fontSize: '0.85em' }}>⏱ {fmtElapsed(elapsed)}</span>
        )}
        {!running && elapsed !== null && result && (
          <span className="muted" style={{ fontSize: '0.85em' }}>✓ {fmtElapsed(elapsed)} · {totalGames} games</span>
        )}
        {!running && elapsed === null && (
          <span className="muted" style={{ fontSize: '0.85em' }}>{estTime} est · {totalGames} games</span>
        )}
        {result && !running && (
          <button className="btn-end" onClick={copyStats} title="Copy all stats as tab-separated text">
            {copied ? '✓ Copied' : '⧉ Copy stats'}
          </button>
        )}
        {result && mode !== 'meta' && (
          <label className="fld"><span>Sort cards</span>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortKey)}>
              <option value="winRate">Win % (when played)</option>
              <option value="playRate">Play rate</option>
              <option value="damage">Damage / game</option>
              <option value="name">Name</option>
            </select>
          </label>
        )}
      </div>

      {simError && <div className="lab__error">⚠ {simError}</div>}
      {running && <div className="lab__bar"><div className="lab__barfill" style={{ width: pct(progress.total ? progress.done / progress.total : 0) }} /></div>}

      {oneVone && (
        <>
          <div className="lab__summary">
            <span className="lab__wr"><b>{deckAName}</b> {pct(oneVone.wins[0] / oneVone.games)}</span>
            <span className="muted">vs</span>
            <span className="lab__wr"><b>{deckBName}</b> {pct(oneVone.wins[1] / oneVone.games)}</span>
            <span className="muted">· {oneVone.games} games</span>
          </div>
          <GameStatsPanel names={[deckAName, deckBName]} stats={oneVone.stats} games={oneVone.games} />
          <div className="lab__decks">
            {([0, 1] as const).map((side) => (
              <div key={side} className="lab__deck">
                <h3>{side === 0 ? deckAName : deckBName} <span className="muted">({pct(oneVone.wins[side] / oneVone.games)} win · {(oneVone.heroPowers[side] / oneVone.games).toFixed(1)} skills/game)</span></h3>
                <CardTable rows={sortRows(oneVone.rows[side])} onPick={setDetailId} />
              </div>
            ))}
          </div>
        </>
      )}

      {field && (
        <>
          <div className="lab__summary">
            <span className="lab__wr"><b>{field.hero}</b> vs the field: {pct(field.wins / field.total)}</span>
            <span className="muted">· {field.matchups.length} opponents · {field.total} games · {(field.heroPowers / field.total).toFixed(1)} skills/game</span>
          </div>
          <GameStatsPanel names={[field.hero]} stats={[field.stats]} games={field.total} />
          <div className="lab__decks">
            <div className="lab__deck">
              <h3>Matchups</h3>
              <table className="lab__table">
                <thead><tr><th>Opponent</th><th>Win%</th><th title="Average game length in rounds">Rounds</th><th title="Hero's average HP remaining in wins">HP (win)</th></tr></thead>
                <tbody>
                  {[...field.matchups].sort((a, b) => b.wins / b.games - a.wins / a.games).map((m) => (
                    <tr key={m.opponent}>
                      <td className="lab__name">{m.opponent}</td>
                      <td className={m.wins / m.games >= 0.55 ? 'lab__good' : m.wins / m.games <= 0.45 ? 'lab__bad' : ''}>{pct(m.wins / m.games)}</td>
                      <td className="muted">{(m.avgTurns / 2).toFixed(1)}</td>
                      <td>{m.wins > 0 ? m.avgWinnerHp.toFixed(1) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="lab__deck">
              <h3>{field.hero} cards <span className="muted">(across the field)</span></h3>
              <CardTable rows={sortRows(field.rows)} onPick={setDetailId} />
            </div>
          </div>
        </>
      )}

      {meta && <MetaMatrix meta={meta} />}

      {detail && <CardDetail detail={detail} onClose={() => setDetailId(null)} />}
    </div>
  );
}

function GameStatsPanel({ names, stats, games }: { names: string[]; stats: StatAccum[]; games: number }) {
  const fmt = (n: number) => n.toFixed(1);
  const avgRounds = (s: StatAccum) => s.games ? fmt(s.totalTurns / s.games / 2) : '—';
  const avgHpWin = (s: StatAccum) => s.wins ? fmt(s.hpWinSum / s.wins) : '—';
  const avgHand = (s: StatAccum) => s.games ? fmt(s.handSizeSum / s.games) : '—';
  const avgBanked = (s: StatAccum) => s.games ? fmt(s.bankedSum / s.games) : '—';
  return (
    <div className="lab__gamestats">
      <table className="lab__table">
        <thead>
          <tr>
            <th>Deck</th>
            <th title="Average game length in rounds">Avg rounds</th>
            <th title="Average leader HP remaining when this deck wins">HP (win)</th>
            <th title="Average cards in hand at game end">Hand (end)</th>
            <th title="Average total element energy banked at game end">Banked (end)</th>
          </tr>
        </thead>
        <tbody>
          {names.map((name, i) => {
            const s = stats[i]!;
            const hp = s.wins ? s.hpWinSum / s.wins : null;
            return (
              <tr key={name}>
                <td className="lab__name">{name}</td>
                <td className="muted">{avgRounds(s)}</td>
                <td className={hp !== null ? (hp >= 15 ? 'lab__good' : hp <= 8 ? 'lab__bad' : '') : ''}>{avgHpWin(s)}</td>
                <td>{avgHand(s)}</td>
                <td>{avgBanked(s)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="muted" style={{ fontSize: '0.8em', margin: '0.25rem 0 0' }}>{games} games · HP (win) coloured green ≥ 15, red ≤ 8</p>
    </div>
  );
}

function MetaMatrix({ meta }: { meta: { decks: string[]; gamesPer: number; matrix: number[][]; overall: number[]; deckStats: StatAccum[]; turnsMatrix: number[][] } }) {
  const order = meta.decks.map((_, i) => i).sort((a, b) => meta.overall[b]! - meta.overall[a]!);
  const cellCls = (r: number) => r >= 0.55 ? 'lab__good' : r <= 0.45 ? 'lab__bad' : '';
  return (
    <div className="lab__deck lab__meta">
      <h3>Meta matrix <span className="muted">(row deck's win % vs column deck · {meta.gamesPer} games each · sorted by overall)</span></h3>
      <div className="lab__metascroll">
        <table className="lab__table lab__matrix">
          <thead>
            <tr>
              <th className="lab__matcorner">Deck</th>
              {order.map((j) => <th key={j} title={meta.decks[j]}>{archetype(meta.decks[j]!)}</th>)}
              <th title="Win rate across the whole field">Field</th>
            </tr>
          </thead>
          <tbody>
            {order.map((i) => (
              <tr key={i}>
                <td className="lab__name">{meta.decks[i]}</td>
                {order.map((j) => {
                  if (i === j) return <td key={j} className="lab__matdiag">—</td>;
                  const r = meta.matrix[i]![j]! / meta.gamesPer;
                  const avgRounds = (meta.turnsMatrix[i]![j]! / 2).toFixed(1);
                  return <td key={j} className={cellCls(r)} title={`${meta.decks[i]} vs ${meta.decks[j]}: ${meta.matrix[i]![j]}/${meta.gamesPer} · avg ${avgRounds} rounds`}>{pct(r)}</td>;
                })}
                <td className={`lab__matfield ${cellCls(meta.overall[i]!)}`}>{pct(meta.overall[i]!)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3 style={{ marginTop: '1.5rem' }}>Deck game stats <span className="muted">(aggregated across all matchups)</span></h3>
      <div className="lab__metascroll">
        <table className="lab__table">
          <thead>
            <tr>
              <th>Deck</th>
              <th title="Average game length in rounds">Avg rounds</th>
              <th title="Average rounds when this deck wins">Rounds (win)</th>
              <th title="Average rounds when this deck loses">Rounds (loss)</th>
              <th title="Average leader HP remaining when this deck wins">HP (win)</th>
              <th title="Average cards in hand at game end">Hand size</th>
              <th title="Average total element energy banked at game end">Banked</th>
            </tr>
          </thead>
          <tbody>
            {order.map((i) => {
              const s = meta.deckStats[i]!;
              const losses = s.games - s.wins;
              const fmt = (n: number) => n.toFixed(1);
              const avgHpWin = s.wins ? s.hpWinSum / s.wins : null;
              return (
                <tr key={i}>
                  <td className="lab__name">{meta.decks[i]}</td>
                  <td className="muted">{s.games ? fmt(s.totalTurns / s.games / 2) : '—'}</td>
                  <td>{s.wins ? fmt(s.totalTurnsWin / s.wins / 2) : '—'}</td>
                  <td>{losses ? fmt(s.totalTurnsLoss / losses / 2) : '—'}</td>
                  <td className={avgHpWin !== null ? (avgHpWin >= 15 ? 'lab__good' : avgHpWin <= 8 ? 'lab__bad' : '') : ''}>{avgHpWin !== null ? fmt(avgHpWin) : '—'}</td>
                  <td>{s.games ? fmt(s.handSizeSum / s.games) : '—'}</td>
                  <td>{s.games ? fmt(s.bankedSum / s.games) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CardTable({ rows, onPick }: { rows: CardRow[]; onPick: (cardId: string) => void }) {
  const pc = (n: number) => `${Math.round(n * 100)}%`;
  return (
    <table className="lab__table">
      <thead><tr><th>Card</th><th title="Copies in the decklist">#</th><th title="Share of games it was played at least once">Play%</th><th title="Average copies played per game">Avg</th><th title="Average combat damage dealt per game it was played">Dmg</th><th title="Win rate of games where it was played">Win%</th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.cardId} className={r.playRate === 0 ? 'lab__dead' : ''}>
            <td className="lab__name"><button type="button" className="lab__cardbtn" onClick={() => onPick(r.cardId)} title="Show card details">{r.name}</button></td>
            <td>{r.inDeck}</td>
            <td>{pc(r.playRate)}</td>
            <td>{r.avgCopies.toFixed(1)}</td>
            <td>{r.avgDmg >= 0.05 ? r.avgDmg.toFixed(1) : '—'}</td>
            <td className={r.winRate === null ? 'muted' : r.winRate >= 0.55 ? 'lab__good' : r.winRate <= 0.45 ? 'lab__bad' : ''}>
              {r.winRate === null ? '—' : pc(r.winRate)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
