import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useContent } from '../lib/content';
import { useSettings } from '../lib/store';
import { cancelMatch, decideWinner, duelAnswer, duelTimeout, duelWrong, getMatch, joinLive, submitResult, watchMyMatches, type LiveChannel, type Match, type ProgressEvent } from '../lib/match';
import { currentUserId } from '../lib/social';
import { supabase } from '../lib/supabase';
import { gameById, gameName } from '../games/registry';
import { vocabFor } from '../lib/vocab';
import { asDuelLevel, duelAnswerOk, duelSeconds, readingsOf, WRONG_GUESS_PENALTY, wordSequence } from '../lib/vocabGame';
import VocabSummary, { type WordResult } from '../components/VocabSummary';
import { recordRound } from '../lib/gameStats';
import { langName, useT } from '../i18n';
import { IconClose } from '../components/Icons';
import SpeedRound, { answerLabel, SPEED_MS, type SpeedResult } from '../games/SpeedRound';
import DuelBoard, { duelLevelName } from '../games/DuelBoard';
import type { LearnLang } from '../lib/learn';

/** Loads a match, both names, and keeps the match row live. */
function useMatch(id: string) {
  const t = useT();
  const [me, setMe] = useState<string | null>(null);
  const [match, setMatch] = useState<Match | null>(null);
  const [names, setNames] = useState({ me: '', them: '' });
  const [error, setError] = useState('');
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
      unwatch = watchMyMatches(uid, (row) => row.id === id && setMatch((cur) => ({ ...cur, ...row })));
    })().catch((e) => setError((e as Error).message));
    return () => unwatch();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  const iAmA = !!match && me === match.player_a;
  const myLang: LearnLang = (match ? (iAmA ? match.lang_a : match.lang_b) : null) ?? 'zh';
  const theirLang: LearnLang = (match ? (iAmA ? match.lang_b : match.lang_a) : null) ?? myLang;
  return { me, match, setMatch, names, error, iAmA, myLang, theirLang };
}

function Shell({ title, onLeave, children }: { title: string; onLeave: () => void; children: React.ReactNode }) {
  const t = useT();
  return (
    <>
      <div className="review-top">
        <button className="icon-btn" onClick={onLeave} aria-label={t('Leave match')}><IconClose /></button>
        <strong className="grow">{title}</strong>
      </div>
      {children}
    </>
  );
}

function Verdict({ match, iAmA, them, lines }: { match: Match; iAmA: boolean; them: string; lines: string[] }) {
  const t = useT();
  const navigate = useNavigate();
  const content = useContent();
  const w = decideWinner(match, content);
  const text = w === 'tie' ? t("It's a tie") : (w === 'a') === iAmA ? `${t('You win!')} 🎉` : t('{name} wins', { name: them });
  return (
    <div className="card center" style={{ padding: 24 }} role="status">
      <h2 style={{ marginTop: 0 }}>{text}</h2>
      {lines.map((l) => <p key={l} className="muted">{l}</p>)}
      <div className="row" style={{ justifyContent: 'center' }}>
        <button className="btn" onClick={() => navigate('/games')}>{t('Done')}</button>
        <button className="btn primary" onClick={() => navigate(`/vs/${match.game}`)}>{t('Play again')}</button>
      </div>
    </div>
  );
}

// ---------- Speed round ----------

export function SpeedVs({ id }: { id: string }) {
  const t = useT();
  const navigate = useNavigate();
  const content = useContent();
  const { me, match, setMatch, names, error, iAmA, myLang, theirLang } = useMatch(id);
  const [theirs, setTheirs] = useState<ProgressEvent>({ round: 0, score: 0, results: [], done: false });
  const [mine, setMine] = useState<SpeedResult | null>(null);
  const [live, setLive] = useState(0);
  const [words, setWords] = useState<WordResult[]>([]);
  const channel = useRef<LiveChannel | null>(null);
  const pool = useMemo(() => (match ? vocabFor(content, myLang, match.levels ?? []) : []), [match?.id, content, myLang]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!me) return;
    channel.current = joinLive(id, me, { onProgress: setTheirs, onPresence: () => undefined });
    return () => channel.current?.close();
  }, [me, id]);

  if (error) return <div className="card empty">{error}</div>;
  if (!match || !me) return <div className="center-screen">{t('Joining match…')}</div>;
  const game = gameById(match.game);
  const answer = match.variant === 'sound' ? 'sound' : 'meaning';
  const title = `${gameName(game, myLang)} · ${answerLabel(answer, myLang, t)} · ${t('Vs')}`;
  const startAt = Date.parse(match.started_at ?? match.created_at) + 4000;
  const finished = match.status === 'finished';
  const leave = async () => {
    if (!finished && !mine && confirm(t('Leave the match? It counts as a forfeit.'))) await cancelMatch(id);
    navigate('/games');
  };

  const done = async (r: SpeedResult) => {
    setMine(r);
    channel.current?.send({ round: r.right + r.wrong, score: r.score, results: [], done: true, ms: SPEED_MS });
    try {
      const m = await submitResult(id, r.score, SPEED_MS);
      setMatch((cur) => ({ ...cur!, ...m }));
    } catch {
      /* the result arrives through the live match row */
    }
  };

  return (
    <Shell title={title} onLeave={leave}>
      <div className="card vs-scores">
        <span><strong>{names.me}</strong> {mine ? mine.score : live}</span>
        <span>
          <strong>{names.them}</strong>
          {theirLang !== myLang && <span className="small muted"> · {t('learning {lang}', { lang: langName(theirLang) })}</span>} {theirs.score}
          {theirs.done && ' ✓'}
        </span>
      </div>
      {match.status === 'cancelled' ? (
        <div className="card center"><p>{t('Your opponent left the match.')}</p></div>
      ) : finished ? (
        <>
          <Verdict match={match} iAmA={iAmA} them={names.them} lines={[`${names.me}: ${iAmA ? match.score_a : match.score_b} · ${names.them}: ${iAmA ? match.score_b : match.score_a}`]} />
          <VocabSummary results={words} />
        </>
      ) : mine ? (
        <>
          <div className="card center" style={{ padding: 24 }}>
            <p style={{ fontWeight: 600 }}>{t('You scored {n}.', { n: mine.score })}</p>
            <p className="muted small">{t('Waiting for {name} to finish…', { name: names.them })}</p>
          </div>
          <VocabSummary results={words} />
        </>
      ) : (
        <SpeedRound
          pool={pool}
          seed={match.seed ?? 1}
          direction={match.game === 'speed-word' ? 'word' : 'meaning'}
          answer={answer}
          lang={myLang}
          showPy={false}
          startAt={startAt}
          onAnswer={(ok, ms, score, answered, item) => {
            setWords((w) => [...w, { item, ok }]);
            recordRound(match.game, 'vs', ok, ms, id, myLang);
            setLive(score);
            channel.current?.send({ round: answered, score, results: [], done: false });
          }}
          onDone={done}
        />
      )}
    </Shell>
  );
}

// ---------- Word duel ----------

export function DuelVs({ id }: { id: string }) {
  const t = useT();
  const navigate = useNavigate();
  const content = useContent();
  useSettings();
  const { me, match, setMatch, names, error, iAmA, myLang, theirLang } = useMatch(id);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [penalty, setPenalty] = useState<{ text: string; key: number } | null>(null);
  const [results, setResults] = useState<WordResult[]>([]);
  const [now, setNow] = useState(Date.now());
  const lastSeen = useRef(-1);
  const shownAt = useRef(Date.now());
  const sent = useRef(-1);
  const levels = match?.levels ?? [];
  const level = asDuelLevel(match?.variant);
  // Each player's words come from their own learning language, drawn with the shared seed.
  const mySeq = useMemo(() => (match ? wordSequence(vocabFor(content, myLang, levels), match.seed ?? 1) : null), [match?.id, content, myLang]); // eslint-disable-line react-hooks/exhaustive-deps
  const theirSeq = useMemo(() => (match ? wordSequence(vocabFor(content, theirLang, levels), match.seed ?? 1) : null), [match?.id, content, theirLang]); // eslint-disable-line react-hooks/exhaustive-deps
  const d = match?.duel ?? null;

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);

  // Show what just happened for a moment. The right answer is only shown to the player who missed.
  useEffect(() => {
    if (!d?.last || d.turn === lastSeen.current) return;
    lastSeen.current = d.turn;
    shownAt.current = Date.now();
    setPenalty(null);
    const byMe = (d.last.by === 'a') === iAmA;
    const seq = byMe ? mySeq : theirSeq;
    const lang = byMe ? myLang : theirLang;
    const item = seq?.(d.last.n);
    if (item) setResults((r) => [...r, { item, ok: d.last!.ok, by: byMe ? t('You') : names.them, steal: d.last!.steal }]);
    if (byMe && !d.last.ok) recordRound(match!.game, 'vs', false, 0, id, myLang);
    const answer = item ? (lang === 'zh' ? readingsOf(item) : item.text) : '';
    setFeedback(
      d.last.ok
        ? { ok: true, text: byMe ? t('You got it!') : t('{name} got it!', { name: names.them }) }
        : { ok: false, text: byMe ? t("Time's up! It was {answer}", { answer }) : t('{name} ran out of time.', { name: names.them }) },
    );
    const timer = setTimeout(() => setFeedback(null), 1600);
    return () => clearTimeout(timer);
  }, [d?.turn]); // eslint-disable-line react-hooks/exhaustive-deps

  // Either player's app reports a timeout once the clock (plus a little grace) has run out.
  const deadline = d ? Date.parse(d.deadline) : 0;
  useEffect(() => {
    if (d && match?.status === 'active' && now > deadline + 1700) duelTimeout(id, d.turn).then((m) => m && setMatch((cur) => ({ ...cur!, ...m })));
  }, [now > deadline + 1700, d?.turn]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <div className="card empty">{error}</div>;
  if (!match || !me) return <div className="center-screen">{t('Joining match…')}</div>;
  const game = gameById(match.game);
  const title = `${gameName(game, myLang)} · ${duelLevelName(level, t)} · ${t('Vs')}`;
  const finished = match.status === 'finished';
  const leave = async () => {
    if (!finished && confirm(t('Leave the match? It counts as a forfeit.'))) await cancelMatch(id);
    navigate('/games');
  };
  if (match.status === 'cancelled')
    return (
      <Shell title={title} onLeave={() => navigate('/games')}>
        <div className="card center"><p>{t('Your opponent left the match.')}</p></div>
        <VocabSummary results={results} />
      </Shell>
    );
  if (!d || !mySeq || !theirSeq) return <div className="center-screen">{t('Joining match…')}</div>;

  const myTurn = !finished && (d.mover === 'a') === iAmA;
  const item = myTurn ? mySeq(d.n) : theirSeq(d.n);
  const myLives = iAmA ? d.lives_a : d.lives_b;
  const theirLives = iAmA ? d.lives_b : d.lives_a;

  // A right answer ends the move; a wrong guess takes time off the clock and the player tries again.
  const submit = async (typed: string) => {
    if (sent.current === d.turn) return;
    const ok = duelAnswerOk(typed, mySeq(d.n), myLang);
    try {
      if (ok) {
        sent.current = d.turn;
        recordRound(match.game, 'vs', true, Date.now() - shownAt.current, id, myLang);
        const m = await duelAnswer(id, d.turn, true, typed);
        if (m) setMatch((cur) => ({ ...cur!, ...m }));
      } else {
        const cut = WRONG_GUESS_PENALTY * duelSeconds(d.correct, level);
        setPenalty({ text: t('Wrong: −{s}s', { s: Number(cut.toFixed(1)) }), key: Date.now() });
        const m = await duelWrong(id, d.turn);
        if (m) setMatch((cur) => ({ ...cur!, ...m }));
      }
    } catch {
      sent.current = -1;
    }
  };

  return (
    <Shell title={title} onLeave={leave}>
      {finished ? (
        <>
          <Verdict match={match} iAmA={iAmA} them={names.them} lines={[t('Lives left: {me} – {them}', { me: myLives, them: theirLives }), t('{n} right answers in total', { n: d.correct })]} />
          <VocabSummary results={results} />
        </>
      ) : (
        <DuelBoard
          item={item}
          lang={myTurn ? myLang : theirLang}
          inputLang={myLang}
          myTurn={myTurn}
          steal={d.phase === 'steal'}
          deadline={deadline}
          seconds={duelSeconds(d.correct, level)}
          correct={d.correct}
          players={[{ name: names.me, lives: myLives }, { name: names.them, lives: theirLives }]}
          moverName={myTurn ? names.me : names.them}
          feedback={feedback}
          moveKey={d.turn}
          penalty={myTurn ? penalty : null}
          onSubmit={submit}
        />
      )}
    </Shell>
  );
}
