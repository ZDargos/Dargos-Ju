import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../lib/store';
import { byOpponent, fetchMatchHistory, matchesFor, pct, practiceStats, roundsFor, seconds, vsSummary, type MatchRecord } from '../lib/gameStats';
import { GAMES, gameById } from '../games/registry';
import { useT, useUiLang } from '../i18n';
import { BarChart } from './Charts';
import { IconClose, IconStats } from './Icons';

// Game stats are shown for the current learning mode only.

function useMatchHistory() {
  const t = useT();
  const lang = useStore((s) => s.settings.learning);
  const [all, setAll] = useState<MatchRecord[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    fetchMatchHistory()
      .then(setAll)
      .catch((e) => {
        setError(navigator.onLine ? (e as Error).message : t('Vs results need a connection.'));
        setAll([]);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return { matches: all ? matchesFor(all, lang) : null, error };
}

function useModeRounds() {
  const rounds = useStore((s) => s.rounds);
  const lang = useStore((s) => s.settings.learning);
  return useMemo(() => roundsFor(rounds, lang), [rounds, lang]);
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
  const t = useT();
  const total = wins + ties + losses || 1;
  const text = t('{w} won · {l} lost', { w: wins, l: losses }) + (ties ? ` · ${t('{n} tied', { n: ties })}` : '');
  return (
    <div>
      <div className="stacked" role="img" aria-label={text}>
        {wins > 0 && <div style={{ flex: wins / total, background: 'var(--right)' }} />}
        {ties > 0 && <div style={{ flex: ties / total, background: 'var(--b-new)' }} />}
        {losses > 0 && <div style={{ flex: losses / total, background: 'var(--wrong)' }} />}
      </div>
      <div className="small muted" style={{ marginTop: 4 }} aria-hidden>{text}</div>
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
      <div className="meter" style={{ width: '100%', height: 8 }} aria-hidden>
        <div style={{ width: `${(value ?? 0) * 100}%`, background: 'var(--bar)' }} />
      </div>
    </div>
  );
}

function HeadToHead({ matches }: { matches: MatchRecord[] }) {
  const t = useT();
  const rivals = byOpponent(matches);
  if (!rivals.length) return <p className="small muted">{t('No vs matches yet.')}</p>;
  return (
    <ul className="list">
      {rivals.map((r) => {
        const ahead = r.wins > r.losses ? t('You lead') : r.losses > r.wins ? t('{name} leads', { name: r.opponent }) : t('Even');
        return (
          <li key={r.opponentId}>
            <div className="spread" style={{ marginBottom: 6 }}>
              <strong>{r.opponent}</strong>
              <span className="small" style={{ color: r.wins > r.losses ? 'var(--right)' : r.losses > r.wins ? 'var(--wrong)' : 'var(--muted)', fontWeight: 600 }}>{ahead}</span>
            </div>
            <RecordBar wins={r.wins} ties={r.ties} losses={r.losses} />
            <div className="small muted" style={{ marginTop: 2 }}>
              {t('Avg score {mine} vs {theirs} · avg time {time}', { mine: r.avgScore?.toFixed(1) ?? '–', theirs: r.avgOpponentScore?.toFixed(1) ?? '–', time: seconds(r.avgMs) })}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function GameStatsPanel({ gameId, onClose }: { gameId: string; onClose: () => void }) {
  const t = useT();
  const game = gameById(gameId);
  const rounds = useModeRounds();
  const { matches, error } = useMatchHistory();
  const [tab, setTab] = useState<'practice' | 'vs'>('practice');
  const practice = useMemo(() => practiceStats(rounds, gameId), [rounds, gameId]);
  const recent = useMemo(() => rounds.filter((r) => r.game === gameId && r.mode === 'solo').slice(-40), [rounds, gameId]);
  const gameMatches = (matches ?? []).filter((m) => m.game === gameId);
  const vs = vsSummary(gameMatches);
  const title = game ? t(game.title) : '';

  return createPortal(
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label={t('{game} stats', { game: title })} onClick={(e) => e.stopPropagation()}>
        <div className="spread" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 20 }}>{t('{game} stats', { game: title })}</h2>
          <button className="icon-btn" onClick={onClose} aria-label={t('Close')}><IconClose /></button>
        </div>
        <div className="segmented" style={{ marginBottom: 14 }}>
          <button className={tab === 'practice' ? 'on' : ''} aria-pressed={tab === 'practice'} onClick={() => setTab('practice')}>{t('Practice')}</button>
          <button className={tab === 'vs' ? 'on' : ''} aria-pressed={tab === 'vs'} onClick={() => setTab('vs')}>{t('Vs')}</button>
        </div>
        {tab === 'practice' ? (
          practice.rounds === 0 ? (
            <p className="muted">{t('Play some practice rounds to see your stats.')}</p>
          ) : (
            <>
              <div className="stat-grid">
                <Tile value={practice.rounds} label={t('sentences played')} />
                <Tile value={pct(practice.accuracy)} label={t('correct')} />
                <Tile value={practice.bestStreak} label={t('best streak')} />
                <Tile value={seconds(practice.avgMs)} label={t('avg per sentence')} />
              </div>
              <div className="section-title">{t('Last {n} answers', { n: recent.length })}</div>
              <div className="row wrap" style={{ gap: 4 }} role="img" aria-label={t('{right} right, {wrong} wrong', { right: recent.filter((r) => r.correct).length, wrong: recent.filter((r) => !r.correct).length })}>
                {recent.map((r) => (
                  <span key={r.id} title={`${r.correct ? t('Right') : t('Wrong')} · ${seconds(r.ms)}`} style={{ width: 12, height: 12, borderRadius: 3, background: r.correct ? 'var(--right)' : 'var(--wrong)' }} />
                ))}
              </div>
            </>
          )
        ) : matches === null ? (
          <p className="muted">{t('Loading matches…')}</p>
        ) : (
          <>
            {error && <div className="banner">{error}</div>}
            {vs.played === 0 ? (
              <p className="muted">{t('No {game} matches yet. Tap Vs on the Games page to play one.', { game: title })}</p>
            ) : (
              <>
                <div className="stat-grid">
                  <Tile value={`${vs.wins}-${vs.losses}${vs.ties ? `-${vs.ties}` : ''}`} label={t('wins-losses')} />
                  <Tile value={pct(vs.played ? vs.wins / vs.played : null)} label={t('win rate')} />
                  <Tile value={vs.avgScore?.toFixed(1) ?? '–'} label={t('avg score')} />
                  <Tile value={seconds(vs.avgMs)} label={t('avg finish time')} />
                  <Tile value={vs.bestScore ?? '–'} label={t('best score')} />
                  <Tile value={seconds(vs.fastestPerfectMs)} label={t('fastest perfect game')} />
                </div>
                <div className="section-title">{t('Head to head')}</div>
                <HeadToHead matches={gameMatches} />
                <div className="section-title">{t('Recent matches')}</div>
                <ul className="list">
                  {gameMatches.slice(0, 6).map((m) => (
                    <li key={m.id} className="spread small">
                      <span>
                        <strong style={{ color: m.outcome === 'win' ? 'var(--right)' : m.outcome === 'loss' ? 'var(--wrong)' : 'var(--muted)' }}>
                          {m.outcome === 'win' ? t('Won') : m.outcome === 'loss' ? t('Lost') : t('Tie')}
                        </strong>{' '}
                        {t('vs {name}', { name: m.opponent })}
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
    </div>,
    document.body,
  );
}

/** "Stats" button for a game's card on the Games page; opens that game's stats. */
export default function GameStatsButton({ gameId }: { gameId: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const game = gameById(gameId);
  return (
    <>
      <button className="btn ghost sm" onClick={() => setOpen(true)} aria-label={t('{game} stats', { game: game ? t(game.title) : '' })}>
        <IconStats /> {t('Stats')}
      </button>
      {open && <GameStatsPanel gameId={gameId} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Summary of all games, for the bottom of the Games page. */
export function GameStatsOverview() {
  const t = useT();
  const uiLang = useUiLang();
  const rounds = useModeRounds();
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
        const at = Date.parse(r.at);
        return at >= start && at < start + 86_400_000;
      }).length;
      const d = new Date(start);
      out.push({ label: d.toLocaleDateString(uiLang === 'zh' ? 'zh-CN' : undefined, { month: 'short', day: 'numeric' }), value: n, detail: t('{n} sentences played', { n }) });
    }
    return out;
  }, [rounds, uiLang, t]);
  const playable = GAMES.filter((g) => !g.comingSoon);

  if (!rounds.length && !(matches ?? []).length) {
    return (
      <>
        <div className="section-title">{t('Your game stats')}</div>
        <div className="card empty small">{t('Play a game and your stats show up here.')}</div>
      </>
    );
  }

  return (
    <>
      <div className="section-title">{t('Your game stats')}</div>
      <div className="stat-grid">
        <Tile value={rounds.length} label={t('sentences played')} />
        <Tile value={pct(all.accuracy)} label={t('practice accuracy')} />
        <Tile value={matches === null ? '…' : `${vs.wins}-${vs.losses}`} label={t('vs wins-losses')} />
        <Tile value={matches === null ? '…' : pct(vs.played ? vs.wins / vs.played : null)} label={t('vs win rate')} />
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <strong className="small">{t('Practice accuracy by game')}</strong>
        {playable.map((g) => {
          const s = practiceStats(rounds, g.id);
          return (
            <MeterRow
              key={g.id}
              label={t(g.title)}
              value={s.accuracy}
              detail={s.rounds ? t('{p} of {n} · {time} each', { p: pct(s.accuracy), n: s.rounds, time: seconds(s.avgMs) }) : t('not played')}
            />
          );
        })}
      </div>

      {matches && matches.length > 0 && (
        <>
          <div className="card" style={{ marginTop: 12 }}>
            <strong className="small">{t('Vs record by game')}</strong>
            {playable.map((g) => {
              const s = vsSummary(matches.filter((m) => m.game === g.id));
              if (!s.played) return null;
              return (
                <div key={g.id} style={{ marginTop: 10 }}>
                  <div className="small" style={{ fontWeight: 600, marginBottom: 4 }}>{t(g.title)}</div>
                  <RecordBar wins={s.wins} ties={s.ties} losses={s.losses} />
                </div>
              );
            })}
          </div>
          <div className="card" style={{ marginTop: 12 }}>
            <strong className="small">{t('Rivals (all games)')}</strong>
            <HeadToHead matches={matches} />
          </div>
        </>
      )}
      {error && <div className="banner" style={{ marginTop: 12 }}>{error}</div>}

      <div className="card" style={{ marginTop: 12 }}>
        <strong className="small">{t('Sentences played, last 14 days')}</strong>
        <BarChart data={days} height={90} xLabels={(i) => (i === 0 ? t('2 wks ago') : i === 13 ? t('Today') : null)} />
      </div>
    </>
  );
}
