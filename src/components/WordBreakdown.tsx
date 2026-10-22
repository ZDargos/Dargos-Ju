import { wordsOf } from '../lib/segmenter';
import type { LexEntry, Sentence } from '../types';

/** The sentence's words with pinyin above each one; tap or hover a word for its meaning. */
export default function WordBreakdown({ sentence, lexicon, align = 'center' }: { sentence: Sentence; lexicon: Record<string, LexEntry>; align?: 'center' | 'start' }) {
  return (
    <div className="words" style={{ justifyContent: align === 'center' ? 'center' : 'flex-start' }}>
      {wordsOf(sentence.tokens).map((w, i) => (
        <span key={i} className="word-pill" title={lexicon[w]?.en}>
          <span className="py">{lexicon[w]?.py ?? ' '}</span>
          <span className="zh">{w}</span>
        </span>
      ))}
    </div>
  );
}
