import { useState } from 'react';
import { readingsOf, shortGloss } from '../lib/vocabGame';
import { useT } from '../i18n';
import DictPanel from './DictPanel';
import type { VocabItem } from '../lib/vocab';

export interface WordResult {
  item: VocabItem;
  ok: boolean;
  /** Who answered, when it isn't you (vs games). */
  by?: string;
  /** A steal attempt at a word the other player missed. */
  steal?: boolean;
}

/** After a word game: every word that came up, with its pronunciation and meaning. Tap one for the dictionary. */
export default function VocabSummary({ results }: { results: WordResult[] }) {
  const t = useT();
  const [open, setOpen] = useState<VocabItem | null>(null);
  if (!results.length) return null;
  return (
    <>
      <div className="section-title">{t('Words in this game')}</div>
      <div className="card">
        <ul className="list vocab-summary">
          {results.map((r, i) => (
            <li key={i}>
              <button className="vocab-summary-row" onClick={() => setOpen(r.item)}>
                <span className={`vs-mark ${r.ok ? 'ok' : 'bad'}`} aria-label={r.ok ? t('Correct!') : t('Not quite.')}>{r.ok ? '✓' : '✗'}</span>
                <span className="grow">
                  <span className={`vs-word${r.item.lang === 'zh' ? ' zh' : ''}`} lang={r.item.lang === 'zh' ? 'zh-CN' : 'en'}>{r.item.text}</span>{' '}
                  <span className="small muted">{readingsOf(r.item)}</span>
                  <span className="small" style={{ display: 'block' }} lang={r.item.lang === 'zh' ? 'en' : 'zh-CN'}>{shortGloss(r.item.gloss)}</span>
                </span>
                {(r.by || r.steal) && <span className="small muted">{[r.by, r.steal ? t('steal') : ''].filter(Boolean).join(' · ')}</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>
      {open && <DictPanel word={open.text} lang={open.lang} onClose={() => setOpen(null)} />}
    </>
  );
}
