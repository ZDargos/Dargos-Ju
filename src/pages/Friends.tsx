import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  acceptFriend,
  currentUserId,
  leaderboard,
  listFriends,
  removeFriend,
  searchProfiles,
  sendFriendRequest,
  streakFromDays,
  summary,
  useMyProfile,
  type Friend,
  type LeaderRow,
  type Period,
  type Profile,
  type Summary,
} from '../lib/social';
import { supabase } from '../lib/supabase';
import NamePrompt from '../components/NamePrompt';
import { IconBack } from '../components/Icons';
import { useT } from '../i18n';
import { msg } from '../i18n/msg';

const PERIODS: [Period, string][] = [
  ['day', msg('Today')],
  ['week', msg('This week')],
  ['all', msg('All time')],
]; // labels are translated where shown

export default function Friends() {
  const t = useT();
  const { id } = useParams();
  const { profile, reload } = useMyProfile();
  if (profile === null) return <div className="center-screen">{t('Loading…')}</div>;
  if (profile === false)
    return (
      <>
        <header className="topbar"><h1>{t('Friends')}</h1></header>
        <NamePrompt onSaved={reload} />
      </>
    );
  return id ? <Compare friendId={id} /> : <FriendsHome myName={profile.display_name} onRenamed={reload} />;
}

function FriendsHome({ myName, onRenamed }: { myName: string; onRenamed: () => void }) {
  const t = useT();
  const navigate = useNavigate();
  const [period, setPeriod] = useState<Period>('week');
  const [board, setBoard] = useState<LeaderRow[] | null>(null);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Profile[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [renaming, setRenaming] = useState(false);

  const loadFriends = useCallback(() => listFriends().then(setFriends).catch((e) => setError(e.message)), []);
  const loadBoard = useCallback(() => leaderboard(period).then(setBoard).catch((e) => setError(e.message)), [period]);
  useEffect(() => {
    loadFriends();
  }, [loadFriends]);
  useEffect(() => {
    loadBoard();
  }, [loadBoard]);

  // Live updates when someone sends or accepts a request.
  useEffect(() => {
    let cleanup = () => {};
    currentUserId().then((me) => {
      if (!me) return;
      const ch = supabase
        .channel(`friends-${me}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, () => {
          loadFriends();
          loadBoard();
        })
        .subscribe();
      cleanup = () => supabase.removeChannel(ch);
    });
    return () => cleanup();
  }, [loadFriends, loadBoard]);

  useEffect(() => {
    const timer = setTimeout(() => searchProfiles(query).then(setResults).catch(() => setResults([])), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const act = async (fn: () => Promise<unknown>, done: string) => {
    setError('');
    try {
      await fn();
      if (done) setMessage(done);
      loadFriends();
      loadBoard();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const accepted = friends.filter((f) => f.status === 'accepted');
  const incoming = friends.filter((f) => f.status === 'pending' && !f.outgoing);
  const outgoing = friends.filter((f) => f.status === 'pending' && f.outgoing);
  const known = new Set(friends.map((f) => f.user_id));
  const max = Math.max(1, ...(board ?? []).map((r) => r.answers));

  return (
    <>
      <header className="topbar">
        <h1>{t('Friends')}</h1>
        <button className="btn ghost sm" onClick={() => setRenaming((r) => !r)}>{myName}</button>
      </header>
      {renaming && <NamePrompt initial={myName} onSaved={() => { setRenaming(false); onRenamed(); loadBoard(); }} />}
      {error && <div className="error" style={{ marginBottom: 8 }}>{error}</div>}
      {message && <div className="banner">{message}</div>}

      {incoming.length > 0 && (
        <>
          <div className="section-title">{t('Friend requests')}</div>
          <div className="card">
            <ul className="list">
              {incoming.map((f) => (
                <li key={f.user_id} className="spread">
                  <strong>{f.display_name}</strong>
                  <div className="row">
                    <button className="btn ghost sm" onClick={() => act(() => removeFriend(f.user_id), t('Request declined.'))}>{t('Decline')}</button>
                    <button className="btn primary sm" onClick={() => act(() => acceptFriend(f.user_id), t('You and {name} are now friends.', { name: f.display_name }))}>{t('Accept')}</button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      <div className="section-title">{t('Leaderboard · sentences answered')}</div>
      <div className="card">
        <div className="segmented" style={{ marginBottom: 12 }}>
          {PERIODS.map(([p, label]) => (
            <button key={p} className={period === p ? 'on' : ''} aria-pressed={period === p} onClick={() => setPeriod(p)}>{t(label)}</button>
          ))}
        </div>
        {!board ? (
          <div className="small muted">{t('Loading…')}</div>
        ) : (
          <ol className="list" style={{ paddingLeft: 0 }}>
            {board.map((r, i) => (
              <li
                key={r.user_id}
                style={{ cursor: r.is_me ? 'default' : 'pointer' }}
                onClick={() => !r.is_me && navigate(`/friends/${r.user_id}`)}
              >
                <div className="spread">
                  <div className="row" style={{ minWidth: 0 }}>
                    <span style={{ width: 22, fontWeight: 700, color: i === 0 ? 'var(--hard)' : 'var(--muted)' }}>{i + 1}</span>
                    <span style={{ fontWeight: r.is_me ? 700 : 500 }}>{r.display_name}{r.is_me && ` ${t('(you)')}`}</span>
                  </div>
                  <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{r.answers}</strong>
                </div>
                <div className="meter" style={{ width: '100%', marginTop: 6 }}>
                  <div style={{ width: `${(r.answers / max) * 100}%`, background: r.is_me ? 'var(--accent)' : 'var(--bar)' }} />
                </div>
              </li>
            ))}
          </ol>
        )}
        {board && board.length === 1 && <p className="small muted" style={{ marginBottom: 0 }}>{t('Add friends below to compete with them.')}</p>}
      </div>

      <div className="section-title">{t('Friends')} · {accepted.length}</div>
      <div className="card">
        {accepted.length === 0 && <p className="small muted" style={{ marginTop: 0 }}>{t('No friends yet.')}</p>}
        <ul className="list">
          {accepted.map((f) => (
            <li key={f.user_id} className="spread">
              <Link to={`/friends/${f.user_id}`} style={{ fontWeight: 600, textDecoration: 'none' }}>{f.display_name}</Link>
              <Link to={`/friends/${f.user_id}`} className="btn sm">{t('Compare')}</Link>
            </li>
          ))}
          {outgoing.map((f) => (
            <li key={f.user_id} className="spread">
              <span>{f.display_name} <span className="small muted">· request sent</span></span>
              <button className="btn ghost sm" onClick={() => act(() => removeFriend(f.user_id), t('Request cancelled.'))}>{t('Cancel')}</button>
            </li>
          ))}
        </ul>
      </div>

      <div className="section-title">{t('Find players')}</div>
      <div className="card">
        <input id="friend-search" className="input" aria-label={t('Search players')} placeholder={t('Search by display name')} value={query} onChange={(e) => setQuery(e.target.value)} />
        {results.length === 0 && <p className="small muted" style={{ marginBottom: 0 }}>{query.trim() ? t('No players match that name.') : t('No other players yet.')}</p>}
        {results.length > 0 && (
          <ul className="list" style={{ maxHeight: 360, overflowY: 'auto' }}>
            {results.map((p) => (
              <li key={p.user_id} className="spread">
                <span>{p.display_name}</span>
                {known.has(p.user_id) ? (
                  <span className="small muted">{friends.find((f) => f.user_id === p.user_id)?.status === 'accepted' ? t('Friends') : t('Pending')}</span>
                ) : (
                  <button
                    className="btn primary sm"
                    onClick={() =>
                      act(async () => {
                        const r = await sendFriendRequest(p.user_id);
                        setMessage(r === 'accepted' ? t('You and {name} are now friends.', { name: p.display_name }) : t('Request sent to {name}.', { name: p.display_name }));
                      }, '')
                    }
                  >
                    {t('Add')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function Compare({ friendId }: { friendId: string }) {
  const t = useT();
  const navigate = useNavigate();
  const [me, setMe] = useState<Summary | null>(null);
  const [them, setThem] = useState<Summary | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const myId = await currentUserId();
        const [a, b, p] = await Promise.all([
          summary(myId!),
          summary(friendId),
          supabase.from('profiles').select('display_name').eq('user_id', friendId).maybeSingle(),
        ]);
        setMe(a);
        setThem(b);
        setName(p.data?.display_name ?? t('Friend'));
      } catch (e) {
        setError((e as Error).message === 'Not friends' ? t('You can only see the progress of friends who accepted your request.') : (e as Error).message);
      }
    })();
  }, [friendId]);

  const rows: [string, (s: Summary) => number | string][] = [
    [t('Answered today'), (s) => s.answers_day],
    [t('Answered this week'), (s) => s.answers_week],
    [t('Answered all time'), (s) => s.answers_total],
    [t('Day streak'), (s) => streakFromDays(s.active_days)],
    [t('Cards started'), (s) => s.cards_started],
    [t('Cards known well'), (s) => s.cards_known],
    [t('Recall, last 30 days'), (s) => (s.right_rate_30d === null ? '–' : `${Math.round(s.right_rate_30d * 100)}%`)],
  ];

  return (
    <>
      <header className="topbar">
        <div className="row">
          <button className="icon-btn" onClick={() => navigate('/friends')} aria-label={t('Back')}><IconBack /></button>
          <h1>{t('You vs {name}', { name: name || '…' })}</h1>
        </div>
      </header>
      {error && <div className="card empty">{error}</div>}
      {me && them && (
        <div className="card">
          <table className="simple">
            <thead>
              <tr>
                <th></th>
                <th style={{ textAlign: 'right' }}>{t('You')}</th>
                <th style={{ textAlign: 'right' }}>{name}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([label, get]) => {
                const a = get(me);
                const b = get(them);
                const lead = typeof a === 'number' && typeof b === 'number' ? (a > b ? 'a' : b > a ? 'b' : '') : '';
                return (
                  <tr key={label}>
                    <td>{label}</td>
                    <td style={{ textAlign: 'right', fontWeight: lead === 'a' ? 700 : 400, color: lead === 'a' ? 'var(--right)' : undefined }}>{a}</td>
                    <td style={{ textAlign: 'right', fontWeight: lead === 'b' ? 700 : 400, color: lead === 'b' ? 'var(--right)' : undefined }}>{b}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="small muted" style={{ marginBottom: 0 }}>
            {t('{name} last studied {when}.', { name, when: them.last_review_at ? new Date(them.last_review_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : t('never') })}
          </p>
        </div>
      )}
      {me && them && (
        <div className="stack" style={{ marginTop: 12 }}>
          <Link className="btn block" to={`/games?challenge=${friendId}`}>{t('Challenge {name} to a game', { name })}</Link>
          <button
            className="btn ghost block"
            onClick={async () => {
              if (!confirm(t('Remove {name} from your friends?', { name }))) return;
              await removeFriend(friendId);
              navigate('/friends');
            }}
          >
            {t('Remove friend')}
          </button>
        </div>
      )}
    </>
  );
}
