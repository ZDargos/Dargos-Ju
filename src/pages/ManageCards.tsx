import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useContent } from '../lib/content';
import { updateSettings, useStore } from '../lib/store';
import { cardKey, hiddenSet, setCardsHidden } from '../lib/srs';
import { studyUnits } from '../lib/studyUnits';
import { project, wordsFor } from '../lib/learn';
import { glossOf, vocabItem } from '../lib/vocab';
import { myVocab, useMyWords } from '../lib/myWords';
import { levelName, useT } from '../i18n';
import { IconBack } from '../components/Icons';
import LevelPicker from '../components/LevelPicker';
import type { Dir } from '../types';

const PAGE = 150;

/** Every card of the selected levels: tap Reading or Producing to hide that card or bring it back. */
export default function ManageCards() {
  const t = useT();
  const navigate = useNavigate();
  const content = useContent();
  const settings = useStore((s) => s.settings);
  useMyWords();
  const lang = settings.learning;
  const words = settings.studyDeck === 'words';
  const [query, setQuery] = useState('');
  const [onlyHidden, setOnlyHidden] = useState(false);
  const [shown, setShown] = useState(PAGE);
  // Group cards by a vocabulary word they contain (or, for word cards, a character).
  const [word, setWord] = useState<string | null>(null);
  const [wordQuery, setWordQuery] = useState('');
  const [allWords, setAllWords] = useState(false);
  const levels = settings.studyLevels.filter((l) => content.levels.some((x) => x.level === l));
  const hidden = hiddenSet(settings);
  const key = (sid: string, dir: Dir) => cardKey(sid, dir, lang);

  const rows = useMemo(() => {
    return studyUnits(content, settings, words, levels).map((u) => {
      if (words) {
        const v = vocabItem(content, lang, u.id) ?? myVocab(lang).find((x) => x.id === u.id);
        const text = v?.text ?? u.id.slice(2);
        return { id: u.id, level: u.level, main: text, sub: v ? `${v.py} · ${glossOf(v)}` : '', terms: lang === 'zh' && [...text].length > 1 ? [...new Set(text)] : [] };
      }
      const s = content.byId.get(u.id)!;
      const ls = project(s, lang);
      return { id: u.id, level: u.level, main: ls.target, sub: ls.native, terms: [...new Set(wordsFor(s, lang, content))] };
    });
  }, [content, settings.learning, settings.studyDeck, settings.wordKind, levels.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  // Vocabulary words in these cards, most used first, with how many cards contain each.
  const wordCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) for (const w of r.terms) counts.set(w, (counts.get(w) ?? 0) + 1);
    return [...counts.entries()].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [rows]);
  const wq = wordQuery.trim().toLowerCase();
  const wordChoices = wordCounts.filter(([w]) => !wq || w.toLowerCase().includes(wq) || (lang === 'zh' && (content.lexicon[w]?.py ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(wq)));

  const q = query.trim().toLowerCase();
  const filtered = rows.filter(
    (r) =>
      (!q || r.main.toLowerCase().includes(q) || r.sub.toLowerCase().includes(q)) &&
      (!word || r.terms.includes(word)) &&
      (!onlyHidden || hidden.has(key(r.id, 'r')) || hidden.has(key(r.id, 'p'))),
  );
  const narrowed = !!(q || word || onlyHidden);
  const keysOf = (dirs: Dir[]) => filtered.flatMap((r) => dirs.map((d) => key(r.id, d)));
  const hiddenHere = rows.reduce((n, r) => n + Number(hidden.has(key(r.id, 'r'))) + Number(hidden.has(key(r.id, 'p'))), 0);

  const toggle = (keys: string[], hide: boolean) => updateSettings(setCardsHidden(keys, hide, settings));
  const targetLang = lang === 'zh' ? 'zh-CN' : 'en';
  const nativeLang = lang === 'zh' ? 'en' : 'zh-CN';

  return (
    <>
      <header className="topbar">
        <div className="row">
          <button className="icon-btn" onClick={() => navigate(-1)} aria-label={t('Back')}><IconBack /></button>
          <h1>{t('Manage cards')}</h1>
        </div>
      </header>
      <p className="small muted" style={{ marginTop: 0 }}>
        {t('Tap Reading or Producing to hide that card from study, or tap again to bring it back. Tap the text to switch both.')}
      </p>
      <div className="card">
        <LevelPicker levels={content.levels} selected={levels} onChange={(studyLevels) => updateSettings({ studyLevels })} />
      </div>
      <div className="row" style={{ margin: '12px 0', gap: 8 }}>
        <input className={`input grow${lang === 'zh' ? ' zh' : ''}`} value={query} onChange={(e) => { setQuery(e.target.value); setShown(PAGE); }} placeholder={t('Search')} aria-label={t('Search')} />
        <button className={`btn sm${onlyHidden ? ' primary' : ''}`} aria-pressed={onlyHidden} onClick={() => setOnlyHidden(!onlyHidden)}>
          {t('Hidden only')}
        </button>
      </div>
      <div className="card word-filter">
        <div className="spread">
          <strong className="small">{words ? t('Group by character') : t('Group by word')}</strong>
          {word && (
            <button className="chip" onClick={() => { setWord(null); setShown(PAGE); }} aria-label={t('Clear word filter')}>
              <span className={lang === 'zh' ? 'zh' : ''}>{word}</span> ✕
            </button>
          )}
        </div>
        <input
          className={`input${lang === 'zh' ? ' zh' : ''}`}
          style={{ marginTop: 8 }}
          value={wordQuery}
          onChange={(e) => setWordQuery(e.target.value)}
          placeholder={lang === 'zh' ? t('Find a word (characters or pinyin)') : t('Find a word')}
          aria-label={lang === 'zh' ? t('Find a word (characters or pinyin)') : t('Find a word')}
        />
        <div className="word-chips">
          {wordChoices.slice(0, allWords || wq ? 120 : 24).map(([w, n]) => (
            <button
              key={w}
              className={`word-chip${word === w ? ' on' : ''}`}
              aria-pressed={word === w}
              onClick={() => { setWord(word === w ? null : w); setShown(PAGE); }}
            >
              <span className={lang === 'zh' ? 'zh' : ''} lang={targetLang}>{w}</span> <span className="small muted">{n}</span>
            </button>
          ))}
          {!wq && !allWords && wordChoices.length > 24 && (
            <button className="word-chip" onClick={() => setAllWords(true)}>{t('More…')}</button>
          )}
        </div>
      </div>
      <p className="small muted">
        {narrowed
          ? t('{n} of {total} shown', { n: filtered.length, total: rows.length })
          : t('{hidden} of {total} cards hidden in these levels', { hidden: hiddenHere, total: rows.length * 2 })}
      </p>
      {narrowed && filtered.length > 0 && (
        <div className="row wrap" style={{ gap: 6, marginBottom: 10 }}>
          <span className="small muted">{t('All shown:')}</span>
          <button className="btn sm" onClick={() => toggle(keysOf(['r']), true)}>{t('Hide reading')}</button>
          <button className="btn sm" onClick={() => toggle(keysOf(['p']), true)}>{t('Hide producing')}</button>
          <button className="btn sm" onClick={() => toggle(keysOf(['r', 'p']), true)}>{t('Hide both')}</button>
          <button className="btn sm" onClick={() => toggle(keysOf(['r', 'p']), false)}>{t('Show all')}</button>
        </div>
      )}
      <div className="card">
        {filtered.length === 0 ? (
          <p className="small muted" style={{ margin: 0 }}>{levels.length ? t('No cards match.') : t('Pick a level to start')}</p>
        ) : (
          <ul className="list manage-cards">
            {filtered.slice(0, shown).map((r) => {
              const rh = hidden.has(key(r.id, 'r'));
              const ph = hidden.has(key(r.id, 'p'));
              const both = rh && ph;
              return (
                <li key={r.id} className={both ? 'all-hidden' : ''}>
                  <button className="manage-text" onClick={() => toggle([key(r.id, 'r'), key(r.id, 'p')], !both)}>
                    <span className={lang === 'zh' ? 'zh' : ''} lang={targetLang}>{r.main}</span>
                    <span className="small muted" style={{ display: 'block' }} lang={nativeLang}>{r.sub}</span>
                    <span className="small muted">{r.level ? levelName(r.level) : t('My words')}</span>
                  </button>
                  <div className="manage-chips">
                    <button className={`chip${rh ? ' off' : ''}`} aria-pressed={!rh} onClick={() => toggle([key(r.id, 'r')], !rh)}>{t('Reading')}</button>
                    <button className={`chip${ph ? ' off' : ''}`} aria-pressed={!ph} onClick={() => toggle([key(r.id, 'p')], !ph)}>{t('Producing')}</button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {filtered.length > shown && (
          <button className="btn block" style={{ marginTop: 10 }} onClick={() => setShown(shown + PAGE)}>
            {t('Show more ({n} left)', { n: filtered.length - shown })}
          </button>
        )}
      </div>
    </>
  );
}
