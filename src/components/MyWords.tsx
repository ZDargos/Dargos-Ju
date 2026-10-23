import { useState } from 'react';
import { useContent } from '../lib/content';
import { useSettings } from '../lib/store';
import { addMyWord, lookupWord, removeMyWord, useMyWords } from '../lib/myWords';
import { findVocab } from '../lib/vocab';
import { isHanWord } from '../lib/segmenter';
import { isEnglishWord } from '../lib/english';
import { langName, levelName, useT } from '../i18n';

/** Your own words: add any word (checked against the built-in list and your own), see and remove them. */
export default function MyWords() {
  const t = useT();
  const content = useContent();
  const lang = useSettings().learning;
  const mine = useMyWords().filter((w) => w.lang === lang);
  const [text, setText] = useState('');
  const [draft, setDraft] = useState<{ text: string; py: string; gloss: string; found: boolean } | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const check = async () => {
    const w = text.trim();
    setMessage('');
    setDraft(null);
    if (!w) return;
    if (lang === 'zh' ? !isHanWord(w) : !isEnglishWord(w))
      return setMessage(lang === 'zh' ? t('Enter Chinese characters only.') : t('Enter one English word.'));
    const builtIn = findVocab(content, lang, w);
    if (builtIn) return setMessage(t('"{word}" is already in the word list ({level}).', { word: builtIn.text, level: levelName(builtIn.level) }));
    if (mine.some((m) => m.text.toLowerCase() === w.toLowerCase())) return setMessage(t('"{word}" is already in My words.', { word: w }));
    setBusy(true);
    try {
      const e = await lookupWord(lang, w);
      setDraft({ text: w, py: e?.py ?? '', gloss: e?.gloss ?? '', found: !!e });
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!draft || !draft.gloss.trim() || (lang === 'zh' && !draft.py.trim())) return;
    setBusy(true);
    try {
      await addMyWord({ lang, text: draft.text, py: draft.py, gloss: draft.gloss });
      setMessage(t('Added "{word}". It shows up in your word study and the word games.', { word: draft.text }));
      setDraft(null);
      setText('');
    } catch (err) {
      setMessage((err as Error).message === 'ALREADY_ADDED' ? t('"{word}" is already in My words.', { word: draft.text }) : (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card my-words">
      <button className="spread my-words-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <strong>{t('My words')} · {mine.length}</strong>
        <span className="small muted">{open ? '▲' : t('Add your own words')}</span>
      </button>
      {open && (
        <>
          <form className="row" style={{ marginTop: 10 }} onSubmit={(e) => { e.preventDefault(); check(); }}>
            <input
              className={`input grow${lang === 'zh' ? ' zh' : ''}`}
              lang={lang === 'zh' ? 'zh-CN' : 'en'}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t('A {lang} word', { lang: langName(lang) })}
              aria-label={t('A {lang} word', { lang: langName(lang) })}
              autoCapitalize="off"
            />
            <button className="btn" disabled={busy || !text.trim()}>{t('Check')}</button>
          </form>
          {draft && (
            <div className="stack" style={{ marginTop: 10 }}>
              {!draft.found && <div className="small muted">{t("This word isn't in the dictionary, so fill in the details yourself.")}</div>}
              <div className="field">
                <label htmlFor="mw-py">{lang === 'zh' ? t('Pinyin') : t('Pronunciation (optional)')}</label>
                <input id="mw-py" className="input" value={draft.py} onChange={(e) => setDraft({ ...draft, py: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="mw-gloss">{t('Meaning in {lang}', { lang: langName(lang === 'zh' ? 'en' : 'zh') })}</label>
                <input id="mw-gloss" className="input" lang={lang === 'zh' ? 'en' : 'zh-CN'} value={draft.gloss} onChange={(e) => setDraft({ ...draft, gloss: e.target.value })} />
              </div>
              <button className="btn primary" disabled={busy || !draft.gloss.trim() || (lang === 'zh' && !draft.py.trim())} onClick={save}>
                {t('Add "{word}"', { word: draft.text })}
              </button>
            </div>
          )}
          {message && <div className="banner" role="status" style={{ marginTop: 10, marginBottom: 0 }}>{message}</div>}
          {mine.length > 0 && (
            <ul className="list" style={{ marginTop: 10 }}>
              {mine.map((w) => (
                <li key={w.text} className="spread">
                  <span>
                    <strong className={lang === 'zh' ? 'zh' : ''}>{w.text}</strong> <span className="small muted">{w.py}</span>
                    <span className="small" style={{ display: 'block' }}>{w.gloss}</span>
                  </span>
                  <button className="btn ghost sm" onClick={() => removeMyWord(lang, w.text).catch((e) => setMessage((e as Error).message))}>{t('Remove')}</button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
