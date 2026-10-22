import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { byOpponent, fetchMatchHistory, pct, practiceStats, seconds, vsSummary, type MatchRecord } from '../lib/gameStats';
import { GAMES, gameById } from '../games/registry';
import { BarChart } from './Charts';
import { IconClose, IconStats } from './Icons';

function useMatchHistory() {
  const [matches, setMatches] = useState<MatchRecord[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    fetchMatchHistory()
      .then(setMatches)
      .catch((e) => {
        setError(navigator.onLine ? (e as Error).message : 'Vs results need a connection.');
        setMatches([]);
      });
  }, []);
  return { matches, error };
}

function Tile({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="stat">
      <div className="value" style={{ fontSize: 22 }}>{value}</div>
      <div className="label">{label}</div>
    </div>
  );
}

/** Wins / ties / losses as one bar, with the counts written out. */
function RecordBar({ wins, ties, losses }: { wins: number; ties: number; losses: number }) {
  const total = wins + ties + losses || 1;
  return (
    <div>
      <div className="stacked" role="img" aria-label={`${wins} wins, ${ties} ties, ${losses} losses`}>
        {wins > 0 && <div style={{ flex: wins / total, background: 'var(--right)' }} />}
        {ties > 0 && <div style={{ flex: ties / total, background: 'var(--b-new)' }} />}
        {losses > 0 && <div style={{ flex: losses / total, background: 'var(--wrong)' }} />}
      </div>
      <div className="small muted" style={{ marginTop: 4 }}>
        {wins} W · {losses} L{ties ? ` · ${ties} T` : ''}
      </div>
    </div>
  );
}

/** A labelled horizontal bar (0..1). */
function MeterRow({ label, value, detail }: { label: string; value: number | null; detail: string }) {
  return (
    <div style={{ marginTop: 10 }}>
      <div className="spread small" style={{ marginBottom: 4 }}>
        <strong>{label}</strong>
        <span className="muted">{detail}</span>
      </div>
      <div className="meter" style={{ width: '100%', height: 8 }}>
        <div style={{ width: `${(value ?? 0) * 100}%`, background: 'var(--bar)' }} />
      </div>
    </div>
  );
}

function HeadToHead({ matches }: { matches: MatchRecord[] }) {
  const rivals = byOpponent(matches);
  if (!rivals.length) return <p className="small muted">No vs matches yet.</p>;
  return (
    <ul className="list">
      {rivals.map((r) => {
        const ahead = r.wins > r.losses ? 'You lead' : r.losses > r.wins ? `${r.opponent} leads` : 'Even';
        return (
          <li key={r.opponentId}>
            <div className="spread" style={{ marginBottom: 6 }}>
              <strong>{r.opponent}</strong>
              <span className="small" style={{ color: r.wins > r.losses ? 'var(--right)' : r.losses > r.wins ? 'var(--wrong)' : 'var(--muted)', fontWeight: 600 }}>{ahead}</span>
            </div>
            <RecordBar wins={r.wins} ties={r.ties} losses={r.losses} />
            <div className="small muted" style={{ marginTop: 2 }}>
              Avg score {r.avgScore?.toFixed(1)} vs {r.avgOpponentScore?.toFixed(1)} · avg time {seconds(r.avgMs)}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function GameStatsPanel({ gameId, onClose }: { gameId: string; onClose: () => void }) {
  const game = gameById(gameId);
  const rounds = useStore((s) => s.rounds);
  const { matches, error } = useMatchHistory();
  const [tab, setTab] = useState<'practice' | 'vs'>('practice');
  const practice = useMemo(() => practiceStats(rounds, gameId), [rounds, gameId]);
  const recent = useMemo(() => rounds.filter((r) => r.game === gameId && r.mode === 'solo').slice(-40), [rounds, gameId]);
  const gameMatches = (matches ?? []).filter((m) => m.game === gameId);
  const vs = vsSummary(gameMatches);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label={`${game?.title} stats`} onClick={(e) => e.stopPropagation()}>
        <div className="spread" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 20 }}>{game?.title} stats</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><IconClose /></button>
        </div>
        <div className="segmented" style={{ marginBottom: 14 }}>
          <button className={tab === 'practice' ? 'on' : ''} onClick={() => setTab('practice')}>Practice</button>
          <button className={tab === 'vs' ? 'on' : ''} onClick={() => setTab('vs')}>Vs</button>
        </div>
        {tab === 'practice' ? (
          practice.rounds === 0 ? (
            <p className="muted">Play some practice rounds to see your stats.</p>
          ) : (
            <>
              <div className="stat-grid">
                <Tile value={practice.rounds} label="sentences played" />
                <Tile value={pct(practice.accuracy)} label="correct" />
                <Tile value={practice.bestStreak} label="best streak" />
                <Tile value={seconds(practice.avgMs)} label="avg per sentence" />
              </div>
              <div className="section-title">Last {recent.length} answers</div>
              <div className="row wrap" style={{ gap: 4 }}>
                {recent.map((r) => (
                  <span key={r.id} title={`${r.correct ? 'Right' : 'Wrong'} · ${seconds(r.ms)}`} style={{ width: 12, height: 12, borderRadius: 3, background: r.correct ? 'var(--right)' : 'var(--wrong)' }} />
                ))}
              </div>
            </>
          )
        ) : matches === null ? (
          <p className="muted">Loading matches…</p>
        ) : (
          <>
            {error && <div className="banner">{error}</div>}
            {vs.played === 0 ? (
              <p className="muted">No {game?.title} matches yet. Tap Vs on the Games page to play one.</p>
            ) : (
              <>
                <div className="stat-grid">
                  <Tile value={`${vs.wins}-${vs.losses}${vs.ties ? `-${vs.ties}` : ''}`} label="wins-losses" />
                  <Tile value={pct(vs.played ? vs.wins / vs.played : null)} label="win rate" />
                  <Tile value={vs.avgScore?.toFixed(1) ?? '–'} label="avg score" />
                  <Tile value={seconds(vs.avgMs)} label="avg finish time" />
                  <Tile value={vs.bestScore ?? '–'} label="best score" />
                  <Tile value={seconds(vs.fastestPerfectMs)} label="fastest perfect game" />
                </div>
                <div className="section-title">Head to head</div>
                <HeadToHead matches={gameMatches} />
                <div className="section-title">Recent matches</div>
                <ul className="list">
                  {gameMatches.slice(0, 6).map((m) => (
                    <li key={m.id} className="spread small">
                      <span>
                        <strong style={{ color: m.outcome === 'win' ? 'var(--right)' : m.outcome === 'loss' ? 'var(--wrong)' : 'var(--muted)' }}>
                          {m.outcome === 'win' ? 'Won' : m.outcome === 'loss' ? 'Lost' : 'Tie'}
                        </strong>{' '}
                        vs {m.opponent}
                      </span>
                      <span className="muted">
                        {m.myScore}-{m.theirScore} · {seconds(m.myMs)}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** "Stats" button for a game's card on the Games page; opens that game's stats. */
export default function GameStatsButton({ gameId }: { gameId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn ghost sm" onClick={() => setOpen(true)} aria-label="Game stats">
        <IconStats /> Stats
      </button>
      {open && <GameStatsPanel gameId={gameId} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Summary of all games, for the bottom of the Games page. */
export function GameStatsOverview() {
  const rounds = useStore((s) => s.rounds);
  const { matches, error } = useMatchHistory();
  const all = useMemo(() => practiceStats(rounds), [rounds]);
  const vs = vsSummary(matches ?? []);
  const days = useMemo(() => {
    const out: { label: string; value: number; detail: string }[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 13; i >= 0; i--) {
      const start = today.getTime() - i * 86_400_000;
      const n = rounds.filter((r) => {
        const t = Date.parse(r.at);
        return t >= start && t < start + 86_400_000;
      }).length;
      const d = new Date(start);
      out.push({ label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), value: n, detail: `${n} sentences played` });
    }
    return out;
  }, [rounds]);
  const playable = GAMES.filter((g) => !g.comingSoon);

  if (!rounds.length && !(matches ?? []).length) {
    return (
      <>
        <div className="section-title">Your game stats</div>
        <div className="card empty small">Play a game and your stats show up here.</div>
      </>
    );
  }

  return (
    <>
      <div className="section-title">Your game stats</div>
      <div className="stat-grid">
        <Tile value={rounds.length} label="sentences played" />
        <Tile value={pct(all.accuracy)} label="practice accuracy" />
        <Tile value={matches === null ? '…' : `${vs.wins}-${vs.losses}`} label="vs wins-losses" />
        <Tile value={matches === null ? '…' : pct(vs.played ? vs.wins / vs.played : null)} label="vs win rate" />
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <strong className="small">Practice accuracy by game</strong>
        {playable.map((g) => {
          const s = practiceStats(rounds, g.id);
          return <MeterRow key={g.id} label={g.title} value={s.accuracy} detail={s.rounds ? `${pct(s.accuracy)} of ${s.rounds} · ${seconds(s.avgMs)} each` : 'not played'} />;
        })}
      </div>

      {matches && matches.length > 0 && (
        <>
          <div className="card" style={{ marginTop: 12 }}>
            <strong className="small">Vs record by game</strong>
            {playable.map((g) => {
              const s = vsSummary(matches.filter((m) => m.game === g.id));
              if (!s.played) return null;
              return (
                <div key={g.id} style={{ marginTop: 10 }}>
                  <div className="small" style={{ fontWeight: 600, marginBottom: 4 }}>{g.title}</div>
                  <RecordBar wins={s.wins} ties={s.ties} losses={s.losses} />
                </div>
              );
            })}
          </div>
          <div className="card" style={{ marginTop: 12 }}>
            <strong className="small">Rivals (all games)</strong>
            <HeadToHead matches={matches} />
          </div>
        </>
      )}
      {error && <div className="banner" style={{ marginTop: 12 }}>{error}</div>}

      <div className="card" style={{ marginTop: 12 }}>
        <strong className="small">Sentences played, last 14 days</strong>
        <BarChart data={days} height={90} xLabels={(i) => (i === 0 ? '2 wks ago' : i === 13 ? 'Today' : null)} />
      </div>
    </>
  );
}
