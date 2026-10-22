import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useContent } from '../lib/content';
import { useSettings } from '../lib/store';
import { cancelMatch, getMatch, joinLive, submitResult, watchMyMatches, type LiveChannel, type Match, type ProgressEvent } from '../lib/match';
import { currentUserId } from '../lib/social';
import { supabase } from '../lib/supabase';
import { gameById } from '../games/registry';
import { IconClose } from '../components/Icons';

const empty: ProgressEvent = { round: 0, score: 0, results: [], done: false };

function Dots({ results, total }: { results: boolean[]; total: number }) {
  return (
    <div className="row" style={{ gap: 4 }}>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          style={{
            width: 10,
            height: 10,
            borderRadius: 99,
            background: i < results.length ? (results[i] ? 'var(--right)' : 'var(--wrong)') : 'var(--surface-2)',
          }}
        />
      ))}
    </div>
  );
}

export default function VsMatch() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const content = useContent();
  const settings = useSettings();
  const [me, setMe] = useState<string | null>(null);
  const [match, setMatch] = useState<Match | null>(null);
  const [names, setNames] = useState<{ me: string; them: string }>({ me: 'You', them: 'Opponent' });
  const [mine, setMine] = useState<ProgressEvent>(empty);
  const [theirs, setTheirs] = useState<ProgressEvent>(empty);
  const [online, setOnline] = useState(true);
  const [answered, setAnswered] = useState(false);
  const [error, setError] = useState('');
  const live = useRef<LiveChannel | null>(null);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    let unwatch = () => {};
    (async () => {
      const uid = await currentUserId();
      const m = await getMatch(id);
      if (!uid || !m) return setError('Match not found.');
      setMe(uid);
      setMatch(m);
      const opponent = m.player_a === uid ? m.player_b : m.player_a;
      const { data } = await supabase.from('profiles').select('user_id, display_name').in('user_id', [uid, opponent ?? uid]);
      const name = (u: string | null) => data?.find((p) => p.user_id === u)?.display_name;
      setNames({ me: name(uid) ?? 'You', them: name(opponent) ?? 'Opponent' });
      live.current = joinLive(id, uid, { onProgress: setTheirs, onPresence: setOnline });
      unwatch = watchMyMatches(uid, (row) => row.id === id && setMatch(row));
      startedAt.current = Date.now();
    })().catch((e) => setError((e as Error).message));
    return () => {
      unwatch();
      live.current?.close();
    };
  }, [id]);

  const game = match ? gameById(match.game) : undefined;
  const sentences = useMemo(() => (match ? match.sentence_ids.map((s) => content.byId.get(s)).filter((s) => !!s) : []), [match, content]);
  const pool = useMemo(() => {
    const levels = new Set(sentences.map((s) => s.level));
    return content.sentences.filter((s) => levels.has(s.level));
  }, [sentences, content]);

  const total = sentences.length;
  const iAmA = match && me === match.player_a;

  const record = (ok: boolean) => {
    if (answered) return;
    setAnswered(true);
    setMine((p) => {
      const next = { ...p, round: p.round + 1, score: p.score + (ok ? 1 : 0), results: [...p.results, ok] };
      live.current?.send(next);
      return next;
    });
  };

  const next = async () => {
    setAnswered(false);
    if (mine.round >= total) {
      const ms = Date.now() - startedAt.current;
      const done = { ...mine, done: true, ms };
      setMine(done);
      live.current?.send(done);
      try {
        setMatch(await submitResult(id, mine.score, ms));
      } catch (e) {
        setError((e as Error).message);
      }
    }
  };

  const leave = async () => {
    if (match && match.status !== 'finished' && !mine.done && confirm('Leave the match? It counts as a forfeit.')) {
      await cancelMatch(id);
      navigate('/games');
    } else if (!match || match.status === 'finished' || mine.done) navigate('/games');
  };

  if (error) return <div className="card empty">{error} <button className="btn sm" onClick={() => navigate('/games')}>Back</button></div>;
  if (!match || !game?.component || !me) return <div className="center-screen">Joining match…</div>;

  const myFinal = iAmA ? match.score_a : match.score_b;
  const theirFinal = iAmA ? match.score_b : match.score_a;
  const myTime = iAmA ? match.time_a : match.time_b;
  const theirTime = iAmA ? match.time_b : match.time_a;
  const finished = match.status === 'finished';
  const cancelled = match.status === 'cancelled';
  const Game = game.component;
  const current = sentences[mine.round];

  let verdict = '';
  if (finished && myFinal !== null && theirFinal !== null) {
    verdict = myFinal > theirFinal || (myFinal === theirFinal && (myTime ?? 0) < (theirTime ?? 0)) ? 'You win! 🎉' : myFinal === theirFinal && myTime === theirTime ? "It's a tie" : `${names.them} wins`;
  }

  return (
    <>
      <div className="review-top">
        <button className="icon-btn" onClick={leave} aria-label="Leave match"><IconClose /></button>
        <strong className="grow">{game.title} · Vs</strong>
      </div>

      <div className="card" style={{ marginBottom: 14, padding: 12 }}>
        <div className="spread small" style={{ marginBottom: 6 }}>
          <strong>{names.me}</strong>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{mine.score} pts · {Math.min(mine.round, total)}/{total}</span>
        </div>
        <Dots results={mine.results} total={total} />
        <div className="spread small" style={{ margin: '10px 0 6px' }}>
          <strong>
            {names.them}
            {!online && !theirs.done && <span className="muted" style={{ fontWeight: 400 }}> · offline</span>}
          </strong>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{theirs.score} pts · {Math.min(theirs.round, total)}/{total}{theirs.done && ' ✓'}</span>
        </div>
        <Dots results={theirs.results} total={total} />
      </div>

      {cancelled ? (
        <div className="card center">
          <p>{mine.done ? 'Your opponent left the match.' : 'This match was cancelled.'}</p>
          <button className="btn primary" onClick={() => navigate('/games')}>Back to games</button>
        </div>
      ) : finished ? (
        <div className="card center" style={{ padding: 24 }}>
          <h2 style={{ marginTop: 0 }}>{verdict}</h2>
          <p className="muted">
            {names.me}: {myFinal} in {((myTime ?? 0) / 1000).toFixed(1)}s · {names.them}: {theirFinal} in {((theirTime ?? 0) / 1000).toFixed(1)}s
          </p>
          <div className="row" style={{ justifyContent: 'center' }}>
            <button className="btn" onClick={() => navigate('/games')}>Done</button>
            <button className="btn primary" onClick={() => navigate(`/vs/${game.id}`)}>Play again</button>
          </div>
        </div>
      ) : mine.done ? (
        <div className="card center" style={{ padding: 24 }}>
          <p style={{ fontWeight: 600 }}>You scored {mine.score}/{total}.</p>
          <p className="muted small">Waiting for {names.them} to finish…</p>
        </div>
      ) : current ? (
        <Game
          key={mine.round}
          sentence={current}
          pool={pool}
          content={content}
          settings={settings}
          hints={false}
          vs
          onResult={record}
          onNext={next}
        />
      ) : (
        <div className="card empty">
          Some sentences in this match aren't on your device yet. <button className="btn sm" onClick={next}>Finish</button>
        </div>
      )}
    </>
  );
}
