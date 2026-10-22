import { useState } from 'react';
import { lookup, opsFor, type LearnSentence } from '../lib/learn';
import DictPanel from './DictPanel';
import type { LexEntry } from '../types';

/** The sentence's words with pronunciation above each one; tap a word for its full dictionary entry. */
export default function WordBreakdown({ sentence, lexicon, align = 'center' }: { sentence: LearnSentence; lexicon: Record<string, LexEntry>; align?: 'center' | 'start' }) {
  const [open, setOpen] = useState<string | null>(null);
  const ops = opsFor(sentence.lang);
  return (
    <>
      <div className="words" style={{ justifyContent: align === 'center' ? 'center' : 'flex-start' }} lang={ops.speech}>
        {sentence.tokens.filter(ops.isWord).map((w, i) => {
          const lex = lookup(lexicon, w);
          return (
            <button
              key={i}
              type="button"
              className={`word-pill${sentence.lang === 'en' ? ' en' : ''}`}
              title={lex?.en}
              onClick={(e) => {
                e.stopPropagation();
                setOpen(w);
              }}
            >
              <span className="py">{lex?.py || ' '}</span>
              <span className="zh">{w}</span>
            </button>
          );
        })}
      </div>
      {open && <DictPanel word={open} lang={sentence.lang} onClose={() => setOpen(null)} />}
    </>
  );
}
