import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useContent } from '../lib/content';
import { updateSettings, useStore } from '../lib/store';
import { studyCounts } from '../lib/srs';
import { streak } from '../lib/stats';
import { langParams, useT } from '../i18n';
import LevelPicker from '../components/LevelPicker';
import InstallHint from '../components/InstallHint';
import type { Settings } from '../types';

export default function Study() {
  const t = useT();
  const content = useContent();
  const settings = useStore((s) => s.settings);
  const cards = useStore((s) => s.cards);
  const logs = useStore((s) => s.logs);
  const navigate = useNavigate();
  const names = langParams(settings.learning);

  const levels = settings.studyLevels.filter((l) => content.levels.some((x) => x.level === l));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const counts = useMemo(() => studyCounts(content, levels, settings), [content, levels.join(','), settings, cards]);
  const newLeft = Math.max(0, settings.newPerDay - counts.newToday);
  const newInSession = Math.min(newLeft, counts.newAvailable, Math.max(0, settings.sessionSize - counts.due));
  const todayCount = useMemo(() => {
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    return logs.filter((l) => Date.parse(l.at) >= since.getTime()).length;
  }, [logs]);
  const days = useMemo(() => streak(logs), [logs]);

  const canStudy = levels.length > 0 && (counts.due > 0 || newInSession > 0);

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden>句</div>
          <h1>Dargos Ju</h1>
        </div>
        <div className="small muted" style={{ textAlign: 'right' }}>
          {t('{n} today', { n: todayCount })}
          {days > 0 && <> · {t('{n} day streak', { n: days })}</>}
        </div>
      </header>

      <Link to="/settings" className="mode-chip" aria-label={t('Learning {target}. Change in Settings.', names)}>
        {t('Learning {target}', names)} <span aria-hidden>›</span>
      </Link>

      <InstallHint />

      <div className="card">
        <LevelPicker levels={content.levels} selected={levels} onChange={(studyLevels) => updateSettings({ studyLevels })} />
      </div>

      <div className="section-title">{t('Cards')}</div>
      <div className="card">
        <div className="segmented" role="group" aria-label={t('Card direction')}>
          {(
            [
              ['both', t('Both')],
              ['r', t('Reading')],
              ['p', t('Producing')],
            ] as [Settings['directions'], string][]
          ).map(([v, label]) => (
            <button key={v} className={settings.directions === v ? 'on' : ''} aria-pressed={settings.directions === v} onClick={() => updateSettings({ directions: v })}>
              {label}
            </button>
          ))}
        </div>
        <p className="small muted" style={{ margin: '10px 2px 0' }}>
          {t('Reading shows {target} and you translate it. Producing shows {native} and you say or write the {target}.', names)}
        </p>
      </div>

      <div className="stat-grid" style={{ marginTop: 12, gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="stat">
          <div className="value">{levels.length ? counts.due : '–'}</div>
          <div className="label">{t('Due now')}</div>
        </div>
        <div className="stat">
          <div className="value">{levels.length ? newInSession : '–'}</div>
          <div className="label">{t('New this session')}</div>
        </div>
        <div className="stat">
          <div className="value">{levels.length ? counts.newAvailable : '–'}</div>
          <div className="label">{t('Unseen')}</div>
        </div>
      </div>

      <div className="stack" style={{ marginTop: 16 }}>
        <button className="btn accent block" disabled={!canStudy} onClick={() => navigate('/review?mode=study')}>
          {canStudy ? t('Start session') : levels.length ? t('All caught up') : t('Pick a level to start')}
        </button>
        <button className="btn block" disabled={!levels.length || counts.seen === 0} onClick={() => navigate('/review?mode=extra')}>
          {t('Extra practice on weak cards')}
        </button>
        {levels.length > 0 && counts.due === 0 && newLeft === 0 && counts.newAvailable > 0 && (
          <p className="small muted center">{t("You've reached today's limit of {n} new cards. You can raise it in Settings.", { n: settings.newPerDay })}</p>
        )}
      </div>
    </>
  );
}
