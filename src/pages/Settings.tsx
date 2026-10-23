import { useState } from 'react';
import { Link } from 'react-router-dom';
import { updateSettings, useStore } from '../lib/store';
import { signOut } from '../lib/auth';
import { pullRemote, pushPending } from '../lib/sync';
import { speak, ttsAvailable } from '../lib/tts';
import { SAMPLE_SENTENCES as SAMPLE } from '../lib/audioKey';
import { GAMES } from '../games/registry';
import { langParams, useT } from '../i18n';
import { IconShield } from '../components/Icons';
import { VoiceStatusPanel } from '../components/VoiceCheck';
import NotificationSettings from '../components/NotificationSettings';
import type { LearnLang, Settings } from '../types';

function NumberField({ label, help, value, min, max, step = 1, onChange }: { label: string; help?: string; value: number; min: number; max: number; step?: number; onChange: (n: number) => void }) {
  return (
    <div className="toggle-row">
      <div>
        <div style={{ fontWeight: 600 }}>{label}</div>
        {help && <div className="small muted">{help}</div>}
      </div>
      <input
        className="input"
        style={{ width: 84, textAlign: 'center' }}
        type="number"
        inputMode="numeric"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
        }}
      />
    </div>
  );
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="switch" aria-label={label}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span />
    </label>
  );
}

function Choice<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segmented" role="group" aria-label={label} style={{ minWidth: 200 }}>
      {options.map(([v, text]) => (
        <button key={v} className={value === v ? 'on' : ''} aria-pressed={value === v} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  );
}

export default function SettingsPage({ isAdmin, email }: { isAdmin: boolean; email: string }) {
  const t = useT();
  const settings = useStore((s) => s.settings);
  const pending = useStore((s) => Object.keys(s.dirtyCards).length + Object.keys(s.unsyncedLogs).length + Object.keys(s.unsyncedRounds).length);
  const lastSyncAt = useStore((s) => s.lastSyncAt);
  const [syncMsg, setSyncMsg] = useState('');
  const [modeMsg, setModeMsg] = useState('');
  const names = langParams(settings.learning);

  const syncNow = async () => {
    setSyncMsg(t('Syncing…'));
    try {
      await pushPending();
      await pullRemote();
      setSyncMsg(t('Up to date'));
    } catch (e) {
      setSyncMsg(t('Sync failed: {error}', { error: (e as Error).message }));
    }
  };

  const switchMode = (learning: LearnLang) => {
    if (learning === settings.learning) return;
    updateSettings({ learning });
    // Shown in the new interface language, which follows the mode unless chosen in "App language".
    setModeMsg(learning === 'en' ? t('Now learning English. Your Chinese progress is kept.') : t('Now learning Chinese. Your English progress is kept.'));
  };

  return (
    <>
      <header className="topbar"><h1>{t('Settings')}</h1></header>

      {/* Always in both languages, so anyone can find the way back to a language they read. */}
      <div className="section-title">
        <span lang="zh-CN">语言</span> · <span lang="en">Language</span>
      </div>
      <div className="card" style={{ paddingTop: 4, paddingBottom: 4 }}>
        <div className="toggle-row wrap-row">
          <div>
            <div style={{ fontWeight: 600 }}>{t("I'm learning")}</div>
            <div className="small muted">{t('Each language keeps its own progress, stats and game history.')}</div>
          </div>
          <Choice<LearnLang>
            label={t("I'm learning")}
            value={settings.learning}
            options={[
              ['zh', '中文 Chinese'],
              ['en', '英语 English'],
            ]}
            onChange={switchMode}
          />
        </div>
        {modeMsg && <div className="banner" role="status" style={{ margin: '4px 0 8px' }}>{modeMsg}</div>}
        <div className="toggle-row wrap-row">
          <div>
            <div style={{ fontWeight: 600 }}>{t('App language')}</div>
            <div className="small muted">{t('Auto shows the app in Chinese when you learn English, and in English when you learn Chinese.')}</div>
          </div>
          <Choice<Settings['uiLang']>
            label={t('App language')}
            value={settings.uiLang}
            options={[
              ['auto', t('Auto')],
              ['zh', '中文'],
              ['en', 'English'],
            ]}
            onChange={(uiLang) => updateSettings({ uiLang })}
          />
        </div>
      </div>

      <div className="section-title">{t('Study')}</div>
      <div className="card" style={{ paddingTop: 4, paddingBottom: 4 }}>
        <NumberField label={t('Cards per session')} value={settings.sessionSize} min={5} max={200} onChange={(sessionSize) => updateSettings({ sessionSize })} />
        <NumberField label={t('New cards per day')} help={t('Across all levels')} value={settings.newPerDay} min={0} max={200} onChange={(newPerDay) => updateSettings({ newPerDay })} />
        <NumberField label={t('New word cards per day')} value={settings.wordsNewPerDay ?? 15} min={0} max={200} onChange={(wordsNewPerDay) => updateSettings({ wordsNewPerDay })} />
        <NumberField
          label={t('Target recall')}
          help={t('Higher means more frequent reviews (FSRS)')}
          value={Math.round(settings.retention * 100)}
          min={75}
          max={97}
          onChange={(n) => updateSettings({ retention: n / 100 })}
        />
      </div>

      <div className="section-title">{t('Games')}</div>
      <div className="card" style={{ paddingTop: 4, paddingBottom: 4 }}>
        {GAMES.filter((g) => g.hint).map((g) => (
          <div key={g.id} className="toggle-row">
            <div>
              <div style={{ fontWeight: 600 }}>{t('{game} hints', { game: t(g.title) })}</div>
              <div className="small muted">{t(g.hint!, names)}</div>
            </div>
            <Switch
              label={t('{game} hints', { game: t(g.title) })}
              checked={settings.hints[g.id as keyof Settings['hints']]}
              onChange={(v) => updateSettings({ hints: { ...settings.hints, [g.id]: v } })}
            />
          </div>
        ))}
        <NumberField label={t('Longest sentence in tile games')} help={t('Word tiles')} value={settings.gameMaxTiles} min={4} max={40} onChange={(gameMaxTiles) => updateSettings({ gameMaxTiles })} />
      </div>

      <div className="section-title">{t('Audio & display')}</div>
      <div className="card" style={{ paddingTop: 4, paddingBottom: 4 }}>
        <div className="toggle-row">
          <VoiceStatusPanel />
        </div>
        <div className="toggle-row">
          <div>
            <div style={{ fontWeight: 600 }}>{t('Speech speed')}</div>
            <div className="small muted">{settings.speechRate.toFixed(2)}×</div>
          </div>
          <div className="row">
            <input
              type="range"
              aria-label={t('Speech speed')}
              min={0.5}
              max={1.3}
              step={0.05}
              value={settings.speechRate}
              onChange={(e) => updateSettings({ speechRate: Number(e.target.value) })}
            />
            {ttsAvailable() && (
              <button className="btn sm" onClick={() => speak(SAMPLE[settings.learning], settings.speechRate, settings.learning).catch((e) => alert((e as Error).message))}>
                {t('Test')}
              </button>
            )}
          </div>
        </div>
        <div className="toggle-row wrap-row">
          <div style={{ fontWeight: 600 }}>{t('Text size')}</div>
          <Choice<Settings['textSize']>
            label={t('Text size')}
            value={settings.textSize}
            options={[
              ['normal', t('Normal')],
              ['large', t('Large')],
              ['xl', t('Extra large')],
            ]}
            onChange={(textSize) => updateSettings({ textSize })}
          />
        </div>
        <div className="toggle-row wrap-row">
          <div style={{ fontWeight: 600 }}>{t('Theme')}</div>
          <Choice<Settings['theme']>
            label={t('Theme')}
            value={settings.theme}
            options={[
              ['system', t('System')],
              ['light', t('Light')],
              ['dark', t('Dark')],
            ]}
            onChange={(theme) => updateSettings({ theme })}
          />
        </div>
      </div>

      <div className="section-title">{t('Notifications')}</div>
      <div className="card" style={{ paddingTop: 4, paddingBottom: 4 }}>
        <NotificationSettings />
      </div>

      <div className="section-title">{t('Account')}</div>
      <div className="card">
        <div className="spread">
          <div>
            <div style={{ fontWeight: 600 }}>{email}</div>
            <div className="small muted">
              {pending ? t('{n} changes waiting to sync', { n: pending }) : t('All progress synced')}
              {lastSyncAt && ` · ${t('last sync {time}', { time: new Date(lastSyncAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })}`}
            </div>
            {syncMsg && <div className="small muted" role="status">{syncMsg}</div>}
          </div>
          <button className="btn sm" onClick={syncNow}>{t('Sync now')}</button>
        </div>
        <div className="row wrap" style={{ marginTop: 14 }}>
          {isAdmin && (
            <Link className="btn sm" to="/admin"><IconShield /> {t('Admin')}</Link>
          )}
          <button className="btn sm" onClick={() => signOut()}>{t('Sign out')}</button>
        </div>
      </div>

      <p className="small muted center" style={{ marginTop: 24 }}>
        {t('Dargos Ju · scheduling by FSRS · dictionaries: CC-CEDICT (CC BY-SA 4.0) and ECDICT (MIT)')}
      </p>
    </>
  );
}
