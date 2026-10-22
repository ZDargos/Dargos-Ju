import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';

const scriptOf = (html: string) => /assets\/index-[\w-]+\.js/.exec(html)?.[0] ?? null;

/**
 * Website / home-screen app: notices when a newer version has been deployed (for example when an
 * installed iPhone app is resumed from the background) and offers a one-tap reload.
 */
export default function UpdatePrompt() {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (!import.meta.env.PROD || Capacitor.isNativePlatform()) return;
    const running = scriptOf(document.documentElement.innerHTML);
    if (!running) return;
    const check = async () => {
      if (!navigator.onLine) return;
      try {
        const html = await (await fetch('./', { cache: 'no-store' })).text();
        const latest = scriptOf(html);
        if (latest && latest !== running) setAvailable(true);
      } catch {
        /* offline */
      }
    };
    const onVisible = () => document.visibilityState === 'visible' && check();
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(check, 30 * 60 * 1000);
    check();
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(timer);
    };
  }, []);

  if (!available) return null;
  return (
    <div className="banner" style={{ position: 'fixed', left: 12, right: 12, top: 'calc(env(safe-area-inset-top) + 12px)', zIndex: 25, maxWidth: 640, margin: '0 auto', boxShadow: 'var(--shadow)' }}>
      <div className="spread">
        <span>A new version of Dargos Ju is ready.</span>
        <button className="btn primary sm" onClick={() => location.reload()}>Update</button>
      </div>
    </div>
  );
}
