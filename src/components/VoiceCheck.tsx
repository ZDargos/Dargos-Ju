import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { voiceStatus, type VoiceStatus } from '../lib/tts';

/** Shows whether a Chinese voice is available, with buttons to fix it. */
export function VoiceStatusPanel() {
  const [status, setStatus] = useState<VoiceStatus | null>(null);
  const refresh = () => {
    voiceStatus()
      .then(setStatus)
      .catch((e) => setStatus({ available: false, detail: (e as Error).message, actions: [] }));
  };
  useEffect(() => {
    refresh();
    // Re-check when returning from Android settings.
    const onVisible = () => document.visibilityState === 'visible' && setTimeout(refresh, 800);
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);
  if (!status) return <div className="small muted">Checking for a Chinese voice…</div>;
  return (
    <div>
      <div className="small" style={{ color: status.available ? 'var(--right)' : 'var(--wrong)', fontWeight: 600 }}>
        {status.available ? '✓ Chinese voice available' : '✕ No Chinese voice'}
      </div>
      <div className="small muted" style={{ marginTop: 2 }}>{status.detail}</div>
      {status.actions.length > 0 && (
        <div className="row wrap" style={{ marginTop: 8 }}>
          {status.actions.map((a) => (
            <button key={a.label} className="btn sm" onClick={a.run}>{a.label}</button>
          ))}
          <button className="btn ghost sm" onClick={refresh}>Check again</button>
        </div>
      )}
    </div>
  );
}

/** App-wide banner shown when something tried to play audio without a Chinese voice. */
export function NoVoiceBanner() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const on = () => setShow(true);
    window.addEventListener('dj:no-voice', on);
    return () => window.removeEventListener('dj:no-voice', on);
  }, []);
  if (!show) return null;
  return (
    <div className="banner" style={{ position: 'fixed', left: 12, right: 12, bottom: 'calc(84px + env(safe-area-inset-bottom))', zIndex: 20, maxWidth: 640, margin: '0 auto', boxShadow: 'var(--shadow)' }}>
      <div className="spread">
        <span>No Chinese voice on this device, so audio can't play.</span>
        <button className="btn ghost sm" onClick={() => setShow(false)} aria-label="Dismiss">✕</button>
      </div>
      <Link to="/settings" onClick={() => setShow(false)} style={{ fontWeight: 600 }}>How to fix it</Link>
    </div>
  );
}
