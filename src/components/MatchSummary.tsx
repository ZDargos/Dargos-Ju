import WordBreakdown from './WordBreakdown';
import type { LexEntry, Sentence } from '../types';

export interface AnswerRecord {
  sentence: Sentence;
  correct: boolean;
  answer?: string;
  ms: number;
}

/** Round-by-round review after a match: what you answered next to the correct sentence. */
export default function MatchSummary({ answers, lexicon }: { answers: AnswerRecord[]; lexicon: Record<string, LexEntry> }) {
  if (!answers.length) return null;
  return (
    <>
      <div className="section-title">Your answers</div>
      <ol className="list card" style={{ paddingTop: 4, paddingBottom: 4 }}>
        {answers.map((a, i) => (
          <li key={i}>
            <div className="spread small" style={{ marginBottom: 4 }}>
              <strong style={{ color: a.correct ? 'var(--right)' : 'var(--wrong)' }}>
                {i + 1}. {a.correct ? 'Right' : 'Wrong'}
              </strong>
              <span className="muted">{(a.ms / 1000).toFixed(1)}s</span>
            </div>
            <div className="small muted">{a.sentence.en}</div>
            {!a.correct && a.answer && (
              <div className="small" style={{ marginTop: 4 }}>
                <span className="muted">You answered: </span>
                <span className="zh" style={{ color: 'var(--wrong)' }}>{a.answer}</span>
              </div>
            )}
            <div className="zh" style={{ fontSize: 18, marginTop: 4, color: a.correct ? undefined : 'var(--right)' }}>{a.sentence.zh}</div>
            <WordBreakdown sentence={a.sentence} lexicon={lexicon} align="start" />
          </li>
        ))}
      </ol>
    </>
  );
}
