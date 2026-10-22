import WordBreakdown from './WordBreakdown';
import { useContent } from '../lib/content';
import { lexiconFor, type LearnSentence } from '../lib/learn';
import { useT } from '../i18n';

export interface AnswerRecord {
  sentence: LearnSentence;
  correct: boolean;
  answer?: string;
  ms: number;
}

/** Round-by-round review after a match: what you answered next to the correct sentence. */
export default function MatchSummary({ answers }: { answers: AnswerRecord[] }) {
  const t = useT();
  const content = useContent();
  if (!answers.length) return null;
  return (
    <>
      <div className="section-title">{t('Your answers')}</div>
      <ol className="list card" style={{ paddingTop: 4, paddingBottom: 4 }}>
        {answers.map((a, i) => {
          const target = a.sentence.lang === 'zh' ? 'zh-CN' : 'en';
          return (
            <li key={i}>
              <div className="spread small" style={{ marginBottom: 4 }}>
                <strong style={{ color: a.correct ? 'var(--right)' : 'var(--wrong)' }}>
                  {i + 1}. {a.correct ? `✓ ${t('Right')}` : `✗ ${t('Wrong')}`}
                </strong>
                <span className="muted">{t('{s}s', { s: (a.ms / 1000).toFixed(1) })}</span>
              </div>
              <div className="small muted" lang={a.sentence.lang === 'zh' ? 'en' : 'zh-CN'}>{a.sentence.native}</div>
              {!a.correct && a.answer && (
                <div className="small" style={{ marginTop: 4 }}>
                  <span className="muted">{t('You answered:')} </span>
                  <span className={a.sentence.lang === 'zh' ? 'zh' : ''} lang={target} style={{ color: 'var(--wrong)' }}>{a.answer}</span>
                </div>
              )}
              <div className={a.sentence.lang === 'zh' ? 'zh' : ''} lang={target} style={{ fontSize: 18, marginTop: 4, color: a.correct ? undefined : 'var(--right)' }}>
                {a.sentence.target}
              </div>
              <WordBreakdown sentence={a.sentence} lexicon={lexiconFor(content, a.sentence.lang)} align="start" />
            </li>
          );
        })}
      </ol>
    </>
  );
}
