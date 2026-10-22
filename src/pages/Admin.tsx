import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { builtInSentenceIds, getRemote, refreshRemoteContent, useContent } from '../lib/content';
import { englishLexFor, loadSegmenter, type BrowserSegmenter } from '../lib/browserSegmenter';
import { cleanEnglish, isEnglishWord, tokenizeEnglish } from '../lib/english';
import { levelName, t, useT } from '../i18n';
import { parseSentenceCsv, sentenceId, type SentencePair } from '../lib/csv';
import { isHanWord, wordsOf } from '../lib/segmenter';
import SegEditor from '../components/SegEditor';
import { IconBack } from '../components/Icons';
import { SignupModeSwitch, UsersPanel } from './AdminUsers';
import { VoiceAdmin } from './AdminVoices';
import type { LexEntry, Sentence } from '../types';

function useSegmenter() {
  const [seg, setSeg] = useState<BrowserSegmenter | null>(null);
  const [error, setError] = useState('');
  const load = () => {
    if (seg) return Promise.resolve(seg);
    return loadSegmenter().then(
      (s) => {
        setSeg(s);
        return s;
      },
      (e) => {
        setError((e as Error).message);
        throw e;
      },
    );
  };
  return { seg, load, error };
}

export default function Admin() {
  useT();
  return (
    <>
      <header className="topbar">
        <div className="row">
          <Link to="/settings" className="icon-btn" aria-label={t('Back')}><IconBack /></Link>
          <h1>{t('Admin')}</h1>
        </div>
      </header>
      <SignupModeSwitch />
      <UsersPanel />
      <Invites />
      <AddSentences />
      <FixSplits />
      <AddedSentences />
      <VoiceAdmin />
    </>
  );
}

// ---------- Invites ----------

function Invites() {
  useT();
  const [invites, setInvites] = useState<{ email: string; invited_at: string }[]>([]);
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    const { data, error } = await supabase.from('invites').select('email, invited_at').order('invited_at');
    if (error) setError(error.message);
    else setInvites(data ?? []);
  };
  useEffect(() => {
    load();
  }, []);

  const add = async () => {
    const e = email.trim().toLowerCase();
    if (!e) return;
    setError('');
    const { error } = await supabase.from('invites').insert({ email: e });
    if (error) setError(error.code === '23505' ? t('Already invited.') : error.message);
    else {
      setEmail('');
      load();
    }
  };
  const remove = async (e: string) => {
    if (!confirm(t('Remove the invite for {email}? Existing accounts are not deleted.', { email: e }))) return;
    const { error } = await supabase.from('invites').delete().eq('email', e);
    if (error) setError(error.message);
    else load();
  };

  return (
    <>
      <div className="section-title">{t('Invites')}</div>
      <div className="card">
        <p className="small muted" style={{ marginTop: 0 }}>{t('Only invited emails can create an account. Tell them to open the app and choose Create account.')}</p>
        <form className="row" onSubmit={(e) => { e.preventDefault(); add(); }}>
          <input className="input grow" type="email" placeholder="friend@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button className="btn primary" disabled={!email.trim()}>{t('Invite')}</button>
        </form>
        {error && <div className="error">{error}</div>}
        {invites.length > 0 && (
          <ul className="list" style={{ marginTop: 8 }}>
            {invites.map((i) => (
              <li key={i.email} className="spread">
                <span>{i.email}</span>
                <button className="btn ghost sm" onClick={() => remove(i.email)}>{t('Remove')}</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

// ---------- Add sentences ----------

interface Draft extends SentencePair {
  tokens: string[];
  duplicate: boolean;
  /** The English used in English-learning mode (notes and alternatives removed). */
  enClean: string;
}

function AddSentences() {
  useT();
  const content = useContent();
  const { load, error: segError } = useSegmenter();
  const maxLevel = Math.max(0, ...content.levels.map((l) => l.level));
  const [levelMode, setLevelMode] = useState<'new' | 'existing'>('new');
  const [newLevel, setNewLevel] = useState(maxLevel + 1);
  const [existingLevel, setExistingLevel] = useState(maxLevel);
  const [source, setSource] = useState<'csv' | 'single'>('csv');
  const [csvText, setCsvText] = useState('');
  const [zh, setZh] = useState('');
  const [en, setEn] = useState('');
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setNewLevel(maxLevel + 1);
    setExistingLevel((l) => l || maxLevel);
  }, [maxLevel]);

  const level = levelMode === 'new' ? newLevel : existingLevel;
  const levelExists = content.levels.some((l) => l.level === level);

  const preview = async () => {
    setMessage('');
    const pairs = source === 'csv' ? parseSentenceCsv(csvText) : zh.trim() && en.trim() ? [{ zh: zh.trim(), en: en.trim() }] : [];
    if (!pairs.length) {
      setMessage(source === 'csv' ? t('No rows found. The file needs Chinese,English columns.') : t('Enter both the Chinese and the English.'));
      return;
    }
    setBusy(true);
    try {
      const seg = await load();
      const existing = new Set(content.sentences.filter((s) => s.level === level).map((s) => s.zh));
      setDrafts(pairs.map((p) => ({ ...p, tokens: seg.segment(p.zh), duplicate: existing.has(p.zh), enClean: cleanEnglish(p.en) })));
    } catch (e) {
      setMessage(t('Could not split the sentences into words: {error}', { error: (e as Error).message }));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!drafts) return;
    setBusy(true);
    setMessage('');
    try {
      const seg = await load();
      const { data: user } = await supabase.auth.getUser();
      const keep = drafts.filter((d) => !d.duplicate);
      const enWords = (d: Draft) => tokenizeEnglish(d.enClean).filter(isEnglishWord).map((w) => w.toLowerCase());
      const enLex = await englishLexFor(keep.flatMap(enWords));
      const rows = keep.map((d) => ({
        id: sentenceId(level, d.zh),
        level,
        zh: d.zh,
        en: d.en,
        tokens: d.tokens,
        lex: seg.lexFor(d.tokens.filter(isHanWord)),
        en_clean: d.enClean,
        en_lex: Object.fromEntries(enWords(d).filter((w) => enLex[w]).map((w) => [w, enLex[w]])),
        created_by: user.user?.id,
      }));
      const { error } = await supabase.from('custom_sentences').upsert(rows, { onConflict: 'id' });
      if (error) throw error;
      await refreshRemoteContent();
      setMessage(t('Saved {n} sentences to {level}. Everyone sees them the next time they open the app.', { n: rows.length, level: levelName(level) }));
      setDrafts(null);
      setCsvText('');
      setZh('');
      setEn('');
    } catch (e) {
      setMessage(t('Save failed: {error}', { error: (e as Error).message }));
    } finally {
      setBusy(false);
    }
  };

  const readFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => setCsvText(String(reader.result ?? ''));
    reader.readAsText(file, 'utf-8');
  };

  return (
    <>
      <div className="section-title">{t('Add sentences')}</div>
      <div className="card">
        <div className="field">
          <label>{t('Level')}</label>
          <div className="segmented" style={{ marginBottom: 8 }}>
            <button className={levelMode === 'new' ? 'on' : ''} onClick={() => setLevelMode('new')}>{t('New level')}</button>
            <button className={levelMode === 'existing' ? 'on' : ''} onClick={() => setLevelMode('existing')}>{t('Existing level')}</button>
          </div>
          {levelMode === 'new' ? (
            <input className="input" type="number" aria-label={t('New level')} min={1} value={newLevel} onChange={(e) => setNewLevel(Number(e.target.value))} />
          ) : (
            <select className="input" aria-label={t('Existing level')} value={existingLevel} onChange={(e) => setExistingLevel(Number(e.target.value))}>
              {content.levels.map((l) => (
                <option key={l.level} value={l.level}>{levelName(l.level)} ({l.count})</option>
              ))}
            </select>
          )}
          {levelMode === 'new' && levelExists && <div className="small muted">{t('{level} already exists; sentences will be added to it.', { level: levelName(level) })}</div>}
        </div>

        <div className="segmented" style={{ marginBottom: 12 }}>
          <button className={source === 'csv' ? 'on' : ''} onClick={() => setSource('csv')}>{t('CSV file')}</button>
          <button className={source === 'single' ? 'on' : ''} onClick={() => setSource('single')}>{t('One sentence')}</button>
        </div>

        {source === 'csv' ? (
          <>
            <input type="file" accept=".csv,text/csv" onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])} />
            <textarea className="input zh" aria-label={t('CSV text')} rows={5} style={{ marginTop: 8 }} placeholder={'Chinese,English\n我是中国人。,I am Chinese.'} value={csvText} onChange={(e) => setCsvText(e.target.value)} />
          </>
        ) : (
          <>
            <div className="field"><label htmlFor="add-zh">{t('Chinese')}</label><input id="add-zh" className="input zh" lang="zh-CN" value={zh} onChange={(e) => setZh(e.target.value)} /></div>
            <div className="field"><label htmlFor="add-en">{t('English')}</label><input id="add-en" className="input" lang="en" value={en} onChange={(e) => setEn(e.target.value)} /></div>
          </>
        )}
        <button className="btn block" style={{ marginTop: 10 }} disabled={busy} onClick={preview}>
          {busy && !drafts ? t('Splitting into words…') : t('Preview word splits')}
        </button>
        {segError && <div className="error">{segError}</div>}

        {drafts && (
          <>
            <p className="small muted">{t('Tap a sentence to fix its word splits before saving. Lines mark word boundaries.')}</p>
            <ul className="list">
              {drafts.map((d, i) => (
                <li key={i} style={{ opacity: d.duplicate ? 0.5 : 1 }}>
                  {editing === i ? (
                    <>
                      <SegEditor tokens={d.tokens} onChange={(tokens) => setDrafts(drafts.map((x, j) => (j === i ? { ...x, tokens } : x)))} />
                      <button className="btn sm" style={{ marginTop: 6 }} onClick={() => setEditing(null)}>{t('Done')}</button>
                    </>
                  ) : (
                    <div onClick={() => setEditing(i)} style={{ cursor: 'pointer' }}>
                      <div className="zh" style={{ fontSize: 18 }}>{d.tokens.join(' · ')}</div>
                      <div className="small muted">{d.en}{d.duplicate && ` · ${t('already in this level, skipped')}`}</div>
                      {d.enClean !== d.en && <div className="small muted">{t('English mode uses: {text}', { text: d.enClean })}</div>}
                    </div>
                  )}
                </li>
              ))}
            </ul>
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn grow" onClick={() => setDrafts(null)}>{t('Cancel')}</button>
              <button className="btn primary grow" disabled={busy || drafts.every((d) => d.duplicate)} onClick={save}>
                {t('Save {n} to {level}', { n: drafts.filter((d) => !d.duplicate).length, level: levelName(level) })}
              </button>
            </div>
          </>
        )}
        {message && <div className="banner" style={{ marginTop: 12, marginBottom: 0 }}>{message}</div>}
      </div>
    </>
  );
}

// ---------- Fix word splits ----------

function FixSplits() {
  useT();
  const content = useContent();
  const { load } = useSegmenter();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Sentence | null>(null);
  const [tokens, setTokens] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return content.sentences.filter((s) => s.zh.includes(q) || s.en.toLowerCase().includes(q)).slice(0, 12);
  }, [query, content]);

  const hasOverride = selected ? getRemote().overrides.some((o) => o.sentence_id === selected.id) : false;

  const save = async () => {
    if (!selected) return;
    setBusy(true);
    setMessage('');
    try {
      let lex: Record<string, LexEntry> = {};
      const missing = wordsOf(tokens).filter((w) => !content.lexicon[w]);
      if (missing.length) lex = (await load()).lexFor(missing);
      const { data: user } = await supabase.auth.getUser();
      const { error } = selected.custom
        ? await supabase.from('custom_sentences').update({ tokens, lex: { ...lex } }).eq('id', selected.id)
        : await supabase.from('segment_overrides').upsert({ sentence_id: selected.id, tokens, lex, updated_at: new Date().toISOString(), updated_by: user.user?.id });
      if (error) throw error;
      await refreshRemoteContent();
      setMessage(t('Saved.'));
    } catch (e) {
      setMessage(t('Save failed: {error}', { error: (e as Error).message }));
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    if (!selected) return;
    const { error } = await supabase.from('segment_overrides').delete().eq('sentence_id', selected.id);
    if (error) return setMessage(error.message);
    await refreshRemoteContent();
    setSelected(null);
    setMessage(t('Restored the original split.'));
  };

  return (
    <>
      <div className="section-title">{t('Fix word splits')}</div>
      <div className="card">
        <input className="input zh" placeholder={t('Search Chinese or English')} aria-label={t('Search Chinese or English')} value={query} onChange={(e) => { setQuery(e.target.value); setSelected(null); setMessage(''); }} />
        {!selected && results.length > 0 && (
          <ul className="list" style={{ marginTop: 6 }}>
            {results.map((s) => (
              <li key={s.id} style={{ cursor: 'pointer' }} onClick={() => { setSelected(s); setTokens(s.tokens); }}>
                <div className="zh">{s.tokens.join(' · ')}</div>
                <div className="small muted">{levelName(s.level)} · {s.en}</div>
              </li>
            ))}
          </ul>
        )}
        {selected && (
          <div style={{ marginTop: 12 }}>
            <p className="small muted" style={{ marginTop: 0 }}>{t('Tap between characters to split or join words.')}</p>
            <SegEditor tokens={tokens} onChange={setTokens} />
            <div className="small muted" style={{ marginTop: 8 }}>{selected.en}</div>
            <div className="row wrap" style={{ marginTop: 12 }}>
              <button className="btn sm" onClick={() => setSelected(null)}>{t('Cancel')}</button>
              {hasOverride && <button className="btn sm" onClick={reset}>{t('Restore original')}</button>}
              <button className="btn primary sm" disabled={busy} onClick={save}>{t('Save split')}</button>
            </div>
          </div>
        )}
        {message && <div className="banner" style={{ marginTop: 12, marginBottom: 0 }}>{message}</div>}
      </div>
    </>
  );
}

// ---------- Added sentences ----------

function AddedSentences() {
  useT();
  const content = useContent();
  const custom = content.sentences.filter((s) => s.custom && !builtInSentenceIds.has(s.id));
  const [error, setError] = useState('');
  if (!custom.length) return null;
  const byLevel = new Map<number, Sentence[]>();
  for (const s of custom) byLevel.set(s.level, [...(byLevel.get(s.level) ?? []), s]);

  const remove = async (s: Sentence) => {
    if (!confirm(t('Delete "{sentence}"? Everyone\'s progress on it stops showing.', { sentence: s.zh }))) return;
    const { error } = await supabase.from('custom_sentences').delete().eq('id', s.id);
    if (error) return setError(error.message);
    await refreshRemoteContent();
  };

  return (
    <>
      <div className="section-title">{t('Sentences added in the app')}</div>
      <div className="card">
        {error && <div className="error">{error}</div>}
        {[...byLevel.entries()].sort((a, b) => a[0] - b[0]).map(([level, list]) => (
          <details key={level} style={{ marginBottom: 8 }}>
            <summary>{levelName(level)} · {list.length}</summary>
            <ul className="list">
              {list.map((s) => (
                <li key={s.id} className="spread">
                  <div>
                    <div className="zh">{s.zh}</div>
                    <div className="small muted">{s.en}</div>
                  </div>
                  <button className="btn ghost sm" onClick={() => remove(s)}>{t('Delete')}</button>
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>
    </>
  );
}
