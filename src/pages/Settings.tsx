import { useState } from 'react';
import { Link } from 'react-router-dom';
import { updateSettings, useStore } from '../lib/store';
import { signOut } from '../lib/auth';
import { pullRemote, pushPending } from '../lib/sync';
import { speak, ttsAvailable } from '../lib/tts';
import { GAMES } from '../games/registry';
import { IconShield } from '../components/Icons';
import { VoiceStatusPanel } from '../components/VoiceCheck';
import NotificationSettings from '../components/NotificationSettings';
import type { Settings } from '../types';

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

export default function SettingsPage({ isAdmin, email }: { isAdmin: boolean; email: string }) {
  const settings = useStore((s) => s.settings);
  const pending = useStore((s) => Object.keys(s.dirtyCards).length + Object.keys(s.unsyncedLogs).length);
  const lastSyncAt = useStore((s) => s.lastSyncAt);
  const [syncMsg, setSyncMsg] = useState('');

  const syncNow = async () => {
    setSyncMsg('Syncing…');
    try {
      await pushPending();
      await pullRemote();
      setSyncMsg('Up to date');
    } catch (e) {
      setSyncMsg(`Sync failed: ${(e as Error).message}`);
    }
  };

  return (
    <>
      <header className="topbar"><h1>Settings</h1></header>

      <div className="section-title">Study</div>
      <div className="card" style={{ paddingTop: 4, paddingBottom: 4 }}>
        <NumberField label="Cards per session" value={settings.sessionSize} min={5} max={200} onChange={(sessionSize) => updateSettings({ sessionSize })} />
        <NumberField label="New cards per day" help="Across all levels" value={settings.newPerDay} min={0} max={200} onChange={(newPerDay) => updateSettings({ newPerDay })} />
        <NumberField
          label="Target recall"
          help="Higher means more frequent reviews (FSRS)"
          value={Math.round(settings.retention * 100)}
          min={75}
          max={97}
          onChange={(n) => updateSettings({ retention: n / 100 })}
        />
      </div>

      <div className="section-title">Games</div>
      <div className="card" style={{ paddingTop: 4, paddingBottom: 4 }}>
        {GAMES.filter((g) => g.hint).map((g) => (
          <div key={g.id} className="toggle-row">
            <div>
              <div style={{ fontWeight: 600 }}>{g.title} hints</div>
              <div className="small muted">{g.hint}</div>
            </div>
            <Switch
              label={`${g.title} hints`}
              checked={settings.hints[g.id as keyof Settings['hints']]}
              onChange={(v) => updateSettings({ hints: { ...settings.hints, [g.id]: v } })}
            />
          </div>
        ))}
        <NumberField label="Longest sentence in tile games" help="Word tiles" value={settings.gameMaxTiles} min={4} max={40} onChange={(gameMaxTiles) => updateSettings({ gameMaxTiles })} />
      </div>

      <div className="section-title">Audio & display</div>
      <div className="card" style={{ paddingTop: 4, paddingBottom: 4 }}>
        <div className="toggle-row">
          <VoiceStatusPanel />
        </div>
        <div className="toggle-row">
          <div>
            <div style={{ fontWeight: 600 }}>Speech speed</div>
            <div className="small muted">{settings.speechRate.toFixed(2)}×</div>
          </div>
          <div className="row">
            <input type="range" min={0.5} max={1.3} step={0.05} value={settings.speechRate} onChange={(e) => updateSettings({ speechRate: Number(e.target.value) })} />
            {ttsAvailable() && (
              <button className="btn sm" onClick={() => speak('我们一起学习中文吧！', settings.speechRate).catch((e) => alert((e as Error).message))}>Test</button>
            )}
          </div>
        </div>
        <div className="toggle-row">
          <div style={{ fontWeight: 600 }}>Theme</div>
          <div className="segmented" style={{ width: 220 }}>
            {(['system', 'light', 'dark'] as const).map((t) => (
              <button key={t} className={settings.theme === t ? 'on' : ''} onClick={() => updateSettings({ theme: t })}>
                {t[0].toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="section-title">Notifications</div>
      <div className="card" style={{ paddingTop: 4, paddingBottom: 4 }}>
        <NotificationSettings />
      </div>

      <div className="section-title">Account</div>
      <div className="card">
        <div className="spread">
          <div>
            <div style={{ fontWeight: 600 }}>{email}</div>
            <div className="small muted">
              {pending ? `${pending} changes waiting to sync` : 'All progress synced'}
              {lastSyncAt && ` · last sync ${new Date(lastSyncAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
            </div>
            {syncMsg && <div className="small muted">{syncMsg}</div>}
          </div>
          <button className="btn sm" onClick={syncNow}>Sync now</button>
        </div>
        <div className="row wrap" style={{ marginTop: 14 }}>
          {isAdmin && (
            <Link className="btn sm" to="/admin"><IconShield /> Admin</Link>
          )}
          <button className="btn sm" onClick={() => signOut()}>Sign out</button>
        </div>
      </div>

      <p className="small muted center" style={{ marginTop: 24 }}>
        Dargos Ju · scheduling by FSRS · dictionary data from CC-CEDICT (CC BY-SA 4.0)
      </p>
    </>
  );
}
