import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { acceptMatch, cancelMatch, watchMyMatches, type Match } from '../lib/match';
import { supabase } from '../lib/supabase';
import { gameById } from '../games/registry';
import { getState } from '../lib/store';
import { useT } from '../i18n';

const CHALLENGE_TTL_MS = 3 * 60 * 1000;

interface Invite {
  match: Match;
  from: string;
}

/** Shows incoming game challenges from friends anywhere in the app. */
export default function ChallengeListener({ userId }: { userId: string }) {
  const [invites, setInvites] = useState<Invite[]>([]);
  const navigate = useNavigate();
  const location = useLocation();
  const t = useT();

  useEffect(() => {
    const add = async (m: Match) => {
      const fresh = Date.now() - Date.parse(m.created_at) < CHALLENGE_TTL_MS;
      if (m.player_b !== userId || m.is_public) return;
      if (m.status !== 'waiting' || !fresh) {
        setInvites((list) => list.filter((i) => i.match.id !== m.id));
        return;
      }
      const { data } = await supabase.from('profiles').select('display_name').eq('user_id', m.player_a).maybeSingle();
      setInvites((list) => (list.some((i) => i.match.id === m.id) ? list : [...list, { match: m, from: data?.display_name ?? t('A friend') }]));
    };
    // Challenges sent while the app was closed.
    supabase
      .from('matches')
      .select('*')
      .eq('player_b', userId)
      .eq('status', 'waiting')
      .gte('created_at', new Date(Date.now() - CHALLENGE_TTL_MS).toISOString())
      .then(({ data }) => (data ?? []).forEach((m) => add(m as Match)));
    return watchMyMatches(userId, add);
  }, [userId]);

  // The challenge and match screens already show it.
  if (!invites.length || /^\/(challenge|vs)\//.test(location.pathname)) return null;
  const { match, from } = invites[0];
  const game = gameById(match.game);
  const dismiss = () => setInvites((list) => list.filter((i) => i.match.id !== match.id));

  return (
    <div className="banner" style={{ position: 'fixed', left: 12, right: 12, top: 'calc(env(safe-area-inset-top) + 12px)', zIndex: 30, maxWidth: 640, margin: '0 auto', boxShadow: 'var(--shadow)' }}>
      <div style={{ fontWeight: 600 }}>{t('{name} challenged you to {game}!', { name: from, game: game ? t(game.title) : t('a game') })}</div>
      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn sm" onClick={() => { cancelMatch(match.id); dismiss(); }}>{t('Decline')}</button>
        <button
          className="btn primary sm"
          onClick={async () => {
            dismiss();
            try {
              await acceptMatch(match.id, getState().settings.learning);
              navigate(`/vs/match/${match.id}`);
            } catch (e) {
              alert((e as Error).message);
            }
          }}
        >
          {t('Accept')}
        </button>
      </div>
    </div>
  );
}
