import { useState } from 'react';
import { wordsOf } from '../lib/segmenter';
import DictPanel from './DictPanel';
import type { LexEntry, Sentence } from '../types';

/** The sentence's words with pinyin above each one; tap a word for its full dictionary entry. */
export default function WordBreakdown({ sentence, lexicon, align = 'center' }: { sentence: Sentence; lexicon: Record<string, LexEntry>; align?: 'center' | 'start' }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <>
      <div className="words" style={{ justifyContent: align === 'center' ? 'center' : 'flex-start' }}>
        {wordsOf(sentence.tokens).map((w, i) => (
          <button
            key={i}
            type="button"
            className="word-pill"
            title={lexicon[w]?.en}
            onClick={(e) => {
              e.stopPropagation();
              setOpen(w);
            }}
          >
            <span className="py">{lexicon[w]?.py ?? ' '}</span>
            <span className="zh">{w}</span>
          </button>
        ))}
      </div>
      {open && <DictPanel word={open} onClose={() => setOpen(null)} />}
    </>
  );
}
