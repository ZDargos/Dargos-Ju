import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { friendlyAuthError } from '../lib/auth';
import { currentUiLang, setSignedOutLang, t, type UiLang } from '../i18n';
import { fetchSignupMode, type SignupMode } from './AdminUsers';

export default function Login() {
  // Signed out there are no settings yet: the language follows the device, with a switch here.
  const [lang, setLang] = useState<UiLang>(currentUiLang());
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [signupMode, setSignupMode] = useState<SignupMode>('invite');
  useEffect(() => {
    fetchSignupMode().then(setSignupMode).catch(() => undefined);
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  }, [lang]);

  const switchLang = (l: UiLang) => {
    setSignedOutLang(l);
    setLang(l);
  };

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
        if (!data.session) setNotice(t('Account created. Check your email for a confirmation link, then sign in.'));
      }
    } catch (err) {
      setError(friendlyAuthError((err as Error).message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="main" key={lang}>
      <div className="login">
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <div className="segmented" role="group" aria-label="Language / 语言" style={{ width: 160 }}>
            <button type="button" className={lang === 'en' ? 'on' : ''} aria-pressed={lang === 'en'} onClick={() => switchLang('en')} lang="en">English</button>
            <button type="button" className={lang === 'zh' ? 'on' : ''} aria-pressed={lang === 'zh'} onClick={() => switchLang('zh')} lang="zh-CN">中文</button>
          </div>
        </div>
        <div className="brand" style={{ justifyContent: 'center', margin: '12px 0 8px' }}>
          <div className="brand-mark" style={{ width: 52, height: 52, fontSize: 30, borderRadius: 14 }} aria-hidden>句</div>
        </div>
        <h1 className="center" style={{ margin: '8px 0 4px' }}>Dargos Ju</h1>
        <p className="center muted" style={{ marginTop: 0 }}>{t('Learn Chinese or English, one sentence at a time.')}</p>
        <form className="card" onSubmit={submit}>
          <div className="segmented" style={{ marginBottom: 16 }}>
            <button type="button" className={mode === 'in' ? 'on' : ''} aria-pressed={mode === 'in'} onClick={() => setMode('in')}>{t('Sign in')}</button>
            <button type="button" className={mode === 'up' ? 'on' : ''} aria-pressed={mode === 'up'} onClick={() => setMode('up')}>{t('Create account')}</button>
          </div>
          <div className="field">
            <label htmlFor="email">{t('Email')}</label>
            <input id="email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="pw">{t('Password')}</label>
            <input id="pw" className="input" type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} minLength={6} required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {mode === 'up' && signupMode === 'invite' && <p className="small muted" style={{ marginTop: 0 }}>{t('Sign-ups are invite-only. Use the email address you were invited with.')}</p>}
          <button className="btn primary block" disabled={busy}>{busy ? t('Please wait…') : mode === 'in' ? t('Sign in') : t('Create account')}</button>
          {error && <div className="error" role="alert">{error}</div>}
          {notice && <div className="banner" role="status" style={{ marginTop: 12, marginBottom: 0 }}>{notice}</div>}
        </form>
      </div>
    </div>
  );
}
