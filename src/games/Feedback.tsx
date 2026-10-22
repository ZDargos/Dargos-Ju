import type { ReactNode } from 'react';
import { reportSpeechError, speak, ttsAvailable } from '../lib/tts';
import { IconSpeaker } from '../components/Icons';
import { useContent } from '../lib/content';
import { lexiconFor, type LearnSentence } from '../lib/learn';
import { useT } from '../i18n';
import WordBreakdown from '../components/WordBreakdown';
import { PinyinText, useShowPinyin } from '../components/Pinyin';

/** Shown after answering a game round: right/wrong, the correct sentence, its meaning and words. */
export default function Feedback({ correct, sentence, rate, onNext, children }: { correct: boolean; sentence: LearnSentence; rate: number; onNext: () => void; children?: ReactNode }) {
  const t = useT();
  const content = useContent();
  const lexicon = lexiconFor(content, sentence.lang);
  const pinyin = useShowPinyin();
  return (
    <>
      <div className={`feedback ${correct ? 'ok' : 'bad'}`} role="status">
        <strong>{correct ? `✓ ${t('Correct!')}` : `✗ ${t('Not quite.')}`}</strong>
        {children}
        <div style={{ fontSize: 20, marginTop: 6 }}>
          <PinyinText tokens={sentence.tokens} text={sentence.target} lexicon={lexicon} show={pinyin} lang={sentence.lang} style={{ justifyContent: 'flex-start' }} />
        </div>
        <div className="small muted" lang={sentence.lang === 'zh' ? 'en' : 'zh-CN'}>{sentence.native}</div>
        <WordBreakdown sentence={sentence} lexicon={lexicon} align="start" />
        {ttsAvailable() && (
          <button className="btn ghost sm" style={{ marginTop: 6, paddingLeft: 0 }} onClick={() => speak(sentence.target, rate, sentence.lang).catch(reportSpeechError)}>
            <IconSpeaker /> {t('Listen')}
          </button>
        )}
      </div>
      <button className="btn primary block" style={{ marginTop: 12 }} onClick={onNext} autoFocus>
        {t('Next')}
      </button>
    </>
  );
}
