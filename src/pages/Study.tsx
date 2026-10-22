import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useContent } from '../lib/content';
import { updateSettings, useStore } from '../lib/store';
import { studyCounts } from '../lib/srs';
import { streak } from '../lib/stats';
import LevelPicker from '../components/LevelPicker';
import InstallHint from '../components/InstallHint';
import type { Settings } from '../types';

export default function Study() {
  const content = useContent();
  const settings = useStore((s) => s.settings);
  const cards = useStore((s) => s.cards);
  const logs = useStore((s) => s.logs);
  const navigate = useNavigate();

  const levels = settings.studyLevels.filter((l) => content.levels.some((x) => x.level === l));
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
          <div className="brand-mark">句</div>
          <h1>Dargos Ju</h1>
        </div>
        <div className="small muted" style={{ textAlign: 'right' }}>
          {todayCount} today
          {days > 0 && <> · {days} day streak</>}
        </div>
      </header>

      <InstallHint />

      <div className="card">
        <LevelPicker levels={content.levels} selected={levels} onChange={(studyLevels) => updateSettings({ studyLevels })} />
      </div>

      <div className="section-title">Cards</div>
      <div className="card">
        <div className="segmented" role="group" aria-label="Card direction">
          {(
            [
              ['both', 'Both'],
              ['r', 'Reading'],
              ['p', 'Producing'],
            ] as [Settings['directions'], string][]
          ).map(([v, label]) => (
            <button key={v} className={settings.directions === v ? 'on' : ''} onClick={() => updateSettings({ directions: v })}>
              {label}
            </button>
          ))}
        </div>
        <p className="small muted" style={{ margin: '10px 2px 0' }}>
          Reading shows Chinese and you translate. Producing shows English and you say or write the Chinese.
        </p>
      </div>

      <div className="stat-grid" style={{ marginTop: 12, gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="stat">
          <div className="value">{levels.length ? counts.due : '–'}</div>
          <div className="label">Due now</div>
        </div>
        <div className="stat">
          <div className="value">{levels.length ? newInSession : '–'}</div>
          <div className="label">New this session</div>
        </div>
        <div className="stat">
          <div className="value">{levels.length ? counts.newAvailable : '–'}</div>
          <div className="label">Unseen</div>
        </div>
      </div>

      <div className="stack" style={{ marginTop: 16 }}>
        <button className="btn accent block" disabled={!canStudy} onClick={() => navigate('/review?mode=study')}>
          {canStudy ? `Start session` : levels.length ? 'All caught up' : 'Pick a level to start'}
        </button>
        <button className="btn block" disabled={!levels.length || counts.seen === 0} onClick={() => navigate('/review?mode=extra')}>
          Extra practice on weak cards
        </button>
        {levels.length > 0 && counts.due === 0 && newLeft === 0 && counts.newAvailable > 0 && (
          <p className="small muted center">You've reached today's limit of {settings.newPerDay} new cards. You can raise it in Settings.</p>
        )}
      </div>
    </>
  );
}
