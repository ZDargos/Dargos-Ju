import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { cancelChallenge, CHALLENGE_WAIT_MS, onOutgoingEvent, resumeOutgoing, useOutgoing } from '../lib/outgoing';
import { gameById, gameName } from '../games/registry';
import { useSettings } from '../lib/store';
import { useT } from '../i18n';

/** Top-of-screen banner for a challenge you're waiting on, with Cancel. Opens the match when it's accepted. */
export default function ChallengeBanner() {
  const t = useT();
  const navigate = useNavigate();
  const lang = useSettings().learning;
  const outgoing = useOutgoing();
  const [note, setNote] = useState('');
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    resumeOutgoing();
    return onOutgoingEvent((e) => {
      if (e.type === 'accepted') navigate(`/vs/match/${e.matchId}`);
      else {
        setNote(e.type === 'declined' ? t('{name} declined your challenge.', { name: e.friend }) : t("{name} didn't answer in time.", { name: e.friend }));
        setTimeout(() => setNote(''), 5000);
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!outgoing) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [outgoing]);

  if (!outgoing && !note) return null;
  if (!outgoing)
    return (
      <div className="challenge-banner" role="status">
        <span className="grow">{note}</span>
        <button className="btn ghost sm" onClick={() => setNote('')} aria-label={t('Dismiss')}>✕</button>
      </div>
    );
  const left = Math.max(0, Math.ceil((outgoing.createdAt + CHALLENGE_WAIT_MS - now) / 1000));
  return (
    <div className="challenge-banner" role="status">
      <span className="challenge-pulse" aria-hidden />
      <span className="grow">
        {t('Challenging {name} to {game}…', { name: outgoing.friend, game: gameName(gameById(outgoing.game), lang) })}
        <span className="small muted"> {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</span>
      </span>
      <button className="btn sm" onClick={() => cancelChallenge()}>{t('Cancel')}</button>
    </div>
  );
}
