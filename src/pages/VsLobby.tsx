import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { getContent } from '../lib/content';
import { getState } from '../lib/store';
import { cancelMatch, createMatch, findMatch, pickSentences, ROUNDS, watchMyMatches, type Match } from '../lib/match';
import { currentUserId, listFriends, useMyProfile, type Friend } from '../lib/social';
import { gameById, gameName, isVocabGame, MIN_VOCAB, poolFor } from '../games/registry';
import { vocabFor } from '../lib/vocab';
import { newSeed } from '../lib/vocabGame';
import { SpeedAnswerPicker, useSpeedAnswer } from '../games/SpeedRound';
import { useT } from '../i18n';
import NamePrompt from '../components/NamePrompt';
import { notifyChallenge } from '../lib/push';
import { IconBack } from '../components/Icons';

const WAIT_LIMIT_MS = 2 * 60 * 1000;
// Friends get a little longer: they may be opening the app from a notification.
const CHALLENGE_WAIT_MS = 3 * 60 * 1000;

export default function VsLobby() {
  const t = useT();
  const { game: gameId = '' } = useParams();
  const [params] = useSearchParams();
  const game = gameById(gameId);
  const navigate = useNavigate();
  const { profile, reload } = useMyProfile();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [waiting, setWaiting] = useState<{ match: Match; label: string } | null>(null);
  const [error, setError] = useState('');
  const stop = useRef<() => void>(() => {});
  const [answer, setAnswer] = useSpeedAnswer(gameId, getState().settings.learning);

  useEffect(() => {
    listFriends()
      .then((f) => setFriends(f.filter((x) => x.status === 'accepted')))
      .catch(() => undefined);
    return () => stop.current();
  }, []);

  const preselected = params.get('friend');
  const autoStarted = useRef(false);
  useEffect(() => {
    if (preselected && profile && friends.length && !autoStarted.current) {
      const f = friends.find((x) => x.user_id === preselected);
      if (f) {
        autoStarted.current = true;
        challenge(f);
      }
    }
  }); // eslint-disable-line react-hooks/exhaustive-deps

  if (!game || (!game.component && !isVocabGame(game))) return <Navigate to="/games" replace />;
  const vocab = isVocabGame(game);
  const title = `${gameName(game, getState().settings.learning)} · ${t('Vs')}`;
  if (profile === null) return <div className="center-screen">{t('Loading…')}</div>;
  if (profile === false)
    return (
      <>
        <Header title={title} onBack={() => navigate('/games')} />
        <NamePrompt onSaved={reload} />
      </>
    );

  const settings = getState().settings;
  const lang = settings.learning;
  const sentenceIds = () => (vocab ? [] : pickSentences(game.id, getContent(), settings));
  // Vocabulary games: both players draw from the same levels with a shared seed ("My words" stay out).
  const vocabMatch = () => (vocab ? { seed: newSeed(), levels: settings.gameLevels, ...(game.kind === 'speed' ? { variant: answer } : {}) } : undefined);
  const needed = vocab ? MIN_VOCAB : ROUNDS;
  const poolSize = vocab ? vocabFor(getContent(), lang, settings.gameLevels, 'both').length : poolFor(game, getContent(), settings, lang).length;
  const needMore = vocab
    ? t('Pick more levels on the Games page: this game needs at least {n} words.', { n: MIN_VOCAB })
    : t('Pick more levels on the Games page: this game needs at least {n} sentences.', { n: ROUNDS });
  const enough = (ids: string[]) => (vocab ? poolSize >= MIN_VOCAB : ids.length >= ROUNDS);

  /** Waits for the match to become active, then opens it. */
  const waitFor = async (match: Match, label: string, matchmaking: boolean) => {
    const me = await currentUserId();
    setWaiting({ match, label });
    let done = false;
    const go = (m: Match) => {
      if (done) return;
      if (m.status === 'active') {
        done = true;
        stop.current();
        navigate(`/vs/match/${m.id}`, { replace: true });
      } else if (m.status === 'cancelled' && m.id === match.id) {
        done = true;
        stop.current();
        setWaiting(null);
        setError(matchmaking ? '' : t('Your challenge was declined.'));
      }
    };
    const unwatch = watchMyMatches(me!, (m) => m.id === match.id && go(m));
    // Matchmaking: keep looking for anyone who started waiting before us (in either learning mode).
    const retry = matchmaking
      ? setInterval(async () => {
          const other = await findMatch(game.id, lang, match.created_at).catch(() => null);
          if (other && !done) {
            await cancelMatch(match.id);
            go(other);
          }
        }, 4000)
      : undefined;
    const timeout = setTimeout(() => {
      if (done) return;
      done = true;
      stop.current();
      cancelMatch(match.id);
      setWaiting(null);
      setError(matchmaking ? t('Nobody else is looking for a match right now. Try again, or challenge a friend.') : t("Your friend didn't answer in time."));
    }, matchmaking ? WAIT_LIMIT_MS : CHALLENGE_WAIT_MS);
    stop.current = () => {
      unwatch();
      clearInterval(retry);
      clearTimeout(timeout);
    };
  };

  const quickMatch = async () => {
    setError('');
    try {
      const found = await findMatch(game.id, lang);
      if (found) return navigate(`/vs/match/${found.id}`, { replace: true });
      const ids = sentenceIds();
      if (!enough(ids)) return setError(needMore);
      const m = await createMatch(game.id, ids, lang, undefined, vocabMatch());
      waitFor(m, t('Looking for an opponent…'), true);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  async function challenge(f: Friend) {
    setError('');
    try {
      const ids = sentenceIds();
      if (!enough(ids)) return setError(needMore);
      const m = await createMatch(game!.id, ids, lang, f.user_id, vocabMatch());
      notifyChallenge(m.id);
      waitFor(m, t('Waiting for {name} to accept…', { name: f.display_name }), false);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const cancel = async () => {
    stop.current();
    if (waiting) await cancelMatch(waiting.match.id);
    setWaiting(null);
  };

  return (
    <>
      <Header title={title} onBack={() => { cancel(); navigate('/games'); }} />
      {waiting ? (
        <div className="card center" style={{ padding: 28 }} role="status">
          <div className="game-icon" style={{ margin: '0 auto 12px' }}>{game.icon}</div>
          <p style={{ fontWeight: 600 }}>{waiting.label}</p>
          <p className="small muted">{t('Keep this screen open. The match starts as soon as they join.')}</p>
          <button className="btn" onClick={cancel}>{t('Cancel')}</button>
        </div>
      ) : (
        <>
          <p className="muted small" style={{ marginTop: 0 }}>
            {game.kind === 'speed'
              ? t("30 seconds each, at the same time, no hints. Right answers +1, wrong −1; the higher score wins. You can play people learning either language: each of you gets words in the language you're learning.")
              : game.kind === 'duel'
                ? t("Take turns answering. Miss (or run out of time) and you lose a life, then your opponent gets one chance at it. The clock speeds up from 15 to 6 seconds. 4 lives each; last one standing wins.")
                : t("{n} rounds, same sentences for both players, no hints. Most correct answers wins; if it's a tie, the faster player wins. You can play people learning either language: each of you answers in the language you're learning.", { n: ROUNDS })}
          </p>
          {game.kind === 'speed' && (
            <>
              <SpeedAnswerPicker value={answer} onChange={setAnswer} lang={lang} />
              <p className="small muted" style={{ marginTop: -6 }}>{t('Find an opponent joins whoever is waiting, in the mode they picked.')}</p>
            </>
          )}
          {error && <div className="banner">{error}</div>}
          <button className="btn accent block" disabled={poolSize < needed} onClick={quickMatch}>{t('Find an opponent')}</button>
          {poolSize < needed && <p className="small muted center">{t('Select more levels on the Games page first.')}</p>}
          <div className="section-title">{t('Challenge a friend')}</div>
          <div className="card">
            {friends.length === 0 ? (
              <p className="small muted" style={{ margin: 0 }}>{t('Add friends on the Friends tab to challenge them.')}</p>
            ) : (
              <ul className="list">
                {friends.map((f) => (
                  <li key={f.user_id} className="spread">
                    <strong>{f.display_name}</strong>
                    <button className="btn primary sm" disabled={poolSize < needed} onClick={() => challenge(f)}>{t('Challenge')}</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </>
  );
}

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  const t = useT();
  return (
    <header className="topbar">
      <div className="row">
        <button className="icon-btn" onClick={onBack} aria-label={t('Back')}><IconBack /></button>
        <h1>{title}</h1>
      </div>
    </header>
  );
}
