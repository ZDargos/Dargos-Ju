import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useContent } from '../lib/content';
import { updateSettings, useStore } from '../lib/store';
import { cardKey, hiddenSet, setCardsHidden } from '../lib/srs';
import { studyUnits } from '../lib/studyUnits';
import { project } from '../lib/learn';
import { vocabItem } from '../lib/vocab';
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
  const levels = settings.studyLevels.filter((l) => content.levels.some((x) => x.level === l));
  const hidden = hiddenSet(settings);
  const key = (sid: string, dir: Dir) => cardKey(sid, dir, lang);

  const rows = useMemo(() => {
    return studyUnits(content, settings, words, levels).map((u) => {
      if (words) {
        const v = vocabItem(content, lang, u.id) ?? myVocab(lang).find((x) => x.id === u.id);
        return { id: u.id, level: u.level, main: v?.text ?? u.id.slice(2), sub: v ? `${v.py} · ${v.gloss}` : '' };
      }
      const s = content.byId.get(u.id)!;
      const ls = project(s, lang);
      return { id: u.id, level: u.level, main: ls.target, sub: ls.native };
    });
  }, [content, settings.learning, settings.studyDeck, settings.wordKind, levels.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const q = query.trim().toLowerCase();
  const filtered = rows.filter(
    (r) => (!q || r.main.toLowerCase().includes(q) || r.sub.toLowerCase().includes(q)) && (!onlyHidden || hidden.has(key(r.id, 'r')) || hidden.has(key(r.id, 'p'))),
  );
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
      <p className="small muted">{t('{hidden} of {total} cards hidden in these levels', { hidden: hiddenHere, total: rows.length * 2 })}</p>
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
