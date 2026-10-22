import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useContent } from '../lib/content';
import { useSettings } from '../lib/store';
import {
  cancelMatch,
  decideWinner,
  getMatch,
  isMixedMatch,
  joinLive,
  reportProgress,
  submitResult,
  watchMyMatches,
  type LiveChannel,
  type Match,
  type ProgressEvent,
} from '../lib/match';
import { currentUserId } from '../lib/social';
import { supabase } from '../lib/supabase';
import { gameById } from '../games/registry';
import { LearnContext, project, type LearnLang } from '../lib/learn';
import { langName, useT } from '../i18n';
import { IconClose } from '../components/Icons';
import { recordRound } from '../lib/gameStats';
import MatchSummary, { type AnswerRecord } from '../components/MatchSummary';

const empty: ProgressEvent = { round: 0, score: 0, results: [], done: false };

function Dots({ results, total }: { results: boolean[]; total: number }) {
  return (
    <div className="row" style={{ gap: 4 }} aria-hidden>
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
  const t = useT();
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const content = useContent();
  const settings = useSettings();
  const [me, setMe] = useState<string | null>(null);
  const [match, setMatch] = useState<Match | null>(null);
  const [names, setNames] = useState<{ me: string; them: string }>({ me: '', them: '' });
  const [mine, setMine] = useState<ProgressEvent>(empty);
  const [theirs, setTheirs] = useState<ProgressEvent>(empty);
  const [online, setOnline] = useState(true);
  // Which sentence is on screen. Kept separate from the answer count so the current round's
  // feedback stays up until the player taps Next.
  const [index, setIndex] = useState(0);
  const answeredIndex = useRef(-1);
  const roundStart = useRef(Date.now());
  const [answers, setAnswers] = useState<AnswerRecord[]>([]);
  useEffect(() => {
    roundStart.current = Date.now();
  }, [index]);
  const [error, setError] = useState('');
  const live = useRef<LiveChannel | null>(null);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    let unwatch = () => {};
    (async () => {
      const uid = await currentUserId();
      const m = await getMatch(id);
      if (!uid || !m) return setError(t('Match not found.'));
      setMe(uid);
      setMatch(m);
      const opponent = m.player_a === uid ? m.player_b : m.player_a;
      const { data } = await supabase.from('profiles').select('user_id, display_name').in('user_id', [uid, opponent ?? uid]);
      const name = (u: string | null) => data?.find((p) => p.user_id === u)?.display_name;
      setNames({ me: name(uid) ?? t('You'), them: name(opponent) ?? t('Opponent') });
      live.current = joinLive(id, uid, { onProgress: setTheirs, onPresence: setOnline });
      unwatch = watchMyMatches(uid, (row) => row.id === id && setMatch(row));
      startedAt.current = Date.now();
    })().catch((e) => setError((e as Error).message));
    return () => {
      unwatch();
      live.current?.close();
    };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const iAmA = !!match && me === match.player_a;
  // Each player answers in the language they're learning, even when the opponent learns the other one.
  const myLang: LearnLang = (match ? (iAmA ? match.lang_a : match.lang_b) : null) ?? settings.learning;
  const theirLang: LearnLang | null = match ? (iAmA ? match.lang_b : match.lang_a) : null;
  const game = match ? gameById(match.game) : undefined;
  const sentences = useMemo(
    () => (match ? match.sentence_ids.map((s) => content.byId.get(s)).filter((s) => !!s).map((s) => project(s, myLang)) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [match?.id, content, myLang],
  );
  const pool = useMemo(() => {
    const levels = new Set(sentences.map((s) => s.level));
    return content.sentences.filter((s) => levels.has(s.level)).map((s) => project(s, myLang));
  }, [sentences, content, myLang]);

  const total = sentences.length;

  const record = (ok: boolean, answer?: string) => {
    if (answeredIndex.current === index) return; // one answer per round
    answeredIndex.current = index;
    const ms = Date.now() - roundStart.current;
    if (match) recordRound(match.game, 'vs', ok, ms, id, myLang);
    const sentence = sentences[index];
    if (sentence) setAnswers((list) => [...list, { sentence, correct: ok, answer, ms }]);
    const progress = { ...mine, round: mine.round + 1, score: mine.score + (ok ? 1 : 0), results: [...mine.results, ok] };
    setMine(progress);
    live.current?.send(progress);
    // Mid-match updates let the server end the game as soon as the result can't change.
    if (progress.round < total) reportProgress(id, progress.round, progress.score).then((m) => m && setMatch(m)).catch(() => undefined);
  };

  const next = async () => {
    if (answeredIndex.current !== index) return;
    if (index + 1 < total) {
      setIndex(index + 1);
      return;
    }
    const ms = Date.now() - startedAt.current;
    const done = { ...mine, done: true, ms };
    setMine(done);
    live.current?.send(done);
    try {
      setMatch(await submitResult(id, mine.score, ms));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const leave = async () => {
    if (match && match.status !== 'finished' && !mine.done && confirm(t('Leave the match? It counts as a forfeit.'))) {
      await cancelMatch(id);
      navigate('/games');
    } else if (!match || match.status === 'finished' || mine.done) navigate('/games');
  };

  if (error)
    return (
      <div className="card empty">
        {error} <button className="btn sm" onClick={() => navigate('/games')}>{t('Back')}</button>
      </div>
    );
  if (!match || !game?.component || !me) return <div className="center-screen">{t('Joining match…')}</div>;

  const myFinal = iAmA ? match.score_a : match.score_b;
  const theirFinal = iAmA ? match.score_b : match.score_a;
  const myTime = iAmA ? match.time_a : match.time_b;
  const theirTime = iAmA ? match.time_b : match.time_a;
  const finished = match.status === 'finished';
  const myProgress = iAmA ? match.progress_a : match.progress_b;
  const theirProgress = iAmA ? match.progress_b : match.progress_a;
  const cancelled = match.status === 'cancelled';
  const Game = game.component;
  const current = sentences[index];
  const mixed = isMixedMatch(match);

  let verdict = '';
  if (finished && myFinal !== null && theirFinal !== null) {
    const w = decideWinner(match, content);
    verdict = w === 'tie' ? t("It's a tie") : (w === 'a') === iAmA ? `${t('You win!')} 🎉` : t('{name} wins', { name: names.them });
  }
  const secs = (ms: number | null) => t('{s}s', { s: ((ms ?? 0) / 1000).toFixed(1) });

  return (
    <LearnContext.Provider value={myLang}>
      <div className="review-top">
        <button className="icon-btn" onClick={leave} aria-label={t('Leave match')}>
          <IconClose />
        </button>
        <strong className="grow">{t(game.title)} · {t('Vs')}</strong>
      </div>

      <div className="card" style={{ marginBottom: 14, padding: 12 }}>
        <div className="spread small" style={{ marginBottom: 6 }}>
          <strong>{names.me}</strong>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{t('{score} pts · {done}/{total}', { score: mine.score, done: Math.min(mine.round, total), total })}</span>
        </div>
        <Dots results={mine.results} total={total} />
        <div className="spread small" style={{ margin: '10px 0 6px' }}>
          <strong>
            {names.them}
            {mixed && theirLang && <span className="muted" style={{ fontWeight: 400 }}> · {t('learning {lang}', { lang: langName(theirLang) })}</span>}
            {!online && !theirs.done && <span className="muted" style={{ fontWeight: 400 }}> · {t('offline')}</span>}
          </strong>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>
            {t('{score} pts · {done}/{total}', { score: theirs.score, done: Math.min(theirs.round, total), total })}
            {theirs.done && ' ✓'}
          </span>
        </div>
        <Dots results={theirs.results} total={total} />
      </div>

      {cancelled ? (
        <div className="card center">
          <p>{mine.done ? t('Your opponent left the match.') : t('This match was cancelled.')}</p>
          <button className="btn primary" onClick={() => navigate('/games')}>{t('Back to games')}</button>
        </div>
      ) : finished ? (
        <>
          <div className="card center" style={{ padding: 24 }} role="status">
            <h2 style={{ marginTop: 0 }}>{verdict}</h2>
            {myProgress < total && <p>{t("{name} finished with a lead you couldn't catch, so the match ended early.", { name: names.them })}</p>}
            {theirProgress < total && <p>{t("{name} couldn't catch up anymore, so the match ended early.", { name: names.them })}</p>}
            {mixed && myFinal === theirFinal && <p className="small muted">{t('Tied on points: in mixed-language matches the faster player per word wins.')}</p>}
            <p className="muted">
              {names.me}: {myFinal} {myProgress < total ? t('({done}/{total} answered)', { done: myProgress, total }) : t('in {time}', { time: secs(myTime) })} · {names.them}: {theirFinal}{' '}
              {theirProgress < total ? t('({done}/{total} answered)', { done: theirProgress, total }) : t('in {time}', { time: secs(theirTime) })}
            </p>
            <div className="row" style={{ justifyContent: 'center' }}>
              <button className="btn" onClick={() => navigate('/games')}>{t('Done')}</button>
              <button className="btn primary" onClick={() => navigate(`/vs/${game.id}`)}>{t('Play again')}</button>
            </div>
          </div>
          <MatchSummary answers={answers} />
        </>
      ) : mine.done ? (
        <>
          <div className="card center" style={{ padding: 24 }}>
            <p style={{ fontWeight: 600 }}>{t('You scored {score}/{total}.', { score: mine.score, total })}</p>
            <p className="muted small">{t('Waiting for {name} to finish…', { name: names.them })}</p>
          </div>
          <MatchSummary answers={answers} />
        </>
      ) : current ? (
        <Game key={index} sentence={current} pool={pool} content={content} settings={settings} hints={false} vs onResult={record} onNext={next} />
      ) : (
        <div className="card empty">
          {t("This match's sentences aren't on your device yet. Try reopening the app.")}{' '}
          <button className="btn sm" onClick={() => navigate('/games')}>{t('Back')}</button>
        </div>
      )}
    </LearnContext.Provider>
  );
}
