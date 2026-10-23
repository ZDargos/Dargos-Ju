import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CHANGELOG } from '../lib/changelog';
import { useT } from '../i18n';

const KEY = 'dj:seen-update';
/** Changes whenever a changelog entry is added or grows, i.e. with every update people can see. */
const updateKey = () => `${CHANGELOG[0].date}#${CHANGELOG[0].items.length}`;

/**
 * The first time the app opens after an update, a small pop-up says so and points to What's new in
 * Settings. Shown once per update; brand-new users don't get it.
 */
export default function UpdateNotice() {
  const t = useT();
  const navigate = useNavigate();
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      const seen = localStorage.getItem(KEY);
      if (seen === null) localStorage.setItem(KEY, updateKey());
      else if (seen !== updateKey()) setShow(true);
    } catch {
      /* storage blocked: skip the notice */
    }
  }, []);

  if (!show) return null;
  const close = () => {
    try {
      localStorage.setItem(KEY, updateKey());
    } catch {
      /* it may show again */
    }
    setShow(false);
  };
  const latest = CHANGELOG[0].items;
  return (
    <div className="sheet-backdrop" onClick={close}>
      <div className="sheet update-notice" role="dialog" aria-label={t('Dargos Ju has been updated')} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>🎉 {t('Dargos Ju has been updated')}</h3>
        <ul>
          {latest.slice(0, 5).map((item) => (
            <li key={item}>{t(item)}</li>
          ))}
          {latest.length > 5 && <li className="muted">{t('…and {n} more', { n: latest.length - 5 })}</li>}
        </ul>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn grow" onClick={close}>{t('OK')}</button>
          <button
            className="btn primary grow"
            onClick={() => {
              close();
              navigate('/settings?section=whats-new');
            }}
          >
            {t("See what's new")}
          </button>
        </div>
      </div>
    </div>
  );
}
