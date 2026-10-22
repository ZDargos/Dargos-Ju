import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { loadDictionary, loadEnglishDictionary } from '../lib/dictionary';
import { useContent } from '../lib/content';
import { speak, reportSpeechError, ttsAvailable } from '../lib/tts';
import { useSettings } from '../lib/store';
import { lookup, type LearnLang } from '../lib/learn';
import { useT } from '../i18n';
import type { FullEntry } from '../lib/segmenter';
import type { EnFullEntry } from '../lib/englishDict';
import { IconBack, IconClose, IconSpeaker } from './Icons';

/**
 * Bottom sheet with a word's dictionary entry. Chinese words: every reading and meaning, plus
 * the single characters. English words (English mode): phonetics, Chinese meanings and word forms.
 */
export default function DictPanel({ word, lang = 'zh', onClose }: { word: string; lang?: LearnLang; onClose: () => void }) {
  const t = useT();
  const settings = useSettings();
  const [stack, setStack] = useState([lang === 'en' ? word.toLowerCase() : word]);
  const current = stack[stack.length - 1];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Portal to <body> so the sheet doesn't inherit the surrounding card's layout and alignment.
  return createPortal(
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label={t('Dictionary: {word}', { word: current })} onClick={(e) => e.stopPropagation()}>
        <div className="spread">
          <div className="row">
            {stack.length > 1 && (
              <button className="icon-btn" aria-label={t('Back')} onClick={() => setStack((s) => s.slice(0, -1))}>
                <IconBack />
              </button>
            )}
            <span className={lang === 'zh' ? 'zh' : ''} lang={lang === 'zh' ? 'zh-CN' : 'en'} style={{ fontSize: lang === 'zh' ? 40 : 32, lineHeight: 1.1, fontWeight: lang === 'en' ? 700 : 400 }}>
              {current}
            </span>
            {ttsAvailable() && (
              <button className="icon-btn" aria-label={t('Listen')} onClick={() => speak(current, settings.speechRate, lang).catch(reportSpeechError)}>
                <IconSpeaker />
              </button>
            )}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label={t('Close')}>
            <IconClose />
          </button>
        </div>
        {lang === 'en' ? (
          <EnglishEntry word={current} open={(w) => setStack((s) => [...s, w])} />
        ) : (
          <ChineseEntry word={current} open={(w) => setStack((s) => [...s, w])} />
        )}
      </div>
    </div>,
    document.body,
  );
}

function ChineseEntry({ word, open }: { word: string; open: (w: string) => void }) {
  const t = useT();
  const { lexicon } = useContent();
  const [dict, setDict] = useState<Record<string, FullEntry[]> | null>(null);
  useEffect(() => {
    loadDictionary().then(setDict).catch(() => setDict({}));
  }, []);
  const entries: FullEntry[] = dict?.[word] ?? (lexicon[word] ? [{ py: lexicon[word].py, defs: lexicon[word].en.split('; ') }] : []);
  const chars = Array.from(word);
  return (
    <>
      {!dict ? (
        <p className="muted">{t('Loading…')}</p>
      ) : entries.length === 0 ? (
        <p className="muted">{t('No dictionary entry for this word.')}</p>
      ) : (
        entries.map((e, i) => (
          <div key={i} style={{ marginTop: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 18 }}>{e.py}</div>
            <ol style={{ margin: '6px 0 0', paddingLeft: 22 }} lang="en">
              {e.defs.map((d, j) => (
                <li key={j} style={{ marginTop: 2 }}>{d}</li>
              ))}
            </ol>
          </div>
        ))
      )}
      {chars.length > 1 && (
        <>
          <div className="section-title">{t('Characters')}</div>
          <ul className="list card" style={{ paddingTop: 2, paddingBottom: 2 }}>
            {chars.map((c, i) => {
              const first = dict?.[c]?.[0] ?? (lexicon[c] ? { py: lexicon[c].py, defs: [lexicon[c].en] } : null);
              return (
                <li key={i} className="term-row" style={{ cursor: 'pointer' }} onClick={() => open(c)}>
                  <span className="term" lang="zh-CN">{c}</span>
                  <div style={{ minWidth: 0 }}>
                    <div className="small"><strong>{first?.py ?? ''}</strong></div>
                    <div className="small muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{first?.defs.slice(0, 3).join('; ') ?? ''}</div>
                  </div>
                  <span className="muted">›</span>
                </li>
              );
            })}
          </ul>
        </>
      )}
      <p className="small muted" style={{ marginBottom: 0 }}>{t('From CC-CEDICT.')}</p>
    </>
  );
}

function EnglishEntry({ word, open }: { word: string; open: (w: string) => void }) {
  const t = useT();
  const { enLexicon, enLemma } = useContent();
  const [dict, setDict] = useState<Record<string, EnFullEntry> | null>(null);
  useEffect(() => {
    loadEnglishDictionary().then(setDict).catch(() => setDict({}));
  }, []);
  const base = enLemma[word] ?? word.replace(/'s$/, '');
  const entry = dict?.[word] ?? dict?.[base];
  const short = lookup(enLexicon, word);
  return (
    <>
      {!dict ? (
        <p className="muted">{t('Loading…')}</p>
      ) : !entry && !short ? (
        <p className="muted">{t('No dictionary entry for this word.')}</p>
      ) : (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 18, fontWeight: 600 }}>{entry?.ipa || short?.py}</div>
          {base !== word && (
            <p className="small" style={{ margin: '6px 0 0' }}>
              {t('Dictionary form:')}{' '}
              <button className="btn ghost sm" style={{ padding: '0 4px', minHeight: 0 }} onClick={() => open(base)} lang="en">
                {base}
              </button>
            </p>
          )}
          <ol style={{ margin: '8px 0 0', paddingLeft: 22 }} lang="zh-CN">
            {(entry?.zh ?? [short!.en]).map((d, j) => (
              <li key={j} style={{ marginTop: 2 }}>{d}</li>
            ))}
          </ol>
          {entry && entry.forms.length > 0 && (
            <>
              <div className="section-title">{t('Word forms')}</div>
              <div className="row wrap" style={{ gap: 6 }}>
                {entry.forms.map((f) => (
                  <button key={f.label + f.word} className="chip" onClick={() => open(f.word)} lang="en">
                    {f.word} <span className="count">{t(f.label)}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
      <p className="small muted" style={{ marginBottom: 0, marginTop: 14 }}>{t('From ECDICT.')}</p>
    </>
  );
}
