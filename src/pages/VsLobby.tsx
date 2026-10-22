import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { getContent } from '../lib/content';
import { getState } from '../lib/store';
import { cancelMatch, createMatch, findMatch, pickSentences, ROUNDS, watchMyMatches, type Match } from '../lib/match';
import { currentUserId, listFriends, useMyProfile, type Friend } from '../lib/social';
import { gameById, poolFor } from '../games/registry';
import NamePrompt from '../components/NamePrompt';
import { notifyChallenge } from '../lib/push';
import { IconBack } from '../components/Icons';
import GameStatsButton from '../components/GameStats';

const WAIT_LIMIT_MS = 2 * 60 * 1000;
// Friends get a little longer: they may be opening the app from a notification.
const CHALLENGE_WAIT_MS = 3 * 60 * 1000;

export default function VsLobby() {
  const { game: gameId = '' } = useParams();
  const [params] = useSearchParams();
  const game = gameById(gameId);
  const navigate = useNavigate();
  const { profile, reload } = useMyProfile();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [waiting, setWaiting] = useState<{ match: Match; label: string } | null>(null);
  const [error, setError] = useState('');
  const stop = useRef<() => void>(() => {});

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

  if (!game?.component) return <Navigate to="/games" replace />;
  if (profile === null) return <div className="center-screen">Loading…</div>;
  if (profile === false)
    return (
      <>
        <Header title={`${game.title} · Vs`} onBack={() => navigate('/games')} />
        <NamePrompt onSaved={reload} />
      </>
    );

  const sentenceIds = () => pickSentences(game.id, getContent(), getState().settings);
  const poolSize = poolFor(game, getContent(), getState().settings).length;

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
        setError(matchmaking ? '' : 'Your challenge was declined.');
      }
    };
    const unwatch = watchMyMatches(me!, (m) => m.id === match.id && go(m));
    // Matchmaking: keep looking for anyone who started waiting before us.
    const retry = matchmaking
      ? setInterval(async () => {
          const other = await findMatch(game.id, match.created_at).catch(() => null);
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
      setError(matchmaking ? 'Nobody else is looking for a match right now. Try again, or challenge a friend.' : 'Your friend didn\'t answer in time.');
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
      const found = await findMatch(game.id);
      if (found) return navigate(`/vs/match/${found.id}`, { replace: true });
      const ids = sentenceIds();
      if (ids.length < ROUNDS) return setError(`Pick more levels on the Games page: this game needs at least ${ROUNDS} sentences.`);
      const m = await createMatch(game.id, ids);
      waitFor(m, 'Looking for an opponent…', true);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  async function challenge(f: Friend) {
    setError('');
    try {
      const ids = sentenceIds();
      if (ids.length < ROUNDS) return setError(`Pick more levels on the Games page: this game needs at least ${ROUNDS} sentences.`);
      const m = await createMatch(game!.id, ids, f.user_id);
      notifyChallenge(m.id);
      waitFor(m, `Waiting for ${f.display_name} to accept…`, false);
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
      <Header title={`${game.title} · Vs`} onBack={() => { cancel(); navigate('/games'); }} />
      {waiting ? (
        <div className="card center" style={{ padding: 28 }}>
          <div className="game-icon" style={{ margin: '0 auto 12px' }}>{game.icon}</div>
          <p style={{ fontWeight: 600 }}>{waiting.label}</p>
          <p className="small muted">Keep this screen open. The match starts as soon as they join.</p>
          <button className="btn" onClick={cancel}>Cancel</button>
        </div>
      ) : (
        <>
          <p className="muted small" style={{ marginTop: 0 }}>
            {ROUNDS} rounds, same sentences for both players, no hints. Most correct answers wins; if it's a tie, the faster player wins.
          </p>
          {error && <div className="banner">{error}</div>}
          <button className="btn accent block" disabled={poolSize < ROUNDS} onClick={quickMatch}>Find an opponent</button>
          {poolSize < ROUNDS && <p className="small muted center">Select more levels on the Games page first.</p>}
          <div className="section-title">Challenge a friend</div>
          <div className="card">
            {friends.length === 0 ? (
              <p className="small muted" style={{ margin: 0 }}>Add friends on the Friends tab to challenge them.</p>
            ) : (
              <ul className="list">
                {friends.map((f) => (
                  <li key={f.user_id} className="spread">
                    <strong>{f.display_name}</strong>
                    <button className="btn primary sm" disabled={poolSize < ROUNDS} onClick={() => challenge(f)}>Challenge</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
      <GameStatsButton gameId={game.id} />
    </>
  );
}

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <header className="topbar">
      <div className="row">
        <button className="icon-btn" onClick={onBack} aria-label="Back"><IconBack /></button>
        <h1>{title}</h1>
      </div>
    </header>
  );
}
