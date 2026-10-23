import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { acceptMatch, cancelMatch, getMatch, ROUNDS, type Match } from '../lib/match';
import { currentUserId } from '../lib/social';
import { supabase } from '../lib/supabase';
import { getState } from '../lib/store';
import { gameById, gameName } from '../games/registry';
import { useT } from '../i18n';

/** Opened from a challenge notification: accept or decline. */
export default function ChallengePage() {
  const t = useT();
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [match, setMatch] = useState<Match | null | undefined>(undefined);
  const [from, setFrom] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const [m, me] = await Promise.all([getMatch(id), currentUserId()]);
      if (!m || m.player_b !== me) return setMatch(null);
      setMatch(m);
      const { data } = await supabase.from('profiles').select('display_name').eq('user_id', m.player_a).maybeSingle();
      if (data) setFrom(data.display_name);
    })().catch(() => setMatch(null));
  }, [id]);

  if (match === undefined) return <div className="center-screen">{t('Loading challenge…')}</div>;
  const game = match ? gameById(match.game) : undefined;
  const open = match && match.status === 'waiting';
  const name = from || t('A friend');

  return (
    <div className="center-screen">
      <div className="card center" style={{ width: '100%', maxWidth: 420, padding: 24 }}>
        {game && <div className="game-icon" style={{ margin: '0 auto 12px' }}>{game.icon}</div>}
        {!match ? (
          <p>{t("This challenge couldn't be found.")}</p>
        ) : open ? (
          <>
            <h2 style={{ marginTop: 0 }}>{t('{name} challenged you!', { name })}</h2>
            <p className="muted">
              {game ? gameName(game, getState().settings.learning) : t('A game')}{game?.kind ? '' : ` · ${t('{n} rounds, same sentences for both of you.', { n: ROUNDS })}`}
            </p>
            <div className="row" style={{ justifyContent: 'center', marginTop: 16 }}>
              <button className="btn" disabled={busy} onClick={async () => { await cancelMatch(id); navigate('/games'); }}>
                {t('Decline')}
              </button>
              <button
                className="btn accent"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await acceptMatch(id, getState().settings.learning);
                    navigate(`/vs/match/${id}`, { replace: true });
                  } catch (e) {
                    setError((e as Error).message);
                    setBusy(false);
                  }
                }}
              >
                {t('Accept')}
              </button>
            </div>
          </>
        ) : match.status === 'active' ? (
          <>
            <p>{t('This match has already started.')}</p>
            <button className="btn primary" onClick={() => navigate(`/vs/match/${id}`, { replace: true })}>{t('Rejoin')}</button>
          </>
        ) : (
          <p>{t('This challenge has expired. Challenges last a few minutes; you can challenge {name} back from the Friends tab.', { name })}</p>
        )}
        {error && <div className="error">{error}</div>}
        {!open && <button className="btn" style={{ marginTop: 12 }} onClick={() => navigate('/games')}>{t('Back to games')}</button>}
      </div>
    </div>
  );
}
