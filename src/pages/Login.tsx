import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { friendlyAuthError } from '../lib/auth';

export default function Login() {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (mode === 'in') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
        if (error) throw error;
        if (!data.session) setNotice('Account created. Check your email for a confirmation link, then sign in.');
      }
    } catch (err) {
      setError(friendlyAuthError((err as Error).message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="main">
      <div className="login">
        <div className="brand" style={{ justifyContent: 'center', marginBottom: 8 }}>
          <div className="brand-mark" style={{ width: 52, height: 52, fontSize: 30, borderRadius: 14 }}>句</div>
        </div>
        <h1 className="center" style={{ margin: '8px 0 4px' }}>Dargos Ju</h1>
        <p className="center muted" style={{ marginTop: 0 }}>Learn Chinese one sentence at a time.</p>
        <form className="card" onSubmit={submit}>
          <div className="segmented" style={{ marginBottom: 16 }}>
            <button type="button" className={mode === 'in' ? 'on' : ''} onClick={() => setMode('in')}>Sign in</button>
            <button type="button" className={mode === 'up' ? 'on' : ''} onClick={() => setMode('up')}>Create account</button>
          </div>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="pw">Password</label>
            <input id="pw" className="input" type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} minLength={6} required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {mode === 'up' && <p className="small muted" style={{ marginTop: 0 }}>Sign-ups are invite-only. Use the email address you were invited with.</p>}
          <button className="btn primary block" disabled={busy}>{busy ? 'Please wait…' : mode === 'in' ? 'Sign in' : 'Create account'}</button>
          {error && <div className="error">{error}</div>}
          {notice && <div className="banner" style={{ marginTop: 12, marginBottom: 0 }}>{notice}</div>}
        </form>
      </div>
    </div>
  );
}
