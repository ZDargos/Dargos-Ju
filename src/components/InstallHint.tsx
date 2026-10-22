import { useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { useT } from '../i18n';

const KEY = 'dj:install-hint-dismissed';

function isIosSafariTab(): boolean {
  if (Capacitor.isNativePlatform()) return false;
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true || matchMedia('(display-mode: standalone)').matches;
  return ios && !standalone;
}

/** Tells iPhone and iPad users in Safari how to add the app to their home screen. */
export default function InstallHint() {
  const t = useT();
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(KEY) === '1' || !isIosSafariTab();
    } catch {
      return !isIosSafariTab();
    }
  });
  if (hidden) return null;
  const dismiss = () => {
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      /* private mode */
    }
    setHidden(true);
  };
  return (
    <div className="banner" style={{ background: 'var(--surface-2)' }}>
      <div className="spread" style={{ alignItems: 'flex-start' }}>
        <div>
          <strong>{t('Install on your iPhone')}</strong>
          <div className="small" style={{ marginTop: 2 }}>
            {t('Tap the Share button in Safari, then Add to Home Screen. It opens full screen and works offline.')}
          </div>
        </div>
        <button className="btn ghost sm" onClick={dismiss} aria-label={t('Dismiss')}>✕</button>
      </div>
    </div>
  );
}
