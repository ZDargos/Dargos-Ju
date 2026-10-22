import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export type SignupMode = 'invite' | 'open';

export async function fetchSignupMode(): Promise<SignupMode> {
  const { data } = await supabase.from('app_config').select('value').eq('key', 'signup_mode').maybeSingle();
  return data?.value === 'open' ? 'open' : 'invite';
}

export function SignupModeSwitch() {
  const [mode, setMode] = useState<SignupMode | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchSignupMode().then(setMode).catch((e) => setError((e as Error).message));
  }, []);

  const change = async (next: SignupMode) => {
    if (next === mode) return;
    if (next === 'open' && !confirm('Let anyone with the link create an account?')) return;
    setError('');
    const { error } = await supabase.from('app_config').update({ value: next, updated_at: new Date().toISOString() }).eq('key', 'signup_mode');
    if (error) setError(error.message);
    else setMode(next);
  };

  return (
    <>
      <div className="section-title">Sign-ups</div>
      <div className="card">
        <div className="segmented">
          <button className={mode === 'invite' ? 'on' : ''} onClick={() => change('invite')} disabled={!mode}>Invite only</button>
          <button className={mode === 'open' ? 'on' : ''} onClick={() => change('open')} disabled={!mode}>Open to anyone</button>
        </div>
        <p className="small muted" style={{ marginBottom: 0 }}>
          {mode === 'open'
            ? 'Anyone with the link can create an account, except blocked emails.'
            : 'Only emails on the invite list below can create an account.'}{' '}
          Existing accounts keep working either way.
        </p>
        {error && <div className="error">{error}</div>}
      </div>
    </>
  );
}

interface UserRow {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  blocked: boolean;
  is_admin: boolean;
  cards: number;
  reviews: number;
  last_review_at: string | null;
}

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'never');

export function UsersPanel() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [blocked, setBlocked] = useState<{ email: string }[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = async () => {
    const [u, b] = await Promise.all([supabase.rpc('admin_list_users'), supabase.from('blocked_emails').select('email').order('blocked_at')]);
    if (u.error) setError(u.error.message);
    else setUsers(u.data as UserRow[]);
    if (!b.error) setBlocked(b.data ?? []);
  };
  useEffect(() => {
    load();
  }, []);

  const run = async (label: string, fn: () => PromiseLike<{ error: { message: string } | null }>) => {
    setBusy(true);
    setError('');
    setMessage('');
    const { error } = await fn();
    setBusy(false);
    if (error) setError(error.message);
    else {
      setMessage(label);
      setOpen(null);
      load();
    }
  };

  const erase = (u: UserRow) =>
    confirm(`Erase all study progress for ${u.email}? Their account stays. This can't be undone.`) &&
    run(`Erased progress for ${u.email}.`, () => supabase.rpc('admin_erase_user_data', { target: u.id }));
  const block = (u: UserRow, value: boolean) =>
    (!value || confirm(`Block ${u.email}? They'll be signed out and can't sign in or sign up again.`)) &&
    run(value ? `Blocked ${u.email}.` : `Unblocked ${u.email}.`, () => supabase.rpc('admin_set_blocked', { target: u.id, block: value }));
  const remove = (u: UserRow) => {
    if (!confirm(`Delete ${u.email} and all their progress? This can't be undone.`)) return;
    const alsoBlock = confirm(`Also block ${u.email} from signing up again?\n\nOK = block them, Cancel = they may sign up again.`);
    run(`Deleted ${u.email}${alsoBlock ? ' and blocked the email' : ''}.`, () => supabase.rpc('admin_delete_user', { target: u.id, also_block: alsoBlock }));
  };
  const unblockEmail = (email: string) => run(`Unblocked ${email}.`, () => supabase.from('blocked_emails').delete().eq('email', email));

  const orphanBlocked = blocked.filter((b) => !users.some((u) => u.email.toLowerCase() === b.email));

  return (
    <>
      <div className="section-title">People · {users.length}</div>
      <div className="card">
        {error && <div className="error" style={{ marginTop: 0 }}>{error}</div>}
        {message && <div className="banner">{message}</div>}
        <ul className="list">
          {users.map((u) => (
            <li key={u.id}>
              <div className="spread" style={{ cursor: u.is_admin ? 'default' : 'pointer' }} onClick={() => !u.is_admin && setOpen(open === u.id ? null : u.id)}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {u.email} {u.is_admin && <span className="tag">Admin</span>} {u.blocked && <span className="tag new">Blocked</span>}
                  </div>
                  <div className="small muted">
                    Joined {day(u.created_at)} · {u.reviews} answers · last studied {day(u.last_review_at)}
                  </div>
                </div>
                {!u.is_admin && <span className="small muted">{open === u.id ? '▲' : '▼'}</span>}
              </div>
              {open === u.id && (
                <div className="row wrap" style={{ marginTop: 10 }}>
                  <button className="btn sm" disabled={busy || u.reviews + u.cards === 0} onClick={() => erase(u)}>Erase progress</button>
                  <button className="btn sm" disabled={busy} onClick={() => block(u, !u.blocked)}>{u.blocked ? 'Unblock' : 'Block'}</button>
                  <button className="btn sm" disabled={busy} style={{ color: 'var(--wrong)' }} onClick={() => remove(u)}>Delete account</button>
                </div>
              )}
            </li>
          ))}
        </ul>
        {orphanBlocked.length > 0 && (
          <>
            <div className="small muted" style={{ marginTop: 12, fontWeight: 600 }}>Blocked emails without an account</div>
            <ul className="list">
              {orphanBlocked.map((b) => (
                <li key={b.email} className="spread">
                  <span className="small">{b.email}</span>
                  <button className="btn ghost sm" disabled={busy} onClick={() => unblockEmail(b.email)}>Unblock</button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </>
  );
}
