import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { contributorName, loadVoices, publicVoiceUrl } from '../lib/voices';
import { langName, t, useT } from '../i18n';

interface Row {
  id: string;
  user_id: string;
  lang: 'zh' | 'en';
  text: string;
  storage_path: string;
  up_votes: number;
  down_votes: number;
  created_at: string;
}

/** Vote rules for people's recordings, and recent recordings to listen to or remove. */
export function VoiceAdmin() {
  useT();
  const [minVotes, setMinVotes] = useState(10);
  const [badPct, setBadPct] = useState(51);
  const [rows, setRows] = useState<Row[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    const [cfg, recs] = await Promise.all([
      supabase.from('app_config').select('key, value').in('key', ['voice_min_votes', 'voice_bad_ratio']),
      supabase.from('voice_recordings').select('id, user_id, lang, text, storage_path, up_votes, down_votes, created_at').eq('status', 'live').order('created_at', { ascending: false }).limit(30),
    ]);
    for (const r of cfg.data ?? []) {
      if (r.key === 'voice_min_votes') setMinVotes(Number(r.value));
      if (r.key === 'voice_bad_ratio') setBadPct(Math.round(Number(r.value) * 100));
    }
    if (recs.error) setError(recs.error.message);
    const list = (recs.data ?? []) as Row[];
    setRows(list);
    const ids = [...new Set(list.map((r) => r.user_id))];
    const pairs = await Promise.all(ids.map(async (id) => [id, await contributorName(id)] as const));
    setNames(Object.fromEntries(pairs));
  };
  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    setError('');
    setMessage('');
    const now = new Date().toISOString();
    const results = await Promise.all([
      supabase.from('app_config').update({ value: minVotes, updated_at: now }).eq('key', 'voice_min_votes'),
      supabase.from('app_config').update({ value: badPct / 100, updated_at: now }).eq('key', 'voice_bad_ratio'),
    ]);
    const failed = results.find((r) => r.error);
    if (failed?.error) setError(failed.error.message);
    else setMessage(t('Saved.'));
  };

  const remove = async (r: Row) => {
    if (!confirm(t('Remove this recording? The sentence goes back to needing a voice.'))) return;
    const { error } = await supabase.rpc('admin_trash_recording', { p_recording: r.id });
    if (error) return setError(error.message);
    await supabase.functions.invoke('voice-cleanup').catch(() => undefined);
    await loadVoices().catch(() => undefined);
    load();
  };

  return (
    <>
      <div className="section-title">{t('Voice recordings')}</div>
      <div className="card">
        <p className="small muted" style={{ marginTop: 0 }}>
          {t('A recording is removed once it has at least {n} votes and at least {p}% of them are bad.', { n: minVotes, p: badPct })}
        </p>
        <div className="toggle-row">
          <label htmlFor="voice-min" style={{ fontWeight: 600 }}>{t('Votes needed')}</label>
          <input id="voice-min" className="input" style={{ width: 84, textAlign: 'center' }} type="number" min={1} max={1000} value={minVotes} onChange={(e) => setMinVotes(Math.max(1, Math.round(Number(e.target.value) || 1)))} />
        </div>
        <div className="toggle-row">
          <label htmlFor="voice-pct" style={{ fontWeight: 600 }}>{t('Bad votes to remove (%)')}</label>
          <input id="voice-pct" className="input" style={{ width: 84, textAlign: 'center' }} type="number" min={1} max={100} value={badPct} onChange={(e) => setBadPct(Math.min(100, Math.max(1, Math.round(Number(e.target.value) || 1))))} />
        </div>
        <button className="btn primary sm" style={{ marginTop: 8 }} onClick={save}>{t('Save')}</button>
        {message && <div className="banner" role="status" style={{ marginTop: 12, marginBottom: 0 }}>{message}</div>}
        {error && <div className="error">{error}</div>}

        <div className="small muted" style={{ marginTop: 16, fontWeight: 600 }}>{t('Latest recordings')}</div>
        {rows.length === 0 ? (
          <p className="small muted">{t('No recordings yet.')}</p>
        ) : (
          <ul className="list">
            {rows.map((r) => (
              <li key={r.id}>
                <div className={r.lang === 'zh' ? 'zh' : ''} lang={r.lang === 'zh' ? 'zh-CN' : 'en'}>{r.text}</div>
                <div className="small muted">
                  {names[r.user_id] || '…'} · {langName(r.lang)} · 👍 {r.up_votes} 👎 {r.down_votes}
                </div>
                <div className="row" style={{ marginTop: 6, gap: 8 }}>
                  <audio src={publicVoiceUrl(r.storage_path)} controls preload="none" style={{ flex: 1, height: 36 }} aria-label={t('Play recording')} />
                  <button className="btn ghost sm" style={{ color: 'var(--wrong)' }} onClick={() => remove(r)}>{t('Remove')}</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
