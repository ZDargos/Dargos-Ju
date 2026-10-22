import { useEffect, useState } from 'react';
import { useT } from '../i18n';
import { disablePush, enablePush, getPrefs, NOTIFICATION_TYPES, pushState, savePrefs, type NotificationPrefs, type PushState } from '../lib/push';
import { msg } from '../i18n/msg';

function Switch({ checked, disabled, onChange, label }: { checked: boolean; disabled?: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="switch" aria-label={label} style={{ opacity: disabled ? 0.5 : 1 }}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span />
    </label>
  );
}

const STATE_HELP: Record<PushState, string> = {
  unsupported: msg("This app can't show notifications here. Use the website version, or on iPhone add it to your home screen."),
  'needs-install': msg('On iPhone, notifications work once Dargos Ju is on your home screen: tap Share, then Add to Home Screen, and open it from there.'),
  denied: msg('Notifications are blocked for this site. Allow them in your browser or phone settings, then come back.'),
  off: msg('Get notified on this device, even when the app is closed.'),
  on: msg('This device gets notifications.'),
};

export default function NotificationSettings() {
  const t = useT();
  const [state, setState] = useState<PushState | null>(null);
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    pushState().then(setState).catch(() => setState('unsupported'));
    getPrefs().then(setPrefs).catch(() => undefined);
  }, []);

  const toggleDevice = async (on: boolean) => {
    setBusy(true);
    setError('');
    try {
      setState(on ? await enablePush() : await disablePush());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const update = async (patch: Partial<NotificationPrefs>) => {
    if (!prefs) return;
    const next = { ...prefs, ...patch };
    setPrefs(next);
    try {
      await savePrefs(next);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (!state) return null;
  const canToggle = state === 'on' || state === 'off';

  return (
    <>
      <div className="toggle-row">
        <div>
          <div style={{ fontWeight: 600 }}>{t('Notifications on this device')}</div>
          <div className="small muted">{t(STATE_HELP[state])}</div>
        </div>
        {canToggle && <Switch label={t('Notifications on this device')} checked={state === 'on'} disabled={busy} onChange={toggleDevice} />}
      </div>
      {prefs && (
        <>
          <div className="toggle-row">
            <div>
              <div style={{ fontWeight: 600 }}>{t('Allow notifications')}</div>
              <div className="small muted">{t('Turn every notification type on or off, on all your devices.')}</div>
            </div>
            <Switch label={t('Allow notifications')} checked={prefs.enabled} onChange={(enabled) => update({ enabled })} />
          </div>
          {NOTIFICATION_TYPES.map((n) => (
            <div key={n.key} className="toggle-row" style={{ paddingLeft: 12 }}>
              <div>
                <div style={{ fontWeight: 600 }}>{t(n.label)}</div>
                <div className="small muted">{t(n.help)}</div>
              </div>
              <Switch label={t(n.label)} checked={prefs.enabled && prefs[n.key]} disabled={!prefs.enabled} onChange={(v) => update({ [n.key]: v })} />
            </div>
          ))}
        </>
      )}
      {error && <div className="error">{error}</div>}
    </>
  );
}
