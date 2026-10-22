import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { voiceStatus, type VoiceStatus } from '../lib/tts';
import { useSettings } from '../lib/store';
import { langName, useT } from '../i18n';
import type { LearnLang } from '../lib/learn';

/** Shows whether a voice for the language being learned is available, with buttons to fix it. */
export function VoiceStatusPanel() {
  const t = useT();
  const lang = useSettings().learning;
  const [status, setStatus] = useState<VoiceStatus | null>(null);
  const name = langName(lang);
  useEffect(() => {
    const refresh = () => {
      voiceStatus(lang)
        .then(setStatus)
        .catch((e) => setStatus({ available: false, detail: (e as Error).message, actions: [] }));
    };
    refresh();
    // Re-check when returning from Android settings.
    const onVisible = () => document.visibilityState === 'visible' && setTimeout(refresh, 800);
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [lang]);
  if (!status) return <div className="small muted">{t('Checking for a {lang} voice…', { lang: name })}</div>;
  return (
    <div role="status">
      <div className="small" style={{ color: status.available ? 'var(--right)' : 'var(--wrong)', fontWeight: 600 }}>
        {status.available ? `✓ ${t('{lang} voice available', { lang: name })}` : `✕ ${t('No {lang} voice', { lang: name })}`}
      </div>
      <div className="small muted" style={{ marginTop: 2 }}>{status.detail}</div>
      {status.actions.length > 0 && (
        <div className="row wrap" style={{ marginTop: 8 }}>
          {status.actions.map((a) => (
            <button key={a.label} className="btn sm" onClick={a.run}>{a.label}</button>
          ))}
          <button className="btn ghost sm" onClick={() => voiceStatus(lang).then(setStatus)}>{t('Check again')}</button>
        </div>
      )}
    </div>
  );
}

/** App-wide banner shown when something tried to play audio without a voice for that language. */
export function NoVoiceBanner() {
  const t = useT();
  const [missing, setMissing] = useState<LearnLang | null>(null);
  useEffect(() => {
    const on = (e: Event) => setMissing(((e as CustomEvent).detail as LearnLang) ?? 'zh');
    window.addEventListener('dj:no-voice', on);
    return () => window.removeEventListener('dj:no-voice', on);
  }, []);
  if (!missing) return null;
  return (
    <div className="banner" role="alert" style={{ position: 'fixed', left: 12, right: 12, bottom: 'calc(84px + env(safe-area-inset-bottom))', zIndex: 20, maxWidth: 640, margin: '0 auto', boxShadow: 'var(--shadow)' }}>
      <div className="spread">
        <span>{t("No {lang} voice on this device, so audio can't play.", { lang: langName(missing) })}</span>
        <button className="btn ghost sm" onClick={() => setMissing(null)} aria-label={t('Dismiss')}>✕</button>
      </div>
      <Link to="/settings" onClick={() => setMissing(null)} style={{ fontWeight: 600 }}>{t('How to fix it')}</Link>
    </div>
  );
}
